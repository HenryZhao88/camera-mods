import { Container, Sprite, Texture } from 'pixi.js';
import { DomainCore } from './domainCore';
import { isClasped } from '../gesture/clasp';
import { matchTwoHand } from '../gesture/customTriggers';
import { domainSlam, domainRumbleStart, domainRumbleStop, slashTick, domainCollapse } from '../fx/sfx';
import type { PersonSegmenter } from '../segmenter';
import type { Effect, EffectStage, RenderContext, TwoHandTemplate } from '../types';

const BLOT_COUNT = 5;
const BLOT_DELAYS = [0, 0.08, 0.13, 0.19, 0.25]; // per-blot bleed stagger (s of progress-time)
const SLASH_MIN_GAP = 0.12;
const SLASH_MAX_GAP = 0.45;
const SLASH_LIFE = 0.14;
const MAX_SLASHES = 12;
const BIG_SLASH_CHANCE = 0.08;
const CRIMSON = 0xb3122a;

interface Slash { core: Sprite; glow: Sprite; t: number; }

// Sukuna-homage Domain Expansion: hold the two-hand sign to cast; the domain
// bleeds across the frame (ink mask), a horned shrine rises behind the user
// (person segmentation), dismantle slashes flicker until collapse() (X key).
export class DomainExpansion implements Effect {
  id = 'domain-expansion';
  mode = 'toggle' as const; // unused by the driver; self-driven
  enabled = true;
  private core = new DomainCore();
  private signTpl: TwoHandTemplate | null = null;
  private signThreshold: () => number = () => 0.6;
  private mounted = false;
  private stage: EffectStage | null = null;

  // backdrop pieces
  private backdropGroup = new Container();
  private darkWash = new Sprite(Texture.WHITE);
  private shrine: Sprite | null = null;
  private cutout: Sprite | null = null;
  private cutoutMask: Sprite | null = null;

  // screen pieces
  private bleedGroup = new Container();
  private gradeRed = new Sprite(Texture.WHITE);
  private gradeDark = new Sprite(Texture.WHITE);
  private vignette: Sprite | null = null;
  private blotMask = new Container();
  private blots: Sprite[] = [];
  private slashLayer = new Container();
  private slashPool: Slash[] = [];
  private liveSlashes: Slash[] = [];
  private nextSlashIn = 0;
  private castMid = { x: 0.5, y: 0.5 };

  constructor(private segmenter: PersonSegmenter) {}

  setCustomSign(t: TwoHandTemplate | null, getThreshold: () => number = () => 0.6): void {
    this.signTpl = t;
    this.signThreshold = getThreshold;
  }

  // Play collapse sfx here since core.collapse() is synchronous — the
  // transition happens outside step(), so it cannot be detected via prev/state
  // comparison inside update().
  collapse(): void {
    if (this.core.state === 'active') {
      domainCollapse();
      domainRumbleStop();
    }
    this.core.collapse();
  }

  init(stage: EffectStage): void {
    this.stage = stage;

    // backdrop: dark wash + shrine + person cutout (masked by segmentation)
    this.darkWash.tint = 0x12060a;
    this.darkWash.alpha = 0;
    this.shrine = new Sprite(stage.fx.textures.shrine);
    this.shrine.anchor.set(0.5, 1);
    this.shrine.visible = false;
    this.backdropGroup.addChild(this.darkWash, this.shrine);
    stage.backdrop.addChild(this.backdropGroup);
    this.backdropGroup.visible = false;

    // screen: crimson grade group masked by the ink blots, slashes above
    this.gradeDark.tint = 0x000000;
    this.gradeDark.alpha = 0.45;
    this.gradeRed.tint = CRIMSON;
    this.gradeRed.alpha = 0.28;
    this.gradeRed.blendMode = 'multiply';
    this.vignette = new Sprite(stage.fx.textures.vignette);
    this.vignette.alpha = 0.75;
    this.bleedGroup.addChild(this.gradeDark, this.gradeRed, this.vignette);

    for (let i = 0; i < BLOT_COUNT; i++) {
      const blot = new Sprite(stage.fx.textures.inkBlots[i % stage.fx.textures.inkBlots.length]);
      blot.anchor.set(0.5);
      blot.visible = false;
      this.blots.push(blot);
      this.blotMask.addChild(blot);
    }
    this.bleedGroup.mask = this.blotMask;
    this.bleedGroup.visible = false;

    stage.screen.addChild(this.bleedGroup, this.blotMask, this.slashLayer);
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.core.state !== 'idle' && this.core.state !== 'arming'; }

