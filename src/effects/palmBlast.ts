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
