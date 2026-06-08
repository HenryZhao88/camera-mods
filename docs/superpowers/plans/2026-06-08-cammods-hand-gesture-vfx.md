# CamMods — Hand-Gesture VFX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local web app that shows your webcam with real-time effects triggered by hand gestures you calibrate yourself, capturable in OBS → Virtual Camera for video calls.

**Architecture:** A pipeline — Camera → HandTracker (MediaPipe) → GestureEngine (template matching) → EffectDriver → Effects → Compositor (canvas). Pure logic (normalization, distance scoring, gesture gating, storage, effect lifecycle) is unit-tested; camera/tracking/rendering are verified live.

**Tech Stack:** Vite + TypeScript, MediaPipe Tasks Vision (Hand Landmarker), Canvas 2D, Vitest (jsdom).

---

## File Structure

- `index.html` — app shell
- `src/main.ts` — entry, wires everything + UI
- `src/types.ts` — shared types (`Landmark`, `HandResult`, `GestureTemplate`, effect types)
- `src/gesture/normalize.ts` — `normalizeLandmarks` (pure, tested)
- `src/gesture/distance.ts` — `landmarkDistance` (pure, tested)
- `src/gesture/gestureEngine.ts` — `GestureEngine` (tested)
- `src/gesture/templateStore.ts` — localStorage + export/import (tested)
- `src/effects/effectDriver.ts` — maps engine output → effect lifecycle (tested)
- `src/effects/particleSystem.ts` — shared particles (tested)
- `src/effects/fingertipLightning.ts`, `dimLights.ts`, `palmBlast.ts`, `pinchDraw.ts` — effects
- `src/camera.ts` — webcam capture
- `src/handTracker.ts` — MediaPipe wrapper
- `src/compositor.ts` — render loop
- `src/calibration.ts` — calibration flow
- `tests/*.test.ts` — unit tests
- `README.md` — setup + OBS virtual camera instructions

---

## Task 1: Project scaffold + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `index.html`, `src/main.ts`, `.gitignore` (already exists — verify)

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "cammods",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "^0.10.14"
  },
  "devDependencies": {
    "typescript": "^5.4.0",
    "vite": "^5.2.0",
    "vitest": "^1.6.0",
    "jsdom": "^24.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUnusedLocals": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "skipLibCheck": true,
    "types": ["vitest/globals"]
  },
  "include": ["src", "tests"]
}
```

- [ ] **Step 3: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
export default defineConfig({ server: { port: 5173 } });
```

