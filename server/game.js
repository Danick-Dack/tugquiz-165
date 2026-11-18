// Живые игры по PIN: лобби → вопрос → (проверка учителем) → итоги вопроса → … → финал.
// Ведущий может досрочно закрыть вопрос, добавить 5 секунд, вернуться к прошлым итогам, завершить игру и сыграть ещё раз.
// Режимы: tug — «Арқан тартыс» (2 команды, канат), duel — команды отвечают по очереди, solo — каждый сам за себя.
import { WebSocketServer } from 'ws';
import { randomInt, randomBytes } from 'node:crypto';
import * as db from './db.js';
import { checkName } from '../web/js/names.js';
import { gradeAnswer, normText, points, pull, ropeStep } from './quizlib.js';
import { clientIp, limiter } from './security.js';

const LEAD_IN = 3000; // «Приготовьтесь» перед открытием ответов, мс
const EXTRA_MAX = 120e3; // сколько всего можно добавить к одному вопросу кнопкой «+5 с», мс
const L = 'ABCDEF';
const TEAMS = ['A', 'B'];
const byPin = new Map();
export const byId = new Map();

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) { const j = randomInt(i + 1); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
};
const newPin = () => { let p; do p = String(randomInt(100000, 999999)); while (byPin.has(p)); return p; };
const send = (ws, msg) => { if (ws.readyState === 1) ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg)); };
const round1 = (n) => Math.round(n * 10) / 10;

// Порядок правых частей «соответствия» на экране: перемешан, но не совпадает с правильным.
const matchOrder = (n) => {
  const idx = [...Array(n).keys()];
  if (n < 2) return idx;
  do shuffle(idx); while (idx.every((v, i) => v === i));
  return idx;
};
const letterOf = (q, orig) => L[(q.order || []).indexOf(orig)] ?? L[orig] ?? '?';

export function answerText(q, value) {
  if (value === null || value === undefined || value === '') return '—';
  if (q.type === 'match') return Array.isArray(value) ? value.map((v, i) => `${i + 1}–${v >= 0 ? letterOf(q, v) : '?'}`).join(', ') : '—';
  if (q.type === 'choice') return q.options[value]?.text ?? '—';
  if (q.type === 'truefalse') return value === true || value === 'true' ? 'true' : 'false';
  return String(value);
}
export const correctText = (q) =>
  q.type === 'match' ? q.pairs.map((p, i) => `- ${i + 1}–${letterOf(q, i)}: ${p.left} → ${p.right}`).join('\n')
    : q.type === 'choice' ? q.options[q.correct].text
    : q.type === 'truefalse' ? String(q.correct)
      : q.answers.join(' / ') || '—';
const publicQuestion = (q) => ({
  type: q.type, text: q.text, image: q.image, video: q.video, time: q.time, double: q.double,
  options: q.type === 'choice' ? q.options : undefined,
  ...(q.type === 'match' ? { left: q.pairs.map((p) => p.left), right: q.order.map((j) => q.pairs[j].right) } : {}),
});

export class Game {
  constructor({ id, hostId, quiz, mode, opts = {} }) {
    Object.assign(this, { id, hostId, mode, pin: newPin(), title: quiz.title, subject: quiz.subject, quizId: quiz.id, quiz, rawOpts: opts });
    let qs = quiz.questions.map((q) => ({ ...q }));
    if (opts.shuffle) shuffle(qs);
    if (opts.limit > 0) qs = qs.slice(0, opts.limit);
    const scale = Math.min(3, Math.max(0.5, Number(opts.timeScale) || 1));
    this.questions = qs.map((q) => ({ ...q, time: Math.min(300, Math.max(5, Math.round(q.time * scale))),
      ...(q.type === 'match' ? { order: matchOrder(q.pairs.length) } : {}) }));
    this.opts = {
      teamNames: [String(opts.teamNames?.[0] || 'Красные').slice(0, 20), String(opts.teamNames?.[1] || 'Синие').slice(0, 20)],
      autoTeams: Boolean(opts.autoTeams),
      showOnPhone: opts.showOnPhone !== false,
      manualOpen: Boolean(opts.manualOpen),
    };
    this.players = new Map();
    this.hosts = new Set();
    this.phase = 'lobby';
    this.qi = -1;
    this.maxQi = -1; // самый дальний заданный вопрос; qi < maxQi — ведущий листает прошлые итоги
    this.answers = [];
    this.rope = 0;
    this.ropeHist = [0];
    this.teamScore = { A: 0, B: 0 };
    this.step = ropeStep(this.questions.length);
    this.created = Date.now();
    byPin.set(this.pin, this);
    byId.set(id, this);
  }

