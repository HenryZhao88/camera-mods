# CamMods Desktop — Phase 1 (test-pattern virtual camera)

Goal of this phase: prove the **hard parts** work on *your* machine — signing, the
system extension loading, and **"CamMods Camera" showing up in Zoom/Photo Booth** —
using a self-generating **test pattern**. No real CamMods frames yet (that's Phase 3+).

> These `.swift` files are **source for you to drop into an Xcode project**. I can't
> build/sign/run a system extension for you — it needs your Apple Developer team and a
> local Xcode. Ignore any red squiggles when viewing these files outside Xcode (the two
> targets only link together inside the Xcode project).

## Prerequisites
- **macOS 13+** and **Xcode 15+**.
- A **paid Apple Developer account** ($99/yr) — required for the
  `com.apple.developer.system-extension.install` entitlement + provisioning profile.
- Enable system-extension developer mode (lets it load while developing):
  ```bash
  systemextensionsctl developer on
  ```

## Build it (one-time Xcode setup, ~15 min)

1. **New host app:** Xcode → File → New → Project → **macOS → App**.
   - Name `CamModsHost`, Interface **SwiftUI**, Language **Swift**.
   - Set your **Team** and a bundle id, e.g. `com.YOURNAME.CamModsHost`.
   - Delete the generated `CamModsHostApp.swift` and `ContentView.swift`; add
     `CamModsHost/CamModsApp.swift` and `CamModsHost/SystemExtensionManager.swift` from this folder.
   - Target → **Signing & Capabilities → + Capability → System Extension**
     (this adds the install entitlement).

2. **Add the camera extension target:** File → New → **Target → macOS → Camera Extension**.
   - Name `CamModsCameraExtension`. Set the same **Team**.
   - Its bundle id will be `com.YOURNAME.CamModsHost.CamModsCameraExtension`
     (Apple requires the host id as a prefix — Xcode does this automatically and embeds it).
   - Replace the template's generated provider file with this folder's
     `CamModsCameraExtension/CameraExtensionProvider.swift`. Keep the template's
     `main.swift` (ours matches it for reference).

3. **Point the host at the extension:** in `SystemExtensionManager.swift`, set
   `extensionBundleID` to your extension's real bundle id from step 2.

4. **Signing:** both targets → enable *Automatically manage signing*, pick your Team.
   (The System Extension capability needs a profile carrying the entitlement — a paid
   account provides this.)

## Run & verify
1. Build & run **CamModsHost**. For activation to succeed, the app usually must live in
   **/Applications** — Product → (build), then copy `CamModsHost.app` to `/Applications`
   and launch it from there.
2. Click **Install / Activate**.
3. Approve when prompted: **System Settings → Privacy & Security → "Allow"** the
   CamMods system software.
4. Open **Photo Booth** (or Zoom → Settings → Video → Camera) and select
   **"CamMods Camera"** → you should see the animated hue-shifting test pattern with a
   moving white bar. 🎉 That means the whole signed-extension pipeline works.

## Troubleshooting
- See status / list extensions: `systemextensionsctl list`
- Logs: open **Console.app**, filter for `CamMods` (subsystems `com.cammods.host` / `com.cammods.camera`).
- "Request failed" → app must be in `/Applications`, developer mode on, Team set on both targets.
- Reset during dev: `systemextensionsctl reset` (may require SIP/dev-mode considerations).
- Camera doesn't appear → quit & reopen the consuming app (Zoom caches the device list).

## What's next (only if Phase 1 works)
- **Phase 2:** host pushes a static image into the extension's *sink* stream (proves app→extension frames).
- **Phase 3:** **ScreenCaptureKit** captures a WKWebView running the CamMods web build (Clean view) → into the sink at 30fps.
- **Phase 4:** wire the existing effect controls; **Phase 5:** notarize + `.dmg` installer.

See `docs/superpowers/specs/2026-06-08-desktop-virtual-camera-scope.md` for the full architecture.
