import { COLS, ROWS, TILE } from './config';
import { Enemy } from './enemy';
import { Tile, type LevelDef, type TileKind } from './types';

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

const TILE_FROM_CHAR: Record<string, TileKind> = {
  '#': Tile.Void,
  '.': Tile.Floor,
  C: Tile.Floor,
  S: Tile.Start,
  E: Tile.End,
};

/** Ein geladenes Level: Kachelraster, Münzen, Zonen und Gegner. */
export class Level {
  readonly name: string;
  readonly hint: string;
  readonly tiles: TileKind[];
  readonly coins: Coin[] = [];
  readonly enemies: Enemy[];
  readonly start: Rect;
  readonly end: Rect;
  readonly spawnX: number;
  readonly spawnY: number;

  /** Levelzeit in Sekunden – wird bei jedem Tod auf 0 zurückgesetzt. */
  time = 0;

  constructor(def: LevelDef) {
    this.name = def.name;
    this.hint = def.hint;
    this.tiles = new Array<TileKind>(COLS * ROWS).fill(Tile.Void);

    if (def.grid.length !== ROWS) {
      throw new Error(`Level "${def.name}": ${def.grid.length} Zeilen statt ${ROWS}.`);
    }

    let startMinC = COLS;
    let startMinR = ROWS;
    let startMaxC = -1;
    let startMaxR = -1;
    let endMinC = COLS;
    let endMinR = ROWS;
    let endMaxC = -1;
    let endMaxR = -1;

    for (let r = 0; r < ROWS; r++) {
      const row = def.grid[r]!;
      if (row.length !== COLS) {
        throw new Error(`Level "${def.name}", Zeile ${r}: ${row.length} Zeichen statt ${COLS}.`);
      }
      for (let c = 0; c < COLS; c++) {
        const ch = row[c]!;
        const tile = TILE_FROM_CHAR[ch];
        if (tile === undefined) {
          throw new Error(`Level "${def.name}": unbekanntes Zeichen "${ch}" bei ${c}/${r}.`);
        }
        this.tiles[r * COLS + c] = tile;

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

    if (startMaxC < 0) throw new Error(`Level "${def.name}": keine Startzone (S).`);
    if (endMaxC < 0) throw new Error(`Level "${def.name}": keine Zielzone (E).`);

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

    this.enemies = def.enemies.map((spec) => new Enemy(spec));
  }

  tileAt(col: number, row: number): TileKind {
    if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return Tile.Void;
    return this.tiles[row * COLS + col]!;
  }

  walkable(col: number, row: number): boolean {
    return this.tileAt(col, row) !== Tile.Void;
  }

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

  /** Setzt Zeit und Münzen zurück (nach einem Tod oder Neustart). */
  reset(): void {
    this.time = 0;
    for (const coin of this.coins) coin.collected = false;
    this.advance(0);
  }

  /** Bewegt alle Gegner auf den Stand der Levelzeit. */
  advance(dt: number): void {
    this.time += dt;
    for (const enemy of this.enemies) enemy.positionAt(this.time);
  }
}
