// Автономное демо «Канат на доске»: тот же экран игры, что и на сайте, но без сервера и аккаунтов.
import { h, fill, go, ic } from '../web/js/core.js';
import { t, lang, setLang } from '../web/js/i18n.js';
import { Tug } from '../web/js/rope.js';
import { LEVELS } from '../web/js/gen.js';
import { boardPlay } from '../web/js/pages/board.js';

// Сохранение результата в историю в демо не нужно: притворяемся, что сервер ответил.
window.fetch = async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });

const st = { level: 7, names: [t('1-команда'), t('2-команда')], duration: 90, margin: 8 };
const app = document.getElementById('app');
const HINTS = {
  7: 'Отрицательные числа, степени, проценты, уравнения.',
  89: 'Квадраты, корни, теорема Виета, дискриминант, проценты.',
  1011: 'Логарифмы, производные, прогрессии, факториалы, тригонометрия, интегралы.',
};

function setup() {
  const hintEl = h('p', { class: 'small muted' });
  const hint = () => { hintEl.textContent = t(HINTS[st.level]); };
  hint();
  const seg = (key, values, fmt = (v) => v) => {
    const el = h('div', { class: 'seg' }, values.map((v) => h('button', { type: 'button', class: st[key] === v ? 'on' : '',
      onClick: (e) => { st[key] = v; el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); hint(); } }, fmt(v))));
    return el;
  };
  const line = (label, ctl) => h('div', { class: 'row between' }, h('b', null, t(label)), ctl);
  const tug = new Tug({ names: st.names });
  const langSw = h('div', { class: 'lang', role: 'group', 'aria-label': 'Язык / Тіл' }, ['ru', 'kk'].map((l) =>
    h('button', { class: lang() === l ? 'on' : '', onClick: () => { setLang(l); st.names = [t('1-команда'), t('2-команда')]; render(); } }, l === 'ru' ? 'RU' : 'ҚАЗ')));
  const start = () => {
    sessionStorage.setItem('tq_board', JSON.stringify({
      teamNames: st.names.map((n, i) => n.trim() || `${i + 1}`), duration: st.duration, margin: st.margin,
      title: `${t('Устный счёт')} · ${t(LEVELS[st.level])}`, subject: 'mat', gen: { level: st.level },
    }));
    go('#/board');
  };
  fill(app, h('div', { class: 'wrap', style: { maxWidth: '980px' } },
    h('div', { class: 'row between', style: { marginBottom: '20px' } },
      h('div', { class: 'row' }, h('img', { src: window.TQ_LOGO, alt: '', width: 44, height: 44 }),
        h('div', null, h('b', null, 'TugQuiz · SL165'), h('div', { class: 'small muted' }, t('Демо-версия без сервера')))),
      langSw),
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('Канат на доске')),
      h('p', { class: 'muted', style: { margin: '6px 0 0' } }, t('Арқан тартыс без телефонов: два ученика у интерактивной доски, у каждого свои примеры. Верный ответ — рывок каната на свою сторону.'))),
      h('button', { class: 'btn primary big', onClick: start }, ic('play'), t('Начать'))),
    h('div', { class: 'card stack' },
      line('Уровень', seg('level', Object.keys(LEVELS).map(Number), (v) => t(LEVELS[v]))), hintEl,
      h('div', { class: 'row' }, [0, 1].map((i) => h('label', { class: 'field grow' }, h('span', { style: { color: i ? 'var(--blue)' : 'var(--red)' } }, i ? t('Справа') : t('Слева')),
        h('input', { class: 'input', value: st.names[i], maxLength: 20, onInput: (e) => { st.names[i] = e.target.value; tug.setNames(st.names); } })))),
      line('Время', seg('duration', [60, 90, 120, 180], (v) => `${v} ${t('с')}`)),
      line('Для победы нужен перевес', seg('margin', [5, 8, 10, 15], (v) => `${v}`)),
      h('div', { style: { borderRadius: '14px', overflow: 'hidden' } }, tug.el)),
    h('p', { class: 'small muted center', style: { marginTop: '16px' } }, t('Полная версия: аккаунты, свои квизы, игра с телефонов по PIN — работает на сервере.')),
    h('p', { class: 'small muted center' }, 'Developed by Daniyar Dauletuly')));
}

let current;
function render() {
  current?.cleanup?.();
  current = null;
  if (location.hash !== '#/board') return setup();
  current = boardPlay();
  current.querySelectorAll('img').forEach((i) => { i.src = window.TQ_LOGO; });
  fill(app, current);
}
window.addEventListener('hashchange', render);
render();
