# CamMods Desktop — Real Virtual Camera (Scope)

**Date:** 2026-06-08
**Status:** Scoping only — not yet approved for build
**Goal:** Ship CamMods as a standalone macOS app that appears as a real camera
("CamMods Camera") in Zoom / Meet / Discord, with **no OBS**.

## The core constraint

A browser tab cannot register a system camera — only the OS can. On modern macOS
(12.3+) the old DAL plug-ins are deprecated; the supported mechanism is a
**Core Media I/O Camera Extension** (`CMIOExtension`), a *System Extension* shipped
inside a native app, **code-signed (Developer ID) and notarized**. That is exactly
the piece OBS already provides — which is why "just use OBS" is the cheap path.

Building our own means owning that native piece. The encouraging part: we do **not**
have to rewrite the effects. We can keep the whole web app and capture its output.

## Recommended architecture (reuses our web app)

```
┌─────────────────────────── CamMods.app (native Swift/AppKit) ───────────────────────────┐
│  WKWebView (loads our existing built web app in "Clean view")                            │
│        │  renders video + effects on the canvas (unchanged JS)                           │
│        ▼                                                                                  │
│  ScreenCaptureKit  ──captures that view──▶  CMSampleBuffers (IOSurface-backed, 30–60fps) │
│        │                                                                                  │
│        ▼  push frames into the sink stream                                                │
└────────┼─────────────────────────────────────────────────────────────────────────────── ┘
         ▼
   CMIO Camera Extension (System Extension)
     sink stream  ──forwards──▶  source stream  ──▶  appears as "CamMods Camera"
                                                      in Zoom / Meet / Discord (AVFoundation)
```

Why this shape:
- **WKWebView keeps our JS effects as-is** — no port to Metal/Swift.
- **ScreenCaptureKit** (macOS 12.3+) captures the webview window straight to
  IOSurface-backed buffers — avoids slow JS pixel readback (the usual perf killer).
- **Sink→source CMIO pattern** is the documented way for an app to feed a virtual
  camera: the app writes frames to the extension's *sink* stream; the extension
  forwards them to its *source* stream, which apps consume like any webcam.
- **Zero-copy** when buffers stay IOSurface-backed.

## Hard requirements (these are on you)

- **Apple Developer account** ($99/yr) — required for the restricted
  `com.apple.developer.system-extension.install` entitlement + a provisioning profile.
- **Developer ID signing + notarization** — a System Extension won't load otherwise.
- **macOS 13+** target (ScreenCaptureKit + CMIOExtension maturity).
- A Mac with Xcode to build/run; during dev, System Extension developer mode
  (`systemextensionsctl developer on`).
- User-facing install UX: macOS makes the user **approve the extension in System
  Settings → Privacy & Security** on first run (unavoidable, same as OBS).

## What I can build vs. what I can't

- ✅ I can write the whole thing: the Xcode project, the Swift host app, the WKWebView
  integration, the ScreenCaptureKit capture, the CMIO extension (sink/source), and the
  packaging/signing config — using Apple's sample + OSS references as the base.
- ❌ I **cannot run, sign, or notarize it** for you (needs your Apple account + a local
  Xcode/dev Mac), and a System Extension literally can't be tested without signing or
  dev mode. So past the code, **verification is hands-on by you**.

## Phased plan

- **Phase 0 — Prereqs (you):** Apple Developer account; `systemextensionsctl developer on`.
- **Phase 1 — Prove the camera:** CMIO extension that publishes a *test pattern*; confirm
  "CamMods Camera" shows up in Photo Booth / Zoom. (De-risks signing + the extension.)
- **Phase 2 — Feed static frames:** Host app activates the extension and pushes a still
  image into the sink → source. Confirms the app→extension frame path.
- **Phase 3 — Live capture:** ScreenCaptureKit captures a test window → into the sink at 30fps.
- **Phase 4 — Embed CamMods:** WKWebView loads our web build in Clean view; capture it →
  camera. Wire effect controls (the existing UI).
- **Phase 5 — Package:** bundle extension in the app, sign, notarize, build a `.dmg`;
  add enable/disable + a simple installer flow.

## Effort & risk (honest)

- **Effort:** roughly 1–3 focused weeks for someone comfortable in Xcode/Swift; the long
  poles are signing/notarization friction and CMIO learning, not our effects.
- **Ongoing:** Apple OS updates occasionally break camera extensions; expect maintenance.
- **Platform:** macOS only. Windows = a *separate* native virtual camera (Media Foundation /
  DirectShow) — its own project.
- **Reality check:** this replaces a free 5-minute OBS setup with a multi-week native build +
  $99/yr + maintenance. Worth it only if the goal is a polished, shippable product.

## OSS references to base it on

- Apple: *Creating a camera extension with Core Media I/O* (WWDC22 "Create camera extensions").
- `ldenoue/cameraextension` — minimal CMIO sample.
- `daily-co/daily-virtual-camera` — production-style app + extension + sink feeding.
- `whyisjake/Celluloid`, `networkextension/iVirtualCamera` — additional references.

## Decision

Given the cost, options:
1. **Don't build it** — use OBS (recommended for personal use); I add "Clean view" so capture is tidy.
2. **Spike Phase 1** — I scaffold the macOS app + CMIO extension that shows a test pattern, so
   you can validate the signing/extension path on your machine before committing further.
3. **Commit to the full build** — I write all phases; you handle account/signing/testing as we go.
