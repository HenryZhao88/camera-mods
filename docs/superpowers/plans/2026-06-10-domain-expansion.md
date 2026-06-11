# Domain Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sukuna-homage Domain Expansion effect per spec `docs/superpowers/specs/2026-06-10-domain-expansion-design.md`: hold a two-hand sign → slam → ink-blot bleed-in → sustained crimson domain with a shrine silhouette rising behind the user (person segmentation) and dismantle slashes → collapse on X key / card button.

**Architecture:** Pure TDD'd `domainCore` state machine + `inkBlot` geometry + `isClasped` predicate; `PersonSegmenter` (MediaPipe ImageSegmenter, owned by the effect, runs only while non-idle); a new `backdrop` stage layer between video and effects for the shrine + person-cutout occlusion; bleed via a blot-sprite mask over a screen-layer crimson grade; pooled slash sprites; WebAudio sfx following the shield-hum lifecycle pattern.

**Tech Stack:** Existing (Vite/TS, PixiJS v8, MediaPipe Tasks Vision, Vitest/jsdom). No new packages — ImageSegmenter ships in `@mediapipe/tasks-vision` (verified: `segmentForVideo(video, ts)` sync overload returns `ImageSegmenterResult` with `confidenceMasks: MPMask[]`, `MPMask.getAsFloat32Array()`).

**Branch:** continue on `feat/cinematic-vfx`. **Baseline:** 151 tests / 27 files green at 6430594.

**Headless protocol** (Tasks 4–6):
```bash
npm run dev > /tmp/vite-dev.log 2>&1 &
sleep 3
PORT=$(grep -oE "localhost:[0-9]+" /tmp/vite-dev.log | head -1 | cut -d: -f2)
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --enable-unsafe-swiftshader --user-data-dir=/tmp/chrome-headless \
  --window-size=1280,800 --virtual-time-budget=30000 --screenshot=/tmp/domain.png \
  "http://localhost:$PORT/?clean=1&autostart=1&fakecam=1"
# Read the PNG (mirrored FAKE CAM pattern, non-black), then: kill %1
```
(The `--user-data-dir` avoids collisions with a running Chrome.)

---

## File map (final state)

| File | Status | Responsibility |
|---|---|---|
| `src/effects/domainCore.ts` | create | Pure state machine (idle→arming→casting→active→collapsing→cooldown), progress getter — TDD |
| `src/gesture/clasp.ts` | create | `isClasped(hands)` predicate — TDD |
| `src/fx/inkBlot.ts` | create | Seeded ragged blob outline geometry — TDD |
| `src/fx/proceduralTextures.ts` | modify | `inkBlotTexture(seed)`, `shrineTexture()`; `FxTextures` gains `inkBlots: Texture[]`, `shrine: Texture` |
| `src/fx/sfx.ts` | modify | `domainSlam`, `domainRumbleStart/Stop`, `slashTick`, `domainCollapse` |
| `src/segmenter.ts` | create | `PersonSegmenter` over Camera (lazy init, GPU→CPU fallback, mask canvas → Texture) |
| `src/pixiCompositor.ts` | modify | `backdropLayer` between video and effects; `EffectStage.backdrop` |
| `src/types.ts` | modify | `EffectStage` gains `backdrop: Container` |
| `src/effects/domainExpansion.ts` | create | Presenter: bleed mask, grade, shrine, person cutout, slashes, sfx |
| `src/recorder.ts` | modify | `domainFlow()` |
| `src/main.ts` | modify | Card, selfDriven, effects array, pushCustomTriggers branch, X key, segmenter wiring |
| `README.md` | modify | Domain docs + clasp/kamehameha overlap note |
| `tests/effects/domainCore.test.ts` | create | State machine tests |
| `tests/gesture/clasp.test.ts` | create | Clasp predicate tests |
| `tests/fx/inkBlot.test.ts` | create | Blob geometry tests |

---

### Task 1: domainCore state machine + isClasped (TDD)

**Files:**
- Create: `src/effects/domainCore.ts`, `src/gesture/clasp.ts`
- Test: `tests/effects/domainCore.test.ts`, `tests/gesture/clasp.test.ts`

