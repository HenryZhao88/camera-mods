import { describe, it, expect } from 'vitest';
import { GunShot } from '../src/effects/gunShot';
import { normalizeLandmarks } from '../src/gesture/normalize';
import type { HandLandmarks, HandResult, RenderContext, StagedTemplate } from '../src/types';

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
  return { width: 200, height: 200, hand, hands: [hand], face: null, now };
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

  it('two hands fire independently (dual wield)', () => {
    const g = new GunShot();
    const L = (up: boolean): HandResult => ({ landmarks: gunHand(up), handedness: 'Left' });
    const R = (up: boolean): HandResult => ({ landmarks: gunHand(up), handedness: 'Right' });
    const mk = (l: HandResult, r: HandResult, now: number): RenderContext =>
      ({ width: 200, height: 200, hand: l, hands: [l, r], face: null, now });

    g.update(1 / 60, mk(L(true), R(true), 0));     // both cocked
    g.update(1 / 60, mk(L(false), R(true), 100));  // left fires
    expect(g.isActive()).toBe(true);

    // Drain the LEFT shot completely so residual visuals can't mask the right hand.
    const fist: HandResult = {
      landmarks: Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 })),
      handedness: 'Left',
    };
    for (let i = 0; i < 200; i++) g.update(1 / 60, mk(fist, R(true), 200 + i * 16));
    expect(g.isActive()).toBe(false);           // proves left's shot is fully gone
    g.update(1 / 60, mk(fist, R(false), 5000)); // ONLY the right hand fires now
    expect(g.isActive()).toBe(true);
  });

  it('custom staged trigger replaces the built-in finger gun', () => {
    const g = new GunShot();
    // custom: READY = open-ish flat hand, FIRE = the gun pose itself
    const ready: HandLandmarks = Array.from({ length: 21 }, (_, i) => ({ x: i * 0.01, y: 0, z: 0 }));
    ready[0] = { x: 0, y: 0.1, z: 0 }; ready[9] = { x: 0, y: -0.1, z: 0 };
    const fire = gunHand(false);
    const tpl: StagedTemplate = {
      kind: 'stages', effectId: 'gun-shot',
      stages: [normalizeLandmarks(ready), normalizeLandmarks(fire)],
      createdAt: 'now',
    };
    g.setCustomTrigger(tpl, () => 0.6);

    // built-in cock (thumb-up gun) must NOT arm the custom trigger
    g.update(1 / 60, ctx(gunHand(true), 0));
    g.update(1 / 60, ctx(gunHand(false), 100));
    expect(g.isActive()).toBe(false);

    // custom ready -> fire fires
    g.update(1 / 60, ctx(ready, 500));
    g.update(1 / 60, ctx(fire, 600));
    expect(g.isActive()).toBe(true);
  });

  it('a cock latched before switching to custom cannot fire after switching back', () => {
    const g = new GunShot();
    g.update(1 / 60, ctx(gunHand(true), 0)); // built-in: cocked
    const tpl: StagedTemplate = {
      kind: 'stages', effectId: 'gun-shot',
      stages: [normalizeLandmarks(gunHand(true)), normalizeLandmarks(gunHand(false))],
      createdAt: 'now',
    };
    g.setCustomTrigger(tpl, () => 0.05); // strict threshold: poses won't match it
    g.update(1 / 60, ctx(gunHand(true), 50));
    g.setCustomTrigger(null);                   // back to built-in
    g.update(1 / 60, ctx(gunHand(false), 100)); // thumb down WITHOUT a fresh cock
    expect(g.isActive()).toBe(false);           // stale latch must not fire
  });

  it('clearing the custom trigger restores the built-in', () => {
    const g = new GunShot();
    const tpl: StagedTemplate = {
      kind: 'stages', effectId: 'gun-shot',
      stages: [normalizeLandmarks(gunHand(true)), normalizeLandmarks(gunHand(false))],
      createdAt: 'now',
    };
    g.setCustomTrigger(tpl, () => 0.6);
    g.setCustomTrigger(null);
    g.update(1 / 60, ctx(gunHand(true), 0));
    g.update(1 / 60, ctx(gunHand(false), 100));
    expect(g.isActive()).toBe(true);
  });
});
