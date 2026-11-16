// HTTP-сервер TugQuiz: API, раздача сайта и загруженных файлов, WebSocket для живых игр.
import http from 'node:http';
import { createReadStream, createWriteStream, statSync } from 'node:fs';
import { unlink, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import QRCode from 'qrcode';
import * as db from './db.js';
import { meta, CLASSES } from './constants.js';
import { normalizeQuiz } from './quizlib.js';
import { buildPrompt, parseAiText, callAi } from './ai.js';
import { hashPassword, checkPassword, newSession, dropSession, userByToken, publicUser, sessionCookie, readCookie } from './auth.js';
import { createGame, attachSockets, byId } from './game.js';

const PORT = Number(process.env.PORT) || 8080;
const WEB = path.join(db.ROOT, 'web');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com", "img-src 'self' data: blob: https:", "media-src 'self' blob: https:",
  'frame-src https://www.youtube-nocookie.com https://www.youtube.com https://player.vimeo.com', "connect-src 'self' ws: wss:",
  "object-src 'none'", "base-uri 'self'", "frame-ancestors 'self'",
].join('; ');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

const userFromReq = (req) => userByToken(readCookie(req, 'sid'));
const isTeacher = (u) => u && (u.role === 'teacher' || u.role === 'admin');
const needTeacher = (u) => isTeacher(u) || fail(403, 'Только для учителей');
const needAdmin = (u) => u?.role === 'admin' || fail(403, 'Только для администратора');
const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https';

async function readJson(req, limit = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) fail(413, 'Слишком большой запрос');
    chunks.push(c);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks)); } catch { fail(400, 'Неверный JSON'); }
}

// ---------- защита входа от перебора ----------
const attempts = new Map();
function loginGuard(req) {
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
  const list = (attempts.get(ip) || []).filter((t) => Date.now() - t < 10 * 60e3);
  attempts.set(ip, list);
  if (list.length >= 10) fail(429, 'Слишком много попыток. Подождите 10 минут.');
  return () => list.push(Date.now());
}

// ---------- квизы ----------
const quizRow = (r) => r && { ...r, questions: JSON.parse(r.questions) };
const LIST_COLS = `q.id,q.title,q.subject,q.grade,q.description,q.lang,q.shared,q.template,q.plays,q.updated,q.owner_id,
  json_array_length(q.questions) AS count, u.name AS owner`;

function getQuiz(id, user, forEdit = false) {
  const q = quizRow(db.one('SELECT * FROM quizzes WHERE id=?', Number(id))) || fail(404, 'Квиз не найден');
  const own = q.owner_id === user.id || user.role === 'admin';
  if (forEdit ? !own : !(own || q.shared || q.template)) fail(403, 'Нет доступа к этому квизу');
  return q;
}

// ---------- загрузка файлов ----------
const SIGS = [
  ['.png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['.jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['.gif', (b) => b.subarray(0, 4).toString() === 'GIF8'],
  ['.webp', (b) => b.subarray(0, 4).toString() === 'RIFF' && b.subarray(8, 12).toString() === 'WEBP'],
  ['.mp4', (b) => b.subarray(4, 8).toString() === 'ftyp'],
  ['.webm', (b) => b.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))],
];

async function upload(req, kind) {
  const limit = kind === 'video' ? 50 * 1024 * 1024 : 5 * 1024 * 1024;
  if (Number(req.headers['content-length']) > limit) fail(413, kind === 'video' ? 'Видео больше 50 МБ' : 'Картинка больше 5 МБ');
  const tmp = path.join(db.UPLOADS, `tmp-${randomBytes(8).toString('hex')}`);
  const out = createWriteStream(tmp);
  let size = 0;
  let head = Buffer.alloc(0);
  try {
    for await (const c of req) {
      size += c.length;
      if (size > limit) fail(413, 'Файл слишком большой');
      if (head.length < 16) head = Buffer.concat([head, c]).subarray(0, 16);
      if (!out.write(c)) await new Promise((r) => out.once('drain', r));
    }
    await new Promise((r, j) => out.end((e) => (e ? j(e) : r())));
    const ext = SIGS.find(([, test]) => test(head))?.[0];
    const allowed = kind === 'video' ? ['.mp4', '.webm'] : ['.png', '.jpg', '.gif', '.webp'];
    if (!ext || !allowed.includes(ext)) fail(415, kind === 'video' ? 'Нужен MP4 или WebM' : 'Нужна картинка JPG, PNG, GIF или WebP');
    const name = `${Date.now().toString(36)}-${randomBytes(6).toString('hex')}${ext}`;
    await rename(tmp, path.join(db.UPLOADS, name));
    return { url: `/uploads/${name}` };
  } catch (e) {
    out.destroy();
    await unlink(tmp).catch(() => {});
    throw e;
  }
}

