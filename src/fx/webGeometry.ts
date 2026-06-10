// Pure spider-web geometry in unit space (radius 1, centered at 0,0).
// Seeded mulberry32 RNG so textures are deterministic and testable.
export interface Spoke { x1: number; y1: number; x2: number; y2: number; }
export interface RingSeg {
  ax: number; ay: number;  // on spoke i
  bx: number; by: number;  // on spoke i+1
  cx: number; cy: number;  // quadratic control point, sagging toward center
}
export interface Ring { r: number; segments: RingSeg[]; }
export interface Web { spokes: Spoke[]; rings: Ring[]; }

function mulberry32(seed: number): () => number {
  let a = Math.floor(seed * 2 ** 31) | 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genWeb(seed: number): Web {
  const rng = mulberry32(seed);
  const spokeCount = 10 + Math.floor(rng() * 3); // 10..12
  const ringCount = 6 + Math.floor(rng() * 2);   // 6..7

  const angles: number[] = [];
  for (let i = 0; i < spokeCount; i++) {
    const base = (i / spokeCount) * Math.PI * 2;
    angles.push(base + (rng() - 0.5) * (Math.PI / spokeCount) * 0.8);
  }

  const spokes: Spoke[] = angles.map(a => ({
    x1: 0, y1: 0, x2: Math.cos(a), y2: Math.sin(a),
  }));

  const rings: Ring[] = [];
  for (let r = 1; r <= ringCount; r++) {
    const radius = (r / ringCount) * 0.95 + rng() * 0.02;
    const segments: RingSeg[] = [];
    for (let i = 0; i < spokeCount; i++) {
      const a1 = angles[i], a2 = angles[(i + 1) % spokeCount];
      const ax = Math.cos(a1) * radius, ay = Math.sin(a1) * radius;
      const bx = Math.cos(a2) * radius, by = Math.sin(a2) * radius;
      const sag = 0.82 + rng() * 0.08; // control point pulled toward center
      const cx = ((ax + bx) / 2) * sag, cy = ((ay + by) / 2) * sag;
      segments.push({ ax, ay, bx, by, cx, cy });
    }
    rings.push({ r: radius, segments });
  }
  return { spokes, rings };
}
