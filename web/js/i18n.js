// Два языка интерфейса. В коде пишется русская фраза, казахский перевод берётся из словаря kk.js;
// если перевода нет — показывается русский текст.
import { KK } from './kk.js';

let current = 'ru';
try { current = localStorage.getItem('tq_lang') === 'kk' ? 'kk' : 'ru'; } catch { /* приватный режим */ }
document.documentElement.lang = current;

export const lang = () => current;

export function setLang(l) {
  current = l === 'kk' ? 'kk' : 'ru';
  document.documentElement.lang = current;
  try { localStorage.setItem('tq_lang', current); } catch { /* приватный режим */ }
}

export function t(s, vars) {
  const r = current === 'kk' ? (KK[s] ?? s) : s;
  return vars ? r.replace(/\{(\w+)\}/g, (m, k) => (vars[k] ?? m)) : r;
}
