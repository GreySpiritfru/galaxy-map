/* ============================================================
   Окно-вкладыш "Корабль-город Феном" — в отличие от .system-overlay,
   карта галактики под ним не закрывается, только затемняется по краям
   (см. .phenom-overlay). Внутри — тайловая карта через OpenSeadragon (см.
   ensurePhenomViewer): исходная иллюстрация огромная (21284x9902px для
   Фенома) — грузить её целиком нельзя, тот же класс бага, что уже был с
   4096px-текстурой в map.svg, тут тайлы решают его в принципе, подгружая
   только видимые кусочки. OpenSeadragon (глобальная UMD-сборка с cdnjs)
   грузится ТОЛЬКО при первом открытии своей карты точки — loadOpenSeadragon
   ниже. До v=187 он стоял <script> в <head> index.html и задерживал запуск
   всей карты (271 КБ, а cdnjs — Cloudflare, в РФ местами тормозит).

   ⚠️ Это НИЖНИЙ СЛОЙ окна мировой точки, а не «окно Фенома»: в нём
   открывается любая точка world.json. Само содержимое рисует общий
   js/node-window.js, здесь — только хозяйство слоя и тайловая карта для тех
   точек, у которых заполнено поле "submap" (сейчас это один Феном). Верхний
   слой — js/stories.js, он нужен, чтобы точка, открытая из окна родителя,
   легла ПОВЕРХ него.

   ⚠️ До 23.09.2026 «что показать» решал тип внутри submap: "dzi" — тайлы,
   "info" — готовый текст (так был сделан Авалон). Второго типа больше нет:
   точка без своей карты — это просто точка, и текст ей рисует тот же общий
   код, что и всем остальным. characters.json привязывает персонажей к любой
   точке с тайловой картой через submapX/submapY (см. ниже). */
import { closeModal, escapeHtml } from './modal.js?v=205';
import { renderNodeContent, applyNodeToolbar, renderNodeLinks, syncDock } from './node-window.js?v=205';

const phenomOverlay = document.getElementById('phenomOverlay');
const phenomViewerEl = document.getElementById('phenomViewer'); // DOM-элемент; не путать с phenomViewer — экземпляром OpenSeadragon ниже
const phenomInfoContent = document.getElementById('phenomInfoContent');
// Ряд переходов к детям окна (renderNodeLinks в node-window.js).
const phenomLinks = document.getElementById('phenomLinks');
let phenomViewer = null;
let currentSubmap = null; // {type, source, initialZoom} — конфиг из markers.json, с которым сейчас открыт viewer

/* Редактор (js/editor.js): следующий тап по карте локации отдаётся сюда как
   пиксель исходного изображения (submapX/submapY) — вместо печати в консоль
   PHENOM_DEBUG. Одноразовый: после тапа сбрасывается. */
let submapPickHandler = null;
let submapPickAbort = null; // окно закрыли (✕, «назад», тап по фону), не выбрав место
export function setSubmapPickHandler(fn, onAbort) {
  submapPickHandler = fn;
  submapPickAbort = fn ? (onAbort || null) : null;
}
function finishSubmapPick(p) {
  const handler = submapPickHandler;
  submapPickHandler = null;
  submapPickAbort = null;
  handler(p);
}

const SUBMAP_DEFAULT_ZOOM = 2.2; // если у submap нет своего initialZoom — во сколько раз ближе домашнего вида открывать по умолчанию
// Во сколько раз ближе домашнего вида камера подлетает к персонажу из списка 👥
// (минимум — если игрок уже приблизился сильнее, не отдаляем).
const SUBMAP_CHAR_FOCUS_ZOOM = 6;

const OSD_URL = 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/5.0.1/openseadragon.min.js';
const OSD_SRI = 'sha512-gPZzE+sKmE0kvcjMxW431ef5b5T5QOADV9Gij0isPw2oLATd1IZW7dmDmKh7F2e5BfwjQyAfFp3/OF0fVMOF7Q==';
let osdPromise = null;
function loadOpenSeadragon() {
  if (window.OpenSeadragon) return Promise.resolve();
  if (!osdPromise) {
    osdPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = OSD_URL;
      // Хеш файла (v=202, аудит): подмена на CDN — не выполнится. Совпадает с
      // опубликованным cdnjs (api.cdnjs.com, поле sri). Новая версия — новый хеш.
      s.integrity = OSD_SRI;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve();
      // Не загрузилось — следующая попытка при следующем открытии карты.
      s.onerror = () => { osdPromise = null; s.remove(); reject(new Error('OpenSeadragon')); };
      document.head.appendChild(s);
    });
  }
  return osdPromise;
}

