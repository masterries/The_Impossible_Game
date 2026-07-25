import './style.css';
import { Game } from './game/game';

const canvas = document.querySelector<HTMLCanvasElement>('#game');
if (!canvas) throw new Error('Canvas #game nicht gefunden.');

const game = new Game(canvas);
game.start();

if (import.meta.env.DEV) {
  // Debug-Hook: erlaubt es, das Spiel in der Konsole zu inspizieren.
  (window as unknown as Record<string, unknown>).__game = game;
}

// Audio darf erst nach einer Nutzerinteraktion starten (Browser-Autoplay-Policy).
const unlock = (): void => game.sfx.unlock();
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

const soundToggle = document.querySelector<HTMLButtonElement>('#sound-toggle');
soundToggle?.addEventListener('click', () => {
  game.sfx.enabled = !game.sfx.enabled;
  soundToggle.setAttribute('aria-pressed', String(game.sfx.enabled));
  soundToggle.textContent = game.sfx.enabled ? 'Ton: an' : 'Ton: aus';
  soundToggle.blur(); // sonst schluckt der Button die Leertaste
});
