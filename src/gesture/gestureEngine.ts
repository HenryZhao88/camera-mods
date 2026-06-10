import type { HandLandmarks } from '../types';

// A binding ties an effect to a predicate over the live hand landmarks.
// Presets and custom-recorded gestures both reduce to a `test` function.
export interface GestureBinding {
  effectId: string;
  test: (landmarks: HandLandmarks) => boolean;
}

export interface GestureEngineResult {
  fired: string[];        // effects whose gesture matched AND passed cooldown this frame
  active: Set<string>;    // effects whose gesture currently matches
}

export interface GestureEngineOptions {
  cooldownMs?: number; // min ms between fires per effect (default 800)
  exclusive?: boolean; // only the first matching binding wins (one effect at a time)
}

export class GestureEngine {
  private bindings: GestureBinding[];
  private cooldownMs: number;
  private exclusive: boolean;
  private lastFired = new Map<string, number>();

  constructor(bindings: GestureBinding[] = [], opts: GestureEngineOptions = {}) {
    this.bindings = bindings;
    this.cooldownMs = opts.cooldownMs ?? 800;
    this.exclusive = opts.exclusive ?? false;
  }

  setBindings(bindings: GestureBinding[]): void { this.bindings = bindings; }

  // Accepts one hand, several hands, or null. A binding matches if ANY hand passes.
  update(live: HandLandmarks | HandLandmarks[] | null, now: number): GestureEngineResult {
    const fired: string[] = [];
    const active = new Set<string>();
    // Normalize to HandLandmarks[]. live[0] is a Landmark object for a single
    // hand and an array for a list of hands; an empty list has live[0] === undefined,
    // so it needs its own arm (Array.isArray(undefined) is false and would mis-wrap it).
    const hands: HandLandmarks[] =
      live == null ? []
      : Array.isArray(live[0]) ? (live as HandLandmarks[])
      : (live as HandLandmarks).length === 0 ? []
      : [live as HandLandmarks];
    if (hands.length === 0) return { fired, active };

    // In exclusive mode the bindings array order is the priority: the first
    // binding whose pose matches wins, so an ambiguous pose only triggers one effect.
    for (const b of this.bindings) {
      if (!hands.some(h => b.test(h))) continue;
      active.add(b.effectId);
      const last = this.lastFired.get(b.effectId) ?? -Infinity;
      if (now - last >= this.cooldownMs) {
        fired.push(b.effectId);
        this.lastFired.set(b.effectId, now);
      }
      if (this.exclusive) break;
    }
    return { fired, active };
  }
}