  get team() { return this.mode !== 'solo'; }
  get q() { return this.questions[this.qi]; }
  /** Сколько секунд даётся на текущий вопрос с учётом «+5 с». */
  get limit() { return (this.deadline - this.opensAt) / 1000; }
  list() { return [...this.players.values()]; }
  teamSize(t) { return this.list().filter((p) => p.team === t).length; }
  eligible(p) { return this.mode !== 'duel' || p.team === this.activeTeam; }
  smallerTeam() { return this.teamSize('A') <= this.teamSize('B') ? 'A' : 'B'; }

  // ---------- игроки ----------
  join(ws, { name, token, user }) {
    let p = token && this.list().find((x) => x.token === token);
    if (!p && user) p = this.list().find((x) => x.userId === user.id);
    if (!p) {
      name = String(user?.name || name || '').replace(/\s+/g, ' ').trim().slice(0, 24);
      if (name.length < 2) return send(ws, { t: 'error', code: 'name' });
      if (!user) { const c = checkName(name); if (!c.ok) return send(ws, { t: 'error', code: 'badname' }); name = c.name; }
      if (this.players.size >= 300) return send(ws, { t: 'error', code: 'full' });
      const taken = new Set(this.list().map((x) => x.name.toLowerCase()));
      let unique = name;
      for (let i = 2; taken.has(unique.toLowerCase()); i++) unique = `${name} ${i}`;
      p = {
        id: randomBytes(6).toString('hex'), token: randomBytes(16).toString('hex'), name: unique, userId: user?.id || null,
        team: this.team && (this.opts.autoTeams || this.phase !== 'lobby') ? this.smallerTeam() : null,
        score: 0, streak: 0, bestStreak: 0, correct: 0, answered: 0, timeSum: 0, socks: new Set(),
      };
      this.players.set(p.id, p);
    }
    p.socks.add(ws);
    ws.player = p;
    ws.game = this;
    send(ws, { t: 'joined', token: p.token, pin: this.pin });
    this.broadcast();
  }

  leave(ws) {
    if (ws.player) { ws.player.socks.delete(ws); this.broadcast(); }
    this.hosts.delete(ws);
  }

  onPlayer(p, m) {
    if (m.t === 'team' && this.team && this.phase === 'lobby' && !this.opts.autoTeams && TEAMS.includes(m.team)) {
      p.team = m.team;
      this.broadcast();
    } else if (m.t === 'answer') this.answer(p, m.value);
  }

