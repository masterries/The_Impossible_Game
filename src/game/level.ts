import { COLS, GATE_CYCLE, GATE_WARN, ROWS, TILE } from './config';
import { createEnemy, type Enemy, type Hazard } from './enemy';
import {
  Push,
  PUSH_VECTORS,
  Tile,
  type LevelDef,
  type PushKind,
  type TileKind,
} from './types';

export interface Coin {
  x: number;
  y: number;
  collected: boolean;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface CharSpec {
  tile: TileKind;
  push?: PushKind;
}

const CHARS: Record<string, CharSpec> = {
  '#': { tile: Tile.Void },
  '.': { tile: Tile.Floor },
  C: { tile: Tile.Floor },
  S: { tile: Tile.Start },
  E: { tile: Tile.End },
  '^': { tile: Tile.Floor, push: Push.Up },
  '>': { tile: Tile.Floor, push: Push.Right },
  v: { tile: Tile.Floor, push: Push.Down },
  '<': { tile: Tile.Floor, push: Push.Left },
  '1': { tile: Tile.GateA },
  '2': { tile: Tile.GateB },
};

/** Letters that pair up two tiles into a teleporter. */
const TELEPORT_CHARS = 'abc';

/** A loaded level: tile grid, coins, zones, mechanics and enemies. */
export class Level {
  readonly name: string;
  readonly hint: string;
  readonly tiles: TileKind[];
  readonly pushes: PushKind[];
  readonly coins: Coin[] = [];
  readonly enemies: Enemy[];
  /** Deadly circles for the current frame, rebuilt by `advance`. */
  readonly hazards: Hazard[] = [];
  readonly start: Rect;
  readonly end: Rect;
  readonly spawnX: number;
  readonly spawnY: number;
  readonly gateCycle: number;
  /** Tile index to tile index, both ways. */
  readonly teleports = new Map<number, number>();
  /** Tile index to the colour slot of its pair, for rendering. */
  readonly teleportPair = new Map<number, number>();
  readonly hasGates: boolean;

  /** Level time in seconds, reset to 0 on every death. */
  time = 0;

  constructor(def: LevelDef) {
    this.name = def.name;
    this.hint = def.hint;
    this.gateCycle = def.gateCycle ?? GATE_CYCLE;
    this.tiles = new Array<TileKind>(COLS * ROWS).fill(Tile.Void);
    this.pushes = new Array<PushKind>(COLS * ROWS).fill(Push.None);

    if (def.grid.length !== ROWS) {
      throw new Error(`Level "${def.name}": ${def.grid.length} rows instead of ${ROWS}.`);
    }

    let startMinC = COLS;
    let startMinR = ROWS;
    let startMaxC = -1;
    let startMaxR = -1;
    let endMinC = COLS;
    let endMinR = ROWS;
    let endMaxC = -1;
    let endMaxR = -1;
    let gates = false;

    const portals = new Map<string, number[]>();

    for (let r = 0; r < ROWS; r++) {
      const row = def.grid[r]!;
      if (row.length !== COLS) {
        throw new Error(
          `Level "${def.name}", row ${r}: ${row.length} characters instead of ${COLS}.`,
        );
      }
      for (let c = 0; c < COLS; c++) {
        const ch = row[c]!;
        const index = r * COLS + c;

        if (TELEPORT_CHARS.includes(ch)) {
          this.tiles[index] = Tile.Floor;
          const list = portals.get(ch) ?? [];
          list.push(index);
          portals.set(ch, list);
          continue;
        }

        const spec = CHARS[ch];
        if (spec === undefined) {
          throw new Error(`Level "${def.name}": unknown character "${ch}" at ${c}/${r}.`);
        }
        this.tiles[index] = spec.tile;
        if (spec.push) this.pushes[index] = spec.push;
        if (spec.tile === Tile.GateA || spec.tile === Tile.GateB) gates = true;

        if (ch === 'C') {
          this.coins.push({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE, collected: false });
        } else if (ch === 'S') {
          startMinC = Math.min(startMinC, c);
          startMinR = Math.min(startMinR, r);
          startMaxC = Math.max(startMaxC, c);
          startMaxR = Math.max(startMaxR, r);
        } else if (ch === 'E') {
          endMinC = Math.min(endMinC, c);
          endMinR = Math.min(endMinR, r);
          endMaxC = Math.max(endMaxC, c);
          endMaxR = Math.max(endMaxR, r);
        }
      }
    }

    this.hasGates = gates;

    let slot = 0;
    for (const [letter, indices] of portals) {
      if (indices.length !== 2) {
        throw new Error(
          `Level "${def.name}": teleporter "${letter}" needs exactly 2 tiles, found ${indices.length}.`,
        );
      }
      const [a, b] = indices as [number, number];
      this.teleports.set(a, b);
      this.teleports.set(b, a);
      this.teleportPair.set(a, slot);
      this.teleportPair.set(b, slot);
      slot++;
    }

    for (const [c, r] of def.coins ?? []) {
      if (!this.walkableIgnoringGates(c, r)) {
        throw new Error(`Level "${def.name}": coin at ${c}/${r} is not on a walkable tile.`);
      }
      this.coins.push({ x: (c + 0.5) * TILE, y: (r + 0.5) * TILE, collected: false });
    }

    if (startMaxC < 0) throw new Error(`Level "${def.name}": no start zone (S).`);
    if (endMaxC < 0) throw new Error(`Level "${def.name}": no end zone (E).`);

    this.start = {
      x: startMinC * TILE,
      y: startMinR * TILE,
      w: (startMaxC - startMinC + 1) * TILE,
      h: (startMaxR - startMinR + 1) * TILE,
    };
    this.end = {
      x: endMinC * TILE,
      y: endMinR * TILE,
      w: (endMaxC - endMinC + 1) * TILE,
      h: (endMaxR - endMinR + 1) * TILE,
    };

    this.spawnX = this.start.x + this.start.w / 2;
    this.spawnY = this.start.y + this.start.h / 2;

    this.enemies = def.enemies.map(createEnemy);
  }

