import { describe, it, expect } from 'vitest';
import { DimLights } from '../src/effects/dimLights';
import type { HandLandmarks, HandResult, RenderContext } from '../src/types';

const FINGER_PAIRS: Array<[number, number]> = [[8, 6], [12, 10], [16, 14], [20, 18]];

function hand(kind: 'open' | 'fist'): HandResult {
  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  for (const [tip, pip] of FINGER_PAIRS) {
    lm[pip] = { x: 0, y: 2, z: 0 };
    lm[tip] = { x: 0, y: kind === 'open' ? 3 : 1, z: 0 };
  }
  return { landmarks: lm, handedness: 'Right' };
}

function ctx(h: HandResult | null): RenderContext {
  return { width: 100, height: 100, hand: h, now: 0 };
}

// Advance the effect by `seconds` worth of 60fps frames.
function run(d: DimLights, h: HandResult | null, seconds: number) {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i++) d.update(1 / 60, ctx(h));
}

describe('DimLights (open/fist self-driven fade)', () => {
  it('starts bright and inactive', () => {
    expect(new DimLights().isActive()).toBe(false);
  });

  it('fades down to dim when a fist is held', () => {
    const d = new DimLights();
    run(d, hand('fist'), 2); // > 1.5s fade
    expect(d.isActive()).toBe(true);
  });

  it('fades back up when the hand reopens', () => {
    const d = new DimLights();
    run(d, hand('fist'), 2);
    expect(d.isActive()).toBe(true);
    run(d, hand('open'), 2);
    expect(d.isActive()).toBe(false);
  });

  it('holds its level when no hand is present', () => {
    const d = new DimLights();
    run(d, hand('fist'), 2);
    run(d, null, 2); // no hand -> should stay dim
    expect(d.isActive()).toBe(true);
  });

  it('fades up when disabled', () => {
    const d = new DimLights();
    run(d, hand('fist'), 2);
    d.enabled = false;
    run(d, hand('fist'), 2);
    expect(d.isActive()).toBe(false);
  });
});
