import { describe, it, expect } from 'vitest';
import { genWeb } from '../../src/fx/webGeometry';

describe('genWeb', () => {
  it('produces 10-12 spokes and 6-7 rings', () => {
    for (let seed = 0; seed < 5; seed++) {
      const w = genWeb(0.5 + seed * 0.1);
      expect(w.spokes.length).toBeGreaterThanOrEqual(10);
      expect(w.spokes.length).toBeLessThanOrEqual(12);
      expect(w.rings.length).toBeGreaterThanOrEqual(6);
      expect(w.rings.length).toBeLessThanOrEqual(7);
    }
  });

  it('spokes start at the center and end on the unit rim', () => {
    const w = genWeb(0.3);
    for (const s of w.spokes) {
      expect(Math.hypot(s.x1, s.y1)).toBeLessThan(0.02);
      expect(Math.hypot(s.x2, s.y2)).toBeCloseTo(1, 1);
    }
  });

  it('ring segments connect adjacent spokes with a control point sagging toward the center', () => {
    const w = genWeb(0.7);
    for (const ring of w.rings) {
      expect(ring.segments.length).toBe(w.spokes.length);
      for (const seg of ring.segments) {
        const midR = Math.hypot((seg.ax + seg.bx) / 2, (seg.ay + seg.by) / 2);
        const ctrlR = Math.hypot(seg.cx, seg.cy);
        expect(ctrlR).toBeLessThan(midR); // sag pulls inward
      }
    }
  });

  it('is deterministic per seed', () => {
    expect(genWeb(0.42)).toEqual(genWeb(0.42));
  });
});
