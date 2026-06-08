import type { Camera } from './camera';
import type { HandTracker } from './handTracker';
import type { GestureEngine } from './gesture/gestureEngine';
import { EffectDriver } from './effects/effectDriver';
import type { Effect, HandResult, RenderContext } from './types';

export interface CompositorHooks {
  onFrame?: (hand: HandResult | null, scores: Record<string, number>, fired: string[]) => void;
}

export class Compositor {
  private g: CanvasRenderingContext2D;
  private driver: EffectDriver;
  private raf = 0;
  private last = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private camera: Camera,
    private tracker: HandTracker,
    private engine: GestureEngine,
    private effects: Effect[],
    private hooks: CompositorHooks = {},
  ) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas context unavailable');
    this.g = ctx;
    this.driver = new EffectDriver(effects);
  }

  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void { cancelAnimationFrame(this.raf); }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    const w = this.camera.width, h = this.camera.height;
    if (!w || !h) return;
    if (this.canvas.width !== w) this.canvas.width = w;
    if (this.canvas.height !== h) this.canvas.height = h;

    const hands = this.tracker.detect(this.camera.video, now);
    const hand = hands[0] ?? null;
    const ctx: RenderContext = { width: w, height: h, hand, now };

    const result = this.engine.update(hand ? hand.landmarks : null, now);
    this.driver.apply(result.fired, result.active);
    this.hooks.onFrame?.(hand, result.scores, result.fired);

    // mirrored selfie-view video
    this.g.save();
    this.g.translate(w, 0);
    this.g.scale(-1, 1);
    this.g.drawImage(this.camera.video, 0, 0, w, h);
    this.g.restore();

    for (const e of this.effects) {
      if (e.isActive()) {
        e.update(dt, ctx);
        e.render(this.g, ctx);
      }
    }
  }
}
