import { Container, Sprite } from 'pixi.js';
import { FxParticles } from '../fx/particles';
import { GunCore } from './gunCore';
import { playBang } from '../fx/sfx';
import { fingersUp } from '../gesture/handGestures';
import type { Effect, EffectStage, HandLandmarks, RenderContext } from '../types';

const FLASH_SECONDS = 0.09;

// Finger-gun: index out, others curled. Thumb up cocks; dropping the thumb fires.
// Cinematic kit: 4-point star muzzle flash, tracer streaks, drifting smoke,
// frame flash + screen kick. (Dual-wield lands with two-hand tracking in Task 9.)
export class GunShot implements Effect {
  id = 'gun-shot';
  mode = 'oneshot' as const;
  enabled = true;
  private core = new GunCore();
  private mounted = false;
  private stage: EffectStage | null = null;
  private view = new Container();
  private flashA: Sprite | null = null; // elongated star arm
  private flashB: Sprite | null = null; // crossed star arm
  private flashCore: Sprite | null = null;
  private ps: FxParticles | null = null;
  private smoke: FxParticles | null = null;
  private flash = -1;
  private fx = 0; private fy = 0;
  private dirx = 1; private diry = 0;

  init(stage: EffectStage): void {
    this.stage = stage;
    this.ps = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 80);
    this.smoke = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 40);
    this.flashA = new Sprite(stage.fx.textures.streak);
    this.flashB = new Sprite(stage.fx.textures.streak);
    this.flashCore = new Sprite(stage.fx.textures.glow);
    for (const s of [this.flashA, this.flashB, this.flashCore]) {
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = 0xfff3b0;
      s.visible = false;
    }
    this.view.addChild(this.smoke.view, this.flashA, this.flashB, this.flashCore, this.ps.view);
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.flash > 0 || (this.ps?.count ?? 0) > 0 || (this.smoke?.count ?? 0) > 0; }
  reset(): void {
    this.flash = -1; this.core.reset();
    this.ps?.clear(); this.smoke?.clear();
    this.hideFlash();
  }

  update(dt: number, ctx: RenderContext): void {
    if (this.flash > 0) this.flash -= dt;
    this.ps?.update(dt);
    this.smoke?.update(dt);

    if (this.enabled && ctx.hand) {
      const lm = ctx.hand.landmarks;
      const f = fingersUp(lm);
      const isGun = f[1] && !f[2] && !f[3] && !f[4];
      if (this.core.step({ isGun, thumbUp: f[0] }, ctx.now)) this.shoot(lm, ctx);
    } else {
      this.core.step(null, ctx.now);
    }

    if (this.mounted) this.syncFlash();
  }

  private shoot(lm: HandLandmarks, ctx: RenderContext): void {
    const tip = lm[8], base = lm[5];
    this.fx = tip.x * ctx.width;
    this.fy = tip.y * ctx.height;
    let dx = (tip.x - base.x) * ctx.width, dy = (tip.y - base.y) * ctx.height;
    const len = Math.hypot(dx, dy) || 1;
    this.dirx = dx / len; this.diry = dy / len;
    this.flash = FLASH_SECONDS;

    const ang = Math.atan2(this.diry, this.dirx);
    // 8 tracers down the barrel
    for (let i = 0; i < 8; i++) {
      const spread = (Math.random() - 0.5) * 0.25;
      const sp = 900 + Math.random() * 500;
      this.ps?.spawn({
        x: this.fx, y: this.fy,
        vx: Math.cos(ang + spread) * sp, vy: Math.sin(ang + spread) * sp,
        life: 0.12, size: 7, tint: 0xfff3b0, streak: true,
      });
    }
    // 14 sparks
    for (let i = 0; i < 14; i++) {
      const a = ang + (Math.random() - 0.5) * 1.2;
      const sp = 250 + Math.random() * 550;
      this.ps?.spawn({
        x: this.fx, y: this.fy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        ay: 300, drag: 1.5, life: 0.18 + Math.random() * 0.22,
        size: 2 + Math.random() * 3, tint: Math.random() < 0.5 ? 0xfff3b0 : 0xffb142,
      });
    }
    // 5 smoke puffs (normal blend, drift + grow + fade)
    for (let i = 0; i < 5; i++) {
      this.smoke?.spawn({
        x: this.fx + this.dirx * 14, y: this.fy + this.diry * 14,
        vx: this.dirx * 40 + (Math.random() - 0.5) * 30,
        vy: this.diry * 40 - 20 - Math.random() * 25,
        drag: 1.2, life: 1.1 + Math.random() * 0.5, grow: 1.4,
        size: 8 + Math.random() * 8, tint: 0x9a9a9a, alpha: 0.32, additive: false,
      });
    }
    this.stage?.fx.transients.flash(0.18, 0.12);
    this.stage?.fx.shake.kick(6);
    playBang();
  }

  private syncFlash(): void {
    if (!this.flashA || !this.flashB || !this.flashCore) return;
    const on = this.flash > 0;
    this.flashA.visible = this.flashB.visible = this.flashCore.visible = on;
    if (!on) return;
    const a = this.flash / FLASH_SECONDS;
    const ang = Math.atan2(this.diry, this.dirx);
    const cx = this.fx + this.dirx * 12, cy = this.fy + this.diry * 12;
    this.flashA.position.set(cx, cy);
    this.flashB.position.set(cx, cy);
    this.flashCore.position.set(cx, cy);
    this.flashA.rotation = ang;
    this.flashB.rotation = ang + Math.PI / 2 + (Math.random() - 0.5) * 0.3;
    this.flashA.scale.set(1.6 + (1 - a), 0.9);
    this.flashB.scale.set(0.9 + (1 - a) * 0.6, 0.55);
    this.flashCore.scale.set((20 + (1 - a) * 16) / 16);
    this.flashA.alpha = this.flashB.alpha = a;
    this.flashCore.alpha = a;
  }

  private hideFlash(): void {
    if (this.flashA && this.flashB && this.flashCore) {
      this.flashA.visible = this.flashB.visible = this.flashCore.visible = false;
    }
  }
}
