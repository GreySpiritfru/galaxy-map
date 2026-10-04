/* Сеть (v=200, по аудиту 04.10.2026): загрузка с таймаутом и плашка
   «не загрузилось — повторить». До этого у загрузок не было таймаутов:
   повисший запрос (в РФ на мобильной сети — обычное дело) оставлял «Загрузка…»
   навсегда, а сбой тихо давал пустую карту без единого слова игроку. */

/* fetch, который сам обрывается через ms. Таймер не снимается после ответа
   нарочно: он обрывает и зависшее ЧТЕНИЕ тела (json/text), а оборвать уже
   прочитанный ответ — ничего не делает. */
export function fetchT(url, opts = {}, ms = 15000) {
  if (typeof AbortController !== 'function') return fetch(url, opts);
  const ac = new AbortController();
  setTimeout(() => ac.abort(), ms);
  return fetch(url, {...opts, signal: ac.signal});
}

/* Одна плашка на всё: несколько сбоев подряд не плодят несколько плашек. */
let banner = null;
export function showLoadError(text) {
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'load-error';
    banner.setAttribute('role', 'alert');
    banner.innerHTML = '<span class="load-error-text"></span>'
      + '<button type="button" class="load-error-retry">Повторить</button>'
      + '<button type="button" class="load-error-close" aria-label="Скрыть">✕</button>';
    banner.querySelector('.load-error-retry').addEventListener('click', () => location.reload());
    banner.querySelector('.load-error-close').addEventListener('click', () => banner.hidden = true);
    document.body.appendChild(banner);
  }
  banner.querySelector('.load-error-text').textContent = text;
  banner.hidden = false;
}

/* Адреса из данных (v=201, аудит 04.10.2026). Бот пускает в sheetUrl, статьи
   и lore.json только https://, но карта не должна от этого зависеть: адрес
   `javascript:…` во фрейме выполнялся бы на странице карты, с доступом к
   Telegram.WebApp. safeHttps — только https: (иначе ''), safeFrameUrl —
   ещё и только сайты статей/анкет, которые мы показываем внутри окна. */
const FRAME_HOSTS = /^(?:[\w-]+\.)*(?:teletype\.in|telegra\.ph|graph\.org)$/i;
export function safeHttps(url) {
  try {
    const u = new URL(String(url || '').trim());
    return u.protocol === 'https:' ? u.href : '';
  } catch (e) {
    return '';
  }
}
export function safeFrameUrl(url) {
  const h = safeHttps(url);
  return h && FRAME_HOSTS.test(new URL(h).hostname) ? h : '';
}
/* Разметка фрейма чужой страницы. Сайт не из списка — вместо фрейма ссылка
   «Открыть ↗» (такие сайты всё равно обычно не дают встроить себя).
   referrerpolicy — чужой сайт не узнаёт, с какой страницы карты пришли. */
export function frameHtml(url, cls, attrs = '') {
  const esc = s => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const ok = safeFrameUrl(url);
  if (ok) return `<iframe class="${cls}" src="${esc(ok)}" title="Статья" referrerpolicy="no-referrer"${attrs}></iframe>`;
  const ext = safeHttps(url);
  return `<div class="${cls} frame-blocked">${ext
    ? `<a href="${esc(ext)}" target="_blank" rel="noopener noreferrer">Открыть страницу ↗</a>`
    : 'Ссылка недоступна.'}</div>`;
}
