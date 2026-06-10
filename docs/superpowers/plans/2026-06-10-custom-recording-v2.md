# Custom Recording v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guided live recording wizard + kind-tagged template store (one-hand / two-hand / staged) + custom triggers for the Kamehameha charge pose and the Finger Gun ready→fire pair, per spec `docs/superpowers/specs/2026-06-10-custom-recording-v2-design.md`.

**Architecture:** Template store becomes a versioned discriminated union with lossless v1 migration. Pure, TDD'd modules do the math (capture averaging, two-hand matching, staged trigger state machine); the wizard is a DOM presenter that taps the compositor's per-frame hand results (compositor keeps running — no second MediaPipe consumer). GunShot/EnergyBeam consult custom templates when set, falling back to their built-in triggers.

**Tech Stack:** Existing: Vite + TypeScript, Vitest/jsdom, PixiJS compositor, MediaPipe. No new dependencies.

**Branch:** continue on `feat/cinematic-vfx`.

**Baseline:** 127 tests / 24 files green at dc5a312+. Headless protocol (used in Tasks 5–7):

```bash
npm run dev > /tmp/vite-dev.log 2>&1 &
sleep 3
PORT=$(grep -oE "localhost:[0-9]+" /tmp/vite-dev.log | head -1 | cut -d: -f2)
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --enable-unsafe-swiftshader --window-size=1280,800 \
  --virtual-time-budget=30000 --screenshot=/tmp/crv2.png \
  "http://localhost:$PORT/?clean=1&autostart=1&fakecam=1"
# Read the PNG (mirrored FAKE CAM pattern, non-black), then: kill %1
```

---

## File map (final state)

| File | Status | Responsibility |
|---|---|---|
| `src/types.ts` | modify | `GestureTemplate` union (`HandTemplate`/`TwoHandTemplate`/`StagedTemplate`) |
| `src/gesture/templateStore.ts` | modify | v2 key, v1 migration, kind-wrapping import, unknown-kind rejection |
| `src/gesture/capture.ts` | create | Pure capture accumulator (averaging, wrist-x split, span) — TDD |
| `src/gesture/customTriggers.ts` | create | `matchTwoHand` + `StagedTrigger` — TDD |
| `src/effects/gunShot.ts` | modify | `setCustomTrigger`; staged path beside built-in |
| `src/effects/energyBeam.ts` | modify | `setCustomCharge`; custom charge-pose path |
| `src/pixiCompositor.ts` | modify | `onHands` hook |
| `src/recorder.ts` | create | `RecorderWizard` DOM presenter + `RecordFlow` defs |
| `index.html` | modify | `#recorder` overlay DOM + CSS |
| `src/main.ts` | modify | Trigger rows, shared custom-controls row, wizard wiring, propagation |
| `src/gesture/bindingStore.ts` | modify | `GestureChoice` gains `'default'` |
| `src/calibration.ts` | **delete** | Superseded by wizard + capture core |
| `README.md` | modify | Recording wizard + trigger customization docs |
| `tests/templateStore.test.ts` | modify | v2 + migration tests |
| `tests/gesture/capture.test.ts` | create | Capture core tests |
| `tests/gesture/customTriggers.test.ts` | create | Matcher tests |
| `tests/gunShot.test.ts` / `tests/effects/beamCustom.test.ts` | modify/create | Custom-path tests |

---

### Task 1: Template model v2 + store migration (TDD)

**Files:**
- Modify: `src/types.ts`, `src/gesture/templateStore.ts`, `src/calibration.ts` (1 line), `src/main.ts` (1 line)
- Test: `tests/templateStore.test.ts`

- [ ] **Step 1: Replace `GestureTemplate` in `src/types.ts`**

Replace the existing `GestureTemplate` interface block with:

```ts
// Custom-gesture templates. All landmark arrays are ALREADY normalized via
// normalizeLandmarks before storage — matchers never re-normalize templates.
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

- [ ] **Step 2: Two compile fixes for the union**

(a) `src/calibration.ts` — the template literal gains the kind tag:

```ts
  const template: GestureTemplate = {
    kind: 'hand',
    effectId, landmarks: avg, handedness, createdAt: new Date().toISOString(),
  };
```

(b) `src/main.ts` in `rebuildBindings()` — narrow to one-hand templates:

```ts
      const t = loadTemplates().find(x => x.effectId === def.id && x.kind === 'hand');
```

- [ ] **Step 3: Extend `tests/templateStore.test.ts`**

Read the existing file first; update any template literals to include `kind: 'hand'`, then APPEND this describe block:

```ts
describe('templateStore v2', () => {
  const V1_KEY = 'cammods.templates';
  const V2_KEY = 'cammods.templates.v2';

  beforeEach(() => { localStorage.removeItem(V1_KEY); localStorage.removeItem(V2_KEY); });

  it('migrates v1 records to kind:"hand" and removes the old key', () => {
    const v1 = [{ effectId: 'fx', landmarks: [{ x: 0, y: 0, z: 0 }], handedness: 'Right', createdAt: 'now' }];
    localStorage.setItem(V1_KEY, JSON.stringify(v1));
    const out = loadTemplates();
    expect(out).toHaveLength(1);
    expect(out[0].kind).toBe('hand');
    expect(localStorage.getItem(V1_KEY)).toBeNull();
    expect(localStorage.getItem(V2_KEY)).not.toBeNull();
  });

  it('round-trips two-hand and staged kinds', () => {
    const lm = [{ x: 0.1, y: 0.2, z: 0 }];
    saveTemplate({ kind: 'two-hand', effectId: 'beam', left: lm, right: lm, span: 1.4, createdAt: 'now' });
    saveTemplate({ kind: 'stages', effectId: 'gun', stages: [lm, lm], createdAt: 'now' });
    const kinds = loadTemplates().map(t => t.kind).sort();
    expect(kinds).toEqual(['stages', 'two-hand']);
  });

  it('one template per effectId regardless of kind', () => {
    const lm = [{ x: 0, y: 0, z: 0 }];
    saveTemplate({ kind: 'hand', effectId: 'fx', landmarks: lm, handedness: 'Right', createdAt: 'a' });
    saveTemplate({ kind: 'stages', effectId: 'fx', stages: [lm, lm], createdAt: 'b' });
    const all = loadTemplates().filter(t => t.effectId === 'fx');
    expect(all).toHaveLength(1);
    expect(all[0].kind).toBe('stages');
  });

  it('import wraps kindless entries as hand templates', () => {
    const json = JSON.stringify([
      { effectId: 'old', landmarks: [], handedness: 'Left', createdAt: 'x' },
      { kind: 'two-hand', effectId: 'beam', left: [], right: [], span: 1, createdAt: 'y' },
    ]);
    const out = importTemplates(json);
    expect(out[0].kind).toBe('hand');
    expect(out[1].kind).toBe('two-hand');
  });

  it('import rejects unknown kinds by name', () => {
    const json = JSON.stringify([{ kind: 'sorcery', effectId: 'z', createdAt: 'x' }]);
    expect(() => importTemplates(json)).toThrowError(/sorcery/);
  });
});
```

- [ ] **Step 4: Run — new tests FAIL** (`npx vitest run tests/templateStore.test.ts`)

- [ ] **Step 5: Rewrite `src/gesture/templateStore.ts`**

```ts
import type { GestureTemplate } from '../types';

