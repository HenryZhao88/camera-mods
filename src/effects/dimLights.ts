import { Sprite, Texture } from 'pixi.js';
import { classifyOpenFist } from '../gesture/handPose';
import type { Effect, EffectStage, RenderContext } from '../types';

const FADE_SECONDS = 1.5;   // time for a full bright <-> dark sweep
const CONFIRM_FRAMES = 4;   // frames a pose must persist before it flips the target

// Self-driven: fist fades the room down, open hand fades it back up.
// Presenter = cinematic grade on the screen layer: vignette (edges darken first)
// + neutral black + a cool blue multiply for that "night falls" shift.
export class DimLights implements Effect {
  id = 'dim-lights';
  mode = 'toggle' as const; // unused by the driver; this effect self-drives
  enabled = true;
  private level = 0;  // 0 = bright, 1 = fully dim
  private target = 0;
  private pending: 'open' | 'fist' | null = null;
  private confirm = 0;
  private mounted = false;
  private vignette: Sprite | null = null;
  private black: Sprite | null = null;
  private cool: Sprite | null = null;

  init(stage: EffectStage): void {
    this.vignette = new Sprite(stage.fx.textures.vignette);
    this.black = new Sprite(Texture.WHITE);
    this.black.tint = 0x000000;
    this.cool = new Sprite(Texture.WHITE);
    this.cool.tint = 0x223355;
    this.cool.blendMode = 'multiply';
    for (const s of [this.vignette, this.black, this.cool]) {
      s.alpha = 0;
      stage.screen.addChild(s);
    }
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.level > 0.001; }
  reset(): void {
    this.level = 0; this.target = 0; this.pending = null; this.confirm = 0;
    this.sync(0, 0);
  }

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

    this.sync(ctx.width, ctx.height);
  }

  private sync(w: number, h: number): void {
    if (!this.mounted || !this.vignette || !this.black || !this.cool) return;
    for (const s of [this.vignette, this.black, this.cool]) {
      if (w) { s.width = w; s.height = h; }
    }
    this.vignette.alpha = this.level * 0.92;
    this.black.alpha = this.level * 0.35;
    this.cool.alpha = this.level * 0.25;
  }
}
