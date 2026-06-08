import type { EffectMode } from './effects/effectDriver';

export interface Landmark { x: number; y: number; z: number; }
export type HandLandmarks = Landmark[]; // 21 points

export type Handedness = 'Left' | 'Right';

export interface HandResult {
  landmarks: HandLandmarks; // normalized image coords, 0..1, already mirrored for display
  handedness: Handedness;
}

export interface GestureTemplate {
  effectId: string;
  landmarks: HandLandmarks; // normalized via normalizeLandmarks
  handedness: Handedness;
  createdAt: string;
}

export interface FaceResult {
  landmarks: Landmark[]; // 478 FaceMesh points, 0..1, already mirrored for display
}

export interface RenderContext {
  width: number;
  height: number;
  hand: HandResult | null; // primary hand this frame
  face: FaceResult | null; // primary face this frame (null unless face tracking on)
  now: number;             // ms
}

export interface Effect {
  id: string;
  mode: EffectMode;
  start(): void;
  stop(): void;
  update(dt: number, ctx: RenderContext): void;
  render(g: CanvasRenderingContext2D, ctx: RenderContext): void;
  isActive(): boolean;
}
