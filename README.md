# CamMods 🪄

Turn hand gestures into movie-grade webcam VFX, rendered on WebGL. You calibrate
your *own* hand symbols, then throw branching lightning, raise an energy shield,
charge a kamehameha at the lens, shoot webs at the camera, dual-wield finger guns,
draw glowing neon lines in the air, or expand a cursed domain. Pipe it into Zoom / Meet / Discord with OBS
Virtual Camera.

---

## 1. What you need first

- A **Mac or PC with a webcam**.
- **Google Chrome** (best webcam + GPU support).
- **Node.js 18 or newer** — check by running `node -v` in a terminal.
  - Don't have it? Install from <https://nodejs.org> (the "LTS" button), then
    reopen your terminal.

---

## 2. Install & run

Open a terminal in this project folder and run:

```bash
npm install      # one time only — downloads dependencies
npm run dev      # starts the app
```

You'll see a line like `Local: http://localhost:5173/`. **Open that URL in
Chrome.** When the browser asks to use your camera, click **Allow**.

To stop the app later, press `Ctrl+C` in the terminal.

---

## 3. How to use it

The interface is a **control deck**: the camera fills the left, and a panel on the
right has one **card per effect**, with global controls along the bottom.

### Step 1 — Start the camera
Click **▶ Start** (bottom of the panel). You'll see yourself (mirrored, like a
selfie). The live dot turns green, and the status line shows hand detection + FPS.
Click **■ Stop** any time to release the camera.

### Step 2 — Pick an activation pose per effect
Five effects fire on a hand pose. Each card has an **"Activate" dropdown** — just
pick the pose you want from the built-in set:

| Pose | | Pose | |
|------|--|------|--|
| ✋ Open hand | ✊ Fist | ✌️ Peace | ☝️ Point |
| 🤏 Pinch | 🤘 Rock | 👍 Thumbs up | ✎ Custom (record your own) |

Defaults: ⚡ Lightning = ✌️ Peace, 💥 Blast = ☝️ Point, ✏️ Draw = 🤏 Pinch, 🛡 Shield = ✋ Open hand, 🕸 Web Shot = 🤘 Rock.
Pick a *distinct* pose for each so they don't collide. Choices are **saved in the
browser** and survive restarts.

**Custom (record your own):** choose **✎ Custom** in a card's dropdown to record your
own gesture in a **guided overlay**: a 3-2-1 countdown, a live skeleton showing
exactly what's tracked, and a progress ring while it captures. Multi-step triggers
walk you through each pose. A **strict ↔ loose** sensitivity slider and a **✕**
(clear) appear for custom gestures.

> **Heads-up:** 🌙 **Dim** automatically watches for open-hand vs. fist, so avoid
> using **Fist** as an activation pose for another effect — they'd fight.

> **Heads-up:** a clasped sign sits inside the 🌀 Kamehameha's "palms together" zone —
> if both are enabled and they fight, record distinct custom signs for one (or both),
> or disable the one you're not using.

### Step 3 — Play!
Make an effect's pose and it fires; its card glows in the effect's color.
- **Lightning** and **Draw** are *held* — they run while you hold the pose.
- **Blast** is *one-shot* — fires once per pose.
- **🛡 Shield** is *held* — a hex force-field shimmers in front of your palm.
- **🕸 Web Shot** is *one-shot* — the web splats onto the lens and peels off ~5s later.
- **🌀 Kamehameha** is *automatic* (on by default) — hold your **palms together** to
  charge the orb, then **push toward the camera** to fire. Breaking the pose drains it.
  The charge pose is customizable too (Trigger → ✎ Custom records any two-hand pose).
- **⛩ Domain** is *automatic* — hold a **two-hand clasped sign** for ~1 second and your
  domain expands: reality bleeds away, a shrine rises behind you, and dismantle slashes
  rip across the frame until you press **X** (or the **⛩ Collapse** button). Record your
  own sign with Trigger → ✎ Custom.
