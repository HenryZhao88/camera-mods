import { Container, Graphics, Sprite } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { genBolt, type BoltPt } from '../fx/boltGen';
import { leftEyeCenter, rightEyeCenter } from '../facePose';
import type { Effect, EffectStage, Landmark, RenderContext } from '../types';

interface Pt { x: number; y: number; }
const REGEN_MS = 60;
const EYE_ARC_EVERY_MS = 2500;
const EYE_ARC_LIFE_MS = 120;
const GLOW = 0x58c8ff;

// Pulsing white-blue eye cores + anamorphic flare streaks + mini bolts,
// with a rare arc jumping between the eyes. Self-driven by face tracking.
export class LightningEyes implements Effect {
  id = 'lightning-eyes';
  mode = 'toggle' as const;
  enabled = false;
  private drawing = false;
  private mounted = false;
  private dirty = false;
  private view = new Container();
  private gfx = new Graphics();
  private cores: Sprite[] = [];
  private flares: Sprite[] = [];
  private left: Pt = { x: 0, y: 0 };
  private right: Pt = { x: 0, y: 0 };
  private prevLeft: Pt = { x: -1, y: -1 };
  private prevRight: Pt = { x: -1, y: -1 };
  private scale = 40;
  private lastGen = 0;
  private lastEyeArc = 0;
  private bolts: BoltPt[][] = [];
  private arc: { pts: BoltPt[]; until: number } | null = null;

  init(stage: EffectStage): void {
    for (let i = 0; i < 2; i++) {
      const core = new Sprite(stage.fx.textures.glow);
      core.anchor.set(0.5); core.blendMode = 'add'; core.tint = 0xdcfaff;
      const flare = new Sprite(stage.fx.textures.streak);
      flare.anchor.set(0.5); flare.blendMode = 'add'; flare.tint = 0x9fe8ff;
      this.cores.push(core); this.flares.push(flare);
    }
    this.view.addChild(this.gfx, ...this.flares, ...this.cores);
    this.view.filters = [new GlowFilter({ distance: 10, outerStrength: 2, color: GLOW, quality: 0.25 })];
    this.view.visible = false;
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.drawing; }
  reset(): void {
    this.drawing = false; this.bolts = []; this.arc = null; this.dirty = false;
    this.prevLeft = { x: -1, y: -1 }; this.prevRight = { x: -1, y: -1 };
    if (this.mounted) this.view.visible = false;
  }

  update(_dt: number, ctx: RenderContext): void {
    this.drawing = this.enabled && !!ctx.face;
    if (this.mounted) this.view.visible = this.drawing;
    if (!this.drawing || !ctx.face) return;

    const lm = ctx.face.landmarks;
    this.left = this.toPx(leftEyeCenter(lm), ctx);
    this.right = this.toPx(rightEyeCenter(lm), ctx);
    this.scale = Math.max(20, Math.hypot(this.left.x - this.right.x, this.left.y - this.right.y));

    // Mark dirty if eye positions moved more than 0.5px since last redraw
    if (
      Math.hypot(this.left.x - this.prevLeft.x, this.left.y - this.prevLeft.y) > 0.5 ||
      Math.hypot(this.right.x - this.prevRight.x, this.right.y - this.prevRight.y) > 0.5
    ) {
      this.dirty = true;
    }

    if (ctx.now - this.lastGen >= REGEN_MS) {
      this.lastGen = ctx.now;
      this.bolts = [];
      for (const eye of [this.left, this.right]) {
        for (let i = 0; i < 2; i++) {
          const b = genBolt({
            x: eye.x, y: eye.y,
            angle: Math.random() * Math.PI * 2,
            length: this.scale * (0.5 + Math.random() * 0.8),
            segments: 5, branchChance: 0.2,
          });
          this.bolts.push(b.points, ...b.branches);
        }
      }
      this.dirty = true;
    }

    if (ctx.now - this.lastEyeArc >= EYE_ARC_EVERY_MS) {
      this.lastEyeArc = ctx.now;
      const ang = Math.atan2(this.right.y - this.left.y, this.right.x - this.left.x);
      this.arc = {
        pts: genBolt({ x: this.left.x, y: this.left.y, angle: ang, length: this.scale, branchChance: 0, jitter: 0.1 }).points,
        until: ctx.now + EYE_ARC_LIFE_MS,
      };
      this.dirty = true;
    }
    if (this.arc && this.arc.until < ctx.now) {
      this.arc = null;
      this.dirty = true;
    }

    if (this.mounted && this.dirty) {
      this.dirty = false;
      this.prevLeft = { ...this.left };
      this.prevRight = { ...this.right };
      this.redraw(ctx.now);
    }
  }

  private toPx(p: Landmark, ctx: RenderContext): Pt {
    return { x: p.x * ctx.width, y: p.y * ctx.height };
  }

  private redraw(now: number): void {
    const pulse = 0.85 + 0.15 * Math.sin(now / 90);
    [this.left, this.right].forEach((eye, i) => {
      const core = this.cores[i], flare = this.flares[i];
      core.position.set(eye.x, eye.y);
      core.scale.set((this.scale * 0.5 * pulse) / 16);
      core.alpha = 0.95 * pulse;
      flare.position.set(eye.x, eye.y);
      flare.scale.set((this.scale * 2.6) / 64, 0.32); // long thin horizontal streak
      flare.alpha = 0.5 * pulse;
    });

    this.gfx.clear();
    for (const pts of this.bolts) this.stroke(pts, 1.4, 4);
    if (this.arc) this.stroke(this.arc.pts, 2, 5);
  }

  private stroke(points: BoltPt[], coreW: number, glowW: number): void {
    this.gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.gfx.lineTo(points[i].x, points[i].y);
    this.gfx.stroke({ width: glowW, color: GLOW, alpha: 0.35, cap: 'round', join: 'round' });
    this.gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.gfx.lineTo(points[i].x, points[i].y);
    this.gfx.stroke({ width: coreW, color: 0xffffff, alpha: 0.9, cap: 'round', join: 'round' });
  }
}