- [ ] **Step 1: Write the failing domainCore test** — create `tests/effects/domainCore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { DomainCore } from '../../src/effects/domainCore';

// Advance the core by `seconds` worth of 60fps frames with a fixed sign state.
function run(c: DomainCore, signHeld: boolean, seconds: number) {
  const frames = Math.round(seconds * 60);
  const events = { slammed: false, collapsed: false };
  for (let i = 0; i < frames; i++) {
    const ev = c.step(signHeld, 1 / 60);
    if (ev.slammed) events.slammed = true;
    if (ev.collapsed) events.collapsed = true;
  }
  return events;
}

describe('DomainCore', () => {
  it('starts idle with zero arm and zero progress', () => {
    const c = new DomainCore();
    expect(c.state).toBe('idle');
    expect(c.arm).toBe(0);
    expect(c.progress).toBe(0);
  });

  it('arms over 0.6s of held sign, then casts', () => {
    const c = new DomainCore();
    run(c, true, 0.3);
    expect(c.state).toBe('arming');
    expect(c.arm).toBeCloseTo(0.5, 1);
    run(c, true, 0.35);
    expect(c.state).toBe('casting');
  });

  it('arm decays at 2x and returns to idle when the sign breaks', () => {
    const c = new DomainCore();
    run(c, true, 0.3); // arm ~0.5
    run(c, false, 0.2); // decay 2x: 0.5 - 0.2/0.6*2 ≈ 0.33... continue to 0
    expect(c.state).toBe('arming');
    run(c, false, 0.2);
    expect(c.arm).toBe(0);
    expect(c.state).toBe('idle');
  });

  it('fires slammed exactly once, at 0.5s into casting', () => {
    const c = new DomainCore();
    run(c, true, 0.7); // armed -> casting
    const before = run(c, false, 0.4); // 0.4s into cast (sign released — ignored)
    expect(before.slammed).toBe(false);
    const at = run(c, false, 0.2); // crosses 0.5
    expect(at.slammed).toBe(true);
    const after = run(c, false, 0.2);
    expect(after.slammed).toBe(false);
  });

  it('casting completes into active even with the sign released', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5); // > CAST_S
    expect(c.state).toBe('active');
    expect(c.progress).toBe(1);
  });

  it('stays active indefinitely until collapse()', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5);
    run(c, false, 30);
    expect(c.state).toBe('active');
  });

  it('collapse() during active emits collapsed and winds down to idle', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5);
    c.collapse();
    expect(c.state).toBe('collapsing');
    const ev = run(c, false, 0.9); // > COLLAPSE_S
    expect(ev.collapsed).toBe(false); // collapsed fires from collapse(), not step
    expect(c.state).toBe('cooldown');
    run(c, false, 1.1); // > COOLDOWN_S
    expect(c.state).toBe('idle');
  });

  it('collapse() outside active is a no-op', () => {
    const c = new DomainCore();
    c.collapse();
    expect(c.state).toBe('idle');
    run(c, true, 0.7); // casting
    c.collapse();
    expect(c.state).toBe('casting');
  });

  it('progress maps the bleed: 0 until slam, ramps to 1 by cast end, reverses on collapse', () => {
    const c = new DomainCore();
    run(c, true, 0.7);   // casting begins
    run(c, false, 0.45); // before slam (0.5)
    expect(c.progress).toBe(0);
    run(c, false, 0.5);  // t≈0.95 → (0.95-0.5)/(1.4-0.5) = 0.5
    expect(c.progress).toBeCloseTo(0.5, 1);
    run(c, false, 0.5);  // active
    expect(c.progress).toBe(1);
    c.collapse();
    run(c, false, 0.4);  // halfway through 0.8s collapse
    expect(c.progress).toBeCloseTo(0.5, 1);
  });

  it('reset() returns to idle from any state', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5); // active
    c.reset();
    expect(c.state).toBe('idle');
    expect(c.progress).toBe(0);
    expect(c.arm).toBe(0);
  });

  it('no re-cast during cooldown even if the sign is held', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5);
    c.collapse();
    run(c, true, 0.9); // collapsing finishes into cooldown with sign held
    expect(c.state).toBe('cooldown');
    run(c, true, 0.5); // still inside 1.0s cooldown
    expect(c.state).toBe('cooldown');
    run(c, true, 0.6); // cooldown over -> sign held -> arming
    expect(c.state).toBe('arming');
  });
});
```

- [ ] **Step 2: Run → FAIL** (`npx vitest run tests/effects/domainCore.test.ts` — module missing).

- [ ] **Step 3: Implement `src/effects/domainCore.ts`:**

```ts
// Pure Domain Expansion state machine. The effect feeds it one signHeld sample
// per frame; collapse() is called by the X key / Collapse button. All tuning
// constants live here.
export type DomainState = 'idle' | 'arming' | 'casting' | 'active' | 'collapsing' | 'cooldown';

export interface DomainEvents { slammed?: boolean; collapsed?: boolean; }

const ARM_S = 0.6;          // sign hold time to begin the cast
const ARM_DECAY_MULT = 2;   // arm decay speed vs growth when the sign breaks
const CAST_S = 1.4;         // full cast duration
const SLAM_AT = 0.5;        // slam moment within the cast
const COLLAPSE_S = 0.8;
const COOLDOWN_S = 1.0;

export class DomainCore {
  state: DomainState = 'idle';
  arm = 0;   // 0..1 while arming
  t = 0;     // seconds within casting/collapsing/cooldown
  private slamFired = false;
  private collapseRequested = false;

  step(signHeld: boolean, dt: number): DomainEvents {
    const ev: DomainEvents = {};

    switch (this.state) {
      case 'idle':
        if (signHeld) { this.state = 'arming'; this.arm = 0; }
        break;

      case 'arming':
        if (signHeld) this.arm = Math.min(1, this.arm + dt / ARM_S);
        else this.arm = Math.max(0, this.arm - (dt / ARM_S) * ARM_DECAY_MULT);
        if (this.arm >= 1) { this.state = 'casting'; this.t = 0; this.slamFired = false; }
        else if (this.arm === 0 && !signHeld) this.state = 'idle';
        break;

      case 'casting': // sign state ignored: the cast completes regardless
        this.t += dt;
        if (!this.slamFired && this.t >= SLAM_AT) { this.slamFired = true; ev.slammed = true; }
        if (this.t >= CAST_S) { this.state = 'active'; this.t = 0; }
        break;

      case 'active':
        if (this.collapseRequested) {
          this.collapseRequested = false;
          this.state = 'collapsing';
          this.t = 0;
          ev.collapsed = true;
        }
        break;

      case 'collapsing':
        this.t += dt;
        if (this.t >= COLLAPSE_S) { this.state = 'cooldown'; this.t = 0; }
        break;

      case 'cooldown':
        this.t += dt;
        if (this.t >= COOLDOWN_S) { this.state = 'idle'; this.arm = 0; }
        break;
    }
    return ev;
  }

  // Request a collapse; takes effect on the next step while active.
  collapse(): void {
    if (this.state === 'active') this.collapseRequested = true;
  }

  // Single source of truth for the bleed: 0 closed, 1 fully expanded.
  get progress(): number {
    switch (this.state) {
      case 'casting': return Math.max(0, Math.min(1, (this.t - SLAM_AT) / (CAST_S - SLAM_AT)));
      case 'active': return 1;
      case 'collapsing': return Math.max(0, 1 - this.t / COLLAPSE_S);
      default: return 0;
    }
  }

  reset(): void {
    this.state = 'idle';
    this.arm = 0;
    this.t = 0;
    this.slamFired = false;
    this.collapseRequested = false;
  }
}
```

NOTE the test "collapse() during active emits collapsed" expects `collapsed` to surface — with the deferred-request design above, the event fires on the FIRST `step` after `collapse()`. The test's `run(c, false, 0.9)` collects events across steps, so `ev.collapsed` is true within that run — re-check the test expectation: it asserts `ev.collapsed === false` for that run because the comment says "collapsed fires from collapse(), not step". RESOLVE THIS during implementation: make `collapse()` transition SYNCHRONOUSLY (state='collapsing', t=0) and return void, and have the presenter call its collapse sfx at the `collapse()` call site instead of via an event. Simplify: DELETE the `collapsed` event entirely (events = `{ slammed?: boolean }`), make `collapse()` synchronous, and update the test to assert the synchronous transition (it already does: `expect(c.state).toBe('collapsing')` right after `c.collapse()`). Adjust both code and test accordingly — the test block above marks `ev.collapsed` checks that should simply be removed.

