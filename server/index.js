// HTTP-сервер TugQuiz: API, раздача сайта и загруженных файлов, WebSocket для живых игр.
import http from 'node:http';
import { createReadStream, createWriteStream, statSync, readFileSync } from 'node:fs';
import { brotliCompressSync, gzipSync, constants as zc } from 'node:zlib';
import { unlink, rename } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import os from 'node:os';
import { exec } from 'node:child_process';
import QRCode from 'qrcode';
import * as db from './db.js';
import { meta, isClass, SUBJECTS, CUSTOM_COLORS } from './constants.js';
import { normalizeQuiz } from './quizlib.js';
import { buildPrompt, buildPackPrompt, parseAiText, callAi } from './ai.js';
import { hashPassword, checkPassword, newSession, dropSession, dropOtherSessions, userByToken, publicUser, sessionCookie, readCookie, touchSession, newReset, peekReset, takeReset, dropResets, cleanEmail } from './auth.js';
import { mailConf, mailReady, sendMail, resetLetter, emailChangedLetter } from './mail.js';
import { createGame, attachSockets, byId } from './game.js';
import { checkName, NAME_ERROR } from '../web/js/names.js';
import { clientIp, limiter, safeEqual, weakPassword, sameOrigin, applySecurityHeaders, audit, publicHttpsUrl, loginShield, subnet, turnstile } from './security.js';

// Ни одна ошибка не должна ронять сервер: пишем в журнал и продолжаем работать.
process.on('uncaughtException', (e) => console.error('uncaughtException', e));
process.on('unhandledRejection', (e) => console.error('unhandledRejection', e));

const PORT = Number(process.env.PORT) || 8080;
const WEB = path.join(db.ROOT, 'web');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.mp4': 'video/mp4',
  '.webm': 'video/webm', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8',
};
const CSP = [
  "default-src 'self'", "script-src 'self' https://challenges.cloudflare.com", "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:", "img-src 'self' data: blob: https:", "media-src 'self' blob: https:",
  'frame-src https://www.youtube-nocookie.com https://player.vimeo.com https://challenges.cloudflare.com', "connect-src 'self' {WS}",
  "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'self'",
].join('; ');
// На загруженные файлы, открытые напрямую, скрипты не действуют вообще.
const UPLOAD_CSP = "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox";

// Ограничители частоты (по IP клиента; за школьным Wi-Fi много учеников делят один адрес, поэтому числа щедрые).
const apiLimit = limiter(1500, 60e3); // любые запросы к API
// Подбор паролей (в том числе ботами через VPN) — см. loginShield в security.js. Ключ подписи «знакомых устройств» живёт в базе.
if (!db.getSetting('kd_secret')) db.setSetting('kd_secret', randomBytes(32).toString('hex'));
const shield = loginShield(db.getSetting('kd_secret'));
const pwChecks = limiter(20, 15 * 60e3); // проверок текущего пароля в профиле (смена почты/пароля)
const registerLimit = limiter(80, 3600e3); // регистрации с одного IP
const registerNet = limiter(200, 3600e3); // с одной подсети (VPN выдаёт соседние адреса)
const registerAll = limiter(1500, 3600e3); // и со всего сайта
const inviteIpFails = limiter(8, 3600e3); // неверные коды учителя с одного IP
// Код учителя по всему сайту: боты с тысяч VPN-адресов упираются сюда (10 в час и 30 в сутки).
const inviteAllFails = limiter(10, 3600e3);
const inviteDayFails = limiter(30, 864e5);
const uploadLimit = limiter(60, 3600e3); // загрузок файлов от одного учителя
const aiLimit = limiter(30, 3600e3); // запросов к ИИ от одного учителя
const forgotIpLimit = limiter(10, 3600e3); // запросов «забыли пароль» с одного IP
const forgotUserLimit = limiter(3, 3600e3); // писем одному пользователю в час
const forgotMailLimit = limiter(3, 3600e3); // писем на один адрес в час (против засыпания чужого ящика)
const forgotAllLimit = limiter(100, 3600e3); // писем со всего сайта в час (чтобы Gmail не заблокировал ящик)
const resetFails = limiter(30, 3600e3); // неверных ссылок сброса с одного IP
const liveLimit = 15; // одновременных игр у одного ведущего

