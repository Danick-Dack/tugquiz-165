// ИИ-генерация вопросов: промт, разбор ответа нейросети и вызов OpenAI-совместимого API
// (Gemini, Groq, OpenRouter, DeepSeek — у первых трёх есть бесплатный лимит).
import { SUBJECTS } from './constants.js';
import { normalizeQuestion } from './quizlib.js';

const LANG = { ru: 'на русском языке', kk: 'на казахском языке (қазақ тілінде)', en: 'на английском языке' };
const TYPE_HINT = {
  choice: 'с выбором одного из 4 вариантов',
  truefalse: '«верно / неверно»',
  number: 'с числовым ответом (удобно для игры на доске)',
  open: 'с коротким текстовым ответом',
};

export function buildPrompt({ subject, grade, topic, count = 10, types = ['choice'], lang = 'ru', difficulty = 'средняя', notes = '', examples = '', hasImage = false }) {
  const subj = SUBJECTS[subject]?.[0] || 'общие знания';
  const n = Math.min(Math.max(Number(count) || 10, 1), 40);
  const kinds = (types.length ? types : ['choice']).filter((t) => TYPE_HINT[t]);
  const sample = String(examples || '').trim().slice(0, 2000);
  return `Ты — опытный учитель лицея №165 (Казахстан, учатся 7–11 классы). Составь ${n} вопросов для викторины-соревнования школьников.

Предмет: ${subj}
Класс: ${grade || '7–11'}
Тема: ${String(topic || '').slice(0, 300) || 'по программе предмета'}
Сложность: ${difficulty}
Язык вопросов: ${LANG[lang] || LANG.ru}
Типы вопросов: ${kinds.map((t) => `${t} — ${TYPE_HINT[t]}`).join('; ')}
${notes ? `Пожелания учителя: ${String(notes).slice(0, 500)}\n` : ''}${sample ? `\nПримеры заданий от учителя — составь похожие по виду и сложности, но с другими числами и фактами (не копируй их):\n${sample}\n` : ''}${hasImage ? '\nК сообщению приложено фото с примерами заданий (учебник, доска или тетрадь) — составь похожие по виду, теме и сложности, но новые.\n' : ''}
Требования:
- вопросы короткие и однозначные, чтобы ученик успел ответить за 10–30 секунд;
- соответствуют программе Казахстана для этого класса, без ошибок в фактах;
- неправильные варианты правдоподобные, правильный вариант стоит в случайной позиции;
- формулы пиши в LaTeX между знаками $...$ (например $\\frac{1}{2}$, $x^2$);
- в поле "explain" — одно короткое пояснение к правильному ответу.

Ответь ТОЛЬКО JSON без пояснений, строго в таком формате:
{"title": "Название квиза",
 "questions": [
  {"type": "choice", "text": "Вопрос?", "options": ["A", "B", "C", "D"], "correct": 0, "time": 20, "explain": "..."},
  {"type": "truefalse", "text": "Утверждение.", "correct": true, "time": 15, "explain": "..."},
  {"type": "number", "text": "Сколько будет $7 \\cdot 8$?", "answers": [56], "time": 20, "explain": "..."},
  {"type": "open", "text": "Вопрос?", "answers": ["ответ", "синоним ответа"], "time": 30, "explain": "..."}
 ]}
"correct" у choice — номер правильного варианта, считая с 0.`;
}

/** Нейросети часто пишут LaTeX с одиночным «\» внутри JSON — удваиваем такие слэши перед командами. */
const fixLatexEscapes = (s) =>
  s.replace(/(\\+)([a-zA-Z]{2,})/g, (m, slashes, word) =>
    slashes.length % 2 === 1 && !/^u[0-9a-fA-F]{4}/.test(word) ? `\\${slashes}${word}` : m);

export function parseAiText(text) {
  let s = String(text || '').replace(/```(?:json)?/gi, '').trim();
  const start = s.search(/[[{]/);
  if (start < 0) throw new Error('В ответе нет JSON. Попросите нейросеть ответить строго в формате из промта.');
  s = s.slice(start, Math.max(s.lastIndexOf('}'), s.lastIndexOf(']')) + 1);
  let data;
  try { data = JSON.parse(fixLatexEscapes(s)); } catch {
    try { data = JSON.parse(s); } catch { throw new Error('Не удалось прочитать JSON. Скопируйте ответ целиком.'); }
  }
  const list = Array.isArray(data) ? data : data.questions;
  if (!Array.isArray(list) || !list.length) throw new Error('В JSON нет списка вопросов');
  const questions = [];
  const errors = [];
  list.slice(0, 100).forEach((q, i) => {
    try { questions.push(normalizeQuestion(q, i)); } catch (e) { errors.push(e.message); }
  });
  if (!questions.length) throw new Error(errors[0] || 'Вопросы не распознаны');
  return { title: Array.isArray(data) ? '' : String(data.title || '').slice(0, 120), questions, errors };
}

/** image — необязательная картинка в виде data:image/...;base64 (нужна модель с поддержкой изображений, например Gemini). */
export async function callAi({ base, model, key }, prompt, image) {
  if (!base || !model || !key) throw new Error('ИИ не настроен: администратор должен указать ключ в «Настройках».');
  const content = image ? [{ type: 'text', text: prompt }, { type: 'image_url', image_url: { url: image } }] : prompt;
  const res = await fetch(`${base.replace(/\/+$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model, temperature: 0.7, messages: [{ role: 'user', content }] }),
    signal: AbortSignal.timeout(120_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = body?.error?.message || body?.[0]?.error?.message || res.statusText;
    throw new Error(`ИИ ответил ошибкой ${res.status}: ${String(msg).slice(0, 200)}`);
  }
  const text = body?.choices?.[0]?.message?.content;
  if (!text) throw new Error('ИИ вернул пустой ответ');
  return text;
}
