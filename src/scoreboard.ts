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
  rank: number;
  name: string;
  deaths: number;
  durationMs: number;
  createdAt: number;
}

export interface RunTicket {
  runId: string;
  issuedAt: number;
  ticket: string;
}

export interface SubmitResult {
  id: number;
  rank: number;
  total: number;
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

export function fetchScores(limit = 10): Promise<{ scores: ScoreEntry[]; total: number }> {
  return request(`/scores?limit=${limit}`);
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
  ticket: RunTicket;
}): Promise<SubmitResult> {
  return request('/scores', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name,
      deaths: input.deaths,
      durationMs: input.durationMs,
      levels: input.levels,
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
