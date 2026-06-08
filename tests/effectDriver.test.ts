import { describe, it, expect } from 'vitest';
import { EffectDriver, type DriverEffect } from '../src/effects/effectDriver';

function fake(id: string, mode: DriverEffect['mode']) {
  const calls = { start: 0, stop: 0 };
  const effect: DriverEffect = {
    id, mode,
    start: () => { calls.start++; },
    stop: () => { calls.stop++; },
  };
  return { effect, calls };
}

describe('EffectDriver', () => {
  it('oneshot effects start only on fired', () => {
    const a = fake('boom', 'oneshot');
    const d = new EffectDriver([a.effect]);
    d.apply([], new Set());
    expect(a.calls.start).toBe(0);
    d.apply(['boom'], new Set(['boom']));
    expect(a.calls.start).toBe(1);
  });

  it('hold effects start on enter and stop on leave, once each', () => {
    const a = fake('hold', 'hold');
    const d = new EffectDriver([a.effect]);
    d.apply([], new Set(['hold'])); // enter
    d.apply([], new Set(['hold'])); // still held
    expect(a.calls.start).toBe(1);
    expect(a.calls.stop).toBe(0);
    d.apply([], new Set());          // leave
    expect(a.calls.stop).toBe(1);
  });

  it('toggle effects start on each fired', () => {
    const a = fake('toggle', 'toggle');
    const d = new EffectDriver([a.effect]);
    d.apply(['toggle'], new Set(['toggle']));
    d.apply([], new Set(['toggle']));        // held, no new fire
    d.apply(['toggle'], new Set(['toggle'])); // fired again (after cooldown)
    expect(a.calls.start).toBe(2);
  });
});
