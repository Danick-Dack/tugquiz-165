import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.TQ_DATA = mkdtempSync(path.join(tmpdir(), 'tq-'));
const db = await import('../server/db.js');
const { createGame } = await import('../server/game.js');

const fakeWs = () => ({ readyState: 1, sent: [], send(m) { this.sent.push(JSON.parse(m)); }, close() {}, last() { return this.sent.at(-1); } });
const quiz = {
  id: null, title: 'Тест', subject: 'mat',
  questions: [
    { type: 'number', text: '2+2', answers: [4], time: 20 },
    { type: 'open', text: 'Мнение', answers: [], time: 20 },
  ],
};
const open = (g) => { g.opensAt = Date.now() - 2000; g.deadline = Date.now() + 18000; };

test('арқан тартыс: команды, канат, проверка учителем, итог в базе', () => {
  const g = createGame({ hostId: null, quiz, mode: 'tug', opts: { autoTeams: true, teamNames: ['Жасыл', 'Сары'] } });
  const host = fakeWs();
  g.hosts.add(host);
  const a = fakeWs(); const b = fakeWs();
  g.join(a, { name: 'Айгерим' });
  g.join(b, { name: 'Айгерим' });
  const [pa, pb] = g.list();
  assert.equal(pb.name, 'Айгерим 2', 'одинаковые имена различаются');
  assert.deepEqual([pa.team, pb.team].sort(), ['A', 'B'], 'автораспределение поровну');

  g.onHost({ t: 'start' });
  assert.equal(g.phase, 'question');
  open(g);
  const left = pa.team === 'A' ? pa : pb;
  const right = left === pa ? pb : pa;
  g.answer(left, '4');
  assert.ok(g.rope < 0, 'верный ответ левых тянет канат влево');
  g.answer(left, '4');
  assert.equal(Object.keys(g.answers[0]).length, 1, 'второй ответ не принимается');
  g.answer(right, '5');
  assert.equal(g.phase, 'question', 'после всех ответов вопрос закрывается с небольшой задержкой');
  g.endQuestion();
  assert.equal(g.phase, 'reveal');
  assert.ok(host.last().reveal.right === 1);
  assert.equal(a.last().reveal.correct, null, 'ученикам не раскрываем лишнего до показа');

  g.onHost({ t: 'next' });
  open(g);
  g.answer(left, 'Интересно');
  g.answer(right, 'скучно');
  g.endQuestion();
  assert.equal(g.phase, 'grading', 'открытый вопрос без ответов — проверка учителем');
  assert.equal(host.last().grading.length, 2);
  g.onHost({ t: 'grade', key: 'скучно', grade: 1 });
  g.onHost({ t: 'gradeDone' });
  assert.equal(g.phase, 'reveal');
  assert.ok(right.score > 0);

  g.onHost({ t: 'next' });
  assert.equal(g.phase, 'final');
  const row = db.one('SELECT status, players, summary FROM games WHERE id=?', g.id);
  assert.equal(row.status, 'done');
  assert.equal(row.players, 2);
  const s = JSON.parse(row.summary);
  assert.equal(s.questions.length, 2);
  assert.equal(s.players[0].answers.length, 2);
  assert.ok(['A', 'B', 'draw'].includes(s.winner));
});

test('команды по очереди: отвечает только активная команда', () => {
  const g = createGame({ hostId: null, quiz: { ...quiz, questions: [quiz.questions[0], quiz.questions[0]] }, mode: 'duel', opts: { autoTeams: true } });
  const a = fakeWs(); const b = fakeWs();
  g.join(a, { name: 'Ерлан' });
  g.join(b, { name: 'Дана' });
  g.onHost({ t: 'start' });
  open(g);
  const [pa, pb] = g.list();
  const active = pa.team === g.activeTeam ? pa : pb;
  const waiting = active === pa ? pb : pa;
  g.answer(waiting, '4');
  assert.equal(Object.keys(g.answers[0]).length, 0);
  g.answer(active, '4');
  assert.equal(Object.keys(g.answers[0]).length, 1);
  g.onHost({ t: 'finish' });
  assert.equal(g.winner, active.team);
});

test('повторный вход по токену возвращает того же игрока', () => {
  const g = createGame({ hostId: null, quiz, mode: 'solo', opts: {} });
  const a = fakeWs();
  g.join(a, { name: 'Тимур' });
  const token = a.sent.find((m) => m.t === 'joined').token;
  const again = fakeWs();
  g.join(again, { name: 'Другое имя', token });
  assert.equal(g.players.size, 1);
  assert.equal(g.list()[0].name, 'Тимур');
  g.onHost({ t: 'finish' });
});
