import { describe, it, expect } from 'vitest';
import { GestureEngine, type GestureBinding } from '../src/gesture/gestureEngine';
import type { HandLandmarks } from '../src/types';

const anyHand: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));

// A binding that matches whenever `flag.on` is true — lets us drive the engine
// deterministically without real landmark geometry.
function toggleBinding(effectId: string, flag: { on: boolean }): GestureBinding {
  return { effectId, test: () => flag.on };
}

describe('GestureEngine', () => {
  it('fires and marks active when a binding matches', () => {
    const flag = { on: true };
    const e = new GestureEngine([toggleBinding('fx', flag)], { cooldownMs: 800 });
    const r = e.update(anyHand, 0);
    expect(r.fired).toContain('fx');
    expect(r.active.has('fx')).toBe(true);
  });

  it('does not fire when the binding does not match', () => {
    const flag = { on: false };
    const e = new GestureEngine([toggleBinding('fx', flag)], { cooldownMs: 800 });
    const r = e.update(anyHand, 0);
    expect(r.fired).toHaveLength(0);
    expect(r.active.has('fx')).toBe(false);
  });

  it('respects cooldown but keeps active state', () => {
    const flag = { on: true };
    const e = new GestureEngine([toggleBinding('fx', flag)], { cooldownMs: 800 });
    expect(e.update(anyHand, 0).fired).toContain('fx');
    const mid = e.update(anyHand, 400);
    expect(mid.fired).not.toContain('fx');
    expect(mid.active.has('fx')).toBe(true);
    expect(e.update(anyHand, 900).fired).toContain('fx');
  });

  it('returns nothing when no hand is present', () => {
    const e = new GestureEngine([toggleBinding('fx', { on: true })], {});
    const r = e.update(null, 0);
    expect(r.fired).toHaveLength(0);
    expect(r.active.size).toBe(0);
  });

  it('setBindings swaps the active bindings', () => {
    const e = new GestureEngine([], { cooldownMs: 800 });
    expect(e.update(anyHand, 0).active.size).toBe(0);
    e.setBindings([toggleBinding('fx', { on: true })]);
    expect(e.update(anyHand, 1000).active.has('fx')).toBe(true);
  });

  it('exclusive mode lets only the first matching binding win', () => {
    const e = new GestureEngine(
      [toggleBinding('a', { on: true }), toggleBinding('b', { on: true })],
      { cooldownMs: 800, exclusive: true },
    );
    const r = e.update(anyHand, 0);
    expect(r.fired).toEqual(['a']);
    expect([...r.active]).toEqual(['a']);
  });

  it('non-exclusive mode fires all matching bindings', () => {
    const e = new GestureEngine(
      [toggleBinding('a', { on: true }), toggleBinding('b', { on: true })],
      { cooldownMs: 800 },
    );
    const r = e.update(anyHand, 0);
    expect(r.fired.sort()).toEqual(['a', 'b']);
  });
});
