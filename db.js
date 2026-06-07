import { createClient } from '@libsql/client';

// libSQL/Turso client. Local dev points at a file:// URL (same on-disk data as
// before); production sets TURSO_DATABASE_URL + TURSO_AUTH_TOKEN to a remote
// Turso database. libSQL is pure JS, which is why it runs on Vercel where the
// old native better-sqlite3 module could not.
const url = process.env.TURSO_DATABASE_URL ?? 'file:./booth.db';
const authToken = process.env.TURSO_AUTH_TOKEN;
const client = createClient(authToken ? { url, authToken } : { url });

// Schema is created out-of-band by `npm run db:init` (scripts/init-db.js) so we
// don't pay CREATE-TABLE latency on every serverless cold start. Exported here
// so the init script can import the single source of truth.
export const SCHEMA = `
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    soul_values TEXT,           -- JSON: { tone, priority, struggle }
    system_prompt TEXT
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL,         -- 'visitor' | 'ai'
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS wisdom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS votes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    question_id TEXT NOT NULL,
    option_id TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS demographics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL UNIQUE,
    bucket TEXT NOT NULL,           -- 'builder' | 'daily' | 'sometimes' | 'rare'
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tt_sessions (
    id TEXT PRIMARY KEY,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    sequence TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tt_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    turn INTEGER NOT NULL,
    role TEXT NOT NULL,           -- 'visitor' | 'partner'
    source TEXT,                  -- 'ai' | 'human' (only for partner)
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS tt_guesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    message_id INTEGER NOT NULL,
    guess TEXT NOT NULL,
    truth TEXT NOT NULL,
    correct INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- Human-in-the-loop operator handoff for /guess. Replaces the old in-memory
  -- ttPendingHumanRequests Map so it survives across stateless invocations.
  CREATE TABLE IF NOT EXISTS tt_pending (
    request_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    turn INTEGER NOT NULL,
    history_json TEXT NOT NULL,
    status TEXT NOT NULL,         -- 'waiting' | 'answering' | 'answered' | 'expiring' | 'expired'
    response_text TEXT,
    source TEXT,                  -- 'human' | 'ai' once finalized
    message_id INTEGER,
    claimed_by TEXT,
    created_at INTEGER NOT NULL,
    answered_at INTEGER
  );

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_wisdom_created ON wisdom(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_votes_q ON votes(question_id, option_id);
  CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
  CREATE INDEX IF NOT EXISTS idx_demos_bucket ON demographics(bucket);
  CREATE INDEX IF NOT EXISTS idx_tt_messages_session ON tt_messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_tt_guesses_session ON tt_guesses(session_id);
  CREATE INDEX IF NOT EXISTS idx_tt_pending_status ON tt_pending(status, created_at);
`;

// ---- tiny query helpers ------------------------------------------------
async function all(sql, args = []) {
  const r = await client.execute({ sql, args });
  return r.rows;
}
async function get(sql, args = []) {
  const r = await client.execute({ sql, args });
  return r.rows[0];
}
async function run(sql, args = []) {
  return client.execute({ sql, args });
}
const lastId = (res) => Number(res.lastInsertRowid);

export async function initSchema() {
  await client.executeMultiple(SCHEMA);
}

// =====================================================
// SOUL MIRROR (/visitor)
// =====================================================

export async function createSession(id) {
  await run('INSERT INTO sessions (id, started_at) VALUES (?, ?)', [
    id,
    Date.now(),
  ]);
}

export async function setSoul(id, soulValues, systemPrompt) {
  await run('UPDATE sessions SET soul_values = ?, system_prompt = ? WHERE id = ?', [
    JSON.stringify(soulValues),
    systemPrompt,
    id,
  ]);
}

export async function finishSession(id) {
  await run('UPDATE sessions SET finished_at = ? WHERE id = ?', [
    Date.now(),
    id,
  ]);
}

export async function insertMessage({ sessionId, role, text }) {
  await run(
    'INSERT INTO messages (session_id, role, text, created_at) VALUES (?, ?, ?, ?)',
    [sessionId, role, text, Date.now()]
  );
}

