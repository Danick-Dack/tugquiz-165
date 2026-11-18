// Пароли (scrypt) и сессии (случайный токен в HttpOnly-cookie; в базе лежит только его SHA-256).
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { all, one, run, now } from './db.js';

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 60;
const MAX_SESSIONS = 8; // у одного пользователя; самые старые вытесняются
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
  run('INSERT INTO sessions(token,user_id,created) VALUES(?,?,?)', sha(token), userId, now());
  run(`DELETE FROM sessions WHERE user_id=? AND token NOT IN
       (SELECT token FROM sessions WHERE user_id=? ORDER BY created DESC LIMIT ${MAX_SESSIONS})`, userId, userId);
  return token;
}

export const dropSession = (token) => token && run('DELETE FROM sessions WHERE token=?', sha(token));
/** Выйти со всех устройств, кроме текущего (после смены пароля). */
export const dropOtherSessions = (userId, keepToken) => run('DELETE FROM sessions WHERE user_id=? AND token<>?', userId, sha(keepToken || ''));

export function userByToken(token) {
  if (!token || String(token).length > 100) return null;
  const u = one(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
                 WHERE s.token=? AND s.created>? AND u.active=1`, sha(token), now() - SESSION_DAYS * 864e5);
  return u ? publicUser(u) : null;
}

// Старые сессии (токен в открытом виде) переводим в хеши, чтобы никто не вышел из аккаунта, и чистим просроченные.
for (const r of all("SELECT token FROM sessions WHERE length(token)<>64")) run('UPDATE sessions SET token=? WHERE token=?', sha(r.token), r.token);
const sweep = () => run('DELETE FROM sessions WHERE created<?', now() - SESSION_DAYS * 864e5);
sweep();
setInterval(sweep, 6 * 3600e3).unref();

export const publicUser = (u) => ({
  id: u.id, role: u.role, login: u.login, name: u.name, class_name: u.class_name, xp: u.xp, tour_done: u.tour_done,
});

export const sessionCookie = (token, secure) =>
  `sid=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${token ? SESSION_DAYS * 86400 : 0}${secure ? '; Secure' : ''}`;

export const readCookie = (req, name) => {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
};
