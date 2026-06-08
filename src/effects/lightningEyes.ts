import { leftEyeCenter, rightEyeCenter } from '../facePose';
import type { Effect, Landmark, RenderContext } from '../types';

interface Pt { x: number; y: number; }

// Crackling electric arcs + a glowing core radiating from both eyes.
// Self-driven by face tracking; bolts regenerate every frame for a live flicker.
export class LightningEyes implements Effect {
  id = 'lightning-eyes';
  mode = 'toggle' as const;
  enabled = false;
  private drawing = false;
  private left: Pt = { x: 0, y: 0 };
  private right: Pt = { x: 0, y: 0 };
  private scale = 40;

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.drawing; }
  reset(): void { this.drawing = false; }

  update(_dt: number, ctx: RenderContext): void {
    this.drawing = this.enabled && !!ctx.face;
    if (!this.drawing || !ctx.face) return;
    const lm = ctx.face.landmarks;
    this.left = this.toPx(leftEyeCenter(lm), ctx);
    this.right = this.toPx(rightEyeCenter(lm), ctx);
    // scale bolts to face size (eye separation)
    this.scale = Math.max(20, Math.hypot(this.left.x - this.right.x, this.left.y - this.right.y));
  }

  private toPx(p: Landmark, ctx: RenderContext): Pt {
    return { x: p.x * ctx.width, y: p.y * ctx.height };
  }

  render(g: CanvasRenderingContext2D): void {
    if (!this.drawing) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    this.drawEye(g, this.left);
    this.drawEye(g, this.right);
    g.restore();
  }

  private drawEye(g: CanvasRenderingContext2D, p: Pt): void {
    const s = this.scale;
    // glowing core
    const glow = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 0.6);
    glow.addColorStop(0, 'rgba(220,250,255,0.95)');
    glow.addColorStop(0.4, 'rgba(120,210,255,0.6)');
    glow.addColorStop(1, 'rgba(80,160,255,0)');
    g.fillStyle = glow;
    g.beginPath();
    g.arc(p.x, p.y, s * 0.6, 0, Math.PI * 2);
    g.fill();

    // crackling bolts in random directions
    const bolts = 5;
    for (let i = 0; i < bolts; i++) {
      const ang = Math.random() * Math.PI * 2;
      const len = s * (0.8 + Math.random() * 1.6);
      this.bolt(g, p.x, p.y, ang, len);
    }
  }

  private bolt(g: CanvasRenderingContext2D, x: number, y: number, ang: number, len: number): void {
    const segs = 5 + Math.floor(Math.random() * 4);
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const nx = -dy, ny = dx; // perpendicular for jitter
    g.beginPath();
    g.moveTo(x, y);
    for (let i = 1; i <= segs; i++) {
      const t = i / segs;
      const jitter = (Math.random() - 0.5) * len * 0.35 * (1 - t * 0.5);
      g.lineTo(x + dx * len * t + nx * jitter, y + dy * len * t + ny * jitter);
    }
    g.strokeStyle = Math.random() < 0.5 ? 'rgba(180,235,255,0.9)' : 'rgba(255,255,255,0.85)';
    g.lineWidth = 1 + Math.random() * 2;
    g.shadowBlur = 12;
    g.shadowColor = '#7df9ff';
    g.stroke();
    g.shadowBlur = 0;
  }
}
