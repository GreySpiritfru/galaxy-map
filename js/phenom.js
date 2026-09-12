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

   ⚠️ Физически это ОДНО окно на весь проект (единственный `.phenom-overlay`
   в разметке), но КАКУЮ карту в нём показывать — решает не этот файл, а
   данные: маркер в markers.json, у которого заполнено поле "submap"
   ({type, source, initialZoom}), передаёт свой submap сюда через
   openSubmap(config) (вызывается из js/map.js, см. graph.js — узел с полем
   submap считается "точкой входа" в такое окно, а не жёстко зашитый id
   "phenome"). Сейчас submap есть только у Фенома, но когда появится второй
   такой маркер (другая локация со своей картой/картинкой) — этому же окну
   достаточно будет открыть ЕГО source, а characters.json так же сможет
   привязывать персонажей к НЕМУ через submapX/submapY (см. ниже). Если
   когда-нибудь потребуется открывать ДВА таких окна одновременно — вот тут
   придётся заводить второй экземпляр overlay/viewer, сейчас это не нужно
   (как и везде в проекте, одновременно открыто максимум одно окно-вкладыш). */
import { closeModal, isArticleOpen, escapeHtml } from './modal.js?v=50';

const phenomOverlay = document.getElementById('phenomOverlay');
let phenomViewer = null;
let currentSubmap = null; // {type, source, initialZoom} — конфиг из markers.json, с которым сейчас открыт viewer

const SUBMAP_DEFAULT_ZOOM = 2.2; // если у submap нет своего initialZoom — во сколько раз ближе домашнего вида открывать по умолчанию

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
    if (!window.PHENOM_DEBUG || !phenomViewer.world.getItemCount()) return;
    const tiledImage = phenomViewer.world.getItemAt(0);
    const viewportPoint = phenomViewer.viewport.pointFromPixel(e.position);
    const imagePoint = tiledImage.viewportToImageCoordinates(viewportPoint);
    console.log('[submap] submapX/submapY:', Math.round(imagePoint.x), Math.round(imagePoint.y));
  });
}

/* Вкладки сюжетов, привязанных к Феному ("parent": "phenome" в stories.json).
   Сам список и переход прокидывает сюда map.js — там есть и граф связей, и
   камера; ровно та же схема, что у setCharacterNavigator в stories.js. Тут
   только отрисовка, чтобы phenom.js не знал ни про граф, ни про то, как
   открываются окна сюжетов.

   Вкладки добавляются в ТОТ ЖЕ ряд, что и "Описание Фенома" (.phenom-toolbar
   с классом .tabbar), а не отдельной строкой под ним — ряд один на всё меню
   окна, как у статей-справочников. Поэтому кнопки тут строятся в точности как
   разметка .tabbar-btn в index.html: иконка сверху, мелкая подпись снизу. */
// Строго по id, а не по классам: у окна сюжета разметка та же самая
// (.phenom-overlay > .phenom-card > .phenom-toolbar), и селектор по классам
// отличал бы их только порядком в index.html — то есть случайно.
const phenomToolbar = document.getElementById('phenomToolbar');
export function setPhenomChildren(items, goTo) {
  phenomToolbar.querySelectorAll('.phenom-story-tab').forEach(el => el.remove());
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'tabbar-btn phenom-story-tab';
    btn.innerHTML = '<span class="tabbar-btn-icon" aria-hidden="true"></span><span class="tabbar-btn-label"></span>';
    btn.querySelector('.tabbar-btn-icon').textContent = item.icon;
    btn.querySelector('.tabbar-btn-label').textContent = item.label;
    btn.title = item.label;
    btn.addEventListener('click', () => {
      closePhenom(); // иначе сюжет откроется поверх окна Феном и оно останется висеть под ним
      goTo(item.id);
    });
    phenomToolbar.appendChild(btn);
  });
}

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
    const tracker = new OpenSeadragon.MouseTracker({
      element: el,
      clickHandler: () => { if (onPhenomCharSelect) onPhenomCharSelect(c.id); },
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
  vp.panTo(point, false);
  // Не отдаляем, если и так уже приближены сильнее — только подтягиваем
  // зум минимум до комфортного уровня, чтобы не дёргать вид туда-сюда.
  const targetZoom = vp.getHomeZoom() * (currentSubmap.initialZoom || SUBMAP_DEFAULT_ZOOM);
  if (vp.getZoom() < targetZoom) vp.zoomTo(targetZoom, null, true);
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

/* Единственная точка входа в это окно снаружи. config — это data.submap
   узла графа ({type, source, initialZoom}, см. markers.json и шапку файла).
   Если viewer уже создан (окно открывали раньше в этой сессии) и запрошен
   ДРУГОЙ source — переоткрываем его через viewer.open(), не пересоздавая
   OpenSeadragon с нуля; тот же 'open'-обработчик сам подхватит новый зум и
   перерисует маркеры персонажей для новой карты. */
export function openSubmap(config) {
  const changed = phenomViewer && currentSubmap && currentSubmap.source !== config.source;
  currentSubmap = config;
  phenomOverlay.classList.add('open');
  if (changed) phenomViewer.open(config.source);
  else ensurePhenomViewer();
  phenomArmed = false;
  setTimeout(() => { phenomArmed = true; }, 300);
}

// Открыто ли окно-вкладыш сейчас — нужно снаружи (js/navigation.js) для
// единого "шага назад" (ESC/Telegram BackButton/history браузера).
export function isPhenomOpen() {
  return phenomOverlay.classList.contains('open');
}

export function closePhenom() {
  closeModal(); // если поверх открыто "Описание Феном" — не оставлять его висеть над картой
  phenomOverlay.classList.remove('open');
}

document.getElementById('phenomClose').addEventListener('click', () => {
  // Кнопка одна и та же и в самом окне Феном, и (пристыкованная) поверх
  // открытой статьи — но "на шаг назад" должно означать разное в двух этих
  // случаях: если сейчас читаем статью, сначала просто закрыть её и
  // вернуться к карте Феном, а не выпрыгивать сразу в карту галактики.
  if (isArticleOpen()) closeModal();
  else closePhenom();
});
phenomOverlay.addEventListener('click', (e) => {
  if (!phenomArmed) return;
  if (e.target === phenomOverlay) closePhenom();
});