const V1_KEY = 'cammods.templates';
const KEY = 'cammods.templates.v2';

const KINDS = new Set(['hand', 'two-hand', 'stages']);

// Wrap legacy kindless records; reject unknown kinds by name.
function upgrade(entry: Record<string, unknown>): GestureTemplate {
  if (entry.kind == null) return { kind: 'hand', ...entry } as GestureTemplate;
  if (!KINDS.has(entry.kind as string)) throw new Error(`unknown template kind: ${String(entry.kind)}`);
  return entry as unknown as GestureTemplate;
}

function write(all: GestureTemplate[]): void {
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function loadTemplates(): GestureTemplate[] {
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(upgrade) : [];
    } catch {
      return [];
    }
  }
  // one-time migration from the v1 (kindless, one-hand-only) store
  const v1 = localStorage.getItem(V1_KEY);
  if (!v1) return [];
  try {
    const parsed = JSON.parse(v1);
    const migrated = Array.isArray(parsed) ? parsed.map(upgrade) : [];
    write(migrated);
    localStorage.removeItem(V1_KEY);
    return migrated;
  } catch {
    return [];
  }
}

export function saveTemplate(t: GestureTemplate): void {
  const all = loadTemplates().filter(x => x.effectId !== t.effectId);
  all.push(t);
  write(all);
}

export function removeTemplate(effectId: string): void {
  write(loadTemplates().filter(x => x.effectId !== effectId));
}

export function clearTemplates(): void {
  localStorage.removeItem(KEY);
  localStorage.removeItem(V1_KEY);
}

export function exportTemplates(): string {
  return JSON.stringify(loadTemplates(), null, 2);
}

export function importTemplates(json: string): GestureTemplate[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('invalid templates file');
  const upgraded = parsed.map(upgrade);
  write(upgraded);
  return upgraded;
}
```

- [ ] **Step 6: `npx tsc --noEmit && npm test`** — clean + green (count grows by 5).

- [ ] **Step 7: Commit** — `git add -A && git commit -m "feat(gestures): kind-tagged template store v2 with v1 migration"`

---

### Task 2: Pure capture core (TDD)

**Files:**
- Create: `src/gesture/capture.ts`
- Test: `tests/gesture/capture.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/gesture/capture.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CaptureAccumulator } from '../../src/gesture/capture';
import { normalizeLandmarks } from '../../src/gesture/normalize';
import type { HandLandmarks, HandResult } from '../../src/types';

// A simple asymmetric hand at an offset/scale — normalization-friendly.
function handAt(ox: number, oy: number, scale = 1): HandResult {
  const lm: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: ox + Math.cos(i) * 0.05 * scale,
    y: oy + Math.sin(i * 1.3) * 0.05 * scale,
    z: 0,
  }));
  lm[0] = { x: ox, y: oy + 0.1 * scale, z: 0 };  // wrist
  lm[9] = { x: ox, y: oy - 0.1 * scale, z: 0 };  // middle MCP (hand size anchor)
  return { landmarks: lm, handedness: 'Right' };
}

describe('CaptureAccumulator (one hand)', () => {
  it('rejects frames without a hand and accepts frames with one', () => {
    const acc = new CaptureAccumulator(1);
    expect(acc.add([])).toBe(false);
    expect(acc.count).toBe(0);
    expect(acc.add([handAt(0.5, 0.5)])).toBe(true);
    expect(acc.count).toBe(1);
  });

  it('averages normalized landmarks across frames', () => {
    const acc = new CaptureAccumulator(1);
    const h = handAt(0.3, 0.6);
    acc.add([h]);
    acc.add([h]);
    const cap = acc.finish();
    expect(cap.hands).toHaveLength(1);
    const expected = normalizeLandmarks(h.landmarks);
    for (let i = 0; i < 21; i++) {
      expect(cap.hands[0][i].x).toBeCloseTo(expected[i].x, 6);
      expect(cap.hands[0][i].y).toBeCloseTo(expected[i].y, 6);
    }
    expect(cap.span).toBeUndefined();
  });

  it('finish throws with zero accepted frames', () => {
    expect(() => new CaptureAccumulator(1).finish()).toThrow();
  });
});

describe('CaptureAccumulator (two hands)', () => {
  it('rejects single-hand frames', () => {
    const acc = new CaptureAccumulator(2);
    expect(acc.add([handAt(0.5, 0.5)])).toBe(false);
  });

  it('splits by wrist x regardless of array order and records span', () => {
    const acc = new CaptureAccumulator(2);
    const L = handAt(0.3, 0.5), R = handAt(0.7, 0.5);
    acc.add([R, L]); // reversed order on purpose
    const cap = acc.finish();
    const expL = normalizeLandmarks(L.landmarks);
    expect(cap.hands[0][0].x).toBeCloseTo(expL[0].x, 6); // hands[0] is LEFT-most
    // span = wrist distance (0.4) / avg hand size (0.2) = 2
    expect(cap.span).toBeCloseTo(2, 5);
  });
});
```

- [ ] **Step 2: Run → FAIL** (module missing), then implement `src/gesture/capture.ts`:

```ts
import { normalizeLandmarks } from './normalize';
import type { HandLandmarks, HandResult } from '../types';

export interface StageCapture {
  hands: HandLandmarks[]; // [one] or [leftMost, rightMost], normalized + averaged
  span?: number;          // two-hand only: wrist distance / avg hand size
}

function handSize(lm: HandLandmarks): number {
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1e-6;
}

