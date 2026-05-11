import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database(path.join(__dirname, 'booth.db'));
db.pragma('journal_mode = WAL');

db.exec(`
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
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
  );

  CREATE TABLE IF NOT EXISTS wisdom (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    text TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    FOREIGN KEY (session_id) REFERENCES sessions(id)
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

  CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_wisdom_created ON wisdom(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_votes_q ON votes(question_id, option_id);
  CREATE INDEX IF NOT EXISTS idx_votes_session ON votes(session_id);
  CREATE INDEX IF NOT EXISTS idx_demos_bucket ON demographics(bucket);
  CREATE INDEX IF NOT EXISTS idx_tt_messages_session ON tt_messages(session_id);
  CREATE INDEX IF NOT EXISTS idx_tt_guesses_session ON tt_guesses(session_id);
`);

export function createSession(id) {
  db.prepare('INSERT INTO sessions (id, started_at) VALUES (?, ?)').run(
    id,
    Date.now()
  );
}

export function setSoul(id, soulValues, systemPrompt) {
  db.prepare(
    'UPDATE sessions SET soul_values = ?, system_prompt = ? WHERE id = ?'
  ).run(JSON.stringify(soulValues), systemPrompt, id);
}

export function finishSession(id) {
  db.prepare('UPDATE sessions SET finished_at = ? WHERE id = ?').run(
    Date.now(),
    id
  );
}

export function insertMessage({ sessionId, role, text }) {
  db.prepare(
    'INSERT INTO messages (session_id, role, text, created_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId, role, text, Date.now());
}

export function insertWisdom({ sessionId, text }) {
  const info = db
    .prepare(
      'INSERT INTO wisdom (session_id, text, created_at) VALUES (?, ?, ?)'
    )
    .run(sessionId, text, Date.now());
  return info.lastInsertRowid;
}

export function getRecentWisdom(limit = 50) {
  return db
    .prepare(
      'SELECT id, text, created_at FROM wisdom ORDER BY created_at DESC LIMIT ?'
    )
    .all(limit);
}

export function getWisdomCount() {
  return db.prepare('SELECT COUNT(*) AS n FROM wisdom').get().n;
}

export function insertVote({ sessionId, questionId, optionId }) {
  db.prepare(
    'INSERT INTO votes (session_id, question_id, option_id, created_at) VALUES (?, ?, ?, ?)'
  ).run(sessionId ?? null, questionId, optionId, Date.now());
}

export function getTally(questionId) {
  return db
    .prepare(
      'SELECT option_id, COUNT(*) AS n FROM votes WHERE question_id = ? GROUP BY option_id'
    )
    .all(questionId)
    .reduce((acc, row) => {
      acc[row.option_id] = row.n;
      return acc;
    }, {});
}

export function getAllTallies() {
  const rows = db
    .prepare(
      'SELECT question_id, option_id, COUNT(*) AS n FROM votes GROUP BY question_id, option_id'
    )
    .all();
  const out = {};
  for (const r of rows) {
    if (!out[r.question_id]) out[r.question_id] = {};
    out[r.question_id][r.option_id] = r.n;
  }
  return out;
}

export function getTotalVotesToday() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  return db
    .prepare('SELECT COUNT(*) AS n FROM votes WHERE created_at >= ?')
    .get(startOfDay.getTime()).n;
}

// =====================================================
// ANALYTICS — used by /operator
// =====================================================

export function getTraitDistribution() {
  // Returns { tone: {honest: N, kind: N}, priority: {...}, struggle: {...} }
  const out = { tone: {}, priority: {}, struggle: {} };
  for (const dim of ['tone', 'priority', 'struggle']) {
    const rows = db
      .prepare(
        `SELECT json_extract(soul_values, '$.${dim}') AS k, COUNT(*) AS n
         FROM sessions
         WHERE soul_values IS NOT NULL
         GROUP BY k`
      )
      .all();
    for (const r of rows) {
      if (r.k != null) out[dim][r.k] = r.n;
    }
  }
  return out;
}

export function getCombinationCounts() {
  // Returns array of { tone, priority, struggle, count } sorted desc.
  return db
    .prepare(
      `SELECT
         json_extract(soul_values, '$.tone') AS tone,
         json_extract(soul_values, '$.priority') AS priority,
         json_extract(soul_values, '$.struggle') AS struggle,
         COUNT(*) AS count
       FROM sessions
       WHERE soul_values IS NOT NULL
       GROUP BY tone, priority, struggle
       ORDER BY count DESC`
    )
    .all()
    .filter((r) => r.tone && r.priority && r.struggle);
}

export function getAllWisdom() {
  return db
    .prepare(
      'SELECT id, text, created_at FROM wisdom ORDER BY created_at DESC'
    )
    .all();
}

export function getSessionFunnel() {
  // Sessions started, sessions with a soul shaped, sessions completed (finished_at set)
  const total = db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n;
  const shaped = db
    .prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE soul_values IS NOT NULL'
    )
    .get().n;
  const finished = db
    .prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE finished_at IS NOT NULL'
    )
    .get().n;
  return { total, shaped, finished };
}

export function getTotalVotes() {
  return db.prepare('SELECT COUNT(*) AS n FROM votes').get().n;
}

// Demographic bucket capture (one per session, latest wins via REPLACE).
export function setDemographic({ sessionId, bucket }) {
  db.prepare(
    `INSERT INTO demographics (session_id, bucket, created_at) VALUES (?, ?, ?)
     ON CONFLICT(session_id) DO UPDATE SET bucket = excluded.bucket, created_at = excluded.created_at`
  ).run(sessionId, bucket, Date.now());
}

