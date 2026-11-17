// «Канат на доске»: одна интерактивная доска, две команды по краям, у каждой свои вопросы и клавиатура.
import { h, fill, api, go, ic, icon, sound, confetti, fullscreen, toast, toastErr } from '../core.js';
import { t } from '../i18n.js';
import { teacherPage } from '../app.js';
import { Tug } from '../rope.js';
import { richEl, rich } from '../content.js';
import { makeProblem, LEVELS } from '../gen.js';

const rnd = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(0, i); [a[i], a[j]] = [a[j], a[i]]; } return a; };

// ---------- настройка ----------
export async function boardSetup() {
  const mine = await api('/api/quizzes');
  const st = { source: 'gen', level: 7, quizId: mine[0]?.id || 0, teamNames: [t('1-команда'), t('2-команда')], duration: 90, margin: 8 };
  const srcBox = h('div', { class: 'stack' });
  const seg = (key, values, fmt = (v) => v, onChange = () => {}) => {
    const el = h('div', { class: 'seg' }, values.map((v) => h('button', { type: 'button', class: st[key] === v ? 'on' : '',
      onClick: (e) => { st[key] = v; el.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); onChange(); } }, fmt(v))));
    return el;
  };
  const line = (label, ctl) => h('div', { class: 'row between' }, h('b', null, t(label)), ctl);
  const drawSrc = () => fill(srcBox, st.source === 'gen'
    ? h('div', { class: 'stack' }, line('Уровень', seg('level', Object.keys(LEVELS).map(Number), (v) => t(LEVELS[v]), () => drawSrc())),
      h('p', { class: 'small muted' }, t({ 7: 'Отрицательные числа, степени, проценты, уравнения.', 89: 'Квадраты, корни, теорема Виета, дискриминант, проценты.', 1011: 'Логарифмы, производные, прогрессии, факториалы, тригонометрия, интегралы.' }[st.level])))
    : mine.length ? h('label', { class: 'field' }, h('span', null, t('Квиз')), h('select', { class: 'input', onChange: (e) => { st.quizId = Number(e.target.value); } },
      mine.map((q) => h('option', { value: q.id, selected: q.id === st.quizId }, `${q.title} · ${q.count}`))),
      h('div', { class: 'small muted', style: { marginTop: '4px' } }, t('Подойдут вопросы с выбором ответа, «верно/неверно» и числовые.')))
      : h('p', { class: 'muted' }, t('У вас пока нет квизов — используйте генератор примеров.')));
  drawSrc();
  const start = async () => {
    let cfg = { teamNames: st.teamNames.map((n, i) => n.trim() || `${i + 1}`), duration: st.duration, margin: st.margin };
    if (st.source === 'gen') cfg = { ...cfg, title: `${t('Устный счёт')} · ${t(LEVELS[st.level])}`, subject: 'mat', gen: { level: st.level } };
    else {
      try {
        const q = await api(`/api/quizzes/${st.quizId}`);
        const questions = q.questions.filter((x) => ['choice', 'truefalse', 'number'].includes(x.type));
        if (!questions.length) return toastErr(new Error(t('В этом квизе нет подходящих вопросов')));
        cfg = { ...cfg, title: q.title, subject: q.subject, quizId: q.id, questions };
      } catch (e) { return toastErr(e); }
    }
    sessionStorage.setItem('tq_board', JSON.stringify(cfg));
    go('#/board');
  };
  const demo = new Tug({ names: [st.teamNames[0], st.teamNames[1]] });
  const srcSeg = h('div', { class: 'seg' }, [['gen', 'Генератор'], ['quiz', 'Мой квиз'], ['ai', 'Своя тема с ИИ']].map(([k, l]) => h('button', { type: 'button', class: st.source === k ? 'on' : '',
    onClick: (e) => { if (k === 'ai') return go('#/t/ai?board'); st.source = k; srcSeg.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === e.currentTarget)); drawSrc(); } }, t(l))));
  return teacherPage('board',
    h('div', { class: 'page-head' }, h('div', null, h('h1', null, t('Канат на доске')),
      h('p', { class: 'muted', style: { margin: '6px 0 0' } }, t('Арқан тартыс без телефонов: два ученика у интерактивной доски, у каждого свои примеры. Верный ответ — рывок каната на свою сторону.'))),
      h('button', { class: 'btn primary big', onClick: start }, ic('play'), t('Начать'))),
    h('div', { class: 'editor', style: { gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)' } },
      h('div', { class: 'card stack' }, h('h3', null, t('Вопросы')), srcSeg, srcBox),
      h('div', { class: 'card stack' }, h('h3', null, t('Команды и правила')),
        h('div', { class: 'row' }, [0, 1].map((i) => h('label', { class: 'field grow' }, h('span', { style: { color: i ? 'var(--blue)' : 'var(--red)' } }, i ? t('Справа') : t('Слева')),
          h('input', { class: 'input', value: st.teamNames[i], maxLength: 20, onInput: (e) => { st.teamNames[i] = e.target.value; demo.setNames(st.teamNames); } })))),
        line('Время', seg('duration', [60, 90, 120, 180], (v) => `${v} ${t('с')}`)),
        line('Для победы нужен перевес', seg('margin', [5, 8, 10, 15], (v) => `${v}`)),
        h('div', { style: { borderRadius: '14px', overflow: 'hidden' } }, demo.el))));
}

