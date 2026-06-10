# Custom Recording v2 — guided wizard + multi-hand & staged triggers

**Date:** 2026-06-10
**Status:** Approved by user (design + both UX choices)
**Goal:** Overhaul custom-gesture recording into a guided live overlay wizard, and extend
custom triggers beyond single one-hand symbols: a **two-hand charge pose** for the
Kamehameha and a **two-stage ready→fire pose pair** for the Finger Gun. Built-in
triggers remain the defaults; custom is opt-in per effect and revertible.

## 1. Goals / non-goals

**Goals**
- Template model v2: kind-tagged templates (`hand` | `two-hand` | `stages`) in one
  versioned store; v1 records and v1 export files migrate losslessly.
- New matchers with built-in fallbacks: two-hand pose match (beam charge), staged
  ready→fire match (gun, per hand — dual-wield preserved).
- A recording wizard: full-screen overlay over the **live** video (compositor keeps
  running), big countdown, per-stage prompts, forced skeleton overlay, capture
  progress, success/retry. ALL custom recording (existing one-hand flows included)
  moves to the wizard.
- Card UI: Gun + Kamehameha cards gain a `Trigger: Default | ✎ Custom` control with
  the same re-record / ✕ clear / sensitivity row bindable cards use (shared builder).
- Code organization: recording flow moves out of `main.ts` into `src/recorder.ts`;
  matching logic into `src/gesture/customTriggers.ts`.

**Non-goals**
- Custom triggers for Dim, Fire Breath, Lightning Eyes (face/openness mechanics stay
  built-in).
- Recording the beam's **thrust** (motion stays the built-in scale-growth detector;
  only the charge *pose* is customizable).
- Multi-stage recording for bindable effects (they stay single-pose).
- Velocity/trajectory gesture recognition (out of scope; pose-only).

## 2. Template model v2 (`src/types.ts`, `src/gesture/templateStore.ts`)

```ts
// All landmark arrays are normalized via normalizeLandmarks (translation/scale
// invariant, z zeroed) BEFORE storage — matching never re-normalizes templates.
export interface HandTemplate {
  kind: 'hand';
  effectId: string;
  landmarks: HandLandmarks;
  handedness: Handedness;
  createdAt: string;
}
export interface TwoHandTemplate {
  kind: 'two-hand';
  effectId: string;
  left: HandLandmarks;   // left-most hand ON SCREEN at record time (mirrored coords)
  right: HandLandmarks;  // right-most
  span: number;          // wrist-to-wrist distance / average hand size, at record time
  createdAt: string;
}
export interface StagedTemplate {
  kind: 'stages';
  effectId: string;
  stages: [HandLandmarks, HandLandmarks]; // [ready, fire]
  createdAt: string;
}
export type GestureTemplate = HandTemplate | TwoHandTemplate | StagedTemplate;
```

