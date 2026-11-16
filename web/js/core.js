// Общие инструменты интерфейса: создание элементов, API, окна, звуки, иконки.
import { t, lang } from './i18n.js';

export const store = { me: null, meta: null };

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
  if (!res.ok) throw new Error(data?.error || `${t('Ошибка')} ${res.status}`);
  return data;
}

export const go = (hash) => { location.hash = hash; };
export const isTeacher = () => ['teacher', 'admin'].includes(store.me?.role);

export function subj(key) {
  const s = store.meta?.subjects.find((x) => x.key === key) || { ru: '—', kk: '—', color: '#64748b' };
  return { name: lang() === 'kk' ? s.kk : s.ru, color: s.color };
}
export const subjChip = (key) => { const s = subj(key); return h('span', { class: 'chip dot', style: { color: s.color, background: `${s.color}18` } }, s.name); };

const KK_MONTHS = ['қаңтар', 'ақпан', 'наурыз', 'сәуір', 'мамыр', 'маусым', 'шілде', 'тамыз', 'қыркүйек', 'қазан', 'қараша', 'желтоқсан'];
export function fmtDate(ms, withTime = true) {
  if (!ms) return '—';
  const d = new Date(ms);
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  // Браузеры плохо знают казахскую локаль, поэтому месяцы пишем сами.
  if (lang() === 'kk') return withTime ? `${d.getDate()} ${KK_MONTHS[d.getMonth()].slice(0, 3)}., ${time}` : `${d.getFullYear()} ж. ${d.getDate()} ${KK_MONTHS[d.getMonth()]}`;
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
let actx;
export const sound = {
  get on() { try { return localStorage.getItem('tq_sound') !== '0'; } catch { return true; } },
  set on(v) { try { localStorage.setItem('tq_sound', v ? '1' : '0'); } catch { /* приватный режим */ } },
  tone(freq, dur = 0.12, type = 'sine', vol = 0.15, delay = 0) {
    if (!this.on) return;
    try {
      actx ||= new AudioContext();
      const o = actx.createOscillator();
      const g = actx.createGain();
      const at = actx.currentTime + delay;
      o.type = type; o.frequency.setValueAtTime(freq, at);
      g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
      o.connect(g).connect(actx.destination); o.start(at); o.stop(at + dur + 0.02);
    } catch { /* звук не обязателен */ }
  },
  tick() { this.tone(880, 0.05, 'square', 0.05); },
  good() { this.tone(660, 0.1, 'triangle'); this.tone(990, 0.16, 'triangle', 0.15, 0.09); },
  bad() { this.tone(200, 0.25, 'sawtooth', 0.08); },
  pop() { this.tone(520, 0.07, 'sine', 0.1); },
  pull() { this.tone(140, 0.18, 'triangle', 0.18); this.tone(90, 0.2, 'sine', 0.15, 0.05); },
  win() { [523, 659, 784, 1046, 784, 1046].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.16, i * 0.13)); },
  go() { this.tone(440, 0.12, 'square', 0.08); this.tone(880, 0.25, 'square', 0.08, 0.12); },
};

export function confetti(colors = ['#f6e21a', '#12773f', '#e5484d', '#3d63dd', '#fff']) {
  const box = h('div', { class: 'confetti' });
  for (let i = 0; i < 140; i++) {
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
  msg: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
};
export const icon = (name) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ''}</svg>`;
export const ic = (name, props = {}) => h('span', { ...props, html: icon(name), style: { display: 'inline-flex', ...(props.style || {}) } });