  reset(): void {
    this.core.reset();
    domainRumbleStop();
    this.segmenter.stop();
    if (this.mounted) {
      this.backdropGroup.visible = false;
      this.bleedGroup.visible = false;
      for (const b of this.blots) b.visible = false;
      for (const s of this.liveSlashes) this.recycleSlash(s);
      this.liveSlashes = [];
      this.teardownCutout();
    }
  }

  update(dt: number, ctx: RenderContext): void {
    const signHeld =
      this.enabled && ctx.hands.length >= 2 &&
      (this.signTpl
        ? matchTwoHand(ctx.hands, this.signTpl, this.signThreshold())
        : isClasped(ctx.hands));

    const prev = this.core.state;
    const ev = this.core.step(this.enabled ? signHeld : false, dt);
    const state = this.core.state;

    // capture the cast origin (hands midpoint) the moment casting begins
    if (prev === 'arming' && state === 'casting' && ctx.hands.length >= 2) {
      this.castMid = {
        x: (ctx.hands[0].landmarks[9].x + ctx.hands[1].landmarks[9].x) / 2,
        y: (ctx.hands[0].landmarks[9].y + ctx.hands[1].landmarks[9].y) / 2,
      };
    }

    // lifecycle transitions
    if (ev.slammed && this.stage) {
      domainSlam();
      this.stage.fx.transients.flash(0.5, 0.2, 0xff2222);
      this.stage.fx.transients.ripple(this.castMid.x * ctx.width, this.castMid.y * ctx.height,
        { amplitude: 36, wavelength: 200, speed: 1100, duration: 0.8 });
      this.stage.fx.shake.kick(16);
      domainRumbleStart();
    }
    if (prev === 'idle' && state === 'arming') this.segmenter.ensureStarted();
    // NOTE: collapse sfx is played in this.collapse() since core.collapse() is
    // synchronous — the active→collapsing transition happens outside step().
    if (state === 'idle' && prev !== 'idle') {
      this.segmenter.stop();
      domainRumbleStop(); // belt & braces (reset paths)
    }

    if (state === 'collapsing' || state === 'active' || state === 'casting') {
      this.segmenter.update(ctx.now);
    }

    // slashes only while fully active
    if (state === 'active') {
      this.nextSlashIn -= dt;
      if (this.nextSlashIn <= 0) {
        this.nextSlashIn = SLASH_MIN_GAP + Math.random() * (SLASH_MAX_GAP - SLASH_MIN_GAP);
        const count = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < count; i++) this.spawnSlash(ctx);
      }
    }
    for (const s of this.liveSlashes) s.t += dt;
    this.liveSlashes = this.liveSlashes.filter(s => {
      if (s.t >= SLASH_LIFE) { this.recycleSlash(s); return false; }
      const k = 1 - s.t / SLASH_LIFE;
      s.core.alpha = k;
      s.glow.alpha = 0.6 * k;
      return true;
    });

