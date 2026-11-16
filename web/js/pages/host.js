// Экран ведущего для доски/проектора: лобби с PIN и QR → вопрос → проверка → итоги вопроса → финал.
// Пробел, Enter или → (кликер) — следующий шаг.
import { h, fill, go, icon, ic, ask, modal, sound, confetti, fullscreen, subj } from '../core.js';
import { t } from '../i18n.js';
import { connect } from '../ws.js';
import { Tug } from '../rope.js';
import { questionEl, rich } from '../content.js';
import { MODE_NAMES } from './teacher.js';

const L = 'ABCDEF';

export function optionsEl(q, reveal) {
  const items = q.type === 'choice' ? q.options.map((o, k) => ({ k, text: o.text, image: o.image, cls: `o${k % 6}` }))
    : q.type === 'truefalse' ? [{ k: true, text: t('Верно'), cls: 'o3' }, { k: false, text: t('Неверно'), cls: 'o0' }] : null;
  if (!items) return null;
  const max = reveal?.dist ? Math.max(1, ...reveal.dist) : 1;
  return h('div', { class: 'opts' }, items.map((o, i) => {
    const right = reveal && o.k === reveal.correct;
    return h('div', { class: `opt ${o.cls} ${reveal ? (right ? 'win' : 'dim') : ''}` },
      h('span', { class: 'L' }, q.type === 'choice' ? L[i] : o.k ? '✓' : '✗'),
      h('span', { class: 'rich', html: rich(o.text) }), o.image ? h('img', { src: o.image, alt: '' }) : null,
      reveal?.dist ? [h('span', { class: 'cnt' }, reveal.dist[i]), h('i', { class: 'bar-fill', style: { transform: `scaleX(${reveal.dist[i] / max})` } })] : null);
  }));
}

export const leaderboard = (players, n = 5, from = 0) => h('div', { class: 'board-lb' },
  h('h3', null, `🏆 ${t('Лидеры')}`),
  players.slice(0, n).map((p, i) => h('div', { class: 'lb-row', style: { background: i === 0 ? 'rgba(246,226,26,.15)' : 'transparent' } },
    h('span', { class: 'pos' }, i + 1 + from), h('span', { class: p.team ? `t${p.team}` : '' }, p.name),
    p.streak >= 3 ? h('span', { title: t('Серия') }, `🔥${p.streak}`) : null, h('span', { class: 'sc' }, p.score))));

function timerEl() {
  const C = 2 * Math.PI * 42;
  const circle = h('div', { html: `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" stroke="rgba(255,255,255,.15)" stroke-width="9" fill="none"/><circle class="arc" cx="50" cy="50" r="42" stroke="#f6e21a" stroke-width="9" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="0"/></svg>` });
  const num = h('b');
  const el = h('div', { class: 'timer' }, circle.firstChild, num);
  const arc = el.querySelector('.arc');
  return { el, set(left, total) {
    num.textContent = Math.max(0, Math.ceil(left));
    arc.style.strokeDashoffset = C * (1 - Math.max(0, left) / total);
    el.classList.toggle('low', left <= 5);
  } };
}

function scoreBar(s) {
  const a = h('div', { class: 'bgA' }); const b = h('div', { class: 'bgB' });
  const el = h('div', { class: 'scorebar' }, a, b);
  const update = (st) => {
    a.textContent = `${st.teams.A.name} · ${st.teamScore.A}`; b.textContent = `${st.teamScore.B} · ${st.teams.B.name}`;
    a.style.flexGrow = st.teamScore.A + 50; b.style.flexGrow = st.teamScore.B + 50;
  };
  update(s);
  return { el, update };
}

