import { describe, it, expect } from 'vitest';
import { EnergyShield } from '../../src/effects/energyShield';
import type { HandLandmarks, HandResult, RenderContext } from '../../src/types';

function openHand(): HandResult {
  const lm: HandLandmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  lm[0] = { x: 0.5, y: 0.8, z: 0 };  // wrist
  lm[9] = { x: 0.5, y: 0.5, z: 0 };  // middle MCP (hand size anchor)
  return { landmarks: lm, handedness: 'Right' };
}

function ctx(h: HandResult | null, now = 0): RenderContext {
  return { width: 1000, height: 1000, hand: h, hands: h ? [h] : [], face: null, now };
}

describe('EnergyShield', () => {
  it('is inactive until started', () => {
    expect(new EnergyShield().isActive()).toBe(false);
  });

  it('raises while held and stays active', () => {
    const s = new EnergyShield();
    s.start();
    for (let i = 0; i < 30; i++) s.update(1 / 60, ctx(openHand()));
    expect(s.isActive()).toBe(true);
    expect(s.presence).toBeCloseTo(1, 1); // fully raised after 0.5s >> 0.22s raise
  });

  it('lowers after stop and eventually deactivates', () => {
    const s = new EnergyShield();
    s.start();
    for (let i = 0; i < 30; i++) s.update(1 / 60, ctx(openHand()));
    s.stop();
    for (let i = 0; i < 30; i++) s.update(1 / 60, ctx(openHand()));
    expect(s.isActive()).toBe(false);
    expect(s.presence).toBe(0);
  });

  it('reset drops it instantly', () => {
    const s = new EnergyShield();
    s.start();
    for (let i = 0; i < 30; i++) s.update(1 / 60, ctx(openHand()));
    s.reset();
    expect(s.isActive()).toBe(false);
  });
});
