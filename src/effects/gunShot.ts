import { ParticleSystem } from './particleSystem';
import { fingersUp } from '../gesture/handGestures';
import type { Effect, HandLandmarks, RenderContext } from '../types';

const COOLDOWN_MS = 350;     // min time between shots
const FLASH_SECONDS = 0.09;  // muzzle flash duration

// Synthesize a short gunshot with WebAudio (no asset needed).
let audioCtx: AudioContext | null = null;
function playBang(): void {
  const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) return;
  if (!audioCtx) audioCtx = new AC();
  const ctx = audioCtx;
  if (ctx.state === 'suspended') ctx.resume();
  const now = ctx.currentTime;

  // noise burst (the "crack")
  const dur = 0.18;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 2);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.9, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, now);
  lp.frequency.exponentialRampToValueAtTime(400, now + dur);
  noise.connect(lp).connect(noiseGain).connect(ctx.destination);
  noise.start(now);

  // low thump
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(140, now);
  osc.frequency.exponentialRampToValueAtTime(50, now + 0.12);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(0.6, now);
  oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
  osc.connect(oscGain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.16);
}

// Finger-gun: index out, others curled. Thumb up = hammer cocked; dropping the
// thumb fires a shot (muzzle flash + sparks + bang) from the index fingertip.
export class GunShot implements Effect {
  id = 'gun-shot';
  mode = 'oneshot' as const;
  enabled = true;
  private ps = new ParticleSystem();
  private cocked = false;
  private lastShot = -Infinity;
  private flash = -1; // seconds remaining in muzzle flash
  private fx = 0; private fy = 0; // flash position
  private dirx = 1; private diry = 0;

  start(): void {}
  stop(): void {}
  isActive(): boolean { return this.flash > 0 || this.ps.count > 0; }
  reset(): void { this.flash = -1; this.ps.clear(); this.cocked = false; }

  update(dt: number, ctx: RenderContext): void {
    if (this.flash > 0) this.flash -= dt;
    this.ps.update(dt);

    if (this.enabled && ctx.hand) {
      const lm = ctx.hand.landmarks;
      const f = fingersUp(lm);
      const isGun = f[1] && !f[2] && !f[3] && !f[4]; // index out, rest curled
      if (isGun && f[0]) this.cocked = true;          // thumb up -> hammer cocked
      if (isGun && !f[0] && this.cocked && ctx.now - this.lastShot >= COOLDOWN_MS) {
        this.shoot(lm, ctx);
        this.lastShot = ctx.now;
        this.cocked = false;
      }
      if (!isGun) this.cocked = false;
    } else {
      this.cocked = false;
    }
  }

  private shoot(lm: HandLandmarks, ctx: RenderContext): void {
    const tip = lm[8], base = lm[5];
    this.fx = tip.x * ctx.width;
    this.fy = tip.y * ctx.height;
    let dx = (tip.x - base.x) * ctx.width, dy = (tip.y - base.y) * ctx.height;
    const len = Math.hypot(dx, dy) || 1;
    this.dirx = dx / len; this.diry = dy / len;
    this.flash = FLASH_SECONDS;

    const perp = { x: -this.diry, y: this.dirx };
    for (let i = 0; i < 24; i++) {
      const spread = (Math.random() - 0.5) * 0.6;
      const sp = 250 + Math.random() * 550;
      const vx = (this.dirx + perp.x * spread) * sp;
      const vy = (this.diry + perp.y * spread) * sp;
      const life = 0.18 + Math.random() * 0.22;
      this.ps.spawn({ x: this.fx, y: this.fy, vx, vy, life, maxLife: life, size: 1.5 + Math.random() * 3, color: Math.random() < 0.5 ? '#fff3b0' : '#ffb142' });
    }
    playBang();
  }

  render(g: CanvasRenderingContext2D): void {
    g.save();
    g.globalCompositeOperation = 'lighter';

    if (this.flash > 0) {
      const a = this.flash / FLASH_SECONDS;
      // bright muzzle flash blossom at the fingertip, oriented down the barrel
      const r = 26 + (1 - a) * 18;
      const cx = this.fx + this.dirx * 10, cy = this.fy + this.diry * 10;
      const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
      grad.addColorStop(0, `rgba(255,255,240,${a})`);
      grad.addColorStop(0.4, `rgba(255,200,90,${a * 0.8})`);
      grad.addColorStop(1, 'rgba(255,140,40,0)');
      g.fillStyle = grad;
      g.beginPath();
      g.arc(cx, cy, r, 0, Math.PI * 2);
      g.fill();
    }

    this.ps.render(g);
    g.restore();
  }
}