- [ ] **Step 4: Run → PASS** (after resolving the event design per the note — final tests must be green and meaningful).

- [ ] **Step 5: Write the failing clasp test** — create `tests/gesture/clasp.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { isClasped } from '../../src/gesture/clasp';
import type { HandLandmarks, HandResult } from '../../src/types';

function handAt(wx: number, wy: number, size = 0.2): HandResult {
  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({ x: wx, y: wy, z: 0 }));
  lm[0] = { x: wx, y: wy, z: 0 };            // wrist
  lm[9] = { x: wx, y: wy - size, z: 0 };     // middle MCP (hand size anchor)
  return { landmarks: lm, handedness: 'Right' };
}

describe('isClasped', () => {
  it('passes when two wrists are closer than 0.9x average hand size', () => {
    expect(isClasped([handAt(0.50, 0.5), handAt(0.62, 0.5)])).toBe(true); // 0.12 < 0.18
  });

  it('fails when wrists are farther than 0.9x average hand size', () => {
    expect(isClasped([handAt(0.3, 0.5), handAt(0.7, 0.5)])).toBe(false); // 0.4 > 0.18
  });

  it('fails with fewer than two hands', () => {
    expect(isClasped([])).toBe(false);
    expect(isClasped([handAt(0.5, 0.5)])).toBe(false);
  });
});
```

- [ ] **Step 6: Run → FAIL, implement `src/gesture/clasp.ts`:**

```ts
import type { HandLandmarks, HandResult } from '../types';

// Wrists closer than this x average hand size = a clasped two-hand sign.
// No finger requirements: folded signs occlude fingers and finger reads are
// unreliable when hands overlap.
const CLASP_FACTOR = 0.9;

function handSize(lm: HandLandmarks): number {
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1e-6;
}

export function isClasped(hands: HandResult[]): boolean {
  if (hands.length < 2) return false;
  const [a, b] = hands;
  const dist = Math.hypot(
    a.landmarks[0].x - b.landmarks[0].x,
    a.landmarks[0].y - b.landmarks[0].y,
  );
  const avg = (handSize(a.landmarks) + handSize(b.landmarks)) / 2;
  return dist < CLASP_FACTOR * avg;
}
```

- [ ] **Step 7: Run → PASS, full suite green, commit** — `git add -A && git commit -m "feat(domain): TDD'd cast/collapse state machine + clasp sign predicate"`

---

### Task 2: ink blot geometry + textures + sfx

**Files:**
- Create: `src/fx/inkBlot.ts` + Test: `tests/fx/inkBlot.test.ts`
- Modify: `src/fx/proceduralTextures.ts`, `src/fx/sfx.ts`

- [ ] **Step 1: Failing inkBlot test** — create `tests/fx/inkBlot.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { genInkBlot } from '../../src/fx/inkBlot';

describe('genInkBlot', () => {
  it('produces 24-32 outline points', () => {
    for (const seed of [0.1, 0.5, 0.9]) {
      const pts = genInkBlot(seed);
      expect(pts.length).toBeGreaterThanOrEqual(24);
      expect(pts.length).toBeLessThanOrEqual(32);
    }
  });

  it('keeps every radius within the jitter envelope [0.45, 1.0]', () => {
    const pts = genInkBlot(0.42);
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeGreaterThanOrEqual(0.45);
      expect(r).toBeLessThanOrEqual(1.0);
    }
  });

  it('is deterministic per seed and varies across seeds', () => {
    expect(genInkBlot(0.7)).toEqual(genInkBlot(0.7));
    expect(genInkBlot(0.7)).not.toEqual(genInkBlot(0.71));
  });
});
```

- [ ] **Step 2: Run → FAIL, implement `src/fx/inkBlot.ts`:**

```ts
// Seeded ragged ink-blob outline in unit space (max radius 1, centered 0,0).
// Two octaves of angular noise give the splotchy, organic ink edge.
export interface BlotPt { x: number; y: number; }

function mulberry32(seed: number): () => number {
  let a = Math.floor(seed * 2 ** 31) | 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genInkBlot(seed: number): BlotPt[] {
  const rng = mulberry32(seed);
  const n = 24 + Math.floor(rng() * 9); // 24..32

  // two octaves: 3-lobe slow wave + per-point jitter, normalized into [0.45, 1]
  const lobePhase = rng() * Math.PI * 2;
  const lobeAmp = 0.12 + rng() * 0.1;
  const pts: BlotPt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lobe = Math.sin(a * 3 + lobePhase) * lobeAmp;
    const jitter = (rng() - 0.5) * 0.24;
    const r = Math.min(1, Math.max(0.45, 0.72 + lobe + jitter));
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}
```

- [ ] **Step 3: Run → PASS.**

- [ ] **Step 4: Textures in `src/fx/proceduralTextures.ts`** — add after `webTexture`:

