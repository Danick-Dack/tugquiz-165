// Защита сервера: настоящий IP клиента, ограничители частоты, заголовки безопасности, проверка паролей и источника запросов.
import { timingSafeEqual, createHash } from 'node:crypto';

const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

/** IP клиента. Заголовкам прокси верим только если запрос пришёл с этого же сервера (nginx), иначе их подделывает кто угодно. */
export function clientIp(req) {
  const peer = req.socket.remoteAddress || '';
  if (LOOPBACK.has(peer)) {
    const real = String(req.headers['x-real-ip'] || '').trim();
    if (real && real.length < 64) return real;
  }
  return peer;
}

/** Скользящее окно: не больше `max` событий за `windowMs` на один ключ. Память чистится сама. */
export function limiter(max, windowMs) {
  const hits = new Map();
  setInterval(() => {
    const edge = Date.now() - windowMs;
    for (const [k, list] of hits) if (!list.length || list.at(-1) < edge) hits.delete(k);
  }, Math.max(30e3, windowMs / 2)).unref();
  const fresh = (key) => {
    const edge = Date.now() - windowMs;
    const list = (hits.get(key) || []).filter((t) => t > edge);
    hits.set(key, list);
    return list;
  };
  return {
    /** Занести событие; false — лимит исчерпан. */
    hit(key) { const l = fresh(key); if (l.length >= max) return false; l.push(Date.now()); return true; },
    /** Лимит уже исчерпан? (без занесения события) */
    blocked(key) { return fresh(key).length >= max; },
    /** Занести событие без проверки (для неудачных попыток). */
    add(key) { fresh(key).push(Date.now()); },
    reset(key) { hits.delete(key); },
  };
}

/** Сравнение строк за постоянное время (коды приглашений и т. п.). */
export function safeEqual(a, b) {
  const x = createHash('sha256').update(String(a)).digest();
  const y = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(x, y);
}

const COMMON = new Set(['12345678', '123456789', '1234567890', '11111111', '00000000', '87654321', 'qwertyui', 'qwerty123', 'password',
  'password1', 'password123', 'iloveyou', 'abcd1234', 'abc12345', '1q2w3e4r', '1qaz2wsx', 'qazwsxedc', 'zaq12wsx', 'asdfghjk', 'qwertyuiop',
  'йцукенгш', 'admin123', 'administrator', 'letmein1', 'welcome1', 'sl165sl165', 'liceum165', 'school165', 'lyceum165', 'kazakhstan',
  'almaty123', '77777777', '12341234', '12121212', '123123123', '987654321', 'qwerty12', 'qwerty1234']);

/** Возвращает текст ошибки, если пароль слабый, иначе null. */
export function weakPassword(pw, login = '') {
  const p = String(pw ?? '');
  if (p.length < 8) return 'Пароль — минимум 8 символов';
  if (p.length > 128) return 'Пароль слишком длинный (до 128 символов)';
  const low = p.toLowerCase();
  if (COMMON.has(low) || /^(.)\1+$/.test(p) || (login && low.includes(String(login).toLowerCase()) && login.length >= 3)) return 'Слишком простой пароль. Придумайте другой.';
  if (!/\D/.test(p) || new Set(p).size < 4) return 'Слишком простой пароль: добавьте буквы и разные символы.';
  return null;
}

/** Запрос на изменение данных должен идти с нашего же сайта (защита от CSRF). */
export function sameOrigin(req) {
  const site = req.headers['sec-fetch-site'];
  if (site && site !== 'same-origin' && site !== 'none') return false;
  const origin = req.headers.origin;
  if (!origin) return true; // не браузер или та же страница без заголовка
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}

const HOST_OK = /^[a-z0-9.\-:[\]]{1,100}$/i;

/** Заголовки безопасности для каждого ответа. */
export function applySecurityHeaders(req, res, { secure, csp }) {
  const host = HOST_OK.test(req.headers.host || '') ? req.headers.host : 'localhost';
  const policy = csp
    .replace('{WS}', `ws://${host} wss://${host}`)
    + (secure ? '; upgrade-insecure-requests' : '');
  res.setHeader('Content-Security-Policy', policy);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), bluetooth=(), interest-cohort=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('X-Permitted-Cross-Domain-Policies', 'none');
  if (secure) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
}

/** Запись о подозрительном событии в журнал (journalctl -u …). Без паролей и токенов. */
export const audit = (event, req, extra = '') => console.warn(`SECURITY ${event} ip=${clientIp(req)} ${extra}`.trim());

/** Адрес внешнего ИИ: только https и только публичный хост (защита от обращения во внутреннюю сеть сервера). */
export function publicHttpsUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return false; }
  if (u.protocol !== 'https:' || u.username || u.password) return false;
  const h = u.hostname.toLowerCase();
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || !h.includes('.') && !h.includes(':')) return false;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
    const [a, b] = h.split('.').map(Number);
    if (a === 10 || a === 127 || a === 0 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127)) return false;
  }
  if (h.includes(':') || h.startsWith('[')) return false; // IPv6-адреса не нужны для API ИИ
  return true;
}
