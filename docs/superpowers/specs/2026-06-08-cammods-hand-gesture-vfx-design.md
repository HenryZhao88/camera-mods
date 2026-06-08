# CamMods — Hand-Gesture VFX for Your Webcam

**Date:** 2026-06-08
**Status:** Approved design — ready for implementation planning

## Summary

A local web app that displays your webcam with real-time visual effects triggered
by hand gestures that **you calibrate yourself**. You capture the app window in OBS,
route it through OBS Virtual Camera, and select that virtual camera in
Zoom/Meet/Discord so the effects appear in your video calls.

The core idea: during a calibration step you make any hand symbol you like for each
effect, the app records your hand's landmark "fingerprint," and in live mode it
fires the matching effect whenever you make that symbol again.

## Goals

- Real-time webcam preview with gesture-triggered effects, smooth enough for video calls.
- **User-calibrated gestures**: each effect is bound to a hand pose the user records.
- Calibration persists across sessions and can be exported/imported as a file.
- An effects system that makes adding new effects easy (one file per effect).
- Usable as a virtual camera in video-call apps via OBS.

## Non-Goals (v1)

- Playing an **mp4 video** as an effect. *(Planned for v2.)*
- True WebGL pixel-warp ripples (v1 uses a convincing canvas fake). *(v2.)*
- Face/body filters, 3D objects, emoji spawning. *(Later.)*
- Building our own native virtual camera (we rely on OBS Virtual Camera).

## Approach (decided)

- **Gesture recognition:** Calibrated **template matching** on normalized hand
  landmarks. No model training. Optionally fall back to a hardcoded gesture for any
  effect whose calibrated gesture proves unreliable.
- **Hand tracking:** Google **MediaPipe Hand Landmarker** (in-browser, fast, free).
- **Rendering:** **Canvas 2D** for v1 (particles, trails, glow, vignette, drawing,
  faked explosion). WebGL pixel-warp deferred to v2.
- **Stack:** **Vite + TypeScript**, no large framework, to stay lean for real-time video.

## Architecture

```
Webcam → HandTracker → GestureEngine → EffectsRegistry → Compositor → Canvas → (OBS → Virtual Cam)
                              ↑
                       Calibration + saved templates
```

### Components

1. **Camera** — Acquires the webcam via `getUserMedia` into a hidden `<video>`
   element. Exposes start/stop and surfaces permission/availability errors.
   *Depends on:* browser media APIs.

2. **HandTracker** — Wraps MediaPipe Hand Landmarker. Each frame it produces up to
   N hands, each with 21 landmark points (x, y, z) plus handedness. Emits results to
   the rest of the pipeline.
   *Depends on:* Camera video stream, MediaPipe Tasks Vision.

3. **GestureEngine** — Holds the saved gesture templates. Each frame it normalizes
   the live hand landmarks and computes a distance score against every template.
   When a score crosses the confidence threshold **and** the per-gesture cooldown has
   elapsed, it emits a "gesture fired" event carrying the effect id. Also reports
   continuous state (e.g. "pinch held") for effects that run while a pose is held.
   *Depends on:* HandTracker output, the template store.

4. **Calibration** — A setup flow: choose an effect → 3-2-1 countdown → hold the
   chosen symbol → capture normalized landmarks averaged over several frames for
   stability → save as a template. Supports re-recording any effect.
   *Depends on:* HandTracker, template store.

5. **EffectsRegistry** — A registry of effect modules. Each effect implements:
   - `trigger(context)` — start/toggle the effect (for one-shot or toggle effects)
   - `update(dt)` — advance animation state
   - `render(ctx)` — draw onto the effects canvas
   Adding an effect = add one module and register it. A shared **ParticleSystem**
   utility provides sparks/fire/trail particles.
   *Depends on:* GestureEngine events, Compositor canvas, ParticleSystem.

6. **Compositor** — The render loop (requestAnimationFrame): draw the current video
   frame to the visible `<canvas>`, run `update`/`render` for active effects, and
   composite the result. This canvas is what OBS captures.
   *Depends on:* Camera frame, EffectsRegistry.

7. **App/UI** — Start screen; mode toggle between **Calibrate** and **Live**; a small
   status readout (hand detected, last gesture fired); settings panel (per-gesture
   sensitivity, cooldown, effect enable/disable, export/import calibration).
   *Depends on:* all of the above.

## v1 Effects

- **Fingertip lightning/fire** — Particles and glowing trails stream from the
  fingertips while the bound gesture is held.
- **Snap → dim lights** — Toggles a dramatic dark vignette over the whole image.
- **Palm blast / explosion** — Expanding shockwave ring + white flash + screen shake.
  (A canvas fake; true pixel-warp is v2.)
- **Pinch-to-draw** — While pinching (thumb+index together), draws glowing neon lines
  that follow the fingertip. Lines persist until cleared; releasing the pinch lifts
  the "pen."

## Gesture Template Storage

- Stored in the browser via `localStorage` for persistence across sessions.
- Exportable and importable as a `.json` file for backup/sharing.
- Template format:
  ```json
  {
    "effectId": "fingertip-lightning",
    "landmarks": [[x, y, z], "... 21 points ..."],
    "handedness": "Right",
    "createdAt": "2026-06-08T00:00:00.000Z"
  }
  ```

## Reliability of Matching

- **Normalization:** landmarks are made translation- and scale-invariant, so the
  gesture matches regardless of where the hand is or how far from the camera.
- **Averaged capture:** calibration averages several frames to reduce jitter.
- **Threshold + cooldown:** a confidence threshold plus a per-gesture cooldown
  (default ~800ms) prevents double/rapid firing.
- **Sensitivity slider:** users can tune the threshold per gesture in settings.

## Error Handling

- No camera / permission denied → clear on-screen message with a retry action.
- No gestures calibrated yet → live mode prompts the user to calibrate first.
- Hand lost mid-gesture → effect ends gracefully (trails fade, draw pen lifts).
- MediaPipe model load failure → on-screen error with reload option.

## Testing

- **Unit tests (pure logic, no camera):**
  - Landmark normalization (translation/scale invariance).
  - Template distance scoring (closer pose → lower distance).
  - Cooldown/threshold gating (no double-fire; respects cooldown window).
- **Manual/live verification:** effect rendering and overall feel are verified by
  running the app with a real webcam.

## Future (v2+)

- Play an **mp4 video** as an effect.
- WebGL pixel-warp ripple/glitch/kaleidoscope world effects.
- Face/body filters, 3D objects, emoji spawning on gestures.
- More effects via the EffectsRegistry.