// ---------- игра ----------
export function boardPlay() {
  let cfg;
  try { cfg = JSON.parse(sessionStorage.getItem('tq_board')); } catch { cfg = null; }
  if (!cfg) { setTimeout(() => go('#/t/board')); return h('div'); }
  const step = 100 / cfg.margin;
  const tug = new Tug({ labels: false });
  const clock = h('div', { class: 'clock' });
  const score = h('div', { class: 'score' });
  const overlay = h('div', { class: 'leadin hidden' });
  let state = 'ready';
  let pos = 0;
  let endsAt = 0;
  let startedAt = 0;
  const ropeHist = [0];
  const sides = {};

  const nextQuestion = (side) => {
    if (cfg.gen) return makeProblem(cfg.gen);
    if (!side.queue.length) side.queue = shuffle(cfg.questions.map((_, i) => i));
    return cfg.questions[side.queue.pop()];
  };

  function makeSide(team) {
    const side = { team, queue: [], input: '', correct: 0, wrong: 0, times: [], locked: false, q: null, since: 0 };
    side.panel = h('div', { class: `side-p ${team}` });
    side.load = () => { side.q = nextQuestion(side); side.input = ''; side.since = Date.now(); side.draw(); };
    side.answer = (value) => {
      if (state !== 'play' || side.locked) return;
      const q = side.q;
      const ok = q.type === 'number' ? q.answers.some((a) => Math.abs(a - Number(String(value).replace(',', '.'))) < 1e-6) && String(value).trim() !== ''
        : value === q.correct;
      if (ok) {
        side.correct++;
        side.times.push((Date.now() - side.since) / 1000);
        pos = Math.max(-100, Math.min(100, pos + (team === 'A' ? -step : step)));
        ropeHist.push(Math.round(pos));
        tug.set(pos, team);
        sound.pull();
        flash(side, 'good');
        drawScore();
        if (Math.abs(pos) >= 99.9) return finish(team);
        side.load();
      } else {
        side.wrong++;
        sound.bad();
        flash(side, 'bad');
        side.locked = true;
        side.input = '';
        if (q.type !== 'number') side.load(); else side.draw();
        setTimeout(() => { side.locked = false; side.draw(); }, 1200);
      }
    };
    side.draw = () => {
      const q = side.q;
      const name = cfg.teamNames[team === 'A' ? 0 : 1];
      const head = h('div', { class: 'tname' }, h('span', null, name), h('span', null, `✓ ${side.correct}`));
      if (!q) return fill(side.panel, head, h('div', { class: 'bq' }, t('Нажмите «Старт»')));
      let ctl;
      if (q.type === 'number') {
        const key = (k) => h('button', { disabled: side.locked, onClick: () => {
          if (k === '⌫') side.input = side.input.slice(0, -1);
          else if (k === '±') side.input = side.input.startsWith('-') ? side.input.slice(1) : `-${side.input}`;
          else if (k === 'OK') return side.answer(side.input);
          else if (side.input.length < 8) side.input += k;
          sound.tick();
          side.draw();
        }, class: k === 'OK' ? 'ok' : k === '⌫' ? 'del' : '' }, k);
        ctl = [h('div', { class: 'disp' }, side.input || ' '), h('div', { class: 'pad' }, ['7', '8', '9', '4', '5', '6', '1', '2', '3', '±', '0', ',', '⌫', 'OK'].map(key))];
        ctl[1].lastChild.style.gridColumn = 'span 2';
      } else if (q.type === 'truefalse') {
        ctl = h('div', { class: 'bopts' }, [[true, 'Верно'], [false, 'Неверно']].map(([v, l]) => h('button', { disabled: side.locked, onClick: () => side.answer(v) }, t(l))));
      } else {
        ctl = h('div', { class: 'bopts' }, q.options.map((o, i) => h('button', { disabled: side.locked, onClick: () => side.answer(i) },
          h('span', { html: rich(o.text) || 'ABCDEF'[i] }), o.image ? h('img', { src: o.image, alt: '', style: { maxHeight: '70px', display: 'block', margin: '4px auto 0' } }) : null)));
      }
      fill(side.panel, head, h('div', { class: 'bq' }, richEl(q.text)), ctl);
    };
    side.draw();
    return side;
  }

  const flash = (side, cls) => {
    side.panel.classList.remove('good', 'bad');
    void side.panel.offsetWidth;
    side.panel.classList.add(cls);
    setTimeout(() => side.panel.classList.remove(cls), 450);
  };
  const drawScore = () => fill(score, h('span', { style: { color: 'var(--red-d)' } }, sides.A.correct), ':', h('span', { style: { color: 'var(--blue-d)' } }, sides.B.correct));
  sides.A = makeSide('A');
  sides.B = makeSide('B');
  drawScore();

  const startBtn = h('button', { class: 'btn primary big', onClick: () => begin() }, ic('play'), t('Старт'));
  const midBtns = h('div', { class: 'row', style: { justifyContent: 'center' } }, startBtn,
    h('button', { class: 'btn icon', title: t('Во весь экран'), html: icon('max'), onClick: fullscreen }),
    h('button', { class: 'btn icon', title: t('Выйти'), html: icon('logout'), onClick: () => go('#/t/board') }));
  const mid = h('div', { class: 'mid' },
    h('img', { src: '/img/icon-192.png', alt: '', style: { width: '56px' } }),
    h('h2', null, `Арқан тартыс · ${cfg.title}`), clock, h('div', { style: { width: '100%', borderRadius: '16px', overflow: 'hidden' } }, tug.el), score, midBtns,
    h('div', { class: 'dev' }, 'Developed by Daniyar'));
  const root = h('div', { class: 'bt' }, sides.A.panel, mid, sides.B.panel, overlay);
  const fmt = (sec) => { const s = Math.ceil(sec); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  clock.textContent = fmt(cfg.duration);

  function begin() {
    state = 'countdown';
    pos = 0;
    ropeHist.splice(0, ropeHist.length, 0);
    tug.reset();
    for (const s of Object.values(sides)) Object.assign(s, { correct: 0, wrong: 0, times: [], queue: [], locked: false });
    drawScore();
    startBtn.classList.add('hidden');
    let n = 3;
    const tick = () => {
      if (n === 0) {
        overlay.classList.add('hidden');
        state = 'play';
        startedAt = Date.now();
        endsAt = startedAt + cfg.duration * 1000;
        sound.go();
        sides.A.load(); sides.B.load();
        return;
      }
      overlay.classList.remove('hidden');
      fill(overlay, h('div', null, h('div', { style: { fontSize: '24px', fontWeight: 500, color: 'var(--d-sub)' } }, 'Арқан тартыс'), h('b', null, n)));
      sound.count();
      n--;
      setTimeout(tick, 900);
    };
    tick();
  }

  async function finish(byRope) {
    if (state !== 'play') return;
    state = 'end';
    const winner = byRope || (pos < 0 ? 'A' : pos > 0 ? 'B' : sides.A.correct === sides.B.correct ? 'draw' : sides.A.correct > sides.B.correct ? 'A' : 'B');
    for (const s of Object.values(sides)) { s.q = null; fill(s.panel, h('div', { class: 'tname' }, cfg.teamNames[s.team === 'A' ? 0 : 1]), stats(s)); }
    tug.win(winner);
    if (winner === 'draw') sound.draw(); else sound.win();
    if (winner !== 'draw') confetti([winner === 'A' ? '#e5484d' : '#3d63dd', '#f6e21a', '#fff']);
    overlay.classList.remove('hidden');
    fill(overlay, h('div', { class: 'winner' },
      winner === 'draw' ? null : h('span', { class: 'ribbon' }),
      h('h1', null, winner === 'draw' ? t('Ничья') : cfg.teamNames[winner === 'A' ? 0 : 1]),
      h('div', { style: { fontSize: '24px', color: 'var(--d-sub)' } }, `${sides.A.correct} : ${sides.B.correct}`),
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '20px' } },
        h('button', { class: 'btn primary big', onClick: () => { overlay.classList.add('hidden'); begin(); } }, t('Ещё раз')),
        h('button', { class: 'btn big', onClick: () => overlay.classList.add('hidden') }, t('Посмотреть канат')))));
    startBtn.classList.remove('hidden');
    const team = (s, i) => {
      const avg = s.times.length ? Math.round((s.times.reduce((a, b) => a + b, 0) / s.times.length) * 10) / 10 : null;
      return { name: cfg.teamNames[i], score: s.correct, correct: s.correct, wrong: s.wrong, answered: s.correct + s.wrong, avgTime: avg, players: 1 };
    };
    try {
      await api('/api/games/board', { method: 'POST', body: { summary: {
        title: cfg.title, subject: cfg.subject || 'mat', quizId: cfg.quizId, started: startedAt, finished: Date.now(),
        duration: Math.round((Date.now() - startedAt) / 1000), winner, rope: ropeHist, margin: cfg.margin,
        teams: { A: team(sides.A, 0), B: team(sides.B, 1) }, players: [], questions: [],
      } } });
      toast(t('Результат сохранён в историю'));
    } catch (e) { toastErr(e); }
  }
  const stats = (s) => h('div', { class: 'bq', style: { flexDirection: 'column', display: 'flex', gap: '6px' } },
    h('div', null, `✓ ${s.correct}`), h('div', { style: { fontSize: '20px', color: 'var(--muted)' } }, `✗ ${s.wrong}`),
    s.times.length ? h('div', { style: { fontSize: '18px', color: 'var(--muted)' } }, `${(s.times.reduce((a, b) => a + b, 0) / s.times.length).toFixed(1)} ${t('с')}`) : null);

  const loop = setInterval(() => {
    if (state !== 'play') return;
    const left = (endsAt - Date.now()) / 1000;
    clock.textContent = fmt(Math.max(0, left));
    clock.style.color = left <= 10 ? 'var(--red-d)' : '';
    if (left <= 0) finish();
  }, 200);
  root.cleanup = () => clearInterval(loop);
  return root;
}

