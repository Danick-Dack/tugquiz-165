import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeQuestion, normalizeQuiz, gradeAnswer, points, pull, parseNum, cleanUrl } from '../server/quizlib.js';
import { parseAiText, buildPrompt } from '../server/ai.js';

test('вариант правильного ответа понимается по индексу, букве и тексту', () => {
  const base = { type: 'choice', text: '2+2', options: ['3', '4', '5'] };
  assert.equal(normalizeQuestion({ ...base, correct: 1 }).correct, 1);
  assert.equal(normalizeQuestion({ ...base, correct: 'B' }).correct, 1);
  assert.equal(normalizeQuestion({ ...base, correct: '4' }).correct, 1);
  assert.throws(() => normalizeQuestion({ ...base, correct: 7 }), /правильный/);
  assert.throws(() => normalizeQuestion({ type: 'choice', text: 'x', options: ['один'] }), /2 варианта/);
});

test('числа: запятая, дробь, минус', () => {
  assert.equal(parseNum('3,5'), 3.5);
  assert.equal(parseNum('1/2'), 0.5);
  assert.equal(parseNum('−4'), -4);
  assert.equal(parseNum('abc'), null);
  const q = normalizeQuestion({ type: 'number', text: '?', answers: ['0,5'] });
  assert.equal(gradeAnswer(q, '1/2'), 1);
  assert.equal(gradeAnswer(q, '0.6'), 0);
});

test('открытый ответ: без регистра и знаков, пустой список — проверка учителем', () => {
  const q = normalizeQuestion({ type: 'open', text: 'Валюта?', answers: ['тенге', 'теңге'] });
  assert.equal(gradeAnswer(q, '  Тенге! '), 1);
  assert.equal(gradeAnswer(q, 'рубль'), 0);
  assert.equal(gradeAnswer(normalizeQuestion({ type: 'open', text: 'Мнение?' }), 'что-то'), null);
  assert.equal(gradeAnswer(normalizeQuestion({ type: 'truefalse', text: 'x', correct: 'да' }), true), 1);
});

test('очки: скорость, двойные, серия', () => {
  assert.equal(points({ grade: 1, elapsed: 0, limit: 20 }), 1000);
  assert.equal(points({ grade: 1, elapsed: 20, limit: 20 }), 500);
  assert.equal(points({ grade: 0, elapsed: 1, limit: 20 }), 0);
  assert.equal(points({ grade: 1, elapsed: 0, limit: 20, double: true }), 2000);
  assert.equal(points({ grade: 1, elapsed: 0, limit: 20, streak: 3 }), 1080);
  assert.equal(points({ grade: 0.5, elapsed: 10, limit: 20 }), 375);
  assert.ok(pull({ grade: 1, elapsed: 0, limit: 20, teamSize: 1, step: 30 }) > pull({ grade: 1, elapsed: 0, limit: 20, teamSize: 3, step: 30 }));
});

test('ссылки: только http(s) и свои загрузки', () => {
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanUrl('https://a.kz/x.png'), 'https://a.kz/x.png');
  assert.equal(cleanUrl('/uploads/a.webp'), '/uploads/a.webp');
  assert.equal(cleanUrl('https://a.kz/"><script>'), '');
});

test('квиз: пустой и неверный отклоняются', () => {
  assert.throws(() => normalizeQuiz({ title: '', questions: [] }), /название/);
  assert.throws(() => normalizeQuiz({ title: 'x', questions: [] }), /вопрос/);
  assert.equal(normalizeQuiz({ title: 'x', subject: 'nope', questions: [{ type: 'truefalse', text: 'a', correct: true }] }).subject, 'gen');
});

test('ответ ИИ: markdown-блок и LaTeX с одиночными слэшами', () => {
  const text = 'Вот вопросы:\n```json\n{"title":"Дроби","questions":[{"type":"choice","text":"$\\frac{1}{2}+\\frac{1}{2}$","options":["1","2"],"correct":0},{"type":"number","text":"$\\sqrt{16}$","answers":[4]},{"type":"bad"}]}\n```';
  const r = parseAiText(text);
  assert.equal(r.title, 'Дроби');
  assert.equal(r.questions[0].text, '$\\frac{1}{2}+\\frac{1}{2}$');
  assert.equal(r.questions[1].answers[0], 4);
  assert.equal(r.questions.length, 2, 'битый вопрос пропускается');
  assert.equal(r.errors.length, 1);
  assert.throws(() => parseAiText('нет тут json'), /JSON/);
});

test('промт содержит предмет, тему и формат', () => {
  const p = buildPrompt({ subject: 'alg', grade: 8, topic: 'Виет', count: 5, types: ['choice', 'number'], lang: 'kk' });
  assert.match(p, /Алгебра/);
  assert.match(p, /Виет/);
  assert.match(p, /казахском/);
  assert.match(p, /"questions"/);
});

test('соответствие и свой предмет', () => {
  const q = normalizeQuestion({ type: 'match', text: 'x', pairs: [['a', '1'], ['b', '2'], ['', '3']] });
  assert.equal(q.pairs.length, 2);
  assert.equal(gradeAnswer(q, [0, 1]), 1);
  assert.equal(gradeAnswer(q, [1, 0]), 0);
  assert.throws(() => normalizeQuestion({ type: 'match', text: 'x', pairs: [['a', '1']] }), /2 пары/);
  const quiz = { title: 'T', subject: 'c123', grade: 12, questions: [{ type: 'truefalse', text: 'x', correct: true }] };
  assert.equal(normalizeQuiz(quiz).subject, 'gen');
  assert.equal(normalizeQuiz(quiz, (k) => k === 'c123').subject, 'c123');
  assert.equal(normalizeQuiz(quiz).grade, 12);
});

test('ИИ: набор тестов и варианты с буквами', () => {
  const r = parseAiText('{"quizzes":[{"title":"A","questions":[{"type":"choice","text":"?","options":["a) один","b) два"],"correct":1}]},{"title":"B","questions":[]}]}');
  assert.equal(r.quizzes.length, 1);
  assert.equal(r.quizzes[0].questions[0].options[0].text, 'один');
});
