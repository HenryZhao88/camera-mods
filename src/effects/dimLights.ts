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