function ensurePhenomViewer() {
  if (phenomViewer) return;
  phenomViewer = OpenSeadragon({
    id: 'phenomViewer',
    tileSources: currentSubmap.source,
    showNavigationControl: false,
    // Тап без перетаскивания не должен зумить — как и на карте галактики,
    // где клик срабатывает только по конкретным точкам/подписям, а не по фону.
    gestureSettingsMouse: { clickToZoom: false },
    gestureSettingsTouch: { clickToZoom: false },
    visibilityRatio: 1,
    constrainDuringPan: true,
  });
  // По умолчанию OSD открывает вид карты целиком (мельче некуда) — сразу
  // приближаем чуть сильнее, чтобы не нужно было каждый раз докручивать
  // колесом/щипком вручную перед тем, как рассмотреть район. currentSubmap
  // читаем ЗАНОВО при каждом 'open' (а не захватываем один раз в замыкание),
  // потому что тем же самым viewer'ом может переоткрыться ДРУГАЯ карта —
  // см. openSubmap ниже.
  phenomViewer.addHandler('open', () => {
    setViewerStatus('');
    const vp = phenomViewer.viewport;
    // Вернулись на ту же карту после «парковки» (см. parkViewer) — тот же вид,
    // где игрок её оставил; иначе — стартовое приближение.
    if (parkedView && parkedView.source === currentSubmap.source) {
      vp.zoomTo(parkedView.zoom, null, true);
      vp.panTo(parkedView.center, true);
    } else {
      vp.zoomTo(vp.getHomeZoom() * (currentSubmap.initialZoom || SUBMAP_DEFAULT_ZOOM), null, true);
    }
    // Маркеры персонажей ставятся через imageToViewportCoordinates самого
    // TiledImage — до события 'open' его ещё нет, поэтому первая отрисовка
    // возможна только отсюда (setSubmapCharacters могли вызвать до того, как
    // это окно вообще открывали хоть раз).
    renderPhenomCharOverlays();
  });
  // Калибровка координат для characters.json (submapX/submapY): window.
  // PHENOM_DEBUG = true в консоли — и тап по карте печатает пиксельные
  // координаты клика (то же по смыслу, что режим 📍 у главной карты, только
  // временное и без своего UI — карта Феном меняется намного реже).
  phenomViewer.addHandler('canvas-click', (e) => {
    // e.quick = короткий тап без перетаскивания; конец драга кликом не считаем.
    if (!e.quick || !phenomViewer.world.getItemCount()) return;
    if (!submapPickHandler && !window.PHENOM_DEBUG) return;
    const tiledImage = phenomViewer.world.getItemAt(0);
    const viewportPoint = phenomViewer.viewport.pointFromPixel(e.position);
    const imagePoint = tiledImage.viewportToImageCoordinates(viewportPoint);
    if (submapPickHandler) {
      const size = tiledImage.getContentSize();
      if (imagePoint.x < 0 || imagePoint.y < 0 || imagePoint.x > size.x || imagePoint.y > size.y) return;
      finishSubmapPick({x: imagePoint.x, y: imagePoint.y});
      return;
    }
    console.log('[submap] submapX/submapY:', Math.round(imagePoint.x), Math.round(imagePoint.y));
  });
}

/* Ряд-таббар этого слоя. Строго по id, а не по классам: у верхнего слоя
   разметка та же самая (.phenom-overlay > .phenom-card > .phenom-toolbar), и
   селектор по классам отличал бы их только порядком в index.html — то есть
   случайно. Что показать в ряду, решает общий js/node-window.js. */
const refs = {
  toolbar: document.getElementById('phenomToolbar'),
  desc: document.getElementById('phenomDescriptionTab'),
  article: document.getElementById('phenomArticleTab'),
  game: document.getElementById('phenomGameTab'),
  body: document.getElementById('phenomInfoContent'),
  edit: document.getElementById('phenomEdit'),
};

