import type { EnemySpec, LevelDef, TilePoint } from './types';

/* ------------------------------------------------------------------ *
 * Small helpers that keep the enemy lists readable.
 * Coordinates are tile centres (x.5 / y.5).
 * ------------------------------------------------------------------ */

/** Horizontal mover on row `y`, between column `x0` and `x1`. */
const hori = (y: number, x0: number, x1: number, speed: number, phase = 0): EnemySpec => ({
  kind: 'linear',
  from: [x0 + 0.5, y + 0.5],
  to: [x1 + 0.5, y + 0.5],
  speed,
  phase,
});

/** Vertical mover in column `x`, between row `y0` and `y1`. */
const vert = (x: number, y0: number, y1: number, speed: number, phase = 0): EnemySpec => ({
  kind: 'linear',
  from: [x + 0.5, y0 + 0.5],
  to: [x + 0.5, y1 + 0.5],
  speed,
  phase,
});

/** Evenly spaced ring of `count` enemies. */
const ring = (
  center: TilePoint,
  radius: number,
  speed: number,
  count: number,
  dir: 1 | -1 = 1,
  phaseOffset = 0,
): EnemySpec[] =>
  Array.from({ length: count }, (_, i) => ({
    kind: 'circle' as const,
    center,
    radius,
    speed,
    dir,
    phase: phaseOffset + i / count,
  }));

/* ------------------------------------------------------------------ *
 * Levels
 *
 * The first two teach the basics, then a mechanic is added every few
 * levels: conveyors from 3, gates from 5, teleporters from 9.
 * ------------------------------------------------------------------ */

