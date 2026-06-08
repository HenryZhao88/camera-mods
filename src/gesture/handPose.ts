import type { HandLandmarks } from '../types';

// Wrist landmark + four finger [tip, pip] pairs (index, middle, ring, pinky).
// The thumb is intentionally excluded: its geometry relative to the wrist is
// unreliable for open/fist detection, especially under mirroring.
const WRIST = 0;
const FINGERS: Array<[number, number]> = [[8, 6], [12, 10], [16, 14], [20, 18]];

// Margin so a barely-curled finger doesn't flicker as "extended".
const EXTENDED_MARGIN = 1.1;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// How many of the four fingers are extended: a finger is extended when its
// tip is meaningfully farther from the wrist than its middle (pip) joint.
export function extendedFingerCount(landmarks: HandLandmarks): number {
  const wrist = landmarks[WRIST];
  let count = 0;
  for (const [tip, pip] of FINGERS) {
    if (dist(landmarks[tip], wrist) > dist(landmarks[pip], wrist) * EXTENDED_MARGIN) {
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
