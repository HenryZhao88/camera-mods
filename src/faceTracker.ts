import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import type { FaceResult } from './types';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export class FaceTracker {
  private landmarker: FaceLandmarker | null = null;

  get ready(): boolean { return this.landmarker !== null; }

  async init(): Promise<void> {
    if (this.landmarker) return;
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate: 'GPU' },
      runningMode: 'VIDEO',
      numFaces: 1,
      minFaceDetectionConfidence: 0.6,
      minTrackingConfidence: 0.6,
    });
  }

  // Returns faces with x mirrored to match the mirrored selfie-view canvas.
  detect(video: HTMLVideoElement, now: number): FaceResult[] {
    if (!this.landmarker) throw new Error('FaceTracker not initialized');
    const res = this.landmarker.detectForVideo(video, now);
    return res.faceLandmarks.map(lm => ({
      landmarks: lm.map(p => ({ x: 1 - p.x, y: p.y, z: p.z })),
    }));
  }
}