/* Персонажи, у которых есть submapX/submapY в characters.json — точки
   ВНУТРИ этого тайлового окна, а не на карте галактики. Это независимая
   система координат (map.js/graph.js её вообще не касается): submapX/
   submapY — пиксели исходного изображения ТЕКУЩЕГО submap (для Фенома —
   21284×9902, см. phenom-tiles/phenom.dzi), OpenSeadragon переводит их в
   свои "видовые" координаты через imageToViewportCoordinates самого
   TiledImage. Список и обработчик клика по маркеру прокидывает map.js (там
   граф связей) — тут только отрисовка и навигация внутри самого окна. */
let phenomCharacters = [];   // [{id, name, x, y}] — координаты в пикселях исходного изображения текущего submap
let onPhenomCharSelect = null;
let phenomCharOverlays = [];

const phenomCharNav = document.getElementById('phenomCharNav');
const phenomCharNavBtn = document.getElementById('phenomCharNavBtn');
const phenomCharNavList = document.getElementById('phenomCharNavList');

function clearPhenomCharOverlays() {
  phenomCharOverlays.forEach(({el, tracker}) => {
    try { tracker.destroy(); } catch (e) {}
    try { phenomViewer.removeOverlay(el); } catch (e) {}
  });
  phenomCharOverlays = [];
}

/* ⚠️ Обычный el.addEventListener('click', ...) тут НЕ РАБОТАЕТ с мышью —
   баг, найденный игроком (на телефоне тап открывал анкету, на компьютере
   курсор менялся на "палец", а клик не срабатывал). Причина: OpenSeadragon
   вешает СВОЙ MouseTracker на канвас в capture-фазе, чтобы отличать клик от
   начала перетаскивания карты — и мышиный click до вложенного оверлея
   попросту не долетает, тracker перехватывает и гасит событие раньше. На
   тач-устройствах это не мешает, потому что тап без сдвига браузер
   синтезирует в отдельный нативный click уже после того, как OSD обработал
   сам тач-жест — а вот с мышью OSD и наш div конкурируют за один и тот же
   mousedown/mouseup. Правильное решение по документации OpenSeadragon —
   повесить СВОЙ OpenSeadragon.MouseTracker прямо на элемент оверлея: эти
   трекеры спроектированы уживаться друг с другом, а обычный DOM-листенер —
   нет. Кто ещё захочет повесить клик на оверлей внутри OSD — грабля та же. */
function renderPhenomCharOverlays() {
  if (!phenomViewer || !phenomViewer.world.getItemCount()) return;
  clearPhenomCharOverlays();
  const tiledImage = phenomViewer.world.getItemAt(0);
  phenomCharacters.forEach(c => {
    const el = document.createElement('div');
    el.className = 'phenom-char-marker';
    el.title = c.name;
    // Раньше маркер был всегда голым цветным квадратиком — портрет (c.image),
    // хоть и был в characters.json (см. Ледо/Текила), никогда не подставлялся
    // сюда, в отличие от того же персонажа на общей карте галактики и в
    // выпадающем списке (.story-character-chip). Тот же паттерн, что и там:
    // картинка или заглушка-буква, и откат на заглушку, если путь битый.
    el.innerHTML = c.image
      ? `<img src="${escapeHtml(c.image)}" alt="">`
      : `<span class="story-character-fallback">${escapeHtml((c.name || '?').trim().charAt(0))}</span>`;
    const img = el.querySelector('img');
    if (img) {
      img.addEventListener('error', () => {
        el.innerHTML = `<span class="story-character-fallback">${escapeHtml((c.name || '?').trim().charAt(0))}</span>`;
      });
    }
    const tracker = new OpenSeadragon.MouseTracker({
      element: el,
      clickHandler: (e) => {
        // MouseTracker зовёт clickHandler и в конце перетаскивания, если палец
        // отпустили над маркером: карту тянули, а открывалась анкета.
        // quick — короткий тап без сдвига (как у canvas-click выше).
        if (!e.quick) return;
        // Выбор места в редакторе: тап по чужому маркеру = «встать рядом с
        // ним», а не открыть его окно поверх незаконченного выбора.
        if (submapPickHandler) { finishSubmapPick({x: c.x, y: c.y}); return; }
        if (onPhenomCharSelect) onPhenomCharSelect(c.id);
      },
    });
    tracker.setTracking(true);
    const point = tiledImage.imageToViewportCoordinates(c.x, c.y);
    phenomViewer.addOverlay({element: el, location: point, placement: OpenSeadragon.Placement.CENTER});
    phenomCharOverlays.push({el, tracker});
  });
}

