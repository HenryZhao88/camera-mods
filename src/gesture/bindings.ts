import { normalizeLandmarks } from './normalize';
import { landmarkDistance } from './distance';
import { GESTURE_PRESETS, type GestureId } from './handGestures';
import type { GestureBinding } from './gestureEngine';
import type { HandLandmarks } from '../types';

// Bind an effect to a built-in preset pose.
export function presetBinding(effectId: string, preset: GestureId): GestureBinding {
  return { effectId, test: GESTURE_PRESETS[preset].test };
}

// Bind an effect to a custom-recorded gesture: matches when the live hand is
// close enough to the stored (already-normalized) template. `getThreshold`
// is read live so the sensitivity slider takes effect immediately.
export function customBinding(
  effectId: string,
  templateLandmarks: HandLandmarks,
  getThreshold: () => number,
): GestureBinding {
  return {
    effectId,
    test: (live) => landmarkDistance(normalizeLandmarks(live), templateLandmarks) <= getThreshold(),
  };
}
