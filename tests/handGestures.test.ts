import { describe, it, expect } from 'vitest';
import { fingersUp, isPinch, GESTURE_PRESETS } from '../src/gesture/handGestures';
import type { HandLandmarks } from '../src/types';

type Finger = 'thumb' | 'index' | 'middle' | 'ring' | 'pinky';
const JOINTS: Record<Finger, [number, number, number]> = {
  thumb: [2, 3, 4], index: [5, 6, 8], middle: [9, 10, 12], ring: [13, 14, 16], pinky: [17, 18, 20],
};
const COLS: Record<Finger, number> = { thumb: -4, index: 0, middle: 1, ring: 2, pinky: 3 };

// Build a hand from a per-finger up/down spec.
function hand(spec: Partial<Record<Finger, boolean>>): HandLandmarks {
  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  lm[0] = { x: 0, y: 0, z: 0 };  // wrist
  lm[9] = { x: 1, y: 5, z: 0 };  // middle knuckle -> hand size reference
  for (const f of Object.keys(JOINTS) as Finger[]) {
    const [a, v, b] = JOINTS[f];
    const col = COLS[f];
    const up = spec[f] ?? false;
    lm[a] = { x: col, y: 6, z: 0 };
    lm[v] = { x: col, y: 7, z: 0 };
    lm[b] = { x: col, y: up ? 8 : 6, z: 0 }; // straight (up) vs folded back (down)
  }
  return lm;
}

describe('fingersUp', () => {
  it('detects all fingers up on an open hand', () => {
    const f = fingersUp(hand({ thumb: true, index: true, middle: true, ring: true, pinky: true }));
    expect(f).toEqual([true, true, true, true, true]);
  });

  it('detects all fingers down on a fist', () => {
    const f = fingersUp(hand({}));
    expect(f).toEqual([false, false, false, false, false]);
  });
});

describe('isPinch', () => {
  it('is true when thumb and index tips touch', () => {
    const lm = hand({ index: true });
    lm[4] = { x: 0, y: 8, z: 0 };
    lm[8] = { x: 0, y: 8, z: 0 }; // same point
    expect(isPinch(lm)).toBe(true);
  });

  it('is false when tips are far apart', () => {
    const lm = hand({ thumb: true, index: true, middle: true, ring: true, pinky: true });
    expect(isPinch(lm)).toBe(false);
  });
});

describe('GESTURE_PRESETS', () => {
  it('open hand matches "open"', () => {
    expect(GESTURE_PRESETS.open.test(hand({ index: true, middle: true, ring: true, pinky: true }))).toBe(true);
  });

  it('fist matches "fist"', () => {
    expect(GESTURE_PRESETS.fist.test(hand({}))).toBe(true);
  });

  it('peace matches index+middle only', () => {
    expect(GESTURE_PRESETS.peace.test(hand({ index: true, middle: true }))).toBe(true);
    expect(GESTURE_PRESETS.peace.test(hand({ index: true, middle: true, ring: true, pinky: true }))).toBe(false);
  });

  it('point matches index only', () => {
    expect(GESTURE_PRESETS.point.test(hand({ index: true }))).toBe(true);
  });

  it('rock matches index+pinky only', () => {
    expect(GESTURE_PRESETS.rock.test(hand({ index: true, pinky: true }))).toBe(true);
  });
});
