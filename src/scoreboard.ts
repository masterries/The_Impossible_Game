/**
 * Client for the scoreboard API.
 *
 * Every call fails softly: if the backend is unreachable the game keeps working
 * and the board simply reports that it is offline.
 */

const BASE = '/api';
const TIMEOUT_MS = 6000;

export interface ScoreEntry {
  id: number;
  /** Position among the completed runs, or null for a run that stopped early. */
  rank: number | null;
  name: string;
  deaths: number;
  durationMs: number;
  levels: number;
  complete: boolean;
  updatedAt: number;
}

export type BoardMode = 'campaign' | 'sudden';

export interface Board {
  mode: BoardMode;
  scores: ScoreEntry[];
  unranked: ScoreEntry[];
  levelCount: number;
  /** Number of completed runs. */
  total: number;
  /** Number of runs on the board, complete or not. */
  totalRuns: number;
}

export interface RunTicket {
  runId: string;
  issuedAt: number;
  ticket: string;
}

export interface SubmitResult {
  id: number;
  rank: number | null;
  levels: number;
  levelCount: number;
  complete: boolean;
  total: number;
  totalRuns: number;
}

export class ScoreboardError extends Error {}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    if (!response.ok) {
      throw new ScoreboardError(
        typeof data.error === 'string' ? data.error : `request failed (${response.status})`,
      );
    }
    return data as T;
  } catch (err) {
    if (err instanceof ScoreboardError) throw err;
    throw new ScoreboardError('scoreboard is unreachable');
  } finally {
    clearTimeout(timer);
  }
}

export function fetchScores(mode: BoardMode = 'campaign', limit = 10): Promise<Board> {
  return request(`/scores?mode=${mode}&limit=${limit}`);
}

/** Asks the server for a ticket that proves how long the run actually took. */
export function startRun(): Promise<RunTicket> {
  return request('/runs', { method: 'POST' });
}

export function submitScore(input: {
  name: string;
  deaths: number;
  durationMs: number;
  levels: number;
  mode: BoardMode;
  ticket: RunTicket;
}): Promise<SubmitResult> {
  return request('/scores', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      deaths: input.deaths,
      durationMs: input.durationMs,
      levels: input.levels,
      mode: input.mode,
      runId: input.ticket.runId,
      issuedAt: input.ticket.issuedAt,
      ticket: input.ticket.ticket,
    }),
  });
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}