// ---------- маршруты ----------
const routes = [];
const on = (method, pattern, handler) => routes.push([method, new RegExp(`^${pattern}$`), handler]);

on('GET', '/api/me', ({ user }) => ({ user, needsSetup: !db.one('SELECT 1 FROM users'), meta: meta() }));

on('POST', '/api/register', async ({ body, req, res }) => {
  const first = !db.one('SELECT 1 FROM users');
  const role = first ? 'admin' : body.role === 'teacher' ? 'teacher' : 'student';
  const login = str(body.login, 32);
  const name = str(body.name, 60).replace(/\s+/g, ' ');
  const password = String(body.password || '');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(login)) fail(400, 'Логин: 3–32 латинских буквы, цифры, точка, _ или -');
  if (name.length < 2) fail(400, 'Введите имя');
  if (password.length < 6) fail(400, 'Пароль — минимум 6 символов');
  if (role === 'teacher' && str(body.invite).toUpperCase() !== String(db.getSetting('invite_code')).toUpperCase()) {
    fail(403, 'Неверный код учителя. Его выдаёт администратор.');
  }
  const cls = role === 'student' ? str(body.class_name, 4) : '';
  if (role === 'student' && !CLASSES.includes(cls)) fail(400, 'Выберите класс');
  if (db.one('SELECT 1 FROM users WHERE login=?', login)) fail(409, 'Такой логин уже занят');
  const id = Number(db.run('INSERT INTO users(role,login,name,pass,class_name,created) VALUES(?,?,?,?,?,?)',
    role, login, name, await hashPassword(password), cls, Date.now()).lastInsertRowid);
  res.setHeader('Set-Cookie', sessionCookie(newSession(id), isSecure(req)));
  return { user: publicUser(db.one('SELECT * FROM users WHERE id=?', id)) };
});

on('POST', '/api/login', async ({ body, req, res }) => {
  const failed = loginGuard(req);
  const u = db.one('SELECT * FROM users WHERE login=?', str(body.login, 32));
  if (!u || !(await checkPassword(String(body.password || ''), u.pass))) { failed(); fail(401, 'Неверный логин или пароль'); }
  if (!u.active) fail(403, 'Аккаунт отключён администратором');
  res.setHeader('Set-Cookie', sessionCookie(newSession(u.id), isSecure(req)));
  return { user: publicUser(u) };
});

on('POST', '/api/logout', ({ req, res }) => {
  dropSession(readCookie(req, 'sid'));
  res.setHeader('Set-Cookie', sessionCookie('', isSecure(req)));
  return { ok: true };
});

on('PATCH', '/api/me', async ({ user, body }) => {
  user || fail(401, 'Войдите в аккаунт');
  if (body.name !== undefined) {
    const name = str(body.name, 60);
    if (name.length < 2) fail(400, 'Введите имя');
    db.run('UPDATE users SET name=? WHERE id=?', name, user.id);
  }
  if (body.class_name !== undefined && user.role === 'student') {
    CLASSES.includes(body.class_name) || fail(400, 'Выберите класс');
    db.run('UPDATE users SET class_name=? WHERE id=?', body.class_name, user.id);
  }
  if (body.tour_done !== undefined) db.run('UPDATE users SET tour_done=? WHERE id=?', body.tour_done ? 1 : 0, user.id);
  if (body.password) {
    const row = db.one('SELECT pass FROM users WHERE id=?', user.id);
    if (!(await checkPassword(String(body.oldPassword || ''), row.pass))) fail(403, 'Старый пароль неверный');
    if (String(body.password).length < 6) fail(400, 'Пароль — минимум 6 символов');
    db.run('UPDATE users SET pass=? WHERE id=?', await hashPassword(String(body.password)), user.id);
  }
  return { user: publicUser(db.one('SELECT * FROM users WHERE id=?', user.id)) };
});

