// Общие инструменты интерфейса: создание элементов, API, окна, звуки, иконки.
import { t, lang } from './i18n.js';

export const store = { me: null, meta: null };
export const DEV = 'Developed by Daniyar Dauletuly';

/** h('div', {class, onClick, style, html}, ...дети) — создать элемент. */
export function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'html') el.innerHTML = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k in el && k !== 'list' && typeof v !== 'string') el[k] = v;
    else if (k === 'value') el.value = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  append(el, kids);
  return el;
}
const append = (el, kids) => {
  for (const k of kids.flat(Infinity)) {
    if (k === null || k === undefined || k === false || k === '') continue;
    el.append(k instanceof Node ? k : String(k));
  }
};
/** Заменить содержимое элемента: как replaceChildren, но понимает массивы и пропускает null/false. */
export const fill = (el, ...kids) => { el.replaceChildren(); append(el, kids); return el; };
export const $ = (sel, root = document) => root.querySelector(sel);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function api(path, { method = 'GET', body, raw } = {}) {
  const res = await fetch(path, {
    method,
    headers: raw ? { 'Content-Type': raw.type || 'application/octet-stream' } : body ? { 'Content-Type': 'application/json' } : {},
    body: raw || (body ? JSON.stringify(body) : undefined),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.error ? t(data.error) : `${t('Ошибка')} ${res.status}`);
  return data;
}

export const go = (hash) => { location.hash = hash; };
export const isTeacher = () => ['teacher', 'admin'].includes(store.me?.role);

export function subj(key) {
  const s = store.meta?.subjects.find((x) => x.key === key) || { ru: '—', kk: '—', color: '#64748b' };
  return { name: s[lang()] || s.ru, color: s.color };
}
/** Класс ученика: номер 1–12 и буква. Возвращает элемент со свойством value (например «7А»). */
export function classPicker(value = '', onChange, style = {}) {
  const [, n0 = '', l0 = ''] = String(value).match(/^(\d{1,2})(.?)$/) || [];
  const num = h('select', { class: 'input', required: true, style, 'aria-label': t('Класс') },
    h('option', { value: '' }, '—'), store.meta.grades.map((g) => h('option', { value: g, selected: String(g) === n0 }, g)));
  const let_ = h('select', { class: 'input', style, 'aria-label': t('Буква') },
    h('option', { value: '' }, t('без буквы')), store.meta.letters.map((l) => h('option', { value: l, selected: l === l0 }, l)));
  const el = h('div', { class: 'class-pick' }, num, let_);
  Object.defineProperty(el, 'value', { get: () => (num.value ? num.value + let_.value : '') });
  const changed = () => { if (num.value) onChange?.(el.value); };
  num.addEventListener('change', changed);
  let_.addEventListener('change', changed);
  return el;
}
export const subjChip = (key) => { const s = subj(key); return h('span', { class: 'chip' }, h('i', { class: 'dot', style: { background: s.color } }), s.name); };

const KK_MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
export function fmtDate(ms, withTime = true) {
  if (!ms) return '—';
  const d = new Date(ms);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  // Браузеры плохо знают казахскую локаль, поэтому месяцы пишем сами.
  if (lang() === 'kk') return withTime ? `${d.getDate()} ${KK_MONTHS[d.getMonth()].slice(0, 3)}., ${time}` : `${d.getFullYear()} ж. ${d.getDate()} ${KK_MONTHS[d.getMonth()]}`;
  if (lang() === 'en') return d.toLocaleString('en-GB', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' });
  return d.toLocaleString('ru-RU', withTime ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long', year: 'numeric' });
}
export const fmtDur = (sec) => `${Math.floor(sec / 60)}:${String(Math.round(sec % 60)).padStart(2, '0')}`;
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

// ---------- уведомления и окна ----------
export function toast(msg, kind = 'ok') {
  const el = h('div', { class: `toast ${kind === 'err' ? 'err' : ''}` }, msg);
  $('#toasts').append(el);
  setTimeout(() => el.remove(), kind === 'err' ? 5000 : 2800);
}
export const toastErr = (e) => toast(e?.message || String(e), 'err');

export function modal({ title, body, actions = [], wide = false, onClose }) {
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); onClose?.(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const ov = h('div', { class: 'overlay', onMousedown: (e) => { if (e.target === ov) close(); } },
    h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
      h('header', null, h('h2', null, title), h('button', { class: 'btn ghost icon', onClick: close, 'aria-label': t('Закрыть'), html: icon('x') })),
      h('div', { class: 'body' }, body),
      actions.length ? h('footer', null, actions.map((a) => h('button', {
        class: `btn ${a.kind || ''}`, onClick: async (e) => {
          const btn = e.currentTarget;
          btn.disabled = true;
          try { if ((await a.onClick?.(close)) !== false && a.close !== false) close(); } catch (err) { toastErr(err); } finally { btn.disabled = false; }
        },
      }, a.label))) : null));
  document.addEventListener('keydown', onKey);
  document.body.append(ov);
  ov.querySelector('input,textarea,select')?.focus();
  return { close, el: ov };
}

export const ask = (text, { ok = t('Да'), danger = false } = {}) => new Promise((resolve) => {
  let answered = false;
  modal({
    title: t('Подтвердите'), body: h('p', null, text),
    onClose: () => { if (!answered) resolve(false); },
    actions: [
      { label: t('Отмена'), kind: 'ghost' },
      { label: ok, kind: danger ? 'danger' : 'primary', onClick: () => { answered = true; resolve(true); } },
    ],
  });
});

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); } catch {
    const ta = h('textarea', { value: text, style: { position: 'fixed', opacity: 0 } });
    document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  toast(t('Скопировано'));
}