- **🔫 Finger Gun** is *automatic* — make a finger gun (index out, thumb up) and
  **drop your thumb** to fire: muzzle flash + bang sound. **Dual-wields**: two hands, two guns
  — or record your **own two-pose trigger** (Trigger → ✎ Custom: a READY pose, then a FIRE pose).
- **🌙 Dim** is *automatic & gradual* — make a **fist** to fade the room down over
  ~1.5s, **open your hand** to fade it back up.
- **👁️ Lightning Eyes** and **🔥 Fire Breath** are **off by default** (they use face
  tracking, which is heavier). Tick **Enabled** to try them — lightning crackles
  from your eyes / open your mouth wide to breathe fire.
- **📺 Screen FX** (top of panel): full-frame **Glitch**, **CRT / retro**, or **Cyberpunk** shader filter over everything.
- **🧽 Clear lines** (on the Draw card) wipes everything you've drawn.

Only **one gesture effect fires at a time** — if a pose happens to match two
effects, the higher one in the list wins, so effects don't stack.

### Step 4 — Other controls
- **On/off switch** (top-right of each card): toggle any effect on or off. Disabled
  effects grey out, stop firing, and clear their on-screen output. Choices persist.
- **🧹 Clear screen** instantly wipes everything currently drawn (lines, particles,
  dim, fire).
- **Show tracking points** (top of the panel): overlays the 21-point hand skeleton
  on the video so you can see exactly what's being tracked.
- **🗑 Reset all** restores every effect to its default pose and clears custom gestures.
- **⬇ Export / ⬆ Import** back up or move your custom gestures as a JSON file.

---

## 4. Use it in video calls (OBS Virtual Camera)

Browsers can't feed a "camera" into Zoom/Meet/Discord directly, so we route
through OBS (free):

