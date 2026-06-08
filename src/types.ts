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
