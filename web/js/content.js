// Безопасный «мини-markdown» для вопросов: **жирный**, *курсив*, __подчёркнутый__, [ссылка](https://…),
// списки «- » и «1. », формулы $…$ и $$…$$ (KaTeX). Весь остальной текст экранируется.
import { h, esc } from './core.js';

const tex = (src, display) => {
  try { return window.katex.renderToString(src, { throwOnError: false, displayMode: display, strict: 'ignore', trust: false }); } catch { return esc(src); }
};
const safeUrl = (u) => (/^https?:\/\/[^\s"'<>]+$/i.test(u) ? u : null);

function inline(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/__(.+?)__/g, '<u>$1</u>')
    .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<i>$2</i>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
      const u = safeUrl(url.replace(/&amp;/g, '&'));
      return u ? `<a href="${esc(u)}" target="_blank" rel="noopener noreferrer">${text}</a>` : m;
    });
}

export function rich(text) {
  const formulas = [];
  let s = String(text ?? '').replace(/\\\$/g, '\u0001')
    .replace(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g, (m, d, i) => {
      formulas.push(tex((d ?? i).replace(/\u0001/g, '\\$'), d !== undefined));
      return `\u0000${formulas.length - 1}\u0000`;
    });
  s = esc(s).replace(/\u0001/g, '$');
  const out = [];
  let list = null;
  for (const line of s.split('\n')) {
    const ul = line.match(/^\s*[-•]\s+(.*)/);
    const ol = line.match(/^\s*\d+[.)]\s+(.*)/);
    const kind = ul ? 'ul' : ol ? 'ol' : null;
    if (kind) {
      if (list?.kind !== kind) { if (list) out.push(`</${list.kind}>`); list = { kind }; out.push(`<${kind}>`); }
      out.push(`<li>${inline((ul || ol)[1])}</li>`);
      continue;
    }
    if (list) { out.push(`</${list.kind}>`); list = null; }
    out.push(inline(line), '<br>');
  }
  if (list) out.push(`</${list.kind}>`);
  if (out.at(-1) === '<br>') out.pop();
  return out.join('').replace(/\u0000(\d+)\u0000/g, (m, n) => formulas[n]);
}

export const richEl = (text, tag = 'div', cls = '') => h(tag, { class: `rich ${cls}`, html: rich(text) });

export function videoEl(url) {
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) {
    return h('div', { class: 'vid' }, h('iframe', {
      src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`, title: 'YouTube', loading: 'lazy',
      allow: 'encrypted-media; picture-in-picture; fullscreen', allowfullscreen: true,
    }));
  }
  const vm = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return h('div', { class: 'vid' }, h('iframe', { src: `https://player.vimeo.com/video/${vm[1]}`, title: 'Vimeo', loading: 'lazy', allow: 'fullscreen; picture-in-picture', allowfullscreen: true }));
  return h('video', { class: 'plain', src: url, controls: true, preload: 'metadata', playsinline: true });
}

export function mediaEl({ image, video } = {}) {
  if (!image && !video) return null;
  return h('div', { class: 'media' },
    image ? h('img', { src: image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
    video ? videoEl(video) : null);
}

/** Полный вид вопроса: текст + картинка/видео. */
export const questionEl = (q, cls = '') => h('div', { class: cls }, richEl(q.text), mediaEl(q));
