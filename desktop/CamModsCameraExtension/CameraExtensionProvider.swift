import Foundation
import CoreMediaIO
import AppKit
import IOKit.audio
import os.log

// Phase 1: a virtual camera that publishes an animated TEST PATTERN.
// This exists to validate the hard parts — signing, notarization, the system
// extension loading, and the camera appearing in Zoom/Photo Booth — BEFORE we
// wire in real frames (ScreenCaptureKit) in later phases.
//
// Device name shown to apps:
let kCameraName = "CamMods Camera"
let kFrameRate: Int = 30
let kWidth: Int32 = 1280
let kHeight: Int32 = 720

let logger = Logger(subsystem: "com.cammods.camera", category: "Extension")

// MARK: - Stream source

class CameraExtensionStreamSource: NSObject, CMIOExtensionStreamSource {
    private(set) var stream: CMIOExtensionStream!
    let device: CMIOExtensionDevice
    private let _streamFormat: CMIOExtensionStreamFormat

    init(localizedName: String, streamID: UUID, streamFormat: CMIOExtensionStreamFormat, device: CMIOExtensionDevice) {
        self.device = device
        self._streamFormat = streamFormat
        super.init()
        self.stream = CMIOExtensionStream(localizedName: localizedName, streamID: streamID, direction: .source, clockType: .hostTime, source: self)
    }

    var formats: [CMIOExtensionStreamFormat] { [_streamFormat] }

    var activeFormatIndex: Int = 0 {
        didSet { if activeFormatIndex >= 1 { logger.error("Invalid format index") } }
    }

    var availableProperties: Set<CMIOExtensionProperty> {
        [.streamActiveFormatIndex, .streamFrameDuration]
    }

    func streamProperties(forProperties properties: Set<CMIOExtensionProperty>) throws -> CMIOExtensionStreamProperties {
        let p = CMIOExtensionStreamProperties(dictionary: [:])
        if properties.contains(.streamActiveFormatIndex) { p.activeFormatIndex = 0 }
        if properties.contains(.streamFrameDuration) {
            p.frameDuration = CMTime(value: 1, timescale: Int32(kFrameRate))
        }
        return p
    }

    func setStreamProperties(_ streamProperties: CMIOExtensionStreamProperties) throws {
        if let idx = streamProperties.activeFormatIndex { self.activeFormatIndex = idx }
    }

    func authorizedToStartStream(for client: CMIOExtensionClient) -> Bool { true }

    func startStream() throws {
        guard let deviceSource = device.source as? CameraExtensionDeviceSource else {
            throw NSError(domain: NSOSStatusErrorDomain, code: -1, userInfo: nil)
        }
        deviceSource.startStreaming()
    }

    func stopStream() throws {
        guard let deviceSource = device.source as? CameraExtensionDeviceSource else {
            throw NSError(domain: NSOSStatusErrorDomain, code: -1, userInfo: nil)
        }
        deviceSource.stopStreaming()
    }
}

// MARK: - Device source

class CameraExtensionDeviceSource: NSObject, CMIOExtensionDeviceSource {
    private(set) var device: CMIOExtensionDevice!
    private var _streamSource: CameraExtensionStreamSource!
    private var _streamingCounter: UInt32 = 0
    private var _timer: DispatchSourceTimer?
    private let _timerQueue = DispatchQueue(label: "timerQueue", qos: .userInteractive)
    private var _videoDescription: CMFormatDescription!
    private var _bufferPool: CVPixelBufferPool!
    private var _bufferAuxAttributes: NSDictionary!
    private var _hueShift: CGFloat = 0

    init(localizedName: String) {
        super.init()
        let deviceID = UUID()
        self.device = CMIOExtensionDevice(localizedName: localizedName, deviceID: deviceID, legacyDeviceID: nil, source: self)

        let dims = CMVideoDimensions(width: kWidth, height: kHeight)
        CMVideoFormatDescriptionCreate(
            allocator: kCFAllocatorDefault,
            codecType: kCVPixelFormatType_32BGRA,
            width: dims.width, height: dims.height,
            extensions: nil, formatDescriptionOut: &_videoDescription)

        let pixelBufferAttributes: NSDictionary = [
            kCVPixelBufferWidthKey: dims.width,
            kCVPixelBufferHeightKey: dims.height,
            kCVPixelBufferPixelFormatTypeKey: _videoDescription.mediaSubType,
            kCVPixelBufferIOSurfacePropertiesKey: [:] as NSDictionary,
        ]
        CVPixelBufferPoolCreate(kCFAllocatorDefault, nil, pixelBufferAttributes, &_bufferPool)

        let videoStreamFormat = CMIOExtensionStreamFormat(
            formatDescription: _videoDescription,
            maxFrameDuration: CMTime(value: 1, timescale: Int32(kFrameRate)),
            minFrameDuration: CMTime(value: 1, timescale: Int32(kFrameRate)),
            validFrameDurations: nil)
        _bufferAuxAttributes = [kCVPixelBufferPoolAllocationThresholdKey: 5]

        let streamID = UUID()
        _streamSource = CameraExtensionStreamSource(localizedName: "\(kCameraName).Video", streamID: streamID, streamFormat: videoStreamFormat, device: device)
        do {
            try device.addStream(_streamSource.stream)
        } catch {
            fatalError("Failed to add stream: \(error.localizedDescription)")
        }
    }

    var availableProperties: Set<CMIOExtensionProperty> { [.deviceTransportType, .deviceModel] }

