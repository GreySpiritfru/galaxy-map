/* ============================================================
   Планшет в карте (режим «Ноды»). С 02.11.2026 (v=219) — не страница во фрейме (было
   js/planshet-frame.js, шаг 5 переноса), а модули planshet/, которые карта грузит при первом показе
   и ставит в #planshet: без второго документа, без мостов между окнами, «назад» — общий
   (js/navigation.js зовёт planshetDepth/planshetBack). Стили — planshet/planshet.css, все внутри
   #planshet. Пока планшет закрыт, ни его код, ни стили не грузятся.

   Управление — в панели карты (index.html, #dockPlanshet): «Феном ▴» — шторка разделов, 🔍 — поиск
   сверху, ▦ — граф (map.js). Записи планшет открывает окнами карты: window.__mapOpenRecord (map.js).
   С v=227 шторка и поиск — и на карте («над картой», over): #planshet показывается без ленты (класс
   .over-map), шторка — над прозрачной подложкой (тап мимо — закрыть), поиск — своим экраном, как в «Нодах».
   Закрыли и то и другое — поверхность снова прячется. Раздел из шторки и новость из поиска — в «Ноды».
   ============================================================ */
import { loadMirrorDoc } from './reader.js?v=243';

const root = document.getElementById('planshet');
const dock = document.getElementById('controls');
// Версия модулей planshet/ — та же, что ?v= в их импортах и у planshet.css.
const PV = 24;
let shell = null, loading = null;
// nodesOn — планшет показан режимом «Ноды» (showPlanshet); over — открыт над картой шторкой или поиском.
let nodesOn = false, over = false;

/* Общие данные (v=226): карта отдаёт уже скачанные файлы (setPlanshetData из js/map.js, после реестра записей), копии
   статей — через общий кэш js/reader.js (loadMirrorDoc): статья, открытая в окне карты, и планшет качают её один
   раз. Карта не успела/не смогла — через 8 с планшет качает всё сам (planshet/model.js). */
let giveData;
const mapData = new Promise(resolve => { giveData = resolve; });
export function setPlanshetData(data) { giveData(data); }
const dataOrTimeout = () => Promise.race([mapData, new Promise(resolve => setTimeout(() => resolve({}), 8000))]);

/* Прогрев (v=236): модули и данные планшета — заранее, когда карта уже показана и браузер свободен, чтобы первое
   открытие шторки не ждало загрузки (на карте шторка — главное меню). */
export function warmPlanshet() {
  const go = () => ensure();
  if (window.requestIdleCallback) requestIdleCallback(go, {timeout: 4000}); else setTimeout(go, 1500);
}

/* Отступы под панель карты: --dock-top — от низа экрана до верха панели (шторка встаёт над ней),
   --dock-pad — конец ленты докручивается из-под панели. Высота панели меняется (две строки на узком
   экране, режимы), поэтому — наблюдателем. */
function fit() {
  if (!root || !dock) return;
  const r = dock.getBoundingClientRect();
  const top = r.height ? Math.max(0, window.innerHeight - r.top) : 80;
  root.style.setProperty('--dock-top', top + 'px');
  root.style.setProperty('--dock-pad', top + 16 + 'px');
  // Шторка — во всю ширину панели, стоит на ней (v=234; таблетка «Феном» прижата к левому краю панели): --dock-l / --dock-w.
  const bar = dock.querySelector('.dock-bar')?.getBoundingClientRect();
  if (bar?.width) { root.style.setProperty('--dock-l', bar.left + 'px'); root.style.setProperty('--dock-w', bar.width + 'px'); }
}
/* Шторка просто выезжает снизу из-за панели (v=238, владелец: «простая анимация выезда»; в v=236–237 — из центра,
   и боковые края не успевали сложиться). Едет внутренний слой .p-menu-body (transform — на видеокарте), рамка .p-menu
   его обрезает по верхнему краю панели. Отдельного появления кнопок нет. */
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const body = menu => menu.querySelector('.p-menu-body') || menu;
let opening = null;
function growMenu(menu) {
  dock?.classList.add('menu-open');
  if (reduced()) return;
  opening = body(menu).animate([{transform: 'translateY(100%)'}, {transform: 'none'}], {duration: 240, easing: 'cubic-bezier(.2,.8,.25,1)'});
}
/* Закрытие — обратно вниз; закрыли, пока ещё выезжает, — от текущего места (Codex, v=236). fill: forwards — без кадра
   целой шторки перед скрытием (её отменяет shell.js после). */
function shrinkMenu(menu) {
  if (reduced()) return null;
  const b = body(menu);
  let from = 'none';
  if (opening?.playState === 'running') { from = getComputedStyle(b).transform; opening.cancel(); }
  opening = null;
  return b.animate([{transform: from}, {transform: 'translateY(100%)'}], {duration: 170, easing: 'cubic-bezier(.4,0,1,1)', fill: 'forwards'});
}

// Видна ли поверхность и чем: в «Нодах» — целиком; над картой — пока открыта шторка или поиск.
function sync() {
  // isMenuShown: шторка ещё на экране, пока сворачивается (v=234).
  const menuOpen = !!shell && shell.isMenuShown(), searching = !!shell && shell.isSearchOpen();
  if (over && !nodesOn && !menuOpen && !searching) over = false;
  if (nodesOn) over = false;
  root.hidden = !(nodesOn || over);
  root.classList.toggle('over-map', over);
  // Экран поиска закрывает карту целиком — её можно не рисовать (как под планшетом); шторка — нет.
  document.body.classList.toggle('planshet-on', nodesOn || (over && searching));
}

