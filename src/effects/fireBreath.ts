import { mouthOpenness, mouthCenter, breathDirection } from '../facePose';
import type { Effect, RenderContext } from '../types';

interface Ember {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number;
}

const MAX_EMBERS = 150;
const BUOYANCY = 130;   // px/s^2 upward drift (flames rise)
const DRAG = 1.4;       // velocity damping per second

// Color ramp from hot core (young) to dying ember (old). t: 0..1
function fireColor(t: number): [number, number, number] {
  if (t < 0.35) {
    const k = t / 0.35;            // white-yellow -> orange
    return [255, Math.round(245 - 95 * k), Math.round(200 - 160 * k)];
  }
  const k = (t - 0.35) / 0.65;     // orange -> deep red
  return [Math.round(255 - 70 * k), Math.round(150 - 120 * k), Math.round(40 - 30 * k)];
}

// Breathe fire from your mouth: open wide and a stream of fire shoots out in the
// direction your head is facing. Self-driven by face tracking (no calibration).
export class FireBreath implements Effect {
  id = 'fire-breath';
  mode = 'toggle' as const; // unused by the driver; this effect self-drives
  enabled = true;
  private embers: Ember[] = [];

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.embers.length > 0; }
  reset(): void { this.embers.length = 0; }

  update(dt: number, ctx: RenderContext): void {
    // emit while the mouth is open
    if (this.enabled && ctx.face) {
      const intensity = mouthOpenness(ctx.face.landmarks);
      if (intensity > 0.02) this.emit(intensity, ctx);
    }

    // advance embers
    for (const e of this.embers) {
      e.vy -= BUOYANCY * dt;          // rise
      const damp = Math.max(0, 1 - DRAG * dt);
      e.vx *= damp; e.vy *= damp;
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      e.life -= dt;
    }
    this.embers = this.embers.filter(e => e.life > 0);
  }

  private emit(intensity: number, ctx: RenderContext): void {
    const m = mouthCenter(ctx.face!.landmarks);
    const dir = breathDirection(ctx.face!.landmarks);
    const px = m.x * ctx.width, py = m.y * ctx.height;
    const perp = { x: -dir.y, y: dir.x };

    const count = Math.round(2 + 6 * intensity);
    for (let i = 0; i < count && this.embers.length < MAX_EMBERS; i++) {
      const speed = (160 + Math.random() * 320) * (0.5 + intensity);
      const spread = (Math.random() - 0.5) * 0.5; // sideways fan
      const vx = (dir.x + perp.x * spread) * speed;
      const vy = (dir.y + perp.y * spread) * speed;
      const life = 0.45 + Math.random() * 0.45;
      this.embers.push({
        x: px + perp.x * (Math.random() - 0.5) * 16,
        y: py + perp.y * (Math.random() - 0.5) * 16,
        vx, vy, life, maxLife: life,
        size: 8 + Math.random() * 16,
      });
    }
  }

  render(g: CanvasRenderingContext2D): void {
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const e of this.embers) {
      const t = 1 - e.life / e.maxLife;       // 0 young -> 1 old
      const r = e.size * (0.6 + t * 1.8);     // grows as it ages
      const a = (1 - t) * 0.85;               // fades out
      const [cr, cg, cb] = fireColor(t);
      const grad = g.createRadialGradient(e.x, e.y, 0, e.x, e.y, r);
      grad.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
      grad.addColorStop(0.5, `rgba(${cr},${cg},${cb},${a * 0.4})`);
      grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      g.fillStyle = grad;
      g.beginPath();
      g.arc(e.x, e.y, r, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }
}
