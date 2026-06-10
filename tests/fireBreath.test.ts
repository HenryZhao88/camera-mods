import { describe, it, expect } from 'vitest';
import { FireBreath } from '../src/effects/fireBreath';
import type { FaceResult, Landmark, RenderContext } from '../src/types';

function faceLandmarks(open: boolean): Landmark[] {
  const arr: Landmark[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0, z: 0 }));
  arr[10] = { x: 0, y: 0, z: 0 };   // forehead
  arr[152] = { x: 0, y: 10, z: 0 }; // chin -> faceH 10
  arr[1] = { x: 0, y: 4, z: 0 };    // nose
  arr[13] = { x: 0, y: open ? 4.5 : 4.95, z: 0 }; // upper lip
  arr[14] = { x: 0, y: open ? 6.5 : 5.05, z: 0 }; // lower lip
  return arr;
}

function ctx(face: FaceResult | null): RenderContext {
  return { width: 200, height: 200, hand: null, hands: [], face, now: 0 };
}

describe('FireBreath (mouth-driven)', () => {
  it('is inactive at rest', () => {
    expect(new FireBreath().isActive()).toBe(false);
  });

  it('emits fire when the mouth is open', () => {
    const fire = new FireBreath();
    fire.update(1 / 60, ctx({ landmarks: faceLandmarks(true) }));
    expect(fire.isActive()).toBe(true);
  });

  it('does not emit when the mouth is closed', () => {
    const fire = new FireBreath();
    fire.update(1 / 60, ctx({ landmarks: faceLandmarks(false) }));
    expect(fire.isActive()).toBe(false);
  });

  it('does not emit without a face', () => {
    const fire = new FireBreath();
    fire.update(1 / 60, ctx(null));
    expect(fire.isActive()).toBe(false);
  });

  it('does not emit when disabled', () => {
    const fire = new FireBreath();
    fire.enabled = false;
    fire.update(1 / 60, ctx({ landmarks: faceLandmarks(true) }));
    expect(fire.isActive()).toBe(false);
  });
});