function panToPhenomChar(c) {
  if (!phenomViewer || !phenomViewer.world.getItemCount()) return;
  const tiledImage = phenomViewer.world.getItemAt(0);
  const point = tiledImage.imageToViewportCoordinates(c.x, c.y);
  const vp = phenomViewer.viewport;
  // Не отдаляем, если и так уже приближены сильнее — только подтягиваем
  // зум минимум до фиксированного уровня «к персонажу». Раньше минимум был
  // тем же, что при открытии карты (initialZoom), и персонаж оставался
  // точкой среди целого района.
  const targetZoom = vp.getHomeZoom() * Math.max(SUBMAP_CHAR_FOCUS_ZOOM, currentSubmap.initialZoom || SUBMAP_DEFAULT_ZOOM);
  // Зум вокруг центра (null), а не вокруг точки: иначе он сдвигает центр
  // и спорит с panTo — персонаж оставался сбоку, а не посередине.
  if (vp.getZoom() < targetZoom) vp.zoomTo(targetZoom, null, false);
  vp.panTo(point, false);
}

/* Список персонажей — карточки-портреты (тот же язык, что у
   .story-character-chip внутри окна сюжета, см. js/stories.js/css/styles.css:
   квадрат со скруглением, аватар или заглушка-буква), а не текстовые
   кнопки — так их узнаваемо по лицу, а не по имени в столбик. В один ряд
   помещается 2-3 штуки, остальные — горизонтальным скроллом вбок
   (.phenom-char-nav-list становится строкой flex вместо колонки). */
function renderPhenomCharList() {
  phenomCharNavList.innerHTML = phenomCharacters.map(c => `
    <button class="phenom-char-nav-item story-character-chip" data-char-id="${escapeHtml(c.id)}" title="${escapeHtml(c.name || '')}">
      ${c.image
        ? `<img src="${escapeHtml(c.image)}" alt="">`
        : `<span class="story-character-fallback">${escapeHtml((c.name || '?').trim().charAt(0))}</span>`}
    </button>`).join('');
  phenomCharNavList.querySelectorAll('.phenom-char-nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const c = phenomCharacters.find(ch => ch.id === btn.dataset.charId);
      if (!c) return;
      phenomCharNavList.hidden = true;
      panToPhenomChar(c);
    });
  });
  phenomCharNav.hidden = !phenomCharacters.length;
}

/* Список персонажей внутри текущего submap-окна и колбэк открытия окна
   персонажа (переданный из map.js — там граф связей) прокидываются сюда
   одним вызовом, как и setPhenomChildren выше. Имя общее (не "Phenom..."),
   потому что вызывающая сторона (js/map.js) собирает этот список для ЛЮБОГО
   маркера с полем submap, а не только для Фенома — см. комментарий в шапке
   файла. */
export function setSubmapCharacters(list, onSelect) {
  phenomCharacters = list;
  onPhenomCharSelect = onSelect;
  renderPhenomCharList();
  renderPhenomCharOverlays();
}

phenomCharNavBtn.addEventListener('click', () => {
  phenomCharNavList.hidden = !phenomCharNavList.hidden;
});
phenomOverlay.addEventListener('click', (e) => {
  // Клик мимо кнопки/списка — закрыть выпадающий список, если он открыт
  // (тот же принцип, что у "⋯" на карте галактики).
  if (!phenomCharNavList.hidden && !phenomCharNav.contains(e.target)) {
    phenomCharNavList.hidden = true;
  }
});

let phenomArmed = false;

