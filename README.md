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

### Step 1 — Start the camera
Click **▶ Start**. You should see yourself (mirrored, like a selfie) on screen.
The status text on the right shows whether a hand is detected.

### Step 2 — Calibrate your gestures
Each effect has a **🎯 button**. Calibration teaches the app *your* hand symbol
for that effect:

1. Click a 🎯 button (e.g. **🎯 Lightning**).
2. A 3-2-1 countdown starts. Get your hand ready.
3. When it says **"Hold your … symbol…"**, hold your chosen pose steady for a
   second. It captures and averages your hand, then saves it.
4. Status shows **"Saved … gesture"**. Done.

Pick a *distinct* pose for each effect so they don't get confused — e.g.:

| Effect | Suggested symbol | What it does |
|--------|------------------|--------------|
| 🎯 **Lightning** | Open hand, fingers spread | Sparks/fire stream from your fingertips while you hold it |
| 🎯 **Dim** | Closed fist | Toggles a dramatic dark vignette on/off |
| 🎯 **Blast** | Open palm pushed toward camera | One-shot shockwave + flash |
| 🎯 **Draw** | Pinch (thumb + index together) | Draws glowing neon lines that follow your finger |

Your calibration is **saved in the browser** and survives restarts.

### Step 3 — Play!
Just make a saved symbol and the effect fires. Notes:
- **Lightning** and **Draw** are *held* — the effect runs while you hold the pose.
- **Dim** is a *toggle* — make the symbol once to dim, again to undo.
- **Blast** is *one-shot* — fires once per gesture.
- **🧽 Clear drawing** wipes everything you've drawn.

### Step 4 — Tune sensitivity
The **slider** controls how closely your live pose must match the saved one.
- Effects firing by accident? → drag **left** (stricter).
- Effects not firing? → drag **right** (looser).

### Step 5 — Back up / move your gestures
- **⬇ Export** saves your calibration to a `cammods-gestures.json` file.
- **⬆ Import** loads one back (e.g. on another computer).

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
| Effect won't trigger | Re-calibrate that gesture, or nudge the sensitivity slider right. |
| Two effects fire at once | Their symbols are too similar — re-calibrate one with a more distinct pose. |

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
| `src/gesture/normalize.ts` | Translation/scale-invariant landmark normalization |
| `src/gesture/distance.ts` | Pose similarity scoring |
| `src/gesture/gestureEngine.ts` | Template matching + threshold + cooldown |
| `src/gesture/templateStore.ts` | localStorage persistence + export/import |
| `src/calibration.ts` | Averaged gesture capture |
| `src/effects/effectDriver.ts` | Maps gesture events → effect lifecycle (hold/toggle/oneshot) |
| `src/effects/particleSystem.ts` | Shared particle utility |
| `src/effects/*.ts` | The four effects |
| `src/compositor.ts` | Render loop: draws video + runs effects |
| `src/main.ts` | UI + wiring |

Pure logic is unit-tested (Vitest); camera/tracking/rendering are verified live.

**Stack:** Vite · TypeScript · MediaPipe Tasks Vision · Canvas 2D · Vitest.

---

## 7. Roadmap (v2 ideas)

- Play an **mp4 video** as an effect.
- True **WebGL pixel-warp** world effects (ripple, glitch, kaleidoscope).
- Face/body filters, 3D objects, emoji spawns.
- Adding a new effect = drop one file into `src/effects/` and register it in `main.ts`.
