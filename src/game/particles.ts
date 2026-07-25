import { TAU } from '../engine/math';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
}

/** Very small particle pool for death and coin effects. */
export class Particles {
  private readonly items: Particle[] = [];

  burst(x: number, y: number, color: string, count: number, speed: number, size = 6): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * TAU + Math.random() * 0.5;
      const power = speed * (0.45 + Math.random() * 0.75);
      const life = 0.35 + Math.random() * 0.4;
      this.items.push({
        x,
        y,
        vx: Math.cos(angle) * power,
        vy: Math.sin(angle) * power,
        size: size * (0.6 + Math.random() * 0.7),
        life,
        maxLife: life,
        color,
      });
    }
  }

  update(dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i]!;
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.8 * dt;
      p.vy *= 1 - 1.8 * dt;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const t = p.life / p.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + t * 0.6);
      ctx.fillRect(p.x - s / 2, p.y - s / 2, s, s);
    }
    ctx.globalAlpha = 1;
  }

  clear(): void {
    this.items.length = 0;
  }
}