  onHost(m) {
    const p = this.players.get(m.pid);
    switch (m.t) {
      case 'start': if (this.phase === 'lobby' && this.players.size) this.start(); break;
      case 'next':
        if (this.phase === 'reveal') {
          if (this.qi < this.maxQi) { this.qi++; this.broadcast(); } else if (this.winner) this.finish(); else this.nextQuestion();
        } else if (this.phase === 'question') this.endQuestion();
        break;
      case 'prev': if (this.phase === 'reveal' && this.qi > 0) { this.qi--; this.broadcast(); } break;
      case 'addTime':
        if (this.phase === 'question' && this.deadline - this.opensAt - this.q.time * 1000 < EXTRA_MAX) {
          this.deadline += 5000;
          clearTimeout(this.timer);
          this.timer = setTimeout(() => this.endQuestion(), this.deadline - Date.now() + 300);
          this.broadcast();
        }
        break;
      case 'again': if (this.phase === 'final' && !this.next) this.again(); break;
      case 'grade': this.setGrade(m.key, m.grade); break;
      case 'gradeDone': if (this.phase === 'grading') this.applyGrading(); break;
      case 'kick':
        if (p) {
          for (const ws of p.socks) { send(ws, { t: 'kicked' }); ws.close(); }
          this.players.delete(p.id);
          this.broadcast();
        }
        break;
      case 'move': if (p && this.team && TEAMS.includes(m.team)) { p.team = m.team; this.broadcast(); } break;
      case 'shuffleTeams':
        if (this.team && this.phase === 'lobby') {
          shuffle(this.list()).forEach((x, i) => { x.team = TEAMS[i % 2]; });
          this.broadcast();
        }
        break;
      case 'finish': if (this.phase !== 'final') this.finish(); break;
    }
  }

  // ---------- ход игры ----------
  start() {
    if (this.team) for (const p of this.list()) if (!p.team) p.team = this.smallerTeam();
    this.startedAt = Date.now();
    this.nextQuestion();
  }

