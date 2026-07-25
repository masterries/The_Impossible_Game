/** Ein Punkt in Kachel-Koordinaten (darf gebrochen sein: 6.5 = Kachelmitte von Spalte 6). */
export type TilePoint = readonly [x: number, y: number];

/**
 * Gegner-Beschreibung. Bewegungen sind reine Funktionen der Levelzeit –
 * dadurch ist ein Level nach jedem Tod exakt identisch reproduzierbar.
 */
export type EnemySpec =
  | {
      /** Pendelbewegung zwischen zwei Punkten. */
      kind: 'linear';
      from: TilePoint;
      to: TilePoint;
      /** Kacheln pro Sekunde. */
      speed: number;
      /** Startversatz als Anteil eines vollen Zyklus (0–1). */
      phase?: number;
    }
  | {
      /** Kreisbahn um einen Mittelpunkt. */
      kind: 'circle';
      center: TilePoint;
      radius: number;
      speed: number;
      phase?: number;
      /** 1 = im Uhrzeigersinn, -1 = dagegen. */
      dir?: 1 | -1;
    }
  | {
      /** Freier Streckenzug. */
      kind: 'path';
      points: readonly TilePoint[];
      speed: number;
      phase?: number;
      /** `pingpong` läuft die Strecke vor und zurück, `cycle` schließt sie zum Ring. */
      loop?: 'pingpong' | 'cycle';
    };

export interface LevelDef {
  name: string;
  hint: string;
  /**
   * Layout, eine Zeile pro Kachelreihe.
   * `#` Wand/Leere · `.` Boden · `S` Startzone · `E` Zielzone · `C` Münze
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
