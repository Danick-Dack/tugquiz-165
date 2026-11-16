import { h, api, store, go, isTeacher, toastErr } from '../core.js';
import { t } from '../i18n.js';
import { page } from '../app.js';

const field = (label, input, hint) => h('label', { class: 'field' }, h('span', null, label), input, hint ? h('div', { class: 'small muted', style: { marginTop: '4px' } }, hint) : null);
const box = (...content) => page(h('div', { class: 'wrap', style: { maxWidth: '480px', paddingTop: '40px' } }, h('div', { class: 'card pad-lg stack' }, content)));

function afterLogin(user) {
  store.me = user;
  store.needsSetup = false;
  const back = sessionStorage.getItem('tq_after_login');
  sessionStorage.removeItem('tq_after_login');
  go(back || (isTeacher() ? '#/t' : '#/s'));
}

const already = () => { setTimeout(() => go(isTeacher() ? '#/t' : '#/s')); return h('div'); };

export function login() {
  if (store.me) return already();
  if (store.needsSetup) return register('teacher');
  const lg = h('input', { class: 'input', autocomplete: 'username', required: true });
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'current-password', required: true });
  const submit = async (e) => {
    e.preventDefault();
    try { afterLogin((await api('/api/login', { method: 'POST', body: { login: lg.value, password: pw.value } })).user); } catch (err) { toastErr(err); }
  };
  return box(
    h('h1', { style: { fontSize: '1.7rem' } }, t('Вход')),
    h('form', { class: 'stack', onSubmit: submit },
      field(t('Логин'), lg), field(t('Пароль'), pw),
      h('button', { class: 'btn primary big', style: { width: '100%' } }, t('Войти'))),
    h('div', { class: 'small muted center stack' },
      h('div', null, t('Нет аккаунта?'), ' ', h('a', { href: '#/register/student' }, t('Регистрация ученика')), ' · ', h('a', { href: '#/register/teacher' }, t('Регистрация учителя'))),
      h('div', null, t('Играть можно и без аккаунта:'), ' ', h('a', { href: '#/join' }, t('ввести PIN')))));
}

export function register(role = 'student') {
  if (store.me) return already();
  const setup = store.needsSetup;
  const isT = setup || role === 'teacher';
  const name = h('input', { class: 'input', autocomplete: 'name', required: true, placeholder: isT ? t('Например: Айгуль Серикбаевна') : t('Имя и фамилия') });
  const lg = h('input', { class: 'input', autocomplete: 'username', required: true, pattern: '[A-Za-z0-9_.\\-]{3,32}', placeholder: 'aigul.s' });
  const pw = h('input', { class: 'input', type: 'password', autocomplete: 'new-password', required: true, minLength: 6 });
  const invite = h('input', { class: 'input', placeholder: 'SL165-0000' });
  const cls = h('select', { class: 'input', required: true },
    h('option', { value: '' }, t('— выберите —')), store.meta.classes.map((c) => h('option', { value: c }, c)));
  const submit = async (e) => {
    e.preventDefault();
    try {
      const { user } = await api('/api/register', { method: 'POST', body: {
        role: isT ? 'teacher' : 'student', name: name.value, login: lg.value, password: pw.value, class_name: cls.value, invite: invite.value,
      } });
      afterLogin(user);
    } catch (err) { toastErr(err); }
  };
  return box(
    h('h1', { style: { fontSize: '1.6rem' } }, setup ? t('Аккаунт администратора') : isT ? t('Регистрация учителя') : t('Регистрация ученика')),
    setup ? h('p', { class: 'muted' }, t('Это первый запуск сайта. Первый аккаунт станет администратором: он выдаёт код для учителей и настраивает ИИ.')) : null,
    setup ? null : h('div', { class: 'seg' },
      h('button', { class: isT ? '' : 'on', onClick: () => go('#/register/student') }, t('Ученик')),
      h('button', { class: isT ? 'on' : '', onClick: () => go('#/register/teacher') }, t('Учитель'))),
    h('form', { class: 'stack', onSubmit: submit },
      field(isT ? t('Имя и отчество (как обращаются ученики)') : t('Имя и фамилия'), name),
      isT ? null : field(t('Класс'), cls),
      field(t('Логин'), lg, t('Латиницей, 3–32 символа')),
      field(t('Пароль'), pw, t('Минимум 6 символов')),
      isT && !setup ? field(t('Код учителя'), invite, t('Код выдаёт администратор сайта')) : null,
      h('button', { class: 'btn primary big', style: { width: '100%' } }, t('Создать аккаунт'))),
    h('div', { class: 'small muted center' }, t('Уже есть аккаунт?'), ' ', h('a', { href: '#/login' }, t('Войти'))));
}
