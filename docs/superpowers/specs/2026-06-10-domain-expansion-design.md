# Domain Expansion effect — ink bleed-in, shrine occlusion, dismantle slashes

**Date:** 2026-06-10
**Status:** Approved by user (design + all element choices)
**Goal:** A Sukuna-homage "Domain Expansion" effect: hold a two-hand sign (built-in
clasp or user-recorded custom) → cinematic slam → the domain *bleeds* across the
frame (animated ink-blot mask, not a fade) → sustained crimson reality with a
horned-shrine silhouette rising **behind the user** (person segmentation) and
constant razor "dismantle" slashes → collapses on the **X key** or a card button.

## 1. Goals / non-goals

**Goals**
- New self-driven effect `domain-expansion` with the gun/beam-style Trigger row
  (Default (hands clasped) | ✎ Custom two-hand recording via the existing wizard).
- Pure, TDD'd `domainCore` state machine: idle → arming (0.6 s sign hold) →
  casting (1.4 s: gather → slam → bleed) → active (indefinite) → collapsing
  (0.8 s) → cooldown (1 s) → idle. `collapse()` callable any time during active.
- Ink bleed-in: 5 procedural ragged ink-blot sprites used as a live alpha mask over
  the domain grade; blots spread until they merge and cover the frame (~0.9 s);
  reverse on collapse (bleed-out).
- Person segmentation (`src/segmenter.ts`, MediaPipe ImageSegmenter, selfie model):
  person-cutout sprite occludes the shrine. Runs only while the domain is
  casting/active/collapsing. GPU→CPU delegate fallback. Graceful degradation: if
  the model fails to load, the shrine renders without occlusion.
- Procedural shrine silhouette texture (black, tiered roof, curved horns, crimson
  rim glow) rising from below the frame behind the user.
- Dismantle slashes: thin white-hot streaks with crimson glow flickering at random
  frame positions every 0.12–0.45 s (1–3 per burst, occasional full-frame slash),
  each with a slash-tick SFX.
- SFX: cast slam (sub boom + reverse whoosh), active rumble loop (start/stop clean),
  slash ticks, collapse boom.
- UI: new card (⛩ Domain, crimson `#ff2d2d`), enable toggle, Trigger row, Collapse
  button; X-key collapse; participates in Clear screen / disable / Reset all.
- README documentation, incl. the clasp-vs-kamehameha overlap note.

**Non-goals**
- Red moon / drifting ash (not selected; easy later add).
- A literal Malevolent-Shrine replica (it is a stylized horned-shrine silhouette).
- Recording the sign motion over time (pose-hold trigger only, like everything else).
- Segmentation for any other effect (architecture allows reuse later).
- Configurable keybind (fixed `X`; Esc/C stay clean-view exits).

## 2. Trigger

- **Built-in default:** `isClasped(hands)` — exactly 2 hands, wrist distance
  < **0.9 ×** average hand size (wrist→middle-MCP). No finger requirements
  (Sukuna-style signs fold fingers; occlusion makes finger reads unreliable).
- **Custom:** existing `TwoHandTemplate` machinery — `domainFlow()` (one two-hand
  stage, prompt "Hold your DOMAIN sign with both hands") in `src/recorder.ts`;
  `matchTwoHand` with the per-effect sensitivity threshold; choice persisted via
  `bindingStore` under `domain-expansion`; propagated by `pushCustomTriggers()`
  (`domain.setCustomSign(tpl | null, getThreshold)`).
- **Arming:** the sign must hold for 0.6 s before the cast starts (arm meter rises
  dt/0.6; decays at 2× when the sign breaks). Prevents accidental casts.
- **Known overlap:** a clasp also sits inside the kamehameha's default
  palms-together distance (its open-ish finger check usually rejects a folded
  clasp, but not always). README documents: record distinct custom signs or
  disable one effect if they fight. No code arbitration (both are self-driven by
  design).

## 3. State machine (`src/effects/domainCore.ts` — pure, TDD)

```ts
type DomainState = 'idle' | 'arming' | 'casting' | 'active' | 'collapsing' | 'cooldown';
interface DomainEvents { slammed?: boolean; collapsed?: boolean; }
class DomainCore {
  state; arm; t;                       // arm 0..1; t = seconds in casting/collapsing/cooldown
  step(signHeld: boolean, dt: number): DomainEvents;
  collapse(): void;                    // active -> collapsing (no-op otherwise)
  reset(): void;                       // anything -> idle instantly
}
```

