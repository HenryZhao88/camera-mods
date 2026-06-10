import { describe, it, expect } from 'vitest';
import { CaptureAccumulator } from '../../src/gesture/capture';
import { normalizeLandmarks } from '../../src/gesture/normalize';
import type { HandLandmarks, HandResult } from '../../src/types';

// A simple asymmetric hand at an offset/scale — normalization-friendly.
function handAt(ox: number, oy: number, scale = 1): HandResult {
  const lm: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: ox + Math.cos(i) * 0.05 * scale,
    y: oy + Math.sin(i * 1.3) * 0.05 * scale,
    z: 0,
  }));
  lm[0] = { x: ox, y: oy + 0.1 * scale, z: 0 };  // wrist
  lm[9] = { x: ox, y: oy - 0.1 * scale, z: 0 };  // middle MCP (hand size anchor)
  return { landmarks: lm, handedness: 'Right' };
}

describe('CaptureAccumulator (one hand)', () => {
  it('rejects frames without a hand and accepts frames with one', () => {
    const acc = new CaptureAccumulator(1);
    expect(acc.add([])).toBe(false);
    expect(acc.count).toBe(0);
    expect(acc.add([handAt(0.5, 0.5)])).toBe(true);
    expect(acc.count).toBe(1);
  });

  it('averages normalized landmarks across frames', () => {
    const acc = new CaptureAccumulator(1);
    const h = handAt(0.3, 0.6);
    acc.add([h]);
    acc.add([h]);
    const cap = acc.finish();
    expect(cap.hands).toHaveLength(1);
    const expected = normalizeLandmarks(h.landmarks);
    for (let i = 0; i < 21; i++) {
      expect(cap.hands[0][i].x).toBeCloseTo(expected[i].x, 6);
      expect(cap.hands[0][i].y).toBeCloseTo(expected[i].y, 6);
    }
    expect(cap.span).toBeUndefined();
  });

  it('finish throws with zero accepted frames', () => {
    expect(() => new CaptureAccumulator(1).finish()).toThrow();
  });
});

describe('CaptureAccumulator (two hands)', () => {
  it('rejects single-hand frames', () => {
    const acc = new CaptureAccumulator(2);
    expect(acc.add([handAt(0.5, 0.5)])).toBe(false);
  });

  it('splits by wrist x regardless of array order and records span', () => {
    const acc = new CaptureAccumulator(2);
    const L = handAt(0.3, 0.5), R = handAt(0.7, 0.5);
    acc.add([R, L]); // reversed order on purpose
    const cap = acc.finish();
    const expL = normalizeLandmarks(L.landmarks);
    expect(cap.hands[0][0].x).toBeCloseTo(expL[0].x, 6); // hands[0] is LEFT-most
    // span = wrist distance (0.4) / avg hand size (0.2) = 2
    expect(cap.span).toBeCloseTo(2, 5);
  });
});