const captcha = turnstile(process.env.TURNSTILE_SITE, process.env.TURNSTILE_SECRET);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const fail = (status, message) => { throw new HttpError(status, message); };
const needHuman = async (body, req) => { if (!(await captcha.ok(body.cf, clientIp(req)))) fail(400, 'Не удалось подтвердить, что вы не робот. Обновите страницу и попробуйте ещё раз.'); };
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);

const userFromReq = (req) => userByToken(readCookie(req, 'sid'));
const isTeacher = (u) => u && (u.role === 'teacher' || u.role === 'admin');
const needTeacher = (u) => isTeacher(u) || fail(403, 'Только для учителей');
const needAdmin = (u) => u?.role === 'admin' || fail(403, 'Только для администратора');
const isSecure = (req) => req.headers['x-forwarded-proto'] === 'https';

async function readJson(req, limit = 1_000_000) {
  if (Number(req.headers['content-length']) > limit) fail(413, 'Слишком большой запрос');
  let size = 0;
  const chunks = [];
  for await (const c of req) {
    size += c.length;
    if (size > limit) fail(413, 'Слишком большой запрос');
    chunks.push(c);
  }
  if (!size) return {};
  let data;
  try { data = JSON.parse(Buffer.concat(chunks)); } catch { fail(400, 'Неверный JSON'); }
  if (!data || typeof data !== 'object' || Array.isArray(data)) fail(400, 'Неверный запрос');
  return data;
}

/** Проверить пароль, не перегружая процессор: при флуде лишние запросы получают «занято». */
const checkPw = (pw, hash) => (shield.full() ? fail(503, 'Сервер сейчас занят. Повторите через минуту.') : shield.slot(() => checkPassword(pw, hash)));

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

