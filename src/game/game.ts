import { Sfx } from '../engine/audio';
import { Input } from '../engine/input';
import { GameLoop } from '../engine/loop';
import { pointBoxDistanceSq, TAU, type Vec2 } from '../engine/math';
import { PointerInput, STICK_RANGE } from '../engine/pointer';
import { Renderer } from '../engine/renderer';
import {
  COIN_RADIUS,
  COLORS,
  COLS,
  DEATH_FREEZE,
  FONT_BODY,
  FONT_BODY_BOLD,
  FONT_GLYPH,
  FONT_HEAD,
  FONT_LABEL,
  FONT_SUB,
  FONT_TITLEBAR,
  FONT_VALUE,
  HUD_H,
  PLAYER_SIZE,
  ROWS,
  TILE,
  VIEW_H,
  VIEW_W,
} from './config';
import { Level } from './level';
import { LEVELS } from './levels';
import { Particles } from './particles';
import { Player } from './player';
import { Tile, type TileKind } from './types';

type State =
  | 'title'
  | 'ready'
  | 'playing'
  | 'dying'
  | 'levelComplete'
  | 'finished'
  | 'paused'
  /** Sudden death: the single life is gone. */
  | 'gameOver'
  /** A practice level was cleared. */
  | 'practiceDone';

export type GameMode = 'campaign' | 'sudden' | 'practice';

const MODE_LABELS: Record<GameMode, string> = {
  campaign: 'Campaign',
  sudden: 'Sudden death',
  practice: 'Practice',
};

interface DialogLine {
  text: string;
  font: string;
  color?: string;
  space?: number;
  /** Dropped on phones, where every line costs a lot of room. */
  compactHide?: boolean;
}

interface DialogLayout {
  boxW: number;
  boxH: number;
  pad: number;
  titleH: number;
  buttonH: number;
  buttonW: number;
  titleFont: string;
  actionFont: string;
  lineFonts: string[];
  lineSizes: number[];
  lineSpaces: number[];
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RunProgress {
  /** Levels cleared in this run so far, at least 1. */
  levels: number;
  totalLevels: number;
  deaths: number;
  durationMs: number;
  /** True once the last level is cleared, which is what makes a run rankable. */
  complete: boolean;
  /** Never `practice`: those runs are not reported at all. */
  mode: Exclude<GameMode, 'practice'>;
}

const BEST_KEY = 'impossible-game.best-deaths';

/** Touch targets in the status bar, so the game is fully playable without a keyboard. */
const PAUSE_BUTTON: Box = { x: 700, y: 12, w: 40, h: 34 };
const RESTART_BUTTON: Box = { x: 746, y: 12, w: 40, h: 34 };

/**
 * Same buttons on a phone. The status bar is only 60 logical pixels tall, which
 * at phone scale is around 25 CSS pixels, so the drawn button can never reach a
 * comfortable finger size. The hit area is therefore padded well beyond what is
 * drawn (see HIT_PADDING_COMPACT).
 */
const PAUSE_BUTTON_SMALL: Box = { x: 640, y: 4, w: 70, h: 52 };
const RESTART_BUTTON_SMALL: Box = { x: 718, y: 4, w: 70, h: 52 };
const HIT_PADDING_COMPACT = 16;

/**
 * Below this display scale the canvas is small enough that the regular text
 * sizes stop being readable, so the status bar and the dialogs switch to a
 * larger, shorter layout.
 */
const COMPACT_BELOW = 0.62;

export class Game {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly pointer: PointerInput;
  private readonly loop: GameLoop;
  private readonly particles = new Particles();
  private readonly player = new Player();

  readonly sfx = new Sfx();

  /** Fired when a fresh run starts, used to request a scoreboard ticket. */
  onRunStart: (() => void) | null = null;
  /** Fired after every cleared level, so partial runs land on the board too. */
  onProgress: ((progress: RunProgress) => void) | null = null;

  private levelIndex = 0;
  private level: Level;
  private mode: GameMode = 'campaign';
  private state: State = 'title';
  private stateTime = 0;
  private deaths = 0;
  private runTime = 0;
  private shake = 0;
  private flash = 0;
  private best: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new Renderer(canvas, VIEW_W, VIEW_H);
    this.input = new Input(window);
    this.pointer = new PointerInput(canvas, VIEW_W, VIEW_H);
    this.level = new Level(LEVELS[0]!);
    this.player.spawn(this.level);
    this.best = readBest();

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.draw(),
    );