// Accumulates valid frames for one wizard stage and averages them into a
// stable capture. Two-hand frames are split by wrist x (screen position),
// not handedness labels — MediaPipe mislabels mirrored/occluded hands.
export class CaptureAccumulator {
  private frames = 0;
  private sums: HandLandmarks[] = [];
  private spanSum = 0;

  constructor(private handsNeeded: 1 | 2) {}

  get count(): number { return this.frames; }

  add(hands: HandResult[]): boolean {
    if (hands.length < this.handsNeeded) return false;

    let picked: HandLandmarks[];
    if (this.handsNeeded === 1) {
      picked = [hands[0].landmarks];
    } else {
      const sorted = [...hands].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
      const left = sorted[0].landmarks, right = sorted[sorted.length - 1].landmarks;
      picked = [left, right];
      const dist = Math.hypot(left[0].x - right[0].x, left[0].y - right[0].y);
      const avg = (handSize(left) + handSize(right)) / 2;
      this.spanSum += dist / avg;
    }

    picked.forEach((lm, h) => {
      const n = normalizeLandmarks(lm);
      if (!this.sums[h]) this.sums[h] = n.map(p => ({ ...p }));
      else for (let i = 0; i < n.length; i++) { this.sums[h][i].x += n[i].x; this.sums[h][i].y += n[i].y; }
    });
    this.frames++;
    return true;
  }

  finish(): StageCapture {
    if (this.frames === 0) throw new Error('no frames captured');
    const hands = this.sums.map(sum =>
      sum.map(p => ({ x: p.x / this.frames, y: p.y / this.frames, z: 0 })),
    );
    return this.handsNeeded === 2
      ? { hands, span: this.spanSum / this.frames }
      : { hands };
  }
}
```

- [ ] **Step 3: Run → PASS**, then `npm test` (all green), then commit: `git add -A && git commit -m "feat(gestures): pure capture accumulator (averaging, wrist-x split, span)"`

---

### Task 3: Matchers — matchTwoHand + StagedTrigger (TDD)

**Files:**
- Create: `src/gesture/customTriggers.ts`
- Test: `tests/gesture/customTriggers.test.ts`

- [ ] **Step 1: Write the failing test** — create `tests/gesture/customTriggers.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchTwoHand, StagedTrigger } from '../../src/gesture/customTriggers';
import { normalizeLandmarks } from '../../src/gesture/normalize';
import type { HandLandmarks, HandResult, StagedTemplate, TwoHandTemplate } from '../../src/types';

// Distinct synthetic poses: pose A (spread arc) vs pose B (tight line) differ
// enough after normalization that they never cross-match at threshold 0.6.
function poseA(ox = 0.5, oy = 0.5): HandLandmarks {
  const lm: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: ox + Math.cos(i * 0.3) * 0.08, y: oy + Math.sin(i * 0.3) * 0.08, z: 0,
  }));
  lm[0] = { x: ox, y: oy + 0.12, z: 0 };
  lm[9] = { x: ox, y: oy - 0.12, z: 0 };
  return lm;
}
function poseB(ox = 0.5, oy = 0.5): HandLandmarks {
  const lm: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: ox + (i / 21) * 0.1, y: oy - (i / 21) * 0.1, z: 0,
  }));
  lm[0] = { x: ox, y: oy + 0.12, z: 0 };
  lm[9] = { x: ox, y: oy - 0.12, z: 0 };
  return lm;
}
const hand = (lm: HandLandmarks): HandResult => ({ landmarks: lm, handedness: 'Right' });

describe('matchTwoHand', () => {
  // template: pose A on the left, pose B on the right, wrists 0.4 apart, size 0.24
  const tpl: TwoHandTemplate = {
    kind: 'two-hand', effectId: 'beam',
    left: normalizeLandmarks(poseA(0.3, 0.5)),
    right: normalizeLandmarks(poseB(0.7, 0.5)),
    span: 0.4 / 0.24,
    createdAt: 'now',
  };

  it('matches the recorded pair at the recorded span', () => {
    expect(matchTwoHand([hand(poseA(0.3, 0.5)), hand(poseB(0.7, 0.5))], tpl, 0.6)).toBe(true);
  });

  it('matches with the hands array in reverse order (position-based assignment)', () => {
    expect(matchTwoHand([hand(poseB(0.7, 0.5)), hand(poseA(0.3, 0.5))], tpl, 0.6)).toBe(true);
  });

  it('rejects a single hand', () => {
    expect(matchTwoHand([hand(poseA(0.3, 0.5))], tpl, 0.6)).toBe(false);
  });

  it('rejects when the poses are swapped left/right', () => {
    expect(matchTwoHand([hand(poseB(0.3, 0.5)), hand(poseA(0.7, 0.5))], tpl, 0.3)).toBe(false);
  });

  it('rejects when hands are far outside the recorded span', () => {
    // same poses but wrists ~3x the recorded span apart (scaled positions)
    expect(matchTwoHand([hand(poseA(0.02, 0.5)), hand(poseB(0.98, 0.5))], tpl, 0.6)).toBe(false);
  });
});

describe('StagedTrigger', () => {
  const tpl: StagedTemplate = {
    kind: 'stages', effectId: 'gun',
    stages: [normalizeLandmarks(poseA()), normalizeLandmarks(poseB())],
    createdAt: 'now',
  };
  const trig = () => new StagedTrigger(tpl, () => 0.6);

  it('fires on ready -> fire', () => {
    const t = trig();
    expect(t.step(poseA(), 0)).toBe(false);   // armed
    expect(t.step(poseB(), 100)).toBe(true);  // fire
  });

  it('does not fire on fire-pose without arming first', () => {
    expect(trig().step(poseB(), 0)).toBe(false);
  });

  it('cooldown blocks but stays armed (GunCore parity)', () => {
    const t = trig();
    t.step(poseA(), 0);
    expect(t.step(poseB(), 10)).toBe(true);   // shot at t=10
    t.step(poseA(), 50);                       // re-arm
    expect(t.step(poseB(), 200)).toBe(false); // blocked (<350ms), stays armed
    expect(t.step(poseB(), 400)).toBe(true);  // fires once cooldown elapses
  });

  it('disarms when the hand matches neither stage or disappears', () => {
    const t = trig();
    t.step(poseA(), 0);
    t.step(null, 50);
    expect(t.step(poseB(), 100)).toBe(false);

    const t2 = trig();
    t2.step(poseA(), 0);
    const neither: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: i % 2, y: i % 3, z: 0 }));
    t2.step(neither, 50);
    expect(t2.step(poseB(), 100)).toBe(false);
  });

  it('reset disarms', () => {
    const t = trig();
    t.step(poseA(), 0);
    t.reset();
    expect(t.step(poseB(), 100)).toBe(false);
  });
});
```

- [ ] **Step 2: Run → FAIL**, then implement `src/gesture/customTriggers.ts`:

```ts
import { normalizeLandmarks } from './normalize';
import { landmarkDistance } from './distance';
import type { HandLandmarks, HandResult, StagedTemplate, TwoHandTemplate } from '../types';

