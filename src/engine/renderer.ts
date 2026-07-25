/**
 * Canvas wrapper with a fixed logical resolution.
 *
 * Drawing always happens in logical coordinates (`width` × `height`); the real
 * pixel size follows the CSS width and the device pixel ratio so nothing turns
 * blurry on HiDPI displays.
 */
export class Renderer {
  readonly ctx: CanvasRenderingContext2D;
  private scale = 1;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly width: number,
    readonly height: number,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D context is not available.');
    this.ctx = ctx;

    canvas.style.aspectRatio = `${width} / ${height}`;

    // Observe the canvas itself: its CSS size comes from width:100% and
    // aspect-ratio, not from the width/height attributes, so there is no
    // feedback loop.
    new ResizeObserver(() => this.resize()).observe(canvas);
    window.addEventListener('resize', () => this.resize());

    this.resize();
    // Layout may not be settled during construction, so measure again after
    // the first frame.
    requestAnimationFrame(() => this.resize());
  }

  private resize(): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cssWidth = this.canvas.clientWidth || this.width;
    const cssHeight = (cssWidth * this.height) / this.width;

    const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
    const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (this.canvas.width !== pixelWidth || this.canvas.height !== pixelHeight) {
      this.canvas.width = pixelWidth;
      this.canvas.height = pixelHeight;
    }
    this.scale = pixelWidth / this.width;
  }

  /**
   * How many CSS pixels one logical pixel currently occupies. Below roughly
   * 0.6 the canvas is on a phone and text has to be drawn larger to stay
   * readable.
   */
  get displayScale(): number {
    return (this.canvas.clientWidth || this.width) / this.width;
  }

  /** Reset the transform and clear the background. */
  begin(background: string): void {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}