- [ ] **Step 4: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { globals: true, environment: 'jsdom' },
});
```

- [ ] **Step 5: Create `index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CamMods</title>
    <style>
      body { margin: 0; background: #111; color: #eee; font-family: system-ui, sans-serif; }
      #stage { position: relative; width: 960px; max-width: 100%; margin: 0 auto; }
      #view { width: 100%; display: block; background: #000; border-radius: 8px; }
      #ui { padding: 12px; max-width: 960px; margin: 0 auto; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
      button { background: #2a2a2a; color: #eee; border: 1px solid #444; padding: 8px 12px; border-radius: 6px; cursor: pointer; }
      button:hover { background: #3a3a3a; }
      #status { font-size: 13px; opacity: 0.8; margin-left: auto; }
    </style>
  </head>
  <body>
    <div id="stage"><canvas id="view"></canvas></div>
    <div id="ui"></div>
    <script type="module" src="/src/main.ts"></script>
  </body>
</html>
```

- [ ] **Step 6: Create placeholder `src/main.ts`**

```ts
console.log('CamMods booting');
```

- [ ] **Step 7: Install and verify build tooling**

Run: `npm install`
Expected: dependencies install without errors.

Run: `npm run build`
Expected: build succeeds, produces `dist/`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite + TS + Vitest project"
```

---

## Task 2: Core types + landmark normalization (TDD)

**Files:**
- Create: `src/types.ts`, `src/gesture/normalize.ts`, `tests/normalize.test.ts`

- [ ] **Step 1: Create `src/types.ts`**

```ts
export interface Landmark { x: number; y: number; z: number; }
export type HandLandmarks = Landmark[]; // 21 points

export type Handedness = 'Left' | 'Right';

export interface HandResult {
  landmarks: HandLandmarks; // normalized image coords, 0..1, already mirrored for display
  handedness: Handedness;
}

export interface GestureTemplate {
  effectId: string;
  landmarks: HandLandmarks; // normalized via normalizeLandmarks
  handedness: Handedness;
  createdAt: string;
}
```

- [ ] **Step 2: Write the failing test `tests/normalize.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeLandmarks } from '../src/gesture/normalize';
import type { HandLandmarks } from '../src/types';

function shape(): HandLandmarks {
  return Array.from({ length: 21 }, (_, i) => ({ x: i * 0.01, y: (i % 5) * 0.02, z: 0 }));
}
function close(a: HandLandmarks, b: HandLandmarks, eps = 1e-9) {
  return a.every((p, i) => Math.abs(p.x - b[i].x) < eps && Math.abs(p.y - b[i].y) < eps);
}

describe('normalizeLandmarks', () => {
  it('is translation invariant', () => {
    const base = shape();
    const shifted = base.map(p => ({ x: p.x + 5, y: p.y - 3, z: 0 }));
    expect(close(normalizeLandmarks(base), normalizeLandmarks(shifted))).toBe(true);
  });

  it('is scale invariant', () => {
    const base = shape();
    const scaled = base.map(p => ({ x: p.x * 4, y: p.y * 4, z: 0 }));
    expect(close(normalizeLandmarks(base), normalizeLandmarks(scaled))).toBe(true);
  });

  it('produces points centered near origin', () => {
    const out = normalizeLandmarks(shape());
    const cx = out.reduce((s, p) => s + p.x, 0) / out.length;
    const cy = out.reduce((s, p) => s + p.y, 0) / out.length;
    expect(Math.abs(cx)).toBeLessThan(1e-9);
    expect(Math.abs(cy)).toBeLessThan(1e-9);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/normalize.test.ts`
Expected: FAIL — cannot find module `normalize`.

- [ ] **Step 4: Implement `src/gesture/normalize.ts`**

```ts
import type { HandLandmarks } from '../types';

// Translation + scale invariant: center on centroid, scale by RMS distance.
// Uses x,y only (MediaPipe z is noisy); z is zeroed in the output.
export function normalizeLandmarks(landmarks: HandLandmarks): HandLandmarks {
  const n = landmarks.length;
  let cx = 0, cy = 0;
  for (const p of landmarks) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;

  let sumSq = 0;
  for (const p of landmarks) {
    const dx = p.x - cx, dy = p.y - cy;
    sumSq += dx * dx + dy * dy;
  }
  const scale = Math.sqrt(sumSq / n) || 1;

  return landmarks.map(p => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale, z: 0 }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/normalize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/gesture/normalize.ts tests/normalize.test.ts
git commit -m "feat: add landmark normalization"
```

---

## Task 3: Landmark distance scoring (TDD)

**Files:**
- Create: `src/gesture/distance.ts`, `tests/distance.test.ts`

- [ ] **Step 1: Write the failing test `tests/distance.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { landmarkDistance } from '../src/gesture/distance';
import type { HandLandmarks } from '../src/types';

const a: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: i, y: 0, z: 0 }));

describe('landmarkDistance', () => {
  it('is zero for identical poses', () => {
    expect(landmarkDistance(a, a)).toBeCloseTo(0, 9);
  });

  it('grows as poses diverge', () => {
    const near = a.map(p => ({ x: p.x + 0.1, y: 0, z: 0 }));
    const far = a.map(p => ({ x: p.x + 1.0, y: 0, z: 0 }));
    expect(landmarkDistance(a, near)).toBeLessThan(landmarkDistance(a, far));
  });

  it('throws on length mismatch', () => {
    expect(() => landmarkDistance(a, a.slice(0, 5))).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/distance.test.ts`
Expected: FAIL — cannot find module `distance`.

- [ ] **Step 3: Implement `src/gesture/distance.ts`**

```ts
import type { HandLandmarks } from '../types';

// Mean per-point euclidean distance (x,y). Lower = more similar.
export function landmarkDistance(a: HandLandmarks, b: HandLandmarks): number {
  if (a.length !== b.length) throw new Error('landmark length mismatch');
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum / a.length;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/distance.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/gesture/distance.ts tests/distance.test.ts
git commit -m "feat: add landmark distance scoring"
```

---

## Task 4: GestureEngine (TDD)

**Files:**
- Create: `src/gesture/gestureEngine.ts`, `tests/gestureEngine.test.ts`

- [ ] **Step 1: Write the failing test `tests/gestureEngine.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { GestureEngine } from '../src/gesture/gestureEngine';
import { normalizeLandmarks } from '../src/gesture/normalize';
import type { GestureTemplate, HandLandmarks } from '../src/types';

const poseA: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.01, y: 0, z: 0 }));
const poseB: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: 0, y: i * 0.01, z: 0 }));

const template: GestureTemplate = {
  effectId: 'fx', landmarks: normalizeLandmarks(poseA), handedness: 'Right', createdAt: 'now',
};

describe('GestureEngine', () => {
  it('fires when a matching pose is seen', () => {
    const e = new GestureEngine([template], { cooldownMs: 800, defaultThreshold: 0.6 });
    const r = e.update(poseA, 0);
    expect(r.fired).toContain('fx');
    expect(r.active.has('fx')).toBe(true);
  });

  it('does not fire for a different pose', () => {
    const e = new GestureEngine([template], { cooldownMs: 800, defaultThreshold: 0.6 });
    const r = e.update(poseB, 0);
    expect(r.fired).not.toContain('fx');
    expect(r.active.has('fx')).toBe(false);
  });

  it('respects cooldown but keeps active state', () => {
    const e = new GestureEngine([template], { cooldownMs: 800, defaultThreshold: 0.6 });
    expect(e.update(poseA, 0).fired).toContain('fx');
    const mid = e.update(poseA, 400);
    expect(mid.fired).not.toContain('fx');
    expect(mid.active.has('fx')).toBe(true);
    expect(e.update(poseA, 900).fired).toContain('fx');
  });

  it('returns nothing when no hand present', () => {
    const e = new GestureEngine([template], {});
    const r = e.update(null, 0);
    expect(r.fired).toHaveLength(0);
    expect(r.active.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/gestureEngine.test.ts`
Expected: FAIL — cannot find module `gestureEngine`.

- [ ] **Step 3: Implement `src/gesture/gestureEngine.ts`**

```ts
import { normalizeLandmarks } from './normalize';
import { landmarkDistance } from './distance';
import type { GestureTemplate, HandLandmarks } from '../types';

export interface GestureEngineResult {
  fired: string[];
  active: Set<string>;
  scores: Record<string, number>;
}

export interface GestureEngineOptions {
  defaultThreshold?: number; // max distance counted as a match (default 0.6)
  cooldownMs?: number;       // min ms between fires per effect (default 800)
}

export class GestureEngine {
  private templates: GestureTemplate[];
  private defaultThreshold: number;
  private cooldownMs: number;
  private thresholds = new Map<string, number>();
  private lastFired = new Map<string, number>();

  constructor(templates: GestureTemplate[], opts: GestureEngineOptions = {}) {
    this.templates = templates;
    this.defaultThreshold = opts.defaultThreshold ?? 0.6;
    this.cooldownMs = opts.cooldownMs ?? 800;
  }

  setTemplates(t: GestureTemplate[]): void { this.templates = t; }
  setThreshold(effectId: string, value: number): void { this.thresholds.set(effectId, value); }
  private thresholdFor(id: string): number {
    return this.thresholds.get(id) ?? this.defaultThreshold;
  }

  update(live: HandLandmarks | null, now: number): GestureEngineResult {
    const fired: string[] = [];
    const active = new Set<string>();
    const scores: Record<string, number> = {};
    if (!live) return { fired, active, scores };

    const norm = normalizeLandmarks(live);
    for (const t of this.templates) {
      const d = landmarkDistance(norm, t.landmarks);
      scores[t.effectId] = d;
      if (d <= this.thresholdFor(t.effectId)) {
        active.add(t.effectId);
        const last = this.lastFired.get(t.effectId) ?? -Infinity;
        if (now - last >= this.cooldownMs) {
          fired.push(t.effectId);
          this.lastFired.set(t.effectId, now);
        }
      }
    }
    return { fired, active, scores };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/gestureEngine.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/gesture/gestureEngine.ts tests/gestureEngine.test.ts
git commit -m "feat: add gesture engine with threshold + cooldown"
```

---

## Task 5: templateStore (TDD)

**Files:**
- Create: `src/gesture/templateStore.ts`, `tests/templateStore.test.ts`

- [ ] **Step 1: Write the failing test `tests/templateStore.test.ts`**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveTemplate, loadTemplates, clearTemplates, exportTemplates, importTemplates,
} from '../src/gesture/templateStore';
import type { GestureTemplate } from '../src/types';

const mk = (effectId: string): GestureTemplate => ({
  effectId,
  landmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
  handedness: 'Right',
  createdAt: '2026-06-08',
});

describe('templateStore', () => {
  beforeEach(() => clearTemplates());

  it('saves and loads a template', () => {
    saveTemplate(mk('a'));
    const all = loadTemplates();
    expect(all).toHaveLength(1);
    expect(all[0].effectId).toBe('a');
  });

  it('overwrites a template with the same effectId', () => {
    saveTemplate(mk('a'));
    saveTemplate(mk('a'));
    expect(loadTemplates()).toHaveLength(1);
  });

  it('round-trips through export/import', () => {
    saveTemplate(mk('a'));
    saveTemplate(mk('b'));
    const json = exportTemplates();
    clearTemplates();
    expect(loadTemplates()).toHaveLength(0);
    importTemplates(json);
    expect(loadTemplates().map(t => t.effectId).sort()).toEqual(['a', 'b']);
  });

  it('returns [] when storage is empty', () => {
    expect(loadTemplates()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/templateStore.test.ts`
Expected: FAIL — cannot find module `templateStore`.

- [ ] **Step 3: Implement `src/gesture/templateStore.ts`**

```ts
import type { GestureTemplate } from '../types';

const KEY = 'cammods.templates';

export function loadTemplates(): GestureTemplate[] {
  const raw = localStorage.getItem(KEY);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as GestureTemplate[]) : [];
  } catch {
    return [];
  }
}

export function saveTemplate(t: GestureTemplate): void {
  const all = loadTemplates().filter(x => x.effectId !== t.effectId);
  all.push(t);
  localStorage.setItem(KEY, JSON.stringify(all));
}

export function clearTemplates(): void {
  localStorage.removeItem(KEY);
}

export function exportTemplates(): string {
  return JSON.stringify(loadTemplates(), null, 2);
}

export function importTemplates(json: string): GestureTemplate[] {
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('invalid templates file');
  localStorage.setItem(KEY, JSON.stringify(parsed));
  return parsed as GestureTemplate[];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/templateStore.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/gesture/templateStore.ts tests/templateStore.test.ts
git commit -m "feat: add template storage with export/import"
```

---

## Task 6: EffectDriver (TDD)

The driver maps `GestureEngineResult` into effect lifecycle calls based on each effect's `mode`.

**Files:**
- Create: `src/effects/effectDriver.ts`, `tests/effectDriver.test.ts`

- [ ] **Step 1: Write the failing test `tests/effectDriver.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { EffectDriver, type DriverEffect } from '../src/effects/effectDriver';

function fake(id: string, mode: DriverEffect['mode']) {
  const calls = { start: 0, stop: 0 };
  const effect: DriverEffect = {
    id, mode,
    start: () => { calls.start++; },
    stop: () => { calls.stop++; },
  };
  return { effect, calls };
}

describe('EffectDriver', () => {
  it('oneshot effects start only on fired', () => {
    const a = fake('boom', 'oneshot');
    const d = new EffectDriver([a.effect]);
    d.apply([], new Set());
    expect(a.calls.start).toBe(0);
    d.apply(['boom'], new Set(['boom']));
    expect(a.calls.start).toBe(1);
  });

  it('hold effects start on enter and stop on leave, once each', () => {
    const a = fake('hold', 'hold');
    const d = new EffectDriver([a.effect]);
    d.apply([], new Set(['hold'])); // enter
    d.apply([], new Set(['hold'])); // still held
    expect(a.calls.start).toBe(1);
    expect(a.calls.stop).toBe(0);
    d.apply([], new Set());          // leave
    expect(a.calls.stop).toBe(1);
  });

  it('toggle effects start on each fired', () => {
    const a = fake('toggle', 'toggle');
    const d = new EffectDriver([a.effect]);
    d.apply(['toggle'], new Set(['toggle']));
    d.apply([], new Set(['toggle']));        // held, no new fire
    d.apply(['toggle'], new Set(['toggle'])); // fired again (after cooldown)
    expect(a.calls.start).toBe(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/effectDriver.test.ts`
Expected: FAIL — cannot find module `effectDriver`.

- [ ] **Step 3: Implement `src/effects/effectDriver.ts`**

```ts
export type EffectMode = 'hold' | 'toggle' | 'oneshot';

export interface DriverEffect {
  id: string;
  mode: EffectMode;
  start(): void;
  stop(): void;
}

export class EffectDriver {
  private wasActive = new Set<string>();

  constructor(private effects: DriverEffect[]) {}

  apply(fired: string[], active: Set<string>): void {
    for (const e of this.effects) {
      if (e.mode === 'hold') {
        const isNow = active.has(e.id);
        const was = this.wasActive.has(e.id);
        if (isNow && !was) e.start();
        if (!isNow && was) e.stop();
      } else if (fired.includes(e.id)) {
        e.start(); // oneshot + toggle both react to the edge fire
      }
    }
    this.wasActive = new Set(active);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/effectDriver.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/effects/effectDriver.ts tests/effectDriver.test.ts
git commit -m "feat: add effect driver lifecycle mapping"
```

---

## Task 7: ParticleSystem (TDD)

**Files:**
- Create: `src/effects/particleSystem.ts`, `tests/particleSystem.test.ts`

- [ ] **Step 1: Write the failing test `tests/particleSystem.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { ParticleSystem } from '../src/effects/particleSystem';

describe('ParticleSystem', () => {
  it('tracks spawned particles', () => {
    const ps = new ParticleSystem();
    ps.spawn({ x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, size: 2, color: '#fff' });
    expect(ps.count).toBe(1);
  });

  it('moves particles and expires them', () => {
    const ps = new ParticleSystem();
    ps.spawn({ x: 0, y: 0, vx: 10, vy: 0, life: 1, maxLife: 1, size: 2, color: '#fff' });
    ps.update(0.5);
    expect(ps.particles[0].x).toBeCloseTo(5, 6);
    ps.update(0.6); // total 1.1 > life
    expect(ps.count).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/particleSystem.test.ts`
Expected: FAIL — cannot find module `particleSystem`.

- [ ] **Step 3: Implement `src/effects/particleSystem.ts`**

```ts
export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
}

export class ParticleSystem {
  particles: Particle[] = [];

  spawn(p: Particle): void { this.particles.push({ ...p }); }

  update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  render(g: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.maxLife);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  get count(): number { return this.particles.length; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/particleSystem.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/effects/particleSystem.ts tests/particleSystem.test.ts
git commit -m "feat: add particle system"
```

---

## Task 8: Effect interface + four effects

These render to canvas and are verified live in Task 14. Code is complete here.

**Files:**
- Modify: `src/types.ts` (add `Effect` + `RenderContext`)
- Create: `src/effects/fingertipLightning.ts`, `src/effects/dimLights.ts`, `src/effects/palmBlast.ts`, `src/effects/pinchDraw.ts`

- [ ] **Step 1: Append effect types to `src/types.ts`**

```ts
import type { EffectMode } from './effects/effectDriver';

export interface RenderContext {
  width: number;
  height: number;
  hand: HandResult | null; // primary hand this frame
  now: number;             // ms
}

export interface Effect {
  id: string;
  mode: EffectMode;
  start(): void;
  stop(): void;
  update(dt: number, ctx: RenderContext): void;
  render(g: CanvasRenderingContext2D, ctx: RenderContext): void;
  isActive(): boolean;
}
```

- [ ] **Step 2: Create `src/effects/fingertipLightning.ts`**

```ts
import { ParticleSystem } from './particleSystem';
import type { Effect, RenderContext } from '../types';

const TIPS = [4, 8, 12, 16, 20]; // thumb..pinky tips

export class FingertipLightning implements Effect {
  id = 'fingertip-lightning';
  mode = 'hold' as const;
  private held = false;
  private ps = new ParticleSystem();

  start(): void { this.held = true; }
  stop(): void { this.held = false; }
  isActive(): boolean { return this.held || this.ps.count > 0; }

  update(dt: number, ctx: RenderContext): void {
    if (this.held && ctx.hand) {
      for (const i of TIPS) {
        const p = ctx.hand.landmarks[i];
        const x = p.x * ctx.width, y = p.y * ctx.height;
        for (let k = 0; k < 3; k++) {
          const ang = Math.random() * Math.PI * 2;
          const sp = 40 + Math.random() * 140;
          this.ps.spawn({
            x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
            life: 0.5, maxLife: 0.5, size: 2 + Math.random() * 3,
            color: Math.random() < 0.5 ? '#7df9ff' : '#ffae00',
          });
        }
      }
    }
    this.ps.update(dt);
  }

  render(g: CanvasRenderingContext2D): void {
    g.save();
    g.globalCompositeOperation = 'lighter';
    this.ps.render(g);
    g.restore();
  }
}
```

- [ ] **Step 3: Create `src/effects/dimLights.ts`**

```ts
import type { Effect, RenderContext } from '../types';

export class DimLights implements Effect {
  id = 'dim-lights';
  mode = 'toggle' as const;
  private on = false;

  start(): void { this.on = !this.on; }
  stop(): void {}
  isActive(): boolean { return this.on; }
  update(): void {}

  render(g: CanvasRenderingContext2D, ctx: RenderContext): void {
    if (!this.on) return;
    const { width: w, height: h } = ctx;
    const grad = g.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.2,
      w / 2, h / 2, Math.max(w, h) * 0.7,
    );
    grad.addColorStop(0, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0.92)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
}
```

- [ ] **Step 4: Create `src/effects/palmBlast.ts`**

```ts
import { ParticleSystem } from './particleSystem';
import type { Effect, RenderContext } from '../types';

const DURATION = 0.6; // seconds

export class PalmBlast implements Effect {
  id = 'palm-blast';
  mode = 'oneshot' as const;
  private pending = false;
  private t = -1;
  private cx = 0;
  private cy = 0;
  private ps = new ParticleSystem();

  start(): void { this.pending = true; }
  stop(): void {}
  isActive(): boolean { return (this.t >= 0 && this.t < DURATION) || this.ps.count > 0; }

  update(dt: number, ctx: RenderContext): void {
    if (this.pending) {
      this.pending = false;
      this.t = 0;
      if (ctx.hand) {
        const p = ctx.hand.landmarks[9]; // middle-finger base ~ palm center
        this.cx = p.x * ctx.width;
        this.cy = p.y * ctx.height;
      } else {
        this.cx = ctx.width / 2;
        this.cy = ctx.height / 2;
      }
      for (let k = 0; k < 70; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 200 + Math.random() * 450;
        this.ps.spawn({
          x: this.cx, y: this.cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          life: 0.5, maxLife: 0.5, size: 2 + Math.random() * 4, color: '#ffd27d',
        });
      }
    }
    if (this.t >= 0) this.t += dt;
    this.ps.update(dt);
  }

  render(g: CanvasRenderingContext2D, ctx: RenderContext): void {
    if (this.t >= 0 && this.t < DURATION) {
      const p = this.t / DURATION;
      g.save();
      g.globalAlpha = Math.max(0, 0.6 * (1 - p * 3));
      g.fillStyle = '#fff';
      g.fillRect(0, 0, ctx.width, ctx.height);
      g.restore();

      const r = p * Math.max(ctx.width, ctx.height) * 0.8;
      g.save();
      g.globalCompositeOperation = 'lighter';
      g.strokeStyle = `rgba(255,210,125,${1 - p})`;
      g.lineWidth = 14 * (1 - p);
      g.beginPath();
      g.arc(this.cx, this.cy, r, 0, Math.PI * 2);
      g.stroke();
      g.restore();
    }
    g.save();
    g.globalCompositeOperation = 'lighter';
    this.ps.render(g);
    g.restore();
  }
}
```

- [ ] **Step 5: Create `src/effects/pinchDraw.ts`**

```ts
import type { Effect, RenderContext } from '../types';

interface Pt { x: number; y: number; }

export class PinchDraw implements Effect {
  id = 'pinch-draw';
  mode = 'hold' as const;
  private drawing = false;
  private strokes: Pt[][] = [];
  private current: Pt[] = [];

  start(): void { this.drawing = true; this.current = []; this.strokes.push(this.current); }
  stop(): void { this.drawing = false; }
  isActive(): boolean { return this.strokes.length > 0; }
  clear(): void { this.strokes = []; this.current = []; }

  update(_dt: number, ctx: RenderContext): void {
    if (this.drawing && ctx.hand) {
      const p = ctx.hand.landmarks[8]; // index fingertip
      this.current.push({ x: p.x * ctx.width, y: p.y * ctx.height });
    }
  }

  render(g: CanvasRenderingContext2D): void {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowBlur = 12;
    g.shadowColor = '#39ff14';
    g.strokeStyle = '#39ff14';
    g.lineWidth = 5;
    for (const s of this.strokes) {
      if (s.length < 2) continue;
      g.beginPath();
      g.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) g.lineTo(s[i].x, s[i].y);
      g.stroke();
    }
    g.restore();
  }
}
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/types.ts src/effects/fingertipLightning.ts src/effects/dimLights.ts src/effects/palmBlast.ts src/effects/pinchDraw.ts
git commit -m "feat: add four v1 effects"
```

---

## Task 9: Camera

**Files:**
- Create: `src/camera.ts`

- [ ] **Step 1: Create `src/camera.ts`**

```ts
export class Camera {
  readonly video: HTMLVideoElement;

  constructor() {
    this.video = document.createElement('video');
    this.video.playsInline = true;
    this.video.muted = true;
  }

  async start(): Promise<void> {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: false,
      });
    } catch (err) {
      throw new Error(`Camera access failed: ${(err as Error).message}`);
    }
    this.video.srcObject = stream;
    await this.video.play();
    await new Promise<void>(resolve => {
      if (this.video.readyState >= 2) return resolve();
      this.video.onloadeddata = () => resolve();
    });
  }

  stop(): void {
    const stream = this.video.srcObject as MediaStream | null;
    stream?.getTracks().forEach(t => t.stop());
    this.video.srcObject = null;
  }

  get width(): number { return this.video.videoWidth; }
  get height(): number { return this.video.videoHeight; }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/camera.ts
git commit -m "feat: add webcam capture"
```

---

## Task 10: HandTracker (MediaPipe)

Wraps MediaPipe Hand Landmarker. Mirrors landmark x to match the mirrored selfie display.

**Files:**
- Create: `src/handTracker.ts`

- [ ] **Step 1: Create `src/handTracker.ts`**

```ts
import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { HandResult, Handedness } from './types';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandTracker {
  private landmarker: HandLandmarker | null = null;

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  }

  // Returns hands with x mirrored to match a mirrored selfie-view canvas.
  detect(video: HTMLVideoElement, now: number): HandResult[] {
    if (!this.landmarker) throw new Error('HandTracker not initialized');
    const res = this.landmarker.detectForVideo(video, now);
    const out: HandResult[] = [];
    for (let i = 0; i < res.landmarks.length; i++) {
      const lm = res.landmarks[i];
      const handed = (res.handednesses?.[i]?.[0]?.categoryName ?? 'Right') as Handedness;
      out.push({
        landmarks: lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z })),
        // mirrored view also flips reported handedness
        handedness: handed === 'Left' ? 'Right' : 'Left',
      });
    }
    return out;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/handTracker.ts
git commit -m "feat: add MediaPipe hand tracker"
```

---

## Task 11: Compositor

Owns the render loop: draws the mirrored video, runs the engine + driver, updates and renders active effects.

**Files:**
- Create: `src/compositor.ts`

- [ ] **Step 1: Create `src/compositor.ts`**

```ts
import type { Camera } from './camera';
import type { HandTracker } from './handTracker';
import type { GestureEngine } from './gesture/gestureEngine';
import { EffectDriver } from './effects/effectDriver';
import type { Effect, HandResult, RenderContext } from './types';

export interface CompositorHooks {
  onFrame?: (hand: HandResult | null, scores: Record<string, number>, fired: string[]) => void;
}

export class Compositor {
  private g: CanvasRenderingContext2D;
  private driver: EffectDriver;
  private raf = 0;
  private last = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
    private tracker: HandTracker,
    private engine: GestureEngine,
    private effects: Effect[],
    private hooks: CompositorHooks = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.g = ctx;
    this.driver = new EffectDriver(effects);
  }

  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void { cancelAnimationFrame(this.raf); }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    const w = this.camera.width, h = this.camera.height;
    if (!w || !h) return;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    const hands = this.tracker.detect(this.camera.video, now);
    const hand = hands[0] ?? null;
    const ctx: RenderContext = { width: w, height: h, hand, now };

    const result = this.engine.update(hand ? hand.landmarks : null, now);
    this.driver.apply(result.fired, result.active);
    this.hooks.onFrame?.(hand, result.scores, result.fired);

    // mirrored selfie-view video
    this.g.save();
    this.g.translate(w, 0);
    this.g.scale(-1, 1);
    this.g.drawImage(this.camera.video, 0, 0, w, h);
    this.g.restore();

    for (const e of this.effects) {
      if (e.isActive()) {
        e.update(dt, ctx);
        e.render(this.g, ctx);
      }
    }
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/compositor.ts
git commit -m "feat: add compositor render loop"
```

---

## Task 12: Calibration flow

Captures a normalized gesture template for an effect, averaged over several frames.

**Files:**
- Create: `src/calibration.ts`

- [ ] **Step 1: Create `src/calibration.ts`**

```ts
import type { Camera } from './camera';
import type { HandTracker } from './handTracker';
import { normalizeLandmarks } from './gesture/normalize';
import { saveTemplate } from './gesture/templateStore';
import type { GestureTemplate, HandLandmarks, Handedness } from './types';

const CAPTURE_FRAMES = 10;

// Averages CAPTURE_FRAMES of normalized landmarks into one stable template.
export async function calibrate(
  effectId: string,
  camera: Camera,
  tracker: HandTracker,
): Promise<GestureTemplate> {
  const frames: HandLandmarks[] = [];
  let handedness: Handedness = 'Right';

  while (frames.length < CAPTURE_FRAMES) {
    await new Promise(r => requestAnimationFrame(r));
    const hands = tracker.detect(camera.video, performance.now());
    if (hands[0]) {
      frames.push(normalizeLandmarks(hands[0].landmarks));
      handedness = hands[0].handedness;
    }
  }

  const avg: HandLandmarks = Array.from({ length: 21 }, (_, i) => {
    let x = 0, y = 0;
    for (const f of frames) { x += f[i].x; y += f[i].y; }
    return { x: x / frames.length, y: y / frames.length, z: 0 };
  });

  const template: GestureTemplate = {
    effectId, landmarks: avg, handedness, createdAt: new Date().toISOString(),
  };
  saveTemplate(template);
  return template;
}

export function countdown(seconds: number, onTick: (n: number) => void): Promise<void> {
  return new Promise(resolve => {
    let n = seconds;
    onTick(n);
    const id = setInterval(() => {
      n -= 1;
      onTick(n);
      if (n <= 0) { clearInterval(id); resolve(); }
    }, 1000);
  });
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/calibration.ts
git commit -m "feat: add gesture calibration flow"
```

---

## Task 13: UI shell + main wiring

Wires everything: Start, per-effect Calibrate buttons, Live toggle, Clear drawing, sensitivity slider, export/import.

**Files:**
- Modify: `src/main.ts` (replace placeholder)

- [ ] **Step 1: Replace `src/main.ts`**

```ts
import { Camera } from './camera';
import { HandTracker } from './handTracker';
import { GestureEngine } from './gesture/gestureEngine';
import { loadTemplates, exportTemplates, importTemplates } from './gesture/templateStore';
import { Compositor } from './compositor';
import { calibrate, countdown } from './calibration';
import { FingertipLightning } from './effects/fingertipLightning';
import { DimLights } from './effects/dimLights';
import { PalmBlast } from './effects/palmBlast';
import { PinchDraw } from './effects/pinchDraw';
import type { Effect } from './types';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ui = document.getElementById('ui') as HTMLDivElement;
const status = document.createElement('span');
status.id = 'status';

const camera = new Camera();
const tracker = new HandTracker();
const pinch = new PinchDraw();
const effects: Effect[] = [new FingertipLightning(), new DimLights(), new PalmBlast(), pinch];
const labels: Record<string, string> = {
  'fingertip-lightning': 'Lightning', 'dim-lights': 'Dim', 'palm-blast': 'Blast', 'pinch-draw': 'Draw',
};

let engine = new GestureEngine(loadTemplates(), { defaultThreshold: 0.6, cooldownMs: 800 });
let compositor: Compositor | null = null;

function setStatus(text: string) { status.textContent = text; }

function button(text: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.onclick = onClick;
  return b;
}

async function startApp() {
  try {
    setStatus('Starting camera…');
    await camera.start();
    setStatus('Loading hand model…');
    await tracker.init();
    compositor = new Compositor(canvas, camera, tracker, engine, effects, {
      onFrame: (hand, scores, fired) => {
        const best = Object.entries(scores).sort((a, b) => a[1] - b[1])[0];
        setStatus(
          (hand ? '✋ hand' : '… no hand') +
          (best ? ` · closest ${labels[best[0]] ?? best[0]} ${best[1].toFixed(2)}` : '') +
          (fired.length ? ` · fired ${fired.map(f => labels[f] ?? f).join(',')}` : ''),
        );
      },
    });
    compositor.start();
    setStatus('Running');
  } catch (err) {
    setStatus((err as Error).message);
  }
}

async function calibrateEffect(effectId: string) {
  if (!camera.width) { setStatus('Start the camera first'); return; }
  for (let n = 3; n >= 1; n--) { setStatus(`Calibrating ${labels[effectId]} in ${n}…`); await countdown(1, () => {}); }
  setStatus(`Hold your ${labels[effectId]} symbol…`);
  await calibrate(effectId, camera, tracker);
  engine.setTemplates(loadTemplates());
  setStatus(`Saved ${labels[effectId]} gesture`);
}

function buildUI() {
  ui.appendChild(button('▶ Start', startApp));
  for (const e of effects) {
    ui.appendChild(button(`🎯 ${labels[e.id]}`, () => calibrateEffect(e.id)));
  }
  ui.appendChild(button('🧽 Clear drawing', () => pinch.clear()));

  const slider = document.createElement('input');
  slider.type = 'range'; slider.min = '0.2'; slider.max = '1.2'; slider.step = '0.05'; slider.value = '0.6';
  slider.title = 'Sensitivity (lower = stricter)';
  slider.oninput = () => {
    const v = parseFloat(slider.value);
    for (const e of effects) engine.setThreshold(e.id, v);
  };
  ui.appendChild(slider);

  ui.appendChild(button('⬇ Export', () => {
    const blob = new Blob([exportTemplates()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cammods-gestures.json';
    a.click();
  }));

  const file = document.createElement('input');
  file.type = 'file'; file.accept = 'application/json'; file.style.display = 'none';
  file.onchange = async () => {
    const f = file.files?.[0];
    if (!f) return;
    importTemplates(await f.text());
    engine.setTemplates(loadTemplates());
    setStatus('Imported gestures');
  };
  ui.appendChild(button('⬆ Import', () => file.click()));
  ui.appendChild(file);

  ui.appendChild(status);
}

buildUI();
```

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: no errors, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: wire UI, calibration, and live mode"
```

---

## Task 14: README + full live verification

**Files:**
- Create: `README.md`

- [ ] **Step 1: Create `README.md`**

````markdown
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
   (or **Browser** source pointed at the dev URL).
3. Click **Start Virtual Camera** in OBS.
4. In Zoom/Meet/Discord, choose **OBS Virtual Camera** as your camera.

## Effects (v1)

Fingertip lightning · Snap to dim · Palm blast · Pinch-to-draw.

## Roadmap (v2)

Play an mp4 as an effect · WebGL pixel-warp world effects · face/body filters.
````

- [ ] **Step 2: Run the full unit suite**

Run: `npm test`
Expected: all tests pass (normalize, distance, gestureEngine, templateStore, effectDriver, particleSystem).

- [ ] **Step 3: Live verification**

Run: `npm run dev`, open the URL in Chrome, allow camera.
Verify:
- Mirrored webcam shows on the canvas.
- Calibrate each effect; status shows "Saved … gesture".
- Making each symbol fires the right effect: lightning streams from fingertips while held; dim toggles on/off; blast plays a one-shot shockwave; pinch-draw leaves neon lines and Clear wipes them.
- Sensitivity slider changes how easily gestures fire.
- Export downloads a JSON; Import restores it.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with OBS virtual camera setup"
```

---

## Self-Review Notes

- **Spec coverage:** Camera (T9), HandTracker (T10), GestureEngine + normalization + distance (T2–T4), Calibration + averaged capture (T12), template storage + export/import (T5), EffectsRegistry via EffectDriver + ParticleSystem (T6–T8), Compositor (T11), App/UI with sensitivity + status (T13). All four v1 effects (T8). Reliability: normalization, threshold, cooldown, sensitivity (T2/T4/T13). Error handling: camera failure + model load surfaced in UI (T9/T13); no-hand handled in engine (T4). Testing strategy matches spec (pure logic unit-tested; visuals live-verified). OBS virtual-cam usage documented (T14).
- **Type consistency:** `EffectMode` defined in `effectDriver.ts` and reused by `Effect`; `Effect.start/stop` signatures match `DriverEffect`; `GestureEngineResult` shape (`fired`/`active`/`scores`) consumed consistently by compositor and main.
- **Out of scope (deferred to v2, per spec):** mp4 playback, WebGL warps, screen shake on blast.
