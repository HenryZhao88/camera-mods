import { describe, it, expect } from 'vitest';
import { mouthOpenness, mouthCenter, breathDirection } from '../src/facePose';
import type { Landmark } from '../src/types';

// Build a face with the few landmarks our helpers read.
function face(opts: {
  upper: [number, number];
  lower: [number, number];
  nose?: [number, number];
  forehead?: [number, number];
  chin?: [number, number];
}): Landmark[] {
  const arr: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
  const set = (i: number, p: [number, number]) => { arr[i] = { x: p[0], y: p[1], z: 0 }; };
  set(13, opts.upper);
  set(14, opts.lower);
  set(1, opts.nose ?? [0, 0]);
  set(10, opts.forehead ?? [0, 0]);
  set(152, opts.chin ?? [0, 10]);
  return arr;
}

describe('mouthOpenness', () => {
  it('is ~0 when the mouth is closed', () => {
    const f = face({ upper: [0, 4.95], lower: [0, 5.05] }); // gap 0.1, faceH 10 -> ratio 0.01
    expect(mouthOpenness(f)).toBeCloseTo(0, 5);
  });

  it('is ~1 when the mouth is wide open', () => {
    const f = face({ upper: [0, 4], lower: [0, 6] }); // gap 2, faceH 10 -> ratio 0.2
    expect(mouthOpenness(f)).toBeGreaterThan(0.85);
  });

  it('grows monotonically as the mouth opens', () => {
    const small = face({ upper: [0, 4.5], lower: [0, 5.5] }); // gap 1
    const big = face({ upper: [0, 4], lower: [0, 6] });       // gap 2
    expect(mouthOpenness(small)).toBeLessThan(mouthOpenness(big));
  });
});

describe('mouthCenter', () => {
  it('is the midpoint of the inner lips', () => {
    const c = mouthCenter(face({ upper: [2, 4], lower: [4, 6] }));
    expect(c.x).toBeCloseTo(3, 6);
    expect(c.y).toBeCloseTo(5, 6);
  });
});

describe('breathDirection', () => {
  it('points from the nose out through the mouth', () => {
    // nose above, mouth below -> direction points straight down (+y)
    const d = breathDirection(face({ upper: [0, 2], lower: [0, 2], nose: [0, 0] }));
    expect(d.x).toBeCloseTo(0, 6);
    expect(d.y).toBeCloseTo(1, 6);
  });

  it('returns a unit vector', () => {
    const d = breathDirection(face({ upper: [3, 4], lower: [3, 4], nose: [0, 0] }));
    expect(Math.hypot(d.x, d.y)).toBeCloseTo(1, 6);
  });
});