- `hand size` = wrist(0)→middle-MCP(9) distance in normalized image coords (same
  measure the beam's `handScale` uses).
- **Storage:** new key `cammods.templates.v2`. `loadTemplates()` migration order:
  1. v2 key present → parse, return.
  2. else v1 key (`cammods.templates`) present → wrap each record as
     `{ kind: 'hand', ...record }`, write to v2 key, **remove the v1 key**, return.
  3. else → `[]`.
  Records missing `kind` inside a v2 payload are treated as `kind: 'hand'` (defensive).
- `saveTemplate/removeTemplate/clearTemplates` keep their per-`effectId`
  replace/delete semantics (one template per effect, regardless of kind).
- **Export/import:** `exportTemplates()` emits the v2 array. `importTemplates(json)`
  accepts both shapes: any array entry without `kind` is wrapped as `kind:'hand'`.
  Entries with an unknown `kind` are rejected with an error naming the kind.

## 3. Matchers (`src/gesture/customTriggers.ts` — pure, no pixi)

### 3.1 Two-hand pose (Kamehameha charge)

```ts
matchTwoHand(hands: HandResult[], t: TwoHandTemplate, threshold: number): boolean
```
- Requires ≥2 hands; uses the two with the **left-most and right-most wrist x**.
- Each live hand is normalized then compared (`landmarkDistance`) against its side's
  template; **both** must be ≤ `threshold`.
- Span check: live wrist-to-wrist distance / avg live hand size must be within
  `[0.5, 2.0] ×` the recorded span (loose — occlusion under-measures hand size).
- Handedness labels are ignored (MediaPipe mislabels mirrored/occluded hands);
  screen position is the assignment rule, matching how the template was captured.

**EnergyBeam integration:** `update()` builds its `BeamFrame` as today, except
`palmsTogether` becomes: custom template set → `matchTwoHand(...)`; otherwise the
built-in `openish && wristDist < 2.2 × avg`. Everything downstream (BeamCore grace /
thrust / fire) is untouched.

### 3.2 Staged pose pair (Finger Gun)

```ts
class StagedTrigger {
  constructor(t: StagedTemplate, getThreshold: () => number);
  step(landmarks: HandLandmarks | null, nowMs: number): boolean; // true = fire edge
  reset(): void;
}
```
- Internal state machine mirroring `GunCore`'s semantics exactly: ready-pose match →
  armed; fire-pose match while armed → fires once (returns true), 350 ms cooldown,
  staying armed through a cooldown-blocked fire; null/no-match on BOTH stages → disarm.
  Matching a stage = normalized `landmarkDistance ≤ threshold`.
- Ambiguity rule: if the live hand matches **both** stages (user recorded two similar
  poses), ready wins while disarmed and fire wins while armed (i.e. the state machine
  reads the stage it is waiting for first).

**GunShot integration:** keeps `cores: Record<'Left'|'Right', GunCore>` for the
built-in trigger AND gains `staged: Record<'Left'|'Right', StagedTrigger> | null`
built from the template when one exists. Per hand per frame: custom set → feed
`staged[handedness].step(...)`; else the existing `fingersUp`/`GunCore` path.
`reset()` resets whichever is active. Dual-wield works in both modes (two
independent state machines either way).

### 3.3 Threshold

Same scale as today's one-hand custom matching (mean per-point distance on
normalized landmarks): default `0.6`, slider range `0.2–1.2` strict↔loose. One
sensitivity value per effect (gun stages share one threshold).

## 4. Recording wizard (`src/recorder.ts` + overlay DOM in `index.html`)

### 4.1 Live-frame tap (no second detector)

The compositor keeps running during recording — the video never freezes, and we
never create a second MediaPipe consumer (the v1 concurrency hazard). New hook:

```ts
export interface CompositorHooks {
  onFrame?: (hand, fired, active) => void;        // existing
  onHands?: (hands: HandResult[]) => void;         // NEW: every frame, all hands
}
```
`PixiCompositor.frame()` calls `hooks.onHands?.(hands)` right after detection.
`main.ts` fans this out to the wizard when one is active. While a wizard is open:
- `compositor.showLandmarks` is forced **true** (restored to the checkbox state on
  close).
- The gesture engine + effect driver keep running but `main.ts` suppresses effect
  side effects by… nothing — effects firing during recording is harmless (the user
  is making new poses; built-in triggers may flash). Acceptable; no suppression.

### 4.2 Flow definitions

```ts
export interface RecordStage {
  prompt: string;        // "Hold your READY pose"
  handsNeeded: 1 | 2;
}
export interface RecordFlow {
  effectId: string;
  title: string;         // "Record: Finger Gun trigger"
  stages: RecordStage[];
  build(captures: StageCapture[]): GestureTemplate;  // assembles the template
}
```
- Bindables (lightning/blast/draw/shield/web): 1 stage, 1 hand → `HandTemplate`.
- Gun: 2 stages, 1 hand each ("Hold your READY pose", "Now hold your FIRE pose")
  → `StagedTemplate`.
- Beam: 1 stage, 2 hands ("Hold your CHARGE pose with both hands") → `TwoHandTemplate`
  (left/right assigned by wrist x; span computed from the averaged capture).

### 4.3 Wizard behavior (per stage)

1. Overlay shows title + stage prompt + stage indicator ("step 1 of 2").
2. 3-2-1 countdown (big, centered; 1 s per tick).
3. **Capture:** collect 12 *valid* frames (right number of hands present). Per frame,
   per hand: normalize landmarks; accumulate. A progress ring fills 0→12.
   - Two-hand stages: hands sorted by wrist x each frame; left/right accumulated
     separately; per-frame span accumulated.
   - Timeout: 6 s without 12 valid frames → stage fails: "Couldn't see
     {one hand|both hands} — try again" with **Retry** / **Cancel** buttons
     (Esc = cancel). Retry restarts the stage countdown; earlier stages are kept.
