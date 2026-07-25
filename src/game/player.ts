import type { Vec2 } from '../engine/math';
import { COLS, CONVEYOR_SPEED, PLAYER_SIZE, PLAYER_SPEED, TILE } from './config';
import type { Level } from './level';

const HALF = PLAYER_SIZE / 2;
const EPS = 1e-6;

/** The red cube. Moves one axis at a time and stops hard at walls. */
export class Player {
  x = 0;
  y = 0;
  /** Tile the player was teleported onto, so it does not fire again at once. */
  private lastTeleport = -1;

  spawn(level: Level): void {
    this.x = level.spawnX;
    this.y = level.spawnY;
    this.lastTeleport = -1;
  }

  update(dt: number, axis: Vec2, level: Level): void {
    // The tile under the centre decides whether a conveyor is dragging.
    const push = level.pushAt(Math.floor(this.x / TILE), Math.floor(this.y / TILE));

    const dx = axis.x * PLAYER_SPEED * dt + push.x * CONVEYOR_SPEED * dt;
    const dy = axis.y * PLAYER_SPEED * dt + push.y * CONVEYOR_SPEED * dt;

    if (dx !== 0) {
      this.x += dx;
      this.resolveX(level, dx);
    }
    if (dy !== 0) {
      this.y += dy;
      this.resolveY(level, dy);
    }

    this.applyTeleport(level);
  }

  /** Steps through a teleporter when the centre enters one. */
  private applyTeleport(level: Level): void {
    const col = Math.floor(this.x / TILE);
    const row = Math.floor(this.y / TILE);
    const index = row * COLS + col;

    const target = level.teleportTarget(index);
    if (target === null) {
      // Left the pad, so the next one may fire again.
      this.lastTeleport = -1;
      return;
    }
    if (index === this.lastTeleport) return;

    this.x = ((target % COLS) + 0.5) * TILE;
    this.y = (Math.floor(target / COLS) + 0.5) * TILE;
    this.lastTeleport = target;
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
        // Moving right, the leftmost wall wins; moving left, the rightmost.
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
