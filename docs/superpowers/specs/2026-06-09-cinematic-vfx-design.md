# CamMods Cinematic — PixiJS/WebGL VFX overhaul

**Date:** 2026-06-09
**Status:** Approved by user (approach + design)
**Goal:** "Movie-level CGI" look — rewrite rendering on PixiJS/WebGL with real shader
post-processing, restyle every existing effect, add three new effects (Energy Shield,
Kamehameha Beam, Web Shot), and rebuild the screen filters (Glitch, CRT, new Cyberpunk).

## 1. Goals / non-goals

**Goals**
- Replace the Canvas-2D compositor with a PixiJS v8 **WebGL** stage (same `<canvas>`, same
  DOM control deck, same clean view).
- A shared cinematic FX kit: GPU particles (additive glow, streaks), screen shake,
  lens flashes, transient shader FX (shockwave ripple, zoom blur), synthesized SFX.
- Restyle all existing effects to film quality; add Shield / Beam / Web Shot.
- Shader-grade screen filters: Glitch v2, CRT v2, Cyberpunk (new), via a filter registry.
- Two-hand tracking (`numHands: 2`) — required by the Beam; gestures fire from either hand.
- Keep 720p ≥ 30 fps for OBS capture on an Apple-Silicon Mac.

**Non-goals**
- WebGPU, Safari/mobile support (Chrome-only, as today).
- Audio/video asset files (all SFX stay WebAudio-synthesized).
- Effects/filters not selected by the user (shockwave-clap, Thanos dust, Blockbuster,
  VHS, Noir) — the architecture must make adding them easy later.
- Redesigning Fire Breath (stays off by default; it only gets ported to the new particles).

## 2. Dependencies

- `pixi.js` ^8 (WebGL renderer forced via `preference: 'webgl'` — OBS browser-source safe).
- `pixi-filters` ^6 (v8-compatible). Filters used: `GlitchFilter`, `RGBSplitFilter`,
  `CRTFilter`, `AdvancedBloomFilter`, `GlowFilter`, `ShockwaveFilter`, `ZoomBlurFilter`,
  plus core `ColorMatrixFilter`. Verify exact names/availability at install; if
  `AdvancedBloomFilter` is unavailable fall back to `BloomFilter`.

## 3. Architecture

### 3.1 Stage graph (PixiCompositor)

```
Application (WebGL, antialias, sized to camera)
└── root                ← selected screen-filter rig applies here (final grade)
    ├── world           ← screen-shake offset + world-level transient filters
    │   ├── videoSprite ← GPU video texture, mirrored (scale.x = -1)
    │   ├── effectsLayer← effects mount their display objects here
    │   └── overlayLayer← hand-skeleton debug Graphics
    └── screenLayer     ← "on the lens": web splats, whiteout flashes, dim grade
```

- `PixiCompositor` replaces `Compositor` 1:1 (same constructor collaborators, same
  `start()/stop()`, `showLandmarks`, `trackFace`, `screenFilter`, `onFrame` hook).