// ---------- файлы: картинки сжимаем в браузере до WebP ----------
export async function compressImage(file) {
  if (file.type === 'image/gif' || !file.type.startsWith('image/')) return file;
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = h('canvas', { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.85));
  return blob && blob.size < file.size ? blob : file;
}
export async function uploadFile(file, kind = 'image') {
  const limit = kind === 'video' ? 50 : 5;
  const data = kind === 'image' ? await compressImage(file) : file;
  if (data.size > limit * 1024 * 1024) throw new Error(t('Файл больше {n} МБ', { n: limit }));
  return (await api(`/api/upload?kind=${kind}`, { method: 'POST', raw: data })).url;
}
export const pickFile = (accept) => new Promise((resolve) => {
  const inp = h('input', { type: 'file', accept, onChange: () => resolve(inp.files[0] || null) });
  inp.click();
});

// ---------- звуки (WebAudio, без файлов) ----------
// Голоса: нота с плавным стартом и спадом (без щелчков), медь с вибрато, шум с фильтром (канат, аплодисменты).
// Всё идёт через мягкий ограничитель, чтобы наложение нескольких звуков не хрипело.
const ctxs = new WeakMap();
function master(c, dest) {
  if (!ctxs.has(c)) {
    const lim = c.createWaveShaper();
    const curve = new Float32Array(2049);
    for (let i = 0; i < curve.length; i++) { const x = (i / 1024) - 1; curve[i] = Math.tanh(1.4 * x) / Math.tanh(1.4); }
    lim.curve = curve;
    lim.connect(dest);
    ctxs.set(c, { in: lim, noise: null });
  }
  return ctxs.get(c);
}

