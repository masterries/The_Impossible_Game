/**
 * Scoreboard API.
 *
 * Plain Node, no npm dependencies: node:http for the server, node:sqlite for
 * storage. Runs behind Traefik on the same host as the game, so every request
 * is same-origin and no CORS handling is needed by default.
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
 * restart, which only means players have to finish their run again.
 */
const SECRET = process.env.SCORE_SECRET || randomUUID();
if (!process.env.SCORE_SECRET) {
  console.warn('SCORE_SECRET is not set, using a random secret for this process.');
}

const NAME_MAX = 16;
const LEVEL_COUNT = 6;
/**
 * A full run cannot plausibly be faster than this, so anything below is junk.
 * Overridable so the test suite does not have to wait half a minute.
 */
const MIN_RUN_MS = Number(process.env.MIN_RUN_MS) || 25_000;
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

  CREATE TABLE IF NOT EXISTS scores (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    deaths      INTEGER NOT NULL,
    duration_ms INTEGER NOT NULL,
    created_at  INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scores_rank
    ON scores (deaths ASC, duration_ms ASC, id ASC);

  CREATE TABLE IF NOT EXISTS spent_tickets (
    run_id  TEXT    PRIMARY KEY,
    used_at INTEGER NOT NULL
  );
`);

const insertScore = db.prepare(
  'INSERT INTO scores (name, deaths, duration_ms, created_at) VALUES (?, ?, ?, ?)',
);
const topScores = db.prepare(
  'SELECT id, name, deaths, duration_ms, created_at FROM scores ORDER BY deaths ASC, duration_ms ASC, id ASC LIMIT ?',
);
const countScores = db.prepare('SELECT COUNT(*) AS total FROM scores');
const countBetter = db.prepare(
  'SELECT COUNT(*) AS better FROM scores WHERE deaths < ? OR (deaths = ? AND duration_ms < ?)',
);
const deleteScore = db.prepare('DELETE FROM scores WHERE id = ?');
const spendTicket = db.prepare('INSERT INTO spent_tickets (run_id, used_at) VALUES (?, ?)');
const findTicket = db.prepare('SELECT run_id FROM spent_tickets WHERE run_id = ?');
const pruneTickets = db.prepare('DELETE FROM spent_tickets WHERE used_at < ?');

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
 * A ticket is handed out when a run starts and can be redeemed once. It proves
 * that enough wall-clock time passed on the server between start and finish.
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
  if (findTicket.get(runId)) return 'ticket was already redeemed';

  return null;
}

/* -------------------------------------------------------------------------- */
/* Rate limiting                                                               */
/* -------------------------------------------------------------------------- */

const buckets = new Map();

function rateLimit(key, limit, windowMs) {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return false;
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

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket.remoteAddress ?? 'unknown';
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

function validateScore(body) {
  const name = cleanName(body.name);
  if (name.length === 0) return { error: 'name must not be empty' };

  const { deaths, durationMs, levels } = body;
  if (!Number.isInteger(deaths) || deaths < 0 || deaths > MAX_DEATHS) {
    return { error: 'deaths is out of range' };
  }
  if (!Number.isInteger(durationMs) || durationMs < MIN_RUN_MS || durationMs > MAX_RUN_MS) {
    return { error: 'duration is out of range' };
  }
  if (levels !== undefined && levels !== LEVEL_COUNT) {
    return { error: 'run is incomplete' };
  }
  return { value: { name, deaths, durationMs } };
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

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > BODY_LIMIT) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try {
        const parsed = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(parsed && typeof parsed === 'object' ? parsed : {});
      } catch {
        reject(new Error('body is not valid JSON'));
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
    createdAt: row.created_at,
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
    const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 10, 1), 100);
    const rows = topScores.all(limit);
    return send(res, 200, {
      scores: rows.map((row, i) => toScore(row, i + 1)),
      total: countScores.get().total,
    });
  }

  if (path === '/api/runs' && req.method === 'POST') {
    if (!rateLimit(`run:${ip}`, 60, 60 * 60_000)) {
      return send(res, 429, { error: 'too many requests' });
    }
    return send(res, 201, issueTicket());
  }

  if (path === '/api/scores' && req.method === 'POST') {
    if (!rateLimit(`post:${ip}`, 20, 60 * 60_000)) {
      return send(res, 429, { error: 'too many requests' });
    }

    let body;
    try {
      body = await readJson(req);
    } catch (err) {
      return send(res, 400, { error: err.message });
    }

    const { error, value } = validateScore(body);
    if (error) return send(res, 400, { error });

    const ticketError = checkTicket(
      { runId: body.runId, issuedAt: body.issuedAt, ticket: body.ticket },
      value.durationMs,
    );
    if (ticketError) return send(res, 403, { error: ticketError });

    const now = Date.now();
    try {
      spendTicket.run(body.runId, now);
    } catch {
      // Unique constraint: two submissions raced for the same ticket.
      return send(res, 403, { error: 'ticket was already redeemed' });
    }
    pruneTickets.run(now - TICKET_TTL_MS);

    const result = insertScore.run(value.name, value.deaths, value.durationMs, now);
    const rank = countBetter.get(value.deaths, value.deaths, value.durationMs).better + 1;

    return send(res, 201, {
      id: Number(result.lastInsertRowid),
      rank,
      total: countScores.get().total,
    });
  }

  const adminMatch = path.match(/^\/api\/scores\/(\d+)$/);
  if (adminMatch && req.method === 'DELETE') {
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
