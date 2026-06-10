import { Container, Graphics } from 'pixi.js';
import { GlowFilter } from 'pixi-filters';
import { FxParticles } from '../fx/particles';
import { genBolt, type Bolt, type BoltPt } from '../fx/boltGen';
import { fingersUp } from '../gesture/handGestures';
import type { Effect, EffectStage, RenderContext } from '../types';

const REGEN_MS = 60;        // bolts re-jitter ~16x/s for live flicker
const ARC_EVERY_MS = 300;   // occasional fingertip-to-fingertip arc
const ARC_LIFE_MS = 90;
const TIP_IDS = [4, 8, 12, 16, 20];
const PIP_IDS = [2, 6, 10, 14, 18];
const GLOW = 0x58c8ff;

// Real branching lightning from each extended fingertip: white cores on a
// GlowFilter'd layer, occasional arcs between fingertips, drifting embers.
export class FingertipLightning implements Effect {
  id = 'fingertip-lightning';
  mode = 'hold' as const;
  private held = false;
  private mounted = false;
  private dirty = false;
  private view = new Container();
  private gfx = new Graphics();
  private ps: FxParticles | null = null;
  private bolts: Bolt[] = [];
  private arcs: Array<{ bolt: Bolt; until: number }> = [];
  private lastGen = 0;
  private lastArc = 0;

  init(stage: EffectStage): void {
    this.ps = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 150);
    this.view.addChild(this.gfx, this.ps.view);
    this.view.filters = [new GlowFilter({ distance: 12, outerStrength: 2.4, color: GLOW, quality: 0.25 })];
    this.view.visible = false;
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void { this.held = true; }
  stop(): void { this.held = false; this.bolts = []; this.dirty = true; }
  isActive(): boolean { return this.held || (this.ps?.count ?? 0) > 0 || this.arcs.length > 0; }
  reset(): void {
    this.held = false; this.bolts = []; this.arcs = [];
    this.ps?.clear(); this.gfx.clear();
    this.dirty = false;
    if (this.mounted) this.view.visible = false;
  }

  update(dt: number, ctx: RenderContext): void {
    if (this.held && ctx.hand) {
      const lm = ctx.hand.landmarks;
      const up = fingersUp(lm);
      const tipPx = TIP_IDS.map(i => ({ x: lm[i].x * ctx.width, y: lm[i].y * ctx.height }));

      if (ctx.now - this.lastGen >= REGEN_MS) {
        this.lastGen = ctx.now;
        this.bolts = [];
        for (let f = 0; f < TIP_IDS.length; f++) {
          if (!up[f]) continue;
          const pip = lm[PIP_IDS[f]];
          const tip = lm[TIP_IDS[f]];
          const ang = Math.atan2(tip.y - pip.y, tip.x - pip.x); // outward along the finger
          for (let k = 0; k < 2; k++) {
            this.bolts.push(genBolt({
              x: tipPx[f].x, y: tipPx[f].y,
              angle: ang + (Math.random() - 0.5) * 1.2,
              length: 60 + Math.random() * 70,
            }));
          }
          if (Math.random() < 0.45) {
            this.ps?.spawn({
              x: tipPx[f].x, y: tipPx[f].y,
              vx: (Math.random() - 0.5) * 40, vy: -20 - Math.random() * 50,
              ay: -25, life: 0.4 + Math.random() * 0.3,
              size: 3 + Math.random() * 3, tint: 0x9fe8ff,
            });
          }
        }
        this.dirty = true;
      }

      const upTips = TIP_IDS.map((_, f) => f).filter(f => up[f]);
      if (upTips.length >= 2 && ctx.now - this.lastArc >= ARC_EVERY_MS) {
        this.lastArc = ctx.now;
        const i = upTips[Math.floor(Math.random() * upTips.length)];
        let j = upTips[Math.floor(Math.random() * upTips.length)];
        if (j === i) j = upTips[(upTips.indexOf(i) + 1) % upTips.length];
        const a = tipPx[i], b = tipPx[j];
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len > 8) {
          this.arcs.push({
            bolt: genBolt({ x: a.x, y: a.y, angle: ang, length: len, branchChance: 0, jitter: 0.12 }),
            until: ctx.now + ARC_LIFE_MS,
          });
          this.dirty = true;
        }
      }
    } else if (this.bolts.length > 0) {
      this.bolts = [];
      this.dirty = true; // erase stale bolts when the hand/hold disappears
    }

    const arcsBefore = this.arcs.length;
    this.arcs = this.arcs.filter(a => a.until > ctx.now);
    if (this.arcs.length !== arcsBefore) this.dirty = true;
    this.ps?.update(dt);
    if (this.mounted) {
      if (this.dirty) {
        this.dirty = false;
        this.redraw();
      }
      this.view.visible = this.isActive();
    }
  }

  private poly(points: BoltPt[]): void {
    this.gfx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) this.gfx.lineTo(points[i].x, points[i].y);
  }

  private strokePoly(points: BoltPt[], coreWidth: number, glowWidth: number): void {
    this.poly(points);
    this.gfx.stroke({ width: glowWidth, color: GLOW, alpha: 0.35, cap: 'round', join: 'round' });
    this.poly(points);
    this.gfx.stroke({ width: coreWidth, color: 0xffffff, alpha: 0.95, cap: 'round', join: 'round' });
  }

  private redraw(): void {
    this.gfx.clear();
    for (const b of this.bolts) {
      this.strokePoly(b.points, 1.8, 5);
      for (const br of b.branches) this.strokePoly(br, 1.2, 3);
    }
    for (const a of this.arcs) this.strokePoly(a.bolt.points, 2.2, 6);
  }
}
