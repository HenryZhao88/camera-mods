import { ImageSegmenter, FilesetResolver } from '@mediapipe/tasks-vision';
import { Texture } from 'pixi.js';
import type { Camera } from './camera';

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite';

const MASK_SIZE = 256;

// Person segmentation for behind-the-user compositing. Owned by whichever
// effect needs it; runs only between ensureStarted() and stop(). The mask is
// exposed as a live pixi Texture over an offscreen canvas (white where the
// person is, transparent elsewhere) — usable directly as a sprite mask.
export class PersonSegmenter {
  private segmenter: ImageSegmenter | null = null;
  private initPromise: Promise<void> | null = null;
  private failed = false;
  private running = false;
  private canvas: HTMLCanvasElement | null = null;
  private cctx: CanvasRenderingContext2D | null = null;
  private image: ImageData | null = null;
  private texture: Texture | null = null;
  private lastTs = -1;

  constructor(private camera: Camera) {}

  get ready(): boolean { return this.segmenter !== null; }
  get maskTexture(): Texture | null { return this.running ? this.texture : null; }

  // Lazily load the model and begin segmenting (idempotent; safe to spam).
  ensureStarted(): void {
    this.running = true;
    if (this.segmenter || this.failed || this.initPromise) return;
    this.initPromise = this.init().catch(err => {
      console.warn('PersonSegmenter: model failed to load — shrine occlusion disabled', err);
      this.failed = true;
    });
  }

  stop(): void { this.running = false; }

  private async init(): Promise<void> {
    const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);
    try {
      this.segmenter = await this.create(fileset, 'GPU');
    } catch (err) {
      console.warn('PersonSegmenter: GPU delegate failed, falling back to CPU', err);
      this.segmenter = await this.create(fileset, 'CPU');
    }

    this.canvas = document.createElement('canvas');
    this.canvas.width = MASK_SIZE;
    this.canvas.height = MASK_SIZE;
    this.cctx = this.canvas.getContext('2d');
    this.image = new ImageData(MASK_SIZE, MASK_SIZE);
    this.texture = Texture.from(this.canvas);
  }

  private create(fileset: Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>, delegate: 'GPU' | 'CPU'): Promise<ImageSegmenter> {
    return ImageSegmenter.createFromOptions(fileset, {
      baseOptions: { modelAssetPath: MODEL_URL, delegate },
      runningMode: 'VIDEO',
      outputConfidenceMasks: true,
      outputCategoryMask: false,
    });
  }

  // Call once per rendered frame while running; refreshes maskTexture.
  update(now: number): void {
    if (!this.running || !this.segmenter || !this.cctx || !this.image || !this.texture) return;
    if (now <= this.lastTs) return; // MediaPipe requires monotonic timestamps
    this.lastTs = now;

    const result = this.segmenter.segmentForVideo(this.camera.video, now);
    const mask = result.confidenceMasks?.[0];
    if (mask) {
      const data = mask.getAsFloat32Array();
      // The mask comes at the model's resolution; sample it into our 256² canvas.
      const mw = mask.width, mh = mask.height;
      const px = this.image.data;
      for (let y = 0; y < MASK_SIZE; y++) {
        const sy = Math.floor((y / MASK_SIZE) * mh);
        for (let x = 0; x < MASK_SIZE; x++) {
          const sx = Math.floor((x / MASK_SIZE) * mw);
          const conf = data[sy * mw + sx];
          const i = (y * MASK_SIZE + x) * 4;
          px[i] = 255; px[i + 1] = 255; px[i + 2] = 255;
          px[i + 3] = conf > 0.5 ? 255 : 0;
        }
      }
      this.cctx.putImageData(this.image, 0, 0);
      this.texture.source.update();
    }
    result.close();
  }
}