const SPAN_MIN = 0.5; // x recorded span
const SPAN_MAX = 2.0;
const COOLDOWN_MS = 350; // matches GunCore

function handSize(lm: HandLandmarks): number {
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1e-6;
}

// Two-hand pose match (Kamehameha custom charge). Hands are assigned to the
// template's left/right slots by wrist x on screen, never by handedness label.
export function matchTwoHand(hands: HandResult[], t: TwoHandTemplate, threshold: number): boolean {
  if (hands.length < 2) return false;
  const sorted = [...hands].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
  const left = sorted[0].landmarks, right = sorted[sorted.length - 1].landmarks;

  const dist = Math.hypot(left[0].x - right[0].x, left[0].y - right[0].y);
  const span = dist / ((handSize(left) + handSize(right)) / 2);
  if (span < t.span * SPAN_MIN || span > t.span * SPAN_MAX) return false;

  return landmarkDistance(normalizeLandmarks(left), t.left) <= threshold
    && landmarkDistance(normalizeLandmarks(right), t.right) <= threshold;
}

// Two-stage ready->fire trigger (custom finger gun). Same semantics as GunCore:
// ready arms, fire while armed shoots (350ms cooldown; a blocked fire stays
// armed), matching neither stage — or losing the hand — disarms.
// Ambiguity rule: the machine reads the stage it is waiting for first.
export class StagedTrigger {
  private armed = false;
  private lastShot = -Infinity;

  constructor(private t: StagedTemplate, private getThreshold: () => number) {}

  step(landmarks: HandLandmarks | null, nowMs: number): boolean {
    if (!landmarks) { this.armed = false; return false; }
    const n = normalizeLandmarks(landmarks);
    const thr = this.getThreshold();
    const readyMatch = landmarkDistance(n, this.t.stages[0]) <= thr;
    const fireMatch = landmarkDistance(n, this.t.stages[1]) <= thr;

    if (!this.armed) {
      if (readyMatch) this.armed = true; // ready wins while disarmed
      return false;
    }
    if (fireMatch) { // fire wins while armed
      if (nowMs - this.lastShot >= COOLDOWN_MS) {
        this.lastShot = nowMs;
        this.armed = false;
        return true;
      }
      return false; // blocked: stay armed
    }
    if (!readyMatch) this.armed = false;
    return false;
  }

  reset(): void { this.armed = false; }
}
```

- [ ] **Step 3: Run → PASS**, `npm test` all green, commit: `git add -A && git commit -m "feat(gestures): two-hand matcher + staged ready->fire trigger (TDD)"`

---

### Task 4: Effect integration — gun + beam custom paths (TDD)

**Files:**
- Modify: `src/effects/gunShot.ts`, `src/effects/energyBeam.ts`
- Test: append to `tests/gunShot.test.ts`; create `tests/effects/beamCustom.test.ts`

- [ ] **Step 1: Failing gun test** — append to `tests/gunShot.test.ts` (inside the GunShot describe; reuse its `gunHand`/`ctx` helpers; add imports `normalizeLandmarks` from '../src/gesture/normalize' and `StagedTemplate` type from '../src/types'):

```ts
  it('custom staged trigger replaces the built-in finger gun', () => {
    const g = new GunShot();
    // custom: READY = open-ish flat hand, FIRE = the gun pose itself
    const ready: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.01, y: 0, z: 0 }));
    ready[0] = { x: 0, y: 0.1, z: 0 }; ready[9] = { x: 0, y: -0.1, z: 0 };
    const fire = gunHand(false);
    const tpl: StagedTemplate = {
      kind: 'stages', effectId: 'gun-shot',
      stages: [normalizeLandmarks(ready), normalizeLandmarks(fire)],
      createdAt: 'now',
    };
    g.setCustomTrigger(tpl, () => 0.6);

    // built-in cock (thumb-up gun) must NOT arm the custom trigger
    g.update(1 / 60, ctx(gunHand(true), 0));
    g.update(1 / 60, ctx(gunHand(false), 100));
    expect(g.isActive()).toBe(false);

    // custom ready -> fire fires
    g.update(1 / 60, ctx(ready, 500));
    g.update(1 / 60, ctx(fire, 600));
    expect(g.isActive()).toBe(true);
  });

  it('clearing the custom trigger restores the built-in', () => {
    const g = new GunShot();
    const tpl: StagedTemplate = {
      kind: 'stages', effectId: 'gun-shot',
      stages: [normalizeLandmarks(gunHand(true)), normalizeLandmarks(gunHand(false))],
      createdAt: 'now',
    };
    g.setCustomTrigger(tpl, () => 0.6);
    g.setCustomTrigger(null);
    g.update(1 / 60, ctx(gunHand(true), 0));
    g.update(1 / 60, ctx(gunHand(false), 100));
    expect(g.isActive()).toBe(true);
  });
```

- [ ] **Step 2: Run → FAIL** (no setCustomTrigger), then modify `src/effects/gunShot.ts`:

(a) imports: add `import { StagedTrigger } from '../gesture/customTriggers';` and `StagedTemplate` to the types import.
(b) fields — after the `cores` declaration add:

```ts
  // Custom ready->fire trigger; when set it REPLACES the built-in finger-gun
  // pose logic (per hand — dual wield works in both modes).
  private staged: Record<'Left' | 'Right', StagedTrigger> | null = null;

  setCustomTrigger(t: StagedTemplate | null, getThreshold: () => number = () => 0.6): void {
    this.staged = t
      ? { Left: new StagedTrigger(t, getThreshold), Right: new StagedTrigger(t, getThreshold) }
      : null;
  }
