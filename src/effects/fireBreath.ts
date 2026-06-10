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