/* Единственная точка входа в это окно снаружи: показывает ЛЮБУЮ мировую
   точку (view из map.js). Содержимое зависит от того, есть ли у точки своя
   карта:
     есть submap — тайлы OpenSeadragon (Феном), список персонажей 👥 и всё
                   остальное хозяйство этого файла;
     нет submap — обычное содержимое окна (баннеры/заголовок/описание/
                   персонажи), которое рисует общий js/node-window.js.
   Раньше вторая ветка была «submap типа info» — отдельным типом данных ради
   одной локации (Кольцо Авалона). Теперь это просто точка без своей карты, а
   тип остался только у настоящей тайловой карты.

   ⚠️ Если viewer уже создан (окно открывали раньше в этой сессии) и запрошена
   ДРУГАЯ карта — переоткрываем через viewer.open(), не пересоздавая
   OpenSeadragon с нуля; тот же 'open'-обработчик сам подхватит новый зум и
   перерисует маркеры персонажей. */
export function openWorldWindow(view, handlers) {
  currentSubmap = view.submap || null;
  showBase();
  phenomOverlay.classList.add('open');
  renderNodeContent(phenomInfoContent, view);
  // «Описание»/«Статья» со своей карты — сначала уйти с карты.
  applyNodeToolbar(refs, view, {...(handlers || {}), beforeBody: showBase});
  renderNodeLinks(phenomLinks, view, handlers || {});
  phenomMapTab.hidden = !currentSubmap;
  phenomShipTab.hidden = !currentSubmap;
  phenomArmed = false;
  setTimeout(() => { phenomArmed = true; }, 300);
}

/* ============================================================
   Своя карта точки — ВИД поверх её описания, а не её окно (24.09.2026).

   До этого точка с полем submap (Феном) открывалась сразу картой, а у
   остальных точек было описание — Феном был единственной точкой с другим
   окном, и из-за этого его «статья» и «карта» жили в разных местах
   (статья — вкладкой в окне, карта — половинкой вкладки справочника). Теперь
   у любой точки одно и то же базовое окно (описание + ряд переходов), а своя
   карта — кнопка «🗺️ Карта» в панели, у тех, у кого она есть.

   Для навигации это ВКЛАДКА, а не уровень (с v=144): ✕ на карте закрывает
   окно целиком, как на «Статье»; в v=134 карта была уровнем и ✕ становился ↩.

   На карте ряда переходов нет, а на описании нет 👥: переходы к детям и
   список персонажей на карте — разные задачи, и показывать их разом значило
   дублировать персонажей (замечание игрока про Ледо и Текилу) и отнимать у
   карты место.
   ============================================================ */
const phenomMapTab = document.getElementById('phenomMapTab');
let openedSource = null; // какой .dzi сейчас загружен во viewer

/* ⚠️ «Парковка» viewer'а (v=200, аудит 04.10.2026). OpenSeadragon, пока у
   него открыта картинка, крутит requestAnimationFrame без остановки — даже
   когда окно закрыто (замер облака: 0 вызовов/с до первого открытия карты
   Фенома, ~80/с после — до конца сессии; на телефоне это и батарея, и
   конкуренция с кадрами карты). Ушли с карты — закрываем картинку
   (viewer.close(): цикл встаёт), запомнив вид; вернулись — open() снова,
   тайлы приходят из кэша браузера, вид восстанавливает обработчик 'open'. */
let parkedView = null;
function parkViewer() {
  if (!phenomViewer || !openedSource) return;
  try {
    const vp = phenomViewer.viewport;
    parkedView = {source: openedSource, center: vp.getCenter(), zoom: vp.getZoom()};
  } catch (e) { parkedView = null; }
  phenomViewer.close();
  openedSource = null;
}

/* Схема корабля (v=205) — тест нового вида Фенома: страница ship/ (PixiJS,
   векторный корабль с вращающимися кольцами) во фрейме, вкладкой рядом с
   «Картой». Фрейм создаётся при открытии и УДАЛЯЕТСЯ при уходе с вкладки:
   страница рисует каждый кадр (кольца), и спрятанный фрейм крутил бы его
   впустую, как OpenSeadragon до парковки. Повторное открытие — заново с
   общего вида, страница и PixiJS приходят из кэша. Кончается фрейм над
   плашкой окна: внизу у страницы своя панель частей корабля. */
const phenomShipTab = document.getElementById('phenomShipTab');
const phenomShipEl = document.getElementById('phenomShip');

function hideShip() {
  if (!phenomOverlay.classList.contains('ship-view')) return;
  phenomOverlay.classList.remove('ship-view');
  const card = phenomOverlay.querySelector('.phenom-card');
  if (card) syncDock(card);   // строка плашки вернулась
  phenomShipTab.classList.remove('active');
  phenomShipEl.hidden = true;
  phenomShipEl.textContent = '';
}

