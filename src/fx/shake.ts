// Decaying camera shake. Pure math — the compositor applies offset() to world.position.
const DECAY_RATE = 7;   // 1/s exponential decay
const MAX_MAG = 40;     // px
const FLOOR = 0.05;     // snap to zero below this

export class ScreenShake {
  private mag = 0;

  kick(strength: number): void {
    this.mag = Math.min(MAX_MAG, this.mag + strength);
  }

  update(dt: number): void {
    this.mag *= Math.exp(-DECAY_RATE * dt);
    if (this.mag < FLOOR) this.mag = 0;
  }

  // rng injectable for tests
  offset(rng: () => number = Math.random): { x: number; y: number } {
    if (this.mag === 0) return { x: 0, y: 0 };
    const a = rng() * Math.PI * 2;
    const r = this.mag * rng();
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  get magnitude(): number { return this.mag; }
}
