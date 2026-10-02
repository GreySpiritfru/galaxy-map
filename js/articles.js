/* ============================================================
   Статьи-справочники (Teletype) — единый список для всех входов: кнопок в
   углу карты галактики, кнопки "Описание Феном" внутри окна Феном, и панели
   перекрёстной навигации #refToolbar, которая пристыковывается внутрь статьи
   (тем же механизмом openIframeModal/.lore-toolbar, что и лор систем), давая
   перейти к любой из этих статей прямо во время чтения другой. Ссылка на
   "Магический лор" пока заглушка — заменить на настоящую статью, когда
   будет готова.
   ============================================================ */
import { openIframeModal, isDockedWith, setModalArticle, isArticleOpen } from './modal.js?v=189';
import { normalizeUrl } from './reader.js?v=189';

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

/* ⚠️ Справочник — только статьи (24.09.2026, решение игрока). Ссылок из
   статьи в точку карты тут нет и не надо: связь идёт в одну сторону —
   кнопкой «Статья» в окне точки. Пробовали ряд маркеров под шторкой (точки,
   у которых article.ref = эта статья) — он дублировал оглавление самой
   статьи (раздел «Кольцо Авалона» внутри «Магии») и выглядел лишним. */
const refToolbarEl = document.getElementById('refToolbar');

/* at — необязательный адрес с другим якорем внутри той же статьи (ссылка из
   другой статьи справочника, см. «mirror-open» ниже). */
export function openRefArticle(id, at) {
  const url = at || REF_ARTICLES[id];
  if (!url) return;
  const docked = isDockedWith(refToolbarEl);
  // Клик по статье, которая и так уже открыта (повторный клик по активной
  // кнопке) — ничего не делаем: не нужно ни переоткрывать модал (это раньше
  // портило точку возврата панели — см. тот же фикс в system-view.js), ни
  // просто так перезагружать ту же статью заново.
  const activeBtn = refToolbarEl.querySelector(`[data-ref="${id}"].active`);
  if (docked && activeBtn && !at) return;
  // Если статья уже открыта с этой же панелью (перешли с одной статьи на
  // другую через #refToolbar) — просто подменяем содержимое, не переоткрывая
  // модал заново (без лишнего повторного "выезда" шторки/анимации).
  if (docked) {
    setModalArticle(url);
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

/* Ссылка внутри своей копии статьи на другую статью, у которой тоже есть
   копия (js/reader.js шлёт «mirror-open»). Статья справочника — во вкладку
   справочника (с якорем ссылки); любая другая — в том же модале, если он уже
   открыт, иначе в новом. */
window.addEventListener('mirror-open', (e) => {
  const url = e.detail && e.detail.url;
  if (!url) return;
  const key = normalizeUrl(url);
  const ref = Object.keys(REF_ARTICLES).find(k => k !== 'avalon' && normalizeUrl(REF_ARTICLES[k]) === key);
  if (ref) { openRefArticle(ref, url); return; }
  if (isArticleOpen()) {
    refToolbarEl.querySelectorAll('[data-ref].active').forEach(b => b.classList.remove('active'));
    setModalArticle(url);
  } else {
    openIframeModal(url);
  }
});

// ✕ (#refToolbarClose) больше не вешается тут — js/navigation.js сам вешает
// на него closeTop() (единая точка входа для всех "закрывающих" кнопок
// сразу, см. комментарий там).
