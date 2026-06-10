// All sounds are synthesized with WebAudio — zero asset files.
// Guarded so jsdom (no AudioContext) and pre-gesture autoplay policies are safe.

let audioCtx: AudioContext | null = null;

export function ac(): AudioContext | null {
  const AC = (window.AudioContext
    || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!AC) return null;
  if (!audioCtx) audioCtx = new AC();
  if (audioCtx.state === 'suspended') void audioCtx.resume();
  return audioCtx;
}

// Short gunshot: noise crack through a falling lowpass + low sine thump.
export function playBang(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;

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

// Soft sine swell for shield raise/lower; a very quiet hum loop while held.
let humOsc: OscillatorNode | null = null;
let humGain: GainNode | null = null;

export function shieldUp(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(180, now);
  osc.frequency.exponentialRampToValueAtTime(420, now + 0.22);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.25, now + 0.08);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
  osc.connect(g).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.32);

  if (!humOsc) {
    humOsc = ctx.createOscillator();
    humOsc.type = 'triangle';
    humOsc.frequency.value = 96;
    humGain = ctx.createGain();
    humGain.gain.setValueAtTime(0.0001, now);
    humGain.gain.exponentialRampToValueAtTime(0.05, now + 0.4);
    humOsc.connect(humGain).connect(ctx.destination);
    humOsc.start(now);
  }
}

export function shieldDown(): void {
  const ctx = ac();
  if (ctx) {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(380, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.18);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(g).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.22);
  }
  stopShieldHum();
}

export function stopShieldHum(): void {
  if (humOsc && humGain && audioCtxOf()) {
    const now = audioCtxOf()!.currentTime;
    humGain.gain.cancelScheduledValues(now);
    humGain.gain.setValueAtTime(humGain.gain.value, now);
    humGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
    humOsc.stop(now + 0.2);
  }
  humOsc = null;
  humGain = null;
}

// Rising filtered saw while charging; cut off on cancel; big boom on fire.
let chargeOsc: OscillatorNode | null = null;
let chargeGain: GainNode | null = null;
let chargeFilter: BiquadFilterNode | null = null;

export function chargeStart(): void {
  const ctx = ac();
  if (!ctx || chargeOsc) return;
  chargeOsc = ctx.createOscillator();
  chargeOsc.type = 'sawtooth';
  chargeOsc.frequency.value = 70;
  chargeFilter = ctx.createBiquadFilter();
  chargeFilter.type = 'lowpass';
  chargeFilter.frequency.value = 300;
  chargeGain = ctx.createGain();
  chargeGain.gain.value = 0.0001;
  chargeOsc.connect(chargeFilter).connect(chargeGain).connect(ctx.destination);
  chargeOsc.start();
}

export function chargeLevel(level: number): void {
  const ctx = ac();
  if (!ctx || !chargeOsc || !chargeGain || !chargeFilter) return;
  const now = ctx.currentTime;
  chargeOsc.frequency.setTargetAtTime(70 + 240 * level, now, 0.05);
  chargeFilter.frequency.setTargetAtTime(300 + 2200 * level * level, now, 0.05);
  const trem = 1 + 0.3 * Math.sin(now * (4 + 14 * level) * Math.PI * 2);
  chargeGain.gain.setTargetAtTime(0.10 * level * trem, now, 0.05);
}

export function chargeCancel(): void {
  const ctx = ac();
  if (ctx && chargeGain && chargeOsc) {
    const now = ctx.currentTime;
    chargeGain.gain.cancelScheduledValues(now);
    chargeGain.gain.setTargetAtTime(0.0001, now, 0.06);
    chargeOsc.stop(now + 0.3);
  }
  chargeOsc = null; chargeGain = null; chargeFilter = null;
}

// The release: noise blast + 45Hz swell + ~1s rumble tail.
export function beamFire(): void {
  chargeCancel();
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;

  const dur = 1.1;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.6);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(4000, now);
  lp.frequency.exponentialRampToValueAtTime(250, now + dur);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.8, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(lp).connect(ng).connect(ctx.destination);
  noise.start(now);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(45, now);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, now);
  og.gain.exponentialRampToValueAtTime(0.55, now + 0.1);
  og.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
  osc.connect(og).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 1.25);
}

function audioCtxOf(): AudioContext | null { return audioCtx; }