// Что поменялось в планшете — кнопкам панели и «назад» карты.
function changed() {
  sync();
  const brand = document.getElementById('planshetBrand');
  if (brand && shell) {
    brand.setAttribute('aria-expanded', String(shell.isMenuOpen()));
    // aria-controls — только пока шторка на странице видна (axe: ссылка на скрытый элемент не проверяема).
    if (shell.isMenuOpen()) brand.setAttribute('aria-controls', 'planshetMenu'); else brand.removeAttribute('aria-controls');
    brand.classList.toggle('filtered', shell.filtered());
    dock?.classList.toggle('menu-open', shell.isMenuShown() && !root.hidden);
  }
  document.getElementById('planshetSearch')?.classList.toggle('active', !!shell && shell.isSearchOpen());
  document.dispatchEvent(new Event('planshet-change'));
}

/* Кнопка вида в шторке (v=229, владелец: одна кнопка, в ряду сюжетов; до v=228 — 🏷️ и ▦ на панели): на карте и в
   «Графике» — «Меньше подписей» (шторка остаётся открытой — видно, что переключилось), в «Нодах» — «Граф связей»
   (меняет вид, шторка закрывается). */
const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  labels: '<path d="M3.8 12.4V5.1c0-.7.6-1.3 1.3-1.3h7.3l8 8-8.6 8.6z"/><circle cx="8.3" cy="8.3" r="1.5"/>',
  graph: '<path d="M8 7.6l8-1.2M6.8 10.1l3.9 6.3M17.3 8.2l-4.1 8.1"/><circle cx="5.5" cy="8" r="2.5"/><circle cx="18.5" cy="6" r="2.5"/><circle cx="12" cy="18.5" r="2.5"/>',
};
function toolButton(id, icon, label, on, act, full) {
  const b = document.createElement('button');
  b.id = id;
  b.className = 'p-mini p-tool';
  b.setAttribute('aria-pressed', String(!!on));
  if (full) b.setAttribute('aria-label', full);
  const pic = document.createElement('span');
  pic.className = 'p-mini-icon';
  pic.setAttribute('aria-hidden', 'true');
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.innerHTML = ICONS[icon];
  pic.append(svg);
  const text = document.createElement('span');
  text.textContent = label;
  b.append(pic, text);
  b.onclick = act;
  return b;
}
function viewTools() {
  const st = window.__mapViewTools?.() || {};
  // Подписи — одним словом (v=232, владелец), полное название — для чтеца экрана.
  if (st.nodes) return toolButton('menuGraph', 'graph', 'Граф', st.graph, () => { shell.closeMenu(); window.__mapToggleGraph?.(); }, 'Граф связей');
  const labels = toolButton('menuLabels', 'labels', 'Надписи', st.labels, () => {
    window.__mapToggleLabels?.();
    labels.setAttribute('aria-pressed', String(!!window.__mapViewTools?.().labels));
  }, 'Меньше подписей');
  return labels;
}

function loadCss() {
  return new Promise(res => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `planshet/planshet.css?v=${PV}`;
    link.onload = link.onerror = () => res();
    document.head.append(link);
  });
}
function ensure() {
  if (!loading) {
    loading = Promise.all([import(`../planshet/app.js?v=${PV}`), loadCss(), dataOrTimeout()]).then(([m, , data]) => {
      m.setShared({...data, loadDoc: loadMirrorDoc});
      shell = m.mount(root, {
        onChange: changed,
        onHelp: () => document.getElementById('helpBtn')?.click(),
        onTour: () => window.__mapStartTour?.(),
        onShip: () => window.__mapOpenShip?.(),
        shipIcon: () => window.__mapShipIcon?.() || Promise.resolve(null),
        onLeave: () => nodesOn ? null : window.__mapToPlanshet?.(),
        tools: viewTools,
        onMenuOpen: growMenu,
        onMenuClose: shrinkMenu,
      });
      changed();
      return shell;
    });
  }
  return loading;
}

export function showPlanshet(on) {
  if (!root) return;
  nodesOn = !!on;
  over = false;
  if (on) { ensure(); shell?.refreshMenu(); }
  else if (shell) shell.closeMenu();
  if (shell) changed(); else { sync(); document.dispatchEvent(new Event('planshet-change')); }
  fit();
}

export const isPlanshetShown = () => !!root && !root.hidden;
export const planshetSurface = () => root;

// Шторка «Феном ▴» и поиск — после загрузки данных (до неё разделам нечего показать). Не в «Нодах» — над картой.
export async function togglePlanshetMenu() {
  await ensure(); await shell.ready;
  if (!nodesOn) over = true;
  shell.toggleMenu();
  changed();
}
/* 🔍 в панели — открыть поиск и тем же нажатием закрыть (владелец 02.11). Поиск, оставленный открытым в «Нодах»,
   на карте не закрывается первым нажатием, а показывается (он и так «открыт», просто не был виден). */
export async function openPlanshetSearch() {
  const s = await ensure();
  if (!nodesOn && !over) { over = true; if (s.isSearchOpen()) { changed(); return; } }
  s.toggleSearch();
  changed();
}

/* «Назад» карты (Esc, BackButton Telegram, браузер): шторка, своя карточка/новость, поиск. Окна карты
   лежат выше планшета — navigation.js спрашивает его последним. */
export const planshetDepth = () => isPlanshetShown() && shell ? shell.depth() : 0;
export const planshetBack = () => isPlanshetShown() && shell ? shell.backStep() : false;
