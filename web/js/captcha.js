// Капча Cloudflare Turnstile. Ключ приходит с сервера (store.captcha); без ключа виджет не показывается.
import { h, store } from './core.js';

let loading;
const load = () => loading ||= new Promise((ok, bad) => {
  const s = Object.assign(document.createElement('script'), { src: 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit', async: true });
  s.onload = ok; s.onerror = () => { loading = null; bad(new Error('captcha')); };
  document.head.append(s);
});

/** Элемент для формы + token() (токен одноразовый) + reset() после отправки. */
export function captcha() {
  const el = h('div', { class: 'captcha', style: { minHeight: store.captcha ? '65px' : '0' } });
  let id; let token = '';
  if (store.captcha) {
    load().then(() => { id = window.turnstile.render(el, { sitekey: store.captcha, theme: 'auto', callback: (t) => { token = t; }, 'expired-callback': () => { token = ''; }, 'error-callback': () => { token = ''; } }); }).catch(() => {});
  }
  return { el, token: () => token, reset() { token = ''; if (id !== undefined) window.turnstile?.reset(id); } };
}
