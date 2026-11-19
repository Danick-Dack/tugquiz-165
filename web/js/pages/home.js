import { h, go, store, isTeacher, icon } from '../core.js';
import { t } from '../i18n.js';
import { page } from '../app.js';
import { Tug } from '../rope.js';
import { modeArt } from '../mode-art.js';

export function pinForm(big = false) {
  const input = h('input', {
    class: `input pin-input`, inputmode: 'numeric', maxlength: 6, placeholder: '••••••', autocomplete: 'off', 'aria-label': 'PIN',
    onInput: () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); },
  });
  return h('form', { class: 'row', style: { flexWrap: 'nowrap', gap: '8px' }, onSubmit: (e) => { e.preventDefault(); if (input.value.length === 6) go(`#/join/${input.value}`); else input.focus(); } },
    h('div', { class: 'grow' }, input), h('button', { class: `btn primary ${big ? 'big' : ''}` }, t('Играть')));
}

export function home() {
  const tug = new Tug({ names: [t('Красные'), t('Синие')] });
  let pos = 0;
  const timer = setInterval(() => {
    pos += (Math.random() - 0.5 - pos / 300) * 34;
    if (Math.abs(pos) > 90) pos *= 0.4;
    tug.set(pos);
  }, 1500);

  const me = store.me;
  const mode = (art, ico, title, text) => h('div', { class: 'mode-card' }, h('div', { html: modeArt(art), style: { display: 'contents' } }), h('h3', null, h('span', { html: icon(ico), style: { display: 'contents' } }), t(title)), h('p', null, t(text)));
  const role = (title, items, btn, cls = '') => h('div', { class: `card pad-lg role ${cls}` }, h('h2', null, t(title)), h('ul', null, items.map((i) => h('li', null, t(i)))), btn);

  const node = page(
    store.needsSetup ? h('div', { class: 'section', style: { paddingTop: '24px' } }, h('div', { class: 'card row between' },
      h('span', null, t('Первый запуск: ') , t('создайте аккаунт администратора')), h('a', { class: 'btn primary sm', href: '#/register/teacher' }, t('Создать аккаунт')))) : null,
    h('section', { class: 'hero' }, h('div', { class: 'in' },
      h('div', null,
        h('h1', null, 'Арқан тартыс', h('em', null, t('в мире знаний'))),
        h('p', { class: 'lead' }, t('Учитель запускает квиз на доске, ученики отвечают с телефонов. Правильно и быстро — и канат тянется на вашу сторону.')),
        h('div', { class: 'join-box' },
          h('label', { class: 'field' }, h('span', null, t('Введите PIN-код с доски')), pinForm(true)),
          h('div', { class: 'note' }, me
            ? h('a', { href: isTeacher() ? '#/t' : '#/s' }, t('Открыть кабинет'))
            : [t('Учитель?'), ' ', h('a', { href: '#/login' }, t('Войти в кабинет'))]))),
      h('div', { class: 'hero-scene' }, tug.el))),
    h('div', { class: 'section' },
      h('div', { class: 'roles' },
        role('Для учителей', ['Квизы по всем предметам лицея', 'Формулы, картинки, видео и ссылки', 'ИИ составит вопросы по теме за минуту', 'Отчёты с графиками и PDF'],
          h('a', { class: 'btn', href: me ? '#/t' : '#/login' }, t('Войти как учитель'))),
        role('Для учеников', ['Вход по PIN без установки приложений', 'Команды или каждый сам за себя', 'Очки за правильность и скорость', 'Личный рейтинг, уровни и награды'],
          h('a', { class: 'btn', href: '#/register/student' }, t('Создать аккаунт')), 'kid'))),
    h('div', { class: 'section' },
      h('h2', null, t('Четыре режима игры')),
      h('div', { class: 'modes' },
        mode('tug', 'rope', 'Арқан тартыс', 'Две команды отвечают с телефонов, каждый верный и быстрый ответ тянет канат'),
        mode('duel', 'swap', 'Команды по очереди', 'Вопрос первой команде, затем второй, очки за правильность и скорость'),
        mode('solo', 'trophy', 'Каждый сам за себя', 'Весь класс отвечает на вопрос, открытые ответы учитель может оценить сам'),
        mode('board', 'monitor', 'Канат на доске', 'Без телефонов: две половины интерактивной доски, у каждой команды свои примеры'))));
  node.cleanup = () => clearInterval(timer);
  return node;
}