export function voices(c, dest, t0 = c.currentTime) {
  const m = master(c, dest);
  const R = Math.random;
  // hold — доля длительности, которую нота держится на полной громкости (для длинных нот меди); vib — вибрато в центах.
  const note = (freq, { d = 0.15, type = 'sine', v = 0.15, at = 0, a = 0.006, glide = 1, lp = 0, lpFrom = 0, det = 0, hold = 0, vib = 0 } = {}) => {
    const t = t0 + at;
    const o = c.createOscillator(); const g = c.createGain();
    o.type = type; o.detune.value = det; o.frequency.setValueAtTime(freq, t);
    if (glide !== 1) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + d);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a);
    if (hold) g.gain.setValueAtTime(v, t + d * hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    let node = o;
    if (lp) {
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 0.8;
      f.frequency.setValueAtTime(lpFrom || lp, t);
      if (lpFrom) f.frequency.linearRampToValueAtTime(lp, t + Math.min(d, 0.12));
      o.connect(f); node = f;
    }
    if (vib) {
      const l = c.createOscillator(); const lg = c.createGain();
      l.frequency.value = 5.5; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(vib, t + Math.min(0.35, d * 0.6));
      l.connect(lg).connect(o.detune); l.start(t); l.stop(t + d + 0.05);
    }
    node.connect(g).connect(m.in);
    o.start(t); o.stop(t + d + 0.05);
  };
  const noise = ({ d = 0.2, v = 0.2, at = 0, from = 800, to = 300, q = 1.2, a = 0.01 } = {}) => {
    const t = t0 + at;
    if (!m.noise) {
      m.noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
      const data = m.noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    }
    const s = c.createBufferSource(); s.buffer = m.noise; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = q;
    f.frequency.setValueAtTime(from, t); f.frequency.exponentialRampToValueAtTime(to, t + d);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    s.connect(f).connect(g).connect(m.in);
    s.start(t, R()); s.stop(t + d + 0.05);
  };
  // колокольчик: основной тон и негармоничные обертоны
  const bell = (f, at = 0, v = 0.14, d = 0.6) => {
    note(f, { at, d, v, type: 'sine', a: 0.004 });
    note(f * 2.76, { at, d: d * 0.45, v: v * 0.28, type: 'sine', a: 0.003 });
    note(f * 4.07, { at, d: d * 0.2, v: v * 0.1, type: 'sine', a: 0.002 });
  };
  // труба или тромбон: две слегка расстроенные пилы, фильтр «раскрывается» в начале ноты, дыхание шумом
  const brass = (f, { at = 0, d = 0.4, v = 0.12, bright = 2600, dark = 500, glide = 1, vib = 0, hold = 0.7 } = {}) => {
    const p = { at, d, v, type: 'sawtooth', a: 0.035, lp: bright, lpFrom: dark, glide, vib, hold };
    note(f, { ...p, det: -7 }); note(f, { ...p, det: 7, v: v * 0.9 });
    note(f / 2, { ...p, type: 'triangle', v: v * 0.5, lp: bright * 0.5, lpFrom: dark });
    noise({ at, d: 0.09, v: v * 0.25, from: 3000, to: 1500, q: 0.7 });
  };
  // аплодисменты: много коротких хлопков в «зале», громкость нарастает и спадает
  const applause = (at, dur, v) => {
    const n = Math.round(dur * 55);
    for (let i = 0; i < n; i++) {
      const x = R(); const env = Math.sin(Math.PI * Math.min(1, x * 1.15 + 0.02)) ** 0.8;
      noise({ at: at + x * dur, d: 0.025 + R() * 0.035, v: v * env * (0.35 + R() * 0.65), from: 1800 + R() * 3200, to: 1200 + R() * 800, q: 0.7 + R() * 0.8, a: 0.002 });
    }
  };
  return { note, noise, bell, brass, applause };
}

