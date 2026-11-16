// Экран ученика: вход по PIN, команда, ответы с телефона, результат каждого вопроса и итог.
import { h, fill, store, go, sound, confetti, ic, icon } from '../core.js';
import { t } from '../i18n.js';
import { page } from '../app.js';
import { connect } from '../ws.js';
import { Tug } from '../rope.js';
import { questionEl, rich } from '../content.js';
import { pinForm } from './home.js';

const L = 'ABCDEF';
const ls = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* приватный режим */ } },
};

function joinForm(pin, error) {
  if (!pin) {
    return page(h('div', { class: 'wrap', style: { maxWidth: '440px', paddingTop: '40px' } }, h('div', { class: 'card pad-lg stack center' },
      h('h1', null, t('Войти в игру')), h('p', { class: 'muted' }, t('Введите PIN-код с доски')),
      error ? h('p', { style: { color: 'var(--bad)' } }, error) : null, pinForm(true))));
  }
  const name = h('input', { class: 'input', value: ls.get('tq_name') || '', maxLength: 24, placeholder: t('Имя и фамилия'), required: true, style: { fontSize: '17px' } });
  return page(h('div', { class: 'wrap', style: { maxWidth: '440px', paddingTop: '40px' } }, h('div', { class: 'card pad-lg stack' },
    h('h1', null, `${t('Игра')} ${pin}`),
    error ? h('p', { style: { color: 'var(--bad)' } }, error) : null,
    h('form', { class: 'stack', onSubmit: (e) => {
      e.preventDefault();
      if (name.value.trim().length < 2) return name.focus();
      ls.set('tq_name', name.value.trim());
      sessionStorage.setItem('tq_join_name', name.value.trim());
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    } },
    h('label', { class: 'field' }, h('span', null, t('Как тебя зовут?')), name),
    h('button', { class: 'btn primary big', style: { width: '100%' } }, t('Войти в игру'))),
    h('p', { class: 'small muted center' }, t('Есть аккаунт ученика?'), ' ', h('a', { href: '#/login', onClick: () => sessionStorage.setItem('tq_after_login', `#/join/${pin}`) }, t('Войдите')), ' — ', t('очки попадут в рейтинг')))));
}

