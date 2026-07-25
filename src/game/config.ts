/** Zentrale Spielkonstanten – alle Längen in Logik-Pixeln. */

export const TILE = 40;
export const COLS = 20;
export const ROWS = 12;

export const FIELD_W = COLS * TILE; // 800
export const FIELD_H = ROWS * TILE; // 480

export const HUD_H = 60;
export const VIEW_W = FIELD_W;
export const VIEW_H = FIELD_H + HUD_H;

export const PLAYER_SIZE = 26;
export const PLAYER_SPEED = 235; // px/s
export const ENEMY_RADIUS = 11;
export const COIN_RADIUS = 8;

/** Sekunden, die der Todes-Effekt läuft, bevor neu gestartet wird. */
export const DEATH_FREEZE = 0.55;

export const COLORS = {
  // Spielfeld
  outside: '#9fa8bd',
  floorA: '#ffffff',
  floorB: '#e3e6f7',
  zoneA: '#a9e9a2',
  zoneB: '#8fdd88',
  wallLine: '#000000',
  enemy: '#2222ee',
  enemyHi: '#8f8fff',
  coin: '#ffd21f',
  coinHi: '#fff3a8',
  player: '#ff2d2d',
  playerHi: '#ff8a8a',

  // Bedienoberfläche im Stil klassischer Desktop-Fenster
  face: '#d4d0c8',
  faceLight: '#ffffff',
  faceShadow: '#808080',
  ink: '#000000',
  inkMuted: '#4b4b4b',
  fieldBg: '#ffffff',
  titleBar: '#000080',
  titleBar2: '#1084d0',
  titleText: '#ffffff',
} as const;

const UI = 'Verdana, Geneva, "DejaVu Sans", sans-serif';
const HEAD = 'Georgia, "Times New Roman", serif';

export const FONT_LABEL = `bold 10px ${UI}`;
export const FONT_VALUE = `bold 15px ${UI}`;
export const FONT_TITLEBAR = `bold 13px ${UI}`;
export const FONT_HEAD = `bold 30px ${HEAD}`;
export const FONT_SUB = `bold 15px ${HEAD}`;
export const FONT_BODY = `12px ${UI}`;
export const FONT_BODY_BOLD = `bold 12px ${UI}`;
