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

// Band-passed noise chirp with a fast pitch drop — the classic web-shooter thwip.
export function thwip(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = 0.14;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 4;
  bp.frequency.setValueAtTime(2600, now);
  bp.frequency.exponentialRampToValueAtTime(500, now + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.5, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(bp).connect(g).connect(ctx.destination);
  noise.start(now);
}

// Domain slam: sub-bass swell + noise burst through a falling lowpass,
// preceded by a short rising "suck" of bandpassed noise.
export function domainSlam(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;

  // reverse suck (rising bandpass noise into the hit)
  const suckDur = 0.35;
  const suck = ctx.createBuffer(1, Math.floor(ctx.sampleRate * suckDur), ctx.sampleRate);
  const sd = suck.getChannelData(0);
  for (let i = 0; i < sd.length; i++) sd[i] = (Math.random() * 2 - 1) * (i / sd.length);
  const suckSrc = ctx.createBufferSource();
  suckSrc.buffer = suck;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 2;
  bp.frequency.setValueAtTime(300, now);
  bp.frequency.exponentialRampToValueAtTime(2400, now + suckDur);
  const sg = ctx.createGain();
  sg.gain.setValueAtTime(0.0001, now);
  sg.gain.exponentialRampToValueAtTime(0.35, now + suckDur);
  suckSrc.connect(bp).connect(sg).connect(ctx.destination);
  suckSrc.start(now);

  // the hit, right after the suck
  const hit = now + suckDur;
  const dur = 0.9;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 1.8);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, hit);
  lp.frequency.exponentialRampToValueAtTime(180, hit + dur);
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.85, hit);
  ng.gain.exponentialRampToValueAtTime(0.001, hit + dur);
  noise.connect(lp).connect(ng).connect(ctx.destination);
  noise.start(hit);

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(40, hit);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.0001, hit);
  og.gain.exponentialRampToValueAtTime(0.6, hit + 0.08);
  og.gain.exponentialRampToValueAtTime(0.001, hit + 1.0);
  osc.connect(og).connect(ctx.destination);
  osc.start(hit);
  osc.stop(hit + 1.05);
}

// Low domain drone while active: two detuned triangles through a lowpass.
let rumbleOscA: OscillatorNode | null = null;
let rumbleOscB: OscillatorNode | null = null;
let rumbleGain: GainNode | null = null;

export function domainRumbleStart(): void {
  const ctx = ac();
  if (!ctx || rumbleOscA) return;
  const now = ctx.currentTime;
  rumbleOscA = ctx.createOscillator();
  rumbleOscA.type = 'triangle';
  rumbleOscA.frequency.value = 50;
  rumbleOscB = ctx.createOscillator();
  rumbleOscB.type = 'triangle';
  rumbleOscB.frequency.value = 61;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  rumbleGain = ctx.createGain();
  rumbleGain.gain.setValueAtTime(0.0001, now);
  rumbleGain.gain.exponentialRampToValueAtTime(0.06, now + 0.8);
  rumbleOscA.connect(lp);
  rumbleOscB.connect(lp);
  lp.connect(rumbleGain).connect(ctx.destination);
  rumbleOscA.start(now);
  rumbleOscB.start(now);
}

export function domainRumbleStop(): void {
  const ctx = audioCtxOf();
  if (ctx && rumbleGain && rumbleOscA && rumbleOscB) {
    const now = ctx.currentTime;
    rumbleGain.gain.cancelScheduledValues(now);
    rumbleGain.gain.setValueAtTime(rumbleGain.gain.value, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
    rumbleOscA.stop(now + 0.45);
    rumbleOscB.stop(now + 0.45);
  }
  rumbleOscA = null;
  rumbleOscB = null;
  rumbleGain = null;
}

// Bright slash tick; big slashes are lower and longer.
export function slashTick(big: boolean): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;
  const dur = big ? 0.09 : 0.035;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.Q.value = 6;
  bp.frequency.value = big ? 2500 : 5500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(big ? 0.4 : 0.22, now);
  g.gain.exponentialRampToValueAtTime(0.001, now + dur);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(now);
}

// Collapse: descending sine + air release.
export function domainCollapse(): void {
  const ctx = ac();
  if (!ctx) return;
  const now = ctx.currentTime;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(35, now + 0.6);
  const og = ctx.createGain();
  og.gain.setValueAtTime(0.4, now);
  og.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
  osc.connect(og).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + 0.7);

  const dur = 0.5;
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length) * 0.5;
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 1200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.25, now);
  ng.gain.exponentialRampToValueAtTime(0.001, now + dur);
  noise.connect(hp).connect(ng).connect(ctx.destination);
  noise.start(now);
}

function audioCtxOf(): AudioContext | null { return audioCtx; }
