import { describe, it, expect } from 'vitest';
import { extendedFingerCount, classifyOpenFist } from '../src/gesture/handPose';
import type { HandLandmarks } from '../src/types';

// Build a 21-point hand, overriding specific landmark indices.
function mk(overrides: Record<number, [number, number]>): HandLandmarks {
  const arr: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [i, [x, y]] of Object.entries(overrides)) arr[+i] = { x, y, z: 0 };
  return arr;
}

// Finger [mcp, pip, tip] joint triples: index, middle, ring, pinky.
const FINGERS: Array<[number, number, number]> = [[5, 6, 8], [9, 10, 12], [13, 14, 16], [17, 18, 20]];

// Straight finger: mcp -> pip -> tip colinear (angle at pip ≈ 180°).
function straight(o: Record<number, [number, number]>, f: [number, number, number], col: number) {
  const [mcp, pip, tip] = f;
  o[mcp] = [col, 1]; o[pip] = [col, 2]; o[tip] = [col, 3];
}
// Curled finger: tip bends back toward the knuckle (angle at pip ≈ 0°).
function curled(o: Record<number, [number, number]>, f: [number, number, number], col: number) {
  const [mcp, pip, tip] = f;
  o[mcp] = [col, 1]; o[pip] = [col, 2]; o[tip] = [col, 1];
}

function openHand(): HandLandmarks {
  const o: Record<number, [number, number]> = {};
  FINGERS.forEach((f, i) => straight(o, f, i));
  return mk(o);
}
function fist(): HandLandmarks {
  const o: Record<number, [number, number]> = {};
  FINGERS.forEach((f, i) => curled(o, f, i));
  return mk(o);
}

describe('extendedFingerCount', () => {
  it('counts all four fingers on an open hand', () => {
    expect(extendedFingerCount(openHand())).toBe(4);
  });

  it('counts zero on a fist', () => {
    expect(extendedFingerCount(fist())).toBe(0);
  });

  it('detects extension regardless of hand orientation (tilted/rotated)', () => {
    // Rotate the straight open hand 90°: swap x/y so fingers run horizontally.
    const upright = openHand();
    const rotated: HandLandmarks = upright.map(p => ({ x: p.y, y: p.x, z: 0 }));
    expect(extendedFingerCount(rotated)).toBe(4);
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
    const o: Record<number, [number, number]> = {};
    straight(o, FINGERS[0], 0); // index extended
    straight(o, FINGERS[1], 1); // middle extended
    curled(o, FINGERS[2], 2);   // ring curled
    curled(o, FINGERS[3], 3);   // pinky curled
    expect(classifyOpenFist(mk(o))).toBe('unknown');
  });
});
