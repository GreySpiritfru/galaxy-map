/* ============================================================
   Планшет в карте (режим «Ноды»). С 02.11.2026 (v=219) — не страница во фрейме (было
   js/planshet-frame.js, шаг 5 переноса), а модули planshet/, которые карта грузит при первом показе
   и ставит в #planshet: без второго документа, без мостов между окнами, «назад» — общий
   (js/navigation.js зовёт planshetDepth/planshetBack). Стили — planshet/planshet.css, все внутри
   #planshet. Пока планшет закрыт, ни его код, ни стили не грузятся.

   Управление — в панели карты (index.html, #dockPlanshet): «Феном ▴» — шторка разделов, 🔍 — поиск
   сверху, ▦ — граф (map.js). Записи планшет открывает окнами карты: window.__mapOpenRecord (map.js).
   ============================================================ */
const root = document.getElementById('planshet');
const dock = document.getElementById('controls');
// Версия модулей planshet/ — та же, что ?v= в их импортах и у planshet.css.
const PV = 8;
let shell = null, loading = null;

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

// Что поменялось в планшете — кнопкам панели и «назад» карты.
function changed() {
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
    loading = Promise.all([import(`../planshet/app.js?v=${PV}`), loadCss()]).then(([m]) => {
      shell = m.mount(root, {
        onChange: changed,
        onHelp: () => document.getElementById('helpBtn')?.click(),
        onTour: () => window.__mapStartTour?.(),
      });
      changed();
      return shell;
    });
  }
  return loading;
}

export function showPlanshet(on) {
  if (!root) return;
  if (on) ensure();
  else if (shell) shell.closeMenu();
  root.hidden = !on;
  document.body.classList.toggle('planshet-on', !!on);
  if (shell) changed(); else document.dispatchEvent(new Event('planshet-change'));
  fit();
}

export const isPlanshetShown = () => !!root && !root.hidden;
export const planshetSurface = () => root;

// Шторка «Феном ▴» и поиск — после загрузки данных (до неё разделам нечего показать).
export async function togglePlanshetMenu() { (await ensure()); await shell.ready; shell.toggleMenu(); }
// 🔍 в панели — открыть поиск и тем же нажатием закрыть (владелец 02.11).
export async function openPlanshetSearch() { (await ensure()).toggleSearch(); }

/* «Назад» карты (Esc, BackButton Telegram, браузер): шторка, своя карточка/новость, поиск. Окна карты
   лежат выше планшета — navigation.js спрашивает его последним. */
export const planshetDepth = () => isPlanshetShown() && shell ? shell.depth() : 0;
export const planshetBack = () => isPlanshetShown() && shell ? shell.backStep() : false;
