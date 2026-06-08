import { describe, it, expect } from 'vitest';
import { extendedFingerCount, classifyOpenFist } from '../src/gesture/handPose';
import type { HandLandmarks } from '../src/types';

// Build a 21-point hand, overriding specific landmark indices.
function mk(overrides: Record<number, [number, number]>): HandLandmarks {
  const arr: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y]] of Object.entries(overrides)) arr[+i] = { x, y, z: 0 };
  return arr;
}

// Finger [tip, pip] pairs used by the detector: index, middle, ring, pinky.
const FINGER_PAIRS: Array<[number, number]> = [[8, 6], [12, 10], [16, 14], [20, 18]];

// Place every finger with tip FARTHER from the wrist than its pip -> extended.
function openHand(): HandLandmarks {
  const o: Record<number, [number, number]> = { 0: [0, 0] };
  for (const [tip, pip] of FINGER_PAIRS) { o[pip] = [0, 2]; o[tip] = [0, 3]; }
  return mk(o);
}

// Place every finger with tip CLOSER to the wrist than its pip -> curled.
function fist(): HandLandmarks {
  const o: Record<number, [number, number]> = { 0: [0, 0] };
  for (const [tip, pip] of FINGER_PAIRS) { o[pip] = [0, 2]; o[tip] = [0, 1]; }
  return mk(o);
}

describe('extendedFingerCount', () => {
  it('counts all four fingers on an open hand', () => {
    expect(extendedFingerCount(openHand())).toBe(4);
  });

  it('counts zero on a fist', () => {
    expect(extendedFingerCount(fist())).toBe(0);
  });
});

describe('classifyOpenFist', () => {
  it('classifies an open hand as open', () => {
    expect(classifyOpenFist(openHand())).toBe('open');
  });

  it('classifies a fist as fist', () => {
    expect(classifyOpenFist(fist())).toBe('fist');
  });

  it('returns unknown for an in-between pose (two fingers up)', () => {
    // index + middle extended, ring + pinky curled
    const o: Record<number, [number, number]> = { 0: [0, 0] };
    o[6] = [0, 2]; o[8] = [0, 3];   // index extended
    o[10] = [0, 2]; o[12] = [0, 3]; // middle extended
    o[14] = [0, 2]; o[16] = [0, 1]; // ring curled
    o[18] = [0, 2]; o[20] = [0, 1]; // pinky curled
    expect(classifyOpenFist(mk(o))).toBe('unknown');
  });
});
