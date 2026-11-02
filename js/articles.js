/* ============================================================
   Статьи-справочники (Teletype): ключи справочника → адрес статьи. Нужны
   «Статье» точки с полем ref (node-window.js) и библиотеке планшета.
   До 02.11.2026 здесь же была панель справочника #refToolbar в модале и
   кнопки «Справочник» на карте — убраны: статьи в библиотеке планшета и в
   «Материалах» окон (перенос планшета, шаг 5).
   ============================================================ */
import { setModalArticle, isArticleOpen, openIframeModal } from './modal.js?v=232';
import { openRecord } from './open-record.js?v=232';

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

/* Ссылка внутри своей копии статьи на другую статью, у которой тоже есть
   копия (js/reader.js шлёт «mirror-open»). С 02.11.2026 (перенос планшета,
   шаг 4.4) — статья окном записи (openRecord, js/map.js), со своим «назад».
   Модал уже открыт (статья не из реестра) — в нём же; статьи нет в реестре —
   новый модал, как раньше. */
window.addEventListener('mirror-open', (e) => {
  const url = e.detail && e.detail.url;
  if (!url) return;
  if (isArticleOpen()) { setModalArticle(url); return; }
  openRecord(url).then(ok => { if (!ok) openIframeModal(url); });
});