- It keeps **our own rAF loop** (not Pixi's ticker): detect hands/face → gesture engine →
  effect driver → `effect.update(dt, ctx)` → shake/transients/filter-rig update →
  `renderer.render(stage)`. dt clamped to 50 ms as today.
- MediaPipe continues to read the raw `<video>` element — tracking is renderer-independent.
- The Pixi `Application` is created once (async `init`) and survives start/stop cycles.
- Canvas resizes to camera dimensions on first frame (as today).

### 3.2 Effect interface (breaking change)

Effects own Pixi display objects instead of drawing pixels. `render()` is removed:

```ts
interface Effect {
  id: string;
  mode: EffectMode;
  init(stage: EffectStage): void;   // create + mount display objects (called once)
  start(): void;
  stop(): void;
  update(dt: number, ctx: RenderContext): void;  // mutate display objects
  isActive(): boolean;              // still drives card-glow UI
  reset?(): void;                   // hide/clear all visible state ("Clear screen")
}

interface EffectStage {
  effects: Container;     // world-space layer
  screen: Container;      // lens-space layer (no shake)
  fx: FxServices;         // shake / flash / ripple / zoomBlur / sfx
  renderer: Renderer;     // for generateTexture (procedural sprites)
}
```

`RenderContext` gains `hands: HandResult[]` (all tracked hands); `hand` remains
`hands[0] ?? null` for single-hand effects. `EffectDriver` (hold/toggle/oneshot
semantics) is unchanged.

**Design rule — pure core + thin presenter:** each non-trivial effect splits its decision
logic into a pure module (no Pixi imports) consumed by the effect class:
`beamCore.ts` (state machine), `boltGen.ts` (lightning geometry, injectable RNG),
`webGeometry.ts` (splat geometry), `gunCore.ts` (per-hand cock/fire decisions),
`shakeMath.ts` (decay curve). Unit tests target the cores; Pixi presenters stay thin.

### 3.3 FX services (`src/fx/`)

- **`particles.ts` — FxParticles:** Pixi-based particle pool on a `ParticleContainer`
  (additive blend). Particle fields: position, velocity, `ax/ay` gravity, `drag`,
  life/maxLife, scale + scale curve (grow/shrink), alpha fade, rotation, and
  **streak mode** (sprite stretched along velocity — sparks/tracers). Textures: procedural
  soft-glow discs and a thin capsule, generated once via `renderer.generateTexture`,
  tinted per particle. Caps: 1200 global, per-spawn caps per effect (beam 400, blast 220,
  lightning 150, gun 80, web 60). Non-additive variant for smoke (normal blend).
- **`shake.ts` — ScreenShake:** `kick(strength)`, `update(dt)` → decaying noise offset
  applied to `world.position`. Multiple kicks stack with clamping.
- **`transients.ts` — TransientFx:** pooled one-shot shader moments:
  `ripple(x, y, {amplitude, wavelength, speed, duration})` → animated `ShockwaveFilter`
  pushed onto `world.filters` and removed when done (max 3 concurrent);
  `zoomBlur(x, y, strength, duration)` → eased `ZoomBlurFilter`;
  `flash(alpha, duration, color?)` → full-frame sprite on `screenLayer` with fast decay.
- **`sfx.ts`:** shared lazily-created `AudioContext` (guarded for jsdom / missing
  WebAudio, as the current gunshot is). Moves the existing gunshot synth here and adds:
  `thwip()` (band-passed noise chirp, pitch drop), `chargeStart()/chargeLevel(0..1)/chargeCancel()`
  (rising filtered saw + tremolo), `beamFire()` (boom: noise burst + 45 Hz sine swell +
  ~1 s rumble tail), `shieldUp()/shieldDown()` (soft sine swells) and a very quiet shield
  hum loop that **must stop cleanly** on release/reset.
- **`proceduralTextures.ts`:** glow disc, capsule streak, hex-grid tile, vignette/radial
  gradient, web-splat variants — all generated once at init (no asset files).

## 4. Effects

### 4.1 Restyled (same triggers/poses/persistence as today)

- **⚡ Fingertip Lightning (hold, default ✌️):** real branching bolts instead of dot spray.
  Per extended fingertip: 2 jagged polylines (recursive midpoint displacement, depth 5,
  displacement ≈ 0.22 × segment length), length 60–130 px, aimed outward from the palm
  ±35°, regenerated every ~60 ms. White 2 px cores on a Graphics layer with blue
  `GlowFilter`. Occasional arc between two extended fingertips (~every 300 ms, 80 ms life).
  Ember particles drift upward from tips. Palette: white core / electric-blue glow
  (orange removed).
- **🔫 Finger Gun (self-driven):** same pose logic, cooldown, and synth bang. New visuals:
  4-point star muzzle flash (two crossed elongated glow sprites + hot center, 90 ms),
  8 tracer streaks down the barrel direction, 5 soft smoke puffs (normal blend, drift +
  grow + fade ~1.4 s), `fx.flash(0.18)` + `shake.kick(6)` per shot.
  **Dual wield:** scans `ctx.hands` with per-handedness cocked state ('Left'/'Right') —
  two finger-guns work independently.
- **💥 Palm Blast (oneshot, default ☝️):** real distortion — `fx.ripple()` at the palm
  (amplitude ~30, wavelength ~160, ~0.7 s) + expanding double-stroke ring (white core,
  orange glow) to ~55% of frame, 26 debris streaks + 40 glow particles with gravity,
  central flash, `shake.kick(10)`.
- **🌙 Dim Lights (self-driven open/fist, unchanged driver/debounce/1.5 s fade):**
  cinematic grade instead of flat black: vignette sprite (edges darken first) + black
  overlay at ~0.55 × dim on `screenLayer`, plus a `ColorMatrixFilter` on `world`
  desaturating up to −35% with a slight cool/blue shift at high dim.
- **👁️ Lightning Eyes (self-driven, off by default):** per eye a pulsing white-blue core
  glow + thin horizontal anamorphic flare streak + 2 mini-bolts (re-jittered ~60 ms);
  rare arc between the eyes (~every 2.5 s). Follows `facePose` eye centers as today.
- **✏️ Pinch Draw (hold, default 🤏):** same trail capture; rendered as a neon ribbon —
  8 px outer stroke (magenta, alpha 0.35) + 2.5 px white core, round caps/joins,
  `GlowFilter` on the draw layer. "Clear lines" behavior unchanged.
- **🔥 Fire Breath (off by default):** ported to FxParticles (additive glow discs,
  yellow→orange→red over life, white-hot inner particles, faint smoke tail). No trigger
  changes, no further redesign.

### 4.2 New: 🛡 Energy Shield (`energy-shield`, hold, bindable, default ✋ Open hand)

- While the bound pose is held, a circular hex-grid force-field floats in front of the
  palm: radius ≈ 2.6 × hand size (hand size = wrist→middle-knuckle distance in px, the
  same measure `isPinch` uses), position smoothed (lerp ~0.35) to the palm center
  (mean of landmarks 0, 5, 9, 13, 17).
- **Raise (≈220 ms):** scale 0.6→1 + alpha 0→1, `fx.ripple()` at the palm, `shieldUp()`
  sfx, then the quiet hum loop starts.
- **Held:** hex tile texture (procedural, tinted cyan `#66e0ff`) inside a circular mask,
  slow counter-rotation of two layers, shimmer = two overlapping alpha sine waves,
  occasional bright glints at random points; rim = double ring stroke with `GlowFilter`.
- **Release (≈180 ms):** fade + shrink + small ripple; hum stops. `reset()` also kills the hum.

### 4.3 New: 🌀 Kamehameha Beam (`energy-beam`, self-driven, two hands, on by default)

Pure state machine in `beamCore.ts`: `idle → charging → firing → cooldown`.

- **Charging:** both hands visible, both open-ish (≥3 extended fingers), wrist distance
  < 1.6 × average hand size ("palms together"). Charge 0→1 over 1.2 s. Orb at the hands'
  midpoint: layered glow sprites growing with charge + particles spiraling **inward** +
  `chargeLevel()` sfx rising. Breaking the pose drains charge at 2× speed (fizzle sparks
  if >0.3 charge is lost; back to idle at 0).
- **Fire trigger (thrust at the camera):** average hand scale (wrist→middle-MCP distance)
  rises ≥ 18% within ~180 ms (ring buffer of recent scales) while charge ≥ 0.35 — or
  charge = 1.0 with a smaller (≥ 8%) thrust.
- **Firing (1.4 s):** 0–0.12 s whiteout ramp (`fx.flash`) + `fx.ripple` at origin +
  `shake.kick(14)`; 0.12–1.1 s sustained at-camera blast — `fx.zoomBlur` centered on the
  origin (eased strength), radial streak-particle storm outward, pulsing core glow;
  1.1–1.4 s decay. `beamFire()` boom + rumble. Origin = midpoint captured at fire start,
  drifting slightly toward the hands during sustain.
- **Cooldown:** 0.8 s, then idle. Hands lost mid-charge → drain; mid-fire → finish anyway.

### 4.4 New: 🕸 Web Shot (`web-shot`, oneshot, bindable, default 🤘 Rock)

- **Fire:** `thwip()` sfx; a web sprite launches from the hand and flies **at the lens**:
  scale 0.15 → ~70% of frame over ~180 ms toward a target point (hand position pulled
  ~30% toward frame center + jitter), brief `fx.zoomBlur` at the hand.
- **Splat:** the web lands on `screenLayer` (stuck to the glass): squash-bounce scale
  keyframes (1.15 → 0.96 → 1.0 over 160 ms), slight random rotation, sticks ~5 s, then
  peels off (rotate a few degrees + slide down 30 px + fade over 400 ms).
- Max 3 splats (FIFO — oldest starts peeling early). Own cooldown 600 ms on top of the
  engine's global 800 ms.
- **Web texture:** 3 procedural variants generated at init (~1024²): 10–12 radial spokes
  with angle jitter, 6–7 concentric threads drawn as quadratic curves **sagging toward
  the center** between adjacent spokes, line width tapering outward, white at ~60% alpha
  with a faint glow. Geometry from pure `webGeometry.ts` (seeded RNG injectable).

## 5. Screen filters (`src/filters/`)

Registry replaces the if/else chain:

```ts
interface FilterRig { filters: Filter[]; update(dt: number, t: number): void; destroy(): void; }
interface ScreenFilterDef { id: ScreenFilter; label: string; build(): FilterRig; }
```

`ScreenFilter = 'none' | 'glitch' | 'crt' | 'cyberpunk'`. The active rig's filters apply
to `root` (grades everything, including lens splats); `update()` is called every frame to
animate uniforms. Switching filters destroys the old rig.

- **Glitch v2:** `GlitchFilter` (≈12 slices) + `RGBSplitFilter`, driven on a
  quiet/burst rhythm — every 0.9–2.2 s a 0.12–0.35 s burst (slice offsets 18–60 px,
  RGB split ±6 px at random angles, slices re-randomized); between bursts a tiny idle
  split (±1 px) and occasional single-frame jump.
- **CRT v2:** `CRTFilter` with real barrel curvature (~2.2), scanlines (width 3,
  contrast ~0.28), animated noise (~0.12), vignette (~0.28); slight green-cyan tint via
  `ColorMatrixFilter`; brightness flicker (≈0.97–1.0 sine at ~13 Hz).
- **Cyberpunk (new):** split-tone grade via `ColorMatrixFilter` (shadows toward
  blue-purple, highlights toward pink/cyan, slight desaturation) + `AdvancedBloomFilter`
  (threshold ≈0.45, soft) so highlights actually **bloom** + fixed ±1.5 px `RGBSplitFilter`
  fringe + faint scanline shimmer (`CRTFilter`, curvature 0, contrast ~0.06).

URL param **`?filter=glitch|crt|cyberpunk`** sets the initial filter (useful for OBS
deep links and headless screenshot tests). Persisted choice (`cammods.screenfx`) still wins
when the param is absent.

## 6. Tracking changes

- `HandTracker`: `numHands: 2` (confidences unchanged).
- `RenderContext`: `hands: HandResult[]`; `hand = hands[0] ?? null` kept.
- `GestureEngine.update` accepts all hands' landmarks; a binding fires if **any** hand
  matches. Exclusive mode still applies across effects per frame. Tests updated.
- `DimLights`: if any hand is a fist → dim down; else if any hand is open → fade up;
  else hold (deterministic priority).
- `GunShot`: per-handedness state (dual wield).
- Calibration/custom templates: unchanged (capture from primary hand).

## 7. UI / docs

- Three new cards in the control deck: 🛡 Shield (bindable hold, pose dropdown,
  default ✋), 🕸 Web (bindable oneshot, default 🤘), 🌀 Kamehameha (self-driven —
  enable toggle + hint "palms together → push at the camera"). All three get
  enable-toggle persistence (`enabledStore`) and participate in "Clear screen" via `reset()`.
- Screen FX dropdown gains **Cyberpunk**.
- Status bar unchanged. Clean view (`?clean=1`) unchanged.
- README: new effects table rows, filter list, updated architecture diagram/module table,
  note about two-hand tracking and dual-wield guns.

## 8. Performance budget

- Target: 1280×720 ≥ 30 fps with MediaPipe (GPU delegate) + Pixi WebGL concurrently.
- Render ≤ ~8 ms/frame on Apple Silicon: particle caps (above), pooled transient filters
  (max 3 shockwaves), bloom only in Cyberpunk, procedural textures generated once,
  no per-frame `generateTexture`.
- If a frame-rate problem appears, first lever: halve particle caps; second: drop
  `GlowFilter`s to lower quality.

## 9. Testing & verification

- **Unit (Vitest/jsdom, no WebGL):** `beamCore` state machine (synthetic frames: charge,
  drain, thrust-fire, cancel paths), `boltGen` (seeded), `webGeometry` (spoke/ring counts,
  sag direction), `gunCore` (cock/fire/cooldown per hand), shake decay, particle physics
  step (gravity/drag/life), filter registry completeness, multi-hand `GestureEngine`.
  Pure cores must not import Pixi.
- **Visual smoke:** headless Chrome (`--screenshot`, SwiftShader WebGL) against
  `?clean=1&filter=…` — page boots, canvas non-blank, no console errors. Manual on-camera
  verification by the user for each effect (as established).
- **Existing suite** (stores, gestures, calibration) keeps passing.

## 10. Migration plan (shape, for the implementation plan)

1. Deps + `PixiCompositor`: mirrored video, overlay, start/stop, clean view. The old
   canvas compositor is swapped out here; **effects temporarily don't render** until
   step 3 (acceptable branch-internal state — "green" during steps 1–2 means typecheck +
   tests + headless boot screenshot, not feature parity).
2. FX kit: procedural textures, FxParticles, shake, transients, sfx module (gunshot moves here).
3. Port restyled effects (lightning, draw, blast, gun, dim, eyes, fire) to the new
   `Effect` interface; delete the old canvas render paths + old `screenFilters.ts`
   buffer helpers. Feature parity restored here.
4. Filter registry + Glitch v2 / CRT v2 / Cyberpunk + `?filter=` param.
5. Two-hand tracking (tracker, types, engine, dim, gun dual-wield).
6. Energy Shield. 7. Kamehameha Beam. 8. Web Shot.
9. UI cards + README + final screenshot pass.

Each step ends green (tests + headless screenshot) before the next starts.