async function upload(req, kind, user) {
  if (!uploadLimit.hit(user.id)) fail(429, 'Слишком много загрузок. Попробуйте через час.');
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

// Свои предметы учителей (французский, психология…) хранятся в настройках и видны всем учителям.
const customSubjects = () => db.getSetting('subjects_custom', []);
const isSubject = (k) => Boolean(SUBJECTS[k]) || customSubjects().some((s) => s.key === k);
const siteMeta = () => meta(customSubjects());

on('GET', '/api/me', ({ user, req, res }) => {
  const token = readCookie(req, 'sid');
  // Вход живёт бессрочно, пока устройством пользуются: раз в сутки продлеваем cookie.
  if (user && touchSession(token)) res.setHeader('Set-Cookie', sessionCookie(token, isSecure(req)));
  // Cookie есть, а сессии нет — в аккаунт вошли на другом устройстве (или сменили пароль).
  const kicked = !user && Boolean(token);
  if (kicked) res.setHeader('Set-Cookie', sessionCookie('', isSecure(req)));
  return { user, kicked, needsSetup: !db.one('SELECT 1 FROM users'), meta: siteMeta(), mail: mailReady(), captcha: captcha.site };
});

on('POST', '/api/subjects', ({ user, body }) => {
  needTeacher(user);
  const name = str(body.name, 40).replace(/\s+/g, ' ');
  if (name.length < 2) fail(400, 'Введите название предмета');
  const all = siteMeta().subjects;
  const same = all.find((s) => [s.ru, s.kk].some((n) => n.toLowerCase() === name.toLowerCase()));
  if (same) return { key: same.key, meta: siteMeta() };
  const list = customSubjects();
  if (list.length >= 200) fail(400, 'Слишком много своих предметов');
  const item = { key: `c${Date.now().toString(36)}`, ru: name, kk: name, color: CUSTOM_COLORS[list.length % CUSTOM_COLORS.length] };
  db.setSetting('subjects_custom', [...list, item]);
  return { key: item.key, meta: siteMeta() };
});

on('POST', '/api/register', async ({ body, req, res }) => {
  await needHuman(body, req);
  const ip = clientIp(req);
  if (!registerLimit.hit(ip) || !registerNet.hit(subnet(ip)) || !registerAll.hit('all')) { audit('register-flood', req); fail(429, 'Слишком много регистраций с этого адреса. Попробуйте позже.'); }
  const first = !db.one('SELECT 1 FROM users');
  const role = first ? 'admin' : body.role === 'teacher' ? 'teacher' : 'student';
  const login = str(body.login, 32);
  let name = str(body.name, 60).replace(/\s+/g, ' ');
  if (role === 'student') { const c = checkName(name); c.ok || fail(400, NAME_ERROR); name = c.name; }
  const password = String(body.password || '');
  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(login)) fail(400, 'Логин: 3–32 латинских буквы, цифры, точка, _ или -');
  if (name.length < 2) fail(400, 'Введите имя');
  const weak = weakPassword(password, login);
  if (weak) fail(400, weak);
  if (role === 'teacher') {
    if (inviteIpFails.blocked(ip) || inviteAllFails.blocked('all') || inviteDayFails.blocked('all')) { audit('invite-blocked', req); fail(429, 'Слишком много неверных кодов. Попробуйте позже или уточните код у администратора.'); }
    if (!safeEqual(str(body.invite).toUpperCase(), String(db.getSetting('invite_code')).toUpperCase())) {
      inviteIpFails.add(ip); inviteAllFails.add('all'); inviteDayFails.add('all'); audit('invite-fail', req);
      fail(403, 'Неверный код учителя. Его выдаёт администратор.');
    }
  }
  const cls = role === 'student' ? str(body.class_name, 4).toUpperCase() : '';
  if (role === 'student' && !isClass(cls)) fail(400, 'Выберите класс');
  const email = cleanEmail(body.email);
  if (email === false) fail(400, 'Почта указана неверно. Проверьте адрес или оставьте поле пустым.');
  if (db.one('SELECT 1 FROM users WHERE login=?', login)) fail(409, 'Такой логин уже занят');
  const id = Number(db.run('INSERT INTO users(role,login,name,pass,class_name,email,created) VALUES(?,?,?,?,?,?,?)',
    role, login, name, await hashPassword(password), cls, email, Date.now()).lastInsertRowid);
  res.setHeader('Set-Cookie', [sessionCookie(newSession(id), isSecure(req)), shield.deviceCookie(id, isSecure(req))]);
  return { user: publicUser(db.one('SELECT * FROM users WHERE id=?', id)) };
});

on('POST', '/api/login', async ({ body, req, res }) => {
  await needHuman(body, req);
  const u = db.one('SELECT * FROM users WHERE login=?', str(body.login, 32));
  const gate = shield.gate(req, body.login, u?.id);
  if (gate.blocked) fail(429, gate.blocked);
  if (!(await checkPw(String(body.password ?? ''), u?.pass)) || !u) { gate.failed(); fail(401, 'Неверный логин или пароль'); }
  if (!u.active) fail(403, 'Аккаунт отключён администратором');
  gate.ok();
  res.setHeader('Set-Cookie', [sessionCookie(newSession(u.id), isSecure(req)), shield.deviceCookie(u.id, isSecure(req))]);
  return { user: publicUser(u) };
});

// ---------- забыли пароль ----------
on('POST', '/api/forgot', async ({ body, req }) => {
  await needHuman(body, req);
  if (!mailReady()) fail(503, 'Восстановление по почте пока не настроено. Попросите администратора или учителя сбросить пароль.');
  if (!forgotIpLimit.hit(clientIp(req))) fail(429, 'Слишком много запросов. Попробуйте через час.');
  const who = str(body.login, 120).toLowerCase();
  if (who.length < 3) fail(400, 'Введите логин или почту');
  // На одну почту бывает несколько аккаунтов (братья и сёстры) — ссылки для всех в одном письме.
  const list = db.all("SELECT id, login, email FROM users WHERE active=1 AND email<>'' AND (login=? OR email=?) LIMIT 5", who, who)
    .filter((u) => forgotUserLimit.hit(u.id));
  // Ответ одинаковый, есть такой аккаунт или нет: так нельзя узнать чужие логины и адреса.
  const to = list[0]?.email;
  if (to && list.every((u) => u.email === to) && forgotMailLimit.hit(to) && forgotAllLimit.hit('all')) {
    const letter = resetLetter(list.map((u) => ({ login: u.login, link: `${mailConf().site}/#/reset/${newReset(u.id)}` })));
    sendMail(to, letter.subject, letter.text, letter.html).catch((e) => console.error('mail', e.message));
    audit('forgot', req, `users=${list.map((u) => u.id).join(',')}`);
  }
  return { ok: true };
});

