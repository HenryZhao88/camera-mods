// Pure lightning-bolt geometry (no pixi). Midpoint-displacement style jagged
// polyline + optional single-level branches. rng injectable for determinism.
export interface BoltPt { x: number; y: number; }
export interface Bolt { points: BoltPt[]; branches: BoltPt[][]; }

export interface BoltOpts {
  x: number; y: number;        // origin
  angle: number;               // radians
  length: number;              // px
  segments?: number;           // default 7
  jitter?: number;             // perpendicular displacement as fraction of length (default 0.22)
  branchChance?: number;       // per interior vertex (default 0.35)
  rng?: () => number;
}

export function genBolt(o: BoltOpts): Bolt {
  const rng = o.rng ?? Math.random;
  const segs = o.segments ?? 7;
  const jitter = (o.jitter ?? 0.22) * o.length;
  const dx = Math.cos(o.angle), dy = Math.sin(o.angle);
  const nx = -dy, ny = dx; // perpendicular

  const points: BoltPt[] = [{ x: o.x, y: o.y }];
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const off = i === segs ? 0 : (rng() - 0.5) * 2 * jitter * (1 - t * 0.6);
    points.push({
      x: o.x + dx * o.length * t + nx * off,
      y: o.y + dy * o.length * t + ny * off,
    });
  }

  const branches: BoltPt[][] = [];
  const chance = o.branchChance ?? 0.35;
  for (let i = 2; i < segs - 1; i++) {
    if (rng() < chance) {
      const side = rng() < 0.5 ? 1 : -1;
      const sub = genBolt({
        x: points[i].x, y: points[i].y,
        angle: o.angle + side * (0.5 + rng() * 0.5),
        length: o.length * 0.42,
        segments: Math.max(3, Math.floor(segs / 2)),
        jitter: o.jitter,
        branchChance: 0, // single-level branching only
        rng,
      });
      branches.push(sub.points);
    }
  }
  return { points, branches };
}
