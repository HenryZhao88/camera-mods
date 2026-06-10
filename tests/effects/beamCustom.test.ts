import { describe, it, expect } from 'vitest';
import { EnergyBeam } from '../../src/effects/energyBeam';
import { normalizeLandmarks } from '../../src/gesture/normalize';
import type { HandLandmarks, HandResult, RenderContext, TwoHandTemplate } from '../../src/types';

// Fist-like blob — would NEVER pass the built-in open-ish charge check.
function fist(ox: number, oy: number): HandLandmarks {
  const lm: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({
    x: ox + Math.cos(i) * 0.02, y: oy + Math.sin(i) * 0.02, z: 0,
  }));
  lm[0] = { x: ox, y: oy + 0.1, z: 0 };
  lm[9] = { x: ox, y: oy - 0.1, z: 0 };
  return lm;
}
const hand = (lm: HandLandmarks): HandResult => ({ landmarks: lm, handedness: 'Right' });

function ctx(hands: HandResult[], now: number): RenderContext {
  return { width: 1000, height: 1000, hand: hands[0] ?? null, hands, face: null, now };
}

describe('EnergyBeam custom charge pose', () => {
  it('charges on the custom two-hand pose (which the built-in would reject)', () => {
    const beam = new EnergyBeam();
    const L = fist(0.4, 0.5), R = fist(0.6, 0.5);
    const tpl: TwoHandTemplate = {
      kind: 'two-hand', effectId: 'energy-beam',
      left: normalizeLandmarks(L), right: normalizeLandmarks(R),
      span: 0.2 / 0.2, // wrists 0.2 apart / hand size 0.2
      createdAt: 'now',
    };

    // sanity: built-in rejects the fists
    let t = 0;
    for (let i = 0; i < 30; i++) { t += 1000 / 60; beam.update(1 / 60, ctx([hand(L), hand(R)], t)); }
    expect(beam.isActive()).toBe(false);

    beam.setCustomCharge(tpl, () => 0.6);
    for (let i = 0; i < 30; i++) { t += 1000 / 60; beam.update(1 / 60, ctx([hand(L), hand(R)], t)); }
    expect(beam.isActive()).toBe(true); // charging
  });
});