1. Install **[OBS Studio](https://obsproject.com/)**.
2. **Turn on Clean view** so the control panel isn't captured — click **🖥 Clean view**
   in the panel (press **Esc** or **C** to exit). The window then shows only your
   camera + effects.
3. In OBS, under **Sources**, click **+**:
   - **Browser** source → URL `http://localhost:5173/?clean=1` (add `&filter=cyberpunk` etc. to lock a screen filter, `&autostart=1` to skip clicking Start), size 1280×720; **or**
   - **Window Capture** → pick the Chrome window (with Clean view on).
4. Click **Start Virtual Camera** (bottom-right in OBS).
5. In Zoom / Meet / Discord, open camera settings and choose
   **"OBS Virtual Camera"**.

Now your gesture effects show up in the call. 🎉

> Tip: for the cleanest capture, also put the browser in fullscreen (or use the
> `?clean=1` Browser source) so no tabs/address bar are in frame.

---

## 5. Troubleshooting

| Problem | Fix |
|---------|-----|
| "Camera access failed" | Click the camera icon in Chrome's address bar → Allow. Make sure no other app is using the webcam. |
| "Loading hand model…" stuck | The hand model downloads from the internet on first run — check your connection and refresh. |
| Recording times out ("Couldn't see your hand") | Make sure your hand (or both hands) is well-lit and fully in frame, then hit ↻ Retry. |
| Effect won't trigger | Re-record that gesture, or nudge its sensitivity slider toward **loose**. |
| Two effects fire at once | Their symbols are too similar — clear (✕) one and re-record a more distinct pose. |
| Lights dim when I don't want them to | You made a fist — open your hand to fade back up, or untick **Enabled** on the Dim card. |
| It seems to track non-hand objects | Detection confidence is tuned to ignore faces/background, but in busy scenes turn on **Show tracking points** to confirm, and keep your hand the clearest hand-shape in frame. |

---

## 6. For developers

```bash
npm run dev      # dev server with hot reload
npm test         # run the unit test suite
npm run build    # production build into dist/
```

**Architecture** (pipeline):

```
Webcam → HandTracker (MediaPipe, 2 hands) → GestureEngine → EffectDriver → Effects
                                                                              ↓
            PixiJS WebGL stage:  video sprite → effect layers → shake → screen layer → filter rig
```

| Module | Responsibility |
|--------|----------------|
| `src/camera.ts` | Webcam capture |
| `src/handTracker.ts` | MediaPipe Hand Landmarker wrapper (21 points/hand, 2 hands) |
| `src/faceTracker.ts` | MediaPipe Face Landmarker wrapper (478 points/face) |
| `src/facePose.ts` | Mouth openness/center/breath direction + eye centers (Fire, Lightning Eyes) |
| `src/pixiCompositor.ts` | WebGL stage, render loop, shake/transients/filter plumbing |
| `src/fx/particleCore.ts` / `particles.ts` | Particle physics (pure) / sprite-pool presenter |
| `src/fx/boltGen.ts` | Branching lightning geometry (pure, seeded) |
| `src/fx/webGeometry.ts` | Spider-web geometry (pure, seeded) |
| `src/fx/proceduralTextures.ts` | Generated glow/streak/vignette/hex/web textures |
| `src/fx/shake.ts` / `transients.ts` | Screen shake / shockwave-zoomBlur-flash one-shots |
| `src/fx/sfx.ts` | All WebAudio-synthesized sounds |
| `src/filters/` | Screen-filter registry: Glitch v2, CRT v2, Cyberpunk |
| `src/effects/beamCore.ts` / `gunCore.ts` | Pure state machines (charge/thrust, cock/fire) |
| `src/effects/energyShield.ts` / `energyBeam.ts` / `webShot.ts` | The new cinematic effects |
| `src/overlay.ts` | Hand-skeleton debug overlay |
| `src/gesture/normalize.ts` | Translation/scale-invariant landmark normalization |
| `src/gesture/distance.ts` | Pose similarity scoring |
| `src/gesture/gestureEngine.ts` | Per-effect gesture bindings (preset or custom) + cooldown |
| `src/gesture/handGestures.ts` | Built-in pose presets (open/fist/peace/point/rock/thumbsup/pinch) |
| `src/gesture/bindings.ts` | Preset + custom binding factories |
| `src/gesture/bindingStore.ts` | Persists each effect's chosen activation pose |
| `src/gesture/handPose.ts` | Open-hand / fist detection (used by Dim) |
| `src/gesture/templateStore.ts` | Custom-gesture persistence + export/import |
| `src/recorder.ts` | Guided recording wizard (countdown, live capture, retry) |
| `src/gesture/capture.ts` | Frame-capture averaging (one or two hands, span) |
| `src/gesture/customTriggers.ts` | Two-hand pose matcher + staged ready→fire trigger |
| `src/effects/effectDriver.ts` | Maps gesture events → effect lifecycle (hold/toggle/oneshot) |
| `src/effects/dimLights.ts` | Self-driven gradual dim from hand openness (not calibrated) |
| `src/effects/fireBreath.ts` | Mouth-driven fire particle stream (face tracking) |
| `src/effects/lightningEyes.ts` | Electric arcs from the eyes (face) |
| `src/effects/gunShot.ts` | Finger-gun fire: muzzle flash + sparks + WebAudio bang |
| `src/effects/domainCore.ts` / `domainExpansion.ts` | Domain cast state machine / presenter |
| `src/segmenter.ts` | MediaPipe person segmentation (behind-you compositing) |
| `src/fx/inkBlot.ts` | Seeded ink-blot geometry (domain bleed mask) |
| `src/effects/*.ts` | The other effects |
| `src/main.ts` | Control-deck UI + wiring |

Pure logic is unit-tested (Vitest); camera/tracking/rendering are verified live.

**Stack:** Vite · TypeScript · PixiJS (WebGL) · pixi-filters · MediaPipe Tasks Vision · Vitest.

---

## 7. Roadmap (v2 ideas)

- Play an **mp4 video** as an effect.
- Face/body filters, 3D objects, emoji spawns.
- Adding a new effect = drop one file into `src/effects/` and register it in `main.ts`.
