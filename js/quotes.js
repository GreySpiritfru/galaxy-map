/* ============================================================
   Сворачиваемая цитата — как expandable blockquote в Telegram (25.09.2026,
   v=156, просьба игрока): блок с полосой слева, свёрнут до нескольких
   строк с затуханием и ⌄ в углу, тап по нему — раскрыть/свернуть.
   Используется в подсказке «?» (onboarding.js) и в правилах обучения
   (tour.js).

   Разметка: quoteHtml(html) → <div class="tg-quote is-collapsed">…</div>.
   После вставки в страницу — initQuotes(root): у короткой цитаты, которая
   и так влезает, свёртку и ⌄ снимаем (иначе стрелка звала бы раскрыть то,
   что уже целиком видно).
   ============================================================ */
export function quoteHtml(html) {
  return `<div class="tg-quote is-collapsed" role="button" tabindex="0" aria-expanded="false">
    <div class="tg-quote-body">${html}</div>
    <span class="tg-quote-toggle" aria-hidden="true">⌄</span>
  </div>`;
}

export function initQuotes(root) {
  (root || document).querySelectorAll('.tg-quote.is-collapsed').forEach(q => {
    const body = q.querySelector('.tg-quote-body');
    if (body && body.scrollHeight <= body.clientHeight + 2) {
      q.classList.remove('is-collapsed');
      q.classList.add('is-short');
    }
  });
}

function toggle(q) {
  if (q.classList.contains('is-short')) return;
  const open = q.classList.toggle('is-open');
  q.classList.toggle('is-collapsed', !open);
  q.setAttribute('aria-expanded', open ? 'true' : 'false');
}

// Один обработчик на всю страницу: цитаты вставляются через innerHTML.
// Ссылки внутри цитаты работают как обычно — их клик цитату не сворачивает.
document.addEventListener('click', (e) => {
  if (e.target.closest('a, button')) return;
  const q = e.target.closest('.tg-quote');
  if (q) toggle(q);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const q = e.target.closest && e.target.closest('.tg-quote');
  if (q) { e.preventDefault(); toggle(q); }
});
