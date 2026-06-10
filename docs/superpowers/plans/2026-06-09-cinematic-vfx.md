# CamMods Cinematic (PixiJS/WebGL) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite CamMods rendering on PixiJS v8 (WebGL), restyle every effect to film quality, add Energy Shield / Kamehameha Beam / Web Shot, and rebuild screen filters (Glitch v2, CRT v2, new Cyberpunk) per the approved spec `docs/superpowers/specs/2026-06-09-cinematic-vfx-design.md`.

**Architecture:** A `PixiCompositor` replaces the canvas-2D `Compositor` (same collaborators/loop). Effects become Pixi presenters that mount display objects via `init(stage)` and mutate them in `update()`; all decision logic lives in pure, Pixi-free core modules (TDD'd). A shared FX kit provides particles, screen shake, transient shader FX (shockwave/zoom-blur/flash), procedural textures, and synthesized SFX. A filter registry drives shader rigs on the root container.

**Tech Stack:** Vite + TypeScript, `pixi.js` ^8 (WebGL forced), `pixi-filters` ^6, MediaPipe Tasks Vision (unchanged), Vitest/jsdom, WebAudio synth.

**Branch:** `feat/cinematic-vfx` (Task 1 creates it).

**Verification commands used throughout** (dev server must be running for headless checks — `npm run dev` in background):

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --enable-unsafe-swiftshader \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --window-size=1280,800 --virtual-time-budget=15000 \
  --screenshot=/tmp/cammods.png "http://localhost:5173/?clean=1&autostart=1"
```

The fake-device flags give Chrome a synthetic camera (green test pattern), so the screenshot exercises the REAL pipeline: getUserMedia → MediaPipe → Pixi WebGL render. Read the PNG to confirm a non-black frame. `?autostart=1` is added in Task 4.

---

## File map (final state)

| File | Status | Responsibility |
|---|---|---|
| `src/fx/particleCore.ts` | create | Pure particle state + physics step (TDD) |
| `src/fx/particles.ts` | create | `FxParticles` sprite-pool presenter |
| `src/fx/proceduralTextures.ts` | create | Canvas2D-generated textures (glow/streak/vignette/shield-hex/webs) |
| `src/fx/shake.ts` | create | `ScreenShake` (pure, TDD) |
| `src/fx/transients.ts` | create | `TransientFx`: ripple / zoomBlur / flash |
| `src/fx/filterList.ts` | create | add/remove filter on a Container |
| `src/fx/sfx.ts` | create | All WebAudio synths (bang moves here; thwip/charge/beam/shield added in feature tasks) |
| `src/fx/boltGen.ts` | create | Pure lightning geometry (TDD) |
| `src/fx/webGeometry.ts` | create | Pure web-splat geometry (TDD) |
| `src/effects/gunCore.ts` | create | Pure per-hand cock/fire state (TDD) |
| `src/effects/beamCore.ts` | create | Pure beam state machine (TDD) |
| `src/pixiCompositor.ts` | create | Pixi stage, rAF loop, shake/transients/rig plumbing |
| `src/filters/index.ts` | create | Registry: `SCREEN_FILTERS`, `ScreenFilter`, `buildFilterRig` |
| `src/filters/glitch.ts` `crt.ts` `cyberpunk.ts` | create | Shader rigs |
| `src/effects/energyShield.ts` `energyBeam.ts` `webShot.ts` | create | New effects |
| `src/effects/*.ts` (existing 7) | rewrite | Pixi presenters |
| `src/types.ts` | modify | `Effect.init(stage)`, drop `render`, add `EffectStage`; later `hands[]` |
| `src/main.ts` | modify | Compositor singleton + async init, autostart, new cards, registry import |
| `src/overlay.ts` | rewrite | Pixi Graphics skeleton |
| `src/handTracker.ts` | modify | `numHands: 2` |
| `src/gesture/gestureEngine.ts` | modify | Multi-hand update |
| `src/compositor.ts`, `src/screenFilters.ts`, `src/effects/particleSystem.ts` | **delete** | Replaced |
| `tests/*` | modify/create | Core tests; ctx fixtures gain `hands` in Task 9 |
| `README.md` | modify | Task 13 |

---

### Task 1: Branch + dependencies + dependency smoke test

**Files:**
- Modify: `package.json` (via npm install)
- Create: `tests/fx/pixiDeps.test.ts`

- [ ] **Step 1: Create the branch**

```bash
cd /Users/henryzhao/Desktop/Projects/camera-mods
git checkout -b feat/cinematic-vfx
```

- [ ] **Step 2: Install pixi.js and pixi-filters**

```bash
npm install pixi.js@^8 pixi-filters@^6
```

Expected: both land in `dependencies`. If peer warnings appear about pixi version, check `npm ls pixi.js` shows a single 8.x version.

- [ ] **Step 3: Write the dependency smoke test**

Create `tests/fx/pixiDeps.test.ts`. This catches API-name drift (e.g. a filter not existing in the installed pixi-filters) at the very start instead of mid-rewrite:

```ts
import { describe, it, expect } from 'vitest';
import { Application, Container, Graphics, Sprite, Texture, ColorMatrixFilter } from 'pixi.js';
import {
  GlitchFilter, RGBSplitFilter, CRTFilter, AdvancedBloomFilter,
  GlowFilter, ShockwaveFilter, ZoomBlurFilter,
} from 'pixi-filters';

describe('pixi dependencies', () => {
  it('exports every class the cinematic stack uses', () => {
    for (const C of [Application, Container, Graphics, Sprite, ColorMatrixFilter,
      GlitchFilter, RGBSplitFilter, CRTFilter, AdvancedBloomFilter,
      GlowFilter, ShockwaveFilter, ZoomBlurFilter]) {
      expect(typeof C).toBe('function');
    }
    expect(Texture.WHITE).toBeDefined();
  });

  it('can construct display objects without a renderer (jsdom-safe)', () => {
    const c = new Container();
    c.addChild(new Graphics());
    c.addChild(new Sprite(Texture.WHITE));
    expect(c.children.length).toBe(2);
  });
});
```

- [ ] **Step 4: Run the test**

Run: `npx vitest run tests/fx/pixiDeps.test.ts`
Expected: PASS. **If an import fails** (e.g. `AdvancedBloomFilter` missing): check the installed package's exports (`node -e "console.log(Object.keys(require('pixi-filters')))"`) and substitute the documented fallback (`BloomFilter` for `AdvancedBloomFilter`) — then update Task 8's rig code accordingly and note it in the commit message.

- [ ] **Step 5: Run the whole existing suite (must stay green)**

Run: `npm test`
Expected: all existing tests PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tests/fx/pixiDeps.test.ts
git commit -m "feat: add pixi.js + pixi-filters with dependency smoke test"
```

---

### Task 2: Pure FX cores — particle physics + screen shake (TDD)

**Files:**
- Create: `src/fx/particleCore.ts`
- Create: `src/fx/shake.ts`
- Test: `tests/fx/particleCore.test.ts`, `tests/fx/shake.test.ts`

These are pure modules — **no pixi imports**.

- [ ] **Step 1: Write the failing particleCore test**

Create `tests/fx/particleCore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { stepParticle, particleAlpha, type ParticleState } from '../../src/fx/particleCore';

function make(over: Partial<ParticleState> = {}): ParticleState {
  return {
    x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0,
    life: 1, maxLife: 1, size: 10, grow: 0, spin: 0, rotation: 0,
    tint: 0xffffff, alpha: 1, streak: false, additive: true,
    ...over,
  };
}

describe('stepParticle', () => {
  it('integrates velocity into position', () => {
    const p = make({ vx: 10, vy: -20 });
    stepParticle(p, 0.5);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(-10);
  });

  it('applies acceleration (gravity) to velocity', () => {
    const p = make({ ay: 100 });
    stepParticle(p, 1);
    expect(p.vy).toBeCloseTo(100);
  });

  it('applies drag as per-second damping', () => {
    const p = make({ vx: 100, drag: 0.5 });
    stepParticle(p, 1);
    expect(p.vx).toBeCloseTo(50);
  });

  it('grows size by grow-rate per second and spins', () => {
    const p = make({ grow: 1, spin: Math.PI });
    stepParticle(p, 1);
    expect(p.size).toBeCloseTo(20);
    expect(p.rotation).toBeCloseTo(Math.PI);
  });

  it('returns false once life is exhausted', () => {
    const p = make({ life: 0.1 });
    expect(stepParticle(p, 0.05)).toBe(true);
    expect(stepParticle(p, 0.06)).toBe(false);
  });
});

describe('particleAlpha', () => {
  it('fades with remaining life scaled by base alpha', () => {
    const p = make({ life: 0.25, maxLife: 1, alpha: 0.8 });
    expect(particleAlpha(p)).toBeCloseTo(0.2);
  });

  it('never goes negative', () => {
    const p = make({ life: -0.1 });
    expect(particleAlpha(p)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify failure**

Run: `npx vitest run tests/fx/particleCore.test.ts`
Expected: FAIL — cannot resolve `../../src/fx/particleCore`.

- [ ] **Step 3: Implement `src/fx/particleCore.ts`**

```ts
// Pure particle physics — no pixi imports, fully unit-testable.
export interface ParticleState {
  x: number; y: number; vx: number; vy: number;
  ax: number; ay: number;   // acceleration px/s^2 (gravity, buoyancy)
  drag: number;             // fraction of velocity removed per second
  life: number; maxLife: number;
  size: number;             // radius px
  grow: number;             // size multiplier rate per second (0 = constant)
  spin: number;             // rad/s
  rotation: number;
  tint: number;             // 0xRRGGBB
  alpha: number;            // alpha at birth
  streak: boolean;          // render stretched along velocity
  additive: boolean;        // 'add' blend vs 'normal' (smoke)
}

// Advances one particle; returns false when it has expired.
export function stepParticle(p: ParticleState, dt: number): boolean {
  p.vx += p.ax * dt;
  p.vy += p.ay * dt;
  const damp = Math.max(0, 1 - p.drag * dt);
  p.vx *= damp;
  p.vy *= damp;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.size *= 1 + p.grow * dt;
  p.rotation += p.spin * dt;
  p.life -= dt;
  return p.life > 0;
}

export function particleAlpha(p: ParticleState): number {
  return Math.max(0, p.life / p.maxLife) * p.alpha;
}
```

- [ ] **Step 4: Run tests — PASS expected**

Run: `npx vitest run tests/fx/particleCore.test.ts`

- [ ] **Step 5: Write the failing ScreenShake test**

Create `tests/fx/shake.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { ScreenShake } from '../../src/fx/shake';

describe('ScreenShake', () => {
  it('starts at zero with zero offset', () => {
    const s = new ScreenShake();
    expect(s.magnitude).toBe(0);
    expect(s.offset()).toEqual({ x: 0, y: 0 });
  });

  it('kick raises magnitude and clamps at 40', () => {
    const s = new ScreenShake();
    s.kick(10);
    expect(s.magnitude).toBe(10);
    s.kick(100);
    expect(s.magnitude).toBe(40);
  });

  it('decays exponentially and floors to exactly 0', () => {
    const s = new ScreenShake();
    s.kick(10);
    s.update(0.1);
    expect(s.magnitude).toBeLessThan(10);
    expect(s.magnitude).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) s.update(0.1);
    expect(s.magnitude).toBe(0);
  });

  it('offset stays within the current magnitude', () => {
    const s = new ScreenShake();
    s.kick(8);
    const o = s.offset(() => 0.99);
    expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(8 + 1e-9);
  });
});
```

- [ ] **Step 6: Run to verify failure, then implement `src/fx/shake.ts`**

Run: `npx vitest run tests/fx/shake.test.ts` → FAIL (module missing). Then:

```ts
// Decaying camera shake. Pure math — the compositor applies offset() to world.position.
const DECAY_RATE = 7;   // 1/s exponential decay
const MAX_MAG = 40;     // px
const FLOOR = 0.05;     // snap to zero below this

export class ScreenShake {
  private mag = 0;

  kick(strength: number): void {
    this.mag = Math.min(MAX_MAG, this.mag + strength);
  }

  update(dt: number): void {
    this.mag *= Math.exp(-DECAY_RATE * dt);
    if (this.mag < FLOOR) this.mag = 0;
  }

  // rng injectable for tests
  offset(rng: () => number = Math.random): { x: number; y: number } {
    if (this.mag === 0) return { x: 0, y: 0 };
    const a = rng() * Math.PI * 2;
    const r = this.mag * rng();
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  get magnitude(): number { return this.mag; }
}
```

- [ ] **Step 7: Run both new test files + full suite — PASS expected**

Run: `npm test`

- [ ] **Step 8: Commit**

```bash
git add src/fx/particleCore.ts src/fx/shake.ts tests/fx/particleCore.test.ts tests/fx/shake.test.ts
git commit -m "feat(fx): pure particle physics core + screen shake (TDD)"
```

---

### Task 3: FX kit presenters — textures, particles, transients, sfx

**Files:**
- Create: `src/fx/proceduralTextures.ts`, `src/fx/filterList.ts`, `src/fx/particles.ts`, `src/fx/transients.ts`, `src/fx/sfx.ts`
- Modify: `src/effects/gunShot.ts` (delete local synth, import from sfx)

These are Pixi presenters — verified by typecheck + later headless screenshots (no jsdom WebGL). The pure parts were TDD'd in Task 2.

- [ ] **Step 1: Create `src/fx/proceduralTextures.ts`**

All textures are drawn on offscreen 2D canvases (no renderer needed), generated once:

```ts
import { Texture } from 'pixi.js';

function canvasOf(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  if (c) draw(c);
  return cv;
}

// 32x32 soft white disc — tinted per particle, scaled so sprite radius == particle size.
export function glowTexture(): Texture {
  return Texture.from(canvasOf(32, 32, c => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  }));
}

// 64x16 horizontal capsule with soft ends — for velocity-stretched streaks/tracers.
export function streakTexture(): Texture {
  return Texture.from(canvasOf(64, 16, c => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.filter = 'blur(2px)';
    c.fillRect(0, 4, 64, 8);
  }));
}

// 512x512: transparent center -> opaque black edges (cinematic dim vignette).
export function vignetteTexture(): Texture {
  return Texture.from(canvasOf(512, 512, c => {
    const g = c.createRadialGradient(256, 256, 100, 256, 256, 360);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
  }));
}

// 512x512 disc filled with a hexagon grid, clipped to a circle (energy shield).
export function shieldHexTexture(): Texture {
  return Texture.from(canvasOf(512, 512, c => {
    const R = 250, cx = 256, cy = 256, s = 26;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 1.6;
    const h = Math.sqrt(3) * s;
    for (let row = -12; row <= 12; row++) {
      for (let col = -12; col <= 12; col++) {
        const x = cx + col * 1.5 * s;
        const y = cy + row * h + (col % 2 ? h / 2 : 0);
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          const px = x + s * Math.cos(a), py = y + s * Math.sin(a);
          i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
        }
        c.closePath();
        c.stroke();
      }
    }
  }));
}

export interface FxTextures {
  glow: Texture;
  streak: Texture;
  vignette: Texture;
  shieldHex: Texture;
  webs: Texture[]; // filled by Task 12 (webTexture); empty until then
}

export function buildFxTextures(): FxTextures {
  return {
    glow: glowTexture(),
    streak: streakTexture(),
    vignette: vignetteTexture(),
    shieldHex: shieldHexTexture(),
    webs: [],
  };
}
```

- [ ] **Step 2: Create `src/fx/filterList.ts`**

```ts
import type { Container, Filter } from 'pixi.js';

// Pixi v8 stores container filters as a readonly array (or null) — these helpers
// let multiple owners (dim grade, transient shockwaves) add/remove independently.
export function addFilter(c: Container, f: Filter): void {
  const cur = (c.filters as Filter[] | null) ?? [];
  c.filters = [...cur, f];
}

export function removeFilter(c: Container, f: Filter): void {
  const cur = (c.filters as Filter[] | null) ?? [];
  c.filters = cur.filter(x => x !== f);
}
```

- [ ] **Step 3: Create `src/fx/particles.ts`**

```ts
import { Container, Sprite, type Texture } from 'pixi.js';
import { particleAlpha, stepParticle, type ParticleState } from './particleCore';

export interface SpawnOpts {
  x: number; y: number;
  life: number; size: number;
  vx?: number; vy?: number; ax?: number; ay?: number; drag?: number;
  grow?: number; spin?: number;
  tint?: number; alpha?: number;
  streak?: boolean; additive?: boolean;
}

const STREAK_PER_SPEED = 0.018; // x-scale per px/s of velocity

// Sprite-pool particle system. One instance per effect; `view` is mounted by the effect.
export class FxParticles {
  readonly view = new Container();
  private live: Array<{ p: ParticleState; s: Sprite }> = [];
  private pool: Sprite[] = [];

  constructor(private glowTex: Texture, private streakTex: Texture, private max = 300) {}

  spawn(o: SpawnOpts): void {
    if (this.live.length >= this.max) return;
    const p: ParticleState = {
      x: o.x, y: o.y, vx: o.vx ?? 0, vy: o.vy ?? 0,
      ax: o.ax ?? 0, ay: o.ay ?? 0, drag: o.drag ?? 0,
      life: o.life, maxLife: o.life, size: o.size,
      grow: o.grow ?? 0, spin: o.spin ?? 0, rotation: 0,
      tint: o.tint ?? 0xffffff, alpha: o.alpha ?? 1,
      streak: o.streak ?? false, additive: o.additive ?? true,
    };
    const s = this.pool.pop() ?? new Sprite();
    s.texture = p.streak ? this.streakTex : this.glowTex;
    s.anchor.set(0.5);
    s.blendMode = p.additive ? 'add' : 'normal';
    s.tint = p.tint;
    s.visible = true;
    this.view.addChild(s);
    this.live.push({ p, s });
    this.sync(p, s);
  }

  update(dt: number): void {
    const keep: typeof this.live = [];
    for (const e of this.live) {
      if (stepParticle(e.p, dt)) { this.sync(e.p, e.s); keep.push(e); }
      else this.recycle(e.s);
    }
    this.live = keep;
  }

  private sync(p: ParticleState, s: Sprite): void {
    s.position.set(p.x, p.y);
    s.alpha = particleAlpha(p);
    const base = p.size / 16; // glow tex radius is 16px
    if (p.streak) {
      s.rotation = Math.atan2(p.vy, p.vx);
      const speed = Math.hypot(p.vx, p.vy);
      s.scale.set(Math.max(0.2, speed * STREAK_PER_SPEED) * base, base);
    } else {
      s.rotation = p.rotation;
      s.scale.set(base);
    }
  }

  private recycle(s: Sprite): void {
    s.visible = false;
    this.view.removeChild(s);
    this.pool.push(s);
  }

  clear(): void {
    for (const e of this.live) this.recycle(e.s);
    this.live = [];
  }

  get count(): number { return this.live.length; }
}
```

- [ ] **Step 4: Create `src/fx/transients.ts`**

```ts
import { Container, Sprite, Texture } from 'pixi.js';
import { ShockwaveFilter, ZoomBlurFilter } from 'pixi-filters';
import { addFilter, removeFilter } from './filterList';

const MAX_RIPPLES = 3;

interface Ripple { f: ShockwaveFilter; t: number; dur: number; }
interface Blur { f: ZoomBlurFilter; t: number; dur: number; strength: number; }
interface Flash { s: Sprite; t: number; dur: number; alpha: number; }

export interface RippleOpts { amplitude?: number; wavelength?: number; speed?: number; duration?: number; }

// One-shot cinematic moments: real displacement ripples, zoom blur, lens flashes.
// Owned by the compositor; effects call these via EffectStage.fx.transients.
export class TransientFx {
  private ripples: Ripple[] = [];
  private blurs: Blur[] = [];
  private flashes: Flash[] = [];
  private w = 1280; private h = 720;

  constructor(private world: Container, private screen: Container) {}

  setSize(w: number, h: number): void { this.w = w; this.h = h; }

  ripple(x: number, y: number, o: RippleOpts = {}): void {
    if (this.ripples.length >= MAX_RIPPLES) {
      const old = this.ripples.shift()!;
      removeFilter(this.world, old.f);
    }
    const f = new ShockwaveFilter({
      center: { x, y },
      amplitude: o.amplitude ?? 30,
      wavelength: o.wavelength ?? 160,
      speed: o.speed ?? 900,
      brightness: 1.08,
      radius: -1,
    });
    f.time = 0;
    addFilter(this.world, f);
    this.ripples.push({ f, t: 0, dur: o.duration ?? 0.7 });
  }

  zoomBlur(x: number, y: number, strength = 0.25, duration = 0.5): void {
    const f = new ZoomBlurFilter({ strength, center: { x, y }, innerRadius: 60 });
    addFilter(this.world, f);
    this.blurs.push({ f, t: 0, dur: duration, strength });
  }

  flash(alpha = 0.2, duration = 0.15, tint = 0xffffff): void {
    const s = new Sprite(Texture.WHITE);
    s.tint = tint;
    s.alpha = alpha;
    s.blendMode = 'add';
    this.screen.addChild(s);
    this.flashes.push({ s, t: 0, dur: duration, alpha });
  }

  update(dt: number): void {
    this.ripples = this.ripples.filter(r => {
      r.t += dt;
      r.f.time = r.t;
      if (r.t >= r.dur) { removeFilter(this.world, r.f); return false; }
      return true;
    });
    this.blurs = this.blurs.filter(b => {
      b.t += dt;
      const k = 1 - b.t / b.dur;
      b.f.strength = b.strength * k * k;
      if (b.t >= b.dur) { removeFilter(this.world, b.f); return false; }
      return true;
    });
    this.flashes = this.flashes.filter(f => {
      f.t += dt;
      f.s.width = this.w; f.s.height = this.h;
      f.s.alpha = f.alpha * Math.max(0, 1 - f.t / f.dur);
      if (f.t >= f.dur) { this.screen.removeChild(f.s); f.s.destroy(); return false; }
      return true;
    });
  }

  clear(): void {
    for (const r of this.ripples) removeFilter(this.world, r.f);
    for (const b of this.blurs) removeFilter(this.world, b.f);
    for (const f of this.flashes) { this.screen.removeChild(f.s); f.s.destroy(); }
    this.ripples = []; this.blurs = []; this.flashes = [];
  }
}
```

- [ ] **Step 5: Create `src/fx/sfx.ts`** (gunshot synth moves here verbatim; new sounds land in Tasks 10–12)

```ts
// All sounds are synthesized with WebAudio — zero asset files.
// Guarded so jsdom (no AudioContext) and pre-gesture autoplay policies are safe.

let audioCtx: AudioContext | null = null;

export function ac(): AudioContext | null {
  const AC = (window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

// Short gunshot: noise crack through a falling lowpass + low sine thump.
export function playBang(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;

  const dur = 0.18;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.9, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, now);
  lp.frequency.exponentialRampToValueAtTime(400, now + dur);
  noise.connect(lp).connect(noiseGain).connect(ctx.destination);
  noise.start(now);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}
```

- [ ] **Step 6: Point `src/effects/gunShot.ts` at the shared synth**

In `src/effects/gunShot.ts`: delete the whole local block from `// Synthesize a short gunshot…` through the end of `function playBang(): void { … }` (lines 8–46), and add the import:

```ts
import { playBang } from '../fx/sfx';
```

- [ ] **Step 7: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: clean typecheck; all tests PASS (gunShot tests don't touch audio).

- [ ] **Step 8: Commit**

```bash
git add src/fx tests/fx src/effects/gunShot.ts
git commit -m "feat(fx): procedural textures, sprite-pool particles, transient shader FX, shared sfx module"
```

---

### Task 4: PixiCompositor + filter-registry skeleton + main.ts cutover

**Files:**
- Create: `src/filters/index.ts` (registry skeleton — rigs filled in Tasks 7–8)
- Rewrite: `src/overlay.ts` (Pixi Graphics)
- Create: `src/pixiCompositor.ts`
- Modify: `src/main.ts`
- Delete: `src/compositor.ts`, `src/screenFilters.ts`

> After this task the app renders the mirrored camera through WebGL with the hand
> overlay, clean view, and start/stop all working. **Effects do not render again until
> Tasks 5–6** (their old `render()` is simply never called) — expected branch-internal
> state per the spec's migration plan. The Screen-FX dropdown lists all four filters but
> only `none` has a rig until Tasks 7–8.

- [ ] **Step 1: Create `src/filters/index.ts`**

```ts
import type { Filter } from 'pixi.js';

export type ScreenFilter = 'none' | 'glitch' | 'crt' | 'cyberpunk';

export const SCREEN_FILTERS: Array<{ id: ScreenFilter; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'crt', label: 'CRT / retro' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
];

// A rig is a set of live shader filters plus a per-frame animator for their uniforms.
export interface FilterRig {
  filters: Filter[];
  update(dt: number, t: number): void; // t = seconds since rig was applied
  destroy(): void;
}

// Rigs are added by later tasks (glitch/crt in Task 7, cyberpunk in Task 8).
export function buildFilterRig(id: ScreenFilter): FilterRig | null {
  switch (id) {
    default:
      return null;
  }
}
```

- [ ] **Step 2: Rewrite `src/overlay.ts`** (full new contents)

```ts
import type { Graphics } from 'pixi.js';
import type { HandLandmarks } from './types';

// Standard MediaPipe hand skeleton: pairs of landmark indices to connect.
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [0, 17],                                  // palm base
];

const TIPS = new Set([4, 8, 12, 16, 20]);

// Draw the tracked hand's bones + joints into a (pre-cleared) Graphics layer.
// landmarks are normalized 0..1; w/h are the canvas dimensions. Callable multiple
// times per frame (one call per hand).
export function drawHandSkeleton(
  gfx: Graphics,
  landmarks: HandLandmarks,
  w: number,
  h: number,
): void {
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a], pb = landmarks[b];
    gfx.moveTo(pa.x * w, pa.y * h).lineTo(pb.x * w, pb.y * h);
  }
  gfx.stroke({ width: 2, color: 0x7df9ff, alpha: 0.65 });

  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const tip = TIPS.has(i);
    gfx.circle(p.x * w, p.y * h, tip ? 5 : 3.5)
      .fill({ color: 0x0a0c11 })
      .stroke({ width: 2, color: tip ? 0xffd27d : 0x7df9ff });
  }
}
```

- [ ] **Step 2.5: Add `EffectStage` + optional `init` to `src/types.ts`** (the compositor below imports them)

At the top of `src/types.ts` add:

```ts
import type { Container } from 'pixi.js';
import type { ScreenShake } from './fx/shake';
import type { TransientFx } from './fx/transients';
import type { FxTextures } from './fx/proceduralTextures';
```

(keeping the existing `EffectMode` import), and insert before the `Effect` interface:

```ts
// Layers + shared services an effect mounts into, handed over once by the compositor.
export interface EffectStage {
  world: Container;     // shaken world (video + effects + overlay)
  effects: Container;   // world-space effect layer (most visuals go here)
  screen: Container;    // "on the lens" — not shaken (splats, dim grade, flashes)
  fx: {
    shake: ScreenShake;
    transients: TransientFx;
    textures: FxTextures;
  };
}
```

then add ONE line to the `Effect` interface (keep `render` for now — the old effect classes still implement it until Task 5/6 ports them):

```ts
  init?(stage: EffectStage): void; // mount display objects (Task 6 makes this required)
```

Type-only pixi imports are erased at compile time, so test files importing `types.ts` stay jsdom-safe.

- [ ] **Step 3: Create `src/pixiCompositor.ts`** (full contents)

```ts
import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ScreenShake } from './fx/shake';
import { TransientFx } from './fx/transients';
import { buildFxTextures, type FxTextures } from './fx/proceduralTextures';
import { buildFilterRig, type FilterRig, type ScreenFilter } from './filters';
import { drawHandSkeleton } from './overlay';
import { EffectDriver } from './effects/effectDriver';
import type { Camera } from './camera';
import type { HandTracker } from './handTracker';
import type { FaceTracker } from './faceTracker';
import type { GestureEngine } from './gesture/gestureEngine';
import type { Effect, EffectStage, FaceResult, HandResult, RenderContext } from './types';

export interface CompositorHooks {
  onFrame?: (
    hand: HandResult | null,
    fired: string[],
    active: Set<string>,
  ) => void;
}

// WebGL compositor: mirrored video sprite + effect layers + shake + transient
// shader FX + the selected screen-filter rig. Created ONCE and reused across
// start/stop cycles (a Pixi Application must not be re-created per start).
export class PixiCompositor {
  showLandmarks = false;
  trackFace = false;

  private app = new Application();
  private root = new Container();      // gets the screen-filter rig (final grade)
  private world = new Container();     // shaken; video + effects + overlay
  private effectsLayer = new Container();
  private overlayGfx = new Graphics();
  private screenLayer = new Container(); // "on the lens": splats, flashes, dim grade
  private videoSprite: Sprite | null = null;

  private shake = new ScreenShake();
  private transients!: TransientFx;
  private textures!: FxTextures;

  private _screenFilter: ScreenFilter = 'none';
  private rig: FilterRig | null = null;
  private rigT = 0;

  private driver: EffectDriver;
  private raf = 0;
  private last = 0;
  private inited = false;

  constructor(
    private camera: Camera,
    private tracker: HandTracker,
    private faceTracker: FaceTracker,
    private engine: GestureEngine,
    private effects: Effect[],
    private hooks: CompositorHooks = {},
  ) {
    this.driver = new EffectDriver(effects);
  }

  // Must be awaited once before start(). Mounts the scene graph and inits effects.
  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (this.inited) return;
    await this.app.init({
      canvas,
      width: 1280,
      height: 720,
      preference: 'webgl', // OBS browser-source safe; no WebGPU surprises
      antialias: true,
      background: '#000000',
      autoStart: false,
      sharedTicker: false,
    });
    this.app.ticker.stop(); // we drive rendering from our own rAF loop

    this.world.addChild(this.effectsLayer, this.overlayGfx);
    this.root.addChild(this.world, this.screenLayer);
    this.app.stage.addChild(this.root);

    this.textures = buildFxTextures();
    this.transients = new TransientFx(this.world, this.screenLayer);

    const stage: EffectStage = {
      world: this.world,
      effects: this.effectsLayer,
      screen: this.screenLayer,
      fx: { shake: this.shake, transients: this.transients, textures: this.textures },
    };
    for (const e of this.effects) e.init?.(stage);

    this.applyFilter();
    this.inited = true;
  }

  get screenFilter(): ScreenFilter { return this._screenFilter; }
  set screenFilter(id: ScreenFilter) {
    this._screenFilter = id;
    if (this.inited) this.applyFilter();
  }

  private applyFilter(): void {
    this.rig?.destroy();
    this.rig = buildFilterRig(this._screenFilter);
    this.root.filters = this.rig ? this.rig.filters : [];
    this.rigT = 0;
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
    if (this.app.renderer.width !== w || this.app.renderer.height !== h) {
      this.app.renderer.resize(w, h);
    }

    // Lazily (re)create the mirrored video sprite; recreate if camera dims changed.
    if (this.videoSprite && (this.videoSprite.texture.width !== w || this.videoSprite.texture.height !== h)) {
      this.videoSprite.destroy({ texture: true });
      this.videoSprite = null;
    }
    if (!this.videoSprite) {
      const tex = Texture.from(this.camera.video, true); // skipCache: fresh per stream
      this.videoSprite = new Sprite(tex);
      this.videoSprite.scale.x = -1; // mirrored selfie view
      this.world.addChildAt(this.videoSprite, 0);
    }
    this.videoSprite.x = w;
    this.videoSprite.texture.source.update(); // deterministic per-frame refresh

    const hands = this.tracker.detect(this.camera.video, now);
    const hand = hands[0] ?? null;

    let face: FaceResult | null = null;
    if (this.trackFace && this.faceTracker.ready) {
      face = this.faceTracker.detect(this.camera.video, now)[0] ?? null;
    }

    const ctx: RenderContext = { width: w, height: h, hand, face, now };

    const result = this.engine.update(hand ? hand.landmarks : null, now);
    this.driver.apply(result.fired, result.active);
    this.hooks.onFrame?.(hand, result.fired, result.active);

    for (const e of this.effects) e.update(dt, ctx);

    this.overlayGfx.clear();
    if (this.showLandmarks && hand) drawHandSkeleton(this.overlayGfx, hand.landmarks, w, h);

    this.shake.update(dt);
    const off = this.shake.offset();
    this.world.position.set(off.x, off.y);

    this.transients.setSize(w, h);
    this.transients.update(dt);

    this.rigT += dt;
    this.rig?.update(dt, this.rigT);

    this.app.renderer.render(this.app.stage);
  }
}
```

> Note: `e.init?.(stage)` is optional-chained because `init` joins the `Effect`
> interface as optional in Task 5 and becomes required in Task 6. Until Task 5,
> no effect has `init`, which is fine — they just don't render.

- [ ] **Step 4: Modify `src/main.ts`**

(a) Imports — replace:

```ts
import { Compositor } from './compositor';
```
with
```ts
import { PixiCompositor } from './pixiCompositor';
```
and replace:
```ts
import { SCREEN_FILTERS, type ScreenFilter } from './screenFilters';
```
with
```ts
import { SCREEN_FILTERS, type ScreenFilter } from './filters';
```

(b) The compositor variable — replace:

```ts
let compositor: Compositor | null = null;
```
with
```ts
let compositor: PixiCompositor | null = null;
```

(c) In `start()`, replace the whole `compositor = new Compositor(canvas, camera, tracker, faceTracker, engine, effects, { onFrame: … });` construction (keeping the hook body identical) with a create-once + async init:

```ts
    if (!compositor) {
      compositor = new PixiCompositor(camera, tracker, faceTracker, engine, effects, {
        onFrame: (hand, fired, active) => {
          const now = performance.now();
          if (lastFrameTime) {
            const fps = 1000 / (now - lastFrameTime);
            fpsAvg = fpsAvg ? fpsAvg * 0.9 + fps * 0.1 : fps;
            fpsEl.textContent = `${Math.round(fpsAvg)} fps`;
          }
          lastFrameTime = now;

          for (const id of fired) flashUntil.set(id, now + 450);
          for (const [id, el] of cardEls) {
            const lit =
              active.has(id) ||
              (flashUntil.get(id) ?? 0) > now ||
              (id === 'dim-lights' && dim.isActive()) ||
              (id === 'fire-breath' && fire.isActive()) ||
              (id === 'lightning-eyes' && eyes.isActive()) ||
              (id === 'gun-shot' && gun.isActive());
            el.classList.toggle('active', lit);
          }
          handEl.textContent = hand ? '✋ hand' : 'no hand';
        },
      });
      setState('starting renderer…');
      await compositor.init(canvas);
    }
```

The lines that follow stay as they are:

```ts
    compositor.showLandmarks = showPoints.checked;
    compositor.screenFilter = currentScreenFilter;
    compositor.start();
```

(d) At the boot section, replace:

```ts
// OBS browser sources can deep-link straight into clean view with ?clean=1
if (new URLSearchParams(location.search).get('clean') !== null) enterClean();
```
with
```ts
// OBS browser sources can deep-link straight into clean view with ?clean=1,
// and auto-start the camera with ?autostart=1 (no Interact-dialog clicking).
const params = new URLSearchParams(location.search);
if (params.get('clean') !== null) enterClean();
if (params.get('autostart') !== null) void start();
```

- [ ] **Step 5: Delete the replaced files**

```bash
git rm src/compositor.ts src/screenFilters.ts
```

- [ ] **Step 6: Typecheck + tests**

Run: `npx tsc --noEmit && npm test`
Expected: clean. (No test imports the deleted modules.)

- [ ] **Step 7: Headless pipeline verification**

```bash
npm run dev &   # if not already running; note the PID to kill later
sleep 3
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --enable-unsafe-swiftshader \
  --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
  --window-size=1280,800 --virtual-time-budget=20000 \
  --screenshot=/tmp/cammods-task4.png "http://localhost:5173/?clean=1&autostart=1"
```

Then **Read `/tmp/cammods-task4.png`** — expected: the fake-camera test pattern (green-ish animated frame), mirrored, NOT a black canvas. If black: check the dev-server console and re-run with `--enable-logging=stderr 2>&1 | grep -iE "error|webgl"` to surface WebGL/init errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: PixiJS WebGL compositor + filter registry skeleton + ?autostart=1 (replaces canvas compositor)"
```

---

### Task 5: New Effect interface + port Lightning (boltGen TDD), Draw, Blast, Dim

**Files:**
- Modify: `src/types.ts`
- Create: `src/fx/boltGen.ts` + Test: `tests/fx/boltGen.test.ts`
- Rewrite: `src/effects/fingertipLightning.ts`, `src/effects/pinchDraw.ts`, `src/effects/palmBlast.ts`, `src/effects/dimLights.ts`

- [ ] **Step 1: Drop `render` from the `Effect` interface in `src/types.ts`**

`EffectStage` and the optional `init?` were already added in Task 4 Step 2.5. Now that this task rewrites the first batch of effects as Pixi presenters, delete the `render` line from the `Effect` interface so it reads:

```ts
export interface Effect {
  id: string;
  mode: EffectMode;
  init?(stage: EffectStage): void; // mount display objects (Task 6 makes this required)
  start(): void;
  stop(): void;
  update(dt: number, ctx: RenderContext): void; // mutate display objects
  isActive(): boolean;             // drives the card glow in the UI
  reset?(): void;                  // hide/clear all visible state ("Clear screen")
}
```

The gun/eyes/fire classes (ported in Task 6) still carry their old canvas `render()` methods — that's fine: extra methods beyond the interface are allowed by structural typing, and nothing calls them anymore.

- [ ] **Step 2: Write the failing boltGen test**

Create `tests/fx/boltGen.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { genBolt } from '../../src/fx/boltGen';

describe('genBolt', () => {
  it('starts exactly at the origin and ends exactly at length along the angle', () => {
    const b = genBolt({ x: 10, y: 20, angle: 0, length: 100, rng: () => 0.5 });
    expect(b.points[0]).toEqual({ x: 10, y: 20 });
    const end = b.points[b.points.length - 1];
    expect(end.x).toBeCloseTo(110);
    expect(end.y).toBeCloseTo(20);
  });

  it('produces segments+1 points', () => {
    const b = genBolt({ x: 0, y: 0, angle: 0, length: 100, segments: 7, rng: () => 0.5 });
    expect(b.points.length).toBe(8);
  });

  it('is deterministic for a fixed rng', () => {
    const a = genBolt({ x: 0, y: 0, angle: 1, length: 80, rng: () => 0.3 });
    const b = genBolt({ x: 0, y: 0, angle: 1, length: 80, rng: () => 0.3 });
    expect(a).toEqual(b);
  });

  it('spawns no branches when rng stays above branchChance', () => {
    const b = genBolt({ x: 0, y: 0, angle: 0, length: 100, branchChance: 0.35, rng: () => 0.9 });
    expect(b.branches.length).toBe(0);
  });

  it('spawns branches rooted on the main bolt when rng is low', () => {
    const b = genBolt({ x: 0, y: 0, angle: 0, length: 100, segments: 7, branchChance: 0.35, rng: () => 0.1 });
    expect(b.branches.length).toBeGreaterThan(0);
    for (const br of b.branches) {
      const root = br[0];
      expect(b.points.some(p => p.x === root.x && p.y === root.y)).toBe(true);
    }
  });

  it('jitters interior points perpendicular to the bolt axis', () => {
    const b = genBolt({ x: 0, y: 0, angle: 0, length: 100, segments: 7, rng: () => 0.9 });
    // angle 0 -> perpendicular is y; rng 0.9 -> positive offsets
    const interior = b.points.slice(1, -1);
    expect(interior.some(p => Math.abs(p.y) > 1)).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement `src/fx/boltGen.ts`**

Run: `npx vitest run tests/fx/boltGen.test.ts` → FAIL (module missing). Then:

```ts
// Pure lightning-bolt geometry (no pixi). Midpoint-displacement style jagged
// polyline + optional single-level branches. rng injectable for determinism.
export interface BoltPt { x: number; y: number; }
export interface Bolt { points: BoltPt[]; branches: BoltPt[][]; }

export interface BoltOpts {
  x: number; y: number;        // origin
  angle: number;               // radians
  length: number;              // px
  segments?: number;           // default 7
  jitter?: number;             // perpendicular displacement as fraction of length (default 0.22)
  branchChance?: number;       // per interior vertex (default 0.35)
  rng?: () => number;
}

export function genBolt(o: BoltOpts): Bolt {
  const rng = o.rng ?? Math.random;
  const segs = o.segments ?? 7;
  const jitter = (o.jitter ?? 0.22) * o.length;
  const dx = Math.cos(o.angle), dy = Math.sin(o.angle);
  const nx = -dy, ny = dx; // perpendicular

  const points: BoltPt[] = [{ x: o.x, y: o.y }];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const off = i === segs ? 0 : (rng() - 0.5) * 2 * jitter * (1 - t * 0.6);
    points.push({
      x: o.x + dx * o.length * t + nx * off,
      y: o.y + dy * o.length * t + ny * off,
    });
  }

  const branches: BoltPt[][] = [];
  const chance = o.branchChance ?? 0.35;
  for (let i = 2; i < segs - 1; i++) {
    if (rng() < chance) {
      const side = rng() < 0.5 ? 1 : -1;
      const sub = genBolt({
        x: points[i].x, y: points[i].y,
        angle: o.angle + side * (0.5 + rng() * 0.5),
        length: o.length * 0.42,
        segments: Math.max(3, Math.floor(segs / 2)),
        jitter: o.jitter,
        branchChance: 0, // single-level branching only
        rng,
      });
      branches.push(sub.points);
    }
  }
  return { points, branches };
}
```

- [ ] **Step 4: Run boltGen tests — PASS expected**

Run: `npx vitest run tests/fx/boltGen.test.ts`

- [ ] **Step 5: Rewrite `src/effects/fingertipLightning.ts`** (full new contents)

```ts
import { Container, Graphics } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { FxParticles } from '../fx/particles';
import { genBolt, type Bolt, type BoltPt } from '../fx/boltGen';
import { fingersUp } from '../gesture/handGestures';
import type { Effect, EffectStage, RenderContext } from '../types';

const REGEN_MS = 60;        // bolts re-jitter ~16x/s for live flicker
const ARC_EVERY_MS = 300;   // occasional fingertip-to-fingertip arc
const ARC_LIFE_MS = 90;
const TIP_IDS = [4, 8, 12, 16, 20];
const PIP_IDS = [2, 6, 10, 14, 18];
const GLOW = 0x58c8ff;

// Real branching lightning from each extended fingertip: white cores on a
// GlowFilter'd layer, occasional arcs between fingertips, drifting embers.
export class FingertipLightning implements Effect {
  id = 'fingertip-lightning';
  mode = 'hold' as const;
  private held = false;
  private mounted = false;
  private view = new Container();
  private gfx = new Graphics();
  private ps: FxParticles | null = null;
  private bolts: Bolt[] = [];
  private arcs: Array<{ bolt: Bolt; until: number }> = [];
  private lastGen = 0;
  private lastArc = 0;

  init(stage: EffectStage): void {
    this.ps = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 150);
    this.view.addChild(this.gfx, this.ps.view);
    this.view.filters = [new GlowFilter({ distance: 12, outerStrength: 2.4, color: GLOW, quality: 0.25 })];
    this.view.visible = false;
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void { this.held = true; }
  stop(): void { this.held = false; this.bolts = []; }
  isActive(): boolean { return this.held || (this.ps?.count ?? 0) > 0 || this.arcs.length > 0; }
  reset(): void {
    this.held = false; this.bolts = []; this.arcs = [];
    this.ps?.clear(); this.gfx.clear();
    if (this.mounted) this.view.visible = false;
  }

  update(dt: number, ctx: RenderContext): void {
    if (this.held && ctx.hand) {
      const lm = ctx.hand.landmarks;
      const up = fingersUp(lm);
      const tipPx = TIP_IDS.map(i => ({ x: lm[i].x * ctx.width, y: lm[i].y * ctx.height }));

      if (ctx.now - this.lastGen >= REGEN_MS) {
        this.lastGen = ctx.now;
        this.bolts = [];
        for (let f = 0; f < TIP_IDS.length; f++) {
          if (!up[f]) continue;
          const pip = lm[PIP_IDS[f]];
          const tip = lm[TIP_IDS[f]];
          const ang = Math.atan2(tip.y - pip.y, tip.x - pip.x); // outward along the finger
          for (let k = 0; k < 2; k++) {
            this.bolts.push(genBolt({
              x: tipPx[f].x, y: tipPx[f].y,
              angle: ang + (Math.random() - 0.5) * 1.2,
              length: 60 + Math.random() * 70,
            }));
          }
          if (Math.random() < 0.45) {
            this.ps?.spawn({
              x: tipPx[f].x, y: tipPx[f].y,
              vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 50,
              ay: -25, life: 0.4 + Math.random() * 0.3,
              size: 3 + Math.random() * 3, tint: 0x9fe8ff,
            });
          }
        }
      }

      const upTips = TIP_IDS.map((_, f) => f).filter(f => up[f]);
      if (upTips.length >= 2 && ctx.now - this.lastArc >= ARC_EVERY_MS) {
        this.lastArc = ctx.now;
        const i = upTips[Math.floor(Math.random() * upTips.length)];
        let j = upTips[Math.floor(Math.random() * upTips.length)];
        if (j === i) j = upTips[(upTips.indexOf(i) + 1) % upTips.length];
        const a = tipPx[i], b = tipPx[j];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > 8) {
          this.arcs.push({
            bolt: genBolt({ x: a.x, y: a.y, angle: ang, length: len, branchChance: 0, jitter: 0.12 }),
            until: ctx.now + ARC_LIFE_MS,
          });
        }
      }
    } else {
      this.bolts = [];
    }

    this.arcs = this.arcs.filter(a => a.until > ctx.now);
    this.ps?.update(dt);
    if (this.mounted) {
      this.redraw();
      this.view.visible = this.isActive();
    }
  }

  private poly(points: BoltPt[]): void {
    this.gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.gfx.lineTo(points[i].x, points[i].y);
  }

  private strokePoly(points: BoltPt[], coreWidth: number, glowWidth: number): void {
    this.poly(points);
    this.gfx.stroke({ width: glowWidth, color: GLOW, alpha: 0.35, cap: 'round', join: 'round' });
    this.poly(points);
    this.gfx.stroke({ width: coreWidth, color: 0xffffff, alpha: 0.95, cap: 'round', join: 'round' });
  }

  private redraw(): void {
    this.gfx.clear();
    for (const b of this.bolts) {
      this.strokePoly(b.points, 1.8, 5);
      for (const br of b.branches) this.strokePoly(br, 1.2, 3);
    }
    for (const a of this.arcs) this.strokePoly(a.bolt.points, 2.2, 6);
  }
}
```

- [ ] **Step 6: Rewrite `src/effects/pinchDraw.ts`** (full new contents — same trail capture, neon-green ribbon with true glow)

```ts
import { Container, Graphics } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { Effect, EffectStage, RenderContext } from '../types';

interface Pt { x: number; y: number; }
const NEON = 0x39ff14;

export class PinchDraw implements Effect {
  id = 'pinch-draw';
  mode = 'hold' as const;
  private drawing = false;
  private mounted = false;
  private strokes: Pt[][] = [];
  private current: Pt[] = [];
  private dirty = false;
  private view = new Container();
  private gfx = new Graphics();

  init(stage: EffectStage): void {
    this.view.addChild(this.gfx);
    this.view.filters = [new GlowFilter({ distance: 10, outerStrength: 2.2, color: NEON, quality: 0.25 })];
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void { this.drawing = true; this.current = []; this.strokes.push(this.current); }
  stop(): void { this.drawing = false; }
  isActive(): boolean { return this.strokes.length > 0; }
  clear(): void { this.strokes = []; this.current = []; this.dirty = true; }
  reset(): void { this.drawing = false; this.clear(); }

  update(_dt: number, ctx: RenderContext): void {
    if (this.drawing && ctx.hand) {
      const p = ctx.hand.landmarks[8]; // index fingertip
      this.current.push({ x: p.x * ctx.width, y: p.y * ctx.height });
      this.dirty = true;
    }
    if (this.mounted && this.dirty) {
      this.dirty = false;
      this.redraw();
    }
  }

  private redraw(): void {
    this.gfx.clear();
    for (const s of this.strokes) {
      if (s.length < 2) continue;
      this.gfx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) this.gfx.lineTo(s[i].x, s[i].y);
      this.gfx.stroke({ width: 8, color: NEON, alpha: 0.35, cap: 'round', join: 'round' });
      this.gfx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) this.gfx.lineTo(s[i].x, s[i].y);
      this.gfx.stroke({ width: 2.5, color: 0xffffff, alpha: 0.95, cap: 'round', join: 'round' });
    }
  }
}
```

- [ ] **Step 7: Rewrite `src/effects/palmBlast.ts`** (full new contents — real shockwave ripple + ring + debris + shake)

```ts
import { Container, Graphics, Sprite } from 'pixi.js';
import { FxParticles } from '../fx/particles';
import type { Effect, EffectStage, RenderContext } from '../types';

const DURATION = 0.8; // seconds for the expanding ring
const AMBER = 0xffd27d;

function easeOutCubic(t: number): number { return 1 - Math.pow(1 - t, 3); }

export class PalmBlast implements Effect {
  id = 'palm-blast';
  mode = 'oneshot' as const;
  private pending = false;
  private mounted = false;
  private t = -1;
  private cx = 0;
  private cy = 0;
  private stage: EffectStage | null = null;
  private view = new Container();
  private ring = new Graphics();
  private flashSprite: Sprite | null = null;
  private ps: FxParticles | null = null;

  init(stage: EffectStage): void {
    this.stage = stage;
    this.ps = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 220);
    this.flashSprite = new Sprite(stage.fx.textures.glow);
    this.flashSprite.anchor.set(0.5);
    this.flashSprite.blendMode = 'add';
    this.flashSprite.visible = false;
    this.view.addChild(this.ring, this.flashSprite, this.ps.view);
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void { this.pending = true; }
  stop(): void {}
  isActive(): boolean { return (this.t >= 0 && this.t < DURATION) || (this.ps?.count ?? 0) > 0; }
  reset(): void {
    this.pending = false; this.t = -1;
    this.ps?.clear(); this.ring.clear();
    if (this.flashSprite) this.flashSprite.visible = false;
  }

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
      // 40 glow embers with gravity + 26 fast debris streaks
      for (let k = 0; k < 40; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 150 + Math.random() * 350;
        this.ps?.spawn({
          x: this.cx, y: this.cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          ay: 380, drag: 1.2, life: 0.5 + Math.random() * 0.4,
          size: 3 + Math.random() * 5, tint: AMBER,
        });
      }
      for (let k = 0; k < 26; k++) {
        const a = Math.random() * Math.PI * 2;
        const sp = 500 + Math.random() * 600;
        this.ps?.spawn({
          x: this.cx, y: this.cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
          drag: 2.5, life: 0.25 + Math.random() * 0.2,
          size: 8 + Math.random() * 8, tint: 0xfff3b0, streak: true,
        });
      }
      if (this.stage) {
        this.stage.fx.transients.ripple(this.cx, this.cy, { amplitude: 30, wavelength: 160, speed: 900, duration: 0.7 });
        this.stage.fx.transients.flash(0.35, 0.18);
        this.stage.fx.shake.kick(10);
      }
    }

    if (this.t >= 0) this.t += dt;
    this.ps?.update(dt);
    if (this.mounted) this.redraw(ctx);
  }

  private redraw(ctx: RenderContext): void {
    this.ring.clear();
    if (this.t >= 0 && this.t < DURATION) {
      const p = this.t / DURATION;
      const r = easeOutCubic(p) * Math.min(ctx.width, ctx.height) * 0.55;
      const fade = 1 - p;
      this.ring.circle(this.cx, this.cy, r)
        .stroke({ width: 10 * fade + 2, color: AMBER, alpha: 0.5 * fade });
      this.ring.circle(this.cx, this.cy, r)
        .stroke({ width: 3 * fade + 1, color: 0xffffff, alpha: 0.9 * fade });

      if (this.flashSprite) {
        this.flashSprite.visible = p < 0.35;
        this.flashSprite.position.set(this.cx, this.cy);
        const fs = (40 + p * 260) / 16; // glow tex radius 16
        this.flashSprite.scale.set(fs);
        this.flashSprite.alpha = Math.max(0, 1 - p * 3);
        this.flashSprite.tint = 0xfff7e0;
      }
    } else if (this.flashSprite) {
      this.flashSprite.visible = false;
    }
  }
}
```

The existing `tests/palmBlast.test.ts` keeps passing: `start()` + one `update()` still makes `isActive()` true (particles spawn without `init()` — `ps` is null, but `t` enters `[0, DURATION)`). No test edits needed.

- [ ] **Step 8: Rewrite `src/effects/dimLights.ts`** (full new contents — same state machine, cinematic grade presenter)

```ts
import { Sprite, Texture } from 'pixi.js';
import { classifyOpenFist } from '../gesture/handPose';
import type { Effect, EffectStage, RenderContext } from '../types';

const FADE_SECONDS = 1.5;   // time for a full bright <-> dark sweep
const CONFIRM_FRAMES = 4;   // frames a pose must persist before it flips the target

// Self-driven: fist fades the room down, open hand fades it back up.
// Presenter = cinematic grade on the screen layer: vignette (edges darken first)
// + neutral black + a cool blue multiply for that "night falls" shift.
export class DimLights implements Effect {
  id = 'dim-lights';
  mode = 'toggle' as const; // unused by the driver; this effect self-drives
  enabled = true;
  private level = 0;  // 0 = bright, 1 = fully dim
  private target = 0;
  private pending: 'open' | 'fist' | null = null;
  private confirm = 0;
  private mounted = false;
  private vignette: Sprite | null = null;
  private black: Sprite | null = null;
  private cool: Sprite | null = null;

  init(stage: EffectStage): void {
    this.vignette = new Sprite(stage.fx.textures.vignette);
    this.black = new Sprite(Texture.WHITE);
    this.black.tint = 0x000000;
    this.cool = new Sprite(Texture.WHITE);
    this.cool.tint = 0x223355;
    this.cool.blendMode = 'multiply';
    for (const s of [this.vignette, this.black, this.cool]) {
      s.alpha = 0;
      stage.screen.addChild(s);
    }
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.level > 0.001; }
  reset(): void {
    this.level = 0; this.target = 0; this.pending = null; this.confirm = 0;
    this.sync(0, 0);
  }

  update(dt: number, ctx: RenderContext): void {
    if (!this.enabled) {
      this.target = 0;
    } else if (ctx.hand) {
      const pose = classifyOpenFist(ctx.hand.landmarks);
      if (pose === 'open' || pose === 'fist') {
        if (pose === this.pending) this.confirm++;
        else { this.pending = pose; this.confirm = 1; }
        if (this.confirm >= CONFIRM_FRAMES) this.target = pose === 'fist' ? 1 : 0;
      }
      // 'unknown' (mid-transition): hold the current target and pending pose
    }

    const step = dt / FADE_SECONDS;
    if (this.level < this.target) this.level = Math.min(this.target, this.level + step);
    else if (this.level > this.target) this.level = Math.max(this.target, this.level - step);

    this.sync(ctx.width, ctx.height);
  }

  private sync(w: number, h: number): void {
    if (!this.mounted || !this.vignette || !this.black || !this.cool) return;
    for (const s of [this.vignette, this.black, this.cool]) {
      if (w) { s.width = w; s.height = h; }
    }
    this.vignette.alpha = this.level * 0.92;
    this.black.alpha = this.level * 0.35;
    this.cool.alpha = this.level * 0.25;
  }
}
```

The existing `tests/dimLights.test.ts` passes unchanged — the open/fist/confirm/fade logic is identical and `isActive()` is still purely level-based.

- [ ] **Step 9: Typecheck + full suite**

Run: `npx tsc --noEmit && npm test`
Expected: PASS. (Gun/eyes/fire still carry their old canvas `render()` methods — no longer part of the interface, harmless until Task 6 ports them.)

- [ ] **Step 10: Headless screenshot (boot regression)**

Re-run the headless command from Task 4 (screenshot to `/tmp/cammods-task5.png`) and Read it: camera frame must still render. Effects need gestures so they won't appear — this only guards against boot/typecheck regressions in the live page.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "feat: Effect interface v2 (init/EffectStage) + cinematic lightning, draw, blast, dim ports"
```

---

### Task 6: Port Gun (gunCore TDD), Lightning Eyes, Fire Breath; delete old particle system

**Files:**
- Create: `src/effects/gunCore.ts` + Test: `tests/effects/gunCore.test.ts`
- Rewrite: `src/effects/gunShot.ts`, `src/effects/lightningEyes.ts`, `src/effects/fireBreath.ts`
- Modify: `src/types.ts` (make `init` required)
- Delete: `src/effects/particleSystem.ts`, `tests/particleSystem.test.ts`

- [ ] **Step 1: Write the failing gunCore test**

Create `tests/effects/gunCore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { GunCore } from '../../src/effects/gunCore';

const gun = (thumbUp: boolean) => ({ isGun: true, thumbUp });

describe('GunCore', () => {
  it('fires on cock (thumb up) -> trigger (thumb drop)', () => {
    const c = new GunCore();
    expect(c.step(gun(true), 0)).toBe(false);   // cocked
    expect(c.step(gun(false), 100)).toBe(true); // bang
  });

  it('does not fire without a prior cock', () => {
    const c = new GunCore();
    expect(c.step(gun(false), 100)).toBe(false);
  });

  it('respects the 350ms cooldown but fires again after it', () => {
    const c = new GunCore();
    c.step(gun(true), 0);
    expect(c.step(gun(false), 10)).toBe(true);
    c.step(gun(true), 50);                       // re-cock immediately
    expect(c.step(gun(false), 200)).toBe(false); // still cooling down
    expect(c.step(gun(false), 400)).toBe(true);  // cooldown elapsed, still cocked
  });

  it('losing the gun pose un-cocks', () => {
    const c = new GunCore();
    c.step(gun(true), 0);
    c.step({ isGun: false, thumbUp: false }, 50);
    expect(c.step(gun(false), 100)).toBe(false);
  });

  it('a null frame (no hand) un-cocks', () => {
    const c = new GunCore();
    c.step(gun(true), 0);
    c.step(null, 50);
    expect(c.step(gun(false), 100)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement `src/effects/gunCore.ts`**

Run: `npx vitest run tests/effects/gunCore.test.ts` → FAIL. Then:

```ts
// Pure finger-gun trigger logic for ONE hand (the effect keeps one core per hand).
// Cock with thumb up; dropping the thumb fires if cocked and off cooldown.
// If the cooldown blocks a fire, the hammer STAYS cocked (matches v1 behavior)
// so the shot happens as soon as the cooldown expires.
const COOLDOWN_MS = 350;

export interface GunPose { isGun: boolean; thumbUp: boolean; }

export class GunCore {
  private cocked = false;
  private lastShot = -Infinity;

  step(pose: GunPose | null, now: number): boolean {
    if (!pose || !pose.isGun) { this.cocked = false; return false; }
    if (pose.thumbUp) { this.cocked = true; return false; }
    if (this.cocked && now - this.lastShot >= COOLDOWN_MS) {
      this.cocked = false;
      this.lastShot = now;
      return true;
    }
    return false;
  }

  reset(): void { this.cocked = false; }
}
```

- [ ] **Step 3: Run gunCore tests — PASS expected**

Run: `npx vitest run tests/effects/gunCore.test.ts`

- [ ] **Step 4: Rewrite `src/effects/gunShot.ts`** (full new contents)

```ts
import { Container, Sprite } from 'pixi.js';
import { FxParticles } from '../fx/particles';
import { GunCore } from './gunCore';
import { playBang } from '../fx/sfx';
import { fingersUp } from '../gesture/handGestures';
import type { Effect, EffectStage, HandLandmarks, RenderContext } from '../types';

const FLASH_SECONDS = 0.09;

// Finger-gun: index out, others curled. Thumb up cocks; dropping the thumb fires.
// Cinematic kit: 4-point star muzzle flash, tracer streaks, drifting smoke,
// frame flash + screen kick. (Dual-wield lands with two-hand tracking in Task 9.)
export class GunShot implements Effect {
  id = 'gun-shot';
  mode = 'oneshot' as const;
  enabled = true;
  private core = new GunCore();
  private mounted = false;
  private stage: EffectStage | null = null;
  private view = new Container();
  private flashA: Sprite | null = null; // elongated star arm
  private flashB: Sprite | null = null; // crossed star arm
  private flashCore: Sprite | null = null;
  private ps: FxParticles | null = null;
  private smoke: FxParticles | null = null;
  private flash = -1;
  private fx = 0; private fy = 0;
  private dirx = 1; private diry = 0;

  init(stage: EffectStage): void {
    this.stage = stage;
    this.ps = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 80);
    this.smoke = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 40);
    this.flashA = new Sprite(stage.fx.textures.streak);
    this.flashB = new Sprite(stage.fx.textures.streak);
    this.flashCore = new Sprite(stage.fx.textures.glow);
    for (const s of [this.flashA, this.flashB, this.flashCore]) {
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = 0xfff3b0;
      s.visible = false;
    }
    this.view.addChild(this.smoke.view, this.flashA, this.flashB, this.flashCore, this.ps.view);
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.flash > 0 || (this.ps?.count ?? 0) > 0 || (this.smoke?.count ?? 0) > 0; }
  reset(): void {
    this.flash = -1; this.core.reset();
    this.ps?.clear(); this.smoke?.clear();
    this.hideFlash();
  }

  update(dt: number, ctx: RenderContext): void {
    if (this.flash > 0) this.flash -= dt;
    this.ps?.update(dt);
    this.smoke?.update(dt);

    if (this.enabled && ctx.hand) {
      const lm = ctx.hand.landmarks;
      const f = fingersUp(lm);
      const isGun = f[1] && !f[2] && !f[3] && !f[4];
      if (this.core.step({ isGun, thumbUp: f[0] }, ctx.now)) this.shoot(lm, ctx);
    } else {
      this.core.step(null, ctx.now);
    }

    if (this.mounted) this.syncFlash();
  }

  private shoot(lm: HandLandmarks, ctx: RenderContext): void {
    const tip = lm[8], base = lm[5];
    this.fx = tip.x * ctx.width;
    this.fy = tip.y * ctx.height;
    let dx = (tip.x - base.x) * ctx.width, dy = (tip.y - base.y) * ctx.height;
    const len = Math.hypot(dx, dy) || 1;
    this.dirx = dx / len; this.diry = dy / len;
    this.flash = FLASH_SECONDS;

    const ang = Math.atan2(this.diry, this.dirx);
    // 8 tracers down the barrel
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 0.25;
      const sp = 900 + Math.random() * 500;
      this.ps?.spawn({
        x: this.fx, y: this.fy,
        vx: Math.cos(ang + spread) * sp, vy: Math.sin(ang + spread) * sp,
        life: 0.12, size: 7, tint: 0xfff3b0, streak: true,
      });
    }
    // 14 sparks
    for (let i = 0; i < 14; i++) {
      const a = ang + (Math.random() - 0.5) * 1.2;
      const sp = 250 + Math.random() * 550;
      this.ps?.spawn({
        x: this.fx, y: this.fy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        ay: 300, drag: 1.5, life: 0.18 + Math.random() * 0.22,
        size: 2 + Math.random() * 3, tint: Math.random() < 0.5 ? 0xfff3b0 : 0xffb142,
      });
    }
    // 5 smoke puffs (normal blend, drift + grow + fade)
    for (let i = 0; i < 5; i++) {
      this.smoke?.spawn({
        x: this.fx + this.dirx * 14, y: this.fy + this.diry * 14,
        vx: this.dirx * 40 + (Math.random() - 0.5) * 30,
        vy: this.diry * 40 - 20 - Math.random() * 25,
        drag: 1.2, life: 1.1 + Math.random() * 0.5, grow: 1.4,
        size: 8 + Math.random() * 8, tint: 0x9a9a9a, alpha: 0.32, additive: false,
      });
    }
    this.stage?.fx.transients.flash(0.18, 0.12);
    this.stage?.fx.shake.kick(6);
    playBang();
  }

  private syncFlash(): void {
    if (!this.flashA || !this.flashB || !this.flashCore) return;
    const on = this.flash > 0;
    this.flashA.visible = this.flashB.visible = this.flashCore.visible = on;
    if (!on) return;
    const a = this.flash / FLASH_SECONDS;
    const ang = Math.atan2(this.diry, this.dirx);
    const cx = this.fx + this.dirx * 12, cy = this.fy + this.diry * 12;
    this.flashA.position.set(cx, cy);
    this.flashB.position.set(cx, cy);
    this.flashCore.position.set(cx, cy);
    this.flashA.rotation = ang;
    this.flashB.rotation = ang + Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    this.flashA.scale.set(1.6 + (1 - a), 0.9);
    this.flashB.scale.set(0.9 + (1 - a) * 0.6, 0.55);
    this.flashCore.scale.set((20 + (1 - a) * 16) / 16);
    this.flashA.alpha = this.flashB.alpha = a;
    this.flashCore.alpha = a;
  }

  private hideFlash(): void {
    if (this.flashA && this.flashB && this.flashCore) {
      this.flashA.visible = this.flashB.visible = this.flashCore.visible = false;
    }
  }
}
```

The existing `tests/gunShot.test.ts` keeps passing — same pose semantics via `GunCore`, `isActive()` becomes true on the firing frame because `flash` is set even without `init()`.

- [ ] **Step 5: Rewrite `src/effects/lightningEyes.ts`** (full new contents)

```ts
import { Container, Graphics, Sprite } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { genBolt, type BoltPt } from '../fx/boltGen';
import { leftEyeCenter, rightEyeCenter } from '../facePose';
import type { Effect, EffectStage, Landmark, RenderContext } from '../types';

interface Pt { x: number; y: number; }
const REGEN_MS = 60;
const EYE_ARC_EVERY_MS = 2500;
const EYE_ARC_LIFE_MS = 120;
const GLOW = 0x58c8ff;

// Pulsing white-blue eye cores + anamorphic flare streaks + mini bolts,
// with a rare arc jumping between the eyes. Self-driven by face tracking.
export class LightningEyes implements Effect {
  id = 'lightning-eyes';
  mode = 'toggle' as const;
  enabled = false;
  private drawing = false;
  private mounted = false;
  private view = new Container();
  private gfx = new Graphics();
  private cores: Sprite[] = [];
  private flares: Sprite[] = [];
  private left: Pt = { x: 0, y: 0 };
  private right: Pt = { x: 0, y: 0 };
  private scale = 40;
  private lastGen = 0;
  private lastEyeArc = 0;
  private bolts: BoltPt[][] = [];
  private arc: { pts: BoltPt[]; until: number } | null = null;

  init(stage: EffectStage): void {
    for (let i = 0; i < 2; i++) {
      const core = new Sprite(stage.fx.textures.glow);
      core.anchor.set(0.5); core.blendMode = 'add'; core.tint = 0xdcfaff;
      const flare = new Sprite(stage.fx.textures.streak);
      flare.anchor.set(0.5); flare.blendMode = 'add'; flare.tint = 0x9fe8ff;
      this.cores.push(core); this.flares.push(flare);
    }
    this.view.addChild(this.gfx, ...this.flares, ...this.cores);
    this.view.filters = [new GlowFilter({ distance: 10, outerStrength: 2, color: GLOW, quality: 0.25 })];
    this.view.visible = false;
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.drawing; }
  reset(): void {
    this.drawing = false; this.bolts = []; this.arc = null;
    if (this.mounted) this.view.visible = false;
  }

  update(_dt: number, ctx: RenderContext): void {
    this.drawing = this.enabled && !!ctx.face;
    if (this.mounted) this.view.visible = this.drawing;
    if (!this.drawing || !ctx.face) return;

    const lm = ctx.face.landmarks;
    this.left = this.toPx(leftEyeCenter(lm), ctx);
    this.right = this.toPx(rightEyeCenter(lm), ctx);
    this.scale = Math.max(20, Math.hypot(this.left.x - this.right.x, this.left.y - this.right.y));

    if (ctx.now - this.lastGen >= REGEN_MS) {
      this.lastGen = ctx.now;
      this.bolts = [];
      for (const eye of [this.left, this.right]) {
        for (let i = 0; i < 2; i++) {
          const b = genBolt({
            x: eye.x, y: eye.y,
            angle: Math.random() * Math.PI * 2,
            length: this.scale * (0.5 + Math.random() * 0.8),
            segments: 5, branchChance: 0.2,
          });
          this.bolts.push(b.points, ...b.branches);
        }
      }
    }

    if (ctx.now - this.lastEyeArc >= EYE_ARC_EVERY_MS) {
      this.lastEyeArc = ctx.now;
      const ang = Math.atan2(this.right.y - this.left.y, this.right.x - this.left.x);
      this.arc = {
        pts: genBolt({ x: this.left.x, y: this.left.y, angle: ang, length: this.scale, branchChance: 0, jitter: 0.1 }).points,
        until: ctx.now + EYE_ARC_LIFE_MS,
      };
    }
    if (this.arc && this.arc.until < ctx.now) this.arc = null;

    if (this.mounted) this.redraw(ctx.now);
  }

  private toPx(p: Landmark, ctx: RenderContext): Pt {
    return { x: p.x * ctx.width, y: p.y * ctx.height };
  }

  private redraw(now: number): void {
    const pulse = 0.85 + 0.15 * Math.sin(now / 90);
    [this.left, this.right].forEach((eye, i) => {
      const core = this.cores[i], flare = this.flares[i];
      core.position.set(eye.x, eye.y);
      core.scale.set((this.scale * 0.5 * pulse) / 16);
      core.alpha = 0.95 * pulse;
      flare.position.set(eye.x, eye.y);
      flare.scale.set((this.scale * 2.6) / 64, 0.32); // long thin horizontal streak
      flare.alpha = 0.5 * pulse;
    });

    this.gfx.clear();
    for (const pts of this.bolts) this.stroke(pts, 1.4, 4);
    if (this.arc) this.stroke(this.arc.pts, 2, 5);
  }

  private stroke(points: BoltPt[], coreW: number, glowW: number): void {
    this.gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.gfx.lineTo(points[i].x, points[i].y);
    this.gfx.stroke({ width: glowW, color: GLOW, alpha: 0.35, cap: 'round', join: 'round' });
    this.gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.gfx.lineTo(points[i].x, points[i].y);
    this.gfx.stroke({ width: coreW, color: 0xffffff, alpha: 0.9, cap: 'round', join: 'round' });
  }
}
```

- [ ] **Step 6: Rewrite `src/effects/fireBreath.ts`** (full new contents — same mouth logic/tests, FxParticles presenter)

```ts
import { Container } from 'pixi.js';
import { FxParticles } from '../fx/particles';
import { mouthOpenness, mouthCenter, breathDirection } from '../facePose';
import type { Effect, EffectStage, RenderContext } from '../types';

const MAX_EMBERS = 150;

// Fire color over age: white-yellow core -> orange -> deep red.
function fireTint(t: number): number {
  const [r, g, b] = t < 0.35
    ? [255, Math.round(245 - 95 * (t / 0.35)), Math.round(200 - 160 * (t / 0.35))]
    : [Math.round(255 - 70 * ((t - 0.35) / 0.65)), Math.round(150 - 120 * ((t - 0.35) / 0.65)), Math.round(40 - 30 * ((t - 0.35) / 0.65))];
  return (r << 16) | (g << 8) | b;
}

export class FireBreath implements Effect {
  id = 'fire-breath';
  mode = 'toggle' as const; // unused by the driver; this effect self-drives
  enabled = true;
  private mounted = false;
  private emberCount = 0; // tracked for isActive() without init() (jsdom tests)
  private ps: FxParticles | null = null;
  private smoke: FxParticles | null = null;
  private view = new Container();

  init(stage: EffectStage): void {
    this.ps = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, MAX_EMBERS);
    this.smoke = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 50);
    this.view.addChild(this.smoke.view, this.ps.view);
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.mounted ? (this.ps!.count > 0 || this.smoke!.count > 0) : this.emberCount > 0; }
  reset(): void { this.ps?.clear(); this.smoke?.clear(); this.emberCount = 0; }

  update(dt: number, ctx: RenderContext): void {
    if (this.enabled && ctx.face) {
      const intensity = mouthOpenness(ctx.face.landmarks);
      if (intensity > 0.02) this.emit(intensity, ctx);
    }
    this.ps?.update(dt);
    this.smoke?.update(dt);
    // headless counter decays roughly like a 0.45-0.9s ember lifetime
    this.emberCount = Math.max(0, this.emberCount - dt * 80);
  }

  private emit(intensity: number, ctx: RenderContext): void {
    const m = mouthCenter(ctx.face!.landmarks);
    const dir = breathDirection(ctx.face!.landmarks);
    const px = m.x * ctx.width, py = m.y * ctx.height;
    const perp = { x: -dir.y, y: dir.x };

    const count = Math.round(2 + 6 * intensity);
    this.emberCount = Math.min(MAX_EMBERS, this.emberCount + count);
    for (let i = 0; i < count; i++) {
      const speed = (160 + Math.random() * 320) * (0.5 + intensity);
      const spread = (Math.random() - 0.5) * 0.5;
      const t = Math.random();
      const life = 0.45 + Math.random() * 0.45;
      this.ps?.spawn({
        x: px + perp.x * (Math.random() - 0.5) * 16,
        y: py + perp.y * (Math.random() - 0.5) * 16,
        vx: (dir.x + perp.x * spread) * speed,
        vy: (dir.y + perp.y * spread) * speed,
        ay: -130, drag: 1.4, life,
        size: 8 + Math.random() * 14, grow: 1.2,
        tint: fireTint(t), alpha: 0.85,
      });
      if (Math.random() < 0.18) {
        this.smoke?.spawn({
          x: px, y: py,
          vx: dir.x * speed * 0.4, vy: dir.y * speed * 0.4 - 30,
          drag: 1.0, life: 1.2, grow: 1.6,
          size: 10 + Math.random() * 10, tint: 0x777777, alpha: 0.2, additive: false,
        });
      }
    }
  }
}
```

> `tests/fireBreath.test.ts` asserts `isActive()` right after an open-mouth update and false otherwise — the `emberCount` shadow counter keeps that true without a renderer.

- [ ] **Step 7: Make `init` required in `src/types.ts`**

Change the optional signature to required now that all 7 effects implement it:

```ts
  init(stage: EffectStage): void; // mount display objects (called once by the compositor)
```

And in `src/pixiCompositor.ts` change `e.init?.(stage)` to `e.init(stage)`.

- [ ] **Step 8: Delete the old particle system**

```bash
git rm src/effects/particleSystem.ts tests/particleSystem.test.ts
```

(`FxParticles` + `particleCore` own this niche now; keeping both would drift.)

- [ ] **Step 9: Typecheck + full suite + headless screenshot**

Run: `npx tsc --noEmit && npm test`
Expected: PASS — including untouched `gunShot/dimLights/fireBreath/palmBlast` tests.
Then re-run the Task 4 headless command (`/tmp/cammods-task6.png`) and Read it — camera frame still renders.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: cinematic gun/eyes/fire ports on the FX kit; retire canvas particle system"
```

---

### Task 7: Filter rigs — Glitch v2 + CRT v2

**Files:**
- Create: `src/filters/glitch.ts`, `src/filters/crt.ts`
- Modify: `src/filters/index.ts`
- Test: `tests/filters/registry.test.ts`

- [ ] **Step 1: Create `src/filters/glitch.ts`**

```ts
import { GlitchFilter, RGBSplitFilter } from 'pixi-filters';
import type { FilterRig } from './index';

// Quiet/burst rhythm: mostly-clean signal with violent 0.12-0.35s glitch bursts
// every 0.9-2.2s, plus a constant subliminal RGB fringe.
export function buildGlitchRig(): FilterRig {
  const glitch = new GlitchFilter({ slices: 12, offset: 0, red: { x: 0, y: 0 }, blue: { x: 0, y: 0 }, green: { x: 0, y: 0 } });
  const rgb = new RGBSplitFilter({ red: { x: 1, y: 0 }, green: { x: -1, y: 0 }, blue: { x: 0, y: 1 } });

  let burstLeft = 0;
  let nextBurst = 0.6 + Math.random();

  return {
    filters: [glitch, rgb],
    update(dt: number) {
      nextBurst -= dt;
      if (nextBurst <= 0) {
        burstLeft = 0.12 + Math.random() * 0.23;
        nextBurst = 0.9 + Math.random() * 1.3;
        glitch.refresh(); // re-randomize slice layout per burst
      }
      if (burstLeft > 0) {
        burstLeft -= dt;
        glitch.offset = 18 + Math.random() * 42;
        const a = Math.random() * Math.PI * 2, m = 2 + Math.random() * 4;
        rgb.red = { x: Math.cos(a) * m, y: Math.sin(a) * m };
        rgb.blue = { x: -Math.cos(a) * m, y: -Math.sin(a) * m };
        if (Math.random() < 0.2) glitch.refresh(); // mid-burst jump
      } else {
        glitch.offset = 0;
        rgb.red = { x: 1, y: 0 };
        rgb.blue = { x: -1, y: 0 };
      }
    },
    destroy() { glitch.destroy(); rgb.destroy(); },
  };
}
```

- [ ] **Step 2: Create `src/filters/crt.ts`**

```ts
import { ColorMatrixFilter } from 'pixi.js';
import { CRTFilter } from 'pixi-filters';
import type { FilterRig } from './index';

// Barrel-curved CRT: scanlines, animated noise, vignette, green-cyan phosphor
// tint, and a 13Hz brightness flicker.
export function buildCrtRig(): FilterRig {
  const crt = new CRTFilter({
    curvature: 2.2,
    lineWidth: 3,
    lineContrast: 0.28,
    noise: 0.12,
    noiseSize: 1,
    vignetting: 0.28,
    vignettingAlpha: 0.9,
    vignettingBlur: 0.3,
    seed: Math.random(),
  });
  const tint = new ColorMatrixFilter();
  // gentle phosphor green-cyan cast
  tint.matrix = [
    0.92, 0.02, 0.02, 0, 0,
    0.02, 1.0, 0.02, 0, 0,
    0.02, 0.06, 0.96, 0, 0,
    0, 0, 0, 1, 0,
  ];

  return {
    filters: [crt, tint],
    update(dt: number, t: number) {
      crt.time += dt * 8;            // scrolling interference
      crt.seed = Math.random();      // live noise
      const flicker = 0.985 + 0.015 * Math.sin(t * 2 * Math.PI * 13);
      tint.brightness(flicker * 0.98, false);
      // brightness() resets the matrix, so re-apply the cast on top
      const m = tint.matrix;
      m[0] *= 0.92; m[6] *= 1.0; m[12] *= 0.96;
      m[1] += 0.02; m[2] += 0.02; m[5] += 0.02; m[7] += 0.02; m[10] += 0.02; m[11] += 0.06;
    },
    destroy() { crt.destroy(); tint.destroy(); },
  };
}
```

- [ ] **Step 3: Register both in `src/filters/index.ts`**

Replace the `buildFilterRig` switch with:

```ts
import { buildGlitchRig } from './glitch';
import { buildCrtRig } from './crt';

export function buildFilterRig(id: ScreenFilter): FilterRig | null {
  switch (id) {
    case 'glitch': return buildGlitchRig();
    case 'crt': return buildCrtRig();
    default: return null;
  }
}
```

(Keep the existing `import type { Filter } from 'pixi.js';`, `ScreenFilter`, `SCREEN_FILTERS`, `FilterRig` exports. Circular-import note: `glitch.ts`/`crt.ts` import only the *type* `FilterRig` from `./index`, which is erased at compile time — safe.)

- [ ] **Step 4: Write the registry test**

Create `tests/filters/registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SCREEN_FILTERS, buildFilterRig } from '../../src/filters';

describe('filter registry', () => {
  it('lists none/glitch/crt/cyberpunk in dropdown order', () => {
    expect(SCREEN_FILTERS.map(f => f.id)).toEqual(['none', 'glitch', 'crt', 'cyberpunk']);
  });

  it('builds a live rig for every non-none filter', () => {
    for (const { id } of SCREEN_FILTERS) {
      const rig = buildFilterRig(id);
      if (id === 'none') {
        expect(rig).toBeNull();
      } else if (id === 'cyberpunk') {
        // rig lands in Task 8 — tolerate null until then
        if (rig) { expect(rig.filters.length).toBeGreaterThan(0); rig.destroy(); }
      } else {
        expect(rig).not.toBeNull();
        expect(rig!.filters.length).toBeGreaterThan(0);
        rig!.update(1 / 60, 0.5); // animator must not throw
        rig!.destroy();
      }
    }
  });
});
```

- [ ] **Step 5: Run tests** — `npx vitest run tests/filters/registry.test.ts` then `npm test`. Expected: PASS. (Filter construction is pure JS; no renderer needed. If a constructor touches WebGL in jsdom and throws, wrap that specific assertion in a documented skip and rely on the screenshot check instead — note it in the commit.)

- [ ] **Step 6: Headless screenshot per filter**

With the dev server running:

```bash
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for f in glitch crt; do
  "$CHROME" --headless=new --enable-unsafe-swiftshader \
    --use-fake-device-for-media-stream --use-fake-ui-for-media-stream \
    --window-size=1280,800 --virtual-time-budget=20000 \
    --screenshot=/tmp/cammods-$f.png "http://localhost:5173/?clean=1&autostart=1&filter=$f"
done
```

`?filter=` doesn't exist yet — **add it now** in `src/main.ts` right after the `params` block from Task 4:

```ts
const filterParam = params.get('filter') as ScreenFilter | null;
if (filterParam && SCREEN_FILTERS.some(f => f.id === filterParam)) {
  currentScreenFilter = filterParam;
  screenFxSelect.value = filterParam;
}
```

Place it AFTER the screen-FX dropdown setup (so `currentScreenFilter`/`screenFxSelect` exist) and BEFORE `start()` can run — concretely: move the `params`/clean/autostart block to the very end of `main.ts`, with the filter-param lines inserted between `if (params.get('clean')…)` and `if (params.get('autostart')…)`.

Read both PNGs: glitch shows RGB fringing/slice tears (at least the idle ±1px fringe; bursts are luck-of-timing), crt shows scanlines + barrel-darkened corners.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(filters): shader-grade Glitch v2 + CRT v2 rigs, ?filter= deep link"
```

---

### Task 8: Cyberpunk filter rig

**Files:**
- Create: `src/filters/cyberpunk.ts`
- Modify: `src/filters/index.ts`, `tests/filters/registry.test.ts`

- [ ] **Step 1: Create `src/filters/cyberpunk.ts`**

```ts
import { ColorMatrixFilter } from 'pixi.js';
import { AdvancedBloomFilter, CRTFilter, RGBSplitFilter } from 'pixi-filters';
import type { FilterRig } from './index';

// Neon split-tone: shadows pushed blue-purple, highlights pink/cyan, real bloom
// on the highlights, a fixed 1.5px chromatic fringe, faint scanline shimmer.
export function buildCyberpunkRig(): FilterRig {
  const grade = new ColorMatrixFilter();
  grade.matrix = [
    1.08, -0.05, 0.10, 0, -0.02,  // R: lift highs toward pink
    -0.06, 0.95, 0.12, 0, 0.00,   // G: slightly suppressed
    0.10, 0.05, 1.18, 0, 0.05,    // B: lifted (shadows go blue-purple)
    0, 0, 0, 1, 0,
  ];
  const bloom = new AdvancedBloomFilter({
    threshold: 0.45, bloomScale: 0.9, brightness: 1.0, blur: 6, quality: 4,
  });
  const fringe = new RGBSplitFilter({ red: { x: 1.5, y: 0 }, green: { x: 0, y: 0 }, blue: { x: -1.5, y: 0 } });
  const scan = new CRTFilter({
    curvature: 0, lineWidth: 2, lineContrast: 0.06, noise: 0.03, noiseSize: 1,
    vignetting: 0.22, vignettingAlpha: 0.7, vignettingBlur: 0.4,
  });

  return {
    filters: [grade, bloom, fringe, scan],
    update(dt: number) {
      scan.time += dt * 4; // slow scanline shimmer
      scan.seed = Math.random();
    },
    destroy() { grade.destroy(); bloom.destroy(); fringe.destroy(); scan.destroy(); },
  };
}
```

(If Task 1 found `AdvancedBloomFilter` missing, use `BloomFilter({ strength: 8 })` and drop `threshold` — the registry test stays identical.)

- [ ] **Step 2: Register it** — in `src/filters/index.ts` add `import { buildCyberpunkRig } from './cyberpunk';` and the case `case 'cyberpunk': return buildCyberpunkRig();`.

- [ ] **Step 3: Tighten the registry test** — in `tests/filters/registry.test.ts`, delete the `else if (id === 'cyberpunk') { … }` tolerance branch so cyberpunk goes through the strict `else` path (non-null rig, filters present, update doesn't throw, destroy).

- [ ] **Step 4: Run tests + screenshot**

Run: `npm test` → PASS.
Headless screenshot with `&filter=cyberpunk` (as Task 7 Step 6, output `/tmp/cammods-cyberpunk.png`) and Read it: expect the magenta/blue grade vs. the plain frame.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(filters): cyberpunk neon split-tone + bloom rig"
```

---

### Task 9: Two-hand tracking (tracker, types, engine, dim, gun dual-wield)

**Files:**
- Modify: `src/handTracker.ts`, `src/types.ts`, `src/gesture/gestureEngine.ts`, `src/pixiCompositor.ts`, `src/effects/dimLights.ts`, `src/effects/gunShot.ts`
- Test: `tests/gestureEngine.test.ts` (extend), `tests/dimLights.test.ts` (extend), `tests/gunShot.test.ts` (extend)

- [ ] **Step 1: Write the failing engine test** — append to `tests/gestureEngine.test.ts`:

```ts
describe('GestureEngine (multi-hand)', () => {
  it('fires when ANY hand matches', () => {
    const e = new GestureEngine(
      [{ effectId: 'fx', test: lm => lm[0].x > 0.5 }],
      { cooldownMs: 800 },
    );
    const miss: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
    const hit: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 1, y: 0, z: 0 }));
    const r = e.update([miss, hit], 0);
    expect(r.fired).toContain('fx');
  });

  it('still accepts a single HandLandmarks argument (back-compat)', () => {
    const e = new GestureEngine([toggleBinding('fx', { on: true })], {});
    expect(e.update(anyHand, 0).fired).toContain('fx');
  });

  it('returns nothing for an empty hands array', () => {
    const e = new GestureEngine([toggleBinding('fx', { on: true })], {});
    expect(e.update([], 0).active.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run tests/gestureEngine.test.ts` → FAIL (update doesn't accept arrays).

- [ ] **Step 3: Implement multi-hand `update` in `src/gesture/gestureEngine.ts`** — replace the `update` method:

```ts
  // Accepts one hand, several hands, or null. A binding matches if ANY hand passes.
  update(live: HandLandmarks | HandLandmarks[] | null, now: number): GestureEngineResult {
    const fired: string[] = [];
    const active = new Set<string>();
    // Normalize to HandLandmarks[]. live[0] is a Landmark object for a single
    // hand and an array for a list of hands; an empty list has live[0] === undefined,
    // so it needs its own arm (Array.isArray(undefined) is false and would mis-wrap it).
    const hands: HandLandmarks[] =
      live == null ? []
      : Array.isArray(live[0]) ? (live as HandLandmarks[])
      : (live as HandLandmarks).length === 0 ? []
      : [live as HandLandmarks];
    if (hands.length === 0) return { fired, active };

    // In exclusive mode the bindings array order is the priority: the first
    // binding whose pose matches wins, so an ambiguous pose only triggers one effect.
    for (const b of this.bindings) {
      if (!hands.some(h => b.test(h))) continue;
      active.add(b.effectId);
      const last = this.lastFired.get(b.effectId) ?? -Infinity;
      if (now - last >= this.cooldownMs) {
        fired.push(b.effectId);
        this.lastFired.set(b.effectId, now);
      }
      if (this.exclusive) break;
    }
    return { fired, active };
  }
```

- [ ] **Step 4: Run engine tests — PASS expected**, then wire the rest:

(a) `src/handTracker.ts`: `numHands: 1` → `numHands: 2`.

(b) `src/types.ts` — add `hands` to `RenderContext`:

```ts
export interface RenderContext {
  width: number;
  height: number;
  hand: HandResult | null;  // primary hand (hands[0] ?? null)
  hands: HandResult[];      // all tracked hands this frame (0-2)
  face: FaceResult | null;  // primary face this frame (null unless face tracking on)
  now: number;              // ms
}
```

(c) `src/pixiCompositor.ts` — build the ctx with all hands and feed the engine all hands:

```ts
    const ctx: RenderContext = { width: w, height: h, hand, hands, face, now };
    const result = this.engine.update(hands.map(hd => hd.landmarks), now);
```

(d) Fix every test fixture that builds a `RenderContext` literal — add `hands`:
in `tests/dimLights.test.ts`, `tests/gunShot.test.ts`, `tests/palmBlast.test.ts`, `tests/fireBreath.test.ts` change the `ctx(…)` helpers to include `hands: h ? [h] : []` (dim), `hands: [hand]` (gun), `hands: [{ landmarks, handedness: 'Right' }]` (blast), `hands: []` (fire). Example for dim:

```ts
function ctx(h: HandResult | null): RenderContext {
  return { width: 100, height: 100, hand: h, hands: h ? [h] : [], face: null, now: 0 };
}
```

- [ ] **Step 5: Dim multi-hand priority (failing test first)** — append to `tests/dimLights.test.ts`:

```ts
  it('a fist on EITHER hand dims even when the other hand is open', () => {
    const d = new DimLights();
    const both: RenderContext = {
      width: 100, height: 100,
      hand: hand('open'), hands: [hand('open'), hand('fist')],
      face: null, now: 0,
    };
    for (let i = 0; i < 120; i++) d.update(1 / 60, both);
    expect(d.isActive()).toBe(true);
  });
```

Run → FAIL (dim only looks at `ctx.hand`, the open one). Then in `src/effects/dimLights.ts` replace the pose-reading block inside `update`:

```ts
    } else if (ctx.hands.length > 0) {
      // Deterministic priority: any fist dims; otherwise any open hand brightens.
      const poses = ctx.hands.map(h => classifyOpenFist(h.landmarks));
      const pose = poses.includes('fist') ? 'fist' : poses.includes('open') ? 'open' : null;
      if (pose) {
        if (pose === this.pending) this.confirm++;
        else { this.pending = pose; this.confirm = 1; }
        if (this.confirm >= CONFIRM_FRAMES) this.target = pose === 'fist' ? 1 : 0;
      }
      // ambiguous hands only: hold the current target and pending pose
    }
```

(change the condition from `ctx.hand` to `ctx.hands.length > 0`). Run → PASS.

- [ ] **Step 6: Gun dual-wield (failing test first)** — append to `tests/gunShot.test.ts`:

```ts
  it('two hands fire independently (dual wield)', () => {
    const g = new GunShot();
    const L = (up: boolean): HandResult => ({ landmarks: gunHand(up), handedness: 'Left' });
    const R = (up: boolean): HandResult => ({ landmarks: gunHand(up), handedness: 'Right' });
    const mk = (l: HandResult, r: HandResult, now: number): RenderContext =>
      ({ width: 200, height: 200, hand: l, hands: [l, r], face: null, now });

    g.update(1 / 60, mk(L(true), R(true), 0));     // both cocked
    g.update(1 / 60, mk(L(false), R(true), 100));  // left fires
    expect(g.isActive()).toBe(true);
    g.update(1 / 60, mk(L(false), R(false), 120)); // right fires immediately after
    expect(g.isActive()).toBe(true);
  });
```

Run → FAIL (single shared core: right hand's state was clobbered). Then in `src/effects/gunShot.ts`:

```ts
  private cores: Record<'Left' | 'Right', GunCore> = { Left: new GunCore(), Right: new GunCore() };
```

replace the single `core` field, and replace the pose block in `update`:

```ts
    if (this.enabled && ctx.hands.length > 0) {
      const seen = new Set<string>();
      for (const hd of ctx.hands) {
        seen.add(hd.handedness);
        const lm = hd.landmarks;
        const f = fingersUp(lm);
        const isGun = f[1] && !f[2] && !f[3] && !f[4];
        if (this.cores[hd.handedness].step({ isGun, thumbUp: f[0] }, ctx.now)) this.shoot(lm, ctx);
      }
      for (const side of ['Left', 'Right'] as const) {
        if (!seen.has(side)) this.cores[side].step(null, ctx.now);
      }
    } else {
      this.cores.Left.step(null, ctx.now);
      this.cores.Right.step(null, ctx.now);
    }
```

and `reset()` resets both cores. Note: each `GunCore` has its own 350ms cooldown, so near-simultaneous left/right shots both land (the test fires them 20ms apart). Run → PASS.

- [ ] **Step 7: Full suite + typecheck + screenshot** — `npx tsc --noEmit && npm test`, then the Task 4 headless command. All green; frame renders.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: two-hand tracking — multi-hand engine, either-hand dim, dual-wield guns"
```

---

### Task 10: Energy Shield effect

**Files:**
- Create: `src/effects/energyShield.ts`
- Modify: `src/fx/sfx.ts` (add shieldUp/shieldDown/hum)
- Test: `tests/effects/energyShield.test.ts`

- [ ] **Step 1: Add shield sounds to `src/fx/sfx.ts`**

```ts
// Soft sine swell for shield raise/lower; a very quiet hum loop while held.
let humOsc: OscillatorNode | null = null;
let humGain: GainNode | null = null;

export function shieldUp(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.22);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.25, now + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.32);

  if (!humOsc) {
    humOsc = ctx.createOscillator();
    humOsc.type = 'triangle';
    humOsc.frequency.value = 96;
    humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.0001, now);
    humGain.gain.exponentialRampToValueAtTime(0.05, now + 0.4);
    humOsc.connect(humGain).connect(ctx.destination);
    humOsc.start(now);
  }
}

export function shieldDown(): void {
  const ctx = ac();
  if (ctx) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }
  stopShieldHum();
}

export function stopShieldHum(): void {
  if (humOsc && humGain && audioCtxOf()) {
    const now = audioCtxOf()!.currentTime;
    humGain.gain.cancelScheduledValues(now);
    humGain.gain.setValueAtTime(humGain.gain.value, now);
    humGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    humOsc.stop(now + 0.2);
  }
  humOsc = null;
  humGain = null;
}

function audioCtxOf(): AudioContext | null { return audioCtx; }
```

(`audioCtx` is the module-level variable that `ac()` manages — `audioCtxOf` just reads it without resuming.)

- [ ] **Step 2: Write the failing shield test**

Create `tests/effects/energyShield.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EnergyShield } from '../../src/effects/energyShield';
import type { HandLandmarks, HandResult, RenderContext } from '../../src/types';

function openHand(): HandResult {
  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5, y: 0.8, z: 0 };  // wrist
  lm[9] = { x: 0.5, y: 0.5, z: 0 };  // middle MCP (hand size anchor)
  return { landmarks: lm, handedness: 'Right' };
}

function ctx(h: HandResult | null, now = 0): RenderContext {
  return { width: 1000, height: 1000, hand: h, hands: h ? [h] : [], face: null, now };
}

describe('EnergyShield', () => {
  it('is inactive until started', () => {
    expect(new EnergyShield().isActive()).toBe(false);
  });

  it('raises while held and stays active', () => {
    const s = new EnergyShield();
    s.start();
    for (let i = 0; i < 30; i++) s.update(1 / 60, ctx(openHand()));
    expect(s.isActive()).toBe(true);
    expect(s.presence).toBeCloseTo(1, 1); // fully raised after 0.5s >> 0.22s raise
  });

  it('lowers after stop and eventually deactivates', () => {
    const s = new EnergyShield();
    s.start();
    for (let i = 0; i < 30; i++) s.update(1 / 60, ctx(openHand()));
    s.stop();
    for (let i = 0; i < 30; i++) s.update(1 / 60, ctx(openHand()));
    expect(s.isActive()).toBe(false);
    expect(s.presence).toBe(0);
  });

  it('reset drops it instantly', () => {
    const s = new EnergyShield();
    s.start();
    for (let i = 0; i < 30; i++) s.update(1 / 60, ctx(openHand()));
    s.reset();
    expect(s.isActive()).toBe(false);
  });
});
```

- [ ] **Step 3: Run to verify failure, then implement `src/effects/energyShield.ts`**

```ts
import { Container, Graphics, Sprite } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { shieldUp, shieldDown, stopShieldHum } from '../fx/sfx';
import type { Effect, EffectStage, RenderContext } from '../types';

const RAISE_S = 0.22;
const LOWER_S = 0.18;
const CYAN = 0x66e0ff;
const PALM_IDS = [0, 5, 9, 13, 17];

// Hold the bound pose: a hex force-field materializes in front of the palm.
// presence: 0 = down, 1 = fully raised (eased by raise/lower speeds).
export class EnergyShield implements Effect {
  id = 'energy-shield';
  mode = 'hold' as const;
  presence = 0;
  private held = false;
  private mounted = false;
  private stage: EffectStage | null = null;
  private view = new Container();
  private hexA: Sprite | null = null;
  private hexB: Sprite | null = null;
  private rim = new Graphics();
  private glints = new Graphics();
  private x = 0; private y = 0; private r = 120;
  private placed = false;
  private rippled = false;

  init(stage: EffectStage): void {
    this.stage = stage;
    this.hexA = new Sprite(stage.fx.textures.shieldHex);
    this.hexB = new Sprite(stage.fx.textures.shieldHex);
    for (const s of [this.hexA, this.hexB]) {
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = CYAN;
    }
    this.hexB.alpha = 0.5;
    this.view.addChild(this.hexA, this.hexB, this.rim, this.glints);
    this.view.filters = [new GlowFilter({ distance: 14, outerStrength: 2, color: CYAN, quality: 0.25 })];
    this.view.visible = false;
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void {
    if (!this.held) {
      this.held = true;
      this.rippled = false;
      shieldUp();
    }
  }

  stop(): void {
    if (this.held) {
      this.held = false;
      shieldDown();
    }
  }

  isActive(): boolean { return this.presence > 0.01; }

  reset(): void {
    this.held = false;
    this.presence = 0;
    this.placed = false;
    stopShieldHum();
    if (this.mounted) this.view.visible = false;
  }

  update(dt: number, ctx: RenderContext): void {
    if (this.held) this.presence = Math.min(1, this.presence + dt / RAISE_S);
    else this.presence = Math.max(0, this.presence - dt / LOWER_S);

    if (ctx.hand) {
      const lm = ctx.hand.landmarks;
      let px = 0, py = 0;
      for (const i of PALM_IDS) { px += lm[i].x; py += lm[i].y; }
      const tx = (px / PALM_IDS.length) * ctx.width;
      const ty = (py / PALM_IDS.length) * ctx.height;
      const handSize = Math.hypot(
        (lm[9].x - lm[0].x) * ctx.width,
        (lm[9].y - lm[0].y) * ctx.height,
      );
      const tr = Math.max(60, handSize * 2.6);
      if (!this.placed) { this.x = tx; this.y = ty; this.r = tr; this.placed = true; }
      else {
        this.x += (tx - this.x) * 0.35;
        this.y += (ty - this.y) * 0.35;
        this.r += (tr - this.r) * 0.2;
      }
      if (this.held && !this.rippled && this.presence > 0.05) {
        this.rippled = true;
        this.stage?.fx.transients.ripple(this.x, this.y, { amplitude: 18, wavelength: 120, duration: 0.5 });
      }
    }

    if (this.mounted) this.redraw(ctx.now);
  }

  private redraw(now: number): void {
    const p = this.presence;
    this.view.visible = p > 0.01;
    if (!this.view.visible || !this.hexA || !this.hexB) return;

    const scale = (0.6 + 0.4 * p) * (this.r * 2) / 500; // hex tex is 500px circle in 512
    const shimmer = 0.75 + 0.15 * Math.sin(now / 230) + 0.10 * Math.sin(now / 97);

    for (const s of [this.hexA, this.hexB]) {
      s.position.set(this.x, this.y);
      s.scale.set(scale);
    }
    this.hexA.rotation = now / 6000;
    this.hexB.rotation = -now / 9000;
    this.hexA.alpha = 0.55 * p * shimmer;
    this.hexB.alpha = 0.30 * p * shimmer;

    this.rim.clear();
    this.rim.circle(this.x, this.y, this.r * (0.6 + 0.4 * p))
      .stroke({ width: 5, color: CYAN, alpha: 0.35 * p });
    this.rim.circle(this.x, this.y, this.r * (0.6 + 0.4 * p))
      .stroke({ width: 1.8, color: 0xffffff, alpha: 0.85 * p });

    this.glints.clear();
    if (p > 0.5 && Math.random() < 0.12) {
      const a = Math.random() * Math.PI * 2;
      const rr = this.r * Math.sqrt(Math.random()) * 0.9;
      this.glints.circle(this.x + Math.cos(a) * rr, this.y + Math.sin(a) * rr, 2 + Math.random() * 3)
        .fill({ color: 0xffffff, alpha: 0.9 });
    }
  }
}
```

- [ ] **Step 4: Run shield tests + full suite** — `npm test` → PASS (sfx functions no-op in jsdom: `ac()` returns null; `stopShieldHum` guards).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: energy shield effect — hex force-field with raise/lower, shimmer, hum"
```

---

### Task 11: Kamehameha Beam (beamCore TDD + presenter + sfx)

**Files:**
- Create: `src/effects/beamCore.ts` + Test: `tests/effects/beamCore.test.ts`
- Create: `src/effects/energyBeam.ts`
- Modify: `src/fx/sfx.ts` (charge + beamFire sounds)

- [ ] **Step 1: Write the failing beamCore test**

Create `tests/effects/beamCore.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { BeamCore, type BeamFrame } from '../../src/effects/beamCore';

// Helper: a frame where both palms are together at given scale.
function together(scale = 0.2): BeamFrame {
  return { palmsTogether: true, avgHandScale: scale, midX: 0.5, midY: 0.5 };
}
const APART: BeamFrame = { palmsTogether: false, avgHandScale: 0.2, midX: 0.5, midY: 0.5 };

function charge(core: BeamCore, seconds: number, t0 = 0, scale = 0.2): number {
  const frames = Math.round(seconds * 60);
  let t = t0;
  for (let i = 0; i < frames; i++) { t += 1000 / 60; core.step(together(scale), 1 / 60, t); }
  return t;
}

describe('BeamCore', () => {
  it('starts idle with zero charge', () => {
    const c = new BeamCore();
    expect(c.state).toBe('idle');
    expect(c.charge).toBe(0);
  });

  it('charges toward 1 over ~1.2s while palms are together', () => {
    const c = new BeamCore();
    charge(c, 0.6);
    expect(c.state).toBe('charging');
    expect(c.charge).toBeGreaterThan(0.4);
    expect(c.charge).toBeLessThan(0.6);
    charge(c, 0.8, 600);
    expect(c.charge).toBe(1);
  });

  it('drains at 2x speed when the pose breaks, returning to idle at 0', () => {
    const c = new BeamCore();
    let t = charge(c, 0.6);
    for (let i = 0; i < 36; i++) { t += 1000 / 60; c.step(APART, 1 / 60, t); } // 0.6s drain
    expect(c.charge).toBe(0);
    expect(c.state).toBe('idle');
  });

  it('fires on a >=18% hand-scale thrust within 180ms once charge >= 0.35', () => {
    const c = new BeamCore();
    let t = charge(c, 0.7); // charge ~0.58
    t += 1000 / 60;
    c.step(together(0.24), 1 / 60, t); // 20% scale jump inside the window
    expect(c.state).toBe('firing');
  });

  it('does not fire on a thrust below 0.35 charge', () => {
    const c = new BeamCore();
    let t = charge(c, 0.3); // charge ~0.25
    t += 1000 / 60;
    c.step(together(0.24), 1 / 60, t);
    expect(c.state).toBe('charging');
  });

  it('fires at full charge with a smaller (>=8%) thrust', () => {
    const c = new BeamCore();
    let t = charge(c, 1.4); // charge = 1
    t += 1000 / 60;
    c.step(together(0.22), 1 / 60, t); // 10% jump
    expect(c.state).toBe('firing');
  });

  it('firing runs 1.4s then cools down 0.8s then idles, even hands-free', () => {
    const c = new BeamCore();
    let t = charge(c, 0.7);
    t += 1000 / 60;
    c.step(together(0.24), 1 / 60, t);
    expect(c.state).toBe('firing');
    for (let i = 0; i < 90; i++) { t += 1000 / 60; c.step(null, 1 / 60, t); } // 1.5s
    expect(c.state).toBe('cooldown');
    for (let i = 0; i < 54; i++) { t += 1000 / 60; c.step(null, 1 / 60, t); } // +0.9s
    expect(c.state).toBe('idle');
  });

  it('losing hands mid-charge drains', () => {
    const c = new BeamCore();
    let t = charge(c, 0.7);
    for (let i = 0; i < 80; i++) { t += 1000 / 60; c.step(null, 1 / 60, t); }
    expect(c.charge).toBe(0);
    expect(c.state).toBe('idle');
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement `src/effects/beamCore.ts`**

```ts
// Pure Kamehameha state machine: idle -> charging -> firing -> cooldown.
// The effect feeds it one BeamFrame per video frame (or null when hands are
// missing/not in pose); all tuning constants live here.
export type BeamState = 'idle' | 'charging' | 'firing' | 'cooldown';

export interface BeamFrame {
  palmsTogether: boolean;  // both hands open-ish + wrists close
  avgHandScale: number;    // average wrist->middle-MCP distance (normalized units)
  midX: number;            // hands midpoint, normalized 0..1
  midY: number;
}

export interface BeamEvents { fired?: boolean; fizzled?: boolean; }

const CHARGE_S = 1.2;          // 0 -> 1 charge time
const DRAIN_MULT = 2;          // drain speed vs charge speed
const FIRE_S = 1.4;            // firing duration
const COOLDOWN_S = 0.8;
const THRUST_WINDOW_MS = 180;  // scale samples considered for the thrust
const THRUST_RATIO = 1.18;     // >=18% scale growth = thrust
const THRUST_RATIO_FULL = 1.08;
const MIN_CHARGE = 0.35;
const FIZZLE_CHARGE = 0.3;     // losing more than this much charge emits a fizzle

export class BeamCore {
  state: BeamState = 'idle';
  charge = 0;       // 0..1
  fireT = 0;        // seconds into firing
  originX = 0.5;    // captured at fire start (normalized)
  originY = 0.5;
  private scales: Array<{ t: number; s: number }> = [];
  private chargePeak = 0;

  step(frame: BeamFrame | null, dt: number, nowMs: number): BeamEvents {
    const ev: BeamEvents = {};

    if (this.state === 'firing') {
      this.fireT += dt;
      if (this.fireT >= FIRE_S) { this.state = 'cooldown'; this.fireT = 0; }
      return ev;
    }
    if (this.state === 'cooldown') {
      this.fireT += dt;
      if (this.fireT >= COOLDOWN_S) { this.state = 'idle'; this.fireT = 0; }
      return ev;
    }

    if (frame?.palmsTogether) {
      this.state = 'charging';
      this.charge = Math.min(1, this.charge + dt / CHARGE_S);
      this.chargePeak = Math.max(this.chargePeak, this.charge);

      this.scales.push({ t: nowMs, s: frame.avgHandScale });
      this.scales = this.scales.filter(e => nowMs - e.t <= THRUST_WINDOW_MS);
      const oldest = this.scales[0];
      const ratio = oldest && oldest.s > 0 ? frame.avgHandScale / oldest.s : 1;
      const needed = this.charge >= 1 ? THRUST_RATIO_FULL : THRUST_RATIO;
      if (this.charge >= MIN_CHARGE && ratio >= needed) {
        this.state = 'firing';
        this.fireT = 0;
        this.originX = frame.midX;
        this.originY = frame.midY;
        this.charge = 0;
        this.chargePeak = 0;
        this.scales = [];
        ev.fired = true;
      }
    } else {
      this.charge = Math.max(0, this.charge - (dt / CHARGE_S) * DRAIN_MULT);
      this.scales = [];
      if (this.charge === 0 && this.state === 'charging') {
        if (this.chargePeak > FIZZLE_CHARGE) ev.fizzled = true;
        this.chargePeak = 0;
        this.state = 'idle';
      }
    }
    return ev;
  }

  reset(): void {
    this.state = 'idle';
    this.charge = 0;
    this.fireT = 0;
    this.scales = [];
    this.chargePeak = 0;
  }
}
```

- [ ] **Step 3: Run beamCore tests — PASS expected**

Run: `npx vitest run tests/effects/beamCore.test.ts`

- [ ] **Step 4: Add charge/fire sounds to `src/fx/sfx.ts`**

```ts
// Rising filtered saw while charging; cut off on cancel; big boom on fire.
let chargeOsc: OscillatorNode | null = null;
let chargeGain: GainNode | null = null;
let chargeFilter: BiquadFilterNode | null = null;

export function chargeStart(): void {
  const ctx = ac();
  if (!ctx || chargeOsc) return;
  chargeOsc = ctx.createOscillator();
  chargeOsc.type = 'sawtooth';
  chargeOsc.frequency.value = 70;
  chargeFilter = ctx.createBiquadFilter();
  chargeFilter.type = 'lowpass';
  chargeFilter.frequency.value = 300;
  chargeGain = ctx.createGain();
  chargeGain.gain.value = 0.0001;
  chargeOsc.connect(chargeFilter).connect(chargeGain).connect(ctx.destination);
  chargeOsc.start();
}

export function chargeLevel(level: number): void {
  const ctx = ac();
  if (!ctx || !chargeOsc || !chargeGain || !chargeFilter) return;
  const now = ctx.currentTime;
  chargeOsc.frequency.setTargetAtTime(70 + 240 * level, now, 0.05);
  chargeFilter.frequency.setTargetAtTime(300 + 2200 * level * level, now, 0.05);
  const trem = 1 + 0.3 * Math.sin(now * (4 + 14 * level) * Math.PI * 2);
  chargeGain.gain.setTargetAtTime(0.10 * level * trem, now, 0.05);
}

export function chargeCancel(): void {
  const ctx = ac();
  if (ctx && chargeGain && chargeOsc) {
    const now = ctx.currentTime;
    chargeGain.gain.cancelScheduledValues(now);
    chargeGain.gain.setTargetAtTime(0.0001, now, 0.06);
    chargeOsc.stop(now + 0.3);
  }
  chargeOsc = null; chargeGain = null; chargeFilter = null;
}

// The release: noise blast + 45Hz swell + ~1s rumble tail.
export function beamFire(): void {
  chargeCancel();
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;

  const dur = 1.1;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.6);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4000, now);
  lp.frequency.exponentialRampToValueAtTime(250, now + dur);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.8, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(lp).connect(ng).connect(ctx.destination);
  noise.start(now);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(45, now);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.55, now + 0.1);
  og.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  osc.connect(og).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 1.25);
}
```

- [ ] **Step 5: Create `src/effects/energyBeam.ts`**

```ts
import { Container, Sprite } from 'pixi.js';
import { FxParticles } from '../fx/particles';
import { BeamCore, type BeamFrame } from './beamCore';
import { chargeStart, chargeLevel, chargeCancel, beamFire } from '../fx/sfx';
import { fingersUp } from '../gesture/handGestures';
import type { Effect, EffectStage, HandResult, RenderContext } from '../types';

const PALMS_DIST_FACTOR = 1.6; // wrists closer than this x avg hand size = together
const CORE_TINTS = [0xffffff, 0xbfe8ff, 0x7fc8ff];

function handScale(h: HandResult): number {
  const a = h.landmarks[0], b = h.landmarks[9];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function openish(h: HandResult): boolean {
  const f = fingersUp(h.landmarks);
  return (f[1] ? 1 : 0) + (f[2] ? 1 : 0) + (f[3] ? 1 : 0) + (f[4] ? 1 : 0) >= 3;
}

// Two-hand Kamehameha: palms together to charge an orb, thrust at the camera
// to fire a screen-engulfing energy release. Self-driven (enable toggle only).
export class EnergyBeam implements Effect {
  id = 'energy-beam';
  mode = 'toggle' as const; // unused by the driver; self-driven
  enabled = true;
  private core = new BeamCore();
  private mounted = false;
  private stage: EffectStage | null = null;
  private view = new Container();
  private orb: Sprite[] = [];
  private ps: FxParticles | null = null;
  private wasCharging = false;
  private firedFx = false;

  init(stage: EffectStage): void {
    this.stage = stage;
    this.ps = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 400);
    for (const tint of CORE_TINTS) {
      const s = new Sprite(stage.fx.textures.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = tint;
      s.visible = false;
      this.orb.push(s);
    }
    this.view.addChild(this.ps.view, ...this.orb);
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean {
    return this.core.state === 'charging' || this.core.state === 'firing' || (this.ps?.count ?? 0) > 0;
  }
  reset(): void {
    this.core.reset();
    this.ps?.clear();
    chargeCancel();
    this.firedFx = false;
    this.wasCharging = false;
    if (this.mounted) for (const s of this.orb) s.visible = false;
  }

  update(dt: number, ctx: RenderContext): void {
    let frame: BeamFrame | null = null;
    if (this.enabled && ctx.hands.length >= 2) {
      const [a, b] = ctx.hands;
      const sA = handScale(a), sB = handScale(b);
      const avg = (sA + sB) / 2;
      const wristDist = Math.hypot(
        a.landmarks[0].x - b.landmarks[0].x,
        a.landmarks[0].y - b.landmarks[0].y,
      );
      const togetherNow = openish(a) && openish(b) && wristDist < PALMS_DIST_FACTOR * avg;
      frame = {
        palmsTogether: togetherNow,
        avgHandScale: avg,
        midX: (a.landmarks[9].x + b.landmarks[9].x) / 2,
        midY: (a.landmarks[9].y + b.landmarks[9].y) / 2,
      };
    }

    const ev = this.core.step(this.enabled ? frame : null, dt, ctx.now);

    // sfx transitions
    const charging = this.core.state === 'charging' && this.core.charge > 0;
    if (charging && !this.wasCharging) chargeStart();
    if (charging) chargeLevel(this.core.charge);
    if (!charging && this.wasCharging && this.core.state !== 'firing') chargeCancel();
    this.wasCharging = charging;

    if (ev.fired) {
      beamFire();
      this.firedFx = false;
    }
    if (ev.fizzled && frame) {
      // sparks dribble from the hands midpoint
      for (let i = 0; i < 16; i++) {
        const a2 = Math.random() * Math.PI * 2;
        const sp = 80 + Math.random() * 160;
        this.ps?.spawn({
          x: frame.midX * ctx.width, y: frame.midY * ctx.height,
          vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp,
          ay: 250, life: 0.4 + Math.random() * 0.3,
          size: 2 + Math.random() * 3, tint: 0x9fd8ff,
        });
      }
    }

    if (this.core.state === 'charging' && frame?.palmsTogether) {
      // particles spiral INWARD toward the orb
      const ox = frame.midX * ctx.width, oy = frame.midY * ctx.height;
      const n = Math.round(1 + 5 * this.core.charge);
      for (let i = 0; i < n; i++) {
        const a3 = Math.random() * Math.PI * 2;
        const r = 90 + Math.random() * 140;
        const sx = ox + Math.cos(a3) * r, sy = oy + Math.sin(a3) * r;
        this.ps?.spawn({
          x: sx, y: sy,
          vx: (ox - sx) * 2.2 + (Math.random() - 0.5) * 40,
          vy: (oy - sy) * 2.2 + (Math.random() - 0.5) * 40,
          life: 0.45, size: 2.5 + Math.random() * 3, tint: 0xbfe8ff,
        });
      }
    }

    if (this.core.state === 'firing') {
      const t = this.core.fireT;
      const ox = this.core.originX * ctx.width, oy = this.core.originY * ctx.height;
      if (!this.firedFx && this.stage) {
        this.firedFx = true;
        this.stage.fx.transients.flash(0.85, 0.24);
        this.stage.fx.transients.ripple(ox, oy, { amplitude: 40, wavelength: 200, speed: 1200, duration: 0.8 });
        this.stage.fx.transients.zoomBlur(ox, oy, 0.4, 1.1);
        this.stage.fx.shake.kick(14);
      }
      if (t < 1.1) {
        // radial streak storm outward at the lens
        for (let i = 0; i < 14; i++) {
          const a4 = Math.random() * Math.PI * 2;
          const sp = 700 + Math.random() * 900;
          this.ps?.spawn({
            x: ox, y: oy, vx: Math.cos(a4) * sp, vy: Math.sin(a4) * sp,
            life: 0.3 + Math.random() * 0.25,
            size: 6 + Math.random() * 10, tint: CORE_TINTS[i % 3], streak: true,
          });
        }
      }
    }

    this.ps?.update(dt);
    if (this.mounted) this.redrawOrb(ctx);
  }

  private redrawOrb(ctx: RenderContext): void {
    const charging = this.core.state === 'charging';
    const firing = this.core.state === 'firing';
    for (let i = 0; i < this.orb.length; i++) {
      const s = this.orb[i];
      if (charging) {
        const c = this.core.charge;
        const pulse = 1 + 0.08 * Math.sin(ctx.now / 70);
        s.visible = c > 0.02;
        // orb sits between the palms while charging — track the live midpoint via particles' target
        s.position.set(this.lastOrbX(ctx), this.lastOrbY(ctx));
        s.scale.set(((18 + 70 * c) * (1 + i * 0.8) * pulse) / 16);
        s.alpha = (0.9 - i * 0.25) * (0.3 + 0.7 * c);
      } else if (firing) {
        const t = this.core.fireT;
        const grow = t < 0.12 ? t / 0.12 : 1;
        const decay = t > 1.1 ? Math.max(0, 1 - (t - 1.1) / 0.3) : 1;
        s.visible = true;
        s.position.set(this.core.originX * ctx.width, this.core.originY * ctx.height);
        s.scale.set(((60 + 240 * grow) * (1 + i * 0.9) * decay) / 16);
        s.alpha = (0.95 - i * 0.22) * decay;
      } else {
        s.visible = false;
      }
    }
  }

  private orbX = 0.5; private orbY = 0.5;
  private lastOrbX(ctx: RenderContext): number {
    if (ctx.hands.length >= 2) this.orbX = (ctx.hands[0].landmarks[9].x + ctx.hands[1].landmarks[9].x) / 2;
    return this.orbX * ctx.width;
  }
  private lastOrbY(ctx: RenderContext): number {
    if (ctx.hands.length >= 2) this.orbY = (ctx.hands[0].landmarks[9].y + ctx.hands[1].landmarks[9].y) / 2;
    return this.orbY * ctx.height;
  }
}
```

- [ ] **Step 6: Typecheck + full suite** — `npx tsc --noEmit && npm test` → PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: kamehameha beam — TDD'd charge/thrust/fire core + at-camera blast presenter"
```

---

### Task 12: Web Shot (webGeometry TDD + presenter + thwip)

**Files:**
- Create: `src/fx/webGeometry.ts` + Test: `tests/fx/webGeometry.test.ts`
- Create: `src/effects/webShot.ts`
- Modify: `src/fx/sfx.ts` (thwip), `src/fx/proceduralTextures.ts` (webTexture + fill `webs`)

- [ ] **Step 1: Write the failing webGeometry test**

Create `tests/fx/webGeometry.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { genWeb } from '../../src/fx/webGeometry';

describe('genWeb', () => {
  it('produces 10-12 spokes and 6-7 rings', () => {
    for (let seed = 0; seed < 5; seed++) {
      const w = genWeb(0.5 + seed * 0.1);
      expect(w.spokes.length).toBeGreaterThanOrEqual(10);
      expect(w.spokes.length).toBeLessThanOrEqual(12);
      expect(w.rings.length).toBeGreaterThanOrEqual(6);
      expect(w.rings.length).toBeLessThanOrEqual(7);
    }
  });

  it('spokes start at the center and end on the unit rim', () => {
    const w = genWeb(0.3);
    for (const s of w.spokes) {
      expect(Math.hypot(s.x1, s.y1)).toBeLessThan(0.02);
      expect(Math.hypot(s.x2, s.y2)).toBeCloseTo(1, 1);
    }
  });

  it('ring segments connect adjacent spokes with a control point sagging toward the center', () => {
    const w = genWeb(0.7);
    for (const ring of w.rings) {
      expect(ring.segments.length).toBe(w.spokes.length);
      for (const seg of ring.segments) {
        const midR = Math.hypot((seg.ax + seg.bx) / 2, (seg.ay + seg.by) / 2);
        const ctrlR = Math.hypot(seg.cx, seg.cy);
        expect(ctrlR).toBeLessThan(midR); // sag pulls inward
      }
    }
  });

  it('is deterministic per seed', () => {
    expect(genWeb(0.42)).toEqual(genWeb(0.42));
  });
});
```

- [ ] **Step 2: Run to verify failure, then implement `src/fx/webGeometry.ts`**

```ts
// Pure spider-web geometry in unit space (radius 1, centered at 0,0).
// Seeded mulberry32 RNG so textures are deterministic and testable.
export interface Spoke { x1: number; y1: number; x2: number; y2: number; }
export interface RingSeg {
  ax: number; ay: number;  // on spoke i
  bx: number; by: number;  // on spoke i+1
  cx: number; cy: number;  // quadratic control point, sagging toward center
}
export interface Ring { r: number; segments: RingSeg[]; }
export interface Web { spokes: Spoke[]; rings: Ring[]; }

function mulberry32(seed: number): () => number {
  let a = Math.floor(seed * 2 ** 31) | 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genWeb(seed: number): Web {
  const rng = mulberry32(seed);
  const spokeCount = 10 + Math.floor(rng() * 3); // 10..12
  const ringCount = 6 + Math.floor(rng() * 2);   // 6..7

  const angles: number[] = [];
  for (let i = 0; i < spokeCount; i++) {
    const base = (i / spokeCount) * Math.PI * 2;
    angles.push(base + (rng() - 0.5) * (Math.PI / spokeCount) * 0.8);
  }

  const spokes: Spoke[] = angles.map(a => ({
    x1: 0, y1: 0, x2: Math.cos(a), y2: Math.sin(a),
  }));

  const rings: Ring[] = [];
  for (let r = 1; r <= ringCount; r++) {
    const radius = (r / ringCount) * 0.95 + rng() * 0.02;
    const segments: RingSeg[] = [];
    for (let i = 0; i < spokeCount; i++) {
      const a1 = angles[i], a2 = angles[(i + 1) % spokeCount];
      const ax = Math.cos(a1) * radius, ay = Math.sin(a1) * radius;
      const bx = Math.cos(a2) * radius, by = Math.sin(a2) * radius;
      const sag = 0.82 + rng() * 0.08; // control point pulled toward center
      const cx = ((ax + bx) / 2) * sag, cy = ((ay + by) / 2) * sag;
      segments.push({ ax, ay, bx, by, cx, cy });
    }
    rings.push({ r: radius, segments });
  }
  return { spokes, rings };
}
```

- [ ] **Step 3: Run webGeometry tests — PASS expected**

- [ ] **Step 4: Add the web texture to `src/fx/proceduralTextures.ts`**

```ts
import { genWeb } from './webGeometry';

// 1024² spider web drawn from pure geometry; line width tapers outward.
export function webTexture(seed: number): Texture {
  const SIZE = 1024, C = SIZE / 2, R = SIZE * 0.48;
  return Texture.from(canvasOf(SIZE, SIZE, c => {
    const web = genWeb(seed);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.shadowColor = 'rgba(255,255,255,0.35)';
    c.shadowBlur = 4;
    for (const s of web.spokes) {
      c.lineWidth = 3.2;
      c.beginPath();
      c.moveTo(C + s.x1 * R, C + s.y1 * R);
      c.lineTo(C + s.x2 * R, C + s.y2 * R);
      c.stroke();
    }
    for (const ring of web.rings) {
      c.lineWidth = Math.max(1, 3 - ring.r * 2.2); // taper outward
      for (const seg of ring.segments) {
        c.beginPath();
        c.moveTo(C + seg.ax * R, C + seg.ay * R);
        c.quadraticCurveTo(C + seg.cx * R, C + seg.cy * R, C + seg.bx * R, C + seg.by * R);
        c.stroke();
      }
    }
  }));
}
```

And in `buildFxTextures()` change `webs: []` to:

```ts
    webs: [webTexture(0.17), webTexture(0.52), webTexture(0.83)],
```

- [ ] **Step 5: Add `thwip()` to `src/fx/sfx.ts`**

```ts
// Band-passed noise chirp with a fast pitch drop — the classic web-shooter thwip.
export function thwip(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = 0.14;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 4;
  bp.frequency.setValueAtTime(2600, now);
  bp.frequency.exponentialRampToValueAtTime(500, now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(bp).connect(g).connect(ctx.destination);
  noise.start(now);
}
```

- [ ] **Step 6: Create `src/effects/webShot.ts`**

```ts
import { Sprite } from 'pixi.js';
import { thwip } from '../fx/sfx';
import type { Effect, EffectStage, RenderContext } from '../types';

const FLY_S = 0.18;
const STICK_S = 5.0;
const PEEL_S = 0.4;
const MAX_SPLATS = 3;
const OWN_COOLDOWN_MS = 600;

type Phase = 'fly' | 'stick' | 'peel';

interface Splat {
  sprite: Sprite;
  phase: Phase;
  t: number;
  fromX: number; fromY: number;
  toX: number; toY: number;
  targetScale: number;
  rot: number;
}

// Fire a web at the lens: it flies from your hand, splats onto the "glass"
// (screen layer — unaffected by world shake), sticks ~5s, then peels away.
export class WebShot implements Effect {
  id = 'web-shot';
  mode = 'oneshot' as const;
  private pending = false;
  private mounted = false;
  private stage: EffectStage | null = null;
  private splats: Splat[] = [];
  private lastShot = -Infinity;
  private texIdx = 0;
  private headlessCount = 0; // isActive() without init() (jsdom tests)

  init(stage: EffectStage): void {
    this.stage = stage;
    this.mounted = true;
  }

  start(): void { this.pending = true; }
  stop(): void {}
  isActive(): boolean { return this.mounted ? this.splats.length > 0 : this.headlessCount > 0; }
  reset(): void {
    for (const s of this.splats) { s.sprite.parent?.removeChild(s.sprite); s.sprite.destroy(); }
    this.splats = [];
    this.pending = false;
    this.headlessCount = 0;
  }

  update(dt: number, ctx: RenderContext): void {
    if (this.pending) {
      this.pending = false;
      if (ctx.now - this.lastShot >= OWN_COOLDOWN_MS) {
        this.lastShot = ctx.now;
        this.fire(ctx);
      }
    }

    this.headlessCount = Math.max(0, this.headlessCount - dt / (FLY_S + STICK_S + PEEL_S));

    for (const s of this.splats) {
      s.t += dt;
      if (s.phase === 'fly' && s.t >= FLY_S) { s.phase = 'stick'; s.t = 0; }
      else if (s.phase === 'stick' && s.t >= STICK_S) { s.phase = 'peel'; s.t = 0; }
    }
    // destroy fully-peeled splats
    this.splats = this.splats.filter(s => {
      if (s.phase === 'peel' && s.t >= PEEL_S) {
        s.sprite.parent?.removeChild(s.sprite);
        s.sprite.destroy();
        return false;
      }
      return true;
    });

    if (this.mounted) for (const s of this.splats) this.sync(s);
  }

  private fire(ctx: RenderContext): void {
    thwip();
    this.headlessCount = 1;
    if (!this.stage) return;

    // FIFO: oldest splat starts peeling early when over the cap
    const stuck = this.splats.filter(s => s.phase !== 'peel');
    if (stuck.length >= MAX_SPLATS) {
      const oldest = stuck[0];
      oldest.phase = 'peel';
      oldest.t = 0;
    }

    const hand = ctx.hand;
    const hx = (hand ? hand.landmarks[9].x : 0.5) * ctx.width;
    const hy = (hand ? hand.landmarks[9].y : 0.5) * ctx.height;
    // target pulled 30% toward frame center + jitter
    const cx = ctx.width / 2, cy = ctx.height / 2;
    const toX = hx + (cx - hx) * 0.3 + (Math.random() - 0.5) * ctx.width * 0.12;
    const toY = hy + (cy - hy) * 0.3 + (Math.random() - 0.5) * ctx.height * 0.12;

    const webs = this.stage.fx.textures.webs;
    const sprite = new Sprite(webs[this.texIdx++ % webs.length]);
    sprite.anchor.set(0.5);
    sprite.alpha = 0.95;
    this.stage.screen.addChild(sprite);

    this.splats.push({
      sprite, phase: 'fly', t: 0,
      fromX: hx, fromY: hy, toX, toY,
      targetScale: (ctx.width * 0.7) / 1024,
      rot: (Math.random() - 0.5) * 0.5,
    });
    this.stage.fx.transients.zoomBlur(hx, hy, 0.18, 0.25);
  }

  private sync(s: Splat): void {
    if (s.phase === 'fly') {
      const k = Math.min(1, s.t / FLY_S);
      const ease = k * k; // accelerate toward the lens
      s.sprite.position.set(s.fromX + (s.toX - s.fromX) * ease, s.fromY + (s.toY - s.fromY) * ease);
      s.sprite.scale.set((0.15 + 0.85 * ease) * s.targetScale);
      s.sprite.rotation = s.rot * ease;
      s.sprite.alpha = 0.95;
    } else if (s.phase === 'stick') {
      // squash-bounce: 1.15 -> 0.96 -> 1.0 over 160ms
      const t = s.t;
      let k = 1;
      if (t < 0.08) k = 1.15 - (t / 0.08) * 0.19;
      else if (t < 0.16) k = 0.96 + ((t - 0.08) / 0.08) * 0.04;
      s.sprite.position.set(s.toX, s.toY);
      s.sprite.scale.set(s.targetScale * k);
      s.sprite.rotation = s.rot;
      s.sprite.alpha = 0.95;
    } else {
      const k = Math.min(1, s.t / PEEL_S);
      s.sprite.position.set(s.toX, s.toY + 30 * k);
      s.sprite.rotation = s.rot + 0.12 * k;
      s.sprite.alpha = 0.95 * (1 - k);
    }
  }
}
```

- [ ] **Step 7: Typecheck + full suite** — `npx tsc --noEmit && npm test` → PASS.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: web shot — seeded web geometry, lens splat with squash/peel, thwip sfx"
```

---

### Task 13: UI cards for the new effects + README + final verification

**Files:**
- Modify: `src/main.ts`, `README.md`

- [ ] **Step 1: Register the new effects in `src/main.ts`**

(a) Imports:

```ts
import { EnergyShield } from './effects/energyShield';
import { EnergyBeam } from './effects/energyBeam';
import { WebShot } from './effects/webShot';
```

(b) Instances (next to the other `new` calls):

```ts
const shield = new EnergyShield();
const beam = new EnergyBeam();
const web = new WebShot();
```

(c) Self-driven map — add the beam:

```ts
const selfDriven: Record<string, { enabled: boolean }> = {
  'dim-lights': dim, 'fire-breath': fire, 'lightning-eyes': eyes, 'gun-shot': gun,
  'energy-beam': beam,
};
```

(d) Render order (back to front) — dim grades the scene, shield/beam glow above the world effects, web splats land on the screen layer anyway, draw stays topmost among world strokes:

```ts
const effects: Effect[] = [dim, lightning, blast, fire, eyes, gun, shield, beam, web, pinch];
```

(e) CARDS — insert these three after the `pinch-draw` card:

```ts
  {
    id: 'energy-shield', icon: '🛡', name: 'Shield', color: '#66e0ff',
    desc: 'A hex force-field materializes in front of your palm <b>while you hold</b> the gesture.',
    bindable: true, defaultGesture: 'open',
  },
  {
    id: 'web-shot', icon: '🕸', name: 'Web Shot', color: '#e8e8e8',
    desc: 'Shoot a web <b>at the camera</b> — it splats on the lens and peels off after a few seconds.',
    bindable: true, defaultGesture: 'rock',
  },
  {
    id: 'energy-beam', icon: '🌀', name: 'Kamehameha', color: '#7fc8ff',
    desc: 'Automatic — hold your <b>palms together</b> to charge, then <b>push at the camera</b> to fire.',
    bindable: false,
  },
```

(f) Card-glow hook — extend the `lit` expression in `onFrame` (the `(id === 'gun-shot' && gun.isActive())` line currently ends with `;` — it becomes `||` with three lines after it). Web stays lit while a splat is stuck, matching how Draw stays lit while strokes exist:

```ts
            (id === 'gun-shot' && gun.isActive()) ||
            (id === 'energy-beam' && beam.isActive()) ||
            (id === 'energy-shield' && shield.isActive()) ||
            (id === 'web-shot' && web.isActive());
```

(g) Default-pose conflict note: Shield defaults to ✋ Open hand, which Dim also watches (open = brighten). That is fine — Dim's "open" only fades back UP (no visual conflict), and the README already warns about fist. No code change.

- [ ] **Step 2: Update `README.md`**

(a) Intro paragraph — replace the first paragraph with:

```markdown
Turn hand gestures into movie-grade webcam VFX, rendered on WebGL. You calibrate
your *own* hand symbols, then throw branching lightning, raise an energy shield,
charge a kamehameha at the lens, shoot webs at the camera, dual-wield finger guns,
or draw glowing neon lines in the air. Pipe it into Zoom / Meet / Discord with OBS
Virtual Camera.
```

(b) In the "Pick an activation pose" table intro, change "Three effects fire on a hand pose" to "Five effects fire on a hand pose" and add to the defaults line: `🛡 Shield = ✋ Open hand, 🕸 Web Shot = 🤘 Rock.`

(c) In "Step 3 — Play!", add bullets:

```markdown
- **🛡 Shield** is *held* — a hex force-field shimmers in front of your palm.
- **🕸 Web Shot** is *one-shot* — the web splats onto the lens and peels off ~5s later.
- **🌀 Kamehameha** is *automatic* (on by default) — hold your **palms together** to
  charge the orb, then **push toward the camera** to fire. Breaking the pose drains it.
- **🔫 Finger Gun** now **dual-wields** — two hands, two guns.
```

and change the Screen FX bullet to: `**📺 Screen FX** (top of panel): full-frame **Glitch**, **CRT / retro**, or **Cyberpunk** shader filter over everything.`

(d) In the OBS section, note the extra deep-link param: ``URL `http://localhost:5173/?clean=1` (add `&filter=cyberpunk` etc. to lock a screen filter, `&autostart=1` to skip clicking Start).``

(e) "For developers" — replace the architecture diagram + module table rows that changed:

```markdown
**Architecture** (pipeline):

```
Webcam → HandTracker (MediaPipe, 2 hands) → GestureEngine → EffectDriver → Effects
                                                                              ↓
            PixiJS WebGL stage:  video sprite → effect layers → shake → screen layer → filter rig
```

| Module | Responsibility |
|--------|----------------|
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
```

(keep the still-accurate rows: camera, handTracker, faceTracker, facePose, gesture/*, calibration, effectDriver, the per-effect rows, main).

Also update the Stack line: `**Stack:** Vite · TypeScript · PixiJS (WebGL) · pixi-filters · MediaPipe Tasks Vision · Vitest.`

(f) Roadmap: remove the "True WebGL pixel-warp world effects" bullet (done — shockwaves/zoom-blur ARE pixel-warp now).

- [ ] **Step 3: Full verification battery**

```bash
npx tsc --noEmit && npm test
```
Expected: every suite green.

```bash
npm run build
```
Expected: vite build succeeds (catches any prod-only import issue).

Headless screenshots (dev server running): plain, `&filter=glitch`, `&filter=crt`, `&filter=cyberpunk` — Read each PNG: frame renders, filters visibly differ, no blank canvas. Also `--dump-dom` once and grep for the three new card names:

```bash
"$CHROME" --headless=new --enable-unsafe-swiftshader --virtual-time-budget=8000 \
  --dump-dom "http://localhost:5173/" | grep -oE "Shield|Web Shot|Kamehameha" | sort -u
```
Expected output: all three names.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: control-deck cards for shield/web/kamehameha + cinematic README"
```

---

### Task 14: Live user verification + merge

- [ ] **Step 1: Ask the user to test on camera** — they verify each effect live (lightning ✌️, blast ☝️, draw 🤏, shield ✋, web 🤘, finger gun ×2, fist→dim, palms-together→push beam, eyes/fire toggles, all four screen filters, Clean view + OBS capture, FPS ≥ 30 in the statusbar).

- [ ] **Step 2: Fix what they report** (expect tuning: beam thrust sensitivity `THRUST_RATIO`, shield radius factor, glitch burst frequency, sfx volumes).

- [ ] **Step 3: Merge via the finishing-a-development-branch skill** — squash-merge or merge `feat/cinematic-vfx` → `main` per user preference.

---

## Self-review notes (already applied)

- **Spec coverage:** every spec section maps to a task — stage graph/loop (T4), Effect interface + pure cores (T2/T5/T6/T11/T12), FX services (T2/T3), 7 restyled effects (T5/T6), shield (T10), beam (T11), web (T12), filters + `?filter=` (T7/T8), two-hand (T9), UI/README (T13), perf caps (constants in T3/T5/T6/T11), testing strategy (TDD cores + registry + headless screenshots throughout), migration order (T4 note matches spec's "steps 1–2 not at parity" allowance — adjusted: this plan restores parity per-effect starting T5, fully by T6).
- **Placeholder scan:** none — every code step has full file contents or exact replace-blocks.
- **Type consistency:** the self-review caught that T4's compositor imports `EffectStage` from `./types` before T5 originally defined it. **Fixed inline:** T4 Step 2.5 now adds `EffectStage` + optional `init?` to `types.ts` (keeping `render` so unported effects still compile), and T5 Step 1 only deletes the `render` line. The old `Compositor` (the only `render()` caller) is deleted in T4, so leftover `render()` methods on not-yet-ported classes are unreferenced and structural typing permits them. All other names cross-checked: `FxParticles.spawn/update/clear/count`, `TransientFx.ripple/zoomBlur/flash/setSize/update/clear`, `ScreenShake.kick/update/offset/magnitude`, `buildFilterRig`/`FilterRig.update(dt,t)/destroy`, `GunCore.step/reset`, `BeamCore.step/reset/state/charge/fireT/originX/originY`, sfx exports (`playBang/thwip/chargeStart/chargeLevel/chargeCancel/beamFire/shieldUp/shieldDown/stopShieldHum`) are used exactly as defined.
- **`RenderContext.hands`:** introduced in T9; effects written in T5–T6 use only `ctx.hand` (still present), and T10–T12 (written after T9) use `ctx.hands` — consistent.
- **`FxParticles` cap parameters** match spec budget: beam 400, blast 220, lightning 150, gun 80+40 smoke, web n/a (sprites), fire 150+50 smoke.
- **jsdom safety:** every unit-tested path (cores, registry construction, effects' update logic pre-`init`) avoids renderer calls; sfx guards on missing AudioContext; presenters no-op via `mounted` flags.
