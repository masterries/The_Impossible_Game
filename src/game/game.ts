import { Sfx } from '../engine/audio';
import { Input } from '../engine/input';
import { GameLoop } from '../engine/loop';
import { pointBoxDistanceSq, TAU } from '../engine/math';
import { Renderer } from '../engine/renderer';
import {
  COIN_RADIUS,
  COLORS,
  COLS,
  DEATH_FREEZE,
  ENEMY_RADIUS,
  FONT_BODY,
  FONT_BODY_BOLD,
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
import { Tile } from './types';

type State = 'title' | 'ready' | 'playing' | 'dying' | 'levelComplete' | 'finished' | 'paused';

interface DialogLine {
  text: string;
  font: string;
  color?: string;
  space?: number;
}

const BEST_KEY = 'impossible-game.best-deaths';

export class Game {
  private readonly renderer: Renderer;
  private readonly input: Input;
  private readonly loop: GameLoop;
  private readonly particles = new Particles();
  private readonly player = new Player();

  readonly sfx = new Sfx();

  private levelIndex = 0;
  private level: Level;
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
    this.level = new Level(LEVELS[0]!);
    this.player.spawn(this.level);
    this.best = readBest();

    this.loop = new GameLoop(
      (dt) => this.update(dt),
      () => this.draw(),
    );

    window.addEventListener('blur', () => {
      if (this.state === 'playing') this.setState('paused');
    });
  }

  start(): void {
    this.loop.start();
  }

  /* ---------------------------------------------------------------- *
   * Ablaufsteuerung
   * ---------------------------------------------------------------- */

  private setState(next: State): void {
    this.state = next;
    this.stateTime = 0;
  }

  private startRun(): void {
    this.deaths = 0;
    this.runTime = 0;
    this.levelIndex = 0;
    this.loadLevel(0);
  }

  private loadLevel(index: number): void {
    this.levelIndex = index;
    this.level = new Level(LEVELS[index]!);
    this.level.reset();
    this.player.spawn(this.level);
    this.particles.clear();
    this.setState('ready');
  }

  private restartLevel(): void {
    this.level.reset();
    this.player.spawn(this.level);
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
    if (this.levelIndex + 1 >= LEVELS.length) {
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
  }

  /* ---------------------------------------------------------------- *
   * Update
   * ---------------------------------------------------------------- */

  private update(dt: number): void {
    this.stateTime += dt;
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 4);
    this.particles.update(dt);

    switch (this.state) {
      case 'title':
        if (this.input.anyConfirm()) {
          this.sfx.unlock();
          this.sfx.select();
          this.startRun();
        }
        break;

      case 'ready':
        if (this.input.anyConfirm()) {
          this.sfx.select();
          this.setState('playing');
        }
        break;

      case 'playing':
        this.updatePlaying(dt);
        break;

      case 'dying':
        if (this.stateTime >= DEATH_FREEZE) this.restartLevel();
        break;

      case 'levelComplete':
        if (this.input.anyConfirm()) {
          this.sfx.select();
          this.loadLevel(this.levelIndex + 1);
        }
        break;

      case 'finished':
        if (this.input.anyConfirm()) {
          this.sfx.select();
          this.startRun();
        }
        break;

      case 'paused':
        if (this.input.wasPressed('KeyP', 'Escape') || this.input.anyConfirm()) {
          this.setState('playing');
        }
        break;
    }

    const restartable = this.state === 'playing' || this.state === 'dying' || this.state === 'paused';
    if (restartable && this.input.wasPressed('KeyR')) {
      this.restartLevel();
    }

    this.input.endFrame();
  }

  private updatePlaying(dt: number): void {
    if (this.input.wasPressed('KeyP', 'Escape')) {
      this.setState('paused');
      return;
    }

    this.runTime += dt;
    this.level.advance(dt);
    this.player.update(dt, this.input.axis, this.level);

    const half = this.player.half;

    // Münzen einsammeln
    for (const coin of this.level.coins) {
      if (coin.collected) continue;
      const d2 = pointBoxDistanceSq(coin.x, coin.y, this.player.x, this.player.y, half, half);
      if (d2 <= COIN_RADIUS * COIN_RADIUS) {
        coin.collected = true;
        this.particles.burst(coin.x, coin.y, COLORS.coin, 10, 150, 5);
        this.sfx.coin();
      }
    }

    // Gegner-Treffer
    for (const enemy of this.level.enemies) {
      const d2 = pointBoxDistanceSq(
        enemy.pos.x,
        enemy.pos.y,
        this.player.x,
        this.player.y,
        half,
        half,
      );
      if (d2 <= ENEMY_RADIUS * ENEMY_RADIUS) {
        this.die();
        return;
      }
    }

    // Ziel erreicht?
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
    this.drawOverlay(ctx);
  }

  private drawField(ctx: CanvasRenderingContext2D): void {
    const level = this.level;
    const shakeAmount = this.shake * 7;
    const ox = shakeAmount ? (Math.random() - 0.5) * shakeAmount : 0;
    const oy = shakeAmount ? (Math.random() - 0.5) * shakeAmount : 0;

    ctx.save();
    ctx.translate(ox, HUD_H + oy);

    // Kacheln
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tile = level.tileAt(c, r);
        if (tile === Tile.Void) continue;
        const even = (c + r) % 2 === 0;
        ctx.fillStyle =
          tile === Tile.Floor
            ? even
              ? COLORS.floorA
              : COLORS.floorB
            : even
              ? COLORS.zoneA
              : COLORS.zoneB;
        ctx.fillRect(c * TILE, r * TILE, TILE, TILE);
      }
    }

    // Schwarze Umrandung an allen Außenkanten des begehbaren Bereichs
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

    // Zielzone bleibt verschlossen, solange Münzen fehlen
    if (!level.allCoinsCollected) {
      const pulse = 0.18 + 0.12 * Math.sin(level.time * 5);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = '#000';
      ctx.fillRect(level.end.x, level.end.y, level.end.w, level.end.h);
      ctx.globalAlpha = 1;
    }

    this.drawCoins(ctx);
    this.drawEnemies(ctx);
    if (this.state !== 'dying') this.drawPlayer(ctx);
    this.particles.draw(ctx);

    ctx.restore();
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

  private drawEnemies(ctx: CanvasRenderingContext2D): void {
    for (const enemy of this.level.enemies) {
      const { x, y } = enemy.pos;

      ctx.beginPath();
      ctx.arc(x, y, ENEMY_RADIUS, 0, TAU);
      ctx.fillStyle = COLORS.enemy;
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = COLORS.wallLine;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(x - ENEMY_RADIUS * 0.3, y - ENEMY_RADIUS * 0.35, ENEMY_RADIUS * 0.3, 0, TAU);
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

  /* ---------------------------------------------------------------- *
   * Anzeigeleiste
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

    const stats: Array<[string, string]> = [
      ['LEVEL', `${this.levelIndex + 1} / ${LEVELS.length}`],
      ['MÜNZEN', `${this.level.collectedCoins} / ${this.level.totalCoins}`],
      ['TODE', `${this.deaths}`],
      ['ZEIT', formatTime(this.runTime)],
    ];

    let x = 14;
    for (const [label, value] of stats) {
      this.text(ctx, label, x, 19, FONT_LABEL, COLORS.inkMuted);
      this.readout(ctx, x, 25, 84, 22, value);
      x += 96;
    }

    this.text(
      ctx,
      `Level ${this.levelIndex + 1}: ${this.level.name}`,
      VIEW_W - 14,
      24,
      FONT_BODY_BOLD,
      COLORS.ink,
      'right',
    );
    const record = this.best === null ? 'Bester Lauf: noch keiner' : `Bester Lauf: ${this.best} Tode`;
    this.text(ctx, record, VIEW_W - 14, 43, FONT_BODY, COLORS.inkMuted, 'right');
  }

  /** Vertieftes Anzeigefeld, wie man es von alten Bedienoberflächen kennt. */
  private readout(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    value: string,
  ): void {
    ctx.fillStyle = COLORS.ink;
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = COLORS.fieldBg;
    ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
    ctx.fillStyle = COLORS.faceShadow;
    ctx.fillRect(x + 1, y + 1, w - 2, 1);
    ctx.fillRect(x + 1, y + 1, 1, h - 2);
    this.text(ctx, value, x + w / 2, y + h - 6, FONT_VALUE, COLORS.ink, 'center');
  }

  /* ---------------------------------------------------------------- *
   * Dialoge
   * ---------------------------------------------------------------- */

  private drawOverlay(ctx: CanvasRenderingContext2D): void {
    switch (this.state) {
      case 'title':
        this.dialog(
          ctx,
          'The Impossible Game',
          [
            { text: 'THE IMPOSSIBLE GAME', font: FONT_HEAD },
            { text: 'ein Remake von World’s Hardest Game', font: FONT_BODY, color: COLORS.inkMuted, space: 6 },
            { text: 'Sammle alle gelben Münzen, dann erreiche das grüne Feld.', font: FONT_BODY, space: 22 },
            { text: 'Eine Berührung mit Blau, und das Level beginnt von vorn.', font: FONT_BODY, space: 6 },
            {
              text: this.best === null ? '6 Level, keine Speicherpunkte.' : `Bester Lauf bisher: ${this.best} Tode`,
              font: FONT_BODY_BOLD,
              space: 16,
            },
          ],
          'Leertaste zum Starten',
        );
        break;

      case 'ready':
        this.dialog(
          ctx,
          `Level ${this.levelIndex + 1} von ${LEVELS.length}`,
          [
            { text: this.level.name, font: FONT_HEAD },
            { text: this.level.hint, font: FONT_BODY, color: COLORS.inkMuted, space: 12 },
          ],
          'Leertaste',
        );
        break;

      case 'levelComplete':
        this.dialog(
          ctx,
          'Geschafft',
          [
            { text: 'LEVEL GESCHAFFT', font: FONT_HEAD },
            { text: `Tode bisher: ${this.deaths}`, font: FONT_BODY, space: 12 },
          ],
          `Weiter zu Level ${this.levelIndex + 2}`,
        );
        break;

      case 'finished':
        this.dialog(
          ctx,
          'Durchgespielt',
          [
            { text: 'ALLE LEVEL GESCHAFFT', font: FONT_HEAD },
            { text: `${this.deaths} Tode in ${formatTime(this.runTime)}`, font: FONT_SUB, space: 14 },
            {
              text: this.best === this.deaths ? 'Das ist ein neuer Bestwert.' : `Bester Lauf: ${this.best} Tode`,
              font: FONT_BODY,
              color: COLORS.inkMuted,
              space: 10,
            },
          ],
          'Noch einmal von vorn',
        );
        break;

      case 'paused':
        this.dialog(
          ctx,
          'Pause',
          [{ text: 'PAUSE', font: FONT_HEAD }],
          'Leertaste oder P zum Weitermachen',
        );
        break;

      case 'playing':
      case 'dying':
        break;
    }
  }

  /** Klassisches Dialogfenster mit Titelleiste, Text und Schaltfläche. */
  private dialog(
    ctx: CanvasRenderingContext2D,
    title: string,
    lines: DialogLine[],
    action?: string,
  ): void {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.fillRect(0, HUD_H, VIEW_W, VIEW_H - HUD_H);

    const PAD = 22;
    const TITLE_H = 26;
    const BUTTON_H = 30;

    let contentW = 0;
    let contentH = 0;
    const metrics = lines.map((line) => {
      ctx.font = line.font;
      contentW = Math.max(contentW, ctx.measureText(line.text).width);
      return { size: fontSize(line.font), space: line.space ?? 10 };
    });
    metrics.forEach((m, i) => {
      contentH += m.size + (i === 0 ? 0 : m.space);
    });

    ctx.font = FONT_TITLEBAR;
    contentW = Math.max(contentW, ctx.measureText(title).width + 40);

    let buttonW = 0;
    if (action) {
      ctx.font = FONT_BODY_BOLD;
      buttonW = Math.ceil(ctx.measureText(action).width) + 48;
      contentW = Math.max(contentW, buttonW);
    }

    const boxW = Math.min(VIEW_W - 60, Math.max(400, Math.ceil(contentW) + PAD * 2));
    const boxH = TITLE_H + PAD + contentH + (action ? 20 + BUTTON_H : 0) + PAD;
    const boxX = Math.round((VIEW_W - boxW) / 2);
    const boxY = Math.round(HUD_H + (VIEW_H - HUD_H - boxH) / 2);

    this.bevelBox(ctx, boxX, boxY, boxW, boxH, true);

    const gradient = ctx.createLinearGradient(boxX, 0, boxX + boxW, 0);
    gradient.addColorStop(0, COLORS.titleBar);
    gradient.addColorStop(1, COLORS.titleBar2);
    ctx.fillStyle = gradient;
    ctx.fillRect(boxX + 4, boxY + 4, boxW - 8, TITLE_H - 6);
    this.text(ctx, title, boxX + 12, boxY + 18, FONT_TITLEBAR, COLORS.titleText);

    let y = boxY + TITLE_H + PAD;
    lines.forEach((line, i) => {
      const m = metrics[i]!;
      if (i > 0) y += m.space;
      y += m.size;
      this.text(ctx, line.text, boxX + boxW / 2, y, line.font, line.color ?? COLORS.ink, 'center');
    });

    if (action) {
      const bx = Math.round(boxX + (boxW - buttonW) / 2);
      const by = boxY + boxH - PAD - BUTTON_H;
      const raised = Math.floor(this.stateTime * 1.6) % 2 === 0;
      this.bevelBox(ctx, bx, by, buttonW, BUTTON_H, raised);
      this.text(
        ctx,
        action,
        bx + buttonW / 2 + (raised ? 0 : 1),
        by + BUTTON_H / 2 + 4 + (raised ? 0 : 1),
        FONT_BODY_BOLD,
        COLORS.ink,
        'center',
      );
    }
  }

  /** Rechteck mit schwarzem Rahmen und erhabener bzw. vertiefter Kante. */
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

function fontSize(font: string): number {
  return Number.parseInt(font.match(/(\d+)px/)?.[1] ?? '16', 10);
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
    /* localStorage kann blockiert sein, das ist kein Grund abzustürzen. */
  }
}