    window.addEventListener('blur', () => this.pauseIfPlaying());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pauseIfPlaying();
    });
  }

  start(): void {
    this.loop.start();
  }

  private pauseIfPlaying(): void {
    this.input.reset();
    this.pointer.reset();
    if (this.state === 'playing') this.setState('paused');
  }

  /* ---------------------------------------------------------------- *
   * Flow control
   * ---------------------------------------------------------------- */

  private setState(next: State): void {
    this.state = next;
    this.stateTime = 0;
  }

  /** All twelve levels in order, submitted to the scoreboard. */
  startCampaign(): void {
    this.startRun('campaign', 0);
  }

  /** Same levels, but the first hit ends the run. */
  startSudden(): void {
    this.startRun('sudden', 0);
  }

  /** A single level, never submitted anywhere. */
  startPractice(index: number): void {
    this.startRun('practice', Math.min(Math.max(index, 0), LEVELS.length - 1));
  }

  private startRun(mode: GameMode, index: number): void {
    this.mode = mode;
    this.deaths = 0;
    this.runTime = 0;
    this.levelIndex = index;
    this.loadLevel(index);
    if (mode !== 'practice') this.onRunStart?.();
  }

  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = new Level(LEVELS[index]!);
    this.player.spawn(this.level);
    this.level.reset(this.player.x, this.player.y);
    this.particles.clear();
    this.setState('ready');
  }

  private restartLevel(): void {
    this.player.spawn(this.level);
    this.level.reset(this.player.x, this.player.y);
    this.particles.clear();
    this.setState('playing');
  }

  private die(): void {
    this.deaths++;
    this.shake = 1;
    this.flash = 1;
    this.particles.burst(this.player.x, this.player.y, COLORS.player, 16, 260, 7);
    this.sfx.death();
    this.setState('dying');
  }

  private completeLevel(): void {
    this.particles.burst(this.player.x, this.player.y, '#37d67a', 22, 220, 6);

    if (this.mode === 'practice') {
      this.sfx.levelComplete();
      this.setState('practiceDone');
      return;
    }

    const cleared = this.levelIndex + 1;
    const complete = cleared >= LEVELS.length;

    if (complete) {
      if (this.best === null || this.deaths < this.best) {
        this.best = this.deaths;
        writeBest(this.deaths);
      }
      this.sfx.victory();
      this.setState('finished');
    } else {
      this.sfx.levelComplete();
      this.setState('levelComplete');
    }

    // Reported for every level, not just the last one: a run that stops early
    // still belongs on the board, just without a rank.
    this.onProgress?.({
      levels: cleared,
      totalLevels: LEVELS.length,
      deaths: this.deaths,
      durationMs: Math.round(this.runTime * 1000),
      complete,
      mode: this.mode,
    });
  }

  /* ---------------------------------------------------------------- *
   * Update
   * ---------------------------------------------------------------- */

  private update(dt: number): void {
    this.stateTime += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.particles.update(dt);

    const confirm = this.input.anyConfirm() || this.handleTap();

    switch (this.state) {
      case 'title':
        if (confirm) {
          this.sfx.unlock();
          this.sfx.select();
          this.startCampaign();
        }
        break;

      case 'ready':
        if (confirm) {
          this.sfx.select();
          this.setState('playing');
        }
        break;

      case 'playing':
        this.updatePlaying(dt);
        break;

      case 'dying':
        if (this.stateTime >= DEATH_FREEZE) {
          // One life only, so the run is over instead of restarting.
          if (this.mode === 'sudden') this.setState('gameOver');
          else this.restartLevel();
        }
        break;

      case 'gameOver':
      case 'practiceDone':
        if (confirm) {
          this.sfx.select();
          this.setState('title');
        }
        break;

      case 'levelComplete':
        if (confirm) {
          this.sfx.select();
          this.loadLevel(this.levelIndex + 1);
        }
        break;

      case 'finished':
        if (confirm) {
          this.sfx.select();
          this.setState('title');
        }
        break;

      case 'paused':
        if (confirm || this.input.wasPressed('KeyP', 'Escape')) this.setState('playing');
        break;
    }

    const restartable = this.state === 'playing' || this.state === 'dying' || this.state === 'paused';
    if (restartable && this.input.wasPressed('KeyR')) {
      this.restartLevel();
    }

    this.input.endFrame();
  }

  /**
   * Consumes a pending tap. Returns true when the tap should count as a
   * "continue", false when it hit a status bar button or the playfield.
   */
  private handleTap(): boolean {
    const tap = this.pointer.takeTap();
    if (!tap) return false;

    const pad = this.compact ? HIT_PADDING_COMPACT : 0;

    if (inside(tap, this.pauseBox, pad)) {
      if (this.state === 'playing') this.setState('paused');
      else if (this.state === 'paused') this.setState('playing');
      return false;
    }

    if (inside(tap, this.restartBox, pad)) {
      if (this.state === 'playing' || this.state === 'dying' || this.state === 'paused') {
        this.restartLevel();
      }
      return false;
    }

    // Taps on the playfield only mean "continue" while a dialog is open.
    return this.state !== 'playing' && this.state !== 'dying';
  }

  /** True while the canvas is displayed small enough to need the phone layout. */
  private get compact(): boolean {
    return this.renderer.displayScale < COMPACT_BELOW;
  }

  private get pauseBox(): Box {
    return this.compact ? PAUSE_BUTTON_SMALL : PAUSE_BUTTON;
  }

  private get restartBox(): Box {
    return this.compact ? RESTART_BUTTON_SMALL : RESTART_BUTTON;
  }

  /** Keyboard wins; touch takes over when no movement key is held. */
  private moveAxis(): Vec2 {
    const keys = this.input.axis;
    if (keys.x !== 0 || keys.y !== 0) return keys;
    // A touch that started on the status bar must not steer.
    if (this.pointer.stickOrigin.y < HUD_H) return keys;
    return this.pointer.axis;
  }

  private updatePlaying(dt: number): void {
    if (this.input.wasPressed('KeyP', 'Escape')) {
      this.setState('paused');
      return;
    }

    this.runTime += dt;
    this.level.advance(dt, this.player.x, this.player.y);
    this.player.update(dt, this.moveAxis(), this.level);

    const half = this.player.half;

    // A gate that closes on the player is fatal. It blinks first, so this is
    // always something the player could see coming.
    if (this.level.crushes(this.player.x, this.player.y, half)) {
      this.die();
      return;
    }

    // Collect coins
    for (const coin of this.level.coins) {
      if (coin.collected) continue;
      const d2 = pointBoxDistanceSq(coin.x, coin.y, this.player.x, this.player.y, half, half);
      if (d2 <= COIN_RADIUS * COIN_RADIUS) {
        coin.collected = true;
        this.particles.burst(coin.x, coin.y, COLORS.coin, 10, 150, 5);
        this.sfx.coin();
      }
    }

    // Enemy hit
    for (const hazard of this.level.hazards) {
      const d2 = pointBoxDistanceSq(hazard.x, hazard.y, this.player.x, this.player.y, half, half);
      if (d2 <= hazard.r * hazard.r) {
        this.die();
        return;
      }
    }

    // Reached the goal?
    const { end } = this.level;
    const inEnd =
      this.player.x >= end.x &&
      this.player.x <= end.x + end.w &&
      this.player.y >= end.y &&
      this.player.y <= end.y + end.h;

    if (inEnd && this.level.allCoinsCollected) this.completeLevel();
  }

  /* ---------------------------------------------------------------- *
   * Rendering
   * ---------------------------------------------------------------- */

  private draw(): void {
    const { ctx } = this.renderer;
    this.renderer.begin(COLORS.outside);

    this.drawHud(ctx);
    this.drawField(ctx);
    this.drawStick(ctx);
    this.drawOverlay(ctx);
  }

  private drawField(ctx: CanvasRenderingContext2D): void {
    const level = this.level;
    const shakeAmount = this.shake * 7;
    const ox = shakeAmount ? (Math.random() - 0.5) * shakeAmount : 0;
    const oy = shakeAmount ? (Math.random() - 0.5) * shakeAmount : 0;

    ctx.save();
    ctx.translate(ox, HUD_H + oy);

    // Tiles
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = level.tileAt(c, r);
        if (tile === Tile.Void) continue;
        const even = (c + r) % 2 === 0;
        const x = c * TILE;
        const y = r * TILE;

        if (tile === Tile.GateA || tile === Tile.GateB) {
          this.drawGate(ctx, x, y, tile, even);
          continue;
        }

        const push = level.pushAt(c, r);
        if (push.x !== 0 || push.y !== 0) {
          ctx.fillStyle = even ? COLORS.conveyorA : COLORS.conveyorB;
          ctx.fillRect(x, y, TILE, TILE);
          this.drawConveyor(ctx, x, y, push);
          continue;
        }

        ctx.fillStyle =
          tile === Tile.Floor
            ? even
              ? COLORS.floorA
              : COLORS.floorB
            : even
              ? COLORS.zoneA
              : COLORS.zoneB;
        ctx.fillRect(x, y, TILE, TILE);
      }
    }

    // Black outline along every edge of the walkable area
    ctx.strokeStyle = COLORS.wallLine;
    ctx.lineWidth = 3;
    ctx.lineCap = 'square';
    ctx.beginPath();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!level.walkable(c, r)) continue;
        const x = c * TILE;
        const y = r * TILE;
        if (!level.walkable(c, r - 1)) {
          ctx.moveTo(x, y);
          ctx.lineTo(x + TILE, y);
        }
        if (!level.walkable(c, r + 1)) {
          ctx.moveTo(x, y + TILE);
          ctx.lineTo(x + TILE, y + TILE);
        }
        if (!level.walkable(c - 1, r)) {
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + TILE);
        }
        if (!level.walkable(c + 1, r)) {
          ctx.moveTo(x + TILE, y);
          ctx.lineTo(x + TILE, y + TILE);
        }
      }
    }
    ctx.stroke();

    // The goal stays sealed while coins are missing
    if (!level.allCoinsCollected) {
      const pulse = 0.18 + 0.12 * Math.sin(level.time * 5);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#000';
      ctx.fillRect(level.end.x, level.end.y, level.end.w, level.end.h);
      ctx.globalAlpha = 1;
    }

    this.drawTeleports(ctx);
    this.drawCoins(ctx);
    this.drawHazards(ctx);
    if (this.state !== 'dying') this.drawPlayer(ctx);
    this.particles.draw(ctx);

    ctx.restore();
  }

  /** A gate is either a hatched block or a dashed outline on the floor. */
  private drawGate(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tile: TileKind,
    even: boolean,
  ): void {
    const level = this.level;
    const closed = level.gateClosed(tile);
    const blink = level.gateSwitchingSoon() && Math.floor(level.time * 10) % 2 === 0;

    if (closed) {
      ctx.fillStyle = blink ? COLORS.gateClosedHi : COLORS.gateClosed;
      ctx.fillRect(x, y, TILE, TILE);

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, TILE, TILE);
      ctx.clip();
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.22)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      for (let i = -TILE; i < TILE; i += 11) {
        ctx.moveTo(x + i, y + TILE);
        ctx.lineTo(x + i + TILE, y);
      }
      ctx.stroke();
      ctx.restore();
      return;
    }

    ctx.fillStyle = even ? COLORS.gateOpenA : COLORS.gateOpenB;
    ctx.fillRect(x, y, TILE, TILE);
    ctx.strokeStyle = blink ? COLORS.gateClosed : 'rgba(155, 59, 59, 0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.strokeRect(x + 4.5, y + 4.5, TILE - 9, TILE - 9);
    ctx.setLineDash([]);
  }

  /** Chevrons that scroll in the direction the belt drags. */
  private drawConveyor(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    push: { x: number; y: number },
  ): void {
    const offset = ((this.level.time * 26) % 20) - 10;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, TILE, TILE);
    ctx.clip();
    ctx.translate(x + TILE / 2, y + TILE / 2);
    ctx.rotate(Math.atan2(push.y, push.x));

    ctx.strokeStyle = COLORS.conveyorArrow;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = -1; i <= 1; i++) {
      const ox = i * 20 + offset;
      ctx.beginPath();
      ctx.moveTo(ox - 6, -7);
      ctx.lineTo(ox + 2, 0);
      ctx.lineTo(ox - 6, 7);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** Teleporter pads, one colour per pair. */
  private drawTeleports(ctx: CanvasRenderingContext2D): void {
    for (const [index, slot] of this.level.teleportPair) {
      const cx = ((index % COLS) + 0.5) * TILE;
      const cy = (Math.floor(index / COLS) + 0.5) * TILE;
      const color = COLORS.teleport[slot % COLORS.teleport.length]!;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(this.level.time * 1.8 + slot);
      ctx.strokeStyle = color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 12, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, TAU);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();

      ctx.strokeStyle = COLORS.wallLine;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 14, 0, TAU);
      ctx.stroke();
    }
  }

  private drawCoins(ctx: CanvasRenderingContext2D): void {
    const bob = Math.sin(this.level.time * 4) * 1.5;
    for (const coin of this.level.coins) {
      if (coin.collected) continue;
      ctx.beginPath();
      ctx.arc(coin.x, coin.y + bob, COIN_RADIUS, 0, TAU);
      ctx.fillStyle = COLORS.coin;
      ctx.fill();
      ctx.lineWidth = 2.5;
      ctx.strokeStyle = COLORS.wallLine;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(coin.x - 2.5, coin.y + bob - 2.5, COIN_RADIUS * 0.3, 0, TAU);
      ctx.fillStyle = COLORS.coinHi;
      ctx.fill();
    }
  }

  /** Every deadly circle, drawn by kind so they stay tellable apart. */
  private drawHazards(ctx: CanvasRenderingContext2D): void {
    for (const hazard of this.level.hazards) {
      const { x, y, r } = hazard;

      if (hazard.kind === 'pulse') {
        // Faint halo showing how far it can reach.
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fillStyle = COLORS.enemy;
        ctx.globalAlpha = 0.22 + hazard.t * 0.25;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.lineWidth = 2;
        ctx.strokeStyle = COLORS.wallLine;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(x, y, Math.min(7, r), 0, TAU);
        ctx.fillStyle = COLORS.enemy;
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.stroke();
        continue;
      }

      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fillStyle = COLORS.enemy;
      ctx.fill();
      ctx.lineWidth = hazard.kind === 'bullet' ? 2 : 3;
      ctx.strokeStyle = COLORS.wallLine;
      ctx.stroke();

      if (hazard.kind === 'chaser') {
        // A second ring marks the one enemy that follows you.
        ctx.beginPath();
        ctx.arc(x, y, r * 0.55, 0, TAU);
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = COLORS.enemyHi;
        ctx.stroke();
        continue;
      }

      ctx.beginPath();
      ctx.arc(x - r * 0.3, y - r * 0.35, r * 0.3, 0, TAU);
      ctx.fillStyle = COLORS.enemyHi;
      ctx.fill();
    }
  }

  private drawPlayer(ctx: CanvasRenderingContext2D): void {
    const half = PLAYER_SIZE / 2;
    const x = this.player.x - half;
    const y = this.player.y - half;

    ctx.fillStyle = COLORS.player;
    ctx.fillRect(x, y, PLAYER_SIZE, PLAYER_SIZE);
    ctx.fillStyle = COLORS.playerHi;
    ctx.fillRect(x + 4, y + 4, PLAYER_SIZE - 8, 4);
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.wallLine;
    ctx.strokeRect(x + 1.5, y + 1.5, PLAYER_SIZE - 3, PLAYER_SIZE - 3);
  }

  /** Virtual thumbstick, drawn wherever the finger went down. */
  private drawStick(ctx: CanvasRenderingContext2D): void {
    if (this.state !== 'playing') return;
    if (!this.pointer.isDown) return;
    const origin = this.pointer.stickOrigin;
    if (origin.y < HUD_H) return;

    const knob = this.pointer.stickKnob;
    const dx = knob.x - origin.x;
    const dy = knob.y - origin.y;
    const distance = Math.hypot(dx, dy);
    const factor = distance > STICK_RANGE ? STICK_RANGE / distance : 1;

    ctx.beginPath();
    ctx.arc(origin.x, origin.y, STICK_RANGE, 0, TAU);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(origin.x + dx * factor, origin.y + dy * factor, 20, 0, TAU);
    ctx.fillStyle = COLORS.face;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = COLORS.ink;
    ctx.stroke();
  }

  /* ---------------------------------------------------------------- *
   * Status bar
   * ---------------------------------------------------------------- */

  private drawHud(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = COLORS.face;
    ctx.fillRect(0, 0, VIEW_W, HUD_H);
    ctx.fillStyle = COLORS.faceLight;
    ctx.fillRect(0, 0, VIEW_W, 2);
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(0, HUD_H - 3, VIEW_W, 3);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255,45,45,${this.flash * 0.4})`;
      ctx.fillRect(0, 0, VIEW_W, HUD_H - 3);
    }

    if (this.compact) {
      // Phones: three wide readouts, no room for the level name.
      const stats: Array<[string, string]> = [
        ['LEVEL', `${this.levelIndex + 1}/${LEVELS.length}`],
        ['COINS', `${this.level.collectedCoins}/${this.level.totalCoins}`],
        ['DEATHS', `${this.deaths}`],
      ];
      let x = 14;
      for (const [label, value] of stats) {
        this.text(ctx, label, x, 17, scaleFont(FONT_LABEL, 1.5), COLORS.inkMuted);
        this.readout(ctx, x, 21, 188, 32, value, scaleFont(FONT_VALUE, 1.55));
        x += 204;
      }
    } else {
      const stats: Array<[string, string]> = [
        ['LEVEL', `${this.levelIndex + 1} / ${LEVELS.length}`],
        ['COINS', `${this.level.collectedCoins} / ${this.level.totalCoins}`],
        ['DEATHS', `${this.deaths}`],
        ['TIME', formatTime(this.runTime)],
      ];
      let x = 14;
      for (const [label, value] of stats) {
        this.text(ctx, label, x, 19, FONT_LABEL, COLORS.inkMuted);
        this.readout(ctx, x, 25, 84, 22, value, FONT_VALUE);
        x += 96;
      }

      const right = PAUSE_BUTTON.x - 10;
      this.text(ctx, this.level.name, right, 24, FONT_BODY_BOLD, COLORS.ink, 'right');
      const note =
        this.mode === 'campaign'
          ? this.best === null
            ? 'Best run: none yet'
            : `Best run: ${this.best} deaths`
          : this.mode === 'sudden'
            ? 'Sudden death — one life'
            : 'Practice — not ranked';
      this.text(ctx, note, right, 43, FONT_BODY, COLORS.inkMuted, 'right');
    }

    this.drawPauseButton(ctx);
    this.drawRestartButton(ctx);
  }

  private drawPauseButton(ctx: CanvasRenderingContext2D): void {
    const b = this.pauseBox;
    this.bevelBox(ctx, b.x, b.y, b.w, b.h, this.state !== 'paused');
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const s = this.compact ? 1.5 : 1;
    ctx.fillStyle = COLORS.ink;
    if (this.state === 'paused') {
      // Play triangle
      ctx.beginPath();
      ctx.moveTo(cx - 5 * s, cy - 7 * s);
      ctx.lineTo(cx + 7 * s, cy);
      ctx.lineTo(cx - 5 * s, cy + 7 * s);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillRect(cx - 6 * s, cy - 7 * s, 4 * s, 14 * s);
      ctx.fillRect(cx + 2 * s, cy - 7 * s, 4 * s, 14 * s);
    }
  }

  private drawRestartButton(ctx: CanvasRenderingContext2D): void {
    const b = this.restartBox;
    const font = this.compact ? scaleFont(FONT_GLYPH, 1.5) : FONT_GLYPH;
    this.bevelBox(ctx, b.x, b.y, b.w, b.h, true);
    this.text(
      ctx,
      'R',
      b.x + b.w / 2,
      b.y + b.h / 2 + (this.compact ? 9 : 6),
      font,
      COLORS.ink,
      'center',
    );
  }

  /** Sunken readout field, the way old interfaces showed numbers. */
  private readout(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    value: string,
    font: string,
  ): void {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COLORS.fieldBg;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = COLORS.faceShadow;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, h - 2);
    this.text(ctx, value, x + w / 2, y + h / 2 + fontSize(font) * 0.36, font, COLORS.ink, 'center');
  }

  /* ---------------------------------------------------------------- *
   * Dialogs
   * ---------------------------------------------------------------- */

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    switch (this.state) {
      case 'title':
        this.dialog(
          ctx,
          'The Impossible Game',
          [
            { text: 'THE IMPOSSIBLE GAME', font: FONT_HEAD },
            {
              text: 'a remake of World’s Hardest Game',
              font: FONT_BODY,
              color: COLORS.inkMuted,
              space: 6,
              compactHide: true,
            },
            { text: 'Collect every yellow coin, then reach the green field.', font: FONT_BODY, space: 22 },
            { text: 'One touch of blue and the level starts over.', font: FONT_BODY, space: 6 },
            {
              text:
                this.best === null
                  ? `${LEVELS.length} levels, no checkpoints.`
                  : `Your best run so far: ${this.best} deaths`,
              font: FONT_BODY_BOLD,
              space: 16,
            },
          ],
          'Press space or tap to start',
        );
        break;

      case 'ready':
        this.dialog(
          ctx,
          this.mode === 'practice'
            ? `Practice — level ${this.levelIndex + 1}`
            : `${MODE_LABELS[this.mode]} — level ${this.levelIndex + 1} of ${LEVELS.length}`,
          [
            { text: this.level.name, font: FONT_HEAD },
            { text: this.level.hint, font: FONT_BODY, color: COLORS.inkMuted, space: 12 },
            ...(this.mode === 'sudden'
              ? [
                  {
                    text: 'One hit ends the run.',
                    font: FONT_BODY_BOLD,
                    space: 8,
                  },
                ]
              : []),
          ],
          'Space or tap',
        );
        break;

      case 'levelComplete':
        this.dialog(
          ctx,
          'Level cleared',
          [
            { text: 'LEVEL CLEARED', font: FONT_HEAD },
            { text: `Deaths so far: ${this.deaths}`, font: FONT_BODY, space: 12 },
            {
              text: `On the board as unranked until level ${LEVELS.length} is done.`,
              font: FONT_BODY,
              color: COLORS.inkMuted,
              space: 6,
              compactHide: true,
            },
          ],
          `Continue to level ${this.levelIndex + 2}`,
        );
        break;

      case 'finished':
        this.dialog(
          ctx,
          'Run complete',
          [
            { text: 'ALL LEVELS CLEARED', font: FONT_HEAD },
            { text: `${this.deaths} deaths in ${formatTime(this.runTime)}`, font: FONT_SUB, space: 14 },
            {
              text:
                this.best === this.deaths
                  ? 'That is a new personal best.'
                  : `Personal best: ${this.best} deaths`,
              font: FONT_BODY,
              color: COLORS.inkMuted,
              space: 10,
              compactHide: true,
            },
            {
              text: 'Your score is being sent to the scoreboard below.',
              font: FONT_BODY,
              color: COLORS.inkMuted,
              space: 6,
            },
          ],
          'Play again',
        );
        break;

      case 'paused':
        this.dialog(ctx, 'Paused', [{ text: 'PAUSED', font: FONT_HEAD }], 'Space, P or tap');
        break;

      case 'gameOver':
        this.dialog(
          ctx,
          'Sudden death',
          [
            { text: 'ONE HIT WAS ENOUGH', font: FONT_HEAD },
            {
              text: `You got to level ${this.levelIndex + 1} of ${LEVELS.length} in ${formatTime(this.runTime)}.`,
              font: FONT_BODY,
              space: 12,
            },
          ],
          'Back to the menu',
        );
        break;

      case 'practiceDone':
        this.dialog(
          ctx,
          'Practice',
          [
            { text: 'LEVEL CLEARED', font: FONT_HEAD },
            {
              text: `${this.deaths} deaths in ${formatTime(this.runTime)}. Practice is never ranked.`,
              font: FONT_BODY,
              color: COLORS.inkMuted,
              space: 12,
            },
          ],
          'Back to the menu',
        );
        break;

      case 'playing':
      case 'dying':
        break;
    }
  }

  /**
   * Classic dialog window with a title bar, text and a button.
   *
   * On a phone the whole dialog is scaled up. The largest factor that still
   * fits inside the playfield wins, so text can never spill out of the box.
   */
  private dialog(
    ctx: CanvasRenderingContext2D,
    title: string,
    lines: DialogLine[],
    action?: string,
  ): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, HUD_H, VIEW_W, VIEW_H - HUD_H);

    const visible = this.compact ? lines.filter((line) => !line.compactHide) : lines;
    const maxW = VIEW_W - 30;
    const maxH = VIEW_H - HUD_H - 20;

    let layout = this.measureDialog(ctx, title, visible, action, 1);
    for (const factor of this.compact ? [1.9, 1.7, 1.5, 1.3, 1.15, 1] : [1]) {
      layout = this.measureDialog(ctx, title, visible, action, factor);
      if (layout.boxW <= maxW && layout.boxH <= maxH) break;
    }

    const { boxW, boxH, pad, titleH, buttonH, buttonW, titleFont, actionFont } = layout;
    const boxX = Math.round((VIEW_W - boxW) / 2);
    const boxY = Math.round(HUD_H + (VIEW_H - HUD_H - boxH) / 2);

    this.bevelBox(ctx, boxX, boxY, boxW, boxH, true);

    const gradient = ctx.createLinearGradient(boxX, 0, boxX + boxW, 0);
    gradient.addColorStop(0, COLORS.titleBar);
    gradient.addColorStop(1, COLORS.titleBar2);
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX + 4, boxY + 4, boxW - 8, titleH - 6);
    this.text(
      ctx,
      title,
      boxX + 12,
      boxY + 4 + (titleH - 6) / 2 + fontSize(titleFont) * 0.36,
      titleFont,
      COLORS.titleText,
    );

    let y = boxY + titleH + pad;
    visible.forEach((line, i) => {
      const size = layout.lineSizes[i]!;
      if (i > 0) y += layout.lineSpaces[i]!;
      y += size;
      this.text(
        ctx,
        line.text,
        boxX + boxW / 2,
        y,
        layout.lineFonts[i]!,
        line.color ?? COLORS.ink,
        'center',
      );
    });

    if (action) {
      const bx = Math.round(boxX + (boxW - buttonW) / 2);
      const by = boxY + boxH - pad - buttonH;
      const raised = Math.floor(this.stateTime * 1.6) % 2 === 0;
      this.bevelBox(ctx, bx, by, buttonW, buttonH, raised);
      this.text(
        ctx,
        action,
        bx + buttonW / 2 + (raised ? 0 : 1),
        by + buttonH / 2 + fontSize(actionFont) * 0.36 + (raised ? 0 : 1),
        actionFont,
        COLORS.ink,
        'center',
      );
    }
  }

  /** Works out the dialog geometry for one font scale factor. */
  private measureDialog(
    ctx: CanvasRenderingContext2D,
    title: string,
    lines: DialogLine[],
    action: string | undefined,
    factor: number,
  ): DialogLayout {
    const pad = Math.round(22 * factor);
    const titleH = Math.round(26 * factor);
    const buttonH = Math.round(30 * factor);
    const titleFont = scaleFont(FONT_TITLEBAR, factor);
    const actionFont = scaleFont(FONT_BODY_BOLD, factor);

    const lineFonts: string[] = [];
    const lineSizes: number[] = [];
    const lineSpaces: number[] = [];
    let contentW = 0;
    let contentH = 0;

    lines.forEach((line, i) => {
      const font = scaleFont(line.font, factor);
      ctx.font = font;
      contentW = Math.max(contentW, ctx.measureText(line.text).width);
      const size = fontSize(font);
      const space = Math.round((line.space ?? 10) * factor);
      lineFonts.push(font);
      lineSizes.push(size);
      lineSpaces.push(space);
      contentH += size + (i === 0 ? 0 : space);
    });

    ctx.font = titleFont;
    contentW = Math.max(contentW, ctx.measureText(title).width + 40 * factor);

    let buttonW = 0;
    if (action) {
      ctx.font = actionFont;
      buttonW = Math.ceil(ctx.measureText(action).width) + Math.round(48 * factor);
      contentW = Math.max(contentW, buttonW);
    }

    const boxW = Math.max(Math.round(400 * factor), Math.ceil(contentW) + pad * 2);
    const boxH =
      titleH + pad + contentH + (action ? Math.round(20 * factor) + buttonH : 0) + pad;

    return { boxW, boxH, pad, titleH, buttonH, buttonW, titleFont, actionFont, lineFonts, lineSizes, lineSpaces };
  }

  /** Rectangle with a black frame and a raised or sunken bevel. */
  private bevelBox(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    raised: boolean,
  ): void {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COLORS.face;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);

    const light = raised ? COLORS.faceLight : COLORS.faceShadow;
    const dark = raised ? COLORS.faceShadow : COLORS.faceLight;
    ctx.fillStyle = light;
    ctx.fillRect(x + 1, y + 1, w - 2, 2);
    ctx.fillRect(x + 1, y + 1, 2, h - 2);
    ctx.fillStyle = dark;
    ctx.fillRect(x + 1, y + h - 3, w - 2, 2);
    ctx.fillRect(x + w - 3, y + 1, 2, h - 2);
  }

  private text(
    ctx: CanvasRenderingContext2D,
    value: string,
    x: number,
    y: number,
    font: string,
    color: string,
    align: CanvasTextAlign = 'left',
  ): void {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(value, x, y);
  }
}

function inside(point: Vec2, box: Box, pad = 0): boolean {
  return (
    point.x >= box.x - pad &&
    point.x <= box.x + box.w + pad &&
    point.y >= box.y - pad &&
    point.y <= box.y + box.h + pad
  );
}

function fontSize(font: string): number {
  return Number.parseInt(font.match(/(\d+)px/)?.[1] ?? '16', 10);
}

/** Returns the same font shorthand with its size multiplied. */
function scaleFont(font: string, factor: number): string {
  if (factor === 1) return font;
  return font.replace(/(\d+)px/, (_, size: string) =>
    `${Math.max(1, Math.round(Number(size) * factor))}px`,
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function readBest(): number | null {
  try {
    const raw = localStorage.getItem(BEST_KEY);
    if (raw === null) return null;
    const value = Number.parseInt(raw, 10);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function writeBest(value: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(value));
  } catch {
    /* localStorage can be blocked, that is no reason to crash. */
  }
}
