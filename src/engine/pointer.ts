import { clamp, type Vec2 } from './math';

/** Movement below this (in logical pixels) counts as holding still. */
const DEAD_ZONE = 8;
/** Distance at which the stick is fully deflected, also its drawn radius. */
export const STICK_RANGE = 70;
/** A touch shorter and tighter than this counts as a tap, not a drag. */
const TAP_DISTANCE = 14;
const TAP_DURATION_MS = 400;

/**
 * Touch and mouse input on the canvas.
 *
 * Pressing anywhere drops a virtual stick at that point; dragging away from it
 * steers. A short press without dragging is reported as a tap, which the game
 * uses to confirm dialogs and to hit the on-screen buttons.
 */
export class PointerInput {
  private pointerId: number | null = null;
  private readonly origin: Vec2 = { x: 0, y: 0 };
  private readonly current: Vec2 = { x: 0, y: 0 };
  private readonly vector: Vec2 = { x: 0, y: 0 };
  private startedAt = 0;
  private moved = 0;
  private pendingTap: Vec2 | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly viewWidth: number,
    private readonly viewHeight: number,
  ) {
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  }

  /** Converts a browser event position into logical canvas coordinates. */
  private toLogical(event: PointerEvent, out: Vec2): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    out.x = ((event.clientX - rect.left) / rect.width) * this.viewWidth;
    out.y = ((event.clientY - rect.top) / rect.height) * this.viewHeight;
    return out;
  }

  private readonly onDown = (event: PointerEvent): void => {
    if (this.pointerId !== null) return;
    event.preventDefault();
    // Capture keeps the stick alive when the finger leaves the canvas. It can
    // throw for pointers the browser no longer tracks, which must not take the
    // rest of the input handling down with it.
    try {
      this.canvas.setPointerCapture(event.pointerId);
    } catch {
      /* steering still works, it just stops at the canvas edge */
    }
    this.pointerId = event.pointerId;
    this.toLogical(event, this.origin);
    this.current.x = this.origin.x;
    this.current.y = this.origin.y;
    this.startedAt = event.timeStamp;
    this.moved = 0;
    this.vector.x = 0;
    this.vector.y = 0;
  };

  private readonly onMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    this.toLogical(event, this.current);

    const dx = this.current.x - this.origin.x;
    const dy = this.current.y - this.origin.y;
    const distance = Math.hypot(dx, dy);
    this.moved = Math.max(this.moved, distance);

    if (distance <= DEAD_ZONE) {
      this.vector.x = 0;
      this.vector.y = 0;
      return;
    }
    const strength = clamp((distance - DEAD_ZONE) / (STICK_RANGE - DEAD_ZONE), 0, 1);
    this.vector.x = (dx / distance) * strength;
    this.vector.y = (dy / distance) * strength;
  };

  private readonly onUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    event.preventDefault();
    const quick = event.timeStamp - this.startedAt <= TAP_DURATION_MS;
    if (quick && this.moved <= TAP_DISTANCE) {
      this.pendingTap = { x: this.origin.x, y: this.origin.y };
    }
    this.release(event.pointerId);
  };

  private readonly onCancel = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) return;
    this.release(event.pointerId);
  };

  private release(pointerId: number): void {
    try {
      if (this.canvas.hasPointerCapture(pointerId)) {
        this.canvas.releasePointerCapture(pointerId);
      }
    } catch {
      /* already gone */
    }
    this.pointerId = null;
    this.vector.x = 0;
    this.vector.y = 0;
    this.moved = 0;
  }

  /** Steering direction, length 0 to 1. */
  get axis(): Vec2 {
    return this.vector;
  }

  get isSteering(): boolean {
    return this.pointerId !== null && (this.vector.x !== 0 || this.vector.y !== 0);
  }

  /** True while a pointer is held down, even if it has not moved yet. */
  get isDown(): boolean {
    return this.pointerId !== null;
  }

  get stickOrigin(): Vec2 {
    return this.origin;
  }

  get stickKnob(): Vec2 {
    return this.current;
  }

  /** Returns and clears a pending tap position, or null if there was none. */
  takeTap(): Vec2 | null {
    const tap = this.pendingTap;
    this.pendingTap = null;
    return tap;
  }

  reset(): void {
    if (this.pointerId !== null) this.release(this.pointerId);
    this.pendingTap = null;
  }
}
