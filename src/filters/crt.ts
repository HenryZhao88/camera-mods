import { ColorMatrixFilter } from 'pixi.js';
import { CRTFilter } from 'pixi-filters';
import type { FilterRig } from './index';

// Barrel-curved CRT: scanlines, animated noise, vignette, green-cyan phosphor
// tint, and a 13Hz brightness flicker.
export function buildCrtRig(): FilterRig {
  const crt = new CRTFilter({
    curvature: 2.2,
    lineWidth: 3,
    lineContrast: 0.28,
    noise: 0.12,
    noiseSize: 1,
    vignetting: 0.28,
    vignettingAlpha: 0.9,
    vignettingBlur: 0.3,
    seed: Math.random(),
  });
  const tint = new ColorMatrixFilter();
  // gentle phosphor green-cyan cast
  tint.matrix = [
    0.92, 0.02, 0.02, 0, 0,
    0.02, 1.0, 0.02, 0, 0,
    0.02, 0.06, 0.96, 0, 0,
    0, 0, 0, 1, 0,
  ];

  return {
    filters: [crt, tint],
    update(dt: number, t: number) {
      crt.time += dt * 8;            // scrolling interference
      crt.seed = Math.random();      // live noise
      const flicker = 0.985 + 0.015 * Math.sin(t * 2 * Math.PI * 13);
      tint.brightness(flicker * 0.98, false);
      // brightness() resets the matrix, so re-apply the cast on top
      const m = tint.matrix;
      m[0] *= 0.92; m[6] *= 1.0; m[12] *= 0.96;
      m[1] += 0.02; m[2] += 0.02; m[5] += 0.02; m[7] += 0.02; m[10] += 0.02; m[11] += 0.06;
    },
    destroy() { crt.destroy(); tint.destroy(); },
  };
}