    func deviceProperties(forProperties properties: Set<CMIOExtensionProperty>) throws -> CMIOExtensionDeviceProperties {
        let p = CMIOExtensionDeviceProperties(dictionary: [:])
        if properties.contains(.deviceTransportType) { p.transportType = kIOAudioDeviceTransportTypeVirtual }
        if properties.contains(.deviceModel) { p.model = "CamMods Model" }
        return p
    }

    func setDeviceProperties(_ deviceProperties: CMIOExtensionDeviceProperties) throws {}

    func startStreaming() {
        guard let _ = _bufferPool else { return }
        _streamingCounter += 1
        _timer = DispatchSource.makeTimerSource(flags: .strict, queue: _timerQueue)
        _timer!.schedule(deadline: .now(), repeating: Double(1 / Double(kFrameRate)), leeway: .seconds(0))
        _timer!.setEventHandler { [weak self] in self?.emitFrame() }
        _timer!.resume()
    }

    func stopStreaming() {
        if _streamingCounter > 1 {
            _streamingCounter -= 1
        } else {
            _streamingCounter = 0
            _timer?.cancel()
            _timer = nil
        }
    }

    // Render and send one animated test-pattern frame.
    private func emitFrame() {
        var err: OSStatus = 0
        var pixelBuffer: CVPixelBuffer?
        err = CVPixelBufferPoolCreatePixelBufferWithAuxAttributes(
            kCFAllocatorDefault, _bufferPool, _bufferAuxAttributes, &pixelBuffer)
        guard err == 0, let pb = pixelBuffer else { return }

        CVPixelBufferLockBaseAddress(pb, [])
        if let base = CVPixelBufferGetBaseAddress(pb) {
            let cs = CGColorSpace(name: CGColorSpace.sRGB)!
            let ctx = CGContext(
                data: base, width: Int(kWidth), height: Int(kHeight),
                bitsPerComponent: 8, bytesPerRow: CVPixelBufferGetBytesPerRow(pb),
                space: cs, bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue | CGBitmapInfo.byteOrder32Little.rawValue)

            if let ctx = ctx {
                _hueShift += 0.005
                if _hueShift > 1 { _hueShift -= 1 }
                let bg = NSColor(hue: _hueShift, saturation: 0.5, brightness: 0.18, alpha: 1).cgColor
                ctx.setFillColor(bg)
                ctx.fill(CGRect(x: 0, y: 0, width: Int(kWidth), height: Int(kHeight)))

                // moving white bar so it's obviously live
                let x = CGFloat((Int(Date().timeIntervalSince1970 * 200)) % Int(kWidth))
                ctx.setFillColor(NSColor.white.withAlphaComponent(0.85).cgColor)
                ctx.fill(CGRect(x: x, y: 0, width: 6, height: CGFloat(kHeight)))

                // label
                let text = "CamMods Camera — TEST PATTERN" as NSString
                let attrs: [NSAttributedString.Key: Any] = [
                    .foregroundColor: NSColor.white,
                    .font: NSFont.boldSystemFont(ofSize: 44),
                ]
                NSGraphicsContext.saveGraphicsState()
                NSGraphicsContext.current = NSGraphicsContext(cgContext: ctx, flipped: false)
                text.draw(at: CGPoint(x: 60, y: CGFloat(kHeight) / 2), withAttributes: attrs)
                NSGraphicsContext.restoreGraphicsState()
            }
        }
        CVPixelBufferUnlockBaseAddress(pb, [])

        var sbuf: CMSampleBuffer?
        var timing = CMSampleTimingInfo(
            duration: CMTime(value: 1, timescale: Int32(kFrameRate)),
            presentationTimeStamp: CMClockGetTime(CMClockGetHostTimeClock()),
            decodeTimeStamp: .invalid)
        err = CMSampleBufferCreateForImageBuffer(
            allocator: kCFAllocatorDefault, imageBuffer: pb, dataReady: true,
            makeDataReadyCallback: nil, refcon: nil,
            formatDescription: _videoDescription, sampleTiming: &timing, sampleBufferOut: &sbuf)
        if err == 0, let sb = sbuf {
            _streamSource.stream.send(sb, discontinuity: [], hostTimeInNanoseconds: UInt64(timing.presentationTimeStamp.seconds * Double(NSEC_PER_SEC)))
        }
    }
}

// MARK: - Provider source

class CameraExtensionProviderSource: NSObject, CMIOExtensionProviderSource {
    private(set) var provider: CMIOExtensionProvider!
    private var deviceSource: CameraExtensionDeviceSource!

    init(clientQueue: DispatchQueue?) {
        super.init()
        provider = CMIOExtensionProvider(source: self, clientQueue: clientQueue)
        deviceSource = CameraExtensionDeviceSource(localizedName: kCameraName)
        do {
            try provider.addDevice(deviceSource.device)
        } catch {
            fatalError("Failed to add device: \(error.localizedDescription)")
        }
    }

    func connect(to client: CMIOExtensionClient) throws {}
    func disconnect(from client: CMIOExtensionClient) {}

    var availableProperties: Set<CMIOExtensionProperty> { [.providerManufacturer] }

    func providerProperties(forProperties properties: Set<CMIOExtensionProperty>) throws -> CMIOExtensionProviderProperties {
        let p = CMIOExtensionProviderProperties(dictionary: [:])
        if properties.contains(.providerManufacturer) { p.manufacturer = "CamMods" }
        return p
    }

    func setProviderProperties(_ providerProperties: CMIOExtensionProviderProperties) throws {}
}
