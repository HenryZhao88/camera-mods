import type { Container } from 'pixi.js';
import type { ScreenShake } from './fx/shake';
import type { TransientFx } from './fx/transients';
import type { FxTextures } from './fx/proceduralTextures';
import type { EffectMode } from './effects/effectDriver';

export interface Landmark { x: number; y: number; z: number; }
export type HandLandmarks = Landmark[]; // 21 points

export type Handedness = 'Left' | 'Right';

export interface HandResult {
  landmarks: HandLandmarks; // normalized image coords, 0..1, already mirrored for display
  handedness: Handedness;
}

// Custom-gesture templates. All landmark arrays are ALREADY normalized via
// normalizeLandmarks before storage — matchers never re-normalize templates.
export interface HandTemplate {
  kind: 'hand';
  effectId: string;
  landmarks: HandLandmarks;
  handedness: Handedness;
  createdAt: string;
}
export interface TwoHandTemplate {
  kind: 'two-hand';
  effectId: string;
  left: HandLandmarks;   // left-most hand ON SCREEN at record time (mirrored coords)
  right: HandLandmarks;  // right-most
  span: number;          // wrist-to-wrist distance / average hand size, at record time
  createdAt: string;
}
export interface StagedTemplate {
  kind: 'stages';
  effectId: string;
  stages: [HandLandmarks, HandLandmarks]; // [ready, fire]
  createdAt: string;
}
export type GestureTemplate = HandTemplate | TwoHandTemplate | StagedTemplate;

export interface FaceResult {
  landmarks: Landmark[]; // 478 FaceMesh points, 0..1, already mirrored for display
}

export interface RenderContext {
  width: number;
  height: number;
  hand: HandResult | null;  // primary hand (hands[0] ?? null)
  hands: HandResult[];      // all tracked hands this frame (0-2)
  face: FaceResult | null;  // primary face this frame (null unless face tracking on)
  now: number;              // ms
}

// Layers + shared services an effect mounts into, handed over once by the compositor.
export interface EffectStage {
  world: Container;     // shaken world (video + effects + overlay)
  backdrop: Container;  // behind-the-user layer (between video and effects)
  effects: Container;   // world-space effect layer (most visuals go here)
  screen: Container;    // "on the lens" — not shaken (splats, dim grade, flashes)
  fx: {
    shake: ScreenShake;
    transients: TransientFx;
    textures: FxTextures;
  };
}

export interface Effect {
  id: string;
  mode: EffectMode;
  init(stage: EffectStage): void; // mount display objects (called once by the compositor)
  start(): void;
  stop(): void;
  update(dt: number, ctx: RenderContext): void; // mutate display objects
  isActive(): boolean;             // drives the card glow in the UI
  reset?(): void;                  // hide/clear all visible state ("Clear screen")
}
