import { describe, it, expect } from 'vitest';
import { stepParticle, particleAlpha, type ParticleState } from '../../src/fx/particleCore';

function make(over: Partial<ParticleState> = {}): ParticleState {
  return {
    x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 0,
    life: 1, maxLife: 1, size: 10, grow: 0, spin: 0, rotation: 0,
    tint: 0xffffff, alpha: 1, streak: false, additive: true,
    ...over,
  };
}

describe('stepParticle', () => {
  it('integrates velocity into position', () => {
    const p = make({ vx: 10, vy: -20 });
    stepParticle(p, 0.5);
    expect(p.x).toBeCloseTo(5);
    expect(p.y).toBeCloseTo(-10);
  });

  it('applies acceleration (gravity) to velocity', () => {
    const p = make({ ay: 100 });
    stepParticle(p, 1);
    expect(p.vy).toBeCloseTo(100);
  });

  it('applies drag as per-second damping', () => {
    const p = make({ vx: 100, drag: 0.5 });
    stepParticle(p, 1);
    expect(p.vx).toBeCloseTo(50);
  });

  it('grows size by grow-rate per second and spins', () => {
    const p = make({ grow: 1, spin: Math.PI });
    stepParticle(p, 1);
    expect(p.size).toBeCloseTo(20);
    expect(p.rotation).toBeCloseTo(Math.PI);
  });

  it('returns false once life is exhausted', () => {
    const p = make({ life: 0.1 });
    expect(stepParticle(p, 0.05)).toBe(true);
    expect(stepParticle(p, 0.06)).toBe(false);
  });

  it('clamps size at 0 for large negative grow', () => {
    const p = make({ size: 10, grow: -100 });
    stepParticle(p, 1);
    expect(p.size).toBe(0);
  });

  it('drag never reverses velocity even when drag*dt exceeds 1', () => {
    const p = make({ vx: 100, drag: 2 });
    stepParticle(p, 1);
    expect(p.vx).toBe(0);
  });
});

describe('particleAlpha', () => {
  it('fades with remaining life scaled by base alpha', () => {
    const p = make({ life: 0.25, maxLife: 1, alpha: 0.8 });
    expect(particleAlpha(p)).toBeCloseTo(0.2);
  });

  it('never goes negative', () => {
    const p = make({ life: -0.1 });
    expect(particleAlpha(p)).toBe(0);
  });

  it('returns 0 (not NaN) when maxLife is 0', () => {
    const p = make({ life: 0, maxLife: 0 });
    expect(particleAlpha(p)).toBe(0);
  });
});
