/**
 * Minimal sound engine on top of the Web Audio API.
 * Every tone is synthesised, so the game ships without audio assets.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  enabled = true;

  /** Must run from a user interaction because of the autoplay policy. */
  unlock(): void {
    const ctx = this.ensure();
    if (ctx && ctx.state === 'suspended') void ctx.resume();
  }

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.35;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  private tone(
    freq: number,
    duration: number,
    type: OscillatorType,
    gain: number,
    delay = 0,
    slideTo?: number,
  ): void {
    if (!this.enabled) return;
    const ctx = this.ensure();
    if (!ctx || !this.master) return;

    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, start);
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), start + duration);
    }

    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(gain, start + 0.008);
    env.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    osc.connect(env).connect(this.master);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  coin(): void {
    this.tone(988, 0.07, 'square', 0.25);
    this.tone(1319, 0.12, 'square', 0.22, 0.06);
  }

  death(): void {
    this.tone(220, 0.38, 'sawtooth', 0.3, 0, 55);
    this.tone(110, 0.42, 'square', 0.16, 0.02, 40);
  }

  levelComplete(): void {
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => this.tone(freq, 0.16, 'triangle', 0.26, i * 0.09));
  }

  victory(): void {
    const notes = [523, 659, 784, 1047, 784, 1047, 1319];
    notes.forEach((freq, i) => this.tone(freq, 0.2, 'triangle', 0.26, i * 0.12));
  }

  select(): void {
    this.tone(660, 0.06, 'square', 0.18);
  }
}
