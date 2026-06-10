import { describe, it, expect } from 'vitest';
import { Texture } from 'pixi.js';
import { FxParticles } from '../../src/fx/particles';

function makeSystem(max?: number): FxParticles {
  return new FxParticles(Texture.WHITE, Texture.WHITE, max);
}

describe('FxParticles accounting', () => {
  it('spawn adds a live particle and mounts a sprite', () => {
    const ps = makeSystem();
    ps.spawn({ x: 0, y: 0, life: 1, size: 4 });
    expect(ps.count).toBe(1);
    expect(ps.view.children.length).toBe(1);
  });

  it('spawning past max is a no-op', () => {
    const ps = makeSystem(2);
    for (let i = 0; i < 5; i++) ps.spawn({ x: 0, y: 0, life: 1, size: 4 });
    expect(ps.count).toBe(2);
    expect(ps.view.children.length).toBe(2);
  });

  it('update expires particles and unmounts their sprites', () => {
    const ps = makeSystem();
    ps.spawn({ x: 0, y: 0, life: 0.1, size: 4 });
    ps.update(0.2);
    expect(ps.count).toBe(0);
    expect(ps.view.children.length).toBe(0);
  });

  it('recycled sprites are reused, not re-allocated', () => {
    const ps = makeSystem();
    ps.spawn({ x: 0, y: 0, life: 0.1, size: 4 });
    const first = ps.view.children[0];
    ps.update(0.2);             // expires -> sprite pooled
    ps.spawn({ x: 5, y: 5, life: 1, size: 4 });
    expect(ps.view.children[0]).toBe(first); // same Sprite instance came back
  });

  it('clear empties live particles and the view', () => {
    const ps = makeSystem();
    for (let i = 0; i < 3; i++) ps.spawn({ x: 0, y: 0, life: 1, size: 4 });
    ps.clear();
    expect(ps.count).toBe(0);
    expect(ps.view.children.length).toBe(0);
  });
});
