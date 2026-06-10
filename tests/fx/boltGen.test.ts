import { describe, it, expect } from 'vitest';
import { genBolt } from '../../src/fx/boltGen';

describe('genBolt', () => {
  it('starts exactly at the origin and ends exactly at length along the angle', () => {
    const b = genBolt({ x: 10, y: 20, angle: 0, length: 100, rng: () => 0.5 });
    expect(b.points[0]).toEqual({ x: 10, y: 20 });
    const end = b.points[b.points.length - 1];
    expect(end.x).toBeCloseTo(110);
    expect(end.y).toBeCloseTo(20);
  });

  it('produces segments+1 points', () => {
    const b = genBolt({ x: 0, y: 0, angle: 0, length: 100, segments: 7, rng: () => 0.5 });
    expect(b.points.length).toBe(8);
  });

  it('is deterministic for a fixed rng', () => {
    const a = genBolt({ x: 0, y: 0, angle: 1, length: 80, rng: () => 0.3 });
    const b = genBolt({ x: 0, y: 0, angle: 1, length: 80, rng: () => 0.3 });
    expect(a).toEqual(b);
  });

  it('spawns no branches when rng stays above branchChance', () => {
    const b = genBolt({ x: 0, y: 0, angle: 0, length: 100, branchChance: 0.35, rng: () => 0.9 });
    expect(b.branches.length).toBe(0);
  });

  it('spawns branches rooted on the main bolt when rng is low', () => {
    const b = genBolt({ x: 0, y: 0, angle: 0, length: 100, segments: 7, branchChance: 0.35, rng: () => 0.1 });
    expect(b.branches.length).toBeGreaterThan(0);
    for (const br of b.branches) {
      const root = br[0];
      expect(b.points.some(p => p.x === root.x && p.y === root.y)).toBe(true);
    }
  });

  it('jitters interior points perpendicular to the bolt axis', () => {
    const b = genBolt({ x: 0, y: 0, angle: 0, length: 100, segments: 7, rng: () => 0.9 });
    // angle 0 -> perpendicular is y; rng 0.9 -> positive offsets
    const interior = b.points.slice(1, -1);
    expect(interior.some(p => Math.abs(p.y) > 1)).toBe(true);
  });
});