```

(c) in `update()` replace the per-hand pose block body (`const f = fingersUp(lm); const isGun = ...; if (this.cores[...]...`) with:

```ts
        const lm = hd.landmarks;
        if (this.staged) {
          if (this.staged[hd.handedness].step(lm, ctx.now)) this.shoot(lm, ctx);
        } else {
          const f = fingersUp(lm);
          const isGun = f[1] && !f[2] && !f[3] && !f[4];
          if (this.cores[hd.handedness].step({ isGun, thumbUp: f[0] }, ctx.now)) this.shoot(lm, ctx);
        }
```

(d) the unseen-side / no-hands else paths step null on BOTH machines:

```ts
      for (const side of ['Left', 'Right'] as const) {
        if (!seen.has(side)) { this.cores[side].step(null, ctx.now); this.staged?.[side].step(null, ctx.now); }
      }
    } else {
      for (const side of ['Left', 'Right'] as const) {
        this.cores[side].step(null, ctx.now);
        this.staged?.[side].step(null, ctx.now);
      }
    }
```

(e) `reset()` additionally: `if (this.staged) { this.staged.Left.reset(); this.staged.Right.reset(); }`

- [ ] **Step 3: Failing beam test** — create `tests/effects/beamCustom.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EnergyBeam } from '../../src/effects/energyBeam';
import { normalizeLandmarks } from '../../src/gesture/normalize';
import type { HandLandmarks, HandResult, RenderContext, TwoHandTemplate } from '../../src/types';

// Fist-like blob — would NEVER pass the built-in open-ish charge check.
function fist(ox: number, oy: number): HandLandmarks {
  const lm: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: ox + Math.cos(i) * 0.02, y: oy + Math.sin(i) * 0.02, z: 0,
  }));
  lm[0] = { x: ox, y: oy + 0.1, z: 0 };
  lm[9] = { x: ox, y: oy - 0.1, z: 0 };
  return lm;
}
const hand = (lm: HandLandmarks): HandResult => ({ landmarks: lm, handedness: 'Right' });

function ctx(hands: HandResult[], now: number): RenderContext {
  return { width: 1000, height: 1000, hand: hands[0] ?? null, hands, face: null, now };
}

describe('EnergyBeam custom charge pose', () => {
  it('charges on the custom two-hand pose (which the built-in would reject)', () => {
    const beam = new EnergyBeam();
    const L = fist(0.4, 0.5), R = fist(0.6, 0.5);
    const tpl: TwoHandTemplate = {
      kind: 'two-hand', effectId: 'energy-beam',
      left: normalizeLandmarks(L), right: normalizeLandmarks(R),
      span: 0.2 / 0.2, // wrists 0.2 apart / hand size 0.2
      createdAt: 'now',
    };

    // sanity: built-in rejects the fists
    let t = 0;
    for (let i = 0; i < 30; i++) { t += 1000 / 60; beam.update(1 / 60, ctx([hand(L), hand(R)], t)); }
    expect(beam.isActive()).toBe(false);

    beam.setCustomCharge(tpl, () => 0.6);
    for (let i = 0; i < 30; i++) { t += 1000 / 60; beam.update(1 / 60, ctx([hand(L), hand(R)], t)); }
    expect(beam.isActive()).toBe(true); // charging
  });
});
```

- [ ] **Step 4: Run → FAIL**, then modify `src/effects/energyBeam.ts`:

(a) imports: add `import { matchTwoHand } from '../gesture/customTriggers';` and `TwoHandTemplate` to the types import.
(b) fields + setter (near `enabled`):

```ts
  // Custom charge pose; when set it replaces the built-in palms-together check.
  private chargeTpl: TwoHandTemplate | null = null;
  private chargeThreshold: () => number = () => 0.6;

  setCustomCharge(t: TwoHandTemplate | null, getThreshold: () => number = () => 0.6): void {
    this.chargeTpl = t;
    this.chargeThreshold = getThreshold;
  }
```

(c) in `update()` replace the `togetherNow` line:

```ts
      const togetherNow = this.chargeTpl
        ? matchTwoHand(ctx.hands, this.chargeTpl, this.chargeThreshold())
        : openish(a) && openish(b) && wristDist < PALMS_DIST_FACTOR * avg;
```

- [ ] **Step 5: Run both new test files + full suite — PASS** (`npm test`); existing gun/beam default-path tests must be untouched and green.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(effects): custom staged gun trigger + custom two-hand beam charge"`

---

### Task 5: Recording wizard — compositor hook, overlay DOM, RecorderWizard

**Files:**
- Modify: `src/pixiCompositor.ts` (onHands hook), `index.html` (overlay DOM + CSS)
- Create: `src/recorder.ts`

