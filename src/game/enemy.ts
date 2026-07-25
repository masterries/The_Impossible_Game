import { TAU, wrap, type Vec2 } from '../engine/math';
import { TILE } from './config';
import type { EnemySpec, TilePoint } from './types';

interface Segment {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  length: number;
}

/**
 * Ein Gegner. Seine Position ist eine reine Funktion der Levelzeit
 * (`positionAt`) – es gibt keinen veränderlichen Zustand. Dadurch sieht ein
 * Level nach jedem Tod exakt gleich aus, so wie im Original.
 */
export class Enemy {
  readonly pos: Vec2 = { x: 0, y: 0 };

  private readonly mode: 'path' | 'circle';
  private readonly speed: number;
  private readonly phase: number;

  // Streckenzug
  private readonly segments: Segment[] = [];
  private readonly totalLength: number = 0;

  // Kreisbahn
  private readonly cx: number = 0;
  private readonly cy: number = 0;
  private readonly radius: number = 0;
  private readonly dir: number = 1;

  constructor(spec: EnemySpec) {
    this.speed = spec.speed * TILE;
    this.phase = spec.phase ?? 0;

    if (spec.kind === 'circle') {
      this.mode = 'circle';
      this.cx = spec.center[0] * TILE;
      this.cy = spec.center[1] * TILE;
      this.radius = spec.radius * TILE;
      this.dir = spec.dir ?? 1;
      this.totalLength = TAU * this.radius;
    } else {
      this.mode = 'path';
      const points: readonly TilePoint[] =
        spec.kind === 'linear' ? [spec.from, spec.to] : spec.points;
      const loop = spec.kind === 'linear' ? 'pingpong' : (spec.loop ?? 'pingpong');

      // Pingpong wird als geschlossener Ring modelliert: A→B→C→B→(A)
      const closed =
        loop === 'pingpong' ? [...points, ...points.slice(1, -1).reverse()] : [...points];

      let total = 0;
      for (let i = 0; i < closed.length; i++) {
        const a = closed[i]!;
        const b = closed[(i + 1) % closed.length]!;
        const ax = a[0] * TILE;
        const ay = a[1] * TILE;
        const dx = b[0] * TILE - ax;
        const dy = b[1] * TILE - ay;
        const length = Math.hypot(dx, dy);
        if (length < 1e-6) continue;
        this.segments.push({ ax, ay, dx, dy, length });
        total += length;
      }
      this.totalLength = total;
    }

    this.positionAt(0);
  }

  /** Setzt `pos` auf die Position zur Levelzeit `time` (Sekunden) und gibt sie zurück. */
  positionAt(time: number): Vec2 {
    if (this.totalLength <= 0) return this.pos;

    const travelled = wrap(this.phase * this.totalLength + time * this.speed, this.totalLength);

    if (this.mode === 'circle') {
      const angle = this.dir * (travelled / this.radius);
      this.pos.x = this.cx + Math.cos(angle) * this.radius;
      this.pos.y = this.cy + Math.sin(angle) * this.radius;
      return this.pos;
    }

    let rest = travelled;
    for (const seg of this.segments) {
      if (rest > seg.length) {
        rest -= seg.length;
        continue;
      }
      const t = rest / seg.length;
      this.pos.x = seg.ax + seg.dx * t;
      this.pos.y = seg.ay + seg.dy * t;
      return this.pos;
    }

    // Rundungsreste: auf den Endpunkt des letzten Segments setzen.
    const last = this.segments[this.segments.length - 1];
    if (last) {
      this.pos.x = last.ax + last.dx;
      this.pos.y = last.ay + last.dy;
    }
    return this.pos;
  }
}
