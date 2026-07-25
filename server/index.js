/**
 * Scoreboard API.
 *
 * Plain Node, no npm dependencies: node:http for the server, node:sqlite for
 * storage. Runs behind Traefik on the same host as the game, so every request
 * is same-origin and no CORS handling is needed by default.
 *
 * One row per run. The row appears as soon as the first level is cleared and is
 * updated after every further level. A run that never reaches the last level
 * stays in the table as unranked.
 */

import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const PORT = Number(process.env.PORT) || 8787;
// The container image overrides this with /data/scores.db; the relative default
// keeps `npm run api` working on a developer machine.
const DB_PATH = process.env.DB_PATH || './data/scores.db';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '';

/**
 * Signs run tickets. Without a fixed secret the tickets stop being valid on
 * restart, which only means players have to start their run again.
 */
const SECRET = process.env.SCORE_SECRET || randomUUID();
if (!process.env.SCORE_SECRET) {
  console.warn('SCORE_SECRET is not set, using a random secret for this process.');
}

const NAME_MAX = 16;
const LEVEL_COUNT = Number(process.env.LEVEL_COUNT) || 12;
/**
 * No level can plausibly be cleared faster than this, so anything below is
 * junk. Overridable so the test suite does not have to wait half a minute.
 */
const MIN_MS_PER_LEVEL = Number(process.env.MIN_MS_PER_LEVEL) || 4000;
const MAX_RUN_MS = 6 * 60 * 60 * 1000;
const MAX_DEATHS = 100_000;
/** Tickets expire, so a stockpile of them is worthless. */
const TICKET_TTL_MS = 6 * 60 * 60 * 1000;
const BODY_LIMIT = 4096;

/* -------------------------------------------------------------------------- */
/* Storage                                                                     */
/* -------------------------------------------------------------------------- */

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA busy_timeout = 5000;
`);

migrate();

function migrate() {
  const existing = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='scores'").get();
  if (existing) {
    const columns = db.prepare('PRAGMA table_info(scores)').all().map((c) => c.name);
    if (!columns.includes('run_id') || !columns.includes('levels')) {
      // Layout from before progress tracking. Keep the old rows around instead
      // of dropping them, but start the new table clean.
      console.warn('scores table has the old layout, renaming it to scores_legacy');
      db.exec('ALTER TABLE scores RENAME TO scores_legacy');
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id      TEXT    NOT NULL UNIQUE,
      name        TEXT    NOT NULL,
      deaths      INTEGER NOT NULL,
      duration_ms INTEGER NOT NULL,
      levels      INTEGER NOT NULL,
      complete    INTEGER NOT NULL,
      mode        TEXT    NOT NULL DEFAULT 'campaign',
      created_at  INTEGER NOT NULL,
      updated_at  INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scores_ranked
      ON scores (mode, complete, deaths ASC, duration_ms ASC, id ASC);

    CREATE INDEX IF NOT EXISTS idx_scores_progress
      ON scores (mode, complete, levels DESC, deaths ASC, duration_ms ASC, id ASC);
  `);

  // Tables created before modes existed just gain the column.
  const columns = db.prepare('PRAGMA table_info(scores)').all().map((c) => c.name);
  if (!columns.includes('mode')) {
    db.exec("ALTER TABLE scores ADD COLUMN mode TEXT NOT NULL DEFAULT 'campaign'");
  }

  // The old single-use ticket table is no longer needed: a run is identified by
  // its run_id and progress may only ever move forward.
  db.exec('DROP TABLE IF EXISTS spent_tickets');
}

