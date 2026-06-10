import { normalizeLandmarks } from './normalize';
import { landmarkDistance } from './distance';
import type { HandLandmarks, HandResult, StagedTemplate, TwoHandTemplate } from '../types';

const SPAN_MIN = 0.5; // x recorded span
const SPAN_MAX = 2.0;
const COOLDOWN_MS = 350; // matches GunCore

function handSize(lm: HandLandmarks): number {
  return Math.hypot(lm[0].x - lm[9].x, lm[0].y - lm[9].y) || 1e-6;
}

// Two-hand pose match (Kamehameha custom charge). Hands are assigned to the
// template's left/right slots by wrist x on screen, never by handedness label.
export function matchTwoHand(hands: HandResult[], t: TwoHandTemplate, threshold: number): boolean {
  if (hands.length < 2) return false;
  const sorted = [...hands].sort((a, b) => a.landmarks[0].x - b.landmarks[0].x);
  const left = sorted[0].landmarks, right = sorted[sorted.length - 1].landmarks;

  const dist = Math.hypot(left[0].x - right[0].x, left[0].y - right[0].y);
  const span = dist / ((handSize(left) + handSize(right)) / 2);
  if (span < t.span * SPAN_MIN || span > t.span * SPAN_MAX) return false;

  return landmarkDistance(normalizeLandmarks(left), t.left) <= threshold
    && landmarkDistance(normalizeLandmarks(right), t.right) <= threshold;
}

// Two-stage ready->fire trigger (custom finger gun). Same semantics as GunCore:
// ready arms, fire while armed shoots (350ms cooldown; a blocked fire stays
// armed), matching neither stage — or losing the hand — disarms.
// Ambiguity rule: the machine reads the stage it is waiting for first.
export class StagedTrigger {
  private armed = false;
  private lastShot = -Infinity;

  constructor(private t: StagedTemplate, private getThreshold: () => number) {}

  step(landmarks: HandLandmarks | null, nowMs: number): boolean {
    if (!landmarks) { this.armed = false; return false; }
    const n = normalizeLandmarks(landmarks);
    const thr = this.getThreshold();
    const readyMatch = landmarkDistance(n, this.t.stages[0]) <= thr;
    const fireMatch = landmarkDistance(n, this.t.stages[1]) <= thr;

    if (!this.armed) {
      if (readyMatch) this.armed = true; // ready wins while disarmed
      return false;
    }
    if (fireMatch) { // fire wins while armed
      if (nowMs - this.lastShot >= COOLDOWN_MS) {
        this.lastShot = nowMs;
        this.armed = false;
        return true;
      }
      return false; // blocked: stay armed
    }
    if (!readyMatch) this.armed = false;
    return false;
  }

  reset(): void { this.armed = false; }
}
