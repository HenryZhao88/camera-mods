import { describe, it, expect } from 'vitest';
import { BeamCore, type BeamFrame } from '../../src/effects/beamCore';

// Helper: a frame where both palms are together at given scale.
function together(scale = 0.2): BeamFrame {
  return { palmsTogether: true, avgHandScale: scale, midX: 0.5, midY: 0.5 };
}
const APART: BeamFrame = { palmsTogether: false, avgHandScale: 0.2, midX: 0.5, midY: 0.5 };

function charge(core: BeamCore, seconds: number, t0 = 0, scale = 0.2): number {
  const frames = Math.round(seconds * 60);
  let t = t0;
  for (let i = 0; i < frames; i++) { t += 1000 / 60; core.step(together(scale), 1 / 60, t); }
  return t;
}

describe('BeamCore', () => {
  it('starts idle with zero charge', () => {
    const c = new BeamCore();
    expect(c.state).toBe('idle');
    expect(c.charge).toBe(0);
  });

  it('charges toward 1 over ~1.2s while palms are together', () => {
    const c = new BeamCore();
    charge(c, 0.6);
    expect(c.state).toBe('charging');
    expect(c.charge).toBeGreaterThan(0.4);
    expect(c.charge).toBeLessThan(0.6);
    charge(c, 0.8, 600);
    expect(c.charge).toBe(1);
  });

  it('drains at 2x speed when the pose breaks, returning to idle at 0', () => {
    const c = new BeamCore();
    let t = charge(c, 0.6);
    for (let i = 0; i < 36; i++) { t += 1000 / 60; c.step(APART, 1 / 60, t); } // 0.6s drain
    expect(c.charge).toBe(0);
    expect(c.state).toBe('idle');
  });

  it('fires on a >=18% hand-scale thrust within 180ms once charge >= 0.35', () => {
    const c = new BeamCore();
    let t = charge(c, 0.7); // charge ~0.58
    t += 1000 / 60;
    c.step(together(0.24), 1 / 60, t); // 20% scale jump inside the window
    expect(c.state).toBe('firing');
  });

  it('does not fire on a thrust below 0.35 charge', () => {
    const c = new BeamCore();
    let t = charge(c, 0.3); // charge ~0.25
    t += 1000 / 60;
    c.step(together(0.24), 1 / 60, t);
    expect(c.state).toBe('charging');
  });

  it('fires at full charge with a smaller (>=8%) thrust', () => {
    const c = new BeamCore();
    let t = charge(c, 1.4); // charge = 1
    t += 1000 / 60;
    c.step(together(0.22), 1 / 60, t); // 10% jump
    expect(c.state).toBe('firing');
  });

  it('firing runs 1.4s then cools down 0.8s then idles, even hands-free', () => {
    const c = new BeamCore();
    let t = charge(c, 0.7);
    t += 1000 / 60;
    c.step(together(0.24), 1 / 60, t);
    expect(c.state).toBe('firing');
    for (let i = 0; i < 90; i++) { t += 1000 / 60; c.step(null, 1 / 60, t); } // 1.5s
    expect(c.state).toBe('cooldown');
    for (let i = 0; i < 54; i++) { t += 1000 / 60; c.step(null, 1 / 60, t); } // +0.9s
    expect(c.state).toBe('idle');
  });

  it('losing hands mid-charge drains', () => {
    const c = new BeamCore();
    let t = charge(c, 0.7);
    for (let i = 0; i < 80; i++) { t += 1000 / 60; c.step(null, 1 / 60, t); }
    expect(c.charge).toBe(0);
    expect(c.state).toBe('idle');
  });
});
