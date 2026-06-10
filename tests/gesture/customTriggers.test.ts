import { describe, it, expect } from 'vitest';
import { matchTwoHand, StagedTrigger } from '../../src/gesture/customTriggers';
import { normalizeLandmarks } from '../../src/gesture/normalize';
import type { HandLandmarks, HandResult, StagedTemplate, TwoHandTemplate } from '../../src/types';

// Distinct synthetic poses: pose A (spread arc) vs pose B (tight line) differ
// enough after normalization that they never cross-match at threshold 0.6.
function poseA(ox = 0.5, oy = 0.5): HandLandmarks {
  const lm: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: ox + Math.cos(i * 0.3) * 0.08, y: oy + Math.sin(i * 0.3) * 0.08, z: 0,
  }));
  lm[0] = { x: ox, y: oy + 0.12, z: 0 };
  lm[9] = { x: ox, y: oy - 0.12, z: 0 };
  return lm;
}
function poseB(ox = 0.5, oy = 0.5): HandLandmarks {
  const lm: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: ox + (i / 21) * 0.1, y: oy - (i / 21) * 0.1, z: 0,
  }));
  lm[0] = { x: ox, y: oy + 0.12, z: 0 };
  lm[9] = { x: ox, y: oy - 0.12, z: 0 };
  return lm;
}
const hand = (lm: HandLandmarks): HandResult => ({ landmarks: lm, handedness: 'Right' });

describe('matchTwoHand', () => {
  // template: pose A on the left, pose B on the right, wrists 0.4 apart, size 0.24
  const tpl: TwoHandTemplate = {
    kind: 'two-hand', effectId: 'beam',
    left: normalizeLandmarks(poseA(0.3, 0.5)),
    right: normalizeLandmarks(poseB(0.7, 0.5)),
    span: 0.4 / 0.24,
    createdAt: 'now',
  };

  it('matches the recorded pair at the recorded span', () => {
    expect(matchTwoHand([hand(poseA(0.3, 0.5)), hand(poseB(0.7, 0.5))], tpl, 0.6)).toBe(true);
  });

  it('matches with the hands array in reverse order (position-based assignment)', () => {
    expect(matchTwoHand([hand(poseB(0.7, 0.5)), hand(poseA(0.3, 0.5))], tpl, 0.6)).toBe(true);
  });

  it('rejects a single hand', () => {
    expect(matchTwoHand([hand(poseA(0.3, 0.5))], tpl, 0.6)).toBe(false);
  });

  it('rejects when the poses are swapped left/right', () => {
    expect(matchTwoHand([hand(poseB(0.3, 0.5)), hand(poseA(0.7, 0.5))], tpl, 0.3)).toBe(false);
  });

  it('rejects when hands are far outside the recorded span', () => {
    // same poses but wrists ~3x the recorded span apart (scaled positions)
    expect(matchTwoHand([hand(poseA(0.02, 0.5)), hand(poseB(0.98, 0.5))], tpl, 0.6)).toBe(false);
  });
});

describe('StagedTrigger', () => {
  const tpl: StagedTemplate = {
    kind: 'stages', effectId: 'gun',
    stages: [normalizeLandmarks(poseA()), normalizeLandmarks(poseB())],
    createdAt: 'now',
  };
  const trig = () => new StagedTrigger(tpl, () => 0.6);

  it('fires on ready -> fire', () => {
    const t = trig();
    expect(t.step(poseA(), 0)).toBe(false);   // armed
    expect(t.step(poseB(), 100)).toBe(true);  // fire
  });

  it('does not fire on fire-pose without arming first', () => {
    expect(trig().step(poseB(), 0)).toBe(false);
  });

  it('cooldown blocks but stays armed (GunCore parity)', () => {
    const t = trig();
    t.step(poseA(), 0);
    expect(t.step(poseB(), 10)).toBe(true);   // shot at t=10
    t.step(poseA(), 50);                       // re-arm
    expect(t.step(poseB(), 200)).toBe(false); // blocked (<350ms), stays armed
    expect(t.step(poseB(), 400)).toBe(true);  // fires once cooldown elapses
  });

  it('disarms when the hand matches neither stage or disappears', () => {
    const t = trig();
    t.step(poseA(), 0);
    t.step(null, 50);
    expect(t.step(poseB(), 100)).toBe(false);

    const t2 = trig();
    t2.step(poseA(), 0);
    const neither: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: i % 2, y: i % 3, z: 0 }));
    t2.step(neither, 50);
    expect(t2.step(poseB(), 100)).toBe(false);
  });

  it('reset disarms', () => {
    const t = trig();
    t.step(poseA(), 0);
    t.reset();
    expect(t.step(poseB(), 100)).toBe(false);
  });
});
