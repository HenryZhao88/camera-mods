import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { HandResult, Handedness } from './types';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

export class HandTracker {
  private landmarker: HandLandmarker | null = null;

  async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await HandLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numHands: 1,
    });
  }

  // Returns hands with x mirrored to match a mirrored selfie-view canvas.
  detect(video: HTMLVideoElement, now: number): HandResult[] {
    if (!this.landmarker) throw new Error('HandTracker not initialized');
    const res = this.landmarker.detectForVideo(video, now);
    const out: HandResult[] = [];
    for (let i = 0; i < res.landmarks.length; i++) {
      const lm = res.landmarks[i];
      const handed = (res.handednesses?.[i]?.[0]?.categoryName ?? 'Right') as Handedness;
      out.push({
        landmarks: lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z })),
        // mirrored view also flips reported handedness
        handedness: handed === 'Left' ? 'Right' : 'Left',
      });
    }
    return out;
  }
}
