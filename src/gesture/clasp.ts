import type { HandLandmarks, HandResult } from '../types';

// Wrists closer than this x average hand size = a clasped two-hand sign.
// No finger requirements: folded signs occlude fingers and finger reads are
// unreliable when hands overlap.
const CLASP_FACTOR = 0.9;

function handSize(lm: HandLandmarks): number {
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1e-6;
}

export function isClasped(hands: HandResult[]): boolean {
  if (hands.length < 2) return false;
  const [a, b] = hands;
  const dist = Math.hypot(
    a.landmarks[0].x - b.landmarks[0].x,
    a.landmarks[0].y - b.landmarks[0].y,
  );
  const avg = (handSize(a.landmarks) + handSize(b.landmarks)) / 2;
  return dist < CLASP_FACTOR * avg;
}