- Constants: `ARM_S = 0.6`, `ARM_DECAY_MULT = 2`, `CAST_S = 1.4`, `SLAM_AT = 0.5`,
  `COLLAPSE_S = 0.8`, `COOLDOWN_S = 1.0`.
- idle: `signHeld` → arming (arm grows from 0).
- arming: arm += dt/ARM_S while held; arm −= 2·dt/ARM_S when not (to idle at 0);
  arm ≥ 1 → casting (t = 0).
- casting: t += dt; `slammed` event fires once when t crosses SLAM_AT; t ≥ CAST_S →
  active. Sign state is ignored from casting onward (cast completes regardless).
- active: indefinite; `collapse()` → collapsing (t = 0, `collapsed` event).
- collapsing: t ≥ COLLAPSE_S → cooldown. cooldown: t ≥ COOLDOWN_S → idle.
- Derived getter `progress`: 0 during idle/arming; bleed-in progress during casting
  (0 → 1 mapped from SLAM_AT → CAST_S); 1 while active; 1 → 0 during collapsing
  (1 − t/COLLAPSE_S). Drives mask scale, grade alpha, shrine rise — one source of
  truth for the presenter.

## 4. Visual architecture

### 4.1 New stage layer: `backdrop`

`PixiCompositor` gains a `backdropLayer` between the video sprite and the effects
layer (world children: video → **backdrop** → effects → overlay). `EffectStage`
gains `backdrop: Container`. Only the domain uses it (for now).

### 4.2 Behind-the-user compositing

While the domain is casting/active/collapsing:

```
videoSprite (full frame)                      ← world
  backdropLayer:
    domainBackdrop (dark red wash, in front of the raw video)
    shrine sprite (rising silhouette)
    personCutout (video texture again, masked by live segmentation mask)
  effectsLayer (other effects continue)
screenLayer:
  bleedGroup [crimson grade + vignette] masked by inkMask
  slashes (above the grade)
```

- `personCutout`: a second sprite over the same video texture (mirrored like the
  main one), `mask` = a sprite whose texture is the live segmentation mask canvas.
  The cutout shows the user in front of the shrine; the crimson grade on the
  screen layer still covers everything (lens-space), so the user reads as inside
  the domain.
- Segmentation mask pipeline: ImageSegmenter (VIDEO mode) → confidence mask →
  written into a 256×256 offscreen canvas's alpha channel (person = opaque) →
  `Texture.from(canvas)` once + `texture.source.update()` per segmented frame →
  mask sprite scaled to frame size and mirrored to match the selfie view.
- If `segmenter.ready` is false (failed load): `personCutout` hidden; shrine
  renders over the video without occlusion.

### 4.3 Ink bleed mask

- `src/fx/inkBlot.ts` (pure, TDD): `genInkBlot(seed)` returns a closed outline of
  24–32 points: radial blob with two octaves of seeded noise (radius jitter ±35%,
  lobes), unit space. Deterministic per seed.
- `proceduralTextures.ts` gains `inkBlotTexture(seed)` (512², white fill, soft
  ~2 px edge blur) and `FxTextures.inkBlots: Texture[]` (3 variants).
- The presenter spawns 5 blot sprites (first at the hands' midpoint at cast time,
  rest at seeded random frame points), each scaling 0 → (cover frame) with a
  slight per-blot delay (0–0.25 s) and rotation, driven by `core.progress`. The
  blot container is the `mask` of `bleedGroup`. Collapse runs progress 1 → 0
  (ink retreats). White texture = visible region (Pixi sprite masks use alpha).

### 4.4 Shrine

- `src/fx/shrineSilhouette.ts` (pure geometry helpers) + `shrineTexture()` in
  `proceduralTextures.ts` (1024×1024, drawn once): layered black silhouette —
  stepped plinth, three columns, two-tier curved pagoda roof with upswept eaves,
  two horn curves rising from the upper roof corners — plus a 3 px crimson rim
  glow (`#b3122a`) along the top edges (canvas shadow trick).
- Presenter: shrine sprite anchored bottom-center at x = frame center, width
  ≈ 0.85 × frame width; rises from fully-below-frame to its rest position
  (bottom ~12% submerged) as `progress` goes 0 → 1, with ease-out; while active
  it bobs ±4 px on a slow sine; sinks back during collapse.

### 4.5 Dismantle slashes

- On the screen layer above the grade. Scheduler: next burst in 0.12–0.45 s;
  burst = 1–3 slashes; each slash = streak sprite pair (white core 2 px-equivalent
  + wider crimson glow copy), random position, random angle, length 15–45% of the
  frame diagonal; alpha pops to 1 then decays over ~140 ms; ~8% of slashes are
  "big": full-frame length, thicker, louder tick. Cap: 12 live slashes.
