import { describe, it, expect } from 'vitest';
import { genInkBlot } from '../../src/fx/inkBlot';

describe('genInkBlot', () => {
  it('produces 24-32 outline points', () => {
    for (const seed of [0.1, 0.5, 0.9]) {
      const pts = genInkBlot(seed);
      expect(pts.length).toBeGreaterThanOrEqual(24);
      expect(pts.length).toBeLessThanOrEqual(32);
    }
  });

  it('keeps every radius within the jitter envelope [0.45, 1.0]', () => {
    const pts = genInkBlot(0.42);
    for (const p of pts) {
      const r = Math.hypot(p.x, p.y);
      expect(r).toBeGreaterThanOrEqual(0.45);
      expect(r).toBeLessThanOrEqual(1.0);
    }
  });

  it('is deterministic per seed and varies across seeds', () => {
    expect(genInkBlot(0.7)).toEqual(genInkBlot(0.7));
    expect(genInkBlot(0.7)).not.toEqual(genInkBlot(0.71));
  });
});
