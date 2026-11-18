// ИИ-генерация вопросов: промт, разбор ответа нейросети и вызов OpenAI-совместимого API.
// Без ключа работает бесплатный ИИ Pollinations (без регистрации, медленнее и проще).
// С ключом администратора — Gemini, Groq, OpenRouter, DeepSeek.
import { SUBJECTS } from './constants.js';
import { normalizeQuestion } from './quizlib.js';

const LANG = { ru: 'на русском языке', kk: 'на казахском языке (қазақ тілінде)', en: 'на английском языке' };
const TYPE_HINT = {
  choice: 'с выбором одного из 4 вариантов',
  truefalse: '«верно / неверно»',
  number: 'с числовым ответом (удобно для игры на доске)',
  open: 'с коротким текстовым ответом',
  match: 'на соответствие (3–4 пары «понятие — определение»)',
};

/** Бесплатный ИИ без ключа: используется, пока администратор не подключил свой. */
export const FREE_AI = { provider: 'free', base: 'https://text.pollinations.ai/openai', model: 'openai', key: '' };

const EXAMPLE = `  {"type": "choice", "text": "Вопрос?", "options": ["A", "B", "C", "D"], "correct": 0, "time": 20, "explain": "..."},
  {"type": "truefalse", "text": "Утверждение.", "correct": true, "time": 15, "explain": "..."},
  {"type": "number", "text": "Сколько будет $7 \\cdot 8$?", "answers": [56], "time": 20, "explain": "..."},
  {"type": "open", "text": "Вопрос?", "answers": ["ответ", "синоним ответа"], "time": 30, "explain": "..."},
  {"type": "match", "text": "Соедините понятие и определение", "pairs": [["понятие 1", "определение 1"], ["понятие 2", "определение 2"], ["понятие 3", "определение 3"]], "time": 40}`;

const RULES = `Требования:
- вопросы короткие и однозначные, чтобы ученик успел ответить за 10–30 секунд;
- соответствуют школьной программе Казахстана для этого класса, без ошибок в фактах;
- неправильные варианты правдоподобные, правильный вариант стоит в случайной позиции;
- в "match" пары пиши в правильном порядке, сайт сам перемешает правую часть;
- формулы пиши в LaTeX между знаками $...$ (например $\\frac{1}{2}$, $x^2$);
- в поле "explain" — одно короткое пояснение к правильному ответу.`;

function header({ subject, grade, topic, lang = 'ru', difficulty = 'средняя', types = ['choice'], notes = '', examples = '', hasImage = false, subjectName = '' }) {
  const subj = SUBJECTS[subject]?.[0] || String(subjectName || '').slice(0, 60) || 'общие знания';
  const kinds = (types?.length ? types : ['choice']).filter((t) => TYPE_HINT[t]);
  const sample = String(examples || '').trim().slice(0, 2000);
  return `Предмет: ${subj}
Класс: ${grade || 'любой'}
Тема: ${String(topic || '').slice(0, 300) || 'по программе предмета'}
Сложность: ${difficulty}
Язык вопросов: ${LANG[lang] || LANG.ru}
Типы вопросов: ${kinds.map((t) => `${t} — ${TYPE_HINT[t]}`).join('; ')}
${notes ? `Пожелания учителя: ${String(notes).slice(0, 500)}\n` : ''}${sample ? `\nПримеры заданий от учителя — составь похожие по виду и сложности, но с другими числами и фактами (не копируй их):\n${sample}\n` : ''}${hasImage ? '\nК сообщению приложено фото с примерами заданий (учебник, доска или тетрадь) — составь похожие по виду, теме и сложности, но новые.\n' : ''}`;
}

export function buildPrompt(p) {
  const n = Math.min(Math.max(Number(p.count) || 10, 1), 40);
  return `Ты — опытный школьный учитель в Казахстане. Составь ${n} вопросов для викторины-соревнования школьников.

${header(p)}
${RULES}

Ответь ТОЛЬКО JSON без пояснений, строго в таком формате:
{"title": "Название квиза",
 "questions": [
${EXAMPLE}
 ]}
"correct" у choice — номер правильного варианта, считая с 0.`;
}

