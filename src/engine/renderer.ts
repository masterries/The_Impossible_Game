/**
 * Canvas-Wrapper mit fester logischer Auflösung.
 *
 * Gezeichnet wird immer in Logik-Koordinaten (`width` × `height`); die
 * tatsächliche Pixelgröße folgt der CSS-Breite und dem Device-Pixel-Ratio,
 * damit auf HiDPI-Displays nichts unscharf wird.
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
    if (!ctx) throw new Error('Canvas-2D-Kontext ist nicht verfügbar.');
    this.ctx = ctx;

    canvas.style.aspectRatio = `${width} / ${height}`;

    // Das Canvas selbst beobachten: seine CSS-Größe hängt an width:100% und
    // aspect-ratio, nicht an den width/height-Attributen. Ein Rückkopplungs-
    // kreis ist damit ausgeschlossen.
    new ResizeObserver(() => this.resize()).observe(canvas);
    window.addEventListener('resize', () => this.resize());

    this.resize();
    // Beim ersten Aufruf steht das Layout eventuell noch nicht, deshalb nach
    // dem ersten Frame noch einmal nachmessen.
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

  /** Transform zurücksetzen und Hintergrund füllen. */
  begin(background: string): void {
    const { ctx } = this;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, this.width, this.height);
  }
}
