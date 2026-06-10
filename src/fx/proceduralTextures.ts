import { Texture } from 'pixi.js';

function canvasOf(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const c = cv.getContext('2d');
  if (c) draw(c);
  return cv;
}

// 32x32 soft white disc — tinted per particle, scaled so sprite radius == particle size.
export function glowTexture(): Texture {
  return Texture.from(canvasOf(32, 32, c => {
    const g = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.fillRect(0, 0, 32, 32);
  }));
}

// 64x16 horizontal capsule with soft ends — for velocity-stretched streaks/tracers.
export function streakTexture(): Texture {
  return Texture.from(canvasOf(64, 16, c => {
    const g = c.createLinearGradient(0, 0, 64, 0);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.25, 'rgba(255,255,255,0.9)');
    g.addColorStop(0.75, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g;
    c.filter = 'blur(2px)';
    c.fillRect(0, 4, 64, 8);
  }));
}

// 512x512: transparent center -> opaque black edges (cinematic dim vignette).
export function vignetteTexture(): Texture {
  return Texture.from(canvasOf(512, 512, c => {
    const g = c.createRadialGradient(256, 256, 100, 256, 256, 360);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g;
    c.fillRect(0, 0, 512, 512);
  }));
}

// 512x512 disc filled with a hexagon grid, clipped to a circle (energy shield).
export function shieldHexTexture(): Texture {
  return Texture.from(canvasOf(512, 512, c => {
    const R = 250, cx = 256, cy = 256, s = 26;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.clip();
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.lineWidth = 1.6;
    const h = Math.sqrt(3) * s;
    for (let row = -12; row <= 12; row++) {
      for (let col = -12; col <= 12; col++) {
        const x = cx + col * 1.5 * s;
        const y = cy + row * h + (col % 2 ? h / 2 : 0);
        c.beginPath();
        for (let i = 0; i < 6; i++) {
          const a = (Math.PI / 3) * i;
          const px = x + s * Math.cos(a), py = y + s * Math.sin(a);
          i === 0 ? c.moveTo(px, py) : c.lineTo(px, py);
        }
        c.closePath();
        c.stroke();
      }
    }
  }));
}

export interface FxTextures {
  glow: Texture;
  streak: Texture;
  vignette: Texture;
  shieldHex: Texture;
  webs: Texture[]; // filled by Task 12 (webTexture); empty until then
}

export function buildFxTextures(): FxTextures {
  return {
    glow: glowTexture(),
    streak: streakTexture(),
    vignette: vignetteTexture(),
    shieldHex: shieldHexTexture(),
    webs: [],
  };
}
