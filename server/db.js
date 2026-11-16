// SQLite (встроен в Node): схема, запросы и настройки. Папку данных задаёт TQ_DATA (по умолчанию ./data).
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { randomInt } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEMPLATES } from './templates.js';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA = path.resolve(process.env.TQ_DATA || path.join(ROOT, 'data'));
export const UPLOADS = path.join(DATA, 'uploads');
mkdirSync(UPLOADS, { recursive: true });

const db = new DatabaseSync(process.env.TQ_DB || path.join(DATA, 'tugquiz.db'));
db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY,
  role TEXT NOT NULL,                       -- admin | teacher | student
  login TEXT NOT NULL UNIQUE COLLATE NOCASE,
  name TEXT NOT NULL,
  pass TEXT NOT NULL,
  class_name TEXT DEFAULT '',
  xp INTEGER DEFAULT 0,
  tour_done INTEGER DEFAULT 0,
  active INTEGER DEFAULT 1,
  created INTEGER
);
CREATE TABLE IF NOT EXISTS sessions(
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created INTEGER
);
CREATE TABLE IF NOT EXISTS quizzes(
  id INTEGER PRIMARY KEY,
  owner_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  subject TEXT DEFAULT 'gen',
  grade INTEGER DEFAULT 0,
  description TEXT DEFAULT '',
  lang TEXT DEFAULT 'ru',
  questions TEXT NOT NULL,                  -- JSON-список вопросов
  shared INTEGER DEFAULT 0,                 -- 1 = видят все учителя лицея
  template INTEGER DEFAULT 0,               -- 1 = встроенный шаблон
  plays INTEGER DEFAULT 0,
  created INTEGER,
  updated INTEGER
);
CREATE TABLE IF NOT EXISTS games(
  id INTEGER PRIMARY KEY,
  quiz_id INTEGER,
  host_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  title TEXT,
  subject TEXT,
  mode TEXT,                                -- tug | duel | solo | board
  status TEXT DEFAULT 'live',               -- live | done
  players INTEGER DEFAULT 0,
  created INTEGER,
  finished INTEGER,
  summary TEXT                              -- JSON с полной статистикой
);
CREATE TABLE IF NOT EXISTS game_players(
  game_id INTEGER REFERENCES games(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  name TEXT, team TEXT, score INTEGER, correct REAL, total INTEGER, place INTEGER, won INTEGER,
  avg_time REAL, best_streak INTEGER
);
CREATE INDEX IF NOT EXISTS gp_user ON game_players(user_id);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
`);

const cache = new Map();
const stmt = (sql) => cache.get(sql) || cache.set(sql, db.prepare(sql)).get(sql);
const plain = (r) => (r ? { ...r } : r);

export const all = (sql, ...a) => stmt(sql).all(...a).map(plain);
export const one = (sql, ...a) => plain(stmt(sql).get(...a));
export const run = (sql, ...a) => stmt(sql).run(...a);
export const tx = (fn) => {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
};

export const getSetting = (key, def = null) => {
  const r = one('SELECT value FROM settings WHERE key=?', key);
  return r ? JSON.parse(r.value) : def;
};
export const setSetting = (key, value) =>
  run('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', key, JSON.stringify(value));

export const now = () => Date.now();

if (getSetting('invite_code') === null) setSetting('invite_code', `SL165-${randomInt(1000, 9999)}`);
if (!one('SELECT 1 FROM quizzes WHERE template=1')) {
  tx(() => {
    for (const t of TEMPLATES) {
      run(`INSERT INTO quizzes(title,subject,grade,description,lang,questions,shared,template,created,updated)
           VALUES(?,?,?,?,?,?,1,1,?,?)`,
        t.title, t.subject, t.grade, t.description, t.lang || 'ru', JSON.stringify(t.questions), now(), now());
    }
  });
}
// Игры, прерванные перезапуском сервера, в истории не нужны.
run("DELETE FROM games WHERE status='live'");
