import type { HandLandmarks, Landmark } from '../types';

// Angle thresholds: a joint is "straight" when the angle there is wide
// (cosine near -1). Thumbs bend less, so they use a looser threshold.
const STRAIGHT_COS = -0.5;       // ~>120°
const THUMB_STRAIGHT_COS = -0.2; // ~>100°

// [a, vertex, b] joint triples. For index..pinky the vertex is the PIP joint;
// for the thumb it's the IP joint. "Straight" at the vertex => finger extended.
const FINGER_JOINTS: Array<[number, number, number]> = [
  [2, 3, 4],    // thumb
  [5, 6, 8],    // index
  [9, 10, 12],  // middle
  [13, 14, 16], // ring
  [17, 18, 20], // pinky
];

function angleCos(a: Landmark, vertex: Landmark, b: Landmark): number {
  const ax = a.x - vertex.x, ay = a.y - vertex.y;
  const bx = b.x - vertex.x, by = b.y - vertex.y;
  const dot = ax * bx + ay * by;
  const mag = Math.hypot(ax, ay) * Math.hypot(bx, by);
  return mag === 0 ? 0 : dot / mag;
}

function dist(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// [thumb, index, middle, ring, pinky] — true if that finger is extended.
export function fingersUp(lm: HandLandmarks): boolean[] {
  return FINGER_JOINTS.map(([a, v, b], i) => {
    const cos = angleCos(lm[a], lm[v], lm[b]);
    return cos < (i === 0 ? THUMB_STRAIGHT_COS : STRAIGHT_COS);
  });
}

// Thumb tip and index tip pressed together, relative to hand size.
export function isPinch(lm: HandLandmarks): boolean {
  const handSize = dist(lm[0], lm[9]) || 1; // wrist -> middle knuckle
  return dist(lm[4], lm[8]) < 0.45 * handSize;
}

function countFingers(lm: HandLandmarks): number {
  const f = fingersUp(lm);
  return (f[1] ? 1 : 0) + (f[2] ? 1 : 0) + (f[3] ? 1 : 0) + (f[4] ? 1 : 0);
}

export type GestureId = 'open' | 'fist' | 'peace' | 'point' | 'rock' | 'thumbsup' | 'pinch';

export interface GesturePreset {
  label: string;
  emoji: string;
  test: (lm: HandLandmarks) => boolean;
}

// Insertion order = dropdown order.
export const GESTURE_PRESETS: Record<GestureId, GesturePreset> = {
  open: { label: 'Open hand', emoji: '✋', test: lm => countFingers(lm) >= 3 },
  fist: { label: 'Fist', emoji: '✊', test: lm => countFingers(lm) === 0 && !isPinch(lm) },
  peace: { label: 'Peace', emoji: '✌️', test: lm => { const f = fingersUp(lm); return f[1] && f[2] && !f[3] && !f[4]; } },
  point: { label: 'Point', emoji: '☝️', test: lm => { const f = fingersUp(lm); return f[1] && !f[2] && !f[3] && !f[4]; } },
  rock: { label: 'Rock', emoji: '🤘', test: lm => { const f = fingersUp(lm); return f[1] && !f[2] && !f[3] && f[4]; } },
  thumbsup: { label: 'Thumbs up', emoji: '👍', test: lm => { const f = fingersUp(lm); return f[0] && !f[1] && !f[2] && !f[3] && !f[4]; } },
  pinch: { label: 'Pinch', emoji: '🤏', test: isPinch },
};

export const GESTURE_IDS = Object.keys(GESTURE_PRESETS) as GestureId[];
