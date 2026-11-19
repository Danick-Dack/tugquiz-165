// Письма для восстановления пароля. Почтовый ящик (обычно Gmail с паролем приложения) настраивает администратор.
import nodemailer from 'nodemailer';
import { getSetting } from './db.js';

export const mailConf = () => getSetting('mail', {});
export const mailReady = () => { const m = mailConf(); return Boolean(m.host && m.user && m.pass && m.site); };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function transport(m) {
  const port = Number(m.port) || 465;
  return nodemailer.createTransport({
    host: m.host, port, secure: port === 465, auth: { user: m.user, pass: m.pass },
    connectionTimeout: 15e3, greetingTimeout: 15e3, socketTimeout: 20e3,
  });
}

export async function sendMail(to, subject, text, html, conf = mailConf()) {
  await transport(conf).sendMail({ from: `"TugQuiz" <${conf.user}>`, to, subject, text, html });
}

// В письмо не попадает текст, который пользователь мог вписать сам (имя могло бы стать фишинговой фразой):
// только логин (латиница, цифры, точка, _ и -) и наша ссылка.
const btn = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#0f6b38;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">${esc(label)}</a>`;
const wrap = (body) => `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b1d18;max-width:520px">${body}</div>`;

export function resetLetter(items) {
  const many = items.length > 1;
  const text = `Здравствуйте.\n\nЧтобы задать новый пароль в TugQuiz, откройте ссылку (действует 30 минут):\n${
    items.map((i) => `${many ? `Логин ${i.login}: ` : ''}${i.link}`).join('\n')
  }\n\nЕсли вы не просили сменить пароль, просто удалите это письмо: пароль останется прежним.\n\n---\nTugQuiz-те жаңа құпиясөз қою үшін сілтемені ашыңыз (30 минут жарамды). Сіз сұрамасаңыз, хатты өшіріп тастаңыз.`;
  const html = wrap(`<p>Здравствуйте.</p><p>Чтобы задать новый пароль в TugQuiz, нажмите кнопку. Ссылка действует 30 минут.</p>
${items.map((i) => `<p>${many ? `Логин <b>${esc(i.login)}</b><br>` : ''}${btn(i.link, 'Задать новый пароль')}</p>`).join('')}
<p style="color:#686c62;font-size:14px">Если вы не просили сменить пароль, просто удалите это письмо: пароль останется прежним.<br>Жаңа құпиясөз қою үшін батырманы басыңыз. Сілтеме 30 минут жарамды.</p>`);
  return { subject: 'TugQuiz: новый пароль', text, html };
}

export function emailChangedLetter(login) {
  const text = `Здравствуйте.\n\nВ аккаунте TugQuiz с логином ${login} почту для восстановления заменили на другую. Если это сделали не вы, сообщите администратору сайта или учителю.\n\n---\nTugQuiz аккаунтындағы (${login}) пошта ауыстырылды. Мұны сіз жасамасаңыз, әкімшіге не мұғалімге хабарлаңыз.`;
  const html = wrap(`<p>Здравствуйте.</p><p>В аккаунте TugQuiz с логином <b>${esc(login)}</b> почту для восстановления заменили на другую.</p>
<p>Если это сделали не вы, сообщите администратору сайта или учителю.</p>
<p style="color:#686c62;font-size:14px">TugQuiz аккаунтындағы пошта ауыстырылды. Мұны сіз жасамасаңыз, әкімшіге не мұғалімге хабарлаңыз.</p>`);
  return { subject: 'TugQuiz: почта в аккаунте изменена', text, html };
}
