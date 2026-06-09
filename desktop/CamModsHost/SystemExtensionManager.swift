import Foundation
import SystemExtensions
import os.log

private let hostLog = Logger(subsystem: "com.cammods.host", category: "SystemExtension")

// Installs/activates the CamMods camera system extension and reports status.
// IMPORTANT: set `extensionBundleID` to your extension target's bundle identifier
// (e.g. "com.yourteam.CamModsHost.CamModsCameraExtension").
final class SystemExtensionManager: NSObject, ObservableObject, OSSystemExtensionRequestDelegate {
    @Published var status: String = "Idle"

    private let extensionBundleID = "com.cammods.CamModsHost.CamModsCameraExtension"

    func install() {
        status = "Requesting activation…"
        let req = OSSystemExtensionRequest.activationRequest(
            forExtensionWithIdentifier: extensionBundleID,
            queue: .main)
        req.delegate = self
        OSSystemExtensionManager.shared.submitRequest(req)
    }

    func uninstall() {
        status = "Requesting deactivation…"
        let req = OSSystemExtensionRequest.deactivationRequest(
            forExtensionWithIdentifier: extensionBundleID,
            queue: .main)
        req.delegate = self
        OSSystemExtensionManager.shared.submitRequest(req)
    }

    // MARK: OSSystemExtensionRequestDelegate

    func request(_ request: OSSystemExtensionRequest,
                 actionForReplacingExtension existing: OSSystemExtensionProperties,
                 withExtension ext: OSSystemExtensionProperties) -> OSSystemExtensionRequest.ReplacementAction {
        .replace
    }

    func requestNeedsUserApproval(_ request: OSSystemExtensionRequest) {
        status = "Approve CamMods in System Settings → Privacy & Security."
    }

    func request(_ request: OSSystemExtensionRequest, didFinishWithResult result: OSSystemExtensionRequest.Result) {
        switch result {
        case .completed:
            status = "✅ Active — pick “CamMods Camera” in Zoom."
        case .willCompleteAfterReboot:
            status = "Will activate after reboot."
        @unknown default:
            status = "Finished: \(result.rawValue)"
        }
    }

    func request(_ request: OSSystemExtensionRequest, didFailWithError error: Error) {
        status = "❌ Failed: \(error.localizedDescription)"
        hostLog.error("System extension request failed: \(error.localizedDescription)")
    }
}