  /* ---------------------------------------------------------------- *
   * Tiles
   * ---------------------------------------------------------------- */

  tileAt(col: number, row: number): TileKind {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return Tile.Void;
    return this.tiles[row * COLS + col]!;
  }

  walkable(col: number, row: number): boolean {
    const tile = this.tileAt(col, row);
    if (tile === Tile.Void) return false;
    if (tile === Tile.GateA) return !this.gateClosed(Tile.GateA);
    if (tile === Tile.GateB) return !this.gateClosed(Tile.GateB);
    return true;
  }

  /** Ignores the gate cycle, used for static checks such as coin placement. */
  private walkableIgnoringGates(col: number, row: number): boolean {
    return this.tileAt(col, row) !== Tile.Void;
  }

  /* ---------------------------------------------------------------- *
   * Gates
   * ---------------------------------------------------------------- */

  /**
   * Gate state is a pure function of the level time: group A is solid during
   * the first half of the cycle, group B during the second.
   */
  gateClosed(gate: TileKind, at = this.time): boolean {
    const phase = ((at % this.gateCycle) + this.gateCycle) % this.gateCycle;
    const firstHalf = phase < this.gateCycle / 2;
    return gate === Tile.GateA ? firstHalf : !firstHalf;
  }

  /** True shortly before a gate flips, so it can blink as a warning. */
  gateSwitchingSoon(at = this.time): boolean {
    const half = this.gateCycle / 2;
    const phase = ((at % half) + half) % half;
    return half - phase <= GATE_WARN;
  }

  /** True when a solid gate overlaps the given box, which means a crush. */
  crushes(cx: number, cy: number, half: number): boolean {
    if (!this.hasGates) return false;
    const c0 = Math.floor((cx - half) / TILE);
    const c1 = Math.floor((cx + half - 1e-6) / TILE);
    const r0 = Math.floor((cy - half) / TILE);
    const r1 = Math.floor((cy + half - 1e-6) / TILE);

    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const tile = this.tileAt(c, r);
        if (tile !== Tile.GateA && tile !== Tile.GateB) continue;
        if (this.gateClosed(tile)) return true;
      }
    }
    return false;
  }

  /* ---------------------------------------------------------------- *
   * Conveyors and teleporters
   * ---------------------------------------------------------------- */

  pushAt(col: number, row: number): { x: number; y: number } {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return PUSH_VECTORS[Push.None];
    return PUSH_VECTORS[this.pushes[row * COLS + col]!];
  }

  /** Target tile index of the teleporter at this index, or null. */
  teleportTarget(index: number): number | null {
    return this.teleports.get(index) ?? null;
  }

  /* ---------------------------------------------------------------- *
   * Coins and time
   * ---------------------------------------------------------------- */

  get totalCoins(): number {
    return this.coins.length;
  }

  get collectedCoins(): number {
    let n = 0;
    for (const coin of this.coins) if (coin.collected) n++;
    return n;
  }

  get allCoinsCollected(): boolean {
    return this.collectedCoins === this.coins.length;
  }

  /** Resets time, coins and stateful enemies after a death or a restart. */
  reset(playerX = this.spawnX, playerY = this.spawnY): void {
    this.time = 0;
    for (const coin of this.coins) coin.collected = false;
    for (const enemy of this.enemies) enemy.reset();
    this.advance(0, playerX, playerY);
  }

  /** Advances the level time and rebuilds the hazard list for this frame. */
  advance(dt: number, playerX = this.spawnX, playerY = this.spawnY): void {
    this.time += dt;
    this.hazards.length = 0;
    const ctx = { time: this.time, dt, playerX, playerY };
    for (const enemy of this.enemies) enemy.emit(ctx, this.hazards);
  }
}