  nextQuestion() {
    this.qi = this.maxQi + 1;
    if (this.qi >= this.questions.length) { this.qi = this.maxQi; return this.finish(); }
    this.maxQi = this.qi;
    this.phase = 'question';
    this.activeTeam = this.mode === 'duel' ? TEAMS[this.qi % 2] : null;
    this.opensAt = Date.now() + LEAD_IN;
    this.deadline = this.opensAt + this.q.time * 1000;
    this.answers[this.qi] = {};
    this.sizes = { A: this.teamSize('A'), B: this.teamSize('B') };
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.endQuestion(), this.deadline - Date.now() + 300);
    this.broadcast();
  }

  answer(p, value) {
    const now = Date.now();
    const box = this.answers[this.qi];
    if (this.phase !== 'question' || now < this.opensAt - 300 || now > this.deadline + 800 || box[p.id] || !this.eligible(p)) return;
    if (typeof value === 'string') value = value.slice(0, 200);
    const q = this.q;
    if (q.type === 'match') {
      // Телефон присылает позиции правых частей на экране — переводим в исходные номера пар.
      if (!Array.isArray(value)) return;
      value = q.pairs.map((_, i) => { const pos = Number(value[i]); return Number.isInteger(pos) && q.order[pos] !== undefined ? q.order[pos] : -1; });
    } else if (typeof value === 'object' && value !== null) return;
    const auto = gradeAnswer(q, value);
    const rec = { value, elapsed: Math.max(0, (now - this.opensAt) / 1000), auto, grade: q.type === 'open' && this.opts.manualOpen ? null : auto, points: 0 };
    box[p.id] = rec;
    p.answered++;
    p.timeSum += rec.elapsed;
    if (rec.grade !== null) this.score(p, rec);
    const waiting = this.list().filter((x) => this.eligible(x) && x.socks.size && !box[x.id]).length;
    if (!waiting) {
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.endQuestion(), 600);
    }
    // На каждый ответ полное состояние получают ведущий и сам ученик, остальным — только канат и счётчик.
    this.sendHosts();
    this.sendPlayer(p);
    const lite = JSON.stringify({ t: 'tick', rope: this.rope, teamScore: this.roundScores(), answered: Object.keys(box).length });
    for (const x of this.list()) if (x !== p) for (const ws of x.socks) send(ws, lite);
  }

  score(p, rec) {
    const q = this.q;
    p.streak = rec.grade === 1 ? p.streak + 1 : 0;
    p.bestStreak = Math.max(p.bestStreak, p.streak);
    p.correct += rec.grade;
    rec.points = points({ grade: rec.grade, elapsed: rec.elapsed, limit: this.limit, streak: p.streak, double: q.double });
    p.score += rec.points;
    if (this.mode === 'tug' && p.team) {
      const d = pull({ grade: rec.grade, elapsed: rec.elapsed, limit: this.limit, teamSize: this.sizes[p.team], step: this.step });
      this.rope = Math.max(-100, Math.min(100, this.rope + (p.team === 'A' ? -d : d)));
    }
    if (p.team) this.teamScore[p.team] += this.mode === 'duel' ? rec.points / Math.max(1, this.sizes[p.team]) : rec.points;
  }

  endQuestion() {
    if (this.phase !== 'question') return;
    clearTimeout(this.timer);
    const box = this.answers[this.qi];
    for (const p of this.list()) if (this.eligible(p) && !box[p.id]) p.streak = 0;
    this.phase = Object.values(box).some((r) => r.grade === null) ? 'grading' : 'reveal';
    if (this.phase === 'reveal') this.afterReveal();
    this.broadcast();
  }

  setGrade(key, grade) {
    if (this.phase !== 'grading' || ![0, 0.5, 1].includes(grade)) return;
    for (const r of Object.values(this.answers[this.qi])) if (normText(r.value) === key) r.manual = grade;
    this.sendHosts();
  }

  applyGrading() {
    const box = this.answers[this.qi];
    const pending = Object.entries(box).filter(([, r]) => r.grade === null).sort((a, b) => a[1].elapsed - b[1].elapsed);
    for (const [pid, r] of pending) {
      r.grade = r.manual ?? r.auto ?? 0;
      const p = this.players.get(pid);
      if (p) this.score(p, r);
    }
    this.phase = 'reveal';
    this.afterReveal();
    this.broadcast();
  }

  afterReveal() {
    this.ropeHist.push(round1(this.rope));
    if (this.mode === 'tug' && Math.abs(this.rope) >= 100) this.winner = this.rope < 0 ? 'A' : 'B';
  }

  finish() {
    clearTimeout(this.timer);
    this.phase = 'final';
    if (this.mode === 'tug') {
      this.winner = Math.abs(this.rope) >= 0.5 ? (this.rope < 0 ? 'A' : 'B') : this.byScore();
    } else if (this.mode === 'duel') this.winner = this.byScore();
    this.summary = this.buildSummary();
    try { saveGame(this); } catch (e) { console.error('Не удалось сохранить игру', e); }
    this.broadcast();
  }

  /** «Сыграть ещё раз»: новая игра с тем же квизом и настройками, ученики и ведущий переходят в её лобби сами. */
  again() {
    const g = createGame({ hostId: this.hostId, quiz: this.quiz, mode: this.mode, opts: this.rawOpts });
    this.next = g.id;
    for (const p of this.list()) {
      for (const ws of [...p.socks]) g.join(ws, { name: p.name, user: p.userId ? { id: p.userId, name: p.name } : null });
      const moved = g.list().find((x) => x.name === p.name || (p.userId && x.userId === p.userId));
      if (moved && g.team && p.team) moved.team = p.team;
      p.socks.clear();
    }
    g.broadcast();
    for (const ws of this.hosts) send(ws, { t: 'moved', id: g.id });
    this.hosts.clear();
  }

  byScore() {
    const { A, B } = this.teamScore;
    return Math.abs(A - B) < 1 ? 'draw' : A > B ? 'A' : 'B';
  }

  // ---------- состояние для клиентов ----------
  ranked() { return this.list().sort((a, b) => b.score - a.score); }
  roundScores() { return { A: Math.round(this.teamScore.A), B: Math.round(this.teamScore.B) }; }

  base() {
    return {
      t: 'state', now: Date.now(), id: this.id, pin: this.pin, mode: this.mode, title: this.title, subject: this.subject,
      phase: this.phase, qi: this.qi, total: this.questions.length, opts: this.opts, rope: this.rope,
      teamScore: this.roundScores(), activeTeam: this.activeTeam, opensAt: this.opensAt, deadline: this.deadline,
      winner: this.winner || null, review: this.qi < this.maxQi,
      teams: this.team ? Object.fromEntries(TEAMS.map((t, i) => [t, { name: this.opts.teamNames[i], size: this.teamSize(t) }])) : null,
    };
  }

  revealInfo() {
    const q = this.q;
    const box = Object.values(this.answers[this.qi] || {});
    const dist = q.type === 'choice' ? q.options.map((_, i) => box.filter((r) => Number(r.value) === i).length)
      : q.type === 'truefalse' ? [true, false].map((v) => box.filter((r) => (r.value === true || r.value === 'true') === v).length)
        : null;
    return { correct: q.type === 'choice' || q.type === 'truefalse' ? q.correct : null, correctText: correctText(q), explain: q.explain, dist,
      right: box.filter((r) => r.grade === 1).length, answered: box.length };
  }

  hostState() {
    const s = this.base();
    const box = this.answers[this.qi] || {};
    s.players = this.ranked().map((p) => ({
      id: p.id, name: p.name, team: p.team, score: p.score, streak: p.streak, online: p.socks.size > 0, answered: Boolean(box[p.id]),
      last: this.phase === 'reveal' && box[p.id] ? { grade: box[p.id].grade, points: box[p.id].points, elapsed: round1(box[p.id].elapsed) } : null,
    }));
    if (this.qi >= 0 && this.phase !== 'final') {
      s.question = this.q;
      s.answered = Object.keys(box).length;
      s.eligible = this.list().filter((p) => this.eligible(p)).length;
    }
    if (this.phase === 'reveal') s.reveal = this.revealInfo();
    if (this.phase === 'grading') {
      const groups = new Map();
      for (const r of Object.values(box)) {
        if (r.grade !== null) continue;
        const key = normText(r.value);
        const g = groups.get(key) || { key, text: String(r.value), count: 0, auto: r.auto, grade: r.manual ?? r.auto };
        g.count++;
        groups.set(key, g);
      }
      s.grading = [...groups.values()].sort((a, b) => b.count - a.count);
      s.accepted = this.q.answers;
    }
    s.ropeHist = this.ropeHist;
    if (this.phase === 'final') s.summary = this.summary;
    return s;
  }

  playerState(p) {
    const s = this.base();
    const ranked = this.ranked();
    s.me = { id: p.id, name: p.name, team: p.team, score: p.score, streak: p.streak, rank: ranked.indexOf(p) + 1, of: ranked.length };
    if (this.qi >= 0 && this.phase !== 'final') {
      s.question = this.opts.showOnPhone ? publicQuestion(this.q) : { ...publicQuestion(this.q), text: '', image: '', video: '' };
      s.canAnswer = this.eligible(p);
      const r = this.answers[this.qi]?.[p.id];
      s.mine = r ? { value: r.value, ...(this.phase === 'reveal' ? { grade: r.grade, points: r.points } : {}) } : null;
    }
    if (this.phase === 'reveal') s.reveal = this.revealInfo();
    if (this.phase === 'final' || this.phase === 'reveal') s.top = ranked.slice(0, 5).map((x) => ({ name: x.name, team: x.team, score: x.score }));
    if (this.phase === 'final') s.final = { correct: p.correct, answered: p.answered, bestStreak: p.bestStreak, total: this.summary.questions.length };
    if (this.phase === 'lobby') s.lobby = this.list().map((x) => ({ name: x.name, team: x.team }));
    return s;
  }

  sendHosts() { const m = JSON.stringify(this.hostState()); for (const ws of this.hosts) send(ws, m); }
  sendPlayer(p) { const m = JSON.stringify(this.playerState(p)); for (const ws of p.socks) send(ws, m); }
  broadcast() { this.sendHosts(); for (const p of this.list()) this.sendPlayer(p); }

  buildSummary() {
    const qs = this.questions.slice(0, Math.max(0, this.maxQi + 1));
    const players = this.ranked().map((p, i) => ({
      name: p.name, team: p.team, userId: p.userId, score: p.score, correct: round1(p.correct), answered: p.answered, place: i + 1,
      avgTime: p.answered ? round1(p.timeSum / p.answered) : null, bestStreak: p.bestStreak,
      answers: qs.map((q, qi) => {
        const r = this.answers[qi]?.[p.id];
        return r ? { v: answerText(q, r.value), g: r.grade ?? 0, t: round1(r.elapsed), p: r.points } : null;
      }),
    }));
    const stat = (list) => ({
      total: list.length, correct: round1(list.reduce((s, r) => s + (r.grade || 0), 0)),
      avgTime: list.length ? round1(list.reduce((s, r) => s + r.elapsed, 0) / list.length) : null,
    });
    const questions = qs.map((q, qi) => {
      const entries = Object.entries(this.answers[qi] || {});
      const of = (t) => entries.filter(([pid]) => this.players.get(pid)?.team === t).map(([, r]) => r);
      return { text: q.text, type: q.type, time: q.time, answer: correctText(q), team: this.mode === 'duel' ? TEAMS[qi % 2] : null,
        all: stat(entries.map(([, r]) => r)), A: this.team ? stat(of('A')) : null, B: this.team ? stat(of('B')) : null };
    });
    const teams = this.team ? Object.fromEntries(TEAMS.map((t, i) => {
      const ps = players.filter((p) => p.team === t);
      const answered = ps.reduce((s, p) => s + p.answered, 0);
      return [t, { name: this.opts.teamNames[i], players: ps.length, score: Math.round(this.teamScore[t]),
        correct: round1(ps.reduce((s, p) => s + p.correct, 0)), answered,
        avgTime: answered ? round1(ps.reduce((s, p) => s + (p.avgTime || 0) * p.answered, 0) / answered) : null }];
    })) : null;
    return { mode: this.mode, title: this.title, subject: this.subject, started: this.startedAt || this.created, finished: Date.now(),
      winner: this.winner || null, rope: this.ropeHist, teams, players, questions };
  }
}