4. Averaged capture per stage → `StageCapture { hands: HandLandmarks[]; span?: number }`.
5. After the last stage: `flow.build(...)` → `saveTemplate(...)` → ✓ flash
   ("Saved — try it!") → overlay closes → caller refreshes bindings/cards.

Cancel (button or Esc) at any point: nothing saved, previous template (if any)
untouched, overlay closes, landmark-overlay state restored.

### 4.4 DOM / styling

A `#recorder` overlay inside the existing `.stage` wrapper (sibling of `#view`):
dark scrim with a cutout-feel (translucent edges), centered prompt block (`.r-title`,
`.r-prompt`, `.r-count`, `.r-progress` ring, `.r-actions` buttons), matches the
control-deck visual language (Chakra Petch, accent borders). Hidden via `.hidden`.
Clean view and recording are mutually exclusive (entering clean view is disabled
while recording; recording buttons are hidden in clean view — both already hidden
via the panel).

### 4.5 `calibration.ts`

`calibrate()`'s capture loop is superseded by the wizard's tap-based capture;
`countdown()` moves into the wizard. The file is **deleted**; the averaged-capture
math lives in a pure, tested `src/gesture/capture.ts`
(`accumulateFrame`/`finishCapture` — next to the other pure gesture modules)
consumed by the wizard in `src/recorder.ts`.

## 5. UI / persistence (`src/main.ts`, `index.html`)

- **TriggerChoice store:** `bindingStore` is reused as-is — gun and beam get
  choices under their effectIds with values `'default' | 'custom'`. `GestureChoice`
  widens to `GestureId | 'custom' | 'default'`. (Bindable effects never store
  `'default'`; self-driven effects never store a `GestureId`.)
- **Gun + Kamehameha cards** gain a `Trigger` row: select with `Default (finger gun)`
  / `Default (palms together)` and `✎ Custom (record)…`. Choosing custom opens the
  wizard; on save the choice persists as `'custom'`. While `'custom'` with a saved
  template: the re-record / ✕ clear / sensitivity row appears (shared builder
  `customControlsRow(effectId, opts)` extracted and used by bindable cards too).
  ✕ clear reverts the choice to `'default'` and removes the template.
- **Bindable cards:** dropdown unchanged, but choosing `✎ Custom (record)…` opens
  the wizard (single-stage flow) instead of the status-line countdown.
- **Reset all** clears v2 templates + choices as today.
- The badge on gun/beam cards shows `auto` (default) or `✎` (custom) instead of the
  pose emoji.
- Effects propagation: `main.ts` passes the current template/threshold into the two
  effects whenever it changes (after record/clear/import/reset/slider):
  `gun.setCustomTrigger(template | null, getThreshold)` and
  `beam.setCustomCharge(template | null, getThreshold)`.

## 6. Testing

- **templateStore v2:** v1→v2 migration (old key removed, kinds wrapped), unknown-kind
  import rejection, kind round-trips, per-effect replace semantics.
- **matchTwoHand:** matches recorded pair; rejects single hand; rejects out-of-span;
  position-based assignment (swapped hands still match); threshold respected.
- **StagedTrigger:** ready→fire fires once; fire without ready doesn't; cooldown
  matches GunCore semantics (blocked fire stays armed); disarm on no-match; both-stage
  ambiguity rule.
- **capture core:** accumulate/finish averaging math (incl. two-hand left/right
  separation by wrist x and span averaging) with synthetic frames.
- **GunShot/EnergyBeam:** existing default-path tests stay green untouched; new tests
  feed a custom template and assert the custom path (gun fires on ready→fire pose
  pair; beam charges on the custom two-hand pose).
- Wizard DOM/flow verified live by the user + headless boot screenshot (no new
  always-on UI, so the standard non-black check suffices).

## 7. Performance

Matching cost: `normalizeLandmarks` + `landmarkDistance` per candidate hand per frame
(~21-point loops, trivial). StagedTrigger normalizes once per hand per frame only when
a custom gun template exists. No new render-loop allocations beyond two small arrays.

## 8. Migration / compatibility

- Existing saved one-hand customs keep working (auto-migrated to v2 on first load).
- Old export files import cleanly (kind-wrapping on import).
- No change to engine bindings for bindable effects (still `customBinding` over
  `kind:'hand'` templates).