```ts
import { genInkBlot } from './inkBlot';

// 512² white ink blot with a softly blurred edge — used as an alpha mask sprite.
export function inkBlotTexture(seed: number): Texture {
  const SIZE = 512, C = SIZE / 2, R = SIZE * 0.48;
  return Texture.from(canvasOf(SIZE, SIZE, c => {
    const pts = genInkBlot(seed);
    c.fillStyle = '#ffffff';
    c.filter = 'blur(2px)';
    c.beginPath();
    c.moveTo(C + pts[0].x * R, C + pts[0].y * R);
    for (let i = 1; i < pts.length; i++) c.lineTo(C + pts[i].x * R, C + pts[i].y * R);
    c.closePath();
    c.fill();
  }));
}

// 1024² horned-shrine silhouette: stepped plinth, columns, two-tier pagoda roof
// with upswept eaves, horn curves — black fill with a crimson rim glow.
export function shrineTexture(): Texture {
  const W = 1024, H = 1024;
  return Texture.from(canvasOf(W, H, c => {
    c.fillStyle = '#000000';
    c.shadowColor = '#b3122a';
    c.shadowBlur = 6;
    c.shadowOffsetY = -2;

    // stepped plinth (three slabs)
    c.fillRect(112, 880, 800, 60);
    c.fillRect(162, 820, 700, 64);
    c.fillRect(212, 760, 600, 64);

    // four columns
    for (const x of [262, 412, 562, 712]) c.fillRect(x, 560, 50, 204);

    // lower roof: wide slab with upswept eaves (quadratic curves)
    c.beginPath();
    c.moveTo(132, 560);
    c.quadraticCurveTo(212, 540, 512, 528);
    c.quadraticCurveTo(812, 540, 892, 560);
    c.quadraticCurveTo(862, 496, 512, 484);
    c.quadraticCurveTo(162, 496, 132, 560);
    c.closePath();
    c.fill();

    // upper structure
    c.fillRect(352, 376, 320, 108);

    // upper roof, steeper sweep
    c.beginPath();
    c.moveTo(282, 376);
    c.quadraticCurveTo(372, 352, 512, 344);
    c.quadraticCurveTo(652, 352, 742, 376);
    c.quadraticCurveTo(692, 296, 512, 288);
    c.quadraticCurveTo(332, 296, 282, 376);
    c.closePath();
    c.fill();

    // horns rising from the upper roof corners (thick curved strokes)
    c.strokeStyle = '#000000';
    c.lineWidth = 26;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(352, 312);
    c.quadraticCurveTo(282, 200, 318, 96);
    c.stroke();
    c.beginPath();
    c.moveTo(672, 312);
    c.quadraticCurveTo(742, 200, 706, 96);
    c.stroke();
  }));
}
```

`FxTextures` gains `inkBlots: Texture[]` and `shrine: Texture`; `buildFxTextures()` gains:

```ts
    inkBlots: [inkBlotTexture(0.21), inkBlotTexture(0.55), inkBlotTexture(0.88)],
    shrine: shrineTexture(),
```

- [ ] **Step 5: SFX in `src/fx/sfx.ts`** — append before `audioCtxOf` (follow the shield-hum lifecycle pattern exactly for the rumble):

```ts
// Domain slam: sub-bass swell + noise burst through a falling lowpass,
// preceded by a short rising "suck" of bandpassed noise.
export function domainSlam(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;

  // reverse suck (rising bandpass noise into the hit)
  const suckDur = 0.35;
  const suck = ctx.createBuffer(1, Math.floor(ctx.sampleRate * suckDur), ctx.sampleRate);
  const sd = suck.getChannelData(0);
  for (let i = 0; i < sd.length; i++) sd[i] = (Math.random() * 2 - 1) * (i / sd.length);
  const suckSrc = ctx.createBufferSource();
  suckSrc.buffer = suck;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2;
  bp.frequency.setValueAtTime(300, now);
  bp.frequency.exponentialRampToValueAtTime(2400, now + suckDur);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, now);
  sg.gain.exponentialRampToValueAtTime(0.35, now + suckDur);
  suckSrc.connect(bp).connect(sg).connect(ctx.destination);
  suckSrc.start(now);

  // the hit, right after the suck
  const hit = now + suckDur;
  const dur = 0.9;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.8);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, hit);
  lp.frequency.exponentialRampToValueAtTime(180, hit + dur);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.85, hit);
  ng.gain.exponentialRampToValueAtTime(0.001, hit + dur);
  noise.connect(lp).connect(ng).connect(ctx.destination);
  noise.start(hit);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(40, hit);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, hit);
  og.gain.exponentialRampToValueAtTime(0.6, hit + 0.08);
  og.gain.exponentialRampToValueAtTime(0.001, hit + 1.0);
  osc.connect(og).connect(ctx.destination);
  osc.start(hit);
  osc.stop(hit + 1.05);
}

// Low domain drone while active: two detuned triangles through a lowpass.
let rumbleOscA: OscillatorNode | null = null;
let rumbleOscB: OscillatorNode | null = null;
let rumbleGain: GainNode | null = null;

export function domainRumbleStart(): void {
  const ctx = ac();
  if (!ctx || rumbleOscA) return;
  const now = ctx.currentTime;
  rumbleOscA = ctx.createOscillator();
  rumbleOscA.type = 'triangle';
  rumbleOscA.frequency.value = 50;
  rumbleOscB = ctx.createOscillator();
  rumbleOscB.type = 'triangle';
  rumbleOscB.frequency.value = 61;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.0001, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.06, now + 0.8);
  rumbleOscA.connect(lp);
  rumbleOscB.connect(lp);
  lp.connect(rumbleGain).connect(ctx.destination);
  rumbleOscA.start(now);
  rumbleOscB.start(now);
}

export function domainRumbleStop(): void {
  const ctx = audioCtxOf();
  if (ctx && rumbleGain && rumbleOscA && rumbleOscB) {
    const now = ctx.currentTime;
    rumbleGain.gain.cancelScheduledValues(now);
    rumbleGain.gain.setValueAtTime(rumbleGain.gain.value, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    rumbleOscA.stop(now + 0.45);
    rumbleOscB.stop(now + 0.45);
  }
  rumbleOscA = null;
  rumbleOscB = null;
  rumbleGain = null;
}

// Bright slash tick; big slashes are lower and longer.
export function slashTick(big: boolean): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = big ? 0.09 : 0.035;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 6;
  bp.frequency.value = big ? 2500 : 5500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(big ? 0.4 : 0.22, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(now);
}

// Collapse: descending sine + air release.
export function domainCollapse(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.4, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
  osc.connect(og).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.7);

  const dur = 0.5;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.5;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.25, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(hp).connect(ng).connect(ctx.destination);
  noise.start(now);
}
```

- [ ] **Step 6: `npx tsc --noEmit && npm test` — clean + green. Commit** — `git add -A && git commit -m "feat(domain): ink blot geometry/textures, shrine silhouette, domain sfx"`

---

### Task 3: PersonSegmenter + backdrop layer

**Files:**
- Create: `src/segmenter.ts`
- Modify: `src/pixiCompositor.ts`, `src/types.ts`

