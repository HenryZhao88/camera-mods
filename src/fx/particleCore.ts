// Pure particle physics — no pixi imports, fully unit-testable.
export interface ParticleState {
  x: number; y: number; vx: number; vy: number;
  ax: number; ay: number;   // acceleration px/s^2 (gravity, buoyancy)
  drag: number;             // fraction of velocity removed per second
  life: number; maxLife: number;
  size: number;             // radius px
  grow: number;             // size multiplier rate per second (0 = constant)
  spin: number;             // rad/s
  rotation: number;
  tint: number;             // 0xRRGGBB
  alpha: number;            // alpha at birth
  streak: boolean;          // render stretched along velocity
  additive: boolean;        // 'add' blend vs 'normal' (smoke)
}

// Advances one particle; returns false when it has expired.
export function stepParticle(p: ParticleState, dt: number): boolean {
  p.vx += p.ax * dt;
  p.vy += p.ay * dt;
  const damp = Math.max(0, 1 - p.drag * dt);
  p.vx *= damp;
  p.vy *= damp;
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  p.size *= 1 + p.grow * dt;
  p.rotation += p.spin * dt;
  p.life -= dt;
  return p.life > 0;
}

export function particleAlpha(p: ParticleState): number {
  return Math.max(0, p.life / p.maxLife) * p.alpha;
}
