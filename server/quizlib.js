// Проверка квизов, оценка ответов и подсчёт очков. Чистые функции — их покрывают тесты.
import { SUBJECTS } from './constants.js';

export const TYPES = ['choice', 'truefalse', 'number', 'open', 'match'];

const str = (v, max) => String(v ?? '').trim().slice(0, max);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const cleanUrl = (u) => {
  u = str(u, 1000);
  return /^(https?:\/\/|\/uploads\/)[^\s"'<>]+$/i.test(u) ? u : '';
};

export function parseNum(v) {
  const s = String(v ?? '').trim().replace(/[\s ]/g, '').replace(/[−–]/g, '-').replace(',', '.');
  if (!s) return null;
  const frac = s.match(/^(-?\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  const n = frac ? Number(frac[1]) / Number(frac[2]) : Number(s);
  return Number.isFinite(n) ? n : null;
}

export const normText = (s) => String(s ?? '').toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function normalizeQuestion(q, i = 0) {
  const fail = (msg) => { throw new Error(`Вопрос ${i + 1}: ${msg}`); };
  if (!q || typeof q !== 'object') fail('неверный формат');
  const type = TYPES.includes(q.type) ? q.type : 'choice';
  const out = {
    type,
    text: str(q.text ?? q.question, 3000),
    image: cleanUrl(q.image),
    video: cleanUrl(q.video),
    time: clamp(Math.round(Number(q.time) || (type === 'match' ? 40 : 20)), 5, 300),
    double: Boolean(q.double),
    explain: str(q.explain, 1000),
  };
  if (!out.text && !out.image) fail('нет текста вопроса');

  if (type === 'choice') {
    const options = (Array.isArray(q.options) ? q.options : [])
      .map((o) => (o && typeof o === 'object' ? { text: str(o.text, 500), image: cleanUrl(o.image) } : { text: str(o, 500), image: '' }))
      .filter((o) => o.text || o.image)
      .slice(0, 6);
    if (options.length < 2) fail('нужно минимум 2 варианта');
    let correct = q.correct ?? q.answer ?? 0;
    // ИИ иногда отвечает текстом варианта или буквой вместо индекса.
    if (typeof correct === 'string') {
      const s = correct.trim();
      const byText = options.findIndex((o) => normText(o.text) === normText(s));
      const letter = s.length === 1 ? 'ABCDEFАБВГДЕ'.indexOf(s.toUpperCase()) : -1;
      correct = byText >= 0 ? byText : letter >= 0 ? letter % 6 : /^\d+$/.test(s) ? Number(s) : -1;
    }
    correct = Number(correct);
    if (!Number.isInteger(correct) || correct < 0 || correct >= options.length) fail('не отмечен правильный вариант');
    return { ...out, options, correct };
  }
  if (type === 'match') {
    // Пары «слева — справа»; правильная пара для левого i — правый i. Справа ученики видят пары перемешанными.
    const pairs = (Array.isArray(q.pairs) ? q.pairs : [])
      .map((p) => (Array.isArray(p) ? { left: p[0], right: p[1] } : p || {}))
      .map((p) => ({ left: str(p.left, 300), right: str(p.right, 300) }))
      .filter((p) => p.left && p.right)
      .slice(0, 6);
    if (pairs.length < 2) fail('нужно минимум 2 пары');
    return { ...out, pairs };
  }
  if (type === 'truefalse') {
    const v = q.correct ?? q.answer;
    return { ...out, correct: v === true || ['true', 'да', 'верно', 'иә', '1'].includes(String(v).toLowerCase()) };
  }
  const raw = (Array.isArray(q.answers) ? q.answers : [q.answers ?? q.answer]).filter((a) => a !== undefined && a !== null && a !== '');
  if (type === 'number') {
    const answers = raw.map(parseNum).filter((n) => n !== null).slice(0, 5);
    if (!answers.length) fail('нужен числовой ответ');
    return { ...out, answers };
  }
  return { ...out, answers: raw.map((a) => str(a, 200)).filter(Boolean).slice(0, 10) };
}

export function normalizeQuiz(body, isSubject = (k) => Boolean(SUBJECTS[k])) {
  const title = str(body?.title, 120);
  if (!title) throw new Error('Введите название квиза');
  const list = Array.isArray(body.questions) ? body.questions : [];
  if (!list.length) throw new Error('Добавьте хотя бы один вопрос');
  if (list.length > 100) throw new Error('Не больше 100 вопросов');
  return {
    title,
    subject: isSubject(body.subject) ? body.subject : 'gen',
    grade: clamp(Number(body.grade) || 0, 0, 12),
    description: str(body.description, 500),
    lang: ['ru', 'kk', 'en'].includes(body.lang) ? body.lang : 'ru',
    shared: body.shared ? 1 : 0,
    questions: list.map(normalizeQuestion),
  };
}

/** 1 — верно, 0 — неверно, null — нужна проверка учителем. */
export function gradeAnswer(q, value) {
  if (value === undefined || value === null || value === '') return 0;
  switch (q.type) {
    case 'choice': return Number(value) === q.correct ? 1 : 0;
    case 'truefalse': return (value === true || value === 'true') === q.correct ? 1 : 0;
    case 'match': {
      // value[i] — номер правой части (в исходном порядке), выбранной для левой i. Балл — доля верных пар.
      if (!Array.isArray(value)) return 0;
      const right = q.pairs.filter((_, i) => Number(value[i]) === i).length;
      return Math.round((right / q.pairs.length) * 100) / 100;
    }
    case 'number': {
      const n = parseNum(value);
      return n !== null && q.answers.some((a) => Math.abs(a - n) <= 1e-6 * Math.max(1, Math.abs(a))) ? 1 : 0;
    }
    default: {
      if (!q.answers.length) return null;
      const v = normText(value);
      return q.answers.some((a) => normText(a) === v) ? 1 : 0;
    }
  }
}

/** Очки: до 500 за правильность + до 500 за скорость, ×2 для «двойных» вопросов, бонус за серию. */
export function points({ grade, elapsed, limit, streak = 0, double = false }) {
  if (!grade) return 0;
  const speed = clamp(1 - elapsed / limit, 0, 1);
  const base = Math.round(grade * (500 + 500 * speed)) * (double ? 2 : 1);
  return base + (grade === 1 && streak >= 2 ? Math.min(streak - 1, 5) * 40 : 0);
}

/** Насколько сильно один ответ тянет канат: правильность × скорость, делённые на размер команды. */
export function pull({ grade, elapsed, limit, teamSize, step }) {
  const speed = clamp(1 - elapsed / limit, 0, 1);
  return (step * grade * (0.5 + 0.5 * speed)) / Math.max(1, teamSize);
}

export const ropeStep = (questionCount) => clamp(240 / Math.max(1, questionCount), 20, 50);
