// Три языка интерфейса (ru / kk / en). В коде пишется русская фраза, перевод берётся из словарей kk.js, en.js
// и tr-extra.js; если перевода нет — показывается русский текст.
import { KK } from './kk.js';
import { EN } from './en.js';
import { EXTRA } from './tr-extra.js';

export const LANGS = ['ru', 'kk', 'en'];
const DICT = { kk: { ...KK }, en: { ...EN } };
for (const [ru, kk, en] of EXTRA) { DICT.kk[ru] = kk; DICT.en[ru] = en; }
let current = 'ru';
try {
  const saved = localStorage.getItem('tq_lang');
  if (LANGS.includes(saved)) current = saved;
  else if (!saved && /^en\b/i.test(navigator.language || '')) current = 'en';
} catch { /* приватный режим */ }
document.documentElement.lang = current;

export const lang = () => current;

export function setLang(l) {
  current = LANGS.includes(l) ? l : 'ru';
  document.documentElement.lang = current;
  try { localStorage.setItem('tq_lang', current); } catch { /* приватный режим */ }
}

export function t(s, vars) {
  const r = DICT[current]?.[s] ?? s;
  return vars ? r.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : r;
}
