/* ============================================================
   Статьи-справочники (Teletype) — единый список для всех входов: кнопок в
   углу карты галактики, кнопки "Описание Феном" внутри окна Феном, и панели
   перекрёстной навигации #refToolbar, которая пристыковывается внутрь статьи
   (тем же механизмом openIframeModal/.lore-toolbar, что и лор систем), давая
   перейти к любой из этих статей прямо во время чтения другой. Ссылка на
   "Магический лор" пока заглушка — заменить на настоящую статью, когда
   будет готова.
   ============================================================ */
import { openIframeModal, isDockedWith, modalContent, escapeHtml } from './modal.js?v=125';

export const REF_ARTICLES = {
  phenom: 'https://teletype.in/@greyspirit/4tRzyNaVfEQ#fvQz',
  races:  'https://teletype.in/@greyspirit/y7G2E4B490h#9ZO8',
  magic:  'https://teletype.in/@greyspirit/SEOWfJxAewY#LVpS',
  tech:   'https://teletype.in/@greyspirit/gf7sBYkW_di#TkgH',
  galaxy: 'https://teletype.in/@greyspirit/toTVpow7sb1#MgZX',
  // Тот же документ, что и magic (SEOWfJxAewY), другой якорь-раздел —
  // "Описание Авалона" внутри окна локации "Кольцо Авалона" (14.09.2026).
  avalon: 'https://teletype.in/@greyspirit/SEOWfJxAewY#e5M4',
};

const refToolbarEl = document.getElementById('refToolbar');

export function openRefArticle(id) {
  const url = REF_ARTICLES[id];
  if (!url) return;
  const docked = isDockedWith(refToolbarEl);
  // Клик по статье, которая и так уже открыта (повторный клик по активной
  // кнопке) — ничего не делаем: не нужно ни переоткрывать модал (это раньше
  // портило точку возврата панели — см. тот же фикс в system-view.js), ни
  // просто так перезагружать тот же iframe заново.
  const activeBtn = refToolbarEl.querySelector(`[data-ref="${id}"].active`);
  if (docked && activeBtn) return;
  // Если статья уже открыта с этой же панелью (перешли с одной статьи на
  // другую через #refToolbar) — просто подменяем iframe, не переоткрывая
  // модал заново (без лишнего повторного "выезда" шторки/анимации).
  if (docked) {
    modalContent.innerHTML = `<iframe src="${escapeHtml(url)}" loading="lazy"></iframe>`;
  } else {
    openIframeModal(url, refToolbarEl);
  }
  refToolbarEl.querySelectorAll('[data-ref]').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.ref === id);
  });
}

// Один обработчик на всё: и кнопки в углу карты (.ref-buttons), и кнопку
// "Описание Феном" в окне Феном, и саму панель #refToolbar — везде кнопки
// помечены одинаково через data-ref, ведущий на ключ в REF_ARTICLES.
document.querySelectorAll('[data-ref]').forEach(btn => {
  btn.addEventListener('click', () => openRefArticle(btn.dataset.ref));
});

// ✕ (#refToolbarClose) больше не вешается тут — js/navigation.js сам вешает
// на него closeTop() (единая точка входа для всех "закрывающих" кнопок
// сразу, см. комментарий там).