export const RECIPES = {
  tick: (v) => v.note(1900, { d: 0.035, v: 0.12, a: 0.002 }),
  count: (v) => { v.note(660, { d: 0.18, v: 0.3, type: 'triangle' }); v.note(1320, { d: 0.1, v: 0.08 }); },
  go: (v) => {
    v.note(523, { d: 0.16, v: 0.2, type: 'sawtooth', lp: 2200 });
    v.note(784, { at: 0.11, d: 0.16, v: 0.2, type: 'sawtooth', lp: 2400 });
    v.note(1047, { at: 0.22, d: 0.55, v: 0.24, type: 'sawtooth', lp: 2800 });
    v.bell(2093, 0.22, 0.08, 0.5);
  },
  pop: (v) => v.note(420, { d: 0.09, v: 0.3, glide: 2.1, a: 0.003 }),
  good: (v) => { v.bell(784, 0, 0.3, 0.45); v.bell(1175, 0.09, 0.3, 0.7); },
  bad: (v) => {
    v.note(196, { d: 0.32, v: 0.24, type: 'sawtooth', lp: 700, glide: 0.72 });
    v.note(139, { d: 0.32, v: 0.2, type: 'sawtooth', lp: 600, glide: 0.72 });
  },
  pull: (v) => {
    v.noise({ d: 0.28, v: 0.5, from: 900, to: 220, q: 0.9 });
    v.note(110, { d: 0.24, v: 0.55, glide: 0.5, a: 0.004 });
    v.note(310, { d: 0.18, v: 0.08, type: 'sawtooth', lp: 800, glide: 0.8, at: 0.02 });
  },
  // Победа: фанфара «та-та-та ТАААА» трубами, удар литавр, звон и овации зала.
  win: (v) => {
    [0, 0.17, 0.34].forEach((at) => v.brass(523, { at, d: 0.15, v: 0.16, hold: 0.5 }));
    [523, 659, 784, 1047].forEach((f, i) => v.brass(f, { at: 0.52, d: 1.5, v: 0.13 - i * 0.012, vib: 14, hold: 0.8 }));
    v.note(98, { at: 0.52, d: 0.9, v: 0.4, glide: 0.55, a: 0.004 });
    v.noise({ at: 0.52, d: 0.3, v: 0.4, from: 400, to: 100, q: 0.6 });
    [2093, 2637, 3136, 3951].forEach((f, i) => v.bell(f, 0.56 + i * 0.07, 0.09, 0.9));
    v.applause(0.75, 2.6, 0.4);
  },
  // Поражение: «грустный тромбон» (четыре нисходящие ноты, последняя съезжает вниз) и один тихий вздох зала.
  lose: (v) => {
    v.brass(233, { at: 0, d: 0.42, v: 0.2, bright: 900, dark: 260, hold: 0.6 });
    v.brass(220, { at: 0.46, d: 0.42, v: 0.2, bright: 880, dark: 260, hold: 0.6 });
    v.brass(208, { at: 0.92, d: 0.42, v: 0.2, bright: 860, dark: 260, hold: 0.6 });
    v.brass(196, { at: 1.38, d: 1.35, v: 0.22, bright: 820, dark: 240, glide: 0.8, vib: 22, hold: 0.55 });
    v.noise({ at: 1.5, d: 1.0, v: 0.05, from: 700, to: 250, q: 0.5, a: 0.3 });
  },
  // Ничья: два ровных мягких звука и тёплый хлопок, ни радости, ни печали.
  draw: (v) => {
    v.brass(440, { at: 0, d: 0.35, v: 0.13, bright: 1500, dark: 500, hold: 0.6 });
    v.brass(440, { at: 0.4, d: 0.7, v: 0.13, bright: 1500, dark: 500, hold: 0.6 });
    v.bell(880, 0.4, 0.1, 0.8);
    v.applause(0.5, 1.2, 0.2);
  },
  // Личный финал вне тройки лидеров: спокойные аплодисменты и два колокольчика.
  finish: (v) => { v.bell(659, 0, 0.2, 0.6); v.bell(880, 0.14, 0.2, 0.8); v.applause(0.1, 1.4, 0.3); },
};

let actx;
const audio = () => {
  actx ||= new (window.AudioContext || window.webkitAudioContext)();
  if (actx.state === 'suspended') actx.resume?.();
  return actx;
};
// Браузеры включают звук только после касания страницы: «будим» движок при первом касании.
try { window.addEventListener('pointerdown', () => { try { audio(); } catch { /* без звука */ } }, { once: true, capture: true }); } catch { /* не в браузере */ }

