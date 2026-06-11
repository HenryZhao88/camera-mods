import { Texture } from 'pixi.js';
import { genWeb } from './webGeometry';
import { genInkBlot } from './inkBlot';

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

// 1024² spider web drawn from pure geometry; line width tapers outward.
export function webTexture(seed: number): Texture {
  const SIZE = 1024, C = SIZE / 2, R = SIZE * 0.48;
  return Texture.from(canvasOf(SIZE, SIZE, c => {
    const web = genWeb(seed);
    c.strokeStyle = 'rgba(255,255,255,0.6)';
    c.shadowColor = 'rgba(255,255,255,0.35)';
    c.shadowBlur = 4;
    for (const s of web.spokes) {
      c.lineWidth = 3.2;
      c.beginPath();
      c.moveTo(C + s.x1 * R, C + s.y1 * R);
      c.lineTo(C + s.x2 * R, C + s.y2 * R);
      c.stroke();
    }
    for (const ring of web.rings) {
      c.lineWidth = Math.max(1, 3 - ring.r * 2.2); // taper outward
      for (const seg of ring.segments) {
        c.beginPath();
        c.moveTo(C + seg.ax * R, C + seg.ay * R);
        c.quadraticCurveTo(C + seg.cx * R, C + seg.cy * R, C + seg.bx * R, C + seg.by * R);
        c.stroke();
      }
    }
  }));
}

// 512² white ink blot with a softly blurred edge — used as an alpha mask sprite.
export function inkBlotTexture(seed: number): Texture {
  const SIZE = 512, C = SIZE / 2, R = SIZE * 0.48;
  return Texture.from(canvasOf(SIZE, SIZE, c => {
    const pts = genInkBlot(seed);
    c.fillStyle = '#ffffff';
    c.filter = 'blur(2px)';
    c.beginPath();
    c.moveTo(C + pts[0].x * R, C + pts[0].y * R);
    for (let i = 1; i < pts.length; i++) c.lineTo(C + pts[i].x * R, C + pts[i].y * R);
    c.closePath();
    c.fill();
  }));
}

// 1024² horned-shrine silhouette: stepped plinth, columns, two-tier pagoda roof
// with upswept eaves, horn curves — black fill with a crimson rim glow.
export function shrineTexture(): Texture {
  const W = 1024, H = 1024;
  return Texture.from(canvasOf(W, H, c => {
    c.fillStyle = '#000000';
    c.shadowColor = '#b3122a';
    c.shadowBlur = 6;
    c.shadowOffsetY = -2;

    // stepped plinth (three slabs)
    c.fillRect(112, 880, 800, 60);
    c.fillRect(162, 820, 700, 64);
    c.fillRect(212, 760, 600, 64);

    // four columns
    for (const x of [262, 412, 562, 712]) c.fillRect(x, 560, 50, 204);

    // lower roof: wide slab with upswept eaves (quadratic curves)
    c.beginPath();
    c.moveTo(132, 560);
    c.quadraticCurveTo(212, 540, 512, 528);
    c.quadraticCurveTo(812, 540, 892, 560);
    c.quadraticCurveTo(862, 496, 512, 484);
    c.quadraticCurveTo(162, 496, 132, 560);
    c.closePath();
    c.fill();

    // upper structure
    c.fillRect(352, 376, 320, 108);

    // upper roof, steeper sweep
    c.beginPath();
    c.moveTo(282, 376);
    c.quadraticCurveTo(372, 352, 512, 344);
    c.quadraticCurveTo(652, 352, 742, 376);
    c.quadraticCurveTo(692, 296, 512, 288);
    c.quadraticCurveTo(332, 296, 282, 376);
    c.closePath();
    c.fill();

    // horns rising from the upper roof corners (thick curved strokes)
    c.strokeStyle = '#000000';
    c.lineWidth = 26;
    c.lineCap = 'round';
    c.beginPath();
    c.moveTo(352, 312);
    c.quadraticCurveTo(282, 200, 318, 96);
    c.stroke();
    c.beginPath();
    c.moveTo(672, 312);
    c.quadraticCurveTo(742, 200, 706, 96);
    c.stroke();
  }));
}

export interface FxTextures {
  glow: Texture;
  streak: Texture;
  vignette: Texture;
  shieldHex: Texture;
  webs: Texture[]; // filled by Task 12 (webTexture); empty until then
  inkBlots: Texture[];
  shrine: Texture;
}

export function buildFxTextures(): FxTextures {
  return {
    glow: glowTexture(),
    streak: streakTexture(),
    vignette: vignetteTexture(),
    shieldHex: shieldHexTexture(),
    webs: [webTexture(0.17), webTexture(0.52), webTexture(0.83)],
    inkBlots: [inkBlotTexture(0.21), inkBlotTexture(0.55), inkBlotTexture(0.88)],
    shrine: shrineTexture(),
  };
}
