import './style.css';
import { Game, type RunProgress } from './game/game';
import {
  fetchScores,
  formatDuration,
  startRun,
  submitScore,
  type RunTicket,
  type ScoreEntry,
} from './scoreboard';

const NAME_KEY = 'impossible-game.player-name';
const BOARD_SIZE = 10;

const canvas = must<HTMLCanvasElement>('#game');
const nameInput = must<HTMLInputElement>('#player-name');
const boardBody = must<HTMLTableSectionElement>('#board-body');
const boardStatus = must<HTMLParagraphElement>('#board-status');
const scoreForm = must<HTMLFormElement>('#score-form');
const soundToggle = must<HTMLButtonElement>('#sound-toggle');
const fullscreenToggle = must<HTMLButtonElement>('#fullscreen-toggle');
const exitImmersive = must<HTMLButtonElement>('#exit-immersive');

const game = new Game(canvas);

/** Ticket for the run in progress; the server issues it when a run starts. */
let ticket: RunTicket | null = null;
/** Id of this run's entry, so it can be highlighted in the table. */
let ownEntryId: number | null = null;
/** Progress whose submission failed, kept so Refresh can retry it. */
let pending: RunProgress | null = null;

/* -------------------------------------------------------------------------- */
/* Scoreboard                                                                  */
/* -------------------------------------------------------------------------- */

function setStatus(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
  boardStatus.textContent = message;
  boardStatus.dataset.tone = tone;
}

function addRow(entry: ScoreEntry, levelCount: number): void {
  const row = boardBody.insertRow();
  if (entry.id === ownEntryId) row.dataset.you = 'true';
  if (!entry.complete) row.dataset.unranked = 'true';

  const rank = row.insertCell();
  rank.className = 'board__rank';
  rank.textContent = entry.rank === null ? '–' : String(entry.rank);

  const name = row.insertCell();
  name.className = 'board__name';
  // textContent, never innerHTML: names come from the outside world.
  name.textContent = entry.name;

  const level = row.insertCell();
  level.className = 'board__num';
  level.textContent = entry.complete ? 'done' : `${entry.levels}/${levelCount}`;

  const deaths = row.insertCell();
  deaths.className = 'board__num';
  deaths.textContent = String(entry.deaths);

  const time = row.insertCell();
  time.className = 'board__num';
  time.textContent = formatDuration(entry.durationMs);
}

function addSeparator(text: string): void {
  const row = boardBody.insertRow();
  row.dataset.separator = 'true';
  const cell = row.insertCell();
  cell.colSpan = 5;
  cell.textContent = text;
}

async function refreshBoard(quiet = false): Promise<void> {
  if (!quiet) setStatus('Loading scoreboard…');
  try {
    const board = await fetchScores(BOARD_SIZE);
    boardBody.replaceChildren();

    for (const entry of board.scores) addRow(entry, board.levelCount);

    if (board.unranked.length > 0) {
      addSeparator('Unranked — did not finish all levels');
      for (const entry of board.unranked) addRow(entry, board.levelCount);
    }

    if (board.totalRuns === 0) {
      addSeparator('No runs yet. Clear level 1 to get on the board.');
    }

    if (!quiet) {
      setStatus(
        board.totalRuns === 0
          ? 'The board is empty.'
          : `${board.total} completed of ${board.totalRuns} runs.`,
      );
    }
  } catch {
    // A silent refresh that fails must not wipe the message about the run that
    // was just submitted successfully.
    if (!quiet) {
      boardBody.replaceChildren();
      setStatus('Scoreboard is offline. The game still works.', 'error');
    }
  }
}

/** Everyone needs a name, so pick one instead of dropping the run. */
function ensureName(): string {
  const typed = nameInput.value.trim();
  if (typed.length > 0) return typed;

  const generated = `Player ${Math.floor(1000 + Math.random() * 9000)}`;
  nameInput.value = generated;
  return generated;
}

async function requestTicket(): Promise<void> {
  ticket = null;
  ownEntryId = null;
  pending = null;
  try {
    ticket = await startRun();
  } catch {
    // Nothing to do here: the first submission will report the problem.
  }
}

