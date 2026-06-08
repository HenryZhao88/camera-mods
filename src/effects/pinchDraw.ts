import type { Effect, RenderContext } from '../types';

interface Pt { x: number; y: number; }

export class PinchDraw implements Effect {
  id = 'pinch-draw';
  mode = 'hold' as const;
  private drawing = false;
  private strokes: Pt[][] = [];
  private current: Pt[] = [];

  start(): void { this.drawing = true; this.current = []; this.strokes.push(this.current); }
  stop(): void { this.drawing = false; }
  isActive(): boolean { return this.strokes.length > 0; }
  clear(): void { this.strokes = []; this.current = []; }
  reset(): void { this.drawing = false; this.clear(); }

  update(_dt: number, ctx: RenderContext): void {
    if (this.drawing && ctx.hand) {
      const p = ctx.hand.landmarks[8]; // index fingertip
      this.current.push({ x: p.x * ctx.width, y: p.y * ctx.height });
    }
  }

  render(g: CanvasRenderingContext2D): void {
    g.save();
    g.globalCompositeOperation = 'lighter';
    g.lineCap = 'round';
    g.lineJoin = 'round';
    g.shadowBlur = 12;
    g.shadowColor = '#39ff14';
    g.strokeStyle = '#39ff14';
    g.lineWidth = 5;
    for (const s of this.strokes) {
      if (s.length < 2) continue;
      g.beginPath();
      g.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) g.lineTo(s[i].x, s[i].y);
      g.stroke();
    }
    g.restore();
  }
}
