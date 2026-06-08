# CamMods

Hand-gesture VFX for your webcam. Calibrate your own hand symbols, then trigger
effects live. Pipe into video calls via OBS Virtual Camera.

## Run

```bash
npm install
npm run dev
```

Open the printed URL (e.g. http://localhost:5173) in Chrome and allow camera access.

## Use

1. Click **▶ Start**.
2. For each effect, click its **🎯** button, then hold your chosen hand symbol during
   the countdown. The pose is saved (persists across sessions).
3. In normal use, just make a saved symbol — the matching effect fires.
   - **Lightning** (hold), **Dim** (toggle), **Blast** (one-shot), **Draw** (hold;
     **🧽 Clear drawing** to wipe).
4. Tune the **sensitivity** slider if gestures fire too easily / not enough.
5. **⬇ Export / ⬆ Import** back up or move your calibration.

## Use in video calls (OBS Virtual Camera)

1. Install [OBS Studio](https://obsproject.com/) (free).
2. Add a **Window Capture** source → select the browser window running CamMods
   (or a **Browser** source pointed at the dev URL).
3. Click **Start Virtual Camera** in OBS.
4. In Zoom/Meet/Discord, choose **OBS Virtual Camera** as your camera.

## Effects (v1)

Fingertip lightning · Snap to dim · Palm blast · Pinch-to-draw.

## Roadmap (v2)

Play an mp4 as an effect · WebGL pixel-warp world effects · face/body filters.

## Tests

```bash
npm test
```

Pure logic (normalization, distance scoring, gesture gating, template storage,
effect lifecycle, particles) is unit-tested. Camera, hand tracking, and effect
rendering are verified live in the browser.
