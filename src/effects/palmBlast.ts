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
