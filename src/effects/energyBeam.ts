import { Container, Sprite } from 'pixi.js';
import { FxParticles } from '../fx/particles';
import { BeamCore, type BeamFrame } from './beamCore';
import { chargeStart, chargeLevel, chargeCancel, beamFire } from '../fx/sfx';
import { fingersUp } from '../gesture/handGestures';
import type { Effect, EffectStage, HandResult, RenderContext } from '../types';

const PALMS_DIST_FACTOR = 1.6; // wrists closer than this x avg hand size = together
const CORE_TINTS = [0xffffff, 0xbfe8ff, 0x7fc8ff];

function handScale(h: HandResult): number {
  const a = h.landmarks[0], b = h.landmarks[9];
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function openish(h: HandResult): boolean {
  const f = fingersUp(h.landmarks);
  return (f[1] ? 1 : 0) + (f[2] ? 1 : 0) + (f[3] ? 1 : 0) + (f[4] ? 1 : 0) >= 3;
}

// Two-hand Kamehameha: palms together to charge an orb, thrust at the camera
// to fire a screen-engulfing energy release. Self-driven (enable toggle only).
export class EnergyBeam implements Effect {
  id = 'energy-beam';
  mode = 'toggle' as const; // unused by the driver; self-driven
  enabled = true;
  private core = new BeamCore();
  private mounted = false;
  private stage: EffectStage | null = null;
  private view = new Container();
  private orb: Sprite[] = [];
  private ps: FxParticles | null = null;
  private wasCharging = false;
  private firedFx = false;

  init(stage: EffectStage): void {
    this.stage = stage;
    this.ps = new FxParticles(stage.fx.textures.glow, stage.fx.textures.streak, 400);
    for (const tint of CORE_TINTS) {
      const s = new Sprite(stage.fx.textures.glow);
      s.anchor.set(0.5);
      s.blendMode = 'add';
      s.tint = tint;
      s.visible = false;
      this.orb.push(s);
    }
    this.view.addChild(this.ps.view, ...this.orb);
    stage.effects.addChild(this.view);
    this.mounted = true;
  }

  start(): void {}
  stop(): void {}
  isActive(): boolean {
    return this.core.state === 'charging' || this.core.state === 'firing' || (this.ps?.count ?? 0) > 0;
  }
  reset(): void {
    this.core.reset();
    this.ps?.clear();
    chargeCancel();
    this.firedFx = false;
    this.wasCharging = false;
    if (this.mounted) for (const s of this.orb) s.visible = false;
  }

  update(dt: number, ctx: RenderContext): void {
    let frame: BeamFrame | null = null;
    if (this.enabled && ctx.hands.length >= 2) {
      const [a, b] = ctx.hands;
      const sA = handScale(a), sB = handScale(b);
      const avg = (sA + sB) / 2;
      const wristDist = Math.hypot(
        a.landmarks[0].x - b.landmarks[0].x,
        a.landmarks[0].y - b.landmarks[0].y,
      );
      const togetherNow = openish(a) && openish(b) && wristDist < PALMS_DIST_FACTOR * avg;
      frame = {
        palmsTogether: togetherNow,
        avgHandScale: avg,
        midX: (a.landmarks[9].x + b.landmarks[9].x) / 2,
        midY: (a.landmarks[9].y + b.landmarks[9].y) / 2,
      };
    }

    const ev = this.core.step(this.enabled ? frame : null, dt, ctx.now);

    // sfx transitions
    const charging = this.core.state === 'charging' && this.core.charge > 0;
    if (charging && !this.wasCharging) chargeStart();
    if (charging) chargeLevel(this.core.charge);
    if (!charging && this.wasCharging && this.core.state !== 'firing') chargeCancel();
    this.wasCharging = charging;

    if (ev.fired) {
      beamFire();
      this.firedFx = false;
    }
    if (ev.fizzled && frame) {
      // sparks dribble from the hands midpoint
      for (let i = 0; i < 16; i++) {
        const a2 = Math.random() * Math.PI * 2;
        const sp = 80 + Math.random() * 160;
        this.ps?.spawn({
          x: frame.midX * ctx.width, y: frame.midY * ctx.height,
          vx: Math.cos(a2) * sp, vy: Math.sin(a2) * sp,
          ay: 250, life: 0.4 + Math.random() * 0.3,
          size: 2 + Math.random() * 3, tint: 0x9fd8ff,
        });
      }
    }

    if (this.core.state === 'charging' && frame?.palmsTogether) {
      // particles spiral INWARD toward the orb
      const ox = frame.midX * ctx.width, oy = frame.midY * ctx.height;
      const n = Math.round(1 + 5 * this.core.charge);
      for (let i = 0; i < n; i++) {
        const a3 = Math.random() * Math.PI * 2;
        const r = 90 + Math.random() * 140;
        const sx = ox + Math.cos(a3) * r, sy = oy + Math.sin(a3) * r;
        this.ps?.spawn({
          x: sx, y: sy,
          vx: (ox - sx) * 2.2 + (Math.random() - 0.5) * 40,
          vy: (oy - sy) * 2.2 + (Math.random() - 0.5) * 40,
          life: 0.45, size: 2.5 + Math.random() * 3, tint: 0xbfe8ff,
        });
      }
    }

    if (this.core.state === 'firing') {
      const t = this.core.fireT;
      const ox = this.core.originX * ctx.width, oy = this.core.originY * ctx.height;
      if (!this.firedFx && this.stage) {
        this.firedFx = true;
        this.stage.fx.transients.flash(0.85, 0.24);
        this.stage.fx.transients.ripple(ox, oy, { amplitude: 40, wavelength: 200, speed: 1200, duration: 0.8 });
        this.stage.fx.transients.zoomBlur(ox, oy, 0.4, 1.1);
        this.stage.fx.shake.kick(14);
      }
      if (t < 1.1) {
        // radial streak storm outward at the lens
        for (let i = 0; i < 14; i++) {
          const a4 = Math.random() * Math.PI * 2;
          const sp = 700 + Math.random() * 900;
          this.ps?.spawn({
            x: ox, y: oy, vx: Math.cos(a4) * sp, vy: Math.sin(a4) * sp,
            life: 0.3 + Math.random() * 0.25,
            size: 6 + Math.random() * 10, tint: CORE_TINTS[i % 3], streak: true,
          });
        }
      }
    }

    this.ps?.update(dt);
    if (this.mounted) this.redrawOrb(ctx);
  }

  private redrawOrb(ctx: RenderContext): void {
    const charging = this.core.state === 'charging';
    const firing = this.core.state === 'firing';
    for (let i = 0; i < this.orb.length; i++) {
      const s = this.orb[i];
      if (charging) {
        const c = this.core.charge;
        const pulse = 1 + 0.08 * Math.sin(ctx.now / 70);
        s.visible = c > 0.02;
        // orb sits between the palms while charging — track the live midpoint via particles' target
        s.position.set(this.lastOrbX(ctx), this.lastOrbY(ctx));
        s.scale.set(((18 + 70 * c) * (1 + i * 0.8) * pulse) / 16);
        s.alpha = (0.9 - i * 0.25) * (0.3 + 0.7 * c);
      } else if (firing) {
        const t = this.core.fireT;
        const grow = t < 0.12 ? t / 0.12 : 1;
        const decay = t > 1.1 ? Math.max(0, 1 - (t - 1.1) / 0.3) : 1;
        s.visible = true;
        s.position.set(this.core.originX * ctx.width, this.core.originY * ctx.height);
        s.scale.set(((60 + 240 * grow) * (1 + i * 0.9) * decay) / 16);
        s.alpha = (0.95 - i * 0.22) * decay;
      } else {
        s.visible = false;
      }
    }
  }

  private orbX = 0.5; private orbY = 0.5;
  private lastOrbX(ctx: RenderContext): number {
    if (ctx.hands.length >= 2) this.orbX = (ctx.hands[0].landmarks[9].x + ctx.hands[1].landmarks[9].x) / 2;
    return this.orbX * ctx.width;
  }
  private lastOrbY(ctx: RenderContext): number {
    if (ctx.hands.length >= 2) this.orbY = (ctx.hands[0].landmarks[9].y + ctx.hands[1].landmarks[9].y) / 2;
    return this.orbY * ctx.height;
  }
}
