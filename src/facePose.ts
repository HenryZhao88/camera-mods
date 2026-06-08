import type { Landmark } from './types';

// MediaPipe FaceMesh landmark indices we use.
const UPPER_LIP = 13;   // upper inner lip
const LOWER_LIP = 14;   // lower inner lip
const NOSE_TIP = 1;
const FOREHEAD = 10;    // top of face
const CHIN = 152;       // bottom of face

// Eye landmark rings (outer corner, inner corner, top, bottom).
const LEFT_EYE = [33, 133, 159, 145];
const RIGHT_EYE = [362, 263, 386, 374];

// Mouth-open ratios (gap / face height) mapped to a 0..1 breath intensity.
const OPEN_MIN = 0.06;  // below this: mouth effectively closed
const OPEN_MAX = 0.22;  // at/above this: wide open, full intensity

function dist(a: Landmark, b: Landmark): number {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

// 0 = closed, 1 = wide open. Normalized by face height so it is distance- and
// scale-invariant.
export function mouthOpenness(landmarks: Landmark[]): number {
  const faceH = dist(landmarks[FOREHEAD], landmarks[CHIN]);
  if (faceH === 0) return 0;
  const ratio = dist(landmarks[UPPER_LIP], landmarks[LOWER_LIP]) / faceH;
  return clamp01((ratio - OPEN_MIN) / (OPEN_MAX - OPEN_MIN));
}

export function mouthCenter(landmarks: Landmark[]): Landmark {
  const a = landmarks[UPPER_LIP], b = landmarks[LOWER_LIP];
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: 0 };
}

function centroid(landmarks: Landmark[], idxs: number[]): Landmark {
  let x = 0, y = 0;
  for (const i of idxs) { x += landmarks[i].x; y += landmarks[i].y; }
  return { x: x / idxs.length, y: y / idxs.length, z: 0 };
}

export function leftEyeCenter(landmarks: Landmark[]): Landmark { return centroid(landmarks, LEFT_EYE); }
export function rightEyeCenter(landmarks: Landmark[]): Landmark { return centroid(landmarks, RIGHT_EYE); }

// Unit vector pointing out of the mouth, following head tilt (nose -> mouth).
export function breathDirection(landmarks: Landmark[]): { x: number; y: number } {
  const m = mouthCenter(landmarks);
  const nose = landmarks[NOSE_TIP];
  const dx = m.x - nose.x, dy = m.y - nose.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { x: dx / len, y: dy / len };
}
