import { normalizeLandmarks } from './normalize';
import { landmarkDistance } from './distance';
import type { GestureTemplate, HandLandmarks } from '../types';

export interface GestureEngineResult {
  fired: string[];
  active: Set<string>;
  scores: Record<string, number>;
}

export interface GestureEngineOptions {
  defaultThreshold?: number; // max distance counted as a match (default 0.6)
  cooldownMs?: number;       // min ms between fires per effect (default 800)
}

export class GestureEngine {
  private templates: GestureTemplate[];
  private defaultThreshold: number;
  private cooldownMs: number;
  private thresholds = new Map<string, number>();
  private lastFired = new Map<string, number>();

  constructor(templates: GestureTemplate[], opts: GestureEngineOptions = {}) {
    this.templates = templates;
    this.defaultThreshold = opts.defaultThreshold ?? 0.6;
    this.cooldownMs = opts.cooldownMs ?? 800;
  }

  setTemplates(t: GestureTemplate[]): void { this.templates = t; }
  setThreshold(effectId: string, value: number): void { this.thresholds.set(effectId, value); }
  private thresholdFor(id: string): number {
    return this.thresholds.get(id) ?? this.defaultThreshold;
  }

  update(live: HandLandmarks | null, now: number): GestureEngineResult {
    const fired: string[] = [];
    const active = new Set<string>();
    const scores: Record<string, number> = {};
    if (!live) return { fired, active, scores };

    const norm = normalizeLandmarks(live);
    for (const t of this.templates) {
      const d = landmarkDistance(norm, t.landmarks);
      scores[t.effectId] = d;
      if (d <= this.thresholdFor(t.effectId)) {
        active.add(t.effectId);
        const last = this.lastFired.get(t.effectId) ?? -Infinity;
        if (now - last >= this.cooldownMs) {
          fired.push(t.effectId);
          this.lastFired.set(t.effectId, now);
        }
      }
    }
    return { fired, active, scores };
  }
}
