import { describe, it, expect } from 'vitest';
import { GunShot } from '../src/effects/gunShot';
import type { HandLandmarks, HandResult, RenderContext } from '../src/types';

function setFinger(lm: HandLandmarks, joints: [number, number, number], col: number, up: boolean) {
  const [a, b, c] = joints;
  lm[a] = { x: col, y: 6, z: 0 };
  lm[b] = { x: col, y: 7, z: 0 };
  lm[c] = { x: col, y: up ? 8 : 6, z: 0 }; // straight (up) vs folded (down)
}

// Finger-gun hand: index extended, middle/ring/pinky curled, thumb up or down.
function gunHand(thumbUp: boolean): HandLandmarks {
  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  lm[0] = { x: 0, y: 0, z: 0 };
  setFinger(lm, [2, 3, 4], -3, thumbUp); // thumb
  setFinger(lm, [5, 6, 8], 0, true);     // index up
  setFinger(lm, [9, 10, 12], 1, false);  // middle down
  setFinger(lm, [13, 14, 16], 2, false); // ring down
  setFinger(lm, [17, 18, 20], 3, false); // pinky down
  return lm;
}

function ctx(landmarks: HandLandmarks, now: number): RenderContext {
  const hand: HandResult = { landmarks, handedness: 'Right' };
  return { width: 200, height: 200, hand, face: null, now };
}

describe('GunShot', () => {
  it('fires on the cock -> trigger (thumb drop) transition', () => {
    const g = new GunShot();
    g.update(1 / 60, ctx(gunHand(true), 0));   // thumb up: cocked, no shot yet
    expect(g.isActive()).toBe(false);
    g.update(1 / 60, ctx(gunHand(false), 100)); // thumb drops: BANG
    expect(g.isActive()).toBe(true);
  });

  it('does not fire if it was never cocked', () => {
    const g = new GunShot();
    g.update(1 / 60, ctx(gunHand(false), 100)); // thumb already down, no prior cock
    expect(g.isActive()).toBe(false);
  });

  it('does not fire when disabled', () => {
    const g = new GunShot();
    g.enabled = false;
    g.update(1 / 60, ctx(gunHand(true), 0));
    g.update(1 / 60, ctx(gunHand(false), 100));
    expect(g.isActive()).toBe(false);
  });
});