export function play(pin) {
  const student = store.me?.role === 'student' ? store.me : null;
  const name = student?.name || sessionStorage.getItem('tq_join_name');
  if (!pin || !name) return joinForm(pin);
  sessionStorage.removeItem('tq_join_name');

  const headL = h('div');
  const headR = h('div');
  const body = h('div', { class: 'pbody' });
  const root = h('div', { class: 'play' }, h('div', { class: 'phead' }, headL, headR), body,
    h('div', { class: 'dev', style: { textAlign: 'center', padding: '10px', opacity: 0.5 } }, 'Developed by Daniyar'));
  let s = null;
  let key = '';
  let view = null;
  let tug = null;
  let lastReveal = '';

  const conn = connect({
    onOpen: (c) => c.send({ t: 'join', pin, name, token: ls.get(`tq_tok_${pin}`) }),
    onStatus: (ok) => { root.style.filter = ok ? '' : 'grayscale(.6)'; },
    onMessage: (m) => {
      if (m.t === 'joined') return ls.set(`tq_tok_${pin}`, m.token);
      if (m.t === 'error') {
        root.cleanup();
        const msg = { nopin: t('Игра с таким PIN не найдена. Проверьте код на доске.'), name: t('Введите имя (минимум 2 буквы)'), full: t('В игре уже слишком много участников') }[m.code] || t('Ошибка');
        root.replaceWith(joinForm(m.code === 'nopin' ? '' : pin, msg));
        return;
      }
      if (m.t === 'kicked') {
        conn.close();
        fill(body, info('logout', t('Учитель удалил вас из игры')), h('div', { class: 'center' }, h('a', { class: 'btn primary', href: '#/join' }, t('Ввести другой PIN'))));
        return;
      }
      if (m.t === 'tick') { if (s) { s.rope = m.rope; s.teamScore = m.teamScore; } tug?.set(m.rope); return; }
      if (m.t !== 'state') return;
      s = m;
      if (s.mode === 'tug' && !tug) { tug = new Tug({ labels: false }); tug.set(s.rope, null); }
      root.className = `play ${s.me.team || ''}`;
      fill(headL, h('div', null, s.me.name), s.me.team && s.teams ? h('div', { class: 'small', style: { color: 'var(--d-sub)' } }, `${t('Команда')} «${s.teams[s.me.team].name}»`) : null);
      fill(headR, h('div', { style: { textAlign: 'right' } }, h('div', { style: { fontWeight: 600 } }, s.me.score), h('div', { class: 'small', style: { color: 'var(--d-sub)' } }, `#${s.me.rank} ${t('из')} ${s.me.of}`)));
      const k = `${s.phase}:${s.qi}:${s.mine ? 1 : 0}:${s.canAnswer}:${s.me.team}`;
      if (k !== key) { key = k; view = build(s); fill(body, view.el); }
      view.update?.(s);
    },
  });
  const send = (m) => conn.send(m);
  const tugBox = () => (tug ? h('div', { style: { borderRadius: '14px', overflow: 'hidden' } }, tug.el) : null);
  const info = (ico, title, sub) => h('div', { class: 'center stack' }, ico ? h('div', { class: 'big-mark', html: icon(ico), style: { color: 'var(--d-sub)' } }) : null, h('h2', null, title), sub ? h('p', { style: { color: 'var(--d-sub)' } }, sub) : null);

  function answerUi(q) {
    const pick = (value, btn) => {
      if (btn) btn.classList.add('picked');
      navigator.vibrate?.(30);
      sound.pop();
      send({ t: 'answer', value });
    };
    if (q.type === 'choice') {
      return h('div', { class: 'opts' }, q.options.map((o, k) => h('button', { class: `opt o${k % 6}`, onClick: (e) => pick(k, e.currentTarget) },
        h('span', { class: 'L' }, L[k]), h('span', { class: 'rich', html: rich(o.text) }), o.image ? h('img', { src: o.image, alt: '' }) : null)));
    }
    if (q.type === 'truefalse') {
      return h('div', { class: 'opts' }, h('button', { class: 'opt o3', onClick: (e) => pick(true, e.currentTarget) }, h('span', { class: 'L' }, '✓'), t('Верно')),
        h('button', { class: 'opt o0', onClick: (e) => pick(false, e.currentTarget) }, h('span', { class: 'L' }, '✗'), t('Неверно')));
    }
    const inp = h('input', { class: 'input', inputmode: q.type === 'number' ? 'decimal' : 'text', autocomplete: 'off', maxLength: 200,
      placeholder: q.type === 'number' ? t('Число') : t('Ваш ответ'), style: { fontSize: '24px', textAlign: 'center', height: '56px' } });
    setTimeout(() => inp.focus(), 50);
    return h('form', { class: 'stack', onSubmit: (e) => { e.preventDefault(); if (inp.value.trim()) pick(inp.value.trim()); } },
      inp, h('button', { class: 'btn primary big', style: { width: '100%' } }, t('Ответить')));
  }

  function build(st) {
    const q = st.question;
    switch (st.phase) {
      case 'lobby': {
        const count = h('p', { style: { color: 'var(--d-muted)' } });
        const choose = st.teams && !st.opts.autoTeams;
        const el = h('div', { class: 'stack center' },
          h('h2', null, `${t('Ты в игре')}, ${st.me.name}`),
          choose ? h('div', { class: 'stack' }, h('b', null, t('Выбери команду')), h('div', { class: 'team-pick' }, ['A', 'B'].map((tm) =>
            h('button', { class: `bg${tm} ${st.me.team === tm ? 'on' : ''}`, onClick: () => send({ t: 'team', team: tm }) }, st.teams[tm].name))))
            : st.me.team ? h('div', { class: 'team-badge' }, `${t('Твоя команда')}: `, h('span', { class: `t${st.me.team}`, style: { color: st.me.team === 'A' ? 'var(--red)' : 'var(--blue)' } }, st.teams[st.me.team].name)) : null,
          h('div', { class: 'wait-dots', style: { color: 'var(--d-sub)' } }, t('Ждём, когда учитель начнёт')), count, tugBox());
        return { el, update: (x) => { count.textContent = `${t('В игре')}: ${x.lobby.length}`; } };
      }
      case 'question': {
        if (st.mine) return { el: info('check', t('Ответ принят'), t('Ждём остальных…')) };
        const bar = h('i', { style: { transform: 'scaleX(1)' } });
        const lead = h('div', { class: 'center' });
        const area = h('div', { class: 'stack hidden' },
          st.canAnswer ? null : h('div', { class: `turn bg${st.activeTeam}` }, `${t('Сейчас отвечает команда')} «${st.teams[st.activeTeam].name}»`),
          q.text || q.image || q.video ? h('div', { class: 'card' }, questionEl(q)) : h('p', { class: 'center' }, t('Смотрите вопрос на доске')),
          st.canAnswer ? answerUi(q) : null);
        return { el: h('div', { class: 'stack' }, h('div', { class: 'row between' }, h('b', null, `${t('Вопрос')} ${st.qi + 1} / ${st.total}${q.double ? ' · ×2' : ''}`)),
          h('div', { class: 'timebar' }, bar), lead, area, tugBox()), bar, lead, area };
      }
      case 'grading': return { el: info('clock', t('Учитель проверяет ответы'), t('Сейчас узнаем результат')) };
      case 'reveal': {
        const mine = st.mine;
        const g = mine?.grade ?? 0;
        const mark = !mine ? '—' : g === 1 ? '✓' : g > 0 ? '½' : '✗';
        if (lastReveal !== key) { lastReveal = key; if (mine) (g ? sound.good() : sound.bad()); if (g) navigator.vibrate?.([30, 40, 30]); }
        return { el: h('div', { class: 'stack center' },
          h('div', { class: 'big-mark text', style: { color: !mine ? 'var(--d-muted)' : g === 1 ? '#5fd38d' : g > 0 ? 'var(--ribbon)' : '#ff8a8a' } }, mark),
          h('h2', null, !mine ? (st.canAnswer ? t('Время вышло') : t('Отвечала другая команда')) : g === 1 ? t('Верно') : g > 0 ? t('Частично верно') : t('Неверно')),
          mine?.points ? h('div', { style: { fontFamily: 'var(--display)', fontSize: '32px', color: 'var(--ribbon)' } }, `+${mine.points}`) : null,
          st.me.streak >= 2 ? h('div', { class: 'streak', style: { justifyContent: 'center', fontSize: '15px' } }, ic('flame'), `${t('Серия')}: ${st.me.streak}`) : null,
          h('div', { class: 'card' }, h('div', { class: 'small muted' }, t('Правильный ответ')), h('div', { class: 'rich', style: { fontWeight: 600, fontSize: '20px' }, html: rich(st.reveal.correctText === 'true' ? t('Верно') : st.reveal.correctText === 'false' ? t('Неверно') : st.reveal.correctText) })),
          h('div', null, `${t('Место')}: #${st.me.rank} ${t('из')} ${st.me.of}`), tugBox()) };
      }
      case 'final': {
        const f = st.final;
        const teamWon = st.teams && st.winner && st.winner !== 'draw' && st.winner === st.me.team;
        if (teamWon || (!st.teams && st.me.rank <= 3)) { confetti(); sound.win(); }
        if (tug) setTimeout(() => tug.win(st.winner), 300);
        return { el: h('div', { class: 'stack center' },
          st.teams ? h('div', { class: 'big-mark', html: icon(st.winner === 'draw' ? 'swap' : teamWon ? 'trophy' : 'users'), style: { color: teamWon ? 'var(--ribbon)' : 'var(--d-sub)' } }) : h('div', { class: 'big-mark text', style: { color: st.me.rank <= 3 ? 'var(--ribbon)' : 'var(--d-ink)' } }, `#${st.me.rank}`),
          h('h2', null, st.teams ? (st.winner === 'draw' ? t('Ничья') : `${t('Победила команда')} «${st.teams[st.winner].name}»`) : `${t('Твоё место')}: ${st.me.rank}`),
          tugBox(),
          h('div', { class: 'card stack' }, h('div', { class: 'row', style: { justifyContent: 'space-around' } },
            [[st.me.score, t('очков')], [`${f.correct}/${f.total}`, t('верных')], [f.bestStreak, t('лучшая серия')]].map(([v, l]) =>
              h('div', { class: 'stat' }, h('b', null, v), h('span', null, l))))),
          h('div', { class: 'row', style: { justifyContent: 'center' } }, h('a', { class: 'btn primary', href: '#/join' }, t('Новая игра')),
            student ? h('a', { class: 'btn', href: '#/s' }, ic('user'), t('Мой кабинет')) : h('a', { class: 'btn', href: '#/register/student' }, t('Создать аккаунт'))),
          student ? null : h('p', { class: 'small', style: { color: 'var(--d-muted)' } }, t('С аккаунтом очки сохраняются, а ты попадаешь в рейтинг лицея.'))) };
      }
      default: return { el: h('div') };
    }
  }

  const loop = setInterval(() => {
    if (!s || s.phase !== 'question' || !view?.bar) return;
    const now = conn.now();
    if (now < s.opensAt) {
      fill(view.lead, h('div', { style: { color: 'var(--d-sub)' } }, t('Приготовься')), h('div', { class: 'big-mark text', style: { color: 'var(--ribbon)' } }, Math.ceil((s.opensAt - now) / 1000)));
      return;
    }
    if (view.area.classList.contains('hidden')) { fill(view.lead, ); view.area.classList.remove('hidden'); }
    view.bar.style.transform = `scaleX(${Math.max(0, (s.deadline - now) / (s.question.time * 1000))})`;
  }, 100);

  root.cleanup = () => { conn.close(); clearInterval(loop); };
  return root;
}