export function getDemographicCounts() {
  const rows = db
    .prepare('SELECT bucket, COUNT(*) AS n FROM demographics GROUP BY bucket')
    .all();
  return rows.reduce((acc, r) => {
    acc[r.bucket] = r.n;
    return acc;
  }, {});
}

// Per-question vote tally split by demographic bucket.
// Returns { [questionId]: { [bucket]: { [optionId]: count } } }
export function getVotesByDemographic() {
  const rows = db
    .prepare(
      `SELECT v.question_id, v.option_id, COALESCE(d.bucket, 'unknown') AS bucket, COUNT(*) AS n
       FROM votes v
       LEFT JOIN demographics d ON d.session_id = v.session_id
       GROUP BY v.question_id, v.option_id, bucket`
    )
    .all();
  const out = {};
  for (const r of rows) {
    if (!out[r.question_id]) out[r.question_id] = {};
    if (!out[r.question_id][r.bucket]) out[r.question_id][r.bucket] = {};
    out[r.question_id][r.bucket][r.option_id] = r.n;
  }
  return out;
}

// Activity binned by hour for the last `hours` hours.
// Returns array of { hour: epoch_ms_at_top_of_hour, sessions, wisdom, votes }
export function getActivityByHour(hours = 24) {
  const now = Date.now();
  const hourMs = 60 * 60 * 1000;
  const startHour = Math.floor(now / hourMs) - (hours - 1);
  const since = startHour * hourMs;

  const sessRows = db
    .prepare(
      "SELECT (started_at / 3600000) AS h, COUNT(*) AS n FROM sessions WHERE started_at >= ? GROUP BY h"
    )
    .all(since);
  const wisdomRows = db
    .prepare(
      "SELECT (created_at / 3600000) AS h, COUNT(*) AS n FROM wisdom WHERE created_at >= ? GROUP BY h"
    )
    .all(since);
  const voteRows = db
    .prepare(
      "SELECT (created_at / 3600000) AS h, COUNT(*) AS n FROM votes WHERE created_at >= ? GROUP BY h"
    )
    .all(since);

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

export function getBoothDayStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.getTime();

  const sessions = db
    .prepare('SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ?')
    .get(since).n;

  const finished = db
    .prepare(
      'SELECT COUNT(*) AS n FROM sessions WHERE started_at >= ? AND finished_at IS NOT NULL'
    )
    .get(since).n;

  const wisdomToday = db
    .prepare('SELECT COUNT(*) AS n FROM wisdom WHERE created_at >= ?')
    .get(since).n;

  return {
    sessions,
    finished,
    wisdomToday,
    wisdomTotal: getWisdomCount(),
  };
}

// =====================================================
// TURING-TEST helpers (isolated; do not touch the
// Soul Mirror tables or the press-grade analytics)
// =====================================================

export function ttCreateSession(id, sequence) {
  db.prepare(
    'INSERT INTO tt_sessions (id, started_at, sequence) VALUES (?, ?, ?)'
  ).run(id, Date.now(), JSON.stringify(sequence));
}

export function ttFinishSession(id) {
  db.prepare('UPDATE tt_sessions SET finished_at = ? WHERE id = ?').run(
    Date.now(),
    id
  );
}

export function ttInsertMessage({ sessionId, turn, role, source, text }) {
  const info = db
    .prepare(
      `INSERT INTO tt_messages (session_id, turn, role, source, text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(sessionId, turn, role, source ?? null, text, Date.now());
  return info.lastInsertRowid;
}

export function ttInsertGuess({ sessionId, messageId, guess, truth }) {
  const correct = guess === truth ? 1 : 0;
  db.prepare(
    `INSERT INTO tt_guesses (session_id, message_id, guess, truth, correct, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(sessionId, messageId, guess, truth, correct, Date.now());
  return correct === 1;
}

export function ttLookupMessage(messageId) {
  return db
    .prepare('SELECT id, source, session_id FROM tt_messages WHERE id = ?')
    .get(messageId);
}

export function ttGetSessionTranscript(sessionId) {
  return db
    .prepare(
      `SELECT m.id, m.turn, m.role, m.source, m.text, g.guess, g.correct
       FROM tt_messages m
       LEFT JOIN tt_guesses g ON g.message_id = m.id
       WHERE m.session_id = ?
       ORDER BY m.turn ASC, m.id ASC`
    )
    .all(sessionId);
}

export function ttGetSessionStats(sessionId) {
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN truth='ai' THEN 1 ELSE 0 END) AS ai_total,
         SUM(CASE WHEN truth='ai' AND correct=1 THEN 1 ELSE 0 END) AS ai_correct,
         SUM(CASE WHEN truth='human' THEN 1 ELSE 0 END) AS human_total,
         SUM(CASE WHEN truth='human' AND correct=1 THEN 1 ELSE 0 END) AS human_correct
       FROM tt_guesses WHERE session_id = ?`
    )
    .get(sessionId);
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

export function ttGetBoothDayStats() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const since = startOfDay.getTime();
  const sessions = db
    .prepare('SELECT COUNT(*) AS n FROM tt_sessions WHERE started_at >= ?')
    .get(since).n;
  const guessRow = db
    .prepare(
      `SELECT
         SUM(CASE WHEN truth='ai' THEN 1 ELSE 0 END) AS ai_total,
         SUM(CASE WHEN truth='ai' AND correct=1 THEN 1 ELSE 0 END) AS ai_correct,
         SUM(CASE WHEN truth='human' THEN 1 ELSE 0 END) AS human_total,
         SUM(CASE WHEN truth='human' AND correct=1 THEN 1 ELSE 0 END) AS human_correct,
         COUNT(*) AS total
       FROM tt_guesses WHERE created_at >= ?`
    )
    .get(since);
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

export default db;