// State reconstruction for the stateless serverless model — the visitor's
// soul/system prompt and chat history live entirely in these tables now.
export async function getSession(id) {
  const row = await get(
    'SELECT id, soul_values, system_prompt, started_at, finished_at FROM sessions WHERE id = ?',
    [id]
  );
  if (!row) return null;
  return {
    id: row.id,
    soul: row.soul_values ? JSON.parse(row.soul_values) : null,
    systemPrompt: row.system_prompt ?? null,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export async function getSessionHistory(id) {
  return all(
    'SELECT role, text FROM messages WHERE session_id = ? ORDER BY id ASC',
    [id]
  );
}

export async function countVisitorMessages(id) {
  const row = await get(
    "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND role = 'visitor'",
    [id]
  );
  return row.n;
}

export async function insertWisdom({ sessionId, text }) {
  const info = await run(
    'INSERT INTO wisdom (session_id, text, created_at) VALUES (?, ?, ?)',
    [sessionId, text, Date.now()]
  );
  return lastId(info);
}

export async function getRecentWisdom(limit = 50) {
  return all(
    'SELECT id, text, created_at FROM wisdom ORDER BY created_at DESC LIMIT ?',
    [limit]
  );
}

export async function getWisdomCount() {
  return (await get('SELECT COUNT(*) AS n FROM wisdom')).n;
}

export async function insertVote({ sessionId, questionId, optionId }) {
  await run(
    'INSERT INTO votes (session_id, question_id, option_id, created_at) VALUES (?, ?, ?, ?)',
    [sessionId ?? null, questionId, optionId, Date.now()]
  );
}

export async function getTally(questionId) {
  const rows = await all(
    'SELECT option_id, COUNT(*) AS n FROM votes WHERE question_id = ? GROUP BY option_id',
    [questionId]
  );
  return rows.reduce((acc, row) => {
    acc[row.option_id] = row.n;
    return acc;
  }, {});
}

export async function getAllTallies() {
  const rows = await all(
    'SELECT question_id, option_id, COUNT(*) AS n FROM votes GROUP BY question_id, option_id'
  );
  const out = {};
  for (const r of rows) {
    if (!out[r.question_id]) out[r.question_id] = {};
    out[r.question_id][r.option_id] = r.n;
  }
  return out;
}

export async function getTotalVotesToday() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return (
    await get('SELECT COUNT(*) AS n FROM votes WHERE created_at >= ?', [
      startOfDay.getTime(),
    ])
  ).n;
}

// =====================================================
// ANALYTICS — used by /operator
// =====================================================

export async function getTraitDistribution() {
  const out = { tone: {}, priority: {}, struggle: {} };
  for (const dim of ['tone', 'priority', 'struggle']) {
    const rows = await all(
      `SELECT json_extract(soul_values, '$.${dim}') AS k, COUNT(*) AS n
       FROM sessions
       WHERE soul_values IS NOT NULL
       GROUP BY k`
    );
    for (const r of rows) {
      if (r.k != null) out[dim][r.k] = r.n;
    }
  }
  return out;
}

export async function getCombinationCounts() {
  const rows = await all(
    `SELECT
       json_extract(soul_values, '$.tone') AS tone,
       json_extract(soul_values, '$.priority') AS priority,
       json_extract(soul_values, '$.struggle') AS struggle,
       COUNT(*) AS count
     FROM sessions
     WHERE soul_values IS NOT NULL
     GROUP BY tone, priority, struggle
     ORDER BY count DESC`
  );
  return rows.filter((r) => r.tone && r.priority && r.struggle);
}

export async function getAllWisdom() {
  return all('SELECT id, text, created_at FROM wisdom ORDER BY created_at DESC');
}

export async function getSessionFunnel() {
  const total = (await get('SELECT COUNT(*) AS n FROM sessions')).n;
  const shaped = (
    await get('SELECT COUNT(*) AS n FROM sessions WHERE soul_values IS NOT NULL')
  ).n;
  const finished = (
    await get('SELECT COUNT(*) AS n FROM sessions WHERE finished_at IS NOT NULL')
  ).n;
  return { total, shaped, finished };
}

export async function getTotalVotes() {
  return (await get('SELECT COUNT(*) AS n FROM votes')).n;
}

export async function setDemographic({ sessionId, bucket }) {
  await run(
    `INSERT INTO demographics (session_id, bucket, created_at) VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET bucket = excluded.bucket, created_at = excluded.created_at`,
    [sessionId, bucket, Date.now()]
  );
}

export async function getDemographicCounts() {
  const rows = await all(
    'SELECT bucket, COUNT(*) AS n FROM demographics GROUP BY bucket'
  );
  return rows.reduce((acc, r) => {
    acc[r.bucket] = r.n;
    return acc;
  }, {});
}

export async function getVotesByDemographic() {
  const rows = await all(
    `SELECT v.question_id, v.option_id, COALESCE(d.bucket, 'unknown') AS bucket, COUNT(*) AS n
     FROM votes v
     LEFT JOIN demographics d ON d.session_id = v.session_id
     GROUP BY v.question_id, v.option_id, bucket`
  );
  const out = {};
  for (const r of rows) {
    if (!out[r.question_id]) out[r.question_id] = {};
    if (!out[r.question_id][r.bucket]) out[r.question_id][r.bucket] = {};
    out[r.question_id][r.bucket][r.option_id] = r.n;
  }
  return out;
}

export async function getActivityByHour(hours = 24) {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const startHour = Math.floor(now / hourMs) - (hours - 1);
  const since = startHour * hourMs;

  const sessRows = await all(
    'SELECT (started_at / 3600000) AS h, COUNT(*) AS n FROM sessions WHERE started_at >= ? GROUP BY h',
    [since]
  );
  const wisdomRows = await all(
    'SELECT (created_at / 3600000) AS h, COUNT(*) AS n FROM wisdom WHERE created_at >= ? GROUP BY h',
    [since]
  );
  const voteRows = await all(
    'SELECT (created_at / 3600000) AS h, COUNT(*) AS n FROM votes WHERE created_at >= ? GROUP BY h',
    [since]
  );

  const sessMap = Object.fromEntries(sessRows.map((r) => [r.h, r.n]));
  const wisMap = Object.fromEntries(wisdomRows.map((r) => [r.h, r.n]));
  const voteMap = Object.fromEntries(voteRows.map((r) => [r.h, r.n]));

  const out = [];
  for (let i = 0; i < hours; i++) {
    const h = startHour + i;
    out.push({
      hour: h * hourMs,
      sessions: sessMap[h] ?? 0,
      wisdom: wisMap[h] ?? 0,
      votes: voteMap[h] ?? 0,
    });
  }
  return out;
}

export async function getBoothDayStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.getTime();

  const sessions = (
    await get('SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ?', [since])
  ).n;
  const finished = (
    await get(
      'SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ? AND finished_at IS NOT NULL',
      [since]
    )
  ).n;
  const wisdomToday = (
    await get('SELECT COUNT(*) AS n FROM wisdom WHERE created_at >= ?', [since])
  ).n;

  return {
    sessions,
    finished,
    wisdomToday,
    wisdomTotal: await getWisdomCount(),
  };
}

