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
    };

export interface LevelDef {
  name: string;
  hint: string;
  /**
   * Layout, one string per tile row.
   * `#` wall or void, `.` floor, `S` start zone, `E` end zone, `C` coin
   */
  grid: readonly string[];
  enemies: readonly EnemySpec[];
}

export const Tile = {
  Void: 0,
  Floor: 1,
  Start: 2,
  End: 3,
} as const;

export type TileKind = (typeof Tile)[keyof typeof Tile];
