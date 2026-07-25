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

/** Keys whose default browser behaviour (scrolling) we suppress. */
const SWALLOW = new Set([...Object.keys(MOVE_KEYS), 'Space']);

/**
 * Keyboard state with frame semantics: `isDown` holds while a key is pressed,
 * `wasPressed` is true only during the frame the key went down.
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
    // Never swallow keys aimed at a text field.
    if (isTypingTarget(event.target)) return;
    if (SWALLOW.has(event.code)) event.preventDefault();
    if (event.repeat) return;
    this.down.add(event.code);
    this.pressed.add(event.code);
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.down.delete(event.code);
  };

  /** Release every key, for example when the window loses focus. */
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

  /** Any "continue" key (space or enter). */
  anyConfirm(): boolean {
    return this.wasPressed('Space', 'Enter', 'NumpadEnter');
  }

  /** Movement direction, normalised so diagonals are not faster. */
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

  /** Must be called at the end of every frame. */
  endFrame(): void {
    this.pressed.clear();
  }

  dispose(): void {
    this.target.removeEventListener('keydown', this.onKeyDown as EventListener);
    this.target.removeEventListener('keyup', this.onKeyUp as EventListener);
    window.removeEventListener('blur', this.reset);
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}