on('GET', '/api/quizzes', ({ user, url }) => {
  needTeacher(user);
  return url.searchParams.get('scope') === 'library'
    ? db.all(`SELECT ${LIST_COLS} FROM quizzes q LEFT JOIN users u ON u.id=q.owner_id
              WHERE q.template=1 OR q.shared=1 ORDER BY q.template DESC, q.plays DESC, q.updated DESC`)
    : db.all(`SELECT ${LIST_COLS} FROM quizzes q LEFT JOIN users u ON u.id=q.owner_id WHERE q.owner_id=? ORDER BY q.updated DESC`, user.id);
});

on('GET', '/api/quizzes/(\\d+)', ({ user, params }) => (needTeacher(user), getQuiz(params[0], user)));

on('POST', '/api/quizzes', ({ user, body }) => {
  needTeacher(user);
  const q = normalizeQuiz(body);
  const id = db.run(`INSERT INTO quizzes(owner_id,title,subject,grade,description,lang,questions,shared,created,updated)
                     VALUES(?,?,?,?,?,?,?,?,?,?)`, user.id, q.title, q.subject, q.grade, q.description, q.lang,
  JSON.stringify(q.questions), q.shared, Date.now(), Date.now()).lastInsertRowid;
  return { id: Number(id) };
});

on('PUT', '/api/quizzes/(\\d+)', ({ user, body, params }) => {
  needTeacher(user);
  const old = getQuiz(params[0], user, true);
  const q = normalizeQuiz(body);
  db.run('UPDATE quizzes SET title=?,subject=?,grade=?,description=?,lang=?,questions=?,shared=?,updated=? WHERE id=?',
    q.title, q.subject, q.grade, q.description, q.lang, JSON.stringify(q.questions), q.shared, Date.now(), old.id);
  return { id: old.id };
});

on('DELETE', '/api/quizzes/(\\d+)', ({ user, params }) => {
  needTeacher(user);
  const q = getQuiz(params[0], user, true);
  if (q.template && user.role !== 'admin') fail(403, 'Шаблоны удаляет только администратор');
  db.run('DELETE FROM quizzes WHERE id=?', q.id);
  return { ok: true };
});

on('POST', '/api/quizzes/(\\d+)/copy', ({ user, params }) => {
  needTeacher(user);
  const q = getQuiz(params[0], user);
  const id = db.run(`INSERT INTO quizzes(owner_id,title,subject,grade,description,lang,questions,created,updated)
                     VALUES(?,?,?,?,?,?,?,?,?)`, user.id, `${q.title} (копия)`.slice(0, 120), q.subject, q.grade, q.description,
  q.lang, JSON.stringify(q.questions), Date.now(), Date.now()).lastInsertRowid;
  return { id: Number(id) };
});

on('POST', '/api/upload', ({ user, req, url }) => (needTeacher(user), upload(req, url.searchParams.get('kind') === 'video' ? 'video' : 'image')));

// ---------- ИИ ----------
const aiConf = () => db.getSetting('ai', {});
on('GET', '/api/ai/status', ({ user }) => (needTeacher(user), { enabled: Boolean(aiConf().key), provider: aiConf().provider || '' }));
on('POST', '/api/ai/prompt', ({ user, body }) => (needTeacher(user), { prompt: buildPrompt(body) }));
on('POST', '/api/ai/parse', ({ user, body }) => {
  needTeacher(user);
  try { return parseAiText(body.text); } catch (e) { fail(400, e.message); }
});
on('POST', '/api/ai/generate', async ({ user, body }) => {
  needTeacher(user);
  let text;
  const image = body.image ? String(body.image) : '';
  if (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) fail(400, 'Фото должно быть JPG, PNG или WebP');
  try { text = await callAi(aiConf(), buildPrompt({ ...body, hasImage: Boolean(image) }), image || undefined); } catch (e) {
    fail(502, image ? `${e.message}. Если модель не понимает фото — выберите Gemini в настройках ИИ или уберите фото.` : e.message);
  }
  try { return parseAiText(text); } catch (e) { fail(502, `ИИ ответил в неверном формате: ${e.message}`); }
});

