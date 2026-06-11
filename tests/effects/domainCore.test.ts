import { describe, it, expect } from 'vitest';
import { DomainCore } from '../../src/effects/domainCore';

// Advance the core by `seconds` worth of 60fps frames with a fixed sign state.
function run(c: DomainCore, signHeld: boolean, seconds: number) {
  const frames = Math.round(seconds * 60);
  const events = { slammed: false };
  for (let i = 0; i < frames; i++) {
    const ev = c.step(signHeld, 1 / 60);
    if (ev.slammed) events.slammed = true;
  }
  return events;
}

describe('DomainCore', () => {
  it('starts idle with zero arm and zero progress', () => {
    const c = new DomainCore();
    expect(c.state).toBe('idle');
    expect(c.arm).toBe(0);
    expect(c.progress).toBe(0);
  });

  it('arms over 0.6s of held sign, then casts', () => {
    const c = new DomainCore();
    run(c, true, 0.3);
    expect(c.state).toBe('arming');
    expect(c.arm).toBeCloseTo(0.5, 1);
    run(c, true, 0.35);
    expect(c.state).toBe('casting');
  });

  it('arm decays at 2x and returns to idle when the sign breaks', () => {
    const c = new DomainCore();
    run(c, true, 0.3); // arm ~0.5
    run(c, false, 0.1); // decay 2x: 0.5 - (0.1/0.6)*2 ≈ 0.17 — still arming
    expect(c.state).toBe('arming');
    run(c, false, 0.1); // continue: 0.17 - 0.33 → clamps to 0 → idle
    expect(c.arm).toBe(0);
    expect(c.state).toBe('idle');
  });

  it('fires slammed exactly once, at 0.5s into casting', () => {
    const c = new DomainCore();
    run(c, true, 0.7); // armed -> casting
    const before = run(c, false, 0.4); // 0.4s into cast (sign released — ignored)
    expect(before.slammed).toBe(false);
    const at = run(c, false, 0.2); // crosses 0.5
    expect(at.slammed).toBe(true);
    const after = run(c, false, 0.2);
    expect(after.slammed).toBe(false);
  });

  it('casting completes into active even with the sign released', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5); // > CAST_S
    expect(c.state).toBe('active');
    expect(c.progress).toBe(1);
  });

  it('stays active indefinitely until collapse()', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5);
    run(c, false, 30);
    expect(c.state).toBe('active');
  });

  it('collapse() during active transitions synchronously to collapsing, then winds down to idle', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5);
    c.collapse();
    expect(c.state).toBe('collapsing');
    const ev = run(c, false, 0.9); // > COLLAPSE_S
    expect(ev.slammed).toBe(false);
    expect(c.state).toBe('cooldown');
    run(c, false, 1.1); // > COOLDOWN_S
    expect(c.state).toBe('idle');
  });

  it('collapse() outside active is a no-op', () => {
    const c = new DomainCore();
    c.collapse();
    expect(c.state).toBe('idle');
    run(c, true, 0.7); // casting
    c.collapse();
    expect(c.state).toBe('casting');
  });

  it('progress maps the bleed: 0 until slam, ramps to 1 by cast end, reverses on collapse', () => {
    const c = new DomainCore();
    run(c, true, 0.7);   // casting begins; ~0.1s already elapsed in casting
    run(c, false, 0.35); // total t≈0.45 — before slam (0.5), progress=0
    expect(c.progress).toBe(0);
    run(c, false, 0.5);  // total t≈0.95 → (0.95-0.5)/(1.4-0.5) ≈ 0.5
    expect(c.progress).toBeCloseTo(0.5, 1);
    run(c, false, 0.5);  // active
    expect(c.progress).toBe(1);
    c.collapse();
    run(c, false, 0.4);  // halfway through 0.8s collapse
    expect(c.progress).toBeCloseTo(0.5, 1);
  });

  it('reset() returns to idle from any state', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5); // active
    c.reset();
    expect(c.state).toBe('idle');
    expect(c.progress).toBe(0);
    expect(c.arm).toBe(0);
  });

  it('no re-cast during cooldown even if the sign is held', () => {
    const c = new DomainCore();
    run(c, true, 0.7);
    run(c, false, 1.5);
    c.collapse();
    run(c, true, 0.9); // collapsing finishes into cooldown with sign held
    expect(c.state).toBe('cooldown');
    run(c, true, 0.5); // still inside 1.0s cooldown
    expect(c.state).toBe('cooldown');
    run(c, true, 0.6); // cooldown over -> sign held -> arming
    expect(c.state).toBe('arming');
  });
});