- Implemented with pooled sprites inside the effect (FxParticles streak mode fits:
  spawn with `streak: true`, zero velocity, custom scale — if it fights the
  velocity-based stretch, use a small dedicated pool of streak-texture sprites).

### 4.6 SFX (`src/fx/sfx.ts` additions)

- `domainSlam()` — sub-bass boom (40 Hz swell) + noise burst through a falling
  lowpass + a short reversed-suck (rising bandpass noise into the boom).
- `domainRumbleStart()/domainRumbleStop()` — looped low drone (two detuned
  triangle oscillators ~50/61 Hz through a lowpass, gain ~0.06), same lifecycle
  pattern as the shield hum (module-level refs, idempotent stop, null-safe).
- `slashTick(big: boolean)` — 35 ms bright bandpass noise tick (~5.5 kHz, big:
  ~2.5 kHz + longer).
- `domainCollapse()` — descending sine (90→35 Hz, 0.6 s) + air-release noise.

## 5. Effect + UI integration

- `src/effects/domainExpansion.ts` implements `Effect` (mode 'toggle', self-driven
  `enabled`, `init(stage)` mounts backdrop/screen pieces, `update` drives core +
  presenter, `reset()` = instant teardown incl. rumble stop + segmentation release).
- `setCustomSign(t: TwoHandTemplate | null, getThreshold)` — mirrors beam.
- **Segmenter ownership:** the segmenter belongs to the effect, not the
  compositor (unlike face tracking, no other consumer exists). `src/segmenter.ts`
  exposes `PersonSegmenter` (constructed over the `Camera` instance;
  `ensureStarted()` lazily loads the model and begins per-frame segmentation,
  `stop()` halts it, `maskTexture: Texture | null` is the live mask, `ready`
  reflects load state). `main.ts` constructs it and passes it to
  `new DomainExpansion(segmenter)`; the effect calls `ensureStarted()` when
  leaving idle and `stop()` when returning to idle. The compositor changes only
  by gaining the backdrop layer.
- Keybind: `window.addEventListener('keydown', e => { if (e.key === 'x' || e.key === 'X') domain.collapse(); })`
  in main.ts (no-op unless active). Card `extra:` button "⛩ Collapse" → `domain.collapse()`.
- CARDS entry: `{ id: 'domain-expansion', icon: '⛩', name: 'Domain', color: '#ff2d2d', desc: 'Hold your <b>two-hand sign</b> ~1s to expand your domain — press <b>X</b> (or Collapse) to end it.', bindable: false, customTrigger: 'Default (hands clasped)', extra: collapse button }`.
- selfDriven map gains `'domain-expansion': domain`; effects array order: after
  `web`, before `pinch` (domain pieces live on backdrop/screen layers; array order
  matters only for update order). `pushCustomTriggers()` gains the domain branch.
- Default enabled: ON (consistent with beam/gun).
- Card glow: `domain.isActive()` (arming visible? no — active from casting onward).

## 6. Testing

- **domainCore (TDD):** full transition table incl. arm decay, slam-once event,
  cast-completes-after-sign-release, indefinite active, collapse event, collapse
  during casting (ignored — only active), reset from every state, progress curve
  values at boundary times.
- **isClasped (TDD):** two close hands pass, far hands fail, one hand fails;
  threshold boundary.
- **inkBlot geometry (TDD):** point count, closed ring (first≈last or implicit),
  radius within jitter bounds, deterministic per seed.
- **Slash scheduler** (pure helper `nextSlashDelay/makeSlash` if extracted):
  bounds-checked randomized output with injected rng.
- Effect presenter / segmentation / bleed visuals: live user verification +
  headless boot screenshot (no new always-on UI).
- Existing suites untouched.

## 7. Performance

- Segmentation runs only while the domain is non-idle: ~one 256² Float32 → alpha
  loop + one texture upload per frame (selfie model is real-time class). Hands +
  segmentation concurrently is the worst case; face effects are off by default.
- Slashes capped at 12 live; blot mask is 5 sprites; shrine is 1 sprite; grade is
  3 full-frame sprites — all trivially within budget.
- The mask canvas + textures are created once at first cast (lazy), reused after.

## 8. Reference image (optional)

If the user saves a generated reference at `reference/domain.png`, a follow-up
tuning pass reads it and calibrates: shrine proportions/horn curvature, crimson
palette values, slash density. Absence blocks nothing.
