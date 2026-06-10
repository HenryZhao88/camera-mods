import { Container, Graphics } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import type { Effect, EffectStage, RenderContext } from '../types';

interface Pt { x: number; y: number; }
const NEON = 0x39ff14;

export class PinchDraw implements Effect {
  id = 'pinch-draw';
  mode = 'hold' as const;
  private drawing = false;
  private mounted = false;
  private strokes: Pt[][] = [];
  private current: Pt[] = [];
  private dirty = false;
  private view = new Container();
  private gfx = new Graphics();

  init(stage: EffectStage): void {
    this.view.addChild(this.gfx);
    this.view.filters = [new GlowFilter({ distance: 10, outerStrength: 2.2, color: NEON, quality: 0.25 })];
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void { this.drawing = true; this.current = []; this.strokes.push(this.current); }
  stop(): void { this.drawing = false; }
  isActive(): boolean { return this.strokes.length > 0; }
  clear(): void { this.strokes = []; this.current = []; this.dirty = true; }
  reset(): void { this.drawing = false; this.clear(); }

  update(_dt: number, ctx: RenderContext): void {
    if (this.drawing && ctx.hand) {
      const p = ctx.hand.landmarks[8]; // index fingertip
      this.current.push({ x: p.x * ctx.width, y: p.y * ctx.height });
      this.dirty = true;
    }
    if (this.mounted && this.dirty) {
      this.dirty = false;
      this.redraw();
    }
  }

  private redraw(): void {
    this.gfx.clear();
    for (const s of this.strokes) {
      if (s.length < 2) continue;
      this.gfx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) this.gfx.lineTo(s[i].x, s[i].y);
      this.gfx.stroke({ width: 8, color: NEON, alpha: 0.35, cap: 'round', join: 'round' });
      this.gfx.moveTo(s[0].x, s[0].y);
      for (let i = 1; i < s.length; i++) this.gfx.lineTo(s[i].x, s[i].y);
      this.gfx.stroke({ width: 2.5, color: 0xffffff, alpha: 0.95, cap: 'round', join: 'round' });
    }
  }
}
