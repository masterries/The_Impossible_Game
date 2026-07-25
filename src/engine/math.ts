export const TAU = Math.PI * 2;

export interface Vec2 {
  x: number;
  y: number;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Positive modulo, unlike `%` it also works for negative values. */
export function wrap(value: number, length: number): number {
  const m = value % length;
  return m < 0 ? m + length : m;
}

/** Shortest distance between a point and an axis-aligned box. */
export function pointBoxDistanceSq(
  px: number,
  py: number,
  cx: number,
  cy: number,
  halfW: number,
  halfH: number,
): number {
  const dx = Math.max(Math.abs(px - cx) - halfW, 0);
  const dy = Math.max(Math.abs(py - cy) - halfH, 0);
  return dx * dx + dy * dy;
}