on('POST', '/api/reset', async ({ body, req, res }) => {
  const ip = clientIp(req);
  if (resetFails.blocked(ip)) fail(429, 'Слишком много попыток. Попробуйте через час.');
  const token = str(body.token, 100);
  const password = String(body.password || '');
  const id = peekReset(token);
  if (!id) { resetFails.add(ip); fail(400, 'Ссылка устарела или уже использована. Запросите новое письмо.'); }
  const u = db.one('SELECT * FROM users WHERE id=? AND active=1', id) || fail(400, 'Аккаунт отключён');
  const weak = weakPassword(password, u.login);
  if (weak) fail(400, weak);
  if (takeReset(token) !== id) fail(400, 'Ссылка уже использована');
  db.run('UPDATE users SET pass=? WHERE id=?', await hashPassword(password), id);
  res.setHeader('Set-Cookie', [sessionCookie(newSession(id), isSecure(req)), shield.deviceCookie(id, isSecure(req))]); // заодно выходим со всех других устройств
  audit('reset', req, `user=${id}`);
  return { user: publicUser(u) };
});

on('POST', '/api/logout', ({ req, res }) => {
  dropSession(readCookie(req, 'sid'));
  res.setHeader('Set-Cookie', sessionCookie('', isSecure(req)));
  return { ok: true };
});

