/**
 * Smoke test for the scoreboard API.
 *
 * Starts the real server against a throwaway database and drives it over HTTP.
 * Run with: node server/test.js
 */

import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PORT = 8791;
const BASE = `http://127.0.0.1:${PORT}`;
/** Passed to the server too, so a full run stays quick to simulate. */
const LEVEL_COUNT = 6;
/** Matches MIN_MS_PER_LEVEL below, so one level is cheap to simulate. */
const MS_PER_LEVEL = 60;
const workDir = mkdtempSync(join(tmpdir(), 'scoreboard-test-'));

let failures = 0;
let checks = 0;

function check(label, condition, detail) {
  checks++;
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures++;
    console.error(`  FAIL ${label}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function call(path, init) {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : {} };
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForServer(timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(120);
  }
  throw new Error('server did not start in time');
}

function newTicket() {
  return call('/api/runs', { method: 'POST' });
}

function post(ticket, { name, deaths, durationMs, levels, mode }) {
  return call('/api/scores', {
    method: 'POST',
    body: JSON.stringify({
      name,
      deaths,
      durationMs,
      levels,
      ...(mode === undefined ? {} : { mode }),
      runId: ticket.body.runId,
      issuedAt: ticket.body.issuedAt,
      ticket: ticket.body.ticket,
    }),
  });
}

/**
 * Plays a run level by level, waiting long enough between levels that the
 * server-side clock agrees with the reported duration.
 */
async function playRun({ name, deaths, upTo, msPerLevel = 400, mode }) {
  const ticket = await newTicket();
  const results = [];
  for (let levels = 1; levels <= upTo; levels++) {
    await sleep(Math.ceil(msPerLevel * 0.95));
    results.push(
      await post(ticket, { name, deaths, durationMs: levels * msPerLevel, levels, mode }),
    );
  }
  return { ticket, results, last: results[results.length - 1] };
}

const server = spawn(process.execPath, [join(HERE, 'index.js')], {
  env: {
    ...process.env,
    PORT: String(PORT),
    DB_PATH: join(workDir, 'test.db'),
    SCORE_SECRET: 'test-secret',
    ADMIN_TOKEN: 'test-admin',
    MIN_MS_PER_LEVEL: String(MS_PER_LEVEL),
    LEVEL_COUNT: String(LEVEL_COUNT),
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
server.stderr.on('data', (chunk) => process.stderr.write(`  [server] ${chunk}`));

function shutdown(code) {
  server.kill('SIGTERM');
  try {
    rmSync(workDir, { recursive: true, force: true });
  } catch {
    /* best effort */
  }
  process.exit(code);
}

try {
  await waitForServer();
  console.log('scoreboard api');

  const health = await call('/api/health');
  check('health responds', health.status === 200 && health.body.status === 'ok');

  const empty = await call('/api/scores');
  check(
    'board starts empty',
    empty.status === 200 && empty.body.totalRuns === 0 && empty.body.scores.length === 0,
    JSON.stringify(empty.body),
  );

  const ticket = await newTicket();
  check(
    'issues a run ticket',
    ticket.status === 201 && typeof ticket.body.ticket === 'string' && ticket.body.runId.length > 8,
  );

  const instant = await post(ticket, { name: 'Cheater', deaths: 0, durationMs: 5000, levels: 1 });
  check(
    'rejects a run that is faster than the ticket allows',
    instant.status === 403,
    `status ${instant.status}`,
  );

  const forged = await call('/api/scores', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Forger',
      deaths: 0,
      durationMs: 400,
      levels: 1,
      runId: ticket.body.runId,
      issuedAt: ticket.body.issuedAt,
      ticket: 'a'.repeat(64),
    }),
  });
  check('rejects a forged signature', forged.status === 403, `status ${forged.status}`);

  // --- Clearing level 1 alone is enough to appear on the board -------------
  const partial = await playRun({ name: 'Quitter', deaths: 5, upTo: 1 });
  check(
    'clearing level 1 creates an entry',
    partial.last.status === 201 && partial.last.body.levels === 1,
    JSON.stringify(partial.last.body),
  );
  check(
    'a partial run has no rank',
    partial.last.body.rank === null && partial.last.body.complete === false,
    JSON.stringify(partial.last.body),
  );

  const afterPartial = await call('/api/scores');
  check(
    'the partial run shows up as unranked',
    afterPartial.body.scores.length === 0 &&
      afterPartial.body.unranked.length === 1 &&
      afterPartial.body.unranked[0].name === 'Quitter' &&
      afterPartial.body.unranked[0].levels === 1,
    JSON.stringify(afterPartial.body),
  );
  check(
    'totals count complete and partial separately',
    afterPartial.body.total === 0 && afterPartial.body.totalRuns === 1,
    `${afterPartial.body.total}/${afterPartial.body.totalRuns}`,
  );

  // --- Progress updates one row instead of adding new ones -----------------
  const progressing = await playRun({ name: 'Climber', deaths: 8, upTo: 3 });
  check(
    'progress updates the same entry',
    progressing.results[0].status === 201 &&
      progressing.results[1].status === 200 &&
      progressing.results[2].status === 200 &&
      new Set(progressing.results.map((r) => r.body.id)).size === 1,
    progressing.results.map((r) => `${r.status}:${r.body.id}`).join(' '),
  );
  const afterProgress = await call('/api/scores');
  check(
    'no duplicate rows for one run',
    afterProgress.body.totalRuns === 2,
    String(afterProgress.body.totalRuns),
  );
  check(
    'the entry shows the level reached',
    afterProgress.body.unranked.find((e) => e.name === 'Climber')?.levels === 3,
    JSON.stringify(afterProgress.body.unranked),
  );

  const backwards = await post(progressing.ticket, {
    name: 'Climber',
    deaths: 0,
    durationMs: 2 * 400,
    levels: 2,
  });
  check('progress cannot go backwards', backwards.status === 409, `status ${backwards.status}`);

  // --- A full run becomes ranked ------------------------------------------
  const full = await playRun({ name: 'Alice', deaths: 12, upTo: LEVEL_COUNT });
  check(
    'finishing every level ranks the run',
    full.last.status === 200 && full.last.body.complete === true && full.last.body.rank === 1,
    JSON.stringify(full.last.body),
  );

  const better = await playRun({ name: 'Bob', deaths: 3, upTo: LEVEL_COUNT });
  check('ranks fewer deaths first', better.last.body.rank === 1, String(better.last.body.rank));

  const tie = await playRun({ name: 'Carol', deaths: 3, upTo: LEVEL_COUNT, msPerLevel: 700 });
  check('ranks the faster run first on a tie', tie.last.body.rank === 2, String(tie.last.body.rank));

  const board = await call('/api/scores?limit=10');
  const names = board.body.scores.map((s) => s.name);
  check(
    'ranked list is ordered correctly',
    names.join(',') === 'Bob,Carol,Alice',
    names.join(','),
  );
  check(
    'ranked entries are all complete',
    board.body.scores.every((s) => s.complete && s.rank !== null && s.levels === LEVEL_COUNT),
    JSON.stringify(board.body.scores.map((s) => [s.rank, s.levels, s.complete])),
  );
  check(
    'unranked entries are ordered by level reached',
    board.body.unranked.map((s) => s.levels).join(',') === '3,1',
    board.body.unranked.map((s) => `${s.name}:${s.levels}`).join(' '),
  );
  check(
    'levelCount is reported',
    board.body.levelCount === LEVEL_COUNT,
    String(board.body.levelCount),
  );

  // --- Validation ----------------------------------------------------------
  const noName = await playRun({ name: '   ', deaths: 3, upTo: 1 });
  check('rejects an empty name', noName.last.status === 400, `status ${noName.last.status}`);

  const tooFast = await playRun({ name: 'Speedy', deaths: 0, upTo: 1, msPerLevel: 20 });
  check(
    'rejects an implausibly short level',
    tooFast.last.status === 400,
    `status ${tooFast.last.status}`,
  );

  const badLevel = await playRun({ name: 'Ghost', deaths: 0, upTo: 1 });
  const overshoot = await post(badLevel.ticket, {
    name: 'Ghost',
    deaths: 0,
    durationMs: 9 * 400,
    levels: 9,
  });
  check('rejects more levels than exist', overshoot.status === 400, `status ${overshoot.status}`);

  const dirty = await playRun({
    name: '  Zoe   the\n\nGreat and then some  ',
    deaths: 40,
    upTo: 1,
  });
  const dirtyBoard = await call('/api/scores?limit=100');
  const cleaned = dirtyBoard.body.unranked.map((e) => e.name).find((n) => n.startsWith('Zoe'));
  check(
    'strips control characters and caps the length',
    dirty.last.status === 201 && cleaned === 'Zoe the Great an' && cleaned.length === 16,
    JSON.stringify(cleaned),
  );

  const fractional = await call('/api/scores?limit=2.9');
  check(
    'a fractional limit does not crash the query',
    fractional.status === 200 && Array.isArray(fractional.body.scores),
    `status ${fractional.status}`,
  );
  const weirdLimits = await Promise.all(
    ['abc', '-3', '0', 'Infinity', '1e2', '99999999999999999999', ''].map((v) =>
      call(`/api/scores?limit=${v}`),
    ),
  );
  check(
    'odd limit values are all handled',
    weirdLimits.every((r) => r.status === 200),
    weirdLimits.map((r) => r.status).join(','),
  );

  const huge = await call('/api/scores', {
    method: 'POST',
    body: JSON.stringify({ name: 'x'.repeat(9000), deaths: 0, durationMs: 400, levels: 1 }),
  });
  check(
    'an oversized body gets a real 413, not a reset',
    huge.status === 413 && typeof huge.body.error === 'string',
    `status ${huge.status}`,
  );

  const polluted = await call('/api/scores', {
    method: 'POST',
    body: '{"__proto__":{"polluted":true},"name":"P","deaths":0,"durationMs":400,"levels":1}',
  });
  check(
    'a __proto__ key does not pollute Object.prototype',
    {}.polluted === undefined && polluted.status === 403,
    `status ${polluted.status}, polluted=${{}.polluted}`,
  );

  // --- Modes ---------------------------------------------------------------
  const suddenRun = await playRun({ name: 'Sudden Ace', deaths: 0, upTo: LEVEL_COUNT, mode: 'sudden' });
  check(
    'a sudden death run is accepted',
    suddenRun.last.status === 200 && suddenRun.last.body.mode === 'sudden',
    JSON.stringify(suddenRun.last.body),
  );

  const campaignBoard = await call('/api/scores?mode=campaign&limit=50');
  const suddenBoard = await call('/api/scores?mode=sudden&limit=50');
  check(
    'the boards are kept apart',
    campaignBoard.body.scores.every((s) => s.mode === 'campaign') &&
      suddenBoard.body.scores.every((s) => s.mode === 'sudden') &&
      suddenBoard.body.scores.length === 1 &&
      suddenBoard.body.scores[0].name === 'Sudden Ace' &&
      !campaignBoard.body.scores.some((s) => s.name === 'Sudden Ace'),
    `campaign=${campaignBoard.body.scores.length} sudden=${suddenBoard.body.scores.length}`,
  );
  check(
    'an unknown mode falls back to campaign',
    (await call('/api/scores?mode=practice')).body.mode === 'campaign',
  );

  const deadlyWin = await playRun({
    name: 'Impostor',
    deaths: 3,
    upTo: LEVEL_COUNT,
    mode: 'sudden',
  });
  check(
    'a finished sudden death run cannot have deaths',
    deadlyWin.last.status === 400,
    `status ${deadlyWin.last.status}`,
  );

  const badMode = await playRun({ name: 'Ghost', deaths: 0, upTo: 1, mode: 'practice' });
  check('practice cannot be submitted', badMode.last.status === 400, `status ${badMode.last.status}`);

  const switcher = await playRun({ name: 'Switcher', deaths: 1, upTo: 1, mode: 'campaign' });
  await sleep(900);
  const switched = await post(switcher.ticket, {
    name: 'Switcher',
    deaths: 1,
    durationMs: 800,
    levels: 2,
    mode: 'sudden',
  });
  check('a run cannot change its mode', switched.status === 409, `status ${switched.status}`);

  // --- Admin ---------------------------------------------------------------
  const unauthorised = await call(`/api/scores/${full.last.body.id}`, { method: 'DELETE' });
  check('delete needs the admin token', unauthorised.status === 401);

  const deleted = await call(`/api/scores/${full.last.body.id}`, {
    method: 'DELETE',
    headers: { 'x-admin-token': 'test-admin' },
  });
  check('admin can delete an entry', deleted.status === 200 && deleted.body.deleted === 1);

  const missing = await call('/api/nope');
  check('unknown routes are 404', missing.status === 404);

  console.log(`\n${checks - failures}/${checks} checks passed`);
  shutdown(failures === 0 ? 0 : 1);
} catch (err) {
  console.error('test run failed:', err);
  shutdown(1);
}
