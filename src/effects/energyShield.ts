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