on('PATCH', '/api/me', async ({ user, body, req }) => {
  user || fail(401, 'Войдите в аккаунт');
  if (body.name !== undefined) {
    let name = str(body.name, 60);
    if (name.length < 2) fail(400, 'Введите имя');
    if (user.role === 'student') { const c = checkName(name); c.ok || fail(400, NAME_ERROR); name = c.name; }
    db.run('UPDATE users SET name=? WHERE id=?', name, user.id);
  }
  if (body.class_name !== undefined && user.role === 'student') {
    const cls = str(body.class_name, 4).toUpperCase();
    isClass(cls) || fail(400, 'Выберите класс');
    db.run('UPDATE users SET class_name=? WHERE id=?', cls, user.id);
  }
  if (body.tour_done !== undefined) db.run('UPDATE users SET tour_done=? WHERE id=?', body.tour_done ? 1 : 0, user.id);
  if (body.email !== undefined) {
    const email = cleanEmail(body.email);
    if (email === false) fail(400, 'Почта указана неверно');
    // Почту меняем только с паролем: иначе тот, кто взял чужой телефон, вписал бы свою почту и потом сбросил пароль.
    const row = db.one('SELECT pass, email, login FROM users WHERE id=?', user.id);
    if (email !== row.email) {
      if (!pwChecks.hit(user.id)) fail(429, 'Слишком много попыток. Подождите 15 минут.');
      if (!(await checkPw(String(body.oldPassword || ''), row.pass))) fail(403, 'Чтобы изменить почту, введите текущий пароль');
      db.run('UPDATE users SET email=? WHERE id=?', email, user.id);
      dropResets(user.id);
      if (row.email && mailReady() && forgotMailLimit.hit(row.email)) {
        const letter = emailChangedLetter(row.login);
        sendMail(row.email, letter.subject, letter.text, letter.html).catch((e) => console.error('mail', e.message));
      }
      audit('email-change', req, `user=${user.id}`);
    }
  }
  if (body.password) {
    if (!pwChecks.hit(user.id)) fail(429, 'Слишком много попыток. Подождите 15 минут.');
    const row = db.one('SELECT pass FROM users WHERE id=?', user.id);
    if (!(await checkPw(String(body.oldPassword || ''), row.pass))) fail(403, 'Старый пароль неверный');
    const weak = weakPassword(body.password, user.login);
    if (weak) fail(400, weak);
    db.run('UPDATE users SET pass=? WHERE id=?', await hashPassword(String(body.password)), user.id);
    dropOtherSessions(user.id, readCookie(req, 'sid')); // со всех других устройств выходим
    dropResets(user.id);
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
  const q = normalizeQuiz(body, isSubject);
  const id = db.run(`INSERT INTO quizzes(owner_id,title,subject,grade,description,lang,questions,shared,created,updated)
                     VALUES(?,?,?,?,?,?,?,?,?,?)`, user.id, q.title, q.subject, q.grade, q.description, q.lang,
  JSON.stringify(q.questions), q.shared, Date.now(), Date.now()).lastInsertRowid;
  return { id: Number(id) };
});

on('PUT', '/api/quizzes/(\\d+)', ({ user, body, params }) => {
  needTeacher(user);
  const old = getQuiz(params[0], user, true);
  const q = normalizeQuiz(body, isSubject);
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

on('POST', '/api/upload', ({ user, req, url }) => (needTeacher(user), upload(req, url.searchParams.get('kind') === 'video' ? 'video' : 'image', user)));

// ---------- ИИ ----------
const aiConf = () => db.getSetting('ai', {});
// Без ключа администратора работает бесплатный ИИ (free), с ключом — выбранный в настройках.
on('GET', '/api/ai/status', ({ user }) => (needTeacher(user), { enabled: true, free: !aiConf().key, provider: aiConf().key ? aiConf().provider || '' : 'free' }));
const subjectName = (k) => customSubjects().find((s) => s.key === k)?.ru || '';
on('POST', '/api/ai/prompt', ({ user, body }) => (needTeacher(user), {
  prompt: (body.pack ? buildPackPrompt : buildPrompt)({ ...body, subjectName: subjectName(body.subject) }),
}));
on('POST', '/api/ai/parse', ({ user, body }) => {
  needTeacher(user);
  try { return parseAiText(body.text); } catch (e) { fail(400, e.message); }
});
on('POST', '/api/ai/generate', async ({ user, body }) => {
  needTeacher(user);
  if (!aiLimit.hit(user.id)) fail(429, 'Слишком много запросов к ИИ. Подождите немного.');
  let text;
  const image = body.image ? String(body.image) : '';
  if (image && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(image)) fail(400, 'Фото должно быть JPG, PNG или WebP');
  const prompt = (body.pack ? buildPackPrompt : buildPrompt)({ ...body, hasImage: Boolean(image), subjectName: subjectName(body.subject) });
  try { text = await callAi(aiConf(), prompt, image || undefined); } catch (e) {
    fail(502, image ? `${e.message}. Если модель не понимает фото — выберите Gemini в настройках ИИ или уберите фото.` : e.message);
  }
  try { return parseAiText(text); } catch (e) { fail(502, `ИИ ответил в неверном формате: ${e.message}`); }
});

// ---------- игры ----------
on('POST', '/api/games', ({ user, body }) => {
  needTeacher(user);
  const quiz = getQuiz(body.quizId, user);
  const mode = ['tug', 'duel', 'solo'].includes(body.mode) ? body.mode : 'tug';
  if ([...byId.values()].filter((x) => x.hostId === user.id && x.phase !== 'final').length >= liveLimit) fail(429, 'Слишком много незавершённых игр. Завершите старые.');
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
  const svg = await QRCode.toString(str(url.searchParams.get('text'), 300) || ' ', { type: 'svg', margin: 1, color: { dark: '#0b3d1f', light: '#ffffff' } });
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
  return isClass(cls)
    ? db.all("SELECT name, class_name, xp FROM users WHERE role='student' AND active=1 AND class_name=? ORDER BY xp DESC LIMIT 50", cls)
    : db.all("SELECT name, class_name, xp FROM users WHERE role='student' AND active=1 ORDER BY xp DESC LIMIT 50");
});

// ---------- администратор ----------
const maskKey = (k) => (k ? `${k.slice(0, 4)}…${k.slice(-4)}` : '');
on('GET', '/api/admin/settings', ({ user }) => {
  needAdmin(user);
  const ai = aiConf();
  const m = mailConf();
  return { invite_code: db.getSetting('invite_code'), ai: { ...ai, key: maskKey(ai.key), hasKey: Boolean(ai.key) },
    mail: { host: m.host || '', port: m.port || 465, user: m.user || '', hasPass: Boolean(m.pass), ready: mailReady() } };
});

on('PUT', '/api/admin/settings', ({ user, body, req }) => {
  needAdmin(user);
  if (body.mail) {
    const old = mailConf();
    const host = str(body.mail.host, 120).toLowerCase();
    const port = Number(body.mail.port) || 465;
    const mailUser = cleanEmail(body.mail.user);
    // Только публичный почтовый сервер: не localhost и не внутренняя сеть (иначе через «проверку почты» можно прощупывать сервер изнутри).
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) || !publicHttpsUrl(`https://${host}`)) fail(400, 'Укажите почтовый сервер, например smtp.gmail.com');
    if (![465, 587].includes(port)) fail(400, 'Порт — 465 или 587');
    if (!mailUser) fail(400, 'Укажите адрес почтового ящика');
    // Адрес сайта для ссылок в письмах берём из браузера администратора, а не из заголовка Host (его можно подделать).
    let site = old.site || '';
    try { const o = new URL(req.headers.origin); if (o.protocol === 'https:' || o.hostname === 'localhost') site = o.origin; } catch { /* оставляем прежний */ }
    if (!site) fail(400, 'Откройте настройки с адреса сайта по https');
    const pass = body.mail.pass ? str(body.mail.pass, 200).replace(/\s+/g, '') : old.pass;
    db.setSetting('mail', { host, port, user: mailUser, pass, site });
  }
  if (body.invite_code !== undefined) {
    const code = str(body.invite_code, 32);
    if (code.length < 8) fail(400, 'Код учителя — минимум 8 символов: короткий код боты подбирают');
    db.setSetting('invite_code', code);
  }
  if (body.ai) {
    const old = aiConf();
    const base = str(body.ai.base, 300);
    if (base && !publicHttpsUrl(base)) fail(400, 'Адрес API должен начинаться с https:// и вести на публичный сайт');
    db.setSetting('ai', {
      provider: str(body.ai.provider, 30), base, model: str(body.ai.model, 120),
      key: body.ai.key === undefined ? old.key : str(body.ai.key, 300),
    });
  }
  return { ok: true };
});

on('POST', '/api/admin/mail-test', async ({ user }) => {
  needAdmin(user);
  if (!mailReady()) fail(400, 'Сначала сохраните настройки почты');
  const to = db.one('SELECT email FROM users WHERE id=?', user.id).email || mailConf().user;
  try {
    await sendMail(to, 'TugQuiz: проверка почты', 'Почта настроена: ученики и учителя смогут восстанавливать пароль.', '<p>Почта настроена: ученики и учителя смогут восстанавливать пароль.</p>');
  } catch (e) { fail(502, `Письмо не ушло: ${String(e.message).slice(0, 160)}`); }
  return { to };
});

on('GET', '/api/admin/users', ({ user }) => {
  needAdmin(user);
  return db.all(`SELECT id, role, login, name, class_name, xp, active, created, email,
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
    if (!body.active) { db.run('DELETE FROM sessions WHERE user_id=?', id); dropResets(id); }
  }
  if (['teacher', 'admin', 'student'].includes(body.role)) db.run('UPDATE users SET role=? WHERE id=?', body.role, id);
  if (body.password) {
    const weak = weakPassword(body.password);
    if (weak) fail(400, weak);
    db.run('UPDATE users SET pass=? WHERE id=?', await hashPassword(String(body.password)), id);
    db.run('DELETE FROM sessions WHERE user_id=?', id);
    dropResets(id);
  }
  return { ok: true };
});

// ---------- статика ----------
function serveFile(req, res, file, immutable, extra = {}) {
  let st;
  try { st = statSync(file); } catch { st = null; }
  if (!st?.isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Не найдено');
  }
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  const headers = { 'Content-Type': type, 'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache', ...extra };
  const stream = (opts) => {
    const rs = createReadStream(file, opts);
    rs.on('error', () => res.destroy());
    res.on('close', () => rs.destroy());
    rs.pipe(res);
  };
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && type.startsWith('video/')) {
    let start; let end;
    if (range[1] === '' && range[2] !== '') { start = Math.max(0, st.size - Number(range[2])); end = st.size - 1; } // «последние N байт»
    else { start = Number(range[1] || 0); end = range[2] === '' ? st.size - 1 : Math.min(Number(range[2]), st.size - 1); }
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end || start >= st.size) {
      res.writeHead(416, { 'Content-Range': `bytes */${st.size}` });
      return res.end();
    }
    res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${st.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 });
    if (req.method === 'HEAD') return res.end();
    return stream({ start, end });
  }
  res.writeHead(200, { ...headers, 'Content-Length': st.size });
  if (req.method === 'HEAD') return res.end();
  stream();
}

function serveStatic(req, res, pathname) {
  if (pathname.startsWith('/uploads/')) {
    const name = path.basename(pathname);
    if (!/^[\w.-]{1,80}$/.test(name) || name.startsWith('tmp-')) { res.writeHead(404); return res.end(); }
    return serveFile(req, res, path.join(db.UPLOADS, name), true, { 'Content-Security-Policy': UPLOAD_CSP });
  }
  let decoded;
  try { decoded = decodeURIComponent(pathname === '/' ? '/index.html' : pathname); } catch { res.writeHead(400); return res.end(); }
  if (decoded.includes('\0') || decoded.includes('\\')) { res.writeHead(400); return res.end(); }
  const rel = path.normalize(decoded).replace(/^([/\\])+/, '');
  if (rel.split(/[/\\]/).some((part) => part.startsWith('.'))) { res.writeHead(404); return res.end(); } // .git, .env и прочие скрытые файлы
  const file = path.join(WEB, rel);
  if (!file.startsWith(WEB + path.sep)) { res.writeHead(403); return res.end(); }
  const f = loadWeb(file);
  if (!f) return serveFile(req, res, file, false); // видео и прочее крупное — потоком, с поддержкой Range
  // Файлы сайта: из памяти, сжатые brotli/gzip, с ETag — повторный заход телефона получает «304, не изменилось».
  const headers = { 'Content-Type': f.type, ETag: f.etag, 'Cache-Control': rel.startsWith('vendor') ? 'public, max-age=31536000, immutable' : 'no-cache', Vary: 'Accept-Encoding' };
  if (req.headers['if-none-match'] === f.etag) { res.writeHead(304, headers); return res.end(); }
  const ae = String(req.headers['accept-encoding'] || '');
  let body = f.raw;
  if (f.br && /\bbr\b/.test(ae)) { body = f.br; headers['Content-Encoding'] = 'br'; } else if (f.gz && /\bgzip\b/.test(ae)) { body = f.gz; headers['Content-Encoding'] = 'gzip'; }
  headers['Content-Length'] = body.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : body);
}

// Кэш файлов сайта в памяти (весь сайт ~2 МБ). Файл изменился на диске — кэш обновится сам (по времени и размеру).
const webCache = new Map();
function loadWeb(file) {
  let st;
  try { st = statSync(file); } catch { return null; }
  if (!st.isFile() || st.size > 2e6) return null;
  const key = `${st.mtimeMs}-${st.size}`;
  const hit = webCache.get(file);
  if (hit?.key === key) return hit;
  const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
  if (/^(video|audio)\//.test(type)) return null;
  const raw = readFileSync(file);
  const text = /^(text|application\/(json|manifest)|image\/svg)/.test(type) && raw.length > 600;
  const entry = {
    key, type, raw, etag: `"${st.size.toString(36)}-${Math.round(st.mtimeMs).toString(36)}"`,
    br: text ? brotliCompressSync(raw, { params: { [zc.BROTLI_PARAM_QUALITY]: 10 } }) : null,
    gz: text ? gzipSync(raw, { level: 9 }) : null,
  };
  webCache.set(file, entry);
  return entry;
}

/** Ответ API. Крупные ответы (списки, отчёты) сжимаем: по мобильной сети это в разы быстрее. */
function sendJson(req, res, result) {
  let out = Buffer.from(JSON.stringify(result ?? null));
  const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Accept-Encoding' };
  if (out.length > 1400 && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) { out = gzipSync(out, { level: 6 }); headers['Content-Encoding'] = 'gzip'; }
  res.writeHead(200, { ...headers, 'Content-Length': out.length });
  res.end(out);
}

async function handle(req, res) {
  applySecurityHeaders(req, res, { secure: isSecure(req), csp: CSP });
  let url;
  try { url = new URL(req.url, 'http://local'); } catch { res.writeHead(400); return res.end(); }
  if (!url.pathname.startsWith('/api/')) {
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { Allow: 'GET, HEAD' }); return res.end(); }
    return serveStatic(req, res, url.pathname);
  }
  try {
    if (!apiLimit.hit(clientIp(req))) { audit('api-flood', req); fail(429, 'Слишком много запросов. Подождите минуту.'); }
    const route = routes.find(([m, re]) => m === req.method && re.test(url.pathname)) || fail(404, 'Нет такого метода API');
    const isUpload = url.pathname === '/api/upload';
    if (req.method !== 'GET') {
      // Защита от CSRF: изменяющие запросы принимаем только из нашего же сайта.
      if (!sameOrigin(req)) { audit('csrf', req, `origin=${String(req.headers.origin).slice(0, 80)}`); fail(403, 'Чужой источник запроса'); }
      if (!isUpload && Number(req.headers['content-length']) > 0 && !/^application\/json\b/i.test(req.headers['content-type'] || '')) fail(415, 'Нужен JSON');
    }
    const body = req.method === 'GET' || isUpload ? {} : await readJson(req, url.pathname === '/api/ai/generate' ? 8e6 : 1e6);
    const result = await route[2]({ req, res, url, body, user: userFromReq(req), params: url.pathname.match(route[1]).slice(1) });
    if (!res.headersSent) sendJson(req, res, result);
  } catch (e) {
    if (!(e instanceof HttpError)) console.error(e);
    if (res.headersSent) return res.end();
    res.writeHead(e.status || 500, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: e instanceof HttpError ? e.message : 'Ошибка сервера' }));
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => { console.error(e); try { if (!res.headersSent) res.writeHead(500); res.end(); } catch { /* сокет уже закрыт */ } });
});
server.headersTimeout = 30e3;
server.requestTimeout = 10 * 60e3; // 50 МБ видео с телефона по слабой сети
server.maxHeadersCount = 60;
server.keepAliveTimeout = 5e3;
server.on('clientError', (e, socket) => { if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); });

attachSockets(server, userFromReq);
const lanAddresses = () => Object.values(os.networkInterfaces()).flat()
  .filter((i) => i && i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.')).map((i) => i.address);

// Порт занят (например, старый запуск ещё работает) — пробуем следующие, а не падаем.
let port = PORT;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && !process.env.PORT && port < PORT + 10) {
    console.log(`Порт ${port} занят, пробую ${port + 1}…`);
    return server.listen(++port, process.env.HOST || '0.0.0.0');
  }
  console.error(e.code === 'EADDRINUSE'
    ? `Порт ${port} уже занят другой программой. Закройте её или задайте другой порт: PORT=3000 npm start`
    : e);
  process.exit(1);
});
server.on('listening', () => {
  console.log('TugQuiz · SL165 запущен');
  console.log(`  На этом компьютере:  http://localhost:${port}`);
  for (const ip of lanAddresses()) console.log(`  С телефонов (Wi-Fi): http://${ip}:${port}`);
  console.log(`Код для регистрации учителей: ${db.getSetting('invite_code')}`);
  if (process.env.TQ_OPEN) exec(`start "" http://localhost:${port}`); // start.bat на Windows
});
server.listen(port, process.env.HOST || '0.0.0.0');