// =====================================================
// TURING-TEST helpers (/guess + /staff)
// =====================================================

export async function ttCreateSession(id, sequence) {
  await run('INSERT INTO tt_sessions (id, started_at, sequence) VALUES (?, ?, ?)', [
    id,
    Date.now(),
    JSON.stringify(sequence),
  ]);
}

export async function ttFinishSession(id) {
  await run('UPDATE tt_sessions SET finished_at = ? WHERE id = ?', [
    Date.now(),
    id,
  ]);
}

export async function ttGetSession(id) {
  const row = await get(
    'SELECT id, sequence, started_at, finished_at FROM tt_sessions WHERE id = ?',
    [id]
  );
  if (!row) return null;
  return {
    id: row.id,
    sequence: JSON.parse(row.sequence),
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

export async function ttGetHistory(id) {
  return all(
    'SELECT role, text FROM tt_messages WHERE session_id = ? ORDER BY turn ASC, id ASC',
    [id]
  );
}

export async function ttCountVisitorTurns(id) {
  const row = await get(
    "SELECT COUNT(*) AS n FROM tt_messages WHERE session_id = ? AND role = 'visitor'",
    [id]
  );
  return row.n;
}

export async function ttInsertMessage({ sessionId, turn, role, source, text }) {
  const info = await run(
    `INSERT INTO tt_messages (session_id, turn, role, source, text, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, turn, role, source ?? null, text, Date.now()]
  );
  return lastId(info);
}

export async function ttInsertGuess({ sessionId, messageId, guess, truth }) {
  const correct = guess === truth ? 1 : 0;
  await run(
    `INSERT INTO tt_guesses (session_id, message_id, guess, truth, correct, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [sessionId, messageId, guess, truth, correct, Date.now()]
  );
  return correct === 1;
}

export async function ttLookupMessage(messageId) {
  return get(
    'SELECT id, source, session_id FROM tt_messages WHERE id = ?',
    [messageId]
  );
}

export async function ttGetSessionTranscript(sessionId) {
  return all(
    `SELECT m.id, m.turn, m.role, m.source, m.text, g.guess, g.correct
     FROM tt_messages m
     LEFT JOIN tt_guesses g ON g.message_id = m.id
     WHERE m.session_id = ?
     ORDER BY m.turn ASC, m.id ASC`,
    [sessionId]
  );
}

export async function ttGetSessionStats(sessionId) {
  const row = await get(
    `SELECT
       SUM(CASE WHEN truth='ai' THEN 1 ELSE 0 END) AS ai_total,
       SUM(CASE WHEN truth='ai' AND correct=1 THEN 1 ELSE 0 END) AS ai_correct,
       SUM(CASE WHEN truth='human' THEN 1 ELSE 0 END) AS human_total,
       SUM(CASE WHEN truth='human' AND correct=1 THEN 1 ELSE 0 END) AS human_correct
     FROM tt_guesses WHERE session_id = ?`,
    [sessionId]
  );
  const aiTotal = row.ai_total ?? 0;
  const aiCorrect = row.ai_correct ?? 0;
  const humanTotal = row.human_total ?? 0;
  const humanCorrect = row.human_correct ?? 0;
  const totalGuesses = aiTotal + humanTotal;
  const totalCorrect = aiCorrect + humanCorrect;
  return {
    aiTotal,
    aiCorrect,
    humanTotal,
    humanCorrect,
    aiFooledRate: aiTotal ? 1 - aiCorrect / aiTotal : 0,
    humanFooledRate: humanTotal ? 1 - humanCorrect / humanTotal : 0,
    accuracy: totalGuesses ? totalCorrect / totalGuesses : 0,
    totalGuesses,
  };
}

export async function ttGetBoothDayStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.getTime();
  const sessions = (
    await get('SELECT COUNT(*) AS n FROM tt_sessions WHERE started_at >= ?', [
      since,
    ])
  ).n;
  const guessRow = await get(
    `SELECT
       SUM(CASE WHEN truth='ai' THEN 1 ELSE 0 END) AS ai_total,
       SUM(CASE WHEN truth='ai' AND correct=1 THEN 1 ELSE 0 END) AS ai_correct,
       SUM(CASE WHEN truth='human' THEN 1 ELSE 0 END) AS human_total,
       SUM(CASE WHEN truth='human' AND correct=1 THEN 1 ELSE 0 END) AS human_correct,
       COUNT(*) AS total
     FROM tt_guesses WHERE created_at >= ?`,
    [since]
  );
  return {
    sessions,
    totalGuesses: guessRow.total ?? 0,
    aiFooledRate: guessRow.ai_total
      ? 1 - guessRow.ai_correct / guessRow.ai_total
      : 0,
    humanFooledRate: guessRow.human_total
      ? 1 - guessRow.human_correct / guessRow.human_total
      : 0,
    accuracy: guessRow.total
      ? ((guessRow.ai_correct ?? 0) + (guessRow.human_correct ?? 0)) /
        guessRow.total
      : 0,
  };
}

// ---- operator handoff (tt_pending) -------------------------------------
// The handoff uses a claim pattern: a status transition guarded by a WHERE
// clause acts as an atomic lock so a poll-timeout and a staff response can
// never both finalize the same request (no duplicate partner messages).

export async function createPending({ requestId, sessionId, turn, history }) {
  await run(
    `INSERT INTO tt_pending (request_id, session_id, turn, history_json, status, created_at)
     VALUES (?, ?, ?, ?, 'waiting', ?)`,
    [requestId, sessionId, turn, JSON.stringify(history), Date.now()]
  );
}

export async function getPending(requestId) {
  const row = await get('SELECT * FROM tt_pending WHERE request_id = ?', [
    requestId,
  ]);
  if (!row) return null;
  return {
    requestId: row.request_id,
    sessionId: row.session_id,
    turn: row.turn,
    history: JSON.parse(row.history_json),
    status: row.status,
    responseText: row.response_text,
    source: row.source,
    messageId: row.message_id == null ? null : Number(row.message_id),
    claimedBy: row.claimed_by,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
  };
}

export async function listWaitingPending() {
  const rows = await all(
    "SELECT request_id, session_id, turn, history_json, created_at FROM tt_pending WHERE status = 'waiting' ORDER BY created_at ASC"
  );
  return rows.map((r) => ({
    requestId: r.request_id,
    sessionId: r.session_id,
    turn: r.turn,
    history: JSON.parse(r.history_json),
    createdAt: r.created_at,
  }));
}

// Atomically move a pending row from one status to another. Returns true only
// if THIS caller won the transition (rowsAffected === 1).
export async function claimPending(requestId, fromStatus, toStatus, by = null) {
  const res = await run(
    'UPDATE tt_pending SET status = ?, claimed_by = COALESCE(?, claimed_by) WHERE request_id = ? AND status = ?',
    [toStatus, by, requestId, fromStatus]
  );
  return res.rowsAffected === 1;
}

// Finalize a claimed row with the resolved message.
export async function finalizePending({
  requestId,
  status,
  text,
  source,
  messageId,
}) {
  await run(
    `UPDATE tt_pending
     SET status = ?, response_text = ?, source = ?, message_id = ?, answered_at = ?
     WHERE request_id = ?`,
    [status, text, source, messageId, Date.now(), requestId]
  );
}

export default client;