function saveGame(g) {
  const s = g.summary;
  db.tx(() => {
    db.run("UPDATE games SET status='done', finished=?, players=?, summary=? WHERE id=?", s.finished, s.players.length, JSON.stringify(s), g.id);
    if (g.quizId) db.run('UPDATE quizzes SET plays=plays+1 WHERE id=?', g.quizId);
    for (const p of s.players) {
      if (!p.userId) continue;
      const won = s.winner && s.winner !== 'draw' ? Number(p.team === s.winner) : Number(p.place === 1);
      db.run(`INSERT INTO game_players(game_id,user_id,name,team,score,correct,total,place,won,avg_time,best_streak)
              VALUES(?,?,?,?,?,?,?,?,?,?,?)`, g.id, p.userId, p.name, p.team, p.score, p.correct, s.questions.length, p.place, won, p.avgTime, p.bestStreak);
      db.run('UPDATE users SET xp=xp+? WHERE id=?', Math.round(p.score / 10), p.userId);
    }
  });
}

export function createGame({ hostId, quiz, mode, opts }) {
  const id = Number(db.run('INSERT INTO games(quiz_id,host_id,title,subject,mode,created) VALUES(?,?,?,?,?,?)',
    quiz.id || null, hostId, quiz.title, quiz.subject, mode, Date.now()).lastInsertRowid);
  return new Game({ id, hostId, quiz, mode, opts });
}

