import { describe, it, expect } from 'vitest';
import { normalizeLandmarks } from '../src/gesture/normalize';
import type { HandLandmarks } from '../src/types';

function shape(): HandLandmarks {
  return Array.from({ length: 21 }, (_, i) => ({ x: i * 0.01, y: (i % 5) * 0.02, z: 0 }));
}
function close(a: HandLandmarks, b: HandLandmarks, eps = 1e-9) {
  return a.every((p, i) => Math.abs(p.x - b[i].x) < eps && Math.abs(p.y - b[i].y) < eps);
}

describe('normalizeLandmarks', () => {
  it('is translation invariant', () => {
    const base = shape();
    const shifted = base.map(p => ({ x: p.x + 5, y: p.y - 3, z: 0 }));
    expect(close(normalizeLandmarks(base), normalizeLandmarks(shifted))).toBe(true);
  });

  it('is scale invariant', () => {
    const base = shape();
    const scaled = base.map(p => ({ x: p.x * 4, y: p.y * 4, z: 0 }));
    expect(close(normalizeLandmarks(base), normalizeLandmarks(scaled))).toBe(true);
  });

  it('produces points centered near origin', () => {
    const out = normalizeLandmarks(shape());
    const cx = out.reduce((s, p) => s + p.x, 0) / out.length;
    const cy = out.reduce((s, p) => s + p.y, 0) / out.length;
    expect(Math.abs(cx)).toBeLessThan(1e-9);
    expect(Math.abs(cy)).toBeLessThan(1e-9);
  });
});
