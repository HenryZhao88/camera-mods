import { classifyOpenFist } from '../gesture/handPose';
import type { Effect, RenderContext } from '../types';

const FADE_SECONDS = 1.5;   // time for a full bright <-> dark sweep
const INNER_DARK = 0.35;    // vignette opacity at center, at full dim
const OUTER_DARK = 0.92;    // vignette opacity at edges, at full dim
const CONFIRM_FRAMES = 4;   // frames a pose must persist before it flips the target

// Self-driven: closing your hand into a fist slowly fades the room down,
// opening it back into a high-five fades it back up. Not gesture-calibrated —
// it reads hand openness directly every frame. A short confirmation window
// guards against single-frame misclassifications causing spurious dimming.
export class DimLights implements Effect {
  id = 'dim-lights';
  mode = 'toggle' as const; // unused by the driver; this effect self-drives
  enabled = true;
  private level = 0;  // 0 = bright, 1 = fully dim
  private target = 0;
  private pending: 'open' | 'fist' | null = null;
  private confirm = 0;

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.level > 0.001; }
  reset(): void { this.level = 0; this.target = 0; this.pending = null; this.confirm = 0; }

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
  }

  render(g: CanvasRenderingContext2D, ctx: RenderContext): void {
    if (this.level <= 0.001) return;
    const { width: w, height: h } = ctx;
    const grad = g.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.2,
      w / 2, h / 2, Math.max(w, h) * 0.7,
    );
    grad.addColorStop(0, `rgba(0,0,0,${INNER_DARK * this.level})`);
    grad.addColorStop(1, `rgba(0,0,0,${OUTER_DARK * this.level})`);
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
}
