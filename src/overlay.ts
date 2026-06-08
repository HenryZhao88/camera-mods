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

// Draw the tracked hand's bones + joints over the (mirrored) video.
// landmarks are normalized 0..1; w/h are the canvas dimensions.
export function drawHandSkeleton(
  g: CanvasRenderingContext2D,
  landmarks: HandLandmarks,
  w: number,
  h: number,
): void {
  g.save();

  // bones
  g.lineWidth = 2;
  g.strokeStyle = 'rgba(125,249,255,0.65)';
  for (const [a, b] of HAND_CONNECTIONS) {
    const pa = landmarks[a], pb = landmarks[b];
    g.beginPath();
    g.moveTo(pa.x * w, pa.y * h);
    g.lineTo(pb.x * w, pb.y * h);
    g.stroke();
  }

  // joints
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i];
    const tip = TIPS.has(i);
    g.beginPath();
    g.arc(p.x * w, p.y * h, tip ? 5 : 3.5, 0, Math.PI * 2);
    g.fillStyle = '#0a0c11';
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = tip ? '#ffd27d' : '#7df9ff';
    g.stroke();
  }

  g.restore();
}