function openShipView() {
  if (!currentSubmap || !isPhenomOpen()) return;
  showBase();
  phenomOverlay.classList.add('ship-view');
  phenomShipTab.classList.add('active');
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
  frame.src = 'ship/?v=205';
  frame.title = 'Схема корабля Феном';
  phenomShipEl.appendChild(frame);
}

function isShipViewOpen() {
  return isPhenomOpen() && phenomOverlay.classList.contains('ship-view');
}

phenomShipTab.addEventListener('click', () => {
  if (!isShipViewOpen()) { openShipView(); return; }
  // Повторный тап — назад на вкладку тела, как у «Карты».
  showBase();
  const tab = phenomInfoContent.dataset.tab || 'desc';
  refs.desc.classList.toggle('active', tab === 'desc');
  refs.article.classList.toggle('active', tab === 'article');
  refs.game.classList.toggle('active', tab === 'game');
});

function showBase() {
  hideShip();
  parkViewer();
  setViewerStatus('');
  phenomCharNavList.hidden = true;
  phenomOverlay.classList.remove('map-view');
  phenomMapTab.classList.remove('active');
  // Подсветку «Описание»/«Статья» ставит showNodeBody (js/node-window.js).
  phenomViewerEl.hidden = true;
  phenomInfoContent.hidden = false;
}

export function openSubmapView() {
  if (!currentSubmap || !isPhenomOpen()) return;
  hideShip();
  phenomOverlay.classList.add('map-view');
  phenomMapTab.classList.add('active');
  // Вкладки могли уехать при прокрутке описания — на карте они всегда на месте.
  const card = phenomOverlay.querySelector('.phenom-card');
  if (card && card.__showDock) card.__showDock();
  refs.desc.classList.remove('active');
  refs.article.classList.remove('active');
  refs.game.classList.remove('active');
  phenomInfoContent.hidden = true;
  // Сначала показать контейнер, потом создавать viewer: OpenSeadragon,
  // созданный в скрытом элементе, считает свой размер нулевым.
  phenomViewerEl.hidden = false;
  if (phenomViewer) {
    if (openedSource !== currentSubmap.source) phenomViewer.open(currentSubmap.source);
    openedSource = currentSubmap.source;
    return;
  }
  // Первое открытие: библиотеку догружаем. Пока качается, игрок мог уйти с
  // карты или закрыть окно — тогда viewer создастся при следующем открытии.
  setViewerStatus('Загрузка карты…');
  loadOpenSeadragon().then(() => {
    if (phenomViewer || !isSubmapViewOpen()) return;
    ensurePhenomViewer();
    openedSource = currentSubmap.source;
  }, () => {
    // Библиотека с cdnjs не скачалась (v=202): раньше — пустая тьма и 👥.
    setViewerStatus('Карта не загрузилась — проверь соединение.', true);
  });
}

/* Надпись поверх области карты, пока библиотека качается, или при сбое —
   с кнопкой «Повторить» (v=202, аудит). Убирается по 'open' viewer'а. */
function setViewerStatus(text, retry) {
  let el = phenomViewerEl.parentNode.querySelector(':scope > .phenom-viewer-status');
  if (!text) { if (el) el.remove(); return; }
  if (!el) {
    el = document.createElement('div');
    el.className = 'phenom-viewer-status';
    phenomViewerEl.after(el);
  }
  el.innerHTML = '<span></span>' + (retry ? '<button type="button">Повторить</button>' : '');
  el.firstChild.textContent = text;
  if (retry) el.querySelector('button').onclick = () => { setViewerStatus(''); openSubmapView(); };
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

// ✕ (#phenomClose) больше не вешается тут — js/navigation.js сам вешает на
// него closeTop(), которая уже учитывает и открытую статью поверх, И (новое,
// 13.09.2026) открытый сюжет поверх — единая точка входа для всех
// "закрывающих" кнопок сразу, дублировать эту проверку в каждом модуле
// незачем (см. комментарий в navigation.js).
phenomOverlay.addEventListener('click', (e) => {
  if (!phenomArmed) return;
  if (e.target === phenomOverlay) closePhenom();
});
