import type { HandLandmarks } from '../types';

// Mean per-point euclidean distance (x,y). Lower = more similar.
export function landmarkDistance(a: HandLandmarks, b: HandLandmarks): number {
  if (a.length !== b.length) throw new Error('landmark length mismatch');
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const dx = a[i].x - b[i].x;
    const dy = a[i].y - b[i].y;
    sum += Math.sqrt(dx * dx + dy * dy);
  }
  return sum / a.length;
}
