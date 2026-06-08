# CamMods 🪄

Turn hand gestures into real-time webcam effects. You calibrate your *own* hand
symbols, then throw lightning, dim the room, set off explosions, or draw glowing
neon lines in the air — just by making the gesture. Pipe it into Zoom / Meet /
Discord with OBS Virtual Camera.

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
Three effects fire on a hand pose. Each card has an **"Activate" dropdown** — just
pick the pose you want from the built-in set:

| Pose | | Pose | |
|------|--|------|--|
| ✋ Open hand | ✊ Fist | ✌️ Peace | ☝️ Point |
| 🤏 Pinch | 🤘 Rock | 👍 Thumbs up | ✎ Custom (record your own) |

Defaults: ⚡ Lightning = ✌️ Peace, 💥 Blast = ☝️ Point, ✏️ Draw = 🤏 Pinch.
Pick a *distinct* pose for each so they don't collide. Choices are **saved in the
browser** and survive restarts.

**Custom (record your own):** choose **✎ Custom** in the dropdown to record your
own hand symbol — a 3-2-1 countdown, then hold your pose. A **strict ↔ loose**
sensitivity slider and a **✕** (clear) appear for custom gestures.

> **Heads-up:** 🌙 **Dim** automatically watches for open-hand vs. fist, so avoid
> using **Fist** as an activation pose for another effect — they'd fight.

### Step 3 — Play!
Make an effect's pose and it fires; its card glows in the effect's color.
- **Lightning** and **Draw** are *held* — they run while you hold the pose.
- **Blast** is *one-shot* — fires once per pose.
- **🌙 Dim** is *automatic & gradual* — make a **fist** to fade the room down over
  ~1.5s, **open your hand** to fade it back up. Untick **Enabled** to switch it off.
- **🔥 Fire Breath** is **off by default** (it's heavy and rough). Tick **Enabled**
  on its card to try it: open your mouth wide to breathe fire (loads a face model).
- **🧽 Clear lines** (on the Draw card) wipes everything you've drawn.

### Step 4 — Other controls
- **Show tracking points** (top of the panel): overlays the 21-point hand skeleton
  on the video so you can see exactly what's being tracked.
- **🗑 Reset all** restores every effect to its default pose and clears custom gestures.
- **⬇ Export / ⬆ Import** back up or move your custom gestures as a JSON file.

---

## 4. Use it in video calls (OBS Virtual Camera)

Browsers can't feed a "camera" into Zoom/Meet/Discord directly, so we route
through OBS (free):

1. Install **[OBS Studio](https://obsproject.com/)**.
2. In OBS, under **Sources**, click **+** → **Window Capture** → pick the Chrome
   window running CamMods. (Or use a **Browser** source pointed at
   `http://localhost:5173`.)
3. Resize the source to fill the canvas if needed.
4. Click **Start Virtual Camera** (bottom-right in OBS).
5. In Zoom / Meet / Discord, open camera settings and choose
   **"OBS Virtual Camera"**.

Now your gesture effects show up in the call. 🎉

---

## 5. Troubleshooting

| Problem | Fix |
|---------|-----|
| "Camera access failed" | Click the camera icon in Chrome's address bar → Allow. Make sure no other app is using the webcam. |
| "Loading hand model…" stuck | The hand model downloads from the internet on first run — check your connection and refresh. |
| "No hand detected — try again" during calibration | Make sure your hand is well-lit and fully in frame, then click 🎯 again. |
| Effect won't trigger | Re-calibrate that gesture, or nudge its sensitivity slider toward **loose**. |
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
Webcam → HandTracker (MediaPipe) → GestureEngine → EffectDriver → Effects → Compositor → Canvas
                                          ↑
                                   Calibration + saved templates
```

| Module | Responsibility |
|--------|----------------|
| `src/camera.ts` | Webcam capture |
| `src/handTracker.ts` | MediaPipe Hand Landmarker wrapper (21 points/hand) |
| `src/faceTracker.ts` | MediaPipe Face Landmarker wrapper (478 points/face) |
| `src/facePose.ts` | Mouth openness / center / breath direction (used by Fire) |
| `src/overlay.ts` | Hand-skeleton debug overlay |
| `src/gesture/normalize.ts` | Translation/scale-invariant landmark normalization |
| `src/gesture/distance.ts` | Pose similarity scoring |
| `src/gesture/gestureEngine.ts` | Per-effect gesture bindings (preset or custom) + cooldown |
| `src/gesture/handGestures.ts` | Built-in pose presets (open/fist/peace/point/rock/thumbsup/pinch) |
| `src/gesture/bindings.ts` | Preset + custom binding factories |
| `src/gesture/bindingStore.ts` | Persists each effect's chosen activation pose |
| `src/gesture/handPose.ts` | Open-hand / fist detection (used by Dim) |
| `src/gesture/templateStore.ts` | Custom-gesture persistence + export/import |
| `src/calibration.ts` | Averaged gesture capture |
| `src/effects/effectDriver.ts` | Maps gesture events → effect lifecycle (hold/toggle/oneshot) |
| `src/effects/particleSystem.ts` | Shared particle utility |
| `src/effects/dimLights.ts` | Self-driven gradual dim from hand openness (not calibrated) |
| `src/effects/fireBreath.ts` | Mouth-driven fire particle stream (face tracking) |
| `src/effects/*.ts` | The other effects |
| `src/compositor.ts` | Render loop: draws video + runs effects |
| `src/main.ts` | Control-deck UI + wiring |

Pure logic is unit-tested (Vitest); camera/tracking/rendering are verified live.

**Stack:** Vite · TypeScript · MediaPipe Tasks Vision · Canvas 2D · Vitest.

---

## 7. Roadmap (v2 ideas)

- Play an **mp4 video** as an effect.
- True **WebGL pixel-warp** world effects (ripple, glitch, kaleidoscope).
- Face/body filters, 3D objects, emoji spawns.
- Adding a new effect = drop one file into `src/effects/` and register it in `main.ts`.