No unit tests (MediaPipe + texture plumbing; jsdom can't exercise it). Verified by typecheck + headless boot + live test in Task 6.

- [ ] **Step 1: Create `src/segmenter.ts`:**

```ts
import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';
import { Texture } from 'pixi.js';
import type { Camera } from './camera';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

const MASK_SIZE = 256;

// Person segmentation for behind-the-user compositing. Owned by whichever
// effect needs it; runs only between ensureStarted() and stop(). The mask is
// exposed as a live pixi Texture over an offscreen canvas (white where the
// person is, transparent elsewhere) — usable directly as a sprite mask.
export class PersonSegmenter {
  private segmenter: ImageSegmenter | null = null;
  private initPromise: Promise<void> | null = null;
  private failed = false;
  private running = false;
  private canvas: HTMLCanvasElement | null = null;
  private cctx: CanvasRenderingContext2D | null = null;
  private image: ImageData | null = null;
  private texture: Texture | null = null;
  private lastTs = -1;

  constructor(private camera: Camera) {}

  get ready(): boolean { return this.segmenter !== null; }
  get maskTexture(): Texture | null { return this.running ? this.texture : null; }

  // Lazily load the model and begin segmenting (idempotent; safe to spam).
  ensureStarted(): void {
    this.running = true;
    if (this.segmenter || this.failed || this.initPromise) return;
    this.initPromise = this.init().catch(err => {
      console.warn('PersonSegmenter: model failed to load — shrine occlusion disabled', err);
      this.failed = true;
    });
  }

  stop(): void { this.running = false; }

  private async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    try {
      this.segmenter = await this.create(fileset, 'GPU');
    } catch (err) {
      console.warn('PersonSegmenter: GPU delegate failed, falling back to CPU', err);
      this.segmenter = await this.create(fileset, 'CPU');
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = MASK_SIZE;
    this.canvas.height = MASK_SIZE;
    this.cctx = this.canvas.getContext('2d');
    this.image = new ImageData(MASK_SIZE, MASK_SIZE);
    this.texture = Texture.from(this.canvas);
  }

  private create(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>, delegate: 'GPU' | 'CPU'): Promise<ImageSegmenter> {
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  }

  // Call once per rendered frame while running; refreshes maskTexture.
  update(now: number): void {
    if (!this.running || !this.segmenter || !this.cctx || !this.image || !this.texture) return;
    if (now <= this.lastTs) return; // MediaPipe requires monotonic timestamps
    this.lastTs = now;

    const result = this.segmenter.segmentForVideo(this.camera.video, now);
    const mask = result.confidenceMasks?.[0];
    if (mask) {
      const data = mask.getAsFloat32Array();
      // The mask comes at the model's resolution; sample it into our 256² canvas.
      const mw = mask.width, mh = mask.height;
      const px = this.image.data;
      for (let y = 0; y < MASK_SIZE; y++) {
        const sy = Math.floor((y / MASK_SIZE) * mh);
        for (let x = 0; x < MASK_SIZE; x++) {
          const sx = Math.floor((x / MASK_SIZE) * mw);
          const conf = data[sy * mw + sx];
          const i = (y * MASK_SIZE + x) * 4;
          px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
          px[i + 3] = conf > 0.5 ? 255 : 0;
        }
      }
      this.cctx.putImageData(this.image, 0, 0);
      this.texture.source.update();
    }
    result.close();
  }
}
```

NOTE: verify against the installed @mediapipe/tasks-vision .d.ts: `segmentForVideo(video, ts)` sync overload returning `ImageSegmenterResult` (confirmed present), `MPMask.width/height/getAsFloat32Array()` (confirmed), `result.close()` (check it exists — `ImageSegmenterResult` has a `close()` per MediaPipe convention; if it doesn't typecheck, drop the call and note it). Adapt minimally and report.

- [ ] **Step 2: Backdrop layer.** In `src/types.ts`, `EffectStage` gains (after `world`):

```ts
  backdrop: Container;  // behind-the-user layer (between video and effects)
```

In `src/pixiCompositor.ts`: add field `private backdropLayer = new Container();`, change the mount line to `this.world.addChild(this.backdropLayer, this.effectsLayer, this.overlayGfx);` (videoSprite is still addChildAt(…, 0) later, landing under the backdrop), and add `backdrop: this.backdropLayer,` to the `EffectStage` literal in `init()`.

- [ ] **Step 3: `npx tsc --noEmit && npm test`** — clean + green (effects receive the new field; none use it yet).

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(domain): person segmenter + backdrop stage layer"`

---

### Task 4: DomainExpansion effect presenter

**Files:**
- Create: `src/effects/domainExpansion.ts`

No unit tests beyond the cores (presenter; pure logic TDD'd in Tasks 1-2). Typecheck + headless + live.

- [ ] **Step 1: Create `src/effects/domainExpansion.ts`:**

```ts
import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { DomainCore } from './domainCore';
import { isClasped } from '../gesture/clasp';
import { matchTwoHand } from '../gesture/customTriggers';
import { domainSlam, domainRumbleStart, domainRumbleStop, slashTick, domainCollapse } from '../fx/sfx';
import type { PersonSegmenter } from '../segmenter';
import type { Effect, EffectStage, RenderContext, TwoHandTemplate } from '../types';

const BLOT_COUNT = 5;
const BLOT_DELAYS = [0, 0.08, 0.13, 0.19, 0.25]; // per-blot bleed stagger (s of progress-time)
const SLASH_MIN_GAP = 0.12;
const SLASH_MAX_GAP = 0.45;
const SLASH_LIFE = 0.14;
const MAX_SLASHES = 12;
const BIG_SLASH_CHANCE = 0.08;
const CRIMSON = 0xb3122a;

interface Slash { core: Sprite; glow: Sprite; t: number; }

// Sukuna-homage Domain Expansion: hold the two-hand sign to cast; the domain
// bleeds across the frame (ink mask), a horned shrine rises behind the user
// (person segmentation), dismantle slashes flicker until collapse() (X key).
export class DomainExpansion implements Effect {
  id = 'domain-expansion';
  mode = 'toggle' as const; // unused by the driver; self-driven
  enabled = true;
  private core = new DomainCore();
  private signTpl: TwoHandTemplate | null = null;
  private signThreshold: () => number = () => 0.6;
  private mounted = false;
  private stage: EffectStage | null = null;

  // backdrop pieces
  private backdropGroup = new Container();
  private darkWash = new Sprite(Texture.WHITE);
  private shrine: Sprite | null = null;
  private cutout: Sprite | null = null;
  private cutoutMask: Sprite | null = null;

  // screen pieces
  private bleedGroup = new Container();
  private gradeRed = new Sprite(Texture.WHITE);
  private gradeDark = new Sprite(Texture.WHITE);
  private vignette: Sprite | null = null;
  private blotMask = new Container();
  private blots: Sprite[] = [];
  private slashLayer = new Container();
  private slashPool: Slash[] = [];
  private liveSlashes: Slash[] = [];
  private nextSlashIn = 0;
  private castMid = { x: 0.5, y: 0.5 };
  private wasState = 'idle';

  constructor(private segmenter: PersonSegmenter) {}

  setCustomSign(t: TwoHandTemplate | null, getThreshold: () => number = () => 0.6): void {
    this.signTpl = t;
    this.signThreshold = getThreshold;
  }

  collapse(): void { this.core.collapse(); }

  init(stage: EffectStage): void {
    this.stage = stage;

    // backdrop: dark wash + shrine + person cutout (masked by segmentation)
    this.darkWash.tint = 0x12060a;
    this.darkWash.alpha = 0;
    this.shrine = new Sprite(stage.fx.textures.shrine);
    this.shrine.anchor.set(0.5, 1);
    this.shrine.visible = false;
    this.backdropGroup.addChild(this.darkWash, this.shrine);
    stage.backdrop.addChild(this.backdropGroup);
    this.backdropGroup.visible = false;

    // screen: crimson grade group masked by the ink blots, slashes above
    this.gradeDark.tint = 0x000000;
    this.gradeDark.alpha = 0.45;
    this.gradeRed.tint = CRIMSON;
    this.gradeRed.alpha = 0.28;
    this.gradeRed.blendMode = 'multiply';
    this.vignette = new Sprite(stage.fx.textures.vignette);
    this.vignette.alpha = 0.75;
    this.bleedGroup.addChild(this.gradeDark, this.gradeRed, this.vignette);

    for (let i = 0; i < BLOT_COUNT; i++) {
      const blot = new Sprite(stage.fx.textures.inkBlots[i % stage.fx.textures.inkBlots.length]);
      blot.anchor.set(0.5);
      blot.visible = false;
      this.blots.push(blot);
      this.blotMask.addChild(blot);
    }
    this.bleedGroup.mask = this.blotMask;
    this.bleedGroup.visible = false;

    stage.screen.addChild(this.bleedGroup, this.blotMask, this.slashLayer);
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.core.state !== 'idle' && this.core.state !== 'arming'; }

  reset(): void {
    this.core.reset();
    domainRumbleStop();
    this.segmenter.stop();
    if (this.mounted) {
      this.backdropGroup.visible = false;
      this.bleedGroup.visible = false;
      for (const b of this.blots) b.visible = false;
      for (const s of this.liveSlashes) this.recycleSlash(s);
      this.liveSlashes = [];
      this.teardownCutout();
    }
  }

  update(dt: number, ctx: RenderContext): void {
    const signHeld =
      this.enabled && ctx.hands.length >= 2 &&
      (this.signTpl
        ? matchTwoHand(ctx.hands, this.signTpl, this.signThreshold())
        : isClasped(ctx.hands));

    const prev = this.core.state;
    const ev = this.core.step(this.enabled ? signHeld : false, dt);
    const state = this.core.state;

    // capture the cast origin (hands midpoint) the moment casting begins
    if (prev === 'arming' && state === 'casting' && ctx.hands.length >= 2) {
      this.castMid = {
        x: (ctx.hands[0].landmarks[9].x + ctx.hands[1].landmarks[9].x) / 2,
        y: (ctx.hands[0].landmarks[9].y + ctx.hands[1].landmarks[9].y) / 2,
      };
    }

    // lifecycle transitions
    if (ev.slammed && this.stage) {
      domainSlam();
      this.stage.fx.transients.flash(0.5, 0.2, 0xff2222);
      this.stage.fx.transients.ripple(this.castMid.x * ctx.width, this.castMid.y * ctx.height,
        { amplitude: 36, wavelength: 200, speed: 1100, duration: 0.8 });
      this.stage.fx.shake.kick(16);
      domainRumbleStart();
    }
    if (prev === 'idle' && state === 'arming') this.segmenter.ensureStarted();
    if (prev === 'active' && state === 'collapsing') {
      domainCollapse();
      domainRumbleStop();
    }
    if (state === 'idle' && prev !== 'idle') {
      this.segmenter.stop();
      domainRumbleStop(); // belt & braces (reset paths)
    }

    if (state === 'collapsing' || state === 'active' || state === 'casting') {
      this.segmenter.update(ctx.now);
    }

    // slashes only while fully active
    if (state === 'active') {
      this.nextSlashIn -= dt;
      if (this.nextSlashIn <= 0) {
        this.nextSlashIn = SLASH_MIN_GAP + Math.random() * (SLASH_MAX_GAP - SLASH_MIN_GAP);
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) this.spawnSlash(ctx);
      }
    }
    for (const s of this.liveSlashes) s.t += dt;
    this.liveSlashes = this.liveSlashes.filter(s => {
      if (s.t >= SLASH_LIFE) { this.recycleSlash(s); return false; }
      const k = 1 - s.t / SLASH_LIFE;
      s.core.alpha = k;
      s.glow.alpha = 0.6 * k;
      return true;
    });

    if (this.mounted) this.redraw(ctx);
    this.wasState = state;
  }

  private spawnSlash(ctx: RenderContext): void {
    if (this.liveSlashes.length >= MAX_SLASHES || !this.stage) return;
    const big = Math.random() < BIG_SLASH_CHANCE;
    const slash = this.slashPool.pop() ?? this.makeSlash();
    const diag = Math.hypot(ctx.width, ctx.height);
    const len = big ? diag * 1.1 : diag * (0.15 + Math.random() * 0.3);
    const x = ctx.width * (0.1 + Math.random() * 0.8);
    const y = ctx.height * (0.1 + Math.random() * 0.8);
    const ang = Math.random() * Math.PI;
    for (const sp of [slash.core, slash.glow]) {
      sp.position.set(x, y);
      sp.rotation = ang;
      sp.visible = true;
    }
    // streak texture is 64x16; scale x to length, y for thickness
    slash.core.scale.set(len / 64, big ? 0.45 : 0.22);
    slash.glow.scale.set(len / 64, big ? 1.3 : 0.7);
    slash.core.alpha = 1;
    slash.glow.alpha = 0.6;
    slash.t = 0;
    this.liveSlashes.push(slash);
    slashTick(big);
  }

  private makeSlash(): Slash {
    const tex = this.stage!.fx.textures.streak;
    const glow = new Sprite(tex);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = CRIMSON;
    const core = new Sprite(tex);
    core.anchor.set(0.5);
    core.blendMode = 'add';
    core.tint = 0xffffff;
    this.slashLayer.addChild(glow, core);
    return { core, glow, t: 0 };
  }

  private recycleSlash(s: Slash): void {
    s.core.visible = false;
    s.glow.visible = false;
    this.slashPool.push(s);
  }

  private redraw(ctx: RenderContext): void {
    const p = this.core.progress;
    const show = p > 0.001;
    this.backdropGroup.visible = show;
    this.bleedGroup.visible = show;
    if (!show) {
      for (const b of this.blots) b.visible = false;
      this.teardownCutout();
      return;
    }

    const w = ctx.width, h = ctx.height;

    // ink blots: first at the cast midpoint, rest seeded around the frame
    const anchors = [
      this.castMid,
      { x: 0.15, y: 0.2 }, { x: 0.85, y: 0.25 }, { x: 0.2, y: 0.8 }, { x: 0.8, y: 0.75 },
    ];
    // each blot must be able to cover the whole frame alone (diag/512-texture)
    const fullScale = (Math.hypot(w, h) * 1.2) / 512;
    for (let i = 0; i < BLOT_COUNT; i++) {
      const local = Math.max(0, Math.min(1, (p * (1 + BLOT_DELAYS[BLOT_COUNT - 1]) - BLOT_DELAYS[i])));
      const blot = this.blots[i];
      blot.visible = local > 0.001;
      blot.position.set(anchors[i].x * w, anchors[i].y * h);
      blot.scale.set(local * local * fullScale); // ease-in growth
      blot.rotation = i * 1.7 + p * 0.3;
    }

    // grade sprites fill the frame
    for (const s of [this.gradeDark, this.gradeRed]) { s.width = w; s.height = h; }
    if (this.vignette) { this.vignette.width = w; this.vignette.height = h; }

    // backdrop wash + shrine rise behind the user
    this.darkWash.width = w;
    this.darkWash.height = h;
    this.darkWash.alpha = 0.85 * p;
    if (this.shrine) {
      const ease = 1 - Math.pow(1 - p, 3);
      const bob = this.core.state === 'active' ? Math.sin(ctx.now / 900) * 4 : 0;
      this.shrine.visible = true;
      this.shrine.width = w * 0.85;
      this.shrine.scale.y = this.shrine.scale.x;
      const rest = h * 1.12; // bottom ~12% submerged at rest
      this.shrine.position.set(w / 2, h + (rest - h) * 0 + (1 - ease) * this.shrine.height + bob);
      this.shrine.y = rest + (1 - ease) * (this.shrine.height * 0.9) + bob;
    }

    this.syncCutout(w, h);
  }

  // Person cutout: re-renders the user IN FRONT of the shrine, masked live.
  private syncCutout(w: number, h: number): void {
    const maskTex = this.segmenter.maskTexture;
    if (!maskTex || !this.stage) { this.teardownCutout(); return; }

    if (!this.cutout) {
      // find the compositor's video texture via the world's first child
      const video = this.stage.world.children[0] as Sprite;
      if (!(video instanceof Sprite)) return;
      this.cutout = new Sprite(video.texture);
      this.cutout.scale.x = -1; // mirror like the main video sprite
      this.cutoutMask = new Sprite(maskTex);
      this.backdropGroup.addChild(this.cutout, this.cutoutMask);
      this.cutout.mask = this.cutoutMask;
    }
    this.cutout.x = w;
    this.cutout.visible = true;
    if (this.cutoutMask) {
      this.cutoutMask.texture = maskTex;
      // mask canvas is in UNMIRRORED video space; mirror it to match the view
      this.cutoutMask.scale.set(-(w / 256), h / 256);
      this.cutoutMask.x = w;
      this.cutoutMask.visible = true;
    }
  }

  private teardownCutout(): void {
    if (this.cutout) {
      this.cutout.mask = null;
      this.backdropGroup.removeChild(this.cutout);
      this.cutout.destroy(); // sprite only; the video texture belongs to the compositor
      this.cutout = null;
    }
    if (this.cutoutMask) {
      this.backdropGroup.removeChild(this.cutoutMask);
      this.cutoutMask.destroy();
      this.cutoutMask = null;
    }
  }
}
```

IMPLEMENTATION NOTES (resolve while coding, report what you did):
- The shrine `y` math above sets `position` twice — clean that up: compute `this.shrine.y = rest + (1 - ease) * (this.shrine.height * 0.9) + bob;` once (delete the earlier `position.set` line; set `this.shrine.x = w / 2;`).
- `wasState` is written but the transitions all use `prev` — delete the field if unused after cleanup.
- The blot `local` progress formula: verify blots all reach full scale at p=1 (local must hit 1 for the last blot — with the formula above, at p=1: `1*(1.25) - 0.25 = 1` ✓).
- jsdom safety: constructor takes the segmenter; `update()` pre-`init()` must not crash (mounted guard before redraw; core/sfx are safe; `segmenter.update` no-ops while not running). The class is NOT unit-tested but IS constructed in main.ts — it must typecheck and boot headlessly.

- [ ] **Step 2: `npx tsc --noEmit`** — clean (nothing instantiates it yet).

- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(domain): domain expansion presenter (bleed mask, shrine, cutout, slashes)"`

---

### Task 5: Wiring — recorder flow, main.ts, X key

**Files:**
- Modify: `src/recorder.ts`, `src/main.ts`

- [ ] **Step 1: `domainFlow()` in `src/recorder.ts`** (after `beamFlow`):

```ts
export function domainFlow(): RecordFlow {
  return {
    effectId: 'domain-expansion',
    title: 'Record: Domain sign',
    stages: [{ prompt: 'Hold your DOMAIN sign with both hands', handsNeeded: 2 }],
    build: ([cap]) => ({
      kind: 'two-hand',
      effectId: 'domain-expansion',
      left: cap.hands[0],
      right: cap.hands[1],
      span: cap.span ?? 1,
      createdAt: new Date().toISOString(),
    }),
  };
}
```

- [ ] **Step 2: `src/main.ts` wiring:**

(a) Imports: `DomainExpansion` from './effects/domainExpansion', `PersonSegmenter` from './segmenter', `domainFlow` from './recorder' (extend the existing recorder import).

(b) Instances (after the other effects):
```ts
const segmenter = new PersonSegmenter(camera);
const domain = new DomainExpansion(segmenter);
```

(c) `selfDriven` map gains `'domain-expansion': domain,`.

(d) effects array: insert `domain` after `web`, before `pinch`.

(e) CARDS — after the energy-beam card:
```ts
  {
    id: 'domain-expansion', icon: '⛩', name: 'Domain', color: '#ff2d2d',
    desc: 'Hold your <b>two-hand sign</b> ~1s to expand your domain — press <b>X</b> (or Collapse) to end it.',
    bindable: false, customTrigger: 'Default (hands clasped)',
    extra: () => button('⛩ Collapse', () => domain.collapse()),
  },
```

(f) `flowFor()` gains: `if (def.id === 'domain-expansion') return domainFlow();`

(g) `pushCustomTriggers()` gains:
```ts
  const domainTpl = templates.find(t => t.effectId === 'domain-expansion' && t.kind === 'two-hand') as TwoHandTemplate | undefined;
  const domainOn = getChoice('domain-expansion', 'default') === 'custom' && domainTpl;
  domain.setCustomSign(domainOn ? domainTpl : null, () => sensitivity.get('domain-expansion') ?? DEFAULT_THRESHOLD);
```

(h) Card glow in the onFrame hook: add `(id === 'domain-expansion' && domain.isActive()) ||` to the lit chain.

(i) X-key collapse, next to the existing clean-view keydown listener (NOTE: the existing listener handles Escape/c only inside clean view; add a separate listener or extend it — a collapse must work in BOTH views):
```ts
window.addEventListener('keydown', e => {
  if (e.key === 'x' || e.key === 'X') domain.collapse();
});
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit && npm test && npm run build` (151 green; build clean). Headless protocol screenshot (read the PNG — non-black mirrored pattern) + DOM check:
```bash
"$CHROME" --headless=new --enable-unsafe-swiftshader --user-data-dir=/tmp/chrome-headless --virtual-time-budget=8000 --dump-dom "http://localhost:$PORT/" | grep -o 'Domain\|Collapse' | sort | uniq -c
```
Expect both names present.

- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(ui): domain expansion card, X-key collapse, custom sign wiring"`

---

### Task 6: README + final battery + live handoff

**Files:**
- Modify: `README.md`

- [ ] **Step 1: README edits:**

(a) Step-3 bullet list (after the Kamehameha bullet):
```markdown
- **⛩ Domain** is *automatic* — hold a **two-hand clasped sign** for ~1 second and your
  domain expands: reality bleeds away, a shrine rises behind you, and dismantle slashes
  rip across the frame until you press **X** (or the **⛩ Collapse** button). Record your
  own sign with Trigger → ✎ Custom.
```

(b) Heads-up note after the existing Dim warning:
```markdown
> **Heads-up:** a clasped sign sits inside the 🌀 Kamehameha's "palms together" zone —
> if both are enabled and they fight, record distinct custom signs for one (or both),
> or disable the one you're not using.
```

(c) Intro paragraph: extend the effect list with "expand a cursed domain".

(d) Module table additions:
```markdown
| `src/effects/domainCore.ts` / `domainExpansion.ts` | Domain cast state machine / presenter |
| `src/segmenter.ts` | MediaPipe person segmentation (behind-you compositing) |
| `src/fx/inkBlot.ts` | Seeded ink-blot geometry (domain bleed mask) |
```

- [ ] **Step 2: Full battery** — `npx tsc --noEmit && npm test && npm run build` + headless screenshot + Domain/Collapse DOM grep. All green.

- [ ] **Step 3: Commit** — `git add -A && git commit -m "docs: domain expansion README"`

- [ ] **Step 4: Live handoff** — user tests on camera: clasp-cast (arm ~0.6s → slam → bleed → shrine behind them → slashes), X / Collapse button, custom sign recording via the wizard, kamehameha coexistence, FPS while segmenting. Tuning expectations: shrine proportions, crimson intensity, slash density, clasp threshold.

---

## Self-review notes (already applied)

- **Spec coverage:** §2 trigger (clasp predicate T1, custom sign T5(f)/(g), arming in core T1, overlap doc T6); §3 state machine T1 (with the event-design resolution note); §4.1 backdrop layer T3; §4.2 segmentation T3 + cutout in T4; §4.3 ink bleed T2 (geometry/texture) + T4 (mask presenter); §4.4 shrine T2 (texture) + T4 (rise); §4.5 slashes T4 (pooled sprites — chose the dedicated pool over FxParticles per the spec's own caveat); §4.6 sfx T2; §5 UI T5; §6 testing T1/T2 (slash scheduler intentionally inline — randomized bounds are visually tuned, low test value; deviation from spec's "if extracted" hedge); §7 perf (mask 256², slashes capped, lazy canvas); §8 reference image (no task — optional follow-up by design).
- **Type consistency:** `DomainCore.step(signHeld, dt)`/`collapse()`/`progress` consistent between T1 and T4; `PersonSegmenter.ensureStarted/stop/update/maskTexture/ready` between T3 and T4; `EffectStage.backdrop` between T3 and T4; `setCustomSign` between T4 and T5(g); `domainFlow` between T5(a) and (f).
- **Known judgment calls for the implementer:** the `collapsed` event removal (T1 note), shrine y-math cleanup (T4 note), `result.close()` availability (T3 note). Each is flagged in-place with the resolution.
