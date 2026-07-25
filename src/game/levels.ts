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
    name: 'The Detour',
    hint: 'The narrow middle section is the only way down.',
    grid: [
      '####################',
      '##SS.............###',
      '##SS.....C.......###',
      '##SS.............###',
      '###########......###',
      '###########......###',
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
    name: 'The Wave',
    hint: 'Every row is offset. Find the diagonal.',
    grid: [
      '####################',
      '##SS............EE##',
      '##SS.C........C.EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS............EE##',
      '##SS.C........C.EE##',
      '##SS............EE##',
      '####################',
    ],
    enemies: Array.from({ length: 10 }, (_, i) => hori(i + 1, 4, 15, 7, (i * 0.1) % 1)),
  },

  {
    name: 'Dead End',
    hint: 'The walls protect you, as long as you keep moving.',
    grid: [
      '####################',
      '##SS............EE##',
      '##SS...C........EE##',
      '##SS..######....EE##',
      '##SS..######....EE##',
      '##SS............EE##',
      '##SS.........C..EE##',
      '##SS....######..EE##',
      '##SS....######..EE##',
      '##SS............EE##',
      '##SS...C........EE##',
      '####################',
    ],
    enemies: [
      vert(4, 1, 10, 5.5, 0),
      vert(15, 1, 10, 5.5, 0.5),
      hori(1, 4, 15, 6.5, 0),
      hori(2, 4, 15, 6.5, 0.5),
      hori(5, 4, 15, 6.5, 0.25),
      hori(6, 4, 15, 6.5, 0.75),
      hori(9, 4, 15, 6.5, 0.1),
      hori(10, 4, 15, 6.5, 0.6),
    ],
  },

  {
    name: 'The Eye',
    hint: 'Last level. Good luck.',
    grid: [
      '####################',
      '##SS............EE##',
      '##SS.C........C.EE##',
      '##SS............EE##',
      '##SS...####.....EE##',
      '##SS...####.....EE##',
      '##SS...####.....EE##',
      '##SS...####.....EE##',
      '##SS............EE##',
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
];
