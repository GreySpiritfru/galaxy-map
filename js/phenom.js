/* ============================================================
   Окно-вкладыш мировой точки — в отличие от .system-overlay, карта галактики
   под ним не закрывается, только затемняется по краям (см. .phenom-overlay).

   ⚠️ Это НИЖНИЙ СЛОЙ окна мировой точки, а не «окно Фенома»: в нём
   открывается любая точка world.json. Само содержимое рисует общий
   js/node-window.js, здесь — только хозяйство слоя и своя карта точки для
   тех, у кого заполнено поле "submap" (сейчас это один Феном).
   Верхний слой — js/stories.js, он нужен, чтобы точка, открытая из окна
   родителя, легла ПОВЕРХ него.

   Своя карта Фенома (с 07.10.2026) — схема корабля, страница ship/ (PixiJS) во
   фрейме, вкладкой «🗺️ Карта». До этого была тайловая картинка 21284×9902
   через OpenSeadragon (phenom-tiles/, 41 МБ) — убрана целиком. Персонажи с
   submapX/submapY рисуются САМОЙ схемой (window.__ship.setChars, фрейм того же
   сайта — доступ напрямую), координаты — единицы схемы (пиксели бокового
   вида × 10). */
import { closeModal } from './modal.js?v=208';
import { renderNodeContent, applyNodeToolbar, renderNodeLinks, syncDock } from './node-window.js?v=208';

const phenomOverlay = document.getElementById('phenomOverlay');
const phenomInfoContent = document.getElementById('phenomInfoContent');
// Ряд переходов к детям окна (renderNodeLinks в node-window.js).
const phenomLinks = document.getElementById('phenomLinks');
let currentSubmap = null; // поле submap открытой точки ({type: 'ship'})

const refs = {
  toolbar: document.getElementById('phenomToolbar'),
  desc: document.getElementById('phenomDescriptionTab'),
  article: document.getElementById('phenomArticleTab'),
  game: document.getElementById('phenomGameTab'),
  body: document.getElementById('phenomInfoContent'),
  edit: document.getElementById('phenomEdit'),
};

/* ============================================================
   Своя карта — ВКЛАДКА поверх тела окна (✕ закрывает окно целиком). Фрейм
   ship/ создаётся при открытии и УДАЛЯЕТСЯ при уходе с вкладки: схема рисует
   каждый кадр (кольца), спрятанный фрейм крутил бы его впустую. Повторное
   открытие — заново с общего вида, страница и PixiJS приходят из кэша.
   Фрейм кончается над плашкой окна, строка плашки на карте спрятана (у схемы
   своя панель частей корабля внизу).
   ============================================================ */
const phenomMapTab = document.getElementById('phenomMapTab');
const phenomShipEl = document.getElementById('phenomShip');
let shipFrame = null;

// API схемы (window.__ship) появляется после её загрузки — ждём.
function withShip(fn) {
  const frame = shipFrame;
  if (!frame) return;
  let tries = 0;
  const poll = () => {
    if (frame !== shipFrame) return;
    let api = null;
    try { api = frame.contentWindow && frame.contentWindow.__ship; } catch (e) { api = null; }
    if (api && api.setChars) { fn(api); return; }
    if (++tries < 600) setTimeout(poll, 50);
  };
  poll();
}

/* Редактор (js/editor.js): следующий тап по схеме отдаётся сюда как точка в
   единицах схемы (submapX/submapY). Одноразовый: после тапа сбрасывается. */
let submapPickHandler = null;
let submapPickAbort = null; // окно закрыли (✕, «назад», тап по фону), не выбрав место
export function setSubmapPickHandler(fn, onAbort) {
  submapPickHandler = fn;
  submapPickAbort = fn ? (onAbort || null) : null;
  armShipPick();
}
function armShipPick() {
  if (!submapPickHandler) { withShip(api => api.pick(null)); return; }
  withShip(api => api.pick(p => {
    const handler = submapPickHandler;
    submapPickHandler = null;
    submapPickAbort = null;
    if (handler) handler(p);
  }));
}

/* Персонажи поддерева точки с submapX/submapY — список и обработчик тапа
   прокидывает map.js (там граф связей), рисует их схема. */
