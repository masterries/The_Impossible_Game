import './style.css';
import { Game, type RunResult } from './game/game';
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

const game = new Game(canvas);

/** Ticket for the run in progress; the server issues it when a run starts. */
let ticket: RunTicket | null = null;
/** Id of the entry submitted last, so it can be highlighted in the table. */
let ownEntryId: number | null = null;

/* -------------------------------------------------------------------------- */
/* Scoreboard                                                                  */
/* -------------------------------------------------------------------------- */

function setStatus(message: string, tone: 'info' | 'error' | 'success' = 'info'): void {
  boardStatus.textContent = message;
  boardStatus.dataset.tone = tone;
}

function renderScores(scores: ScoreEntry[]): void {
  boardBody.replaceChildren();

  if (scores.length === 0) {
    const row = boardBody.insertRow();
    const cell = row.insertCell();
    cell.colSpan = 4;
    cell.textContent = 'No runs yet. Be the first to finish all six levels.';
    return;
  }

  for (const entry of scores) {
    const row = boardBody.insertRow();
    if (entry.id === ownEntryId) row.dataset.you = 'true';

    const rank = row.insertCell();
    rank.className = 'board__rank';
    rank.textContent = String(entry.rank);

    const name = row.insertCell();
    name.className = 'board__name';
    // textContent, never innerHTML: names come from the outside world.
    name.textContent = entry.name;

    const deaths = row.insertCell();
    deaths.className = 'board__num';
    deaths.textContent = String(entry.deaths);

    const time = row.insertCell();
    time.className = 'board__num';
    time.textContent = formatDuration(entry.durationMs);
  }
}

async function refreshBoard(quiet = false): Promise<void> {
  if (!quiet) setStatus('Loading scoreboard…');
  try {
    const { scores, total } = await fetchScores(BOARD_SIZE);
    renderScores(scores);
    if (!quiet) {
      setStatus(
        total === 0
          ? 'The board is empty.'
          : `Showing the top ${scores.length} of ${total} runs.`,
      );
    }
  } catch {
    boardBody.replaceChildren();
    setStatus('Scoreboard is offline. The game still works.', 'error');
  }
}

async function requestTicket(): Promise<void> {
  ticket = null;
  try {
    ticket = await startRun();
  } catch {
    // Nothing to do here: submitting will report the problem.
  }
}

async function handleRunFinish(result: RunResult): Promise<void> {
  const name = nameInput.value.trim();

  if (name.length === 0) {
    setStatus('Enter a name and finish another run to get on the board.', 'error');
    return;
  }
  if (!ticket) {
    setStatus('No ticket for this run, so it cannot be submitted. Is the API running?', 'error');
    return;
  }

  localStorage.setItem(NAME_KEY, name);
  setStatus('Submitting your run…');

  const used = ticket;
  ticket = null;

  try {
    const submitted = await submitScore({
      name,
      deaths: result.deaths,
      durationMs: result.durationMs,
      levels: result.levels,
      ticket: used,
    });
    ownEntryId = submitted.id;
    setStatus(`Submitted. You are rank ${submitted.rank} of ${submitted.total}.`, 'success');
    await refreshBoard(true);
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'Submitting failed.', 'error');
  }
}

/* -------------------------------------------------------------------------- */
/* Wiring                                                                      */
/* -------------------------------------------------------------------------- */

game.onRunStart = () => void requestTicket();
game.onRunFinish = (result) => void handleRunFinish(result);
game.start();

const storedName = localStorage.getItem(NAME_KEY);
if (storedName) nameInput.value = storedName;

scoreForm.addEventListener('submit', (event) => {
  event.preventDefault();
  nameInput.blur();
  void refreshBoard();
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
