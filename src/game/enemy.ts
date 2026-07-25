import { TAU, wrap, type Vec2 } from '../engine/math';
import { BULLET_RADIUS, CHASER_RADIUS, ENEMY_RADIUS, TILE } from './config';
import type { EnemySpec, TilePoint } from './types';

export type HazardKind = 'ball' | 'pulse' | 'bullet' | 'chaser';

/** One deadly circle for this frame. Enemies emit between zero and many. */
export interface Hazard {
  x: number;
  y: number;
  r: number;
  kind: HazardKind;
  /** 0 to 1, used by the renderer for pulsing and aiming. */
  t: number;
}

export interface EnemyContext {
  time: number;
  dt: number;
  playerX: number;
  playerY: number;
}

export abstract class Enemy {
  /** Appends this enemy's hazards for the current frame. */
  abstract emit(ctx: EnemyContext, out: Hazard[]): void;
  /** Called when the level restarts. Only stateful enemies need it. */
  reset(): void {}
}

export function createEnemy(spec: EnemySpec): Enemy {
  switch (spec.kind) {
    case 'pulse':
      return new PulseEnemy(spec);
    case 'turret':
      return new TurretEnemy(spec);
    case 'chaser':
      return new ChaserEnemy(spec);
    default:
      return new MoverEnemy(spec);
  }
}

/* -------------------------------------------------------------------------- */
/* Movers: linear, path and circle                                             */
/* -------------------------------------------------------------------------- */

interface Segment {
  ax: number;
  ay: number;
  dx: number;
  dy: number;
  length: number;
}

/**
 * The classic blue ball. Its position is a pure function of the level time, so
 * a level reproduces exactly after every death.
 */
class MoverEnemy extends Enemy {
  private readonly mode: 'path' | 'circle';
  private readonly speed: number;
  private readonly phase: number;

  private readonly segments: Segment[] = [];
  private readonly totalLength: number = 0;

  private readonly cx: number = 0;
  private readonly cy: number = 0;
  private readonly radius: number = 0;
  private readonly dir: number = 1;

  private readonly pos: Vec2 = { x: 0, y: 0 };

  constructor(spec: Extract<EnemySpec, { kind: 'linear' | 'circle' | 'path' }>) {
    super();
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

      // Ping-pong is modelled as a closed ring: A -> B -> C -> B -> (A)
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
  }

  override emit(ctx: EnemyContext, out: Hazard[]): void {
    const p = this.positionAt(ctx.time);
    out.push({ x: p.x, y: p.y, r: ENEMY_RADIUS, kind: 'ball', t: 0 });
  }

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

    const last = this.segments[this.segments.length - 1];
    if (last) {
      this.pos.x = last.ax + last.dx;
      this.pos.y = last.ay + last.dy;
    }
    return this.pos;
  }
}

/* -------------------------------------------------------------------------- */
/* Pulse: a fixed spot whose radius breathes                                   */
/* -------------------------------------------------------------------------- */

class PulseEnemy extends Enemy {
  private readonly x: number;
  private readonly y: number;
  private readonly min: number;
  private readonly max: number;
  private readonly period: number;
  private readonly phase: number;

  constructor(spec: Extract<EnemySpec, { kind: 'pulse' }>) {
    super();
    this.x = spec.at[0] * TILE;
    this.y = spec.at[1] * TILE;
    this.min = spec.minRadius * TILE;
    this.max = spec.maxRadius * TILE;
    this.period = Math.max(spec.period, 0.1);
    this.phase = spec.phase ?? 0;
  }

  override emit(ctx: EnemyContext, out: Hazard[]): void {
    const u = wrap(ctx.time / this.period + this.phase, 1);
    // Smooth in and out, so the dangerous moment is easy to read.
    const swell = 0.5 - 0.5 * Math.cos(u * TAU);
    out.push({
      x: this.x,
      y: this.y,
      r: this.min + (this.max - this.min) * swell,
      kind: 'pulse',
      t: swell,
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Turret: periodic bullets along one axis                                     */
/* -------------------------------------------------------------------------- */

const DIRECTIONS = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
} as const;

/**
 * Bullets are not tracked as objects. At any time the live ones follow from the
 * firing interval, so this stays a pure function of the level time as well.
 */
class TurretEnemy extends Enemy {
  private readonly x: number;
  private readonly y: number;
  private readonly dx: number;
  private readonly dy: number;
  private readonly interval: number;
  private readonly speed: number;
  private readonly travelTime: number;
  private readonly offset: number;
  private readonly liveCount: number;

  constructor(spec: Extract<EnemySpec, { kind: 'turret' }>) {
    super();
    this.x = spec.at[0] * TILE;
    this.y = spec.at[1] * TILE;
    const dir = DIRECTIONS[spec.dir];
    this.dx = dir.x;
    this.dy = dir.y;
    this.interval = Math.max(spec.interval, 0.15);
    this.speed = spec.speed * TILE;
    this.travelTime = (spec.range * TILE) / this.speed;
    this.offset = (spec.phase ?? 0) * this.interval;
    this.liveCount = Math.ceil(this.travelTime / this.interval) + 1;
  }

  override emit(ctx: EnemyContext, out: Hazard[]): void {
    const newest = Math.floor((ctx.time - this.offset) / this.interval);
    for (let i = 0; i <= this.liveCount; i++) {
      const shot = newest - i;
      const age = ctx.time - this.offset - shot * this.interval;
      if (age < 0 || age >= this.travelTime) continue;
      const distance = age * this.speed;
      out.push({
        x: this.x + this.dx * distance,
        y: this.y + this.dy * distance,
        r: BULLET_RADIUS,
        kind: 'bullet',
        t: age / this.travelTime,
      });
    }
  }
}

/* -------------------------------------------------------------------------- */
/* Chaser: the one enemy that reacts to the player                             */
/* -------------------------------------------------------------------------- */

class ChaserEnemy extends Enemy {
  private readonly homeX: number;
  private readonly homeY: number;
  private readonly speed: number;
  private readonly delay: number;
  private x: number;
  private y: number;

  constructor(spec: Extract<EnemySpec, { kind: 'chaser' }>) {
    super();
    this.homeX = spec.at[0] * TILE;
    this.homeY = spec.at[1] * TILE;
    this.speed = spec.speed * TILE;
    this.delay = spec.delay ?? 0;
    this.x = this.homeX;
    this.y = this.homeY;
  }

  override reset(): void {
    this.x = this.homeX;
    this.y = this.homeY;
  }

  override emit(ctx: EnemyContext, out: Hazard[]): void {
    if (ctx.time >= this.delay && ctx.dt > 0) {
      const dx = ctx.playerX - this.x;
      const dy = ctx.playerY - this.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 1) {
        const stepLength = Math.min(this.speed * ctx.dt, distance);
        this.x += (dx / distance) * stepLength;
        this.y += (dy / distance) * stepLength;
      }
    }
    const waking = ctx.time < this.delay ? ctx.time / Math.max(this.delay, 0.001) : 1;
    out.push({ x: this.x, y: this.y, r: CHASER_RADIUS, kind: 'chaser', t: waking });
  }
}
