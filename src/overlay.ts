import type { Graphics } from 'pixi.js';
import type { HandLandmarks } from './types';

// Standard MediaPipe hand skeleton: pairs of landmark indices to connect.
const HAND_CONNECTIONS: Array<[number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],          // thumb
  [0, 5], [5, 6], [6, 7], [7, 8],          // index
  [5, 9], [9, 10], [10, 11], [11, 12],     // middle
  [9, 13], [13, 14], [14, 15], [15, 16],   // ring
  [13, 17], [17, 18], [18, 19], [19, 20],  // pinky
  [0, 17],                                  // palm base
];

const TIPS = new Set([4, 8, 12, 16, 20]);

// Draw the tracked hand's bones + joints into a (pre-cleared) Graphics layer.
// landmarks are normalized 0..1; w/h are the canvas dimensions. Callable multiple
// times per frame (one call per hand).
export function drawHandSkeleton(
  gfx: Graphics,
  landmarks: HandLandmarks,
  w: number,
  h: number,
): void {
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a], pb = landmarks[b];
    gfx.moveTo(pa.x * w, pa.y * h).lineTo(pb.x * w, pb.y * h);
  }
  gfx.stroke({ width: 2, color: 0x7df9ff, alpha: 0.65 });

  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const tip = TIPS.has(i);
    gfx.circle(p.x * w, p.y * h, tip ? 5 : 3.5)
      .fill({ color: 0x0a0c11 })
      .stroke({ width: 2, color: tip ? 0xffd27d : 0x7df9ff });
  }
}