const findRun = db.prepare('SELECT id, levels, mode FROM scores WHERE run_id = ?');
const insertRun = db.prepare(
  `INSERT INTO scores (run_id, name, deaths, duration_ms, levels, complete, mode, created_at, updated_at)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
);
const updateRun = db.prepare(
  `UPDATE scores SET name = ?, deaths = ?, duration_ms = ?, levels = ?, complete = ?, updated_at = ?
   WHERE run_id = ?`,
);
const rankedScores = db.prepare(
  `SELECT id, name, deaths, duration_ms, levels, complete, mode, updated_at FROM scores
   WHERE mode = ? AND complete = 1 ORDER BY deaths ASC, duration_ms ASC, id ASC LIMIT ?`,
);
const unrankedScores = db.prepare(
  `SELECT id, name, deaths, duration_ms, levels, complete, mode, updated_at FROM scores
   WHERE mode = ? AND complete = 0 ORDER BY levels DESC, deaths ASC, duration_ms ASC, id ASC LIMIT ?`,
);
const countComplete = db.prepare(
  'SELECT COUNT(*) AS total FROM scores WHERE mode = ? AND complete = 1',
);
const countAll = db.prepare('SELECT COUNT(*) AS total FROM scores WHERE mode = ?');
const countBetter = db.prepare(
  `SELECT COUNT(*) AS better FROM scores
   WHERE mode = ? AND complete = 1 AND (deaths < ? OR (deaths = ? AND duration_ms < ?))`,
);
const deleteScore = db.prepare('DELETE FROM scores WHERE id = ?');

/* -------------------------------------------------------------------------- */
/* Run tickets                                                                 */
/* -------------------------------------------------------------------------- */

function sign(runId, issuedAt) {
  return createHmac('sha256', SECRET).update(`${runId}.${issuedAt}`).digest('hex');
}

function signatureMatches(expected, given) {
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(given), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * A ticket is handed out when a run starts and identifies that run for its
 * whole lifetime. It proves how much wall-clock time passed on the server.
 * This is not authentication: it only stops replays and obviously faked times.
 */
function issueTicket() {
  const runId = randomUUID();
  const issuedAt = Date.now();
  return { runId, issuedAt, ticket: sign(runId, issuedAt) };
}

function checkTicket({ runId, issuedAt, ticket }, durationMs) {
  if (typeof runId !== 'string' || runId.length < 8 || runId.length > 64) {
    return 'ticket is malformed';
  }
  if (!Number.isInteger(issuedAt)) return 'ticket is malformed';

  const age = Date.now() - issuedAt;
  if (age < 0 || age > TICKET_TTL_MS) return 'ticket has expired';
  if (!signatureMatches(sign(runId, issuedAt), ticket)) return 'ticket is invalid';

  // 15 % tolerance for clock drift and the delay before the score is sent.
  if (age < durationMs * 0.85) return 'run time does not match the ticket';

  return null;
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                               */
/* -------------------------------------------------------------------------- */

const buckets = new Map();
/** Hard ceiling on tracked keys so the map cannot grow without bound. */
const MAX_BUCKETS = 20_000;

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
  }
  if (!buckets.has(key) && buckets.size >= MAX_BUCKETS) {
    // Drop the oldest entry rather than refusing service.
    const oldest = buckets.keys().next();
    if (!oldest.done) buckets.delete(oldest.value);
  }
  hits.push(now);
  buckets.set(key, hits);
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - 60 * 60 * 1000;
  for (const [key, hits] of buckets) {
    const kept = hits.filter((t) => t > cutoff);
    if (kept.length === 0) buckets.delete(key);
    else buckets.set(key, kept);
  }
}, 10 * 60 * 1000).unref();

/**
 * The address the rate limit counts against.
 *
 * Traefik appends the real peer to any X-Forwarded-For the client sent, so the
 * LAST entry is the one written by our own proxy. Reading the first entry would
 * let anyone pick their own bucket by sending a header. The value is capped in
 * length so a long header cannot bloat the bucket map.
 */
function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    const entries = forwarded.split(',');
    const last = entries[entries.length - 1].trim();
    if (last) return last.slice(0, 64);
  }
  return (req.socket.remoteAddress ?? 'unknown').slice(0, 64);
}

/* -------------------------------------------------------------------------- */
/* Validation                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Replaces control characters with a space, collapses whitespace and caps the
 * length. Control characters become spaces rather than being dropped, so
 * "Zoe\nSmith" does not turn into "ZoeSmith". Slicing works on code points so a
 * surrogate pair never gets cut in half.
 */
function cleanName(value) {
  if (typeof value !== 'string') return '';
  const spaced = [...value.normalize('NFC')]
    .map((ch) => {
      const code = ch.codePointAt(0);
      return code <= 0x1f || code === 0x7f ? ' ' : ch;
    })
    .join('');
  const collapsed = spaced.replace(/\s+/g, ' ').trim();
  return [...collapsed].slice(0, NAME_MAX).join('').trim();
}

/** Practice runs never reach the server, so only these two are storable. */
const MODES = new Set(['campaign', 'sudden']);

function validateScore(body) {
  const name = cleanName(body.name);
  if (name.length === 0) return { error: 'name must not be empty' };

  const mode = body.mode ?? 'campaign';
  if (typeof mode !== 'string' || !MODES.has(mode)) return { error: 'unknown mode' };

  const { deaths, durationMs, levels } = body;
  if (!Number.isInteger(levels) || levels < 1 || levels > LEVEL_COUNT) {
    return { error: 'levels is out of range' };
  }
  if (!Number.isInteger(deaths) || deaths < 0 || deaths > MAX_DEATHS) {
    return { error: 'deaths is out of range' };
  }
  if (
    !Number.isInteger(durationMs) ||
    durationMs < levels * MIN_MS_PER_LEVEL ||
    durationMs > MAX_RUN_MS
  ) {
    return { error: 'duration is out of range' };
  }
  // A sudden death run ends at the first hit, so a finished one has no deaths.
  if (mode === 'sudden' && deaths > 0 && levels === LEVEL_COUNT) {
    return { error: 'a completed sudden death run cannot have deaths' };
  }

  return { value: { name, deaths, durationMs, levels, mode } };
}

/* -------------------------------------------------------------------------- */
/* HTTP plumbing                                                               */
/* -------------------------------------------------------------------------- */

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  if (CORS_ORIGIN) {
    headers['Access-Control-Allow-Origin'] = CORS_ORIGIN;
    headers['Access-Control-Allow-Headers'] = 'content-type';
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Vary'] = 'Origin';
  }
  res.writeHead(status, headers);
  res.end(body);
}

function badRequest(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    let aborted = false;
    const chunks = [];
    req.on('data', (chunk) => {
      if (aborted) return;
      size += chunk.length;
      if (size > BODY_LIMIT) {
        // Drain instead of destroying the socket, otherwise the 413 never
        // reaches the client and they only see a connection reset.
        aborted = true;
        chunks.length = 0;
        req.resume();
        reject(badRequest('body too large', 413));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (aborted) return;
      if (chunks.length === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return resolve({});
        // Null prototype: keys like __proto__ stay plain data.
        resolve(Object.assign(Object.create(null), parsed));
      } catch {
        reject(badRequest('body is not valid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function toScore(row, rank) {
  return {
    id: row.id,
    rank,
    name: row.name,
    deaths: row.deaths,
    durationMs: row.duration_ms,
    levels: row.levels,
    complete: row.complete === 1,
    mode: row.mode,
    updatedAt: row.updated_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Routes                                                                      */
/* -------------------------------------------------------------------------- */

async function handle(req, res) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const ip = clientIp(req);

  if (req.method === 'OPTIONS') return send(res, 204, {});

  if (path === '/api/health') {
    return send(res, 200, { status: 'ok' });
  }

  if (path === '/api/scores' && req.method === 'GET') {
    if (!rateLimit(`get:${ip}`, 120, 60_000)) {
      return send(res, 429, { error: 'too many requests' });
    }
    // SQLite refuses to bind a non-integer to LIMIT, so truncate before clamping.
    const requested = Math.trunc(Number(url.searchParams.get('limit')));
    const limit = Number.isFinite(requested) && requested > 0 ? Math.min(requested, 100) : 10;
    const asked = url.searchParams.get('mode') ?? 'campaign';
    const mode = MODES.has(asked) ? asked : 'campaign';

    return send(res, 200, {
      mode,
      scores: rankedScores.all(mode, limit).map((row, i) => toScore(row, i + 1)),
      unranked: unrankedScores.all(mode, limit).map((row) => toScore(row, null)),
      levelCount: LEVEL_COUNT,
      total: countComplete.get(mode).total,
      totalRuns: countAll.get(mode).total,
    });
  }

  if (path === '/api/runs' && req.method === 'POST') {
    if (!rateLimit(`run:${ip}`, 60, 60 * 60_000)) {
      return send(res, 429, { error: 'too many requests' });
    }
    return send(res, 201, issueTicket());
  }

  if (path === '/api/scores' && req.method === 'POST') {
    // Six levels means at most six writes per run, plus room for retries.
    if (!rateLimit(`post:${ip}`, 120, 60 * 60_000)) {
      return send(res, 429, { error: 'too many requests' });
    }

    let body;
    try {
      body = await readJson(req);
    } catch (err) {
      return send(res, err.status ?? 400, { error: err.message });
    }

    const { error, value } = validateScore(body);
    if (error) return send(res, 400, { error });

    const ticketError = checkTicket(
      { runId: body.runId, issuedAt: body.issuedAt, ticket: body.ticket },
      value.durationMs,
    );
    if (ticketError) return send(res, 403, { error: ticketError });

    const now = Date.now();
    const complete = value.levels === LEVEL_COUNT ? 1 : 0;
    const existing = findRun.get(body.runId);

    if (existing && existing.mode !== value.mode) {
      return send(res, 409, { error: 'this run belongs to a different mode' });
    }

    if (!existing) {
      insertRun.run(
        body.runId,
        value.name,
        value.deaths,
        value.durationMs,
        value.levels,
        complete,
        value.mode,
        now,
        now,
      );
    } else if (value.levels > existing.levels) {
      // Progress may only move forward, which also caps how often one ticket
      // can write.
      updateRun.run(
        value.name,
        value.deaths,
        value.durationMs,
        value.levels,
        complete,
        now,
        body.runId,
      );
    } else {
      return send(res, 409, { error: 'this run already reached that level' });
    }

    const row = findRun.get(body.runId);
    return send(res, existing ? 200 : 201, {
      id: row.id,
      rank: complete
        ? countBetter.get(value.mode, value.deaths, value.deaths, value.durationMs).better + 1
        : null,
      levels: value.levels,
      levelCount: LEVEL_COUNT,
      complete: complete === 1,
      mode: value.mode,
      total: countComplete.get(value.mode).total,
      totalRuns: countAll.get(value.mode).total,
    });
  }

  const adminMatch = path.match(/^\/api\/scores\/(\d+)$/);
  if (adminMatch && req.method === 'DELETE') {
    // Rate limited too, so the token cannot be guessed at full speed.
    if (!rateLimit(`admin:${ip}`, 20, 60 * 60_000)) {
      return send(res, 429, { error: 'too many requests' });
    }
    if (!ADMIN_TOKEN) return send(res, 404, { error: 'not found' });
    const given = req.headers['x-admin-token'];
    if (typeof given !== 'string' || !signatureMatches(ADMIN_TOKEN, given)) {
      return send(res, 401, { error: 'unauthorized' });
    }
    const result = deleteScore.run(Number(adminMatch[1]));
    return send(res, 200, { deleted: result.changes });
  }

  return send(res, 404, { error: 'not found' });
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    console.error('request failed:', err);
    if (!res.headersSent) send(res, 500, { error: 'internal error' });
  });
});

server.listen(PORT, () => {
  console.log(`scoreboard api listening on ${PORT}, database at ${DB_PATH}`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
