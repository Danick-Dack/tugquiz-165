// Точка входа: загрузка профиля, маршруты (#/...), общие шапка/подвал и меню учителя.
import { h, fill, api, store, go, isTeacher, icon, ic, modal, toastErr, DEV } from './core.js';
import { t, lang, setLang } from './i18n.js';

const app = document.getElementById('app');
let cleanup = null;

// ---------- шапка и подвал ----------
function header() {
  const me = store.me;
  const langSw = h('div', { class: 'lang', role: 'group', 'aria-label': 'Язык / Тіл' },
    ['ru', 'kk'].map((l) => h('button', { class: lang() === l ? 'on' : '', onClick: () => { setLang(l); render(); } }, l === 'ru' ? 'RU' : 'ҚАЗ')));
  return h('header', { class: 'top' }, h('div', { class: 'in' },
    h('a', { class: 'brand', href: '#/' },
      h('img', { src: '/img/icon-192.png', alt: 'SL165' }),
      h('div', null, h('b', null, 'TugQuiz', h('span', { class: 'hide-xs' }, ' · SL165')), h('small', null, '№165 мамандандырылған лицей'))),
    h('div', { class: 'grow' }),
    langSw,
    me
      ? [h('a', { class: 'btn sm hide-sm', href: isTeacher() ? '#/t' : '#/s' }, ic('user'), me.name.split(' ')[0]),
        h('button', { class: 'btn sm icon', title: t('Выйти'), 'aria-label': t('Выйти'), html: icon('logout'), onClick: logout })]
      : h('a', { class: 'btn sm primary', href: '#/login' }, t('Войти'))));
}

export const footer = () => h('footer', { class: 'foot' }, h('div', { class: 'in' },
  h('div', null, h('b', null, '№165 мамандандырылған лицей'), h('div', null, t('Квизы и «Арқан тартыс» для уроков · основан в 1991 году'))),
  h('div', { class: 'dev' }, DEV)));

async function logout() {
  await api('/api/logout', { method: 'POST' }).catch(() => {});
  store.me = null;
  go('#/');
}

export const page = (...content) => h('div', null, header(), h('main', null, content), footer());

// ---------- меню учителя ----------
const NAV = [
  ['', 'home', 'Главная'], ['quizzes', 'grid', 'Мои квизы'], ['library', 'book', 'Библиотека'], ['ai', 'msg', 'ИИ-генератор'],
  ['board', 'rope', 'Канат на доске'], ['history', 'chart', 'История игр'], ['guide', 'help', 'Гайд'], ['settings', 'sliders', 'Настройки'],
];
const navItems = () => (store.me?.role === 'admin' ? [...NAV, ['admin', 'shield', 'Администратор']] : NAV);

export function teacherPage(active, ...content) {
  const link = ([key, ico, label]) => h('a', { href: `#/t${key ? `/${key}` : ''}`, class: active === key ? 'on' : '', 'data-nav': key || 'home' },
    h('span', { html: icon(ico), style: { display: 'contents' } }), t(label));
  const mobile = ['', 'quizzes', 'ai', 'board'];
  return h('div', null, header(),
    h('div', { class: 'shell' },
      h('nav', { class: 'side', 'aria-label': t('Меню учителя') },
        h('a', { class: 'create', href: '#/t/edit/new', 'data-nav': 'create' }, ic('plus'), t('Создать квиз')),
        navItems().slice(0, 6).map(link), h('div', { class: 'sep' }), navItems().slice(6).map(link)),
      h('div', { class: 'main' }, content)),
    h('nav', { class: 'mnav' },
      navItems().filter(([k]) => mobile.includes(k)).map(([key, ico, label]) =>
        h('a', { href: `#/t${key ? `/${key}` : ''}`, class: active === key ? 'on' : '' }, h('span', { html: icon(ico), style: { display: 'contents' } }), h('span', { class: 'lbl' }, t(label)))),
      h('a', { href: '#', onClick: (e) => { e.preventDefault(); moreMenu(); } }, h('span', { html: icon('grid'), style: { display: 'contents' } }), h('span', { class: 'lbl' }, t('Ещё')))),
    footer());
}

function moreMenu() {
  const m = modal({
    title: t('Меню'),
    body: h('div', { class: 'stack' }, navItems().map(([key, ico, label]) =>
      h('a', { class: 'btn', style: { width: '100%', justifyContent: 'flex-start' }, href: `#/t${key ? `/${key}` : ''}`, onClick: () => m.close() }, ic(ico), t(label)))),
  });
}

// ---------- маршруты ----------
const ROUTES = [
  [/^$/, () => import('./pages/home.js').then((m) => m.home())],
  [/^login$/, () => import('./pages/auth.js').then((m) => m.login())],
  [/^register(?:\/(teacher|student))?$/, (r) => import('./pages/auth.js').then((m) => m.register(r))],
  [/^join(?:\/(\d{6}))?$/, (pin) => import('./pages/play.js').then((m) => m.play(pin))],
  [/^s$/, () => import('./pages/student.js').then((m) => m.cabinet()), 'login'],
  [/^t$/, () => import('./pages/teacher.js').then((m) => m.dashboard()), 'teacher'],
  [/^t\/(quizzes|library|history|settings|admin)$/, (p) => import('./pages/teacher.js').then((m) => m[p]()), 'teacher'],
  [/^t\/ai$/, () => import('./pages/ai.js').then((m) => m.aiPage()), 'teacher'],
  [/^t\/guide$/, () => import('./pages/guide.js').then((m) => m.guide()), 'teacher'],
  [/^t\/board$/, () => import('./pages/board.js').then((m) => m.boardSetup()), 'teacher'],
  [/^board$/, () => import('./pages/board.js').then((m) => m.boardPlay()), 'teacher'],
  [/^t\/edit\/(new|\d+)$/, (id) => import('./pages/editor.js').then((m) => m.editor(id)), 'teacher'],
  [/^t\/report\/(\d+)$/, (id) => import('./pages/report.js').then((m) => m.report(Number(id))), 'teacher'],
  [/^host\/(\d+)$/, (id) => import('./pages/host.js').then((m) => m.host(Number(id))), 'teacher'],
];

export async function render() {
  const path = decodeURIComponent(location.hash.replace(/^#\/?/, '')).split('?')[0];
  const found = ROUTES.find(([re]) => re.test(path));
  if (!found) return go('#/');
  const [re, load, guard] = found;
  if (guard === 'teacher' && !isTeacher()) return go(store.me ? '#/s' : '#/login');
  if (guard === 'login' && !store.me) return go('#/login');
  cleanup?.();
  cleanup = null;
  try {
    const node = await load(...path.match(re).slice(1));
    cleanup = node.cleanup || null;
    fill(app, node);
    if (!node.keepScroll) window.scrollTo(0, 0);
    node.onMount?.();
  } catch (e) {
    console.error(e);
    toastErr(e);
    fill(app, page(h('div', { class: 'wrap empty' }, h('h2', null, t('Что-то пошло не так')), h('p', null, e.message),
      h('a', { class: 'btn primary', href: '#/' }, t('На главную')))));
  }
}

async function boot() {
  try {
    const r = await api('/api/me');
    Object.assign(store, { me: r.user, meta: r.meta, needsSetup: r.needsSetup });
  } catch (e) {
    fill(app, h('div', { class: 'wrap empty' }, h('h2', null, t('Сервер недоступен')), h('p', null, e.message)));
    return;
  }
  window.addEventListener('hashchange', render);
  render();
}

boot();
