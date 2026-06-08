import type { HandLandmarks } from '../types';

// Translation + scale invariant: center on centroid, scale by RMS distance.
// Uses x,y only (MediaPipe z is noisy); z is zeroed in the output.
export function normalizeLandmarks(landmarks: HandLandmarks): HandLandmarks {
  const n = landmarks.length;
  let cx = 0, cy = 0;
  for (const p of landmarks) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;

  let sumSq = 0;
  for (const p of landmarks) {
    const dx = p.x - cx, dy = p.y - cy;
    sumSq += dx * dx + dy * dy;
  }
  const scale = Math.sqrt(sumSq / n) || 1;

  return landmarks.map(p => ({ x: (p.x - cx) / scale, y: (p.y - cy) / scale, z: 0 }));
}
