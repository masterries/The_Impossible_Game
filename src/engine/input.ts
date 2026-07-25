import type { Vec2 } from './math';

const MOVE_KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
};

/** Tasten, deren Browser-Standardverhalten (Scrollen) wir unterdrücken. */
const SWALLOW = new Set([...Object.keys(MOVE_KEYS), 'Space']);

/**
 * Tastatur-Abfrage mit Frame-Semantik:
 * `isDown` gilt dauerhaft, `wasPressed` nur im Frame des Tastendrucks.
 */
export class Input {
  private readonly down = new Set<string>();
  private readonly pressed = new Set<string>();
  private readonly axisVec: Vec2 = { x: 0, y: 0 };

  constructor(private readonly target: EventTarget = window) {
    this.target.addEventListener('keydown', this.onKeyDown as EventListener);
    this.target.addEventListener('keyup', this.onKeyUp as EventListener);
    window.addEventListener('blur', this.reset);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.repeat) {
      if (SWALLOW.has(event.code)) event.preventDefault();
      return;
    }
    if (SWALLOW.has(event.code)) event.preventDefault();
    this.down.add(event.code);
    this.pressed.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.down.delete(event.code);
  };

  /** Alle Tasten loslassen – z. B. wenn das Fenster den Fokus verliert. */
  readonly reset = (): void => {
    this.down.clear();
    this.pressed.clear();
  };

  isDown(code: string): boolean {
    return this.down.has(code);
  }

  wasPressed(...codes: string[]): boolean {
    return codes.some((code) => this.pressed.has(code));
  }

  /** Irgendeine „Weiter"-Taste (Leertaste / Enter). */
  anyConfirm(): boolean {
    return this.wasPressed('Space', 'Enter', 'NumpadEnter');
  }

  /** Bewegungsrichtung, auf Länge 1 normiert (Diagonalen sind nicht schneller). */
  get axis(): Vec2 {
    let x = 0;
    let y = 0;
    for (const code of this.down) {
      switch (MOVE_KEYS[code]) {
        case 'up':
          y -= 1;
          break;
        case 'down':
          y += 1;
          break;
        case 'left':
          x -= 1;
          break;
        case 'right':
          x += 1;
          break;
        default:
          break;
      }
    }
    if (x !== 0 && y !== 0) {
      x *= Math.SQRT1_2;
      y *= Math.SQRT1_2;
    }
    this.axisVec.x = Math.sign(x) * Math.min(Math.abs(x), 1);
    this.axisVec.y = Math.sign(y) * Math.min(Math.abs(y), 1);
    return this.axisVec;
  }

  /** Muss am Ende jedes Frames aufgerufen werden. */
  endFrame(): void {
    this.pressed.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.onKeyUp as EventListener);
    window.removeEventListener('blur', this.reset);
  }
}
