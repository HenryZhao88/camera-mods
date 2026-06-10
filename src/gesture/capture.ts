import { normalizeLandmarks } from './normalize';
import type { HandLandmarks, HandResult } from '../types';

export interface StageCapture {
  hands: HandLandmarks[]; // [one] or [leftMost, rightMost], normalized + averaged
  span?: number;          // two-hand only: wrist distance / avg hand size
}

function handSize(lm: HandLandmarks): number {
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1e-6;
}

// Accumulates valid frames for one wizard stage and averages them into a
// stable capture. Two-hand frames are split by wrist x (screen position),
// not handedness labels — MediaPipe mislabels mirrored/occluded hands.
export class CaptureAccumulator {
  private frames = 0;
  private sums: HandLandmarks[] = [];
  private spanSum = 0;

  constructor(private handsNeeded: 1 | 2) {}

  get count(): number { return this.frames; }

  add(hands: HandResult[]): boolean {
    if (hands.length < this.handsNeeded) return false;

    let picked: HandLandmarks[];
    if (this.handsNeeded === 1) {
      picked = [hands[0].landmarks];
    } else {
      const sorted = [...hands].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
      const left = sorted[0].landmarks, right = sorted[sorted.length - 1].landmarks;
      picked = [left, right];
      const dist = Math.hypot(left[0].x - right[0].x, left[0].y - right[0].y);
      const avg = (handSize(left) + handSize(right)) / 2;
      this.spanSum += dist / avg;
    }

    picked.forEach((lm, h) => {
      const n = normalizeLandmarks(lm);
      if (!this.sums[h]) this.sums[h] = n.map(p => ({ ...p }));
      else for (let i = 0; i < n.length; i++) { this.sums[h][i].x += n[i].x; this.sums[h][i].y += n[i].y; }
    });
    this.frames++;
    return true;
  }

  finish(): StageCapture {
    if (this.frames === 0) throw new Error('no frames captured');
    const hands = this.sums.map(sum =>
      sum.map(p => ({ x: p.x / this.frames, y: p.y / this.frames, z: 0 })),
    );
    return this.handsNeeded === 2
      ? { hands, span: this.spanSum / this.frames }
      : { hands };
  }
}
