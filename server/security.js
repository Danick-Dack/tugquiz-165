// Защита сервера: настоящий IP клиента, ограничители частоты, заголовки безопасности, проверка паролей и источника запросов.
import { timingSafeEqual, createHash, createHmac, randomBytes } from 'node:crypto';

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

/** Подсеть адреса: соседние адреса одного VPN-провайдера считаются вместе (/24 для IPv4, /48 для IPv6). */
export function subnet(ip) {
  const s = String(ip).replace(/^::ffff:/, '');
  return /^\d+\.\d+\.\d+\.\d+$/.test(s) ? `${s.split('.').slice(0, 3).join('.')}.0/24` : `${s.split(':').slice(0, 3).join(':')}::/48`;
}

/**
 * Защита входа от подбора паролей — в том числе ботами, которые меняют адрес через VPN или ботнет.
 * Бан по IP таких не остановит, поэтому неверные пароли считаются ещё и по самому аккаунту (с любых адресов):
 * 10 за 15 минут и 30 за сутки с незнакомых устройств, а когда по сайту идёт волна ошибок — 3 в час.
 * Чтобы боты не могли так «запереть» чужой аккаунт, после удачного входа браузер получает подписанную
 * метку «знакомое устройство» (cookie kd): с него владелец входит, даже когда вход с новых устройств закрыт.
 * Проверок пароля (scrypt — дорогая операция) одновременно не больше 16: флуд не положит процессор.
 */
export function loginShield(secret) {
  const ipFails = limiter(40, 10 * 60e3); // один адрес (школа за одним Wi-Fi укладывается)
  const netFails = limiter(150, 10 * 60e3); // подсеть
  const userFails = limiter(10, 15 * 60e3); // один аккаунт с незнакомых устройств, с любых адресов
  const userDay = limiter(30, 864e5); // и за сутки: подбор с тысяч VPN-адресов упирается сюда
  const userAttack = limiter(3, 3600e3); // пока сайт атакуют — ещё строже
  const siteFails = limiter(300, 10 * 60e3); // неверных паролей по всему сайту; больше — идёт атака
  const trustedFails = limiter(30, 15 * 60e3); // со знакомого устройства тоже не бесконечно
  const sign = (v) => createHmac('sha256', secret).update(v).digest('base64url').slice(0, 32);
  const trustedFor = (req, userId) => {
    const m = (req.headers.cookie || '').match(/(?:^|;\s*)kd=(\d+)\.([\w-]{16,32})\.([\w-]{32})(?:;|$)/);
    return Boolean(userId && m && Number(m[1]) === userId && safeEqual(m[3], sign(`${m[1]}.${m[2]}`)));
  };
  let busy = 0;
  return {
    /** Можно ли сейчас проверять пароль для этого логина. userId — id аккаунта, если такой логин есть. */
    gate(req, login, userId) {
      const ip = clientIp(req);
      const net = subnet(ip);
      const key = String(login ?? '').trim().toLowerCase().slice(0, 32);
      const trusted = trustedFor(req, userId);
      let blocked = null;
      if (ipFails.blocked(ip) || netFails.blocked(net)) blocked = 'Слишком много неверных попыток из вашей сети. Подождите 15 минут.';
      else if (trusted ? trustedFails.blocked(key) : userFails.blocked(key) || userDay.blocked(key) || (siteFails.blocked('all') && userAttack.blocked(key))) {
        blocked = trusted ? 'Слишком много попыток. Подождите 15 минут.'
          : 'Для этого аккаунта было слишком много неверных паролей, вход с нового устройства временно закрыт. Войдите с телефона или компьютера, где уже входили, или восстановите пароль.';
      }
      if (blocked) audit('login-blocked', req, `login=${key}${trusted ? ' trusted' : ''}${siteFails.blocked('all') ? ' site-under-attack' : ''}`);
      return {
        blocked,
        failed() {
          ipFails.add(ip); netFails.add(net); siteFails.add('all');
          if (trusted) trustedFails.add(key); else { userFails.add(key); userDay.add(key); userAttack.add(key); }
          audit('login-fail', req, `login=${key}${trusted ? ' trusted' : ''}`);
        },
        // Суточный счётчик не сбрасываем: иначе удачный вход владельца дарил бы боту новые 30 попыток.
        ok() { userFails.reset(key); trustedFails.reset(key); },
      };
    },
    /** Cookie «знакомое устройство» для аккаунта (ставится после удачного входа или регистрации). */
    deviceCookie(userId, secure) {
      const v = `${userId}.${randomBytes(18).toString('base64url')}`;
      return `kd=${v}.${sign(v)}; Path=/api/; HttpOnly; SameSite=Strict; Max-Age=${400 * 86400}${secure ? '; Secure' : ''}`;
    },
    /** Все места для проверки пароля заняты — отвечаем «занято», а не копим очередь. */
    full: () => busy >= 16,
    async slot(fn) { busy++; try { return await fn(); } finally { busy--; } },
  };
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

/**
 * Капча Cloudflare Turnstile (бесплатная). Ключи берутся из окружения (TURNSTILE_SITE / TURNSTILE_SECRET);
 * без них проверка выключена. Если сам Cloudflare недоступен, пропускаем: остальные защиты входа продолжают работать.
 */
export function turnstile(site = '', secret = '') {
  const on = Boolean(site && secret);
  return {
    site: on ? site : '',
    async ok(token, ip) {
      if (!on) return true;
      if (typeof token !== 'string' || !token || token.length > 2048) return false;
      try {
        const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
          method: 'POST', body: new URLSearchParams({ secret, response: token, remoteip: String(ip || '') }), signal: AbortSignal.timeout(5000),
        });
        return (await r.json()).success === true;
      } catch { return true; }
    },
  };
}