// Брошенные игры чистим раз в 10 минут.
setInterval(() => {
  const now = Date.now();
  for (const g of byId.values()) {
    const idle = !g.hosts.size && !g.list().some((p) => p.socks.size);
    if (now - g.created > 8 * 3600e3 || (idle && (g.phase === 'final' || now - g.created > 2 * 3600e3))) {
      clearTimeout(g.timer);
      byPin.delete(g.pin);
      byId.delete(g.id);
      if (g.phase !== 'final') db.run("DELETE FROM games WHERE id=? AND status='live'", g.id);
    }
  }
}, 600e3).unref();

// Защита сокетов: за школьным Wi-Fi сотни учеников могут делить один IP, поэтому лимиты щедрые.
const MAX_PER_IP = 700; // одновременных соединений с одного адреса
const conns = new Map();
const pinMisses = limiter(60, 10 * 60e3); // неверные PIN с одного адреса (против подбора)

export function attachSockets(server, userFromReq) {
  const wss = new WebSocketServer({
    server, path: '/ws', maxPayload: 16 * 1024, perMessageDeflate: false,
    // Соединение только со страниц нашего сайта (защита от чужих сайтов, открывающих сокет от имени ученика).
    verifyClient: ({ req }) => {
      const o = req.headers.origin;
      if (o) { try { if (new URL(o).host !== req.headers.host) return false; } catch { return false; } }
      return (conns.get(clientIp(req)) || 0) < MAX_PER_IP;
    },
  });
  wss.on('error', () => {}); // ошибки порта обрабатывает HTTP-сервер (server/index.js)
  wss.on('connection', (ws, req) => {
    const ip = clientIp(req);
    conns.set(ip, (conns.get(ip) || 0) + 1);
    const user = userFromReq(req);
    let misses = 0;
    let tokens = 40; // ведро: до 40 сообщений сразу, пополняется на 10 в секунду
    let last = Date.now();
    ws.alive = true;
    ws.on('error', () => {});
    ws.on('pong', () => { ws.alive = true; });
    ws.on('close', () => { const n = (conns.get(ip) || 1) - 1; if (n > 0) conns.set(ip, n); else conns.delete(ip); });
    ws.on('message', (raw) => {
      const t = Date.now();
      tokens = Math.min(40, tokens + ((t - last) / 1000) * 10);
      last = t;
      if (--tokens < 0) { if (tokens < -40) ws.terminate(); return; }
      try { onMessage(raw); } catch (e) { console.error('ws', e); }
    });
    const onMessage = (raw) => {
      let m;
      try { m = JSON.parse(raw); } catch { return; }
      if (!m || typeof m !== 'object' || Array.isArray(m)) return;
      if (m.t === 'ping') return send(ws, { t: 'pong', now: Date.now() });
      if (m.t === 'host') {
        const g = byId.get(Number(m.id));
        if (!g || !user || (user.id !== g.hostId && user.role !== 'admin')) return send(ws, { t: 'error', code: 'nogame' });
        ws.game = g;
        ws.isHost = true;
        g.hosts.add(ws);
        return send(ws, g.hostState());
      }
      if (m.t === 'join') {
        if (ws.player || ws.isHost) return; // одно соединение — одна роль
        if (pinMisses.blocked(ip)) return send(ws, { t: 'error', code: 'nopin' });
        const g = byPin.get(String(m.pin || '').trim().slice(0, 10));
        if (!g) {
          pinMisses.add(ip);
          if (++misses > 15) ws.close();
          return send(ws, { t: 'error', code: 'nopin' });
        }
        return g.join(ws, { name: String(m.name ?? '').slice(0, 60), token: typeof m.token === 'string' ? m.token : null, user: user?.role === 'student' ? user : null });
      }
      if (ws.isHost) ws.game.onHost(m);
      else if (ws.player && ws.game.players.has(ws.player.id)) ws.game.onPlayer(ws.player, m);
    };
    ws.on('close', () => ws.game?.leave(ws));
  });
  setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.alive) { ws.terminate(); continue; }
      ws.alive = false;
      ws.ping();
    }
  }, 30e3).unref();
}