export function host(id) {
  const bar = h('div', { class: 'bar' });
  const body = h('div', { class: 'body' });
  const leadin = h('div', { class: 'leadin hidden' });
  const root = h('div', { class: 'stage' }, bar, h('div', { class: 'orn' }), body, leadin,
    h('div', { class: 'dev', style: { textAlign: 'center', padding: '8px', opacity: 0.55 } }, 'Developed by Daniyar'));
  let s = null;
  let key = '';
  let view = null;
  let tug = null;
  let seenPlayers = 0;
  let lastSec = -1;

  const cmd = (type, extra) => conn.send({ t: type, ...extra });
  const conn = connect({
    onOpen: (c) => c.send({ t: 'host', id }),
    onStatus: (ok) => { if (!ok) bar.dataset.off = '1'; else delete bar.dataset.off; drawBar(); },
    onMessage: (m) => {
      if (m.t === 'error') {
        fill(body, h('div', { class: 'winner' }, h('h2', null, t('Игра не найдена или уже завершена')), h('a', { class: 'btn yellow', href: '#/t' }, t('В кабинет'))));
        return;
      }
      if (m.t !== 'state') return;
      const prev = s;
      s = m;
      if (s.mode === 'tug' && !tug) { tug = new Tug({ names: [s.teams.A.name, s.teams.B.name] }); tug.set(s.rope, null); }
      if (s.phase === 'lobby' && s.players.length > seenPlayers) sound.pop();
      seenPlayers = s.players.length;
      drawBar();
      const k = `${s.phase}:${s.qi}`;
      if (k !== key) {
        key = k;
        view = BUILD[s.phase](s, prev);
        fill(body, view.el);
      }
      view.update?.(s);
    },
  });

  function drawBar() {
    if (!s) return;
    fill(bar, 
      h('img', { src: '/img/icon-192.png', alt: '' }),
      h('div', null, h('div', { class: 'ttl' }, s.title), h('div', { class: 'small', style: { color: '#9fd0b0' } }, `${t(MODE_NAMES[s.mode])} · ${subj(s.subject).name}`)),
      h('div', { class: 'grow' }),
      bar.dataset.off ? h('span', { class: 'chip', style: { background: 'var(--bad)', color: '#fff' } }, t('нет связи…')) : null,
      s.phase !== 'lobby' ? h('span', { class: 'chip', style: { background: 'rgba(255,255,255,.12)', color: '#fff' } }, `PIN ${s.pin}`) : null,
      h('span', { class: 'chip', style: { background: 'rgba(255,255,255,.12)', color: '#fff' } }, ic('users', { style: { width: '14px' } }), s.players.length),
      h('button', { class: 'btn icon', title: t('Звук'), html: icon(sound.on ? 'vol' : 'mute'), onClick: () => { sound.on = !sound.on; drawBar(); } }),
      h('button', { class: 'btn icon', title: t('Во весь экран'), html: icon('max'), onClick: fullscreen }),
      s.phase !== 'final' && s.phase !== 'lobby' ? h('button', { class: 'btn sm', onClick: async () => { if (await ask(t('Завершить игру сейчас и показать итоги?'))) cmd('finish'); } }, t('Завершить')) : null,
      h('button', { class: 'btn icon', title: t('Выйти в кабинет'), html: icon('logout'), onClick: async () => {
        if (s.phase === 'final' || await ask(t('Выйти? Игра останется доступной, вернуться можно с главной кабинета.'))) go('#/t');
      } }));
  }

  const tugBlock = () => h('div', { style: { maxWidth: '980px', width: '100%', margin: '0 auto', borderRadius: '18px', overflow: 'hidden' } }, tug.el);

  function playerMenu(p) {
    const other = p.team === 'A' ? 'B' : 'A';
    const m = modal({ title: p.name, body: h('div', { class: 'stack' },
      s.teams ? h('button', { class: 'btn', style: { width: '100%' }, onClick: () => { cmd('move', { pid: p.id, team: other }); m.close(); } }, ic('swap'), `${t('Перевести в команду')} «${s.teams[other].name}»`) : null,
      h('button', { class: 'btn danger', style: { width: '100%' }, onClick: () => { cmd('kick', { pid: p.id }); m.close(); } }, ic('x'), t('Удалить из игры'))) });
  }
  const pill = (p) => h('button', { class: `pl ${p.online ? '' : 'off'}`, onClick: () => playerMenu(p) }, p.name);

  const BUILD = {
    lobby(st) {
      const url = `${location.origin}/#/join/${st.pin}`;
      const teamsBox = h('div');
      const start = h('button', { class: 'btn yellow big', onClick: () => cmd('start') });
      const el = h('div', { class: 'stack' }, h('div', { class: 'lobby' },
        h('div', { class: 'qr' }, h('img', { src: `/api/qr?text=${encodeURIComponent(url)}`, alt: 'QR' })),
        h('div', { class: 'stack' },
          h('div', { style: { fontSize: '1.3rem', fontWeight: 800 } }, t('Откройте'), ' ', h('span', { style: { color: 'var(--y)' } }, location.host), ' ', t('и введите PIN:')),
          h('div', { class: 'pin-big' }, st.pin.replace(/(\d{3})(\d{3})/, '$1 $2')),
          teamsBox,
          h('div', { class: 'row' }, st.teams ? h('button', { class: 'btn', onClick: () => cmd('shuffleTeams') }, ic('shuffle'), t('Перемешать команды')) : null, start))),
      tug ? tugBlock() : null);
      return { el, update(x) {
        start.disabled = !x.players.length;
        fill(start, h('span', { html: icon('play'), style: { display: 'contents' } }), `${t('Начать игру')} · ${x.players.length}`);
        if (!x.players.length) return fill(teamsBox, h('div', { class: 'wait-dots', style: { fontSize: '1.2rem', opacity: 0.8 } }, t('Ждём учеников')));
        fill(teamsBox, x.teams
          ? h('div', { class: 'teams-cols' }, ['A', 'B'].map((tm) => {
            const list = x.players.filter((p) => p.team === tm);
            return h('div', { class: `team-col ${tm}` }, h('h3', null, h('span', null, x.teams[tm].name), h('span', null, list.length)), list.map(pill));
          }), x.players.some((p) => !p.team) ? h('div', { style: { gridColumn: '1 / -1' } }, h('span', { class: 'small' }, t('Ещё выбирают команду:')), ' ', x.players.filter((p) => !p.team).map(pill)) : null)
          : h('div', { class: 'team-col' }, x.players.map(pill)));
      } };
    },

    question(st) {
      const q = st.question;
      const timer = timerEl();
      const answered = h('b', { style: { fontFamily: 'var(--display)', fontSize: '1.8rem' } });
      const sb = st.mode === 'duel' ? scoreBar(st) : null;
      const el = h('div', { class: 'stack' },
        h('div', { class: 'row between' },
          h('div', { class: 'row' }, h('span', { class: 'chip', style: { background: 'var(--y)', color: 'var(--g900)', fontSize: '1rem' } }, `${t('Вопрос')} ${st.qi + 1} / ${st.total}`),
            q.double ? h('span', { class: 'chip', style: { background: '#fff', color: 'var(--g900)' } }, `⚡ ×2 ${t('очки')}`) : null),
          h('div', { class: 'row' }, h('div', { style: { textAlign: 'right' } }, answered, h('div', { class: 'small' }, t('ответили'))), timer.el)),
        st.mode === 'duel' ? h('div', { class: `turn bg${st.activeTeam}` }, `${t('Отвечает команда')} «${st.teams[st.activeTeam].name}»`) : null,
        h('div', { class: 'qbox' }, questionEl(q)),
        optionsEl(q) || h('div', { class: 'center', style: { fontSize: '1.4rem', fontWeight: 800 } }, ic('phone', { style: { width: '26px', verticalAlign: 'middle' } }), ' ', t('Введите ответ на телефоне')),
        tug ? tugBlock() : sb?.el,
        h('div', { class: 'row end' }, h('button', { class: 'btn', onClick: () => cmd('next') }, ic('skip'), t('Завершить вопрос'))));
      return { el, timer, update(x) {
        answered.textContent = `${x.answered} / ${x.eligible}`;
        tug?.set(x.rope);
        sb?.update(x);
      } };
    },

    grading(st) {
      const list = h('div', { class: 'grade-list' });
      const el = h('div', { class: 'stack' },
        h('div', { class: 'qbox' }, questionEl(st.question)),
        h('h2', null, t('Оцените ответы')),
        st.accepted?.length ? h('div', null, t('Ожидаемые ответы:'), ' ', h('b', { style: { color: 'var(--y)' } }, st.accepted.join(' / '))) : null,
        list,
        h('div', { class: 'row end' }, h('button', { class: 'btn yellow big', onClick: () => cmd('gradeDone') }, ic('check'), t('Готово — показать результаты'))));
      return { el, update(x) {
        fill(list, ...x.grading.map((g) => h('div', { class: 'grade-item' },
          h('span', { class: 'n' }, `×${g.count}`), h('span', { class: 'grow' }, g.text),
          h('div', { class: 'seg' }, [[1, '✓', 'g1'], [0.5, '½', 'g05'], [0, '✗', 'g0']].map(([v, label, cls]) =>
            h('button', { class: `${cls} ${g.grade === v ? 'on' : ''}`, onClick: () => cmd('grade', { key: g.key, grade: v }) }, label))))));
      } };
    },

    reveal(st) {
      const q = st.question;
      const r = st.reveal;
      sound.good();
      if (tug) tug.set(st.rope);
      const last = st.qi + 1 >= st.total || st.winner;
      const el = h('div', { class: 'stack' },
        h('div', { class: 'row between' }, h('span', { class: 'chip', style: { background: 'var(--y)', color: 'var(--g900)', fontSize: '1rem' } }, `${t('Вопрос')} ${st.qi + 1} / ${st.total}`),
          h('div', { style: { fontFamily: 'var(--display)', fontSize: '1.3rem' } }, `✓ ${r.right} / ${r.answered}`)),
        st.winner && st.mode === 'tug' ? h('div', { class: 'winner' }, h('h1', null, `🏆 ${st.teams[st.winner].name}!`), h('div', null, t('Канат перетянут до конца!'))) : null,
        h('div', { style: { display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(220px, 300px)', gap: '16px', alignItems: 'start' } },
          h('div', { class: 'stack' },
            h('div', { class: 'qbox' }, questionEl(q)),
            optionsEl(q, r) || h('div', { class: 'qbox', style: { background: 'var(--y)' } }, h('div', { class: 'small' }, t('Правильный ответ')), h('div', { class: 'rich', style: { fontSize: '2rem', fontWeight: 900 }, html: rich(r.correctText) })),
            r.explain ? h('div', { class: 'rich', style: { fontSize: '1.15rem', opacity: 0.9 }, html: `💡 ${rich(r.explain)}` }) : null),
          leaderboard(st.players)),
        tug ? tugBlock() : st.mode === 'duel' ? scoreBar(st).el : null,
        h('div', { class: 'row end' }, h('button', { class: 'btn yellow big', onClick: () => cmd('next') }, last ? t('Итоги') : t('Дальше'), ic('right'))));
      return { el };
    },

    final(st) {
      const sm = st.summary;
      sound.win();
      confetti();
      const teams = sm.teams;
      let top;
      if (teams) {
        if (tug) setTimeout(() => tug.win(sm.winner), 400);
        top = h('div', { class: 'stack' },
          h('div', { class: 'winner' }, h('div', { style: { fontSize: '1.2rem' } }, t('Итог игры')),
            h('h1', null, sm.winner === 'draw' ? t('Ничья!') : `🏆 ${teams[sm.winner].name}`)),
          tug ? tugBlock() : null,
          h('div', { class: 'teams-cols' }, ['A', 'B'].map((tm) => h('div', { class: `team-col ${tm}`, style: { minHeight: 0 } },
            h('h3', null, h('span', null, teams[tm].name), h('span', null, sm.winner === tm ? '🏆' : '')),
            h('div', { class: 'row', style: { gap: '24px' } },
              [[st.mode === 'tug' ? t('очков') : t('очков команды'), teams[tm].score], [t('верных'), teams[tm].correct], [t('ср. время'), teams[tm].avgTime ? `${teams[tm].avgTime} ${t('с')}` : '—'], [t('игроков'), teams[tm].players]]
                .map(([label, v]) => h('div', { class: 'stat' }, h('b', { style: { color: '#fff' } }, v), h('span', { style: { color: '#cfe6d6' } }, label))))))),
          leaderboard(st.players, 5));
      } else {
        const [p1, p2, p3] = sm.players;
        const col = (p, n) => (p ? h('div', { class: `p${n}` }, h('div', { style: { fontWeight: 900, fontSize: '1.2rem', marginBottom: '6px' } }, p.name), h('div', { style: { marginBottom: '6px' } }, p.score), h('div', { class: 'col' }, n)) : h('div'));
        top = h('div', { class: 'stack' }, h('div', { class: 'winner' }, h('h1', null, t('Итоги'))),
          h('div', { class: 'podium' }, col(p2, 2), col(p1, 1), col(p3, 3)), sm.players.length > 3 ? leaderboard(st.players.slice(3), 7, 3) : null);
      }
      const el = h('div', { class: 'stack' }, top,
        h('div', { class: 'row', style: { justifyContent: 'center' } },
          h('a', { class: 'btn yellow big', href: `#/t/report/${st.id}` }, ic('chart'), t('Подробный отчёт')),
          h('a', { class: 'btn big', href: '#/t' }, t('В кабинет'))));
      return { el };
    },
  };

  const loop = setInterval(() => {
    if (!s || s.phase !== 'question' || !view?.timer) { leadin.classList.add('hidden'); return; }
    const now = conn.now();
    if (now < s.opensAt) {
      const n = Math.ceil((s.opensAt - now) / 1000);
      leadin.classList.remove('hidden');
      if (leadin.dataset.n !== String(n)) {
        leadin.dataset.n = n;
        sound.tick();
        fill(leadin, h('div', null, h('div', { style: { fontSize: '1.6rem', fontWeight: 800 } }, `${t('Вопрос')} ${s.qi + 1}`), h('b', null, n)));
      }
      view.timer.set(s.question.time, s.question.time);
      return;
    }
    if (!leadin.classList.contains('hidden')) { leadin.classList.add('hidden'); sound.go(); }
    const left = (s.deadline - now) / 1000;
    view.timer.set(left, s.question.time);
    const sec = Math.ceil(left);
    if (sec <= 5 && sec > 0 && sec !== lastSec) sound.tick();
    lastSec = sec;
  }, 150);

  const onKey = (e) => {
    if (!s || !['Space', 'Enter', 'ArrowRight', 'PageDown'].includes(e.code) || e.target.closest('input,textarea,button,select')) return;
    e.preventDefault();
    if (s.phase === 'lobby') cmd('start');
    else if (s.phase === 'grading') cmd('gradeDone');
    else if (s.phase !== 'final') cmd('next');
  };
  document.addEventListener('keydown', onKey);
  root.cleanup = () => { conn.close(); clearInterval(loop); document.removeEventListener('keydown', onKey); };
  return root;
}
