// Full-frame post-process "filters" applied after the video + effects are drawn.
// Canvas-native (no PixiJS dependency) so they stay fast and zero-weight.

export type ScreenFilter = 'none' | 'glitch' | 'crt';

export const SCREEN_FILTERS: Array<{ id: ScreenFilter; label: string }> = [
  { id: 'none', label: 'None' },
  { id: 'glitch', label: 'Glitch' },
  { id: 'crt', label: 'CRT / retro' },
];

// RGB-ish ghosting + random horizontal slice displacement.
export function applyGlitch(g: CanvasRenderingContext2D, buffer: HTMLCanvasElement): void {
  const w = g.canvas.width, h = g.canvas.height;
  if (buffer.width !== w) buffer.width = w;
  if (buffer.height !== h) buffer.height = h;
  const b = buffer.getContext('2d');
  if (!b) return;
  b.clearRect(0, 0, w, h);
  b.drawImage(g.canvas, 0, 0); // snapshot the current frame

  // displaced horizontal slices
  const slices = 10;
  for (let i = 0; i < slices; i++) {
    const sy = Math.random() * h;
    const sh = 2 + Math.random() * 26;
    const dx = (Math.random() - 0.5) * 70;
    g.drawImage(buffer, 0, sy, w, sh, dx, sy, w, sh);
  }

  // chromatic ghost copies
  g.save();
  g.globalCompositeOperation = 'screen';
  g.globalAlpha = 0.4;
  g.drawImage(buffer, -8, 0);
  g.drawImage(buffer, 8, 0);
  g.restore();
}

let scanTile: HTMLCanvasElement | null = null;
function scanlines(g: CanvasRenderingContext2D): CanvasPattern | null {
  if (!scanTile) {
    scanTile = document.createElement('canvas');
    scanTile.width = 1; scanTile.height = 3;
    const c = scanTile.getContext('2d');
    if (c) { c.fillStyle = 'rgba(0,0,0,0.30)'; c.fillRect(0, 2, 1, 1); }
  }
  return g.createPattern(scanTile, 'repeat');
}

// Scanlines + vignette for a CRT / retro look.
export function applyCrt(g: CanvasRenderingContext2D): void {
  const w = g.canvas.width, h = g.canvas.height;

  const pat = scanlines(g);
  if (pat) {
    g.save();
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = pat;
    g.fillRect(0, 0, w, h);
    g.restore();
  }

  g.save();
  g.globalCompositeOperation = 'multiply';
  const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.32, w / 2, h / 2, Math.max(w, h) * 0.62);
  grad.addColorStop(0, 'rgb(255,255,255)');
  grad.addColorStop(1, 'rgb(70,70,82)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  g.restore();
}
