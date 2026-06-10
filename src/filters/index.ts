import type { Filter } from 'pixi.js';

export type ScreenFilter = 'none' | 'glitch' | 'crt' | 'cyberpunk';

export const SCREEN_FILTERS: Array<{ id: ScreenFilter; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'crt', label: 'CRT / retro' },
  { id: 'cyberpunk', label: 'Cyberpunk' },
];

// A rig is a set of live shader filters plus a per-frame animator for their uniforms.
export interface FilterRig {
  filters: Filter[];
  update(dt: number, t: number): void; // t = seconds since rig was applied
  destroy(): void;
}

import { buildGlitchRig } from './glitch';
import { buildCrtRig } from './crt';
import { buildCyberpunkRig } from './cyberpunk';

export function buildFilterRig(id: ScreenFilter): FilterRig | null {
  switch (id) {
    case 'glitch': return buildGlitchRig();
    case 'crt': return buildCrtRig();
    case 'cyberpunk': return buildCyberpunkRig();
    default: return null;
  }
}
