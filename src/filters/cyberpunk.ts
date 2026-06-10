import { ColorMatrixFilter } from 'pixi.js';
import { AdvancedBloomFilter, CRTFilter, RGBSplitFilter } from 'pixi-filters';
import type { FilterRig } from './index';

// Neon split-tone: shadows pushed blue-purple, highlights pink/cyan, real bloom
// on the highlights, a fixed 1.5px chromatic fringe, faint scanline shimmer.
export function buildCyberpunkRig(): FilterRig {
  const grade = new ColorMatrixFilter();
  grade.matrix = [
    1.08, -0.05, 0.10, 0, -0.02,  // R: lift highs toward pink
    -0.06, 0.95, 0.12, 0, 0.00,   // G: slightly suppressed
    0.10, 0.05, 1.18, 0, 0.05,    // B: lifted (shadows go blue-purple)
    0, 0, 0, 1, 0,
  ];
  const bloom = new AdvancedBloomFilter({
    threshold: 0.45, bloomScale: 0.9, brightness: 1.0, blur: 6, quality: 4,
  });
  const fringe = new RGBSplitFilter({ red: { x: 1.5, y: 0 }, green: { x: 0, y: 0 }, blue: { x: -1.5, y: 0 } });
  const scan = new CRTFilter({
    curvature: 0, lineWidth: 2, lineContrast: 0.06, noise: 0.03, noiseSize: 1,
    vignetting: 0.22, vignettingAlpha: 0.7, vignettingBlur: 0.4,
  });

  return {
    filters: [grade, bloom, fringe, scan],
    update(dt: number) {
      scan.time += dt * 4; // slow scanline shimmer
      scan.seed = Math.random();
    },
    destroy() { grade.destroy(); bloom.destroy(); fringe.destroy(); scan.destroy(); },
  };
}
