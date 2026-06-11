// Seeded ragged ink-blob outline in unit space (max radius 1, centered 0,0).
// Two octaves of angular noise give the splotchy, organic ink edge.
export interface BlotPt { x: number; y: number; }

function mulberry32(seed: number): () => number {
  let a = Math.floor(seed * 2 ** 31) | 1;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function genInkBlot(seed: number): BlotPt[] {
  const rng = mulberry32(seed);
  const n = 24 + Math.floor(rng() * 9); // 24..32

  // two octaves: 3-lobe slow wave + per-point jitter, normalized into [0.45, 1]
  const lobePhase = rng() * Math.PI * 2;
  const lobeAmp = 0.12 + rng() * 0.1;
  const pts: BlotPt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const lobe = Math.sin(a * 3 + lobePhase) * lobeAmp;
    const jitter = (rng() - 0.5) * 0.24;
    const r = Math.min(1, Math.max(0.45, 0.72 + lobe + jitter));
    pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
  }
  return pts;
}