/** Набор из нескольких тестов по одной теме: от простого к сложному, разные стороны темы. */
export function buildPackPrompt(p) {
  const tests = Math.min(Math.max(Number(p.tests) || 3, 2), 5);
  const per = Math.min(Math.max(Number(p.count) || 6, 3), 12);
  return `Ты — опытный школьный учитель в Казахстане. Составь набор из ${tests} разных тестов по одной теме, в каждом ${per} вопросов.
Тесты идут от простого к сложному и проверяют разные стороны темы (например: определения и правила → решение задач → применение и трудные случаи). Вопросы в тестах не повторяются.

${header(p)}
${RULES}

Ответь ТОЛЬКО JSON без пояснений, строго в таком формате:
{"quizzes": [
 {"title": "Тема: основы", "description": "Что проверяет тест", "questions": [
${EXAMPLE}
 ]}
]}
"correct" у choice — номер правильного варианта, считая с 0.`;
}

/** Нейросети часто пишут LaTeX с одиночным «\» внутри JSON — удваиваем такие слэши перед командами. */
const fixLatexEscapes = (s) =>
  s.replace(/(\\+)([a-zA-Z]{2,})/g, (m, slashes, word) =>
    slashes.length % 2 === 1 && !/^u[0-9a-fA-F]{4}/.test(word) ? `\\${slashes}${word}` : m);

function readJson(text) {
  let s = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = s.search(/[[{]/);
  if (start < 0) throw new Error('В ответе нет JSON. Попросите нейросеть ответить строго в формате из промта.');
  s = s.slice(start, Math.max(s.lastIndexOf('}'), s.lastIndexOf(']')) + 1);
  let data;
  try { data = JSON.parse(fixLatexEscapes(s)); } catch {
    try { data = JSON.parse(s); } catch { throw new Error('Не удалось прочитать JSON. Скопируйте ответ целиком.'); }
  }
  return data;
}

function readQuestions(list) {
  const questions = [];
  const errors = [];
  // Слабые модели пишут варианты как «a) текст» — буквы покажет сам сайт.
  const strip = (o) => (typeof o === 'string' ? o.replace(/^\s*[A-FА-Еa-fа-е][).]\s+/, '') : o);
  list.slice(0, 100).forEach((q, i) => {
    if (Array.isArray(q?.options)) q = { ...q, options: q.options.map(strip) };
    try { questions.push(normalizeQuestion(q, i)); } catch (e) { errors.push(e.message); }
  });
  return { questions, errors };
}

/** Ответ ИИ → один квиз или набор квизов ({ quizzes: [...] }). */
export function parseAiText(text) {
  const data = readJson(text);
  if (Array.isArray(data?.quizzes)) {
    const quizzes = data.quizzes.slice(0, 5).map((z) => ({
      title: String(z?.title || '').slice(0, 120), description: String(z?.description || '').slice(0, 500),
      ...readQuestions(Array.isArray(z?.questions) ? z.questions : []),
    })).filter((z) => z.questions.length);
    if (!quizzes.length) throw new Error('В ответе нет ни одного теста с вопросами');
    return { quizzes };
  }
  const list = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(list) || !list.length) throw new Error('В JSON нет списка вопросов');
  const { questions, errors } = readQuestions(list);
  if (!questions.length) throw new Error(errors[0] || 'Вопросы не распознаны');
  return { title: Array.isArray(data) ? '' : String(data.title || '').slice(0, 120), questions, errors };
}

/** image — необязательная картинка в виде data:image/...;base64 (нужна модель с поддержкой изображений, например Gemini). */
export async function callAi(conf, prompt, image) {
  const { base, model, key } = conf?.key ? conf : FREE_AI;
  if (!key && image) throw new Error('Бесплатный ИИ не читает фото. Уберите фото или используйте способ «Через любой чат»');
  const content = image ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }] : prompt;
  const url = key ? `${base.replace(/\/+$/, '')}/chat/completions` : base;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { Authorization: `Bearer ${key}` } : {}) },
    body: JSON.stringify({ model, ...(key ? { temperature: 0.7 } : {}), messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (!key && res.status === 429) throw new Error('Бесплатный ИИ сейчас перегружен. Подождите минуту или используйте способ «Через любой чат»');
    const msg = body?.error?.message || body?.[0]?.error?.message || res.statusText;
    throw new Error(`ИИ ответил ошибкой ${res.status}: ${String(msg).slice(0, 200)}`);
  }
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error('ИИ вернул пустой ответ');
  return text;
}