// ---------- игры ----------
on('POST', '/api/games', ({ user, body }) => {
  needTeacher(user);
  const quiz = getQuiz(body.quizId, user);
  const mode = ['tug', 'duel', 'solo'].includes(body.mode) ? body.mode : 'tug';
  const g = createGame({ hostId: user.id, quiz, mode, opts: body.opts || {} });
  return { id: g.id, pin: g.pin };
});

on('POST', '/api/games/board', ({ user, body }) => {
  needTeacher(user);
  const s = body.summary;
  if (!s || typeof s !== 'object') fail(400, 'Нет результатов');
  const summary = { ...s, mode: 'board', title: str(s.title, 120) || 'Арқан тартыс на доске' };
  const text = JSON.stringify(summary);
  if (text.length > 300_000) fail(413, 'Слишком большой отчёт');
  const id = db.run(`INSERT INTO games(quiz_id,host_id,title,subject,mode,status,players,created,finished,summary)
                     VALUES(?,?,?,?,'board','done',2,?,?,?)`, Number(s.quizId) || null, user.id, summary.title,
  str(s.subject, 8) || 'mat', Number(s.started) || Date.now(), Date.now(), text).lastInsertRowid;
  return { id: Number(id) };
});

on('GET', '/api/games', ({ user }) => {
  needTeacher(user);
  return db.all(`SELECT id,title,subject,mode,players,created,finished,json_extract(summary,'$.winner') AS winner,
                 json_extract(summary,'$.teams') AS teams FROM games WHERE host_id=? AND status='done' ORDER BY finished DESC LIMIT 500`, user.id)
    .map((g) => ({ ...g, teams: g.teams ? JSON.parse(g.teams) : null }));
});

on('GET', '/api/games/live', ({ user }) => {
  needTeacher(user);
  return [...byId.values()].filter((g) => g.hostId === user.id && g.phase !== 'final')
    .map((g) => ({ id: g.id, pin: g.pin, title: g.title, mode: g.mode, phase: g.phase, players: g.players.size }));
});

on('GET', '/api/games/(\\d+)', ({ user, params }) => {
  needTeacher(user);
  const g = db.one('SELECT * FROM games WHERE id=?', Number(params[0])) || fail(404, 'Игра не найдена');
  if (g.host_id !== user.id && user.role !== 'admin') fail(403, 'Нет доступа');
  if (g.status !== 'done') fail(409, 'Игра ещё идёт');
  return { id: g.id, created: g.created, finished: g.finished, ...JSON.parse(g.summary) };
});

on('DELETE', '/api/games/(\\d+)', ({ user, params }) => {
  needTeacher(user);
  const r = db.run("DELETE FROM games WHERE id=? AND (host_id=? OR ?) AND status='done'", Number(params[0]), user.id, user.role === 'admin' ? 1 : 0);
  return { ok: r.changes > 0 };
});

on('GET', '/api/qr', async ({ url, res }) => {
  const svg = await QRCode.toString(str(url.searchParams.get('text'), 300), { type: 'svg', margin: 1, color: { dark: '#0b3d1f', light: '#ffffff' } });
  res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
  res.end(svg);
});

// ---------- ученики ----------
on('GET', '/api/student/stats', ({ user }) => {
  user || fail(401, 'Войдите в аккаунт');
  const games = db.all(`SELECT gp.*, g.title, g.subject, g.mode, g.finished FROM game_players gp JOIN games g ON g.id=gp.game_id
                        WHERE gp.user_id=? ORDER BY g.finished DESC LIMIT 200`, user.id);
  const me = db.one('SELECT xp, class_name FROM users WHERE id=?', user.id);
  const rank = db.one("SELECT COUNT(*)+1 AS r FROM users WHERE role='student' AND xp>?", me.xp).r;
  return { xp: me.xp, rank, games };
});

on('GET', '/api/leaderboard', ({ user, url }) => {
  user || fail(401, 'Войдите в аккаунт');
  const cls = url.searchParams.get('class');
  return CLASSES.includes(cls)
    ? db.all("SELECT name, class_name, xp FROM users WHERE role='student' AND active=1 AND class_name=? ORDER BY xp DESC LIMIT 50", cls)
    : db.all("SELECT name, class_name, xp FROM users WHERE role='student' AND active=1 ORDER BY xp DESC LIMIT 50");
});

