/** Central game constants. All lengths are logical pixels. */

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
export const BULLET_RADIUS = 6;
export const CHASER_RADIUS = 10;
export const COIN_RADIUS = 8;

/** Seconds the death effect runs before the level restarts. */
export const DEATH_FREEZE = 0.55;

/** How hard a conveyor tile drags, in px/s. Well below PLAYER_SPEED on purpose. */
export const CONVEYOR_SPEED = 110;
/** Seconds for a full gate cycle: group A open, then group B. */
export const GATE_CYCLE = 3.6;
/** Seconds a gate blinks before it changes state. */
export const GATE_WARN = 0.7;

const CLASSIC = {
  // Playfield
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

  // Mechanics
  conveyorA: '#cfd8ee',
  conveyorB: '#bfcae4',
  conveyorArrow: '#5d6f95',
  gateClosed: '#9b3b3b',
  gateClosedHi: '#c96a6a',
  gateOpenA: '#f0dede',
  gateOpenB: '#e4cdcd',
  gateMark: '#9b3b3b',
  teleport: ['#7d3cc4', '#0f8f86', '#c06a12'] as readonly string[],

  // Interface, styled after classic desktop windows
  face: '#d4d0c8',
  faceLight: '#ffffff',
  faceShadow: '#808080',
  ink: '#000000',
  inkMuted: '#4b4b4b',
  fieldBg: '#ffffff',
  titleBar: '#000080',
  titleBar2: '#1084d0',
  titleText: '#ffffff',
};

export type Palette = typeof CLASSIC;
export type ThemeName = 'classic' | 'midnight' | 'paper' | 'neon';

/**
 * Themes only swap colours. Every one keeps the same beveled window look, so
 * the interface stays recognisable while the playfield changes character.
 */
export const THEMES: Record<ThemeName, Palette> = {
  classic: CLASSIC,

  midnight: {
    ...CLASSIC,
    outside: '#0d1119',
    floorA: '#212a3d',
    floorB: '#1a2233',
    zoneA: '#1f5b46',
    zoneB: '#184a39',
    wallLine: '#05070b',
    enemy: '#2f7bff',
    enemyHi: '#a8caff',
    coin: '#ffd24a',
    coinHi: '#fff6c4',
    player: '#ff4d6d',
    playerHi: '#ffa8b8',
    conveyorA: '#28324a',
    conveyorB: '#222b40',
    conveyorArrow: '#6f88bd',
    gateClosed: '#7a2440',
    gateClosedHi: '#b34766',
    gateOpenA: '#2b1f2a',
    gateOpenB: '#241a24',
    face: '#2b3242',
    faceLight: '#4a5470',
    faceShadow: '#161b26',
    ink: '#e6ebf6',
    inkMuted: '#94a0b8',
    fieldBg: '#141a26',
    titleBar: '#123a6b',
    titleBar2: '#2f7bc4',
  },

  paper: {
    ...CLASSIC,
    outside: '#c9bda4',
    floorA: '#fbf6e9',
    floorB: '#efe6d1',
    zoneA: '#bcd9a8',
    zoneB: '#a6c990',
    wallLine: '#3a3227',
    enemy: '#3b4fa8',
    enemyHi: '#9fabe0',
    coin: '#e8a33d',
    coinHi: '#f7d79a',
    player: '#c8452f',
    playerHi: '#e59484',
    conveyorA: '#e6ddc6',
    conveyorB: '#dbd0b5',
    conveyorArrow: '#8a7c5e',
    gateClosed: '#9a5540',
    gateClosedHi: '#c07f66',
    gateOpenA: '#f0e6d2',
    gateOpenB: '#e6dbc4',
    gateMark: '#9a5540',
    face: '#e6dcc5',
    faceLight: '#fffaf0',
    faceShadow: '#a89c80',
    ink: '#3a3227',
    inkMuted: '#6d6250',
    fieldBg: '#fffaf0',
    titleBar: '#5c4a2e',
    titleBar2: '#a08b5f',
    teleport: ['#7a4bb5', '#2f7f6f', '#b06a20'] as readonly string[],
  },

  neon: {
    ...CLASSIC,
    outside: '#05060a',
    floorA: '#12131f',
    floorB: '#0c0d17',
    zoneA: '#0f5f4a',
    zoneB: '#0a4a39',
    wallLine: '#00e5ff',
    enemy: '#3d5bff',
    enemyHi: '#b6c4ff',
    coin: '#ffe600',
    coinHi: '#ffffb0',
    player: '#ff2bd1',
    playerHi: '#ffb0ef',
    conveyorA: '#151a2e',
    conveyorB: '#101425',
    conveyorArrow: '#00e5ff',
    gateClosed: '#8a0f4a',
    gateClosedHi: '#ff2b8a',
    gateOpenA: '#1a0f1a',
    gateOpenB: '#150c15',
    gateMark: '#ff2b8a',
    face: '#14162a',
    faceLight: '#2f3560',
    faceShadow: '#070810',
    ink: '#d8f6ff',
    inkMuted: '#7f95b5',
    fieldBg: '#0a0c16',
    titleBar: '#2a0b56',
    titleBar2: '#7a1fd0',
    teleport: ['#c86bff', '#00ffc8', '#ff9f1c'] as readonly string[],
  },
};

/**
 * The palette in use. Mutated in place by `applyTheme` so every module that
 * imported COLORS keeps seeing the current colours.
 */
export const COLORS: Palette = { ...CLASSIC };

export function applyTheme(name: ThemeName): void {
  Object.assign(COLORS, THEMES[name] ?? THEMES.classic);
}

const UI = 'Verdana, Geneva, "DejaVu Sans", sans-serif';
const HEAD = 'Georgia, "Times New Roman", serif';

export const FONT_LABEL = `bold 10px ${UI}`;
export const FONT_VALUE = `bold 15px ${UI}`;
export const FONT_TITLEBAR = `bold 13px ${UI}`;
export const FONT_HEAD = `bold 30px ${HEAD}`;
export const FONT_SUB = `bold 15px ${HEAD}`;
export const FONT_BODY = `12px ${UI}`;
export const FONT_BODY_BOLD = `bold 12px ${UI}`;
export const FONT_GLYPH = `bold 17px ${UI}`;
