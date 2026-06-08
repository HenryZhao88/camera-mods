import { describe, it, expect } from 'vitest';
import { GestureEngine } from '../src/gesture/gestureEngine';
import { normalizeLandmarks } from '../src/gesture/normalize';
import type { GestureTemplate, HandLandmarks } from '../src/types';

const poseA: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.01, y: 0, z: 0 }));
const poseB: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: 0, y: i * 0.01, z: 0 }));

const template: GestureTemplate = {
  effectId: 'fx', landmarks: normalizeLandmarks(poseA), handedness: 'Right', createdAt: 'now',
};

describe('GestureEngine', () => {
  it('fires when a matching pose is seen', () => {
    const e = new GestureEngine([template], { cooldownMs: 800, defaultThreshold: 0.6 });
    const r = e.update(poseA, 0);
    expect(r.fired).toContain('fx');
    expect(r.active.has('fx')).toBe(true);
  });

  it('does not fire for a different pose', () => {
    const e = new GestureEngine([template], { cooldownMs: 800, defaultThreshold: 0.6 });
    const r = e.update(poseB, 0);
    expect(r.fired).not.toContain('fx');
    expect(r.active.has('fx')).toBe(false);
  });

  it('respects cooldown but keeps active state', () => {
    const e = new GestureEngine([template], { cooldownMs: 800, defaultThreshold: 0.6 });
    expect(e.update(poseA, 0).fired).toContain('fx');
    const mid = e.update(poseA, 400);
    expect(mid.fired).not.toContain('fx');
    expect(mid.active.has('fx')).toBe(true);
    expect(e.update(poseA, 900).fired).toContain('fx');
  });

  it('returns nothing when no hand present', () => {
    const e = new GestureEngine([template], {});
    const r = e.update(null, 0);
    expect(r.fired).toHaveLength(0);
    expect(r.active.size).toBe(0);
  });
});