export const LEVELS: readonly LevelDef[] = [
  {
    name: 'Warm-up',
    hint: 'There is always a gap between the blue balls.',
    grid: [
      '####################',
      '####################',
      '####################',
      '##SS...C........EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS........C...EE##',
      '##SS............EE##',
      '####################',
      '####################',
      '####################',
    ],
    enemies: [
      vert(6, 3, 8, 4.6, 0),
      vert(8, 3, 8, 4.6, 0.5),
      vert(10, 3, 8, 4.6, 0),
      vert(12, 3, 8, 4.6, 0.5),
      vert(14, 3, 8, 4.6, 0),
    ],
  },

  {
    name: 'Carousel',
    hint: 'Turn with the circles, not against them.',
    grid: [
      '####################',
      '####################',
      '##SS............EE##',
      '##SS............EE##',
      '##SS...C....C...EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS...C....C...EE##',
      '##SS............EE##',
      '##SS............EE##',
      '####################',
      '####################',
    ],
    enemies: [
      ...ring([7.5, 5.5], 2.4, 5.2, 4, 1),
      ...ring([12.5, 5.5], 2.4, 5.2, 4, -1, 0.125),
      vert(4, 2, 9, 4.2, 0),
      vert(15, 2, 9, 4.2, 0.5),
    ],
  },

  {
    name: 'Slipstream',
    hint: 'The striped tiles drag you along. The lower band pulls back.',
    grid: [
      '####################',
      '####################',
      '##SS............EE##',
      '##SS............EE##',
      '##SS>>>>>>>>>>>>EE##',
      '##SS>>>>>>>>>>>>EE##',
      '##SS<<<<<<<<<<<<EE##',
      '##SS<<<<<<<<<<<<EE##',
      '##SS............EE##',
      '##SS............EE##',
      '####################',
      '####################',
    ],
    // On the belts, so they cannot be picked up in passing.
    coins: [
      [6, 6],
      [13, 7],
    ],
    enemies: [
      vert(6, 2, 9, 5, 0),
      vert(9, 2, 9, 5, 0.5),
      vert(12, 2, 9, 5, 0),
      hori(4, 4, 15, 6.5, 0.25),
      hori(7, 4, 15, 6.5, 0.75),
    ],
  },

  {
    name: 'The Detour',
    hint: 'The shaft pushes upward. You have to walk down against it.',
    grid: [
      '####################',
      '##SS.............###',
      '##SS.....C.......###',
      '##SS.............###',
      '###########^^^^^^###',
      '###########^^^^^^###',
      '###..............###',
      '###.........C....###',
      '###..............###',
      '###EE............###',
      '###EE............###',
      '####################',
    ],
    enemies: [
      hori(1, 4, 16, 6.5, 0),
      hori(2, 4, 16, 6.5, 0.33),
      hori(3, 4, 16, 6.5, 0.66),
      hori(4, 11, 16, 5, 0),
      hori(5, 11, 16, 5, 0.5),
      hori(6, 4, 16, 6, 0),
      hori(8, 4, 16, 6, 0.5),
      hori(10, 5, 16, 6, 0.25),
      vert(10, 6, 10, 5, 0),
      vert(13, 6, 10, 5, 0.5),
    ],
  },

  {
    name: 'Gatekeeper',
    hint: 'Red doors take turns. Get in on one, wait, leave on the other.',
    grid: [
      '####################',
      '####################',
      '##SS...#....#...EE##',
      '##SS...1....#...EE##',
      '##SS...1....#...EE##',
      '##SS...#....#...EE##',
      '##SS...#....#...EE##',
      '##SS...#....2...EE##',
      '##SS...#....2...EE##',
      '##SS...#....#...EE##',
      '####################',
      '####################',
    ],
    gateCycle: 4.4,
    coins: [
      [5, 8],
      [10, 5],
      [14, 3],
    ],
    enemies: [
      vert(9, 2, 9, 4.4, 0),
      vert(10, 2, 9, 4.4, 0.5),
      vert(5, 2, 9, 5, 0.25),
      vert(14, 2, 9, 5, 0.75),
    ],
  },

  {
    name: 'The Wave',
    hint: 'Every row is offset. Two belts cut across the diagonal.',
    grid: [
      '####################',
      '##SS............EE##',
      '##SS.C........C.EE##',
      '##SS>>>>>>>>>>>>EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS<<<<<<<<<<<<EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS.C........C.EE##',
      '##SS............EE##',
      '####################',
    ],
    enemies: Array.from({ length: 10 }, (_, i) => hori(i + 1, 4, 15, 7, (i * 0.1) % 1)),
  },

  {
    name: 'Shifting Walls',
    hint: 'Half of each block is solid at a time. Do not get caught inside.',
    grid: [
      '####################',
      '##SS............EE##',
      '##SS...C........EE##',
      '##SS..111122....EE##',
      '##SS..111122....EE##',
      '##SS............EE##',
      '##SS.........C..EE##',
      '##SS....222211..EE##',
      '##SS....222211..EE##',
      '##SS............EE##',
      '##SS...C........EE##',
      '####################',
    ],
    gateCycle: 4,
    enemies: [
      vert(4, 1, 10, 5.5, 0),
      vert(15, 1, 10, 5.5, 0.5),
      hori(1, 4, 15, 6.5, 0),
      hori(5, 4, 15, 6.5, 0.35),
      hori(9, 4, 15, 6.5, 0.7),
      hori(10, 4, 15, 6.5, 0.15),
    ],
  },

  {
    name: 'Cross Current',
    hint: 'Every second column drags the other way. Cross in short steps.',
    grid: [
      '####################',
      '##SS............EE##',
      '##SS.v..^..v..^.EE##',
      '##SS.v..^..v..^.EE##',
      '##SS.v..^..v..^.EE##',
      '##SS.v..^..v..^.EE##',
      '##SS.v..^..v..^.EE##',
      '##SS.v..^..v..^.EE##',
      '##SS.v..^..v..^.EE##',
      '##SS.v..^..v..^.EE##',
      '##SS............EE##',
      '####################',
    ],
    coins: [
      [5, 3],
      [14, 8],
      [8, 9],
      [11, 2],
    ],
    enemies: [
      hori(1, 4, 15, 7, 0),
      hori(4, 4, 15, 7, 0.3),
      hori(7, 4, 15, 7, 0.6),
      hori(10, 4, 15, 7, 0.15),
      vert(6, 1, 10, 6, 0),
      vert(13, 1, 10, 6, 0.5),
    ],
  },

  {
    name: 'Wormhole',
    hint: 'The coloured rings are pairs. Step on one to come out of the other.',
    grid: [
      '####################',
      '####################',
      '##SS......##....EE##',
      '##SS..a...##..a.EE##',
      '##SS......##....EE##',
      '##SS......##....EE##',
      '##SS......##....EE##',
      '##SS......##....EE##',
      '##SS..b...##..b.EE##',
      '##SS......##....EE##',
      '####################',
      '####################',
    ],
    coins: [
      [4, 2],
      [9, 9],
      [12, 9],
      [15, 2],
    ],
    enemies: [
      ...ring([7, 6], 2.2, 5.5, 4, 1),
      ...ring([14, 6], 1.6, 5.5, 3, -1),
      vert(4, 2, 9, 5, 0),
      vert(9, 2, 9, 5, 0.5),
      vert(12, 2, 9, 5.5, 0.25),
    ],
  },

  {
    name: 'Pressure',
    hint: 'The whole floor pushes you back, and no lane stays open.',
    grid: [
      '####################',
      '####################',
      '##SS<<<<1<<<<2<<EE##',
      '##SS<<<<1<<<<2<<EE##',
      '##SS<<<<1<<<<2<<EE##',
      '##SS<<<<1<<<<2<<EE##',
      '##SS<<<<2<<<<1<<EE##',
      '##SS<<<<2<<<<1<<EE##',
      '##SS<<<<2<<<<1<<EE##',
      '##SS<<<<2<<<<1<<EE##',
      '####################',
      '####################',
    ],
    gateCycle: 4.6,
    coins: [
      [10, 3],
      [10, 8],
      [15, 5],
    ],
    enemies: [
      vert(6, 2, 9, 5, 0),
      vert(11, 2, 9, 5, 0.5),
      vert(15, 2, 9, 4.5, 0.25),
      hori(2, 4, 7, 5, 0),
      hori(9, 9, 12, 5, 0.5),
    ],
  },

  {
    name: 'The Eye',
    hint: 'The block has a shortcut straight through it.',
    grid: [
      '####################',
      '##SS............EE##',
      '##SS.C........C.EE##',
      '##SS.....a......EE##',
      '##SS...####.....EE##',
      '##SS...####.....EE##',
      '##SS...####.....EE##',
      '##SS...####.....EE##',
      '##SS.....a......EE##',
      '##SS.C........C.EE##',
      '##SS............EE##',
      '####################',
    ],
    enemies: [
      ...ring([9, 6], 3.5, 7, 8, 1),
      hori(1, 4, 15, 7, 0),
      hori(10, 4, 15, 7, 0.5),
      vert(4, 1, 10, 6, 0.25),
      vert(15, 1, 10, 6, 0.75),
      vert(6, 1, 10, 6.5, 0),
      vert(12, 1, 10, 6.5, 0.5),
    ],
  },

  {
    name: 'The Gauntlet',
    hint: 'Last level. Belts, doors and wormholes at once. Good luck.',
    grid: [
      '####################',
      '##SS>>>>#>>>>#>>EE##',
      '##SS>>>>1>>>>2>>EE##',
      '##SS.a..1....2b.EE##',
      '##SS....1....2..EE##',
      '##SS....#....#..EE##',
      '##SS....#....#..EE##',
      '##SS....2....1..EE##',
      '##SS.b..2....1a.EE##',
      '##SS<<<<2<<<<1<<EE##',
      '##SS<<<<#<<<<#<<EE##',
      '####################',
    ],
    gateCycle: 3.4,
    coins: [
      [6, 5],
      [11, 5],
      [15, 5],
      [10, 1],
    ],
    enemies: [
      ...ring([11, 5.5], 1.6, 6, 4, 1),
      vert(6, 1, 10, 6, 0),
      vert(15, 1, 10, 6, 0.5),
      vert(4, 1, 10, 6.5, 0.25),
      hori(1, 4, 7, 6, 0),
      hori(10, 9, 15, 6, 0.5),
      hori(5, 9, 12, 5.5, 0.3),
      hori(6, 9, 12, 5.5, 0.8),
    ],
  },
];
