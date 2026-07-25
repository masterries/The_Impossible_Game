/** A point in tile coordinates. Fractions are allowed: 6.5 is the centre of column 6. */
export type TilePoint = readonly [x: number, y: number];

/**
 * Enemy description. Movement is a pure function of the level time, which makes
 * a level reproduce exactly after every death.
 */
export type EnemySpec =
  | {
      /** Bounces back and forth between two points. */
      kind: 'linear';
      from: TilePoint;
      to: TilePoint;
      /** Tiles per second. */
      speed: number;
      /** Head start as a fraction of a full cycle (0 to 1). */
      phase?: number;
    }
  | {
      /** Circles around a centre point. */
      kind: 'circle';
      center: TilePoint;
      radius: number;
      speed: number;
      phase?: number;
      /** 1 is clockwise, -1 is counter-clockwise. */
      dir?: 1 | -1;
    }
  | {
      /** Follows a free polyline. */
      kind: 'path';
      points: readonly TilePoint[];
      speed: number;
      phase?: number;
      /** `pingpong` walks the line back and forth, `cycle` closes it into a ring. */
      loop?: 'pingpong' | 'cycle';
    }
  | {
      /** Sits still and breathes: the danger radius grows and shrinks. */
      kind: 'pulse';
      at: TilePoint;
      /** Radii in tiles. */
      minRadius: number;
      maxRadius: number;
      /** Seconds for one grow-shrink cycle. */
      period: number;
      phase?: number;
    }
  | {
      /** Fires a bullet along one axis every `interval` seconds. */
      kind: 'turret';
      at: TilePoint;
      dir: 'up' | 'down' | 'left' | 'right';
      interval: number;
      /** Tiles per second. */
      speed: number;
      /** How far a bullet flies, in tiles. */
      range: number;
      phase?: number;
    }
  | {
      /**
       * Homes in on the player. The only enemy with state, so it is the one
       * thing in a level that cannot be memorised as a fixed pattern.
       */
      kind: 'chaser';
      at: TilePoint;
      speed: number;
      /** Seconds before it wakes up after a level start. */
      delay?: number;
    };

export interface LevelDef {
  name: string;
  hint: string;
  /**
   * Layout, one string per tile row.
   *
   * `#` wall or void      `.` floor            `S` start zone
   * `E` end zone          `C` coin
   * `^ > v <` conveyor floor, pushing that way
   * `1` gate of group A   `2` gate of group B  (the two groups alternate)
   * `a b c` teleporter, each letter used exactly twice to form a pair
   */
  grid: readonly string[];
  enemies: readonly EnemySpec[];
  /** Extra coins on tiles that already carry a mechanic, as [column, row]. */
  coins?: readonly TilePoint[];
  /** Seconds for a full open-closed cycle of both gate groups. */
  gateCycle?: number;
}

export const Tile = {
  Void: 0,
  Floor: 1,
  Start: 2,
  End: 3,
  /** Solid while group A is closed, walkable otherwise. */
  GateA: 4,
  /** The opposite half of the cycle. */
  GateB: 5,
} as const;

export type TileKind = (typeof Tile)[keyof typeof Tile];

/** Conveyor direction stored per tile; 0 means the tile does not push. */
export const Push = {
  None: 0,
  Up: 1,
  Right: 2,
  Down: 3,
  Left: 4,
} as const;

export type PushKind = (typeof Push)[keyof typeof Push];

export const PUSH_VECTORS: Record<PushKind, { x: number; y: number }> = {
  [Push.None]: { x: 0, y: 0 },
  [Push.Up]: { x: 0, y: -1 },
  [Push.Right]: { x: 1, y: 0 },
  [Push.Down]: { x: 0, y: 1 },
  [Push.Left]: { x: -1, y: 0 },
};