async function handleProgress(progress: RunProgress): Promise<void> {
  if (!ticket) {
    pending = progress;
    setStatus('No ticket for this run, so it cannot be recorded. Is the API running?', 'error');
    return;
  }

  const name = ensureName();
  localStorage.setItem(NAME_KEY, name);
  pending = progress;

  try {
    const result = await submitScore({
      name,
      deaths: progress.deaths,
      durationMs: progress.durationMs,
      levels: progress.levels,
      ticket,
    });
    ownEntryId = result.id;
    pending = null;

    setStatus(
      result.complete
        ? `Run complete. Rank ${result.rank} of ${result.total}.`
        : `Saved as ${name}: level ${result.levels} of ${result.levelCount}, unranked until you finish.`,
      'success',
    );
    await refreshBoard(true);
  } catch (err) {
    setStatus(
      `${err instanceof Error ? err.message : 'Saving failed.'} Press Refresh to try again.`,
      'error',
    );
  }
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                      */
/* -------------------------------------------------------------------------- */

game.onRunStart = () => void requestTicket();
game.onProgress = (progress) => void handleProgress(progress);
game.start();

const storedName = localStorage.getItem(NAME_KEY);
if (storedName) nameInput.value = storedName;

scoreForm.addEventListener('submit', (event) => {
  event.preventDefault();
  nameInput.blur();
  // If a cleared level could not be recorded, Refresh retries it first.
  if (pending && ticket) {
    void handleProgress(pending);
    return;
  }
  void refreshBoard();
});

/* -------------------------------------------------------------------------- */
/* Fullscreen                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Two layers. The Fullscreen API where it exists, plus a CSS class that hides
 * the page chrome. iOS Safari refuses fullscreen for anything but video, so the
 * CSS layer is what actually makes the game fill the screen there.
 */
function setImmersive(on: boolean): void {
  document.documentElement.classList.toggle('is-immersive', on);
  fullscreenToggle.setAttribute('aria-pressed', String(on));
  fullscreenToggle.textContent = on ? 'Leave fullscreen' : 'Fullscreen';
  // The canvas changed size, so let the renderer measure again.
  window.dispatchEvent(new Event('resize'));
}

async function enterFullscreen(): Promise<void> {
  setImmersive(true);
  try {
    if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
      await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    }
  } catch {
    // Denied or unsupported: the CSS layer alone still fills the viewport.
  }
  try {
    // Landscape gives the playfield far more room. Only allowed in fullscreen
    // and only on some browsers, so failure is expected and harmless.
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (to: string) => Promise<void>;
    };
    await orientation.lock?.('landscape');
  } catch {
    /* not supported on this device */
  }
}

async function leaveFullscreen(): Promise<void> {
  setImmersive(false);
  try {
    (screen.orientation as ScreenOrientation & { unlock?: () => void }).unlock?.();
  } catch {
    /* ignore */
  }
  if (document.fullscreenElement) {
    try {
      await document.exitFullscreen();
    } catch {
      /* ignore */
    }
  }
}

fullscreenToggle.addEventListener('click', () => {
  const on = document.documentElement.classList.contains('is-immersive');
  void (on ? leaveFullscreen() : enterFullscreen());
  fullscreenToggle.blur();
});

exitImmersive.addEventListener('click', () => {
  void leaveFullscreen();
});

// Leaving fullscreen with Esc or a system gesture must not leave the page in
// immersive mode.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement) setImmersive(false);
});

// Audio may only start after a user interaction (autoplay policy).
const unlock = (): void => game.sfx.unlock();
window.addEventListener('pointerdown', unlock, { once: true });
window.addEventListener('keydown', unlock, { once: true });

soundToggle.addEventListener('click', () => {
  game.sfx.enabled = !game.sfx.enabled;
  soundToggle.setAttribute('aria-pressed', String(game.sfx.enabled));
  soundToggle.textContent = game.sfx.enabled ? 'Sound: on' : 'Sound: off';
  soundToggle.blur(); // otherwise the button swallows the space bar
});

void refreshBoard();

if (import.meta.env.DEV) {
  // Debug hook so the game can be inspected from the console.
  (window as unknown as Record<string, unknown>).__game = game;
}

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Element ${selector} not found.`);
  return element;
}
