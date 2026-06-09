import SwiftUI

// Minimal host app for Phase 1: a button to install/activate the camera extension
// and a status line. Once active, the "CamMods Camera" test pattern shows up in
// Photo Booth / Zoom / Meet. Later phases add the WKWebView + ScreenCaptureKit
// pipeline that feeds real CamMods frames into the camera.
@main
struct CamModsApp: App {
    var body: some Scene {
        WindowGroup("CamMods") {
            ContentView()
                .frame(width: 460, height: 280)
        }
        .windowResizability(.contentSize)
    }
}

struct ContentView: View {
    @StateObject private var sysext = SystemExtensionManager()

    var body: some View {
        VStack(spacing: 18) {
            Text("CamMods Camera")
                .font(.system(size: 26, weight: .bold, design: .rounded))
            Text("Phase 1 · test pattern")
                .foregroundStyle(.secondary)

            HStack(spacing: 12) {
                Button("Install / Activate") { sysext.install() }
                    .buttonStyle(.borderedProminent)
                Button("Remove") { sysext.uninstall() }
            }

            Text(sysext.status)
                .multilineTextAlignment(.center)
                .font(.callout)
                .foregroundStyle(.secondary)
                .frame(maxWidth: 380)

            Text("After activating, open Photo Booth or Zoom and choose “CamMods Camera”.")
                .font(.caption)
                .foregroundStyle(.tertiary)
                .multilineTextAlignment(.center)
        }
        .padding(28)
    }
}
