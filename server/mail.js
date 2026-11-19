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

export function resetLetter(name, link) {
  const text = `${name}, здравствуйте.\n\nЧтобы задать новый пароль в TugQuiz, откройте ссылку (действует 30 минут):\n${link}\n\nЕсли вы не просили сменить пароль, просто удалите это письмо.\n\n---\nСәлеметсіз бе! TugQuiz-те жаңа құпиясөз қою үшін сілтемені ашыңыз (30 минут жарамды):\n${link}`;
  const html = `<div style="font-family:Arial,sans-serif;font-size:16px;line-height:1.5;color:#1b1d18;max-width:520px">
<p>${esc(name)}, здравствуйте.</p>
<p>Чтобы задать новый пароль в TugQuiz, нажмите кнопку. Ссылка действует 30 минут.</p>
<p><a href="${esc(link)}" style="display:inline-block;background:#0f6b38;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Задать новый пароль</a></p>
<p style="color:#686c62;font-size:14px">Если вы не просили сменить пароль, просто удалите это письмо.<br>Жаңа құпиясөз қою үшін батырманы басыңыз. Сілтеме 30 минут жарамды.</p>
</div>`;
  return { subject: 'TugQuiz: новый пароль', text, html };
}