export const sound = {
  get on() { try { return localStorage.getItem('tq_sound') !== '0'; } catch { return true; } },
  set on(v) { try { localStorage.setItem('tq_sound', v ? '1' : '0'); } catch { /* приватный режим */ } },
  play(name) {
    if (!this.on) return;
    try { const c = audio(); RECIPES[name](voices(c, c.destination)); } catch { /* звук не обязателен */ }
  },
  tick() { this.play('tick'); }, count() { this.play('count'); }, go() { this.play('go'); }, pop() { this.play('pop'); },
  good() { this.play('good'); }, bad() { this.play('bad'); }, pull() { this.play('pull'); },
  win() { this.play('win'); }, lose() { this.play('lose'); }, draw() { this.play('draw'); }, finish() { this.play('finish'); },
};

export function confetti(colors = ['#f6e21a', '#12773f', '#e5484d', '#3d63dd', '#fff'], count = 140) {
  const box = h('div', { class: 'confetti' });
  for (let i = 0; i < count; i++) {
    box.append(h('i', { style: {
      left: `${Math.random() * 100}%`, background: colors[i % colors.length], animationDuration: `${2 + Math.random() * 2.5}s`,
      animationDelay: `${Math.random() * 0.8}s`, transform: `rotate(${Math.random() * 360}deg)`,
    } }));
  }
  document.body.append(box);
  setTimeout(() => box.remove(), 5500);
}

export const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())?.catch?.(() => {});

// ---------- иконки (в стиле Lucide) ----------
const ICONS = {
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  spark: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 1.9 1.9.8-1.9.8L19 20.4l-.8-1.9-1.9-.8 1.9-.8z"/>',
  rope: '<circle cx="4.5" cy="5" r="2"/><circle cx="19.5" cy="5" r="2"/><path d="M4.5 7.5 3 14M19.5 7.5 21 14"/><path d="M2 14c2.5-2 4.5 2 7 0s4.5 2 7 0 4.5 2 6 0"/>',
  chart: '<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3"/><path d="M12 17h.01"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-5-5L5 21"/>',
  video: '<rect x="2" y="6" width="14" height="12" rx="2"/><path d="m22 8-6 4 6 4z"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  sigma: '<path d="M18 7V4H6l6 8-6 8h12v-3"/>',
  listul: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  up: '<path d="m18 15-6-6-6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  max: '<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>',
  vol: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>',
  print: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  zap: '<path d="M13 2 3 14h9l-1 8 10-12h-9z"/>',
  trophy: '<path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  swap: '<path d="M16 3l4 4-4 4M20 7H4M8 21l-4-4 4-4M4 17h16"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  phone: '<rect x="5" y="2" width="14" height="20" rx="2"/><path d="M12 18h.01"/>',
  left: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  right: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  skip: '<path d="m5 4 10 8-10 8z"/><path d="M19 5v14"/>',
  shuffle: '<path d="M2 18h1.4c1.3 0 2.5-.6 3.3-1.7l6.1-8.6c.7-1.1 2-1.7 3.3-1.7H22"/><path d="m18 2 4 4-4 4"/><path d="M2 6h1.9c1.5 0 2.9.9 3.6 2.2"/><path d="M22 18h-5.9c-1.3 0-2.6-.7-3.3-1.8l-.5-.8"/><path d="m18 14 4 4-4 4"/>',
  flame: '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2-1-3-1.1-2.1-.2-4 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.2.4-2.3 1-3.4.4 1.4 1.2 2.9 2.5 2.9z"/>',
  bold: '<path d="M6 4h8a4 4 0 0 1 0 8H6zM6 12h9a4 4 0 0 1 0 8H6z"/>',
  italic: '<path d="M19 4h-9M14 20H5M15 4 9 20"/>',
  under: '<path d="M6 4v6a6 6 0 0 0 12 0V4M4 20h16"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M8 9h8M8 13h5"/>',
  medal: '<circle cx="12" cy="15" r="6"/><path d="M8.2 10.1 5 3h4l3 6M15.8 10.1 19 3h-4l-2.2 4.6"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
export const ic = (name, props = {}) => h('span', { ...props, html: icon(name), style: { display: 'inline-flex', ...(props.style || {}) } });
