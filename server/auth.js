// Пароли (scrypt) и сессии (случайный токен в HttpOnly-cookie; в базе лежит только его SHA-256).
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { all, one, run, now } from './db.js';

const scryptAsync = promisify(scrypt);
// Вход живёт, пока устройством пользуются: срок отсчитывается от последнего захода и продлевается сам.
// 400 дней — максимум, который браузеры разрешают для cookie.
const SESSION_DAYS = 400;
export const RESET_MS = 30 * 60e3; // ссылка из письма действует 30 минут
const RENEW_MS = 864e5; // продлеваем cookie и отметку «был на сайте» не чаще раза в сутки
const sha = (token) => createHash('sha256').update(String(token)).digest('hex');

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pw, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

// Заглушка: при неизвестном логине считаем хеш так же долго, чтобы по времени ответа нельзя было узнать, есть ли такой логин.
const DUMMY = await hashPassword(randomBytes(8).toString('hex'));

export async function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored || DUMMY).split('$');
  if (!salt || !hash) return false;
  const got = await scryptAsync(String(pw).slice(0, 256), Buffer.from(salt, 'hex'), 32);
  const want = Buffer.from(hash, 'hex');
  return got.length === want.length && timingSafeEqual(got, want) && Boolean(stored);
}

export function newSession(userId) {
  const token = randomBytes(32).toString('base64url');
  // Один аккаунт — одно устройство: новый вход завершает все прошлые.
  run('DELETE FROM sessions WHERE user_id=?', userId);
  run('INSERT INTO sessions(token,user_id,created,seen) VALUES(?,?,?,?)', sha(token), userId, now(), now());
  return token;
}

export const dropSession = (token) => token && run('DELETE FROM sessions WHERE token=?', sha(token));
/** Выйти со всех устройств, кроме текущего (после смены пароля). */
export const dropOtherSessions = (userId, keepToken) => run('DELETE FROM sessions WHERE user_id=? AND token<>?', userId, sha(keepToken || ''));

export function userByToken(token) {
  if (!token || String(token).length > 100) return null;
  const u = one(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
                 WHERE s.token=? AND s.seen>? AND u.active=1`, sha(token), now() - SESSION_DAYS * 864e5);
  return u ? publicUser(u) : null;
}

/** Отметить заход. true — пора заново выдать cookie, чтобы браузер не забыл вход. */
export function touchSession(token) {
  const r = token && one('SELECT seen FROM sessions WHERE token=?', sha(token));
  if (!r || now() - r.seen < RENEW_MS) return false;
  run('UPDATE sessions SET seen=? WHERE token=?', now(), sha(token));
  return true;
}

// Старые сессии (токен в открытом виде) переводим в хеши, чтобы никто не вышел из аккаунта, и чистим просроченные.
for (const r of all("SELECT token FROM sessions WHERE length(token)<>64")) run('UPDATE sessions SET token=? WHERE token=?', sha(r.token), r.token);
const sweep = () => {
  run('DELETE FROM sessions WHERE seen<?', now() - SESSION_DAYS * 864e5);
  run('DELETE FROM resets WHERE created<?', now() - RESET_MS);
};
sweep();
setInterval(sweep, 6 * 3600e3).unref();

export const publicUser = (u) => ({
  id: u.id, role: u.role, login: u.login, name: u.name, class_name: u.class_name, xp: u.xp, tour_done: u.tour_done, email: u.email || '',
});

// ---------- восстановление пароля по почте ----------
export function newReset(userId) {
  const token = randomBytes(32).toString('base64url');
  run('DELETE FROM resets WHERE user_id=?', userId);
  run('INSERT INTO resets(token,user_id,created) VALUES(?,?,?)', sha(token), userId, now());
  return token;
}

/** Отменить все ссылки сброса пользователя (смена пароля или почты, отключение аккаунта). */
export const dropResets = (userId) => run('DELETE FROM resets WHERE user_id=?', userId);

/** Проверить код сброса, не тратя его. */
export function peekReset(token) {
  if (!token || String(token).length > 100) return null;
  const r = one('SELECT user_id, created FROM resets WHERE token=?', sha(token));
  return r && now() - r.created < RESET_MS ? r.user_id : null;
}

/** Забрать код сброса (одноразово). Возвращает id пользователя или null. */
export function takeReset(token) {
  if (!token || String(token).length > 100) return null;
  const r = one('SELECT user_id, created FROM resets WHERE token=?', sha(token));
  if (!r) return null;
  run('DELETE FROM resets WHERE user_id=?', r.user_id);
  return now() - r.created < RESET_MS ? r.user_id : null;
}

/** Почта: пусто или похоже на адрес. Возвращает нормализованный адрес или false. */
export function cleanEmail(v) {
  const e = String(v ?? '').trim().toLowerCase();
  if (!e) return '';
  return e.length <= 120 && /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/.test(e) ? e : false;
}

export const sessionCookie = (token, secure) =>
  `sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_DAYS * 86400 : 0}${secure ? '; Secure' : ''}`;

export const readCookie = (req, name) => {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
};
