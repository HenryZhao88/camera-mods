import type { HandLandmarks, Landmark } from '../types';

// [mcp, pip, tip] joints for index, middle, ring, pinky.
// The thumb is intentionally excluded — its geometry is unreliable for
// open/fist detection, especially under mirroring.
const FINGERS: Array<[number, number, number]> = [
  [5, 6, 8],
  [9, 10, 12],
  [13, 14, 16],
  [17, 18, 20],
];

// A finger counts as extended when it is roughly straight: the angle at the PIP
// joint (segment back to the knuckle vs. segment out to the tip) is wide.
// cos ≈ -1 means straight, cos ≈ 0/positive means curled. This is based on the
// finger's own joints, so it is orientation-independent and survives hand tilt,
// rotation, and pointing toward the camera — unlike a wrist-distance heuristic.
const STRAIGHT_COS = -0.5; // angle wider than ~120°

function angleCos(a: Landmark, vertex: Landmark, b: Landmark): number {
  const ax = a.x - vertex.x, ay = a.y - vertex.y;
  const bx = b.x - vertex.x, by = b.y - vertex.y;
  const dot = ax * bx + ay * by;
  const mag = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return mag === 0 ? 0 : dot / mag;
}

// How many of the four fingers are extended (straight).
export function extendedFingerCount(landmarks: HandLandmarks): number {
  let count = 0;
  for (const [mcp, pip, tip] of FINGERS) {
    if (angleCos(landmarks[mcp], landmarks[pip], landmarks[tip]) < STRAIGHT_COS) {
      count++;
    }
  }
  return count;
}

export type OpenFist = 'open' | 'fist' | 'unknown';

// Classify the hand as an open hand, a fist, or an ambiguous in-between pose.
// The deadzone (2 fingers) prevents flicker while transitioning open <-> fist.
export function classifyOpenFist(landmarks: HandLandmarks): OpenFist {
  const n = extendedFingerCount(landmarks);
  if (n >= 3) return 'open';
  if (n <= 1) return 'fist';
  return 'unknown';
}
