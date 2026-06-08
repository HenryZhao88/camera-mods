import { describe, it, expect } from 'vitest';
import { PalmBlast } from '../src/effects/palmBlast';
import type { RenderContext } from '../src/types';

function ctx(): RenderContext {
  const landmarks = Array.from({ length: 21 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  return { width: 100, height: 100, hand: { landmarks, handedness: 'Right' }, now: 0 };
}

describe('PalmBlast (oneshot lifecycle)', () => {
  it('is inactive before triggering', () => {
    const b = new PalmBlast();
    expect(b.isActive()).toBe(false);
  });

  it('spawns particles and becomes active after start()+update()', () => {
    const b = new PalmBlast();
    b.start();
    b.update(0.016, ctx()); // the frame the gesture fired
    expect(b.isActive()).toBe(true);
  });
});
