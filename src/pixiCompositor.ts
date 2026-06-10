import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { ScreenShake } from './fx/shake';
import { TransientFx } from './fx/transients';
import { buildFxTextures, type FxTextures } from './fx/proceduralTextures';
import { buildFilterRig, type FilterRig, type ScreenFilter } from './filters';
import { drawHandSkeleton } from './overlay';
import { EffectDriver } from './effects/effectDriver';
import type { Camera } from './camera';
import type { HandTracker } from './handTracker';
import type { FaceTracker } from './faceTracker';
import type { GestureEngine } from './gesture/gestureEngine';
import type { Effect, EffectStage, FaceResult, HandResult, RenderContext } from './types';

export interface CompositorHooks {
  onFrame?: (
    hand: HandResult | null,
    fired: string[],
    active: Set<string>,
  ) => void;
}

// WebGL compositor: mirrored video sprite + effect layers + shake + transient
// shader FX + the selected screen-filter rig. Created ONCE and reused across
// start/stop cycles (a Pixi Application must not be re-created per start).
export class PixiCompositor {
  showLandmarks = false;
  trackFace = false;

  private app = new Application();
  private root = new Container();      // gets the screen-filter rig (final grade)
  private world = new Container();     // shaken; video + effects + overlay
  private effectsLayer = new Container();
  private overlayGfx = new Graphics();
  private screenLayer = new Container(); // "on the lens": splats, flashes, dim grade
  private videoSprite: Sprite | null = null;
  private vsW = 0;
  private vsH = 0;

  private shake = new ScreenShake();
  private transients!: TransientFx;
  private textures!: FxTextures;

  private _screenFilter: ScreenFilter = 'none';
  private rig: FilterRig | null = null;
  private rigT = 0;

  private driver: EffectDriver;
  private raf = 0;
  private last = 0;
  private inited = false;

  constructor(
    private camera: Camera,
    private tracker: HandTracker,
    private faceTracker: FaceTracker,
    private engine: GestureEngine,
    private effects: Effect[],
    private hooks: CompositorHooks = {},
  ) {
    this.driver = new EffectDriver(effects);
  }

  // Must be awaited once before start(). Mounts the scene graph and inits effects.
  async init(canvas: HTMLCanvasElement): Promise<void> {
    if (this.inited) return;
    await this.app.init({
      canvas,
      width: 1280,
      height: 720,
      preference: 'webgl', // OBS browser-source safe; no WebGPU surprises
      antialias: true,
      background: '#000000',
      autoStart: false,
      sharedTicker: false,
    });
    this.app.ticker.stop(); // we drive rendering from our own rAF loop

    this.world.addChild(this.effectsLayer, this.overlayGfx);
    this.root.addChild(this.world, this.screenLayer);
    this.app.stage.addChild(this.root);

    this.textures = buildFxTextures();
    this.transients = new TransientFx(this.world, this.screenLayer);

    const stage: EffectStage = {
      world: this.world,
      effects: this.effectsLayer,
      screen: this.screenLayer,
      fx: { shake: this.shake, transients: this.transients, textures: this.textures },
    };
    for (const e of this.effects) e.init(stage);

    this.applyFilter();
    this.inited = true;
  }

  get screenFilter(): ScreenFilter { return this._screenFilter; }
  set screenFilter(id: ScreenFilter) {
    this._screenFilter = id;
    if (this.inited) this.applyFilter();
  }

  private applyFilter(): void {
    this.rig?.destroy();
    this.rig = buildFilterRig(this._screenFilter);
    this.root.filters = this.rig ? this.rig.filters : [];
    this.rigT = 0;
  }

  start(): void {
    if (!this.inited) return;
    this.last = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void { cancelAnimationFrame(this.raf); }

  private frame(now: number): void {
    if (!this.inited) return;
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;

    const w = this.camera.width, h = this.camera.height;
    if (!w || !h) return;
    if (this.app.renderer.width !== w || this.app.renderer.height !== h) {
      this.app.renderer.resize(w, h);
    }

    // Lazily (re)create the mirrored video sprite; recreate if camera dims changed.
    if (this.videoSprite && (this.vsW !== w || this.vsH !== h)) {
      this.videoSprite.destroy({ texture: true, textureSource: true });
      this.videoSprite = null;
    }
    if (!this.videoSprite) {
      const tex = Texture.from(this.camera.video, true); // skipCache: fresh per stream
      this.videoSprite = new Sprite(tex);
      this.videoSprite.scale.x = -1; // mirrored selfie view
      this.world.addChildAt(this.videoSprite, 0);
      this.vsW = w; this.vsH = h;
    }
    this.videoSprite.x = w;
    // backstop refresh (VideoSource autoUpdate covers steady state; this helps after stream rebinds)
    this.videoSprite.texture.source.update();

    const hands = this.tracker.detect(this.camera.video, now);
    const hand = hands[0] ?? null;

    let face: FaceResult | null = null;
    if (this.trackFace && this.faceTracker.ready) {
      face = this.faceTracker.detect(this.camera.video, now)[0] ?? null;
    }

    const ctx: RenderContext = { width: w, height: h, hand, face, now };

    const result = this.engine.update(hand ? hand.landmarks : null, now);
    this.driver.apply(result.fired, result.active);
    this.hooks.onFrame?.(hand, result.fired, result.active);

    for (const e of this.effects) e.update(dt, ctx);

    this.overlayGfx.clear();
    if (this.showLandmarks && hand) drawHandSkeleton(this.overlayGfx, hand.landmarks, w, h);

    this.shake.update(dt);
    const off = this.shake.offset();
    this.world.position.set(off.x, off.y);

    this.transients.setSize(w, h);
    this.transients.update(dt);

    this.rigT += dt;
    this.rig?.update(dt, this.rigT);

    this.app.renderer.render(this.app.stage);
  }
}
