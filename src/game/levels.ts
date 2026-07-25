import type { EnemySpec, LevelDef, TilePoint } from './types';

/* ------------------------------------------------------------------ *
 * Kleine Helfer, damit die Gegner-Listen lesbar bleiben.
 * Koordinaten sind Kachelmitten (x.5 / y.5).
 * ------------------------------------------------------------------ */

/** Waagerechter Pendler auf Zeile `y` zwischen Spalte `x0` und `x1`. */
const hori = (y: number, x0: number, x1: number, speed: number, phase = 0): EnemySpec => ({
  kind: 'linear',
  from: [x0 + 0.5, y + 0.5],
  to: [x1 + 0.5, y + 0.5],
  speed,
  phase,
});

/** Senkrechter Pendler in Spalte `x` zwischen Zeile `y0` und `y1`. */
const vert = (x: number, y0: number, y1: number, speed: number, phase = 0): EnemySpec => ({
  kind: 'linear',
  from: [x + 0.5, y0 + 0.5],
  to: [x + 0.5, y1 + 0.5],
  speed,
  phase,
});

/** Gleichmäßig verteilter Ring aus `count` Gegnern. */
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
 * Level
 * ------------------------------------------------------------------ */

export const LEVELS: readonly LevelDef[] = [
  {
    name: 'Aufwärmen',
    hint: 'Zwischen den blauen Kugeln ist immer eine Lücke.',
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
    name: 'Karussell',
    hint: 'Kreisbahnen dreht man am besten mit – nicht dagegen.',
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
    name: 'Der Umweg',
    hint: 'Der Engpass in der Mitte ist der einzige Weg nach unten.',
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
    name: 'Die Welle',
    hint: 'Alle Reihen laufen versetzt – such dir die Diagonale.',
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
    name: 'Sackgasse',
    hint: 'Die Wände schützen dich – solange du nicht stehen bleibst.',
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
    name: 'Das Auge',
    hint: 'Letztes Level. Viel Glück.',
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
