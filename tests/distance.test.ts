import { describe, it, expect } from 'vitest';
import { landmarkDistance } from '../src/gesture/distance';
import type { HandLandmarks } from '../src/types';

const a: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: i, y: 0, z: 0 }));

describe('landmarkDistance', () => {
  it('is zero for identical poses', () => {
    expect(landmarkDistance(a, a)).toBeCloseTo(0, 9);
  });

  it('grows as poses diverge', () => {
    const near = a.map(p => ({ x: p.x + 0.1, y: 0, z: 0 }));
    const far = a.map(p => ({ x: p.x + 1.0, y: 0, z: 0 }));
    expect(landmarkDistance(a, near)).toBeLessThan(landmarkDistance(a, far));
  });

  it('throws on length mismatch', () => {
    expect(() => landmarkDistance(a, a.slice(0, 5))).toThrow();
  });
});
