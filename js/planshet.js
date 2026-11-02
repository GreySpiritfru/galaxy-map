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
import { loadMirrorDoc } from './reader.js?v=227';

const root = document.getElementById('planshet');
const dock = document.getElementById('controls');
// Версия модулей planshet/ — та же, что ?v= в их импортах и у planshet.css.
const PV = 10;
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

/* Отступы под панель карты: --dock-top — от низа экрана до верха панели (шторка встаёт над ней),
   --dock-pad — конец ленты докручивается из-под панели. Высота панели меняется (две строки на узком
   экране, режимы), поэтому — наблюдателем. */
function fit() {
  if (!root || !dock) return;
  const r = dock.getBoundingClientRect();
  const top = r.height ? Math.max(0, window.innerHeight - r.top) : 80;
  root.style.setProperty('--dock-top', top + 'px');
  root.style.setProperty('--dock-pad', top + 16 + 'px');
}
window.addEventListener('resize', fit);
if (dock && window.ResizeObserver) new ResizeObserver(fit).observe(dock);

// Видна ли поверхность и чем: в «Нодах» — целиком; над картой — пока открыта шторка или поиск.
function sync() {
  const menuOpen = !!shell && shell.isMenuOpen(), searching = !!shell && shell.isSearchOpen();
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
  }
  document.getElementById('planshetSearch')?.classList.toggle('active', !!shell && shell.isSearchOpen());
  document.dispatchEvent(new Event('planshet-change'));
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
  if (on) ensure();
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