    if (this.mounted) this.redraw(ctx);
  }

  private spawnSlash(ctx: RenderContext): void {
    if (this.liveSlashes.length >= MAX_SLASHES || !this.stage) return;
    const big = Math.random() < BIG_SLASH_CHANCE;
    const slash = this.slashPool.pop() ?? this.makeSlash();
    const diag = Math.hypot(ctx.width, ctx.height);
    const len = big ? diag * 1.1 : diag * (0.15 + Math.random() * 0.3);
    const x = ctx.width * (0.1 + Math.random() * 0.8);
    const y = ctx.height * (0.1 + Math.random() * 0.8);
    const ang = Math.random() * Math.PI;
    for (const sp of [slash.core, slash.glow]) {
      sp.position.set(x, y);
      sp.rotation = ang;
      sp.visible = true;
    }
    // streak texture is 64x16; scale x to length, y for thickness
    slash.core.scale.set(len / 64, big ? 0.45 : 0.22);
    slash.glow.scale.set(len / 64, big ? 1.3 : 0.7);
    slash.core.alpha = 1;
    slash.glow.alpha = 0.6;
    slash.t = 0;
    this.liveSlashes.push(slash);
    slashTick(big);
  }

  private makeSlash(): Slash {
    const tex = this.stage!.fx.textures.streak;
    const glow = new Sprite(tex);
    glow.anchor.set(0.5);
    glow.blendMode = 'add';
    glow.tint = CRIMSON;
    const core = new Sprite(tex);
    core.anchor.set(0.5);
    core.blendMode = 'add';
    core.tint = 0xffffff;
    this.slashLayer.addChild(glow, core);
    return { core, glow, t: 0 };
  }

  private recycleSlash(s: Slash): void {
    s.core.visible = false;
    s.glow.visible = false;
    this.slashPool.push(s);
  }

  private redraw(ctx: RenderContext): void {
    const p = this.core.progress;
    const show = p > 0.001;
    this.backdropGroup.visible = show;
    this.bleedGroup.visible = show;
    if (!show) {
      for (const b of this.blots) b.visible = false;
      this.teardownCutout();
      return;
    }

    const w = ctx.width, h = ctx.height;

    // ink blots: first at the cast midpoint, rest seeded around the frame
    const anchors = [
      this.castMid,
      { x: 0.15, y: 0.2 }, { x: 0.85, y: 0.25 }, { x: 0.2, y: 0.8 }, { x: 0.8, y: 0.75 },
    ];
    // each blot must be able to cover the whole frame alone (diag/512-texture)
    const fullScale = (Math.hypot(w, h) * 1.2) / 512;
    for (let i = 0; i < BLOT_COUNT; i++) {
      // Formula: local = clamp(p*(1 + BLOT_DELAYS[last]) - BLOT_DELAYS[i], 0, 1)
      // At p=1: blot i=0 → 1*1.25 - 0 = 1.25 → clamped to 1 ✓
      //         blot i=4 → 1*1.25 - 0.25 = 1.0 ✓ (all blots reach full at p=1)
      const local = Math.max(0, Math.min(1, (p * (1 + BLOT_DELAYS[BLOT_COUNT - 1]) - BLOT_DELAYS[i])));
      const blot = this.blots[i];
      blot.visible = local > 0.001;
      blot.position.set(anchors[i].x * w, anchors[i].y * h);
      blot.scale.set(local * local * fullScale); // ease-in growth
      blot.rotation = i * 1.7 + p * 0.3;
    }

    // grade sprites fill the frame
    for (const s of [this.gradeDark, this.gradeRed]) { s.width = w; s.height = h; }
    if (this.vignette) { this.vignette.width = w; this.vignette.height = h; }

    // backdrop wash + shrine rise behind the user
    this.darkWash.width = w;
    this.darkWash.height = h;
    this.darkWash.alpha = 0.85 * p;
    if (this.shrine) {
      const ease = 1 - Math.pow(1 - p, 3);
      const bob = this.core.state === 'active' ? Math.sin(ctx.now / 900) * 4 : 0;
      this.shrine.visible = true;
      this.shrine.width = w * 0.85;
      this.shrine.scale.y = this.shrine.scale.x;
      const rest = h * 1.12; // bottom ~12% submerged at rest
      // Set x and y separately — no redundant position.set call
      this.shrine.x = w / 2;
      this.shrine.y = rest + (1 - ease) * (this.shrine.height * 0.9) + bob;
    }

    this.syncCutout(w, h);
  }

  // Person cutout: re-renders the user IN FRONT of the shrine, masked live.
  private syncCutout(w: number, h: number): void {
    const maskTex = this.segmenter.maskTexture;
    if (!maskTex || !this.stage) { this.teardownCutout(); return; }

    // the compositor's video sprite is always the world's first child once frames run
    const video = this.stage.world.children[0];
    if (!(video instanceof Sprite)) return;

    if (!this.cutout) {
      this.cutout = new Sprite(video.texture);
      this.cutout.scale.x = -1; // mirror like the main video sprite
      this.cutoutMask = new Sprite(maskTex);
      this.backdropGroup.addChild(this.cutout, this.cutoutMask);
      this.cutout.mask = this.cutoutMask;
    }
    // re-read every frame: the compositor recreates the video texture on
    // camera-dims changes, and a stale reference would render a destroyed texture
    this.cutout.texture = video.texture;
    this.cutout.x = w;
    this.cutout.visible = true;
    if (this.cutoutMask) {
      this.cutoutMask.texture = maskTex;
      // mask canvas is in UNMIRRORED video space; mirror it to match the view
      this.cutoutMask.scale.set(-(w / 256), h / 256);
      this.cutoutMask.x = w;
      this.cutoutMask.visible = true;
    }
  }

  private teardownCutout(): void {
    if (this.cutout) {
      this.cutout.mask = null;
      this.backdropGroup.removeChild(this.cutout);
      this.cutout.destroy(); // sprite only; the video texture belongs to the compositor
      this.cutout = null;
    }
    if (this.cutoutMask) {
      this.backdropGroup.removeChild(this.cutoutMask);
      this.cutoutMask.destroy();
      this.cutoutMask = null;
    }
  }
}