No unit tests (DOM presenter; pure math already TDD'd in Task 2). Verified by typecheck + headless boot + live user test in Task 7.

- [ ] **Step 1: Add the `onHands` hook to `src/pixiCompositor.ts`**

In `CompositorHooks` add:

```ts
  onHands?: (hands: HandResult[]) => void; // every frame, all tracked hands
```

In `frame()`, right after `const hand = hands[0] ?? null;` add:

```ts
    this.hooks.onHands?.(hands);
```

- [ ] **Step 2: Overlay DOM in `index.html`**

Inside `<div id="stage">`, AFTER the `#idle` div, add:

```html
        <div id="recorder" class="hidden">
          <div class="r-box">
            <div class="r-title"></div>
            <div class="r-step"></div>
            <div class="r-prompt"></div>
            <div class="r-count hidden"></div>
            <div class="r-ring hidden"><div class="r-ring-in"></div></div>
            <div class="r-msg"></div>
            <div class="r-actions">
              <button class="r-retry hidden">↻ Retry</button>
              <button class="r-cancel">✕ Cancel</button>
            </div>
          </div>
        </div>
```

And in the `<style>` block (near the `#idle` rules) add:

```css
      #recorder {
        position: absolute; inset: 0; z-index: 5;
        display: flex; align-items: center; justify-content: center;
        background: rgba(8, 10, 14, 0.55);
      }
      #recorder.hidden { display: none; }
      .r-box {
        text-align: center; padding: 28px 40px; border-radius: 14px;
        background: rgba(12, 15, 22, 0.85);
        border: 1px solid rgba(125, 249, 255, 0.35);
        box-shadow: 0 0 40px rgba(125, 249, 255, 0.15);
        max-width: 480px;
      }
      .r-title { font-family: 'Chakra Petch', sans-serif; font-size: 20px; color: #7df9ff; letter-spacing: 0.08em; }
      .r-step { font-size: 11px; color: #8b94a7; margin-top: 2px; letter-spacing: 0.2em; text-transform: uppercase; }
      .r-prompt { font-size: 16px; color: #e8ecf4; margin: 14px 0 6px; }
      .r-count { font-family: 'Chakra Petch', sans-serif; font-size: 72px; color: #ffd27d; line-height: 1; margin: 10px 0; }
      .r-ring {
        width: 72px; height: 72px; margin: 12px auto; border-radius: 50%;
        background: conic-gradient(#7df9ff calc(var(--p, 0) * 1%), rgba(255, 255, 255, 0.12) 0);
        display: flex; align-items: center; justify-content: center;
      }
      .r-ring-in { width: 56px; height: 56px; border-radius: 50%; background: #0c0f16; }
      .r-msg { min-height: 18px; font-size: 13px; color: #ff9d9d; margin-top: 8px; }
      .r-count.hidden, .r-ring.hidden, .r-retry.hidden { display: none; }
      .r-actions { margin-top: 14px; display: flex; gap: 10px; justify-content: center; }
```

(Match the existing CSS conventions in the file — it already styles buttons globally.)

- [ ] **Step 3: Create `src/recorder.ts`**

```ts
import { CaptureAccumulator, type StageCapture } from './gesture/capture';
import type { GestureTemplate, HandResult } from './types';

export interface RecordStage {
  prompt: string;
  handsNeeded: 1 | 2;
}

export interface RecordFlow {
  effectId: string;
  title: string;
  stages: RecordStage[];
  build(captures: StageCapture[]): GestureTemplate;
}

const FRAMES_NEEDED = 12;
const STAGE_TIMEOUT_MS = 6000;
const COUNTDOWN_FROM = 3;

function el<T extends HTMLElement>(root: HTMLElement, sel: string): T {
  const found = root.querySelector<T>(sel);
  if (!found) throw new Error(`recorder: missing ${sel}`);
  return found;
}

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

// Guided recording overlay. The compositor keeps running; main.ts feeds every
// frame's hand results into feedHands(), and the wizard samples them on its own
// rAF — there is never a second MediaPipe consumer.
export class RecorderWizard {
  private root = document.getElementById('recorder') as HTMLDivElement;
  private title = el<HTMLDivElement>(this.root, '.r-title');
  private step = el<HTMLDivElement>(this.root, '.r-step');
  private prompt = el<HTMLDivElement>(this.root, '.r-prompt');
  private count = el<HTMLDivElement>(this.root, '.r-count');
  private ring = el<HTMLDivElement>(this.root, '.r-ring');
  private msg = el<HTMLDivElement>(this.root, '.r-msg');
  private retryBtn = el<HTMLButtonElement>(this.root, '.r-retry');
  private cancelBtn = el<HTMLButtonElement>(this.root, '.r-cancel');

  private hands: HandResult[] = [];
  private open = false;
  private cancelled = false;

  feedHands(h: HandResult[]): void { this.hands = h; }
  get isOpen(): boolean { return this.open; }

  // Returns the built template, or null if the user cancelled.
  async run(flow: RecordFlow): Promise<GestureTemplate | null> {
    if (this.open) return null;
    this.open = true;
    this.cancelled = false;
    this.root.classList.remove('hidden');
    this.title.textContent = flow.title;

    const onCancel = () => { this.cancelled = true; };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') this.cancelled = true; };
    this.cancelBtn.onclick = onCancel;
    window.addEventListener('keydown', onKey);

    try {
      const captures: StageCapture[] = [];
      for (let s = 0; s < flow.stages.length; s++) {
        const cap = await this.runStage(flow.stages[s], s, flow.stages.length);
        if (!cap) return null; // cancelled
        captures.push(cap);
      }
      this.showSaved();
      await sleep(900);
      return flow.build(captures);
    } finally {
      window.removeEventListener('keydown', onKey);
      this.root.classList.add('hidden');
      this.open = false;
    }
  }

  // One stage: countdown -> capture (with retry-on-timeout loop). Null = cancelled.
  private async runStage(stage: RecordStage, idx: number, total: number): Promise<StageCapture | null> {
    for (;;) {
      this.step.textContent = total > 1 ? `step ${idx + 1} of ${total}` : '';
      this.prompt.textContent = stage.prompt;
      this.msg.textContent = '';
      this.retryBtn.classList.add('hidden');
      this.ring.classList.add('hidden');

      // countdown
      this.count.classList.remove('hidden');
      for (let n = COUNTDOWN_FROM; n >= 1; n--) {
        if (this.cancelled) return null;
        this.count.textContent = String(n);
        await sleep(1000);
      }
      this.count.classList.add('hidden');

      // capture
      this.ring.classList.remove('hidden');
      const acc = new CaptureAccumulator(stage.handsNeeded);
      const t0 = performance.now();
      while (acc.count < FRAMES_NEEDED) {
        if (this.cancelled) return null;
        if (performance.now() - t0 > STAGE_TIMEOUT_MS) break;
        acc.add(this.hands);
        this.ring.style.setProperty('--p', String((acc.count / FRAMES_NEEDED) * 100));
        await new Promise(requestAnimationFrame);
      }
      this.ring.classList.add('hidden');

      if (acc.count >= FRAMES_NEEDED) return acc.finish();

      // timeout: offer retry / cancel
      this.msg.textContent = stage.handsNeeded === 2
        ? "Couldn't see both hands — get them in frame and retry"
        : "Couldn't see your hand — try again";
      this.retryBtn.classList.remove('hidden');
      const retry = await new Promise<boolean>(resolve => {
        this.retryBtn.onclick = () => resolve(true);
        const poll = () => {
          if (this.cancelled) return resolve(false);
          setTimeout(poll, 100);
        };
        poll();
      });
      this.retryBtn.onclick = null;
      if (!retry) return null;
    }
  }

  private showSaved(): void {
    this.step.textContent = '';
    this.prompt.textContent = 'Saved — try it!';
    this.msg.textContent = '';
    this.msg.style.color = '#7dffb2';
  }
}

// ---- flow definitions ----

export function singlePoseFlow(effectId: string, name: string): RecordFlow {
  return {
    effectId,
    title: `Record: ${name}`,
    stages: [{ prompt: 'Hold your pose', handsNeeded: 1 }],
    build: ([cap]) => ({
      kind: 'hand',
      effectId,
      landmarks: cap.hands[0],
      handedness: 'Right',
      createdAt: new Date().toISOString(),
    }),
  };
}

export function gunFlow(): RecordFlow {
  return {
    effectId: 'gun-shot',
    title: 'Record: Finger Gun trigger',
    stages: [
      { prompt: 'Hold your READY pose (the "cocked" position)', handsNeeded: 1 },
      { prompt: 'Now hold your FIRE pose', handsNeeded: 1 },
    ],
    build: ([ready, fire]) => ({
      kind: 'stages',
      effectId: 'gun-shot',
      stages: [ready.hands[0], fire.hands[0]],
      createdAt: new Date().toISOString(),
    }),
  };
}

export function beamFlow(): RecordFlow {
  return {
    effectId: 'energy-beam',
    title: 'Record: Kamehameha charge pose',
    stages: [{ prompt: 'Hold your CHARGE pose with both hands', handsNeeded: 2 }],
    build: ([cap]) => ({
      kind: 'two-hand',
      effectId: 'energy-beam',
      left: cap.hands[0],
      right: cap.hands[1],
      span: cap.span ?? 1,
      createdAt: new Date().toISOString(),
    }),
  };
}
```

Note: `showSaved` sets `msg.style.color` — reset it at the top of `runStage` with `this.msg.style.color = '';` (add that line beside `this.msg.textContent = ''`).

- [ ] **Step 4: Verify** — `npx tsc --noEmit && npm test` (green; nothing imports recorder yet), then headless boot screenshot per the baseline protocol (overlay is `.hidden` by default — pattern must render unchanged).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(recorder): live guided recording wizard + compositor onHands tap"`

---

### Task 6: main.ts wiring — trigger rows, shared controls, wizard, propagation

**Files:**
- Modify: `src/main.ts`, `src/gesture/bindingStore.ts`
- Delete: `src/calibration.ts`

- [ ] **Step 1: Widen `GestureChoice`** in `src/gesture/bindingStore.ts`:

```ts
// Per-effect activation choice: a built-in preset (bindable effects), 'default'
// (self-driven effects' built-in trigger), or 'custom' (recorded gesture).
export type GestureChoice = GestureId | 'custom' | 'default';
```

- [ ] **Step 2: `src/main.ts` — imports**

Remove: `import { calibrate, countdown } from './calibration';`
Add:

```ts
import { RecorderWizard, singlePoseFlow, gunFlow, beamFlow, type RecordFlow } from './recorder';
import type { StagedTemplate, TwoHandTemplate } from './types';
```

- [ ] **Step 3: CardDef + CARDS — trigger-customizable self-driven cards**

Extend `CardDef` with:

```ts
  customTrigger?: string;        // self-driven effects: label of the built-in trigger
```

In CARDS, on the gun card add `customTrigger: 'Default (finger gun)',` and on the energy-beam card add `customTrigger: 'Default (palms together)',`.

- [ ] **Step 4: Wizard instance + flows + propagation helpers** (after the `engine` declaration):

```ts
const recorder = new RecorderWizard();

function flowFor(def: CardDef): RecordFlow {
  if (def.id === 'gun-shot') return gunFlow();
  if (def.id === 'energy-beam') return beamFlow();
  return singlePoseFlow(def.id, def.name);
}

// Push current custom triggers (or their absence) into the two self-driven effects.
function pushCustomTriggers() {
  const templates = loadTemplates();
  const gunTpl = templates.find(t => t.effectId === 'gun-shot' && t.kind === 'stages') as StagedTemplate | undefined;
  const gunOn = getChoice('gun-shot', 'default') === 'custom' && gunTpl;
  gun.setCustomTrigger(gunOn ? gunTpl : null, () => sensitivity.get('gun-shot') ?? DEFAULT_THRESHOLD);

  const beamTpl = templates.find(t => t.effectId === 'energy-beam' && t.kind === 'two-hand') as TwoHandTemplate | undefined;
  const beamOn = getChoice('energy-beam', 'default') === 'custom' && beamTpl;
  beam.setCustomCharge(beamOn ? beamTpl : null, () => sensitivity.get('energy-beam') ?? DEFAULT_THRESHOLD);
}
```

- [ ] **Step 5: Replace `recordCustom`** (the old compositor-stop + calibrate flow) with the wizard version:

```ts
async function recordCustom(def: CardDef) {
  if (!running) { setState('press start first'); renderCards(); return; }
  if (recorder.isOpen) return;

  const prevShow = compositor ? compositor.showLandmarks : false;
  if (compositor) compositor.showLandmarks = true; // see what's being tracked
  try {
    const template = await recorder.run(flowFor(def));
    if (template) {
      saveTemplate(template);
      saveChoice(def.id, 'custom');
      setState('custom gesture saved ✓');
    } else {
      setState('recording cancelled');
    }
  } finally {
    if (compositor) compositor.showLandmarks = prevShow;
    pushCustomTriggers();
    rebuildBindings();
    renderCards();
  }
}
```

Callers change from `recordCustom(def.id)` to `recordCustom(def)` (two sites in renderCards: the dropdown onchange and the record button). Add the missing import `saveTemplate` to the templateStore import line.

- [ ] **Step 6: Generalize `clearCustom`:**

```ts
function clearCustom(effectId: string) {
  removeTemplate(effectId);
  const def = CARDS.find(d => d.id === effectId);
  if (def?.bindable && def.defaultGesture) saveChoice(effectId, def.defaultGesture);
  else if (def?.customTrigger) saveChoice(effectId, 'default');
  pushCustomTriggers();
  rebuildBindings();
  renderCards();
  setState('custom gesture cleared');
}
```

- [ ] **Step 7: Extract the shared custom-controls row.** In `renderCards`, the bindable `choice === 'custom'` block currently builds re-record/clear/sensitivity inline. Extract:

```ts
// Re-record / clear / sensitivity controls shown when an effect uses a custom gesture.
function customControlsRow(def: CardDef, card: HTMLDivElement) {
  const set = hasTemplate(def.id);
  const row = document.createElement('div');
  row.className = 'row';
  const rec = button(set ? '↻ Re-record' : '🎯 Record', () => recordCustom(def));
  rec.className = 'primary';
  const clr = button('✕', () => clearCustom(def.id));
  clr.className = 'icon-btn';
  clr.title = 'Clear custom gesture';
  clr.disabled = !set;
  row.append(rec, clr);
  card.append(row);

  const sens = document.createElement('div');
  sens.className = 'sens';
  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0.2'; slider.max = '1.2'; slider.step = '0.05';
  slider.value = String(sensitivity.get(def.id) ?? DEFAULT_THRESHOLD);
  slider.oninput = () => { sensitivity.set(def.id, parseFloat(slider.value)); };
  sens.append(document.createTextNode('strict'), slider, document.createTextNode('loose'));
  card.append(sens);
}
```

and call it from the bindable branch (replacing the inline block).

- [ ] **Step 8: Trigger row for gun/beam cards.** In `renderCards`, after the `if (def.bindable) { ... }` block add:

```ts
    if (def.customTrigger) {
      const choice = getChoice(def.id, 'default');

      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('span');
      label.className = 'field-label';
      label.textContent = 'Trigger';
      const select = document.createElement('select');
      const defOpt = document.createElement('option');
      defOpt.value = 'default';
      defOpt.textContent = def.customTrigger;
      const customOpt = document.createElement('option');
      customOpt.value = 'custom';
      customOpt.textContent = '✎  Custom (record)…';
      select.append(defOpt, customOpt);
      select.value = choice === 'custom' ? 'custom' : 'default';
      select.onchange = () => {
        if (select.value === 'custom') {
          recordCustom(def); // saves choice on success; renderCards reverts on cancel
        } else {
          saveChoice(def.id, 'default');
          pushCustomTriggers();
          renderCards();
          setState(`${def.name}: default trigger`);
        }
      };
      row.append(label, select);
      card.append(row);

      if (choice === 'custom') customControlsRow(def, card);
    }
```

Also update the badge: in the card-top construction, replace the non-bindable badge branch with:

```ts
    if (!def.bindable) {
      badge.classList.add('auto');
      badge.textContent =
        def.customTrigger && getChoice(def.id, 'default') === 'custom' && hasTemplate(def.id) ? '✎' : 'auto';
    } else { badge.classList.add('set'); badge.textContent = activationBadge(def); }
```

- [ ] **Step 9: Wire the hook + boot + reset/import/slider propagation:**

(a) compositor hooks object gains (next to onFrame):

```ts
      onHands: hands => { if (recorder.isOpen) recorder.feedHands(hands); },
```

(b) `resetAll()` gains `pushCustomTriggers();` after `rebuildBindings()`.
(c) `doImport`'s success path gains `pushCustomTriggers();` after `rebuildBindings()`.
(d) `customControlsRow`'s slider `oninput` already updates the map the getters read live — no extra call needed (thresholds are read through closures).
(e) At boot (next to the existing `rebuildBindings(); renderCards();`) add `pushCustomTriggers();` BEFORE renderCards.

- [ ] **Step 10: Delete the superseded calibration module:**

```bash
git rm src/calibration.ts
```

(Verify nothing imports it: `grep -rn "calibration" src/ tests/` → empty.)

- [ ] **Step 11: Verify** — `npx tsc --noEmit && npm test` (green), `npm run build` (clean), then headless: baseline screenshot AND a DOM check that the trigger rows render:

```bash
"$CHROME" --headless=new --enable-unsafe-swiftshader --virtual-time-budget=8000 \
  --dump-dom "http://localhost:$PORT/" | grep -c "Trigger"
```
Expected ≥ 2 (gun + beam rows).

- [ ] **Step 12: Commit** — `git add -A && git commit -m "feat(ui): trigger customization for gun/kamehameha + wizard wiring; retire calibration.ts"`

---

### Task 7: README + verification battery + live handoff

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README updates**

(a) Section 3 / "Custom (record your own)" paragraph — replace with:

```markdown
**Custom (record your own):** choose **✎ Custom** in a card's dropdown to record your
own gesture in a **guided overlay**: a 3-2-1 countdown, a live skeleton showing
exactly what's tracked, and a progress ring while it captures. Multi-step triggers
walk you through each pose. A **strict ↔ loose** sensitivity slider and a **✕**
(clear) appear for custom gestures.
```

(b) In Step 3's bullet list, extend the gun and kamehameha bullets:

- Gun bullet: append `— or record your **own two-pose trigger** (Trigger → ✎ Custom: a READY pose, then a FIRE pose).`
- Kamehameha bullet: append `The charge pose is customizable too (Trigger → ✎ Custom records any two-hand pose).`

(c) Module table: remove the `src/calibration.ts` row; add:

```markdown
| `src/recorder.ts` | Guided recording wizard (countdown, live capture, retry) |
| `src/gesture/capture.ts` | Frame-capture averaging (one or two hands, span) |
| `src/gesture/customTriggers.ts` | Two-hand pose matcher + staged ready→fire trigger |
```

(d) Troubleshooting row `"No hand detected — try again" during calibration` → replace with `Recording times out ("Couldn't see your hand") | Make sure your hand (or both hands) is well-lit and fully in frame, then hit ↻ Retry.`

- [ ] **Step 2: Full battery**

```bash
npx tsc --noEmit && npm test && npm run build
```
All green. Then headless baseline screenshot (non-black mirrored pattern) + the Trigger-row DOM grep from Task 6.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "docs: custom recording v2 README"`

- [ ] **Step 4: Live user verification** — user records: a custom one-hand pose for a bindable effect (wizard look & feel), a custom gun ready→fire pair (fires on their poses, dual-wield still OK, ✕ reverts to built-in), a custom kamehameha charge pose (charges on it, thrust still fires). Fix what they report, then proceed toward merge via finishing-a-development-branch.

---

## Self-review notes (already applied)

- **Spec coverage:** §2 model/store → T1; §3.1 matchTwoHand + beam integration → T3/T4; §3.2 StagedTrigger + gun integration → T3/T4; §3.3 thresholds → T3 (getThreshold) + T6 (sensitivity map); §4.1 onHands tap + forced skeleton → T5/T6; §4.2 flows → T5; §4.3 wizard stages/countdown/progress/retry/cancel → T5; §4.4 DOM/CSS → T5; §4.5 calibration deletion + capture core → T2/T6; §5 UI/persistence (GestureChoice 'default', trigger rows, shared controls row, badge, reset/import propagation) → T6; §6 tests → T1-T4; §7 perf (matching only when templates set) → T3/T4 code; §8 migration → T1.
- **Type consistency:** `StageCapture.hands`/`span` (T2) consumed by flows (T5) and matchers' templates built from them; `setCustomTrigger(StagedTemplate|null, getThreshold)` / `setCustomCharge(TwoHandTemplate|null, getThreshold)` consistent between T4 definitions and T6 `pushCustomTriggers`; `GestureChoice` widening (T6) matches `getChoice(def.id, 'default')` usage; `recordCustom(def: CardDef)` signature change applied at both call sites (T6 steps 5/7/8).
- **Placeholder scan:** none — full code for every step.
- **Known accepted nuance:** effects may fire while the wizard is open (spec §4.1 explicitly accepts this); `singlePoseFlow` stores `handedness: 'Right'` (the field is informational; matching never uses it — consistent with position-based assignment philosophy).
