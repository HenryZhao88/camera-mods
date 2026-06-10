import type { Camera } from './camera';
import type { HandTracker } from './handTracker';
import { normalizeLandmarks } from './gesture/normalize';
import { saveTemplate } from './gesture/templateStore';
import type { GestureTemplate, HandLandmarks, Handedness } from './types';

const CAPTURE_FRAMES = 10;

// Averages CAPTURE_FRAMES of normalized landmarks into one stable template.
export async function calibrate(
  effectId: string,
  camera: Camera,
  tracker: HandTracker,
): Promise<GestureTemplate> {
  const frames: HandLandmarks[] = [];
  let handedness: Handedness = 'Right';

  const MAX_ATTEMPTS = 180; // ~3s at 60fps
  let attempts = 0;
  while (frames.length < CAPTURE_FRAMES) {
    if (attempts++ >= MAX_ATTEMPTS) {
      throw new Error('No hand detected — try again');
    }
    await new Promise(r => requestAnimationFrame(r));
    const hands = tracker.detect(camera.video, performance.now());
    if (hands[0]) {
      frames.push(normalizeLandmarks(hands[0].landmarks));
      handedness = hands[0].handedness;
    }
  }

  const avg: HandLandmarks = Array.from({ length: 21 }, (_, i) => {
    let x = 0, y = 0;
    for (const f of frames) { x += f[i].x; y += f[i].y; }
    return { x: x / frames.length, y: y / frames.length, z: 0 };
  });

  const template: GestureTemplate = {
    kind: 'hand',
    effectId, landmarks: avg, handedness, createdAt: new Date().toISOString(),
  };
  saveTemplate(template);
  return template;
}

export function countdown(seconds: number, onTick: (n: number) => void): Promise<void> {
  return new Promise(resolve => {
    let n = seconds;
    onTick(n);
    const id = setInterval(() => {
      n -= 1;
      onTick(n);
      if (n <= 0) { clearInterval(id); resolve(); }
    }, 1000);
  });
}
