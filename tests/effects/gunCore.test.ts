import { describe, it, expect } from 'vitest';
import { GunCore } from '../../src/effects/gunCore';

const gun = (thumbUp: boolean) => ({ isGun: true, thumbUp });

describe('GunCore', () => {
  it('fires on cock (thumb up) -> trigger (thumb drop)', () => {
    const c = new GunCore();
    expect(c.step(gun(true), 0)).toBe(false);   // cocked
    expect(c.step(gun(false), 100)).toBe(true); // bang
  });

  it('does not fire without a prior cock', () => {
    const c = new GunCore();
    expect(c.step(gun(false), 100)).toBe(false);
  });

  it('respects the 350ms cooldown but fires again after it', () => {
    const c = new GunCore();
    c.step(gun(true), 0);
    expect(c.step(gun(false), 10)).toBe(true);
    c.step(gun(true), 50);                       // re-cock immediately
    expect(c.step(gun(false), 200)).toBe(false); // still cooling down
    expect(c.step(gun(false), 400)).toBe(true);  // cooldown elapsed, still cocked
  });

  it('losing the gun pose un-cocks', () => {
    const c = new GunCore();
    c.step(gun(true), 0);
    c.step({ isGun: false, thumbUp: false }, 50);
    expect(c.step(gun(false), 100)).toBe(false);
  });

  it('a null frame (no hand) un-cocks', () => {
    const c = new GunCore();
    c.step(gun(true), 0);
    c.step(null, 50);
    expect(c.step(gun(false), 100)).toBe(false);
  });
});