// ---------- администратор ----------
const maskKey = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '');
on('GET', '/api/admin/settings', ({ user }) => {
  needAdmin(user);
  const ai = aiConf();
  return { invite_code: db.getSetting('invite_code'), ai: { ...ai, key: maskKey(ai.key), hasKey: Boolean(ai.key) } };
});

on('PUT', '/api/admin/settings', ({ user, body }) => {
  needAdmin(user);
  if (body.invite_code !== undefined) {
    const code = str(body.invite_code, 32);
    if (code.length < 4) fail(400, 'Код учителя — минимум 4 символа');
    db.setSetting('invite_code', code);
  }
  if (body.ai) {
    const old = aiConf();
    const base = str(body.ai.base, 300);
    if (base && !/^https:\/\//.test(base)) fail(400, 'Адрес API должен начинаться с https://');
    db.setSetting('ai', {
      provider: str(body.ai.provider, 30), base, model: str(body.ai.model, 120),
      key: body.ai.key === undefined ? old.key : str(body.ai.key, 300),
    });
  }
  return { ok: true };
});

on('GET', '/api/admin/users', ({ user }) => {
  needAdmin(user);
  return db.all(`SELECT id, role, login, name, class_name, xp, active, created,
                 (SELECT COUNT(*) FROM quizzes WHERE owner_id=users.id) AS quizzes,
                 (SELECT COUNT(*) FROM games WHERE host_id=users.id AND status='done') AS games
                 FROM users ORDER BY role, name`);
});

on('PATCH', '/api/admin/users/(\\d+)', async ({ user, body, params }) => {
  needAdmin(user);
  const id = Number(params[0]);
  if (id === user.id) fail(400, 'Себя менять нельзя');
  if (body.active !== undefined) {
    db.run('UPDATE users SET active=? WHERE id=?', body.active ? 1 : 0, id);
    if (!body.active) db.run('DELETE FROM sessions WHERE user_id=?', id);
  }
  if (['teacher', 'admin', 'student'].includes(body.role)) db.run('UPDATE users SET role=? WHERE id=?', body.role, id);
  if (body.password) {
    if (String(body.password).length < 6) fail(400, 'Пароль — минимум 6 символов');
    db.run('UPDATE users SET pass=? WHERE id=?', await hashPassword(String(body.password)), id);
    db.run('DELETE FROM sessions WHERE user_id=?', id);
  }
  return { ok: true };
});

// ---------- статика ----------
function serveFile(req, res, file, immutable) {
  let st;
  try { st = statSync(file); } catch { st = null; }
  if (!st?.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Не найдено');
  }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache' };
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range && type.startsWith('video/')) {
    const start = Number(range[1] || 0);
    const end = Math.min(range[2] ? Number(range[2]) : st.size - 1, st.size - 1);
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  createReadStream(file).pipe(res);
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/uploads/')) {
    const name = path.basename(pathname);
    return serveFile(req, res, path.join(db.UPLOADS, name), true);
  }
  const rel = path.normalize(decodeURIComponent(pathname === '/' ? '/index.html' : pathname)).replace(/^([/\\])+/, '');
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB + path.sep)) { res.writeHead(403); return res.end(); }
  serveFile(req, res, file, rel.startsWith('vendor'));
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', CSP);
  const url = new URL(req.url, 'http://local');
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
    return serveStatic(req, res, url.pathname);
  }
  try {
    const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname)) || fail(404, 'Нет такого метода API');
    // Защита от CSRF: изменяющие запросы принимаем только из нашего же сайта.
    if (req.method !== 'GET' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) fail(403, 'Чужой источник запроса');
    const body = req.method === 'GET' || url.pathname === '/api/upload' ? {} : await readJson(req, url.pathname === '/api/ai/generate' ? 8e6 : 1e6);
    const result = await route[2]({ req, res, url, body, user: userFromReq(req), params: url.pathname.match(route[1]).slice(1) });
    if (!res.headersSent) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(result ?? null));
    }
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (res.headersSent) return res.end();
    res.writeHead(e.status || 500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: e instanceof HttpError ? e.message : 'Ошибка сервера' }));
  }
});

attachSockets(server, userFromReq);
server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`TugQuiz · SL165 запущен: http://localhost:${PORT}`);
  console.log(`Код для регистрации учителей: ${db.getSetting('invite_code')}`);
});
