import { h, go, store, isTeacher, icon } from '../core.js';
import { t } from '../i18n.js';
import { page } from '../app.js';
import { Tug } from '../rope.js';

export function pinForm(big = false) {
  const input = h('input', {
    class: `input pin-input`, inputmode: 'numeric', maxlength: 6, placeholder: '••••••', autocomplete: 'off', 'aria-label': 'PIN',
    onInput: () => { input.value = input.value.replace(/\D/g, '').slice(0, 6); },
  });
  return h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); if (input.value.length === 6) go(`#/join/${input.value}`); else input.focus(); } },
    input, h('button', { class: `btn yellow ${big ? 'big' : ''}`, style: { width: '100%' } }, h('span', { html: icon('play'), style: { display: 'contents' } }), t('Играть')));
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
  const cabinet = me ? h('a', { class: 'btn yellow big', href: isTeacher() ? '#/t' : '#/s' }, t('Открыть кабинет'))
    : [h('a', { class: 'btn yellow big', href: '#/login' }, t('Я учитель')), h('a', { class: 'btn big', href: '#/register/student', style: { background: 'rgba(255,255,255,.12)', color: '#fff' } }, t('Я ученик'))];

  const mode = (ico, title, text) => h('div', { class: 'mode-card' }, h('h3', null, h('span', { html: icon(ico), style: { display: 'contents' } }), t(title)), h('p', { class: 'muted' }, t(text)));
  const role = (ico, title, items, btn) => h('div', { class: 'card pad-lg role' },
    h('div', { class: 'ic', html: icon(ico) }), h('h2', null, t(title)), h('ul', null, items.map((i) => h('li', null, t(i)))), btn);

  const node = page(
    store.needsSetup ? h('div', { style: { background: 'var(--y)', padding: '12px 16px', textAlign: 'center', fontWeight: 800 } },
      t('Первый запуск: '), h('a', { href: '#/register/teacher' }, t('создайте аккаунт администратора'))) : null,
    h('section', { class: 'hero' }, h('div', { class: 'in' },
      h('div', null,
        h('h1', { style: { margin: '0 0 14px' } }, 'Арқан тартыс ', h('em', null, t('в мире знаний'))),
        h('p', { class: 'lead' }, t('Учитель запускает квиз на доске, ученики отвечают с телефонов. Правильно и быстро — и канат тянется на вашу сторону.')),
        h('div', { class: 'row', style: { marginTop: '22px' } }, cabinet)),
      h('div', { class: 'stack' },
        h('div', { class: 'join-box' }, h('h2', null, t('Войти в игру')), h('p', { class: 'muted small' }, t('Введите PIN-код с доски')), pinForm(true)),
        h('div', { class: 'hero-scene' }, tug.el)))),
    h('div', { class: 'wrap' },
      h('div', { class: 'roles' },
        role('user', 'Для учителей', ['Квизы по всем предметам лицея', 'Формулы, картинки, видео и ссылки', 'ИИ составит вопросы по теме за минуту', 'Отчёты с графиками и PDF'],
          h('a', { class: 'btn primary', href: me ? '#/t' : '#/login' }, t('Войти как учитель'))),
        role('users', 'Для учеников', ['Вход по PIN без установки приложений', 'Команды или каждый сам за себя', 'Очки за правильность и скорость', 'Личный рейтинг, уровни и награды'],
          h('a', { class: 'btn', href: '#/join' }, t('Ввести PIN')))),
      h('h2', { class: 'center', style: { margin: '48px 0 20px' } }, t('Четыре режима игры')),
      h('div', { class: 'modes' },
        mode('rope', 'Арқан тартыс', 'Две команды отвечают с телефонов, каждый верный и быстрый ответ тянет канат.'),
        mode('swap', 'Команды по очереди', 'Вопрос первой команде, затем второй. Очки — за правильность и скорость.'),
        mode('trophy', 'Каждый сам за себя', 'Весь класс отвечает на вопрос, учитель может сам оценить открытые ответы.'),
        mode('monitor', 'Канат на доске', 'Без телефонов: две половины интерактивной доски, у каждой команды свои примеры.'))));
  node.cleanup = () => clearInterval(timer);
  return node;
}
