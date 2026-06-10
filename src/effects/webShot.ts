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
