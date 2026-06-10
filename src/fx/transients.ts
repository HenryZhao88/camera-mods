import { Container, Sprite, Texture } from 'pixi.js';
import { ShockwaveFilter, ZoomBlurFilter } from 'pixi-filters';
import { addFilter, removeFilter } from './filterList';

const MAX_RIPPLES = 3;

interface Ripple { f: ShockwaveFilter; t: number; dur: number; }
interface Blur { f: ZoomBlurFilter; t: number; dur: number; strength: number; }
interface Flash { s: Sprite; t: number; dur: number; alpha: number; }

export interface RippleOpts { amplitude?: number; wavelength?: number; speed?: number; duration?: number; }

// One-shot cinematic moments: real displacement ripples, zoom blur, lens flashes.
// Owned by the compositor; effects call these via EffectStage.fx.transients.
export class TransientFx {
  private ripples: Ripple[] = [];
  private blurs: Blur[] = [];
  private flashes: Flash[] = [];
  private w = 1280; private h = 720;

  constructor(private world: Container, private screen: Container) {}

  setSize(w: number, h: number): void { this.w = w; this.h = h; }

  ripple(x: number, y: number, o: RippleOpts = {}): void {
    if (this.ripples.length >= MAX_RIPPLES) {
      const old = this.ripples.shift()!;
      removeFilter(this.world, old.f);
      old.f.destroy();
    }
    const f = new ShockwaveFilter({
      center: { x, y },
      amplitude: o.amplitude ?? 30,
      wavelength: o.wavelength ?? 160,
      speed: o.speed ?? 900,
      brightness: 1.08,
      radius: -1,
    });
    f.time = 0;
    addFilter(this.world, f);
    this.ripples.push({ f, t: 0, dur: o.duration ?? 0.7 });
  }

  zoomBlur(x: number, y: number, strength = 0.25, duration = 0.5): void {
    const f = new ZoomBlurFilter({ strength, center: { x, y }, innerRadius: 60 });
    addFilter(this.world, f);
    this.blurs.push({ f, t: 0, dur: duration, strength });
  }

  flash(alpha = 0.2, duration = 0.15, tint = 0xffffff): void {
    const s = new Sprite(Texture.WHITE);
    s.tint = tint;
    s.alpha = alpha;
    s.blendMode = 'add';
    this.screen.addChild(s);
    this.flashes.push({ s, t: 0, dur: duration, alpha });
  }

  update(dt: number): void {
    this.ripples = this.ripples.filter(r => {
      r.t += dt;
      r.f.time = r.t;
      if (r.t >= r.dur) { removeFilter(this.world, r.f); r.f.destroy(); return false; }
      return true;
    });
    this.blurs = this.blurs.filter(b => {
      b.t += dt;
      const k = 1 - b.t / b.dur;
      b.f.strength = b.strength * k * k;
      if (b.t >= b.dur) { removeFilter(this.world, b.f); b.f.destroy(); return false; }
      return true;
    });
    this.flashes = this.flashes.filter(f => {
      f.t += dt;
      f.s.width = this.w; f.s.height = this.h;
      f.s.alpha = f.alpha * Math.max(0, 1 - f.t / f.dur);
      if (f.t >= f.dur) { this.screen.removeChild(f.s); f.s.destroy(); return false; }
      return true;
    });
  }

  clear(): void {
    for (const r of this.ripples) { removeFilter(this.world, r.f); r.f.destroy(); }
    for (const b of this.blurs) { removeFilter(this.world, b.f); b.f.destroy(); }
    for (const f of this.flashes) { this.screen.removeChild(f.s); f.s.destroy(); }
    this.ripples = []; this.blurs = []; this.flashes = [];
  }
}
