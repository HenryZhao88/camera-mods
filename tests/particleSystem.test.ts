import { describe, it, expect } from 'vitest';
import { ParticleSystem } from '../src/effects/particleSystem';

describe('ParticleSystem', () => {
  it('tracks spawned particles', () => {
    const ps = new ParticleSystem();
    ps.spawn({ x: 0, y: 0, vx: 0, vy: 0, life: 1, maxLife: 1, size: 2, color: '#fff' });
    expect(ps.count).toBe(1);
  });

  it('moves particles and expires them', () => {
    const ps = new ParticleSystem();
    ps.spawn({ x: 0, y: 0, vx: 10, vy: 0, life: 1, maxLife: 1, size: 2, color: '#fff' });
    ps.update(0.5);
    expect(ps.particles[0].x).toBeCloseTo(5, 6);
    ps.update(0.6); // total 1.1 > life
    expect(ps.count).toBe(0);
  });
});
