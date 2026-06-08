export interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string;
}

export class ParticleSystem {
  particles: Particle[] = [];

  spawn(p: Particle): void { this.particles.push({ ...p }); }

  update(dt: number): void {
    for (const p of this.particles) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
    }
    this.particles = this.particles.filter(p => p.life > 0);
  }

  render(g: CanvasRenderingContext2D): void {
    for (const p of this.particles) {
      g.globalAlpha = Math.max(0, p.life / p.maxLife);
      g.fillStyle = p.color;
      g.beginPath();
      g.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
  }

  clear(): void { this.particles.length = 0; }

  get count(): number { return this.particles.length; }
}
