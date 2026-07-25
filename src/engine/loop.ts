/**
 * Fixed timestep game loop.
 *
 * Physics and collision run deterministically with `step` seconds per update,
 * independent of the monitor refresh rate. Rendering happens once per frame.
 */
export class GameLoop {
  private rafId = 0;
  private last = 0;
  private accumulator = 0;
  private running = false;

  constructor(
    private readonly update: (dt: number) => void,
    private readonly render: () => void,
    private readonly step = 1 / 120,
    /** Per-frame ceiling so switching tabs does not trigger an update avalanche. */
    private readonly maxFrameTime = 0.25,
  ) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.accumulator = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  private readonly tick = (now: number): void => {
    if (!this.running) return;
    this.rafId = requestAnimationFrame(this.tick);

    const elapsed = Math.min((now - this.last) / 1000, this.maxFrameTime);
    this.last = now;
    this.accumulator += elapsed;

    let steps = 0;
    while (this.accumulator >= this.step && steps < 240) {
      this.update(this.step);
      this.accumulator -= this.step;
      steps++;
    }

    this.render();
  };
}
