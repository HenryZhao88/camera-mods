import { describe, it, expect } from 'vitest';
import { ScreenShake } from '../../src/fx/shake';

describe('ScreenShake', () => {
  it('starts at zero with zero offset', () => {
    const s = new ScreenShake();
    expect(s.magnitude).toBe(0);
    expect(s.offset()).toEqual({ x: 0, y: 0 });
  });

  it('kick raises magnitude and clamps at 40', () => {
    const s = new ScreenShake();
    s.kick(10);
    expect(s.magnitude).toBe(10);
    s.kick(100);
    expect(s.magnitude).toBe(40);
  });

  it('decays exponentially and floors to exactly 0', () => {
    const s = new ScreenShake();
    s.kick(10);
    s.update(0.1);
    expect(s.magnitude).toBeLessThan(10);
    expect(s.magnitude).toBeGreaterThan(0);
    for (let i = 0; i < 100; i++) s.update(0.1);
    expect(s.magnitude).toBe(0);
  });

  it('offset stays within the current magnitude', () => {
    const s = new ScreenShake();
    s.kick(8);
    const o = s.offset(() => 0.99);
    expect(Math.hypot(o.x, o.y)).toBeLessThanOrEqual(8 + 1e-9);
  });
});
