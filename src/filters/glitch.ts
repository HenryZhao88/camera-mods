import { GlitchFilter, RGBSplitFilter } from 'pixi-filters';
import type { FilterRig } from './index';

// Quiet/burst rhythm: mostly-clean signal with violent 0.12-0.35s glitch bursts
// every 0.9-2.2s, plus a constant subliminal RGB fringe.
export function buildGlitchRig(): FilterRig {
  const glitch = new GlitchFilter({ slices: 12, offset: 0, red: { x: 0, y: 0 }, blue: { x: 0, y: 0 }, green: { x: 0, y: 0 } });
  const rgb = new RGBSplitFilter({ red: { x: 1, y: 0 }, green: { x: -1, y: 0 }, blue: { x: 0, y: 1 } });

  let burstLeft = 0;
  let nextBurst = 0.6 + Math.random();

  return {
    filters: [glitch, rgb],
    update(dt: number) {
      nextBurst -= dt;
      if (nextBurst <= 0) {
        burstLeft = 0.12 + Math.random() * 0.23;
        nextBurst = 0.9 + Math.random() * 1.3;
        glitch.refresh(); // re-randomize slice layout per burst
      }
      if (burstLeft > 0) {
        burstLeft -= dt;
        glitch.offset = 18 + Math.random() * 42;
        const a = Math.random() * Math.PI * 2, m = 2 + Math.random() * 4;
        rgb.red = { x: Math.cos(a) * m, y: Math.sin(a) * m };
        rgb.blue = { x: -Math.cos(a) * m, y: -Math.sin(a) * m };
        if (Math.random() < 0.2) glitch.refresh(); // mid-burst jump
      } else {
        glitch.offset = 0;
        rgb.red = { x: 1, y: 0 };
        rgb.blue = { x: -1, y: 0 };
      }
    },
    destroy() { glitch.destroy(); rgb.destroy(); },
  };
}
