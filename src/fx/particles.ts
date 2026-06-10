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
