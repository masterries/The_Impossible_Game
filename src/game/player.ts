import type { Vec2 } from '../engine/math';
import { PLAYER_SIZE, PLAYER_SPEED, TILE } from './config';
import type { Level } from './level';

const HALF = PLAYER_SIZE / 2;
const EPS = 1e-6;

/** Der rote Würfel. Bewegt sich achsenweise und wird an Wänden hart gestoppt. */
export class Player {
  x = 0;
  y = 0;

  spawn(level: Level): void {
    this.x = level.spawnX;
    this.y = level.spawnY;
  }

  update(dt: number, axis: Vec2, level: Level): void {
    const dx = axis.x * PLAYER_SPEED * dt;
    const dy = axis.y * PLAYER_SPEED * dt;

    if (dx !== 0) {
      this.x += dx;
      this.resolveX(level, dx);
    }
    if (dy !== 0) {
      this.y += dy;
      this.resolveY(level, dy);
    }
  }

  private resolveX(level: Level, dir: number): void {
    const c0 = Math.floor((this.x - HALF) / TILE);
    const c1 = Math.floor((this.x + HALF - EPS) / TILE);
    const r0 = Math.floor((this.y - HALF) / TILE);
    const r1 = Math.floor((this.y + HALF - EPS) / TILE);

    let blocker = -1;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (level.walkable(c, r)) continue;
        // Bei Bewegung nach rechts zählt die am weitesten links liegende Wand.
        blocker = blocker < 0 ? c : dir > 0 ? Math.min(blocker, c) : Math.max(blocker, c);
      }
    }
    if (blocker < 0) return;

    this.x = dir > 0 ? blocker * TILE - HALF : (blocker + 1) * TILE + HALF;
  }

  private resolveY(level: Level, dir: number): void {
    const c0 = Math.floor((this.x - HALF) / TILE);
    const c1 = Math.floor((this.x + HALF - EPS) / TILE);
    const r0 = Math.floor((this.y - HALF) / TILE);
    const r1 = Math.floor((this.y + HALF - EPS) / TILE);

    let blocker = -1;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (level.walkable(c, r)) continue;
        blocker = blocker < 0 ? r : dir > 0 ? Math.min(blocker, r) : Math.max(blocker, r);
      }
    }
    if (blocker < 0) return;

    this.y = dir > 0 ? blocker * TILE - HALF : (blocker + 1) * TILE + HALF;
  }

  get half(): number {
    return HALF;
  }
}