let shipChars = [];
let onShipCharSelect = null;
const sendChars = api => api.setChars(shipChars, id => onShipCharSelect && onShipCharSelect(id));
export function setSubmapCharacters(list, onSelect) {
  shipChars = list;
  onShipCharSelect = onSelect;
  withShip(sendChars);
}

let phenomArmed = false;

/* Единственная точка входа в это окно снаружи: показывает ЛЮБУЮ мировую
   точку (view из map.js); у точки со своей картой есть вкладка «🗺️ Карта». */
export function openWorldWindow(view, handlers) {
  currentSubmap = view.submap || null;
  showBase();
  phenomOverlay.classList.add('open');
  renderNodeContent(phenomInfoContent, view);
  // «Описание»/«Статья» со своей карты — сначала уйти с карты.
  applyNodeToolbar(refs, view, {...(handlers || {}), beforeBody: showBase});
  renderNodeLinks(phenomLinks, view, handlers || {});
  phenomMapTab.hidden = !currentSubmap;
  phenomArmed = false;
  setTimeout(() => { phenomArmed = true; }, 300);
}

function showBase() {
  if (!phenomOverlay.classList.contains('map-view')) return;
  phenomOverlay.classList.remove('map-view');
  phenomMapTab.classList.remove('active');
  shipFrame = null;
  phenomShipEl.hidden = true;
  phenomShipEl.textContent = '';
  phenomInfoContent.hidden = false;
  const card = phenomOverlay.querySelector('.phenom-card');
  if (card) syncDock(card);   // строка плашки вернулась
  // Подсветку «Описание»/«Статья» ставит showNodeBody (js/node-window.js).
}

export function openSubmapView() {
  if (!currentSubmap || !isPhenomOpen() || isSubmapViewOpen()) return;
  phenomOverlay.classList.add('map-view');
  phenomMapTab.classList.add('active');
  const card = phenomOverlay.querySelector('.phenom-card');
  if (card && card.__showDock) card.__showDock();
  refs.desc.classList.remove('active');
  refs.article.classList.remove('active');
  refs.game.classList.remove('active');
  phenomInfoContent.hidden = true;
  phenomShipEl.hidden = false;
  // Строка плашки спряталась — высота плашки другая; наблюдатель за размером
  // мог промолчать (плашка в этот момент «в движении»), меряем сами.
  if (card) syncDock(card);
  const frame = document.createElement('iframe');
  frame.src = 'ship/?v=208';
  frame.title = 'Схема корабля Феном';
  phenomShipEl.appendChild(frame);
  shipFrame = frame;
  withShip(sendChars);
  armShipPick();
}

export function closeSubmapView() {
  if (!isSubmapViewOpen()) return;
  showBase();
  // Назад на ту вкладку тела, с которой уходили на карту (dataset.tab ставит
  // showNodeBody: desc / article / game).
  const tab = phenomInfoContent.dataset.tab || 'desc';
  refs.desc.classList.toggle('active', tab === 'desc');
  refs.article.classList.toggle('active', tab === 'article');
  refs.game.classList.toggle('active', tab === 'game');
}

export function isSubmapViewOpen() {
  return isPhenomOpen() && phenomOverlay.classList.contains('map-view');
}

phenomMapTab.addEventListener('click', () => {
  if (isSubmapViewOpen()) closeSubmapView();
  else openSubmapView();
});

// Открыто ли окно-вкладыш сейчас — нужно снаружи (js/navigation.js) для
// единого "шага назад" (ESC/Telegram BackButton/history браузера).
export function isPhenomOpen() {
  return phenomOverlay.classList.contains('open');
}

export function closePhenom() {
  closeModal(); // если поверх открыто "Описание Феном" — не оставлять его висеть над картой
  phenomOverlay.classList.remove('open');
  showBase();
  // Закрыли, не выбрав место для редактора, — отменяем выбор, иначе полоска
  // «тапни, где стоит…» висела бы над картой, а следующий тап по Феному
  // молча записал бы координату.
  if (submapPickHandler) {
    const abort = submapPickAbort;
    submapPickHandler = null;
    submapPickAbort = null;
    if (abort) abort();
  }
}

// ✕ (#phenomClose) вешает js/navigation.js (closeTop) — единая точка входа
// для всех «закрывающих» кнопок.
phenomOverlay.addEventListener('click', (e) => {
  if (!phenomArmed) return;
  if (e.target === phenomOverlay) closePhenom();
});
