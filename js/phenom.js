/* ============================================================
   Окно-вкладыш "Корабль-город Феном" — в отличие от .system-overlay,
   карта галактики под ним не закрывается, только затемняется по краям
   (см. .phenom-overlay). Внутри — тайловая карта через OpenSeadragon (см.
   ensurePhenomViewer): исходная иллюстрация огромная (21284x9902px для
   Фенома) — грузить её целиком нельзя, тот же класс бага, что уже был с
   4096px-текстурой в map.svg, тут тайлы решают его в принципе, подгружая
   только видимые кусочки. OpenSeadragon грузится отдельным классическим
   <script> в index.html (глобальная UMD-сборка) — этот модуль просто
   использует window.OpenSeadragon.

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
import { closeModal, escapeHtml } from './modal.js?v=158';
import { renderNodeContent, applyNodeToolbar, renderNodeLinks } from './node-window.js?v=158';

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
    const vp = phenomViewer.viewport;
    vp.zoomTo(vp.getHomeZoom() * (currentSubmap.initialZoom || SUBMAP_DEFAULT_ZOOM), null, true);
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
  article: document.getElementById('phenomDescriptionTab'),
  archive: document.getElementById('phenomArchive'),
  index: document.getElementById('phenomTelegram'),
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
  applyNodeToolbar(refs, view, handlers || {});
  refs.article.onclick = () => closeSubmapView(); // со своей карты — к телу окна
  renderNodeLinks(phenomLinks, view, handlers || {});
  phenomMapTab.hidden = !currentSubmap;
  renderNodeContent(phenomInfoContent, view);
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

   Для навигации это отдельный уровень (isSubmapViewOpen в depth() js/
   navigation.js): ✕ превращается в ↩ и возвращает к описанию — ровно так же,
   как закрытие статьи, открытой поверх окна.

   На карте ряда переходов нет, а на описании нет 👥: переходы к детям и
   список персонажей на карте — разные задачи, и показывать их разом значило
   дублировать персонажей (замечание игрока про Ледо и Текилу) и отнимать у
   карты место.
   ============================================================ */
const phenomMapTab = document.getElementById('phenomMapTab');
let openedSource = null; // какой .dzi сейчас загружен во viewer

function showBase() {
  phenomOverlay.classList.remove('map-view');
  phenomMapTab.classList.remove('active');
  refs.article.classList.add('active'); // базовая вкладка — «Статья»/«Описание»
  phenomViewerEl.hidden = true;
  phenomInfoContent.hidden = false;
}

export function openSubmapView() {
  if (!currentSubmap || !isPhenomOpen()) return;
  phenomOverlay.classList.add('map-view');
  phenomMapTab.classList.add('active');
  refs.article.classList.remove('active');
  phenomInfoContent.hidden = true;
  // Сначала показать контейнер, потом создавать viewer: OpenSeadragon,
  // созданный в скрытом элементе, считает свой размер нулевым.
  phenomViewerEl.hidden = false;
  if (!phenomViewer) ensurePhenomViewer();
  else if (openedSource !== currentSubmap.source) phenomViewer.open(currentSubmap.source);
  openedSource = currentSubmap.source;
}

export function closeSubmapView() {
  if (!isSubmapViewOpen()) return;
  showBase();
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
