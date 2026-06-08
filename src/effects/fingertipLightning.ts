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
  reset(): void { this.held = false; this.ps.clear(); }

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
