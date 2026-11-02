/* ============================================================
   Планшет над картой (02.11.2026, перенос планшета шаг 5).

   Режим «Ноды», ▦ — планшет ↔ граф (решение владельца 02.11: планшет
   занимает место раскладки «по разделам»). Планшет — отдельная страница
   planshet/ во фрейме (как схема корабля ship/): её код и стили (макет N6)
   не смешиваются со styles.css карты, у неё своя прокрутка. Фрейм создаётся
   при первом показе и дальше только прячется — выпуск, поиск и прокрутка
   остаются, когда игрок вернулся с окна записи или с графа.
   Записи планшет открывает окнами карты: window.__mapOpenRecord (map.js).
   ============================================================ */
const surface = document.getElementById('planshetSurface');
const dock = document.getElementById('controls');
// Версия страницы планшета — та же, что ?v= внутри planshet/ (index.html и импорты).
const PV = 1;
let frame = null;

/* Планшет — на весь экран, панель карты плавает поверх него (как над картой); внизу
   страницы — отступ на высоту панели (её высота меняется: две строки на узком экране),
   чтобы конец списка докручивался из-под неё. */
function fit() {
  if (!surface || surface.hidden || !dock || !frame) return;
  const pad = dock.offsetHeight + 24 + 'px';
  try { frame.contentDocument.documentElement.style.setProperty('--dock-pad', pad); } catch (e) { /* ещё грузится */ }
}
window.addEventListener('resize', fit);

export function showPlanshet(on) {
  if (!surface) return;
  if (on && !frame) {
    frame = document.createElement('iframe');
    frame.src = `planshet/?v=${PV}`;
    frame.title = 'Планшет: события, сюжеты, маркеры, Феном, персонажи, статьи';
    frame.addEventListener('load', fit);
    surface.appendChild(frame);
  }
  surface.hidden = !on;
  document.body.classList.toggle('planshet-on', !!on);
  fit();
}

export function isPlanshetShown() {
  return !!surface && !surface.hidden;
}

export function planshetSurface() { return surface; }
