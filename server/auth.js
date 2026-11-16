// Пароли (scrypt) и сессии (случайный токен в HttpOnly-cookie).
import { scrypt, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { one, run, now } from './db.js';

const scryptAsync = promisify(scrypt);
const SESSION_DAYS = 60;

export async function hashPassword(pw) {
  const salt = randomBytes(16);
  const hash = await scryptAsync(pw, salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function checkPassword(pw, stored) {
  const [, salt, hash] = String(stored).split('$');
  if (!salt || !hash) return false;
  const got = await scryptAsync(pw, Buffer.from(salt, 'hex'), 32);
  return timingSafeEqual(got, Buffer.from(hash, 'hex'));
}

export function newSession(userId) {
  const token = randomBytes(32).toString('base64url');
  run('INSERT INTO sessions(token,user_id,created) VALUES(?,?,?)', token, userId, now());
  return token;
}

export const dropSession = (token) => run('DELETE FROM sessions WHERE token=?', token);

export function userByToken(token) {
  if (!token) return null;
  const u = one(`SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id
                 WHERE s.token=? AND s.created>? AND u.active=1`, token, now() - SESSION_DAYS * 864e5);
  return u ? publicUser(u) : null;
}

export const publicUser = (u) => ({
  id: u.id, role: u.role, login: u.login, name: u.name, class_name: u.class_name, xp: u.xp, tour_done: u.tour_done,
});

export const sessionCookie = (token, secure) =>
  `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${token ? SESSION_DAYS * 86400 : 0}${secure ? '; Secure' : ''}`;

export const readCookie = (req, name) => {
  const m = (req.headers.cookie || '').match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return m ? m[1] : null;
};
