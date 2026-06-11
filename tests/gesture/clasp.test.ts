import { describe, it, expect } from 'vitest';
import { isClasped } from '../../src/gesture/clasp';
import type { HandLandmarks, HandResult } from '../../src/types';

function handAt(wx: number, wy: number, size = 0.2): HandResult {
  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({ x: wx, y: wy, z: 0 }));
  lm[0] = { x: wx, y: wy, z: 0 };            // wrist
  lm[9] = { x: wx, y: wy - size, z: 0 };     // middle MCP (hand size anchor)
  return { landmarks: lm, handedness: 'Right' };
}

describe('isClasped', () => {
  it('passes when two wrists are closer than 0.9x average hand size', () => {
    expect(isClasped([handAt(0.50, 0.5), handAt(0.62, 0.5)])).toBe(true); // 0.12 < 0.18
  });

  it('fails when wrists are farther than 0.9x average hand size', () => {
    expect(isClasped([handAt(0.3, 0.5), handAt(0.7, 0.5)])).toBe(false); // 0.4 > 0.18
  });

  it('fails with fewer than two hands', () => {
    expect(isClasped([])).toBe(false);
    expect(isClasped([handAt(0.5, 0.5)])).toBe(false);
  });
});
