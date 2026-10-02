/* ============================================================
   П.1: единый мобильный модал для инфо-точек, и тот же модал в
   режиме iframe для статей Teletype (лор системы, статьи-справочники,
   описание Феном) — с "пристыковкой" внешней панели (.lore-toolbar)
   поверх статьи. Используется отовсюду: map.js (маркеры), system-view.js
   (лор системы), articles.js (статьи-справочники), onboarding.js.
   ============================================================ */
import { renderMirror, scrollToAnchor, anchorOf } from './reader.js?v=187';

/* ⚠️ Кавычки экранируются тоже: результат подставляется не только в текст, но и
   в атрибуты (src="…" анкеты, title="…" с именем, value="…" в редакторе), а
   имена и ссылки пишут сами игроки через редактор. Раньше тут был приём с
   div.textContent → innerHTML, который кавычки НЕ экранирует: `"` в ссылке на
   анкету закрывал атрибут, и дальше можно было дописать свой обработчик
   события — чужой код у каждого, кто откроет окно (15.09.2026). */
export function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const modalBackdrop = document.getElementById('modalBackdrop');
const modalCard = document.getElementById('modalCard');
export const modalContent = document.getElementById('modalContent');
const modalCloseBtn = document.getElementById('modalClose');

// На тач-устройствах после pointerup браузер иногда досылает синтетический click —
// а модал к этому моменту уже открыт и перекрывает место тапа, поэтому клик "мимо"
// (для закрытия) улетает в только что открывшуюся карточку и тут же её закрывает.
// Игнорируем клики по фону первые 300мс после открытия — этого достаточно, чтобы
// пропустить призрачный клик, но не помешать реальному следующему тапу пользователя.
let modalArmed = false;
// Статья в модале грузится не сразу (своя копия, js/reader.js): открыли уже
// что-то другое — поздний ответ не должен его затереть.
let articleToken = 0;

export function openModal(html) {
  articleToken++;
  modalCard.classList.remove('modal-card--iframe', 'is-reader', 'has-dock');
  modalBackdrop.classList.remove('backdrop--iframe');
  resetLoreToolbarState();
  modalCloseBtn.hidden = false;
  modalContent.innerHTML = html;
  modalBackdrop.classList.add('open');
  modalArmed = false;
  setTimeout(() => { modalArmed = true; }, 300);
}

// Тот же модал, но с iframe вместо текста, развёрнутый на весь экран — для
// статей Teletype (лор системы, описание Феном и т.п.). Статья идёт от
// самого верха экрана; toolbarEl (любая панель с классом .lore-toolbar —
// .system-toolbar внутри системы, .phenom-toolbar внутри окна Феном) на
// время статьи переносится внутрь #modalCard и через .compact превращается
// в узкую "шторку", наезжающую поверх статьи — так и панель, и крестик
// закрытия остаются на одном уровне поверх текста, а не отъедают от него
// место сверху. activeBtn (необязательно) подсвечивается, пока статья открыта.
let dockedToolbar = null; // {el, parent, next, activeBtn} — куда вернуть панель при закрытии

/* Статья в развёрнутом модале (01.10.2026): сначала своя копия (articles/,
   js/reader.js) — наша вёрстка, своя прокрутка (.is-reader), работает, когда
   Teletype лежит; копии нет — чужая страница во фрейме, как раньше. Якорь
   из адреса (#e5M4 — раздел внутри статьи) — прокрутка к нему. */
export function setModalArticle(url) {
  const token = ++articleToken;
  modalCard.classList.add('is-reader');
  modalContent.innerHTML = '<div class="mirror-loading">Загрузка…</div>';
  modalContent.scrollTop = 0;
  const frame = () => {
    if (token !== articleToken) return;
    modalCard.classList.remove('is-reader');
    modalContent.innerHTML = `<iframe src="${escapeHtml(url)}" loading="lazy"></iframe>`;
  };
  renderMirror(url, modalContent).then(art => {
    if (token !== articleToken) return;
    if (!art) { frame(); return; }
    modalContent.textContent = '';
    modalContent.appendChild(art);
    modalContent.scrollTop = 0;
    scrollToAnchor(modalContent, anchorOf(url));
  }).catch(frame);
}

export function openIframeModal(url, toolbarEl, activeBtn) {
  modalCard.classList.add('modal-card--iframe');
  modalBackdrop.classList.add('backdrop--iframe');
  // Без адреса — пустой развёрнутый модал (форма редактора пишет в него сама).
  // ⚠️ Не 'about:blank' через setModalArticle: копии у него нет, и поздний
  // ответ подставлял пустой фрейм поверх уже нарисованной формы (v=173).
  if (url) setModalArticle(url);
  else {
    articleToken++;
    modalCard.classList.remove('is-reader');
    modalContent.textContent = '';
  }
  // Панель пристыкована — она внизу (v=179), статье нужен отступ снизу.
  modalCard.classList.toggle('has-dock', !!toolbarEl);
  if (toolbarEl) {
    dockedToolbar = { el: toolbarEl, parent: toolbarEl.parentElement, next: toolbarEl.nextSibling, activeBtn: activeBtn || null };
    modalCard.insertBefore(toolbarEl, modalCard.firstChild);
    toolbarEl.classList.add('compact');
    if (activeBtn) activeBtn.classList.add('active');
  }
  // У пристыкованной панели уже есть свой крестик закрытия (первый элемент
  // ряда, .toolbar-close-btn) — отдельный фиксированный #modalClose в этом
  // случае лишний и только дублирует его, плавая отдельно над рядом. Без
  // панели (toolbarEl не передан) он как раньше — единственный способ закрыть.
  modalCloseBtn.hidden = !!toolbarEl;
  modalBackdrop.classList.add('open');
  modalArmed = false;
  setTimeout(() => { modalArmed = true; }, 300);
}

function resetLoreToolbarState() {
  if (!dockedToolbar) return;
  dockedToolbar.el.classList.remove('compact');
  if (dockedToolbar.activeBtn) dockedToolbar.activeBtn.classList.remove('active');
  dockedToolbar.parent.insertBefore(dockedToolbar.el, dockedToolbar.next);
  dockedToolbar = null;
}

export function closeModal() {
  articleToken++;
  modalBackdrop.classList.remove('open');
  if (modalCard.classList.contains('modal-card--iframe')) resetLoreToolbarState();
}

// Открыт ли сейчас модал вообще — нужно снаружи (system-view.js, phenom.js),
// чтобы кнопки "Назад"/"Закрыть" сначала закрывали только статью поверх вида
// системы/Феном, а не выпрыгивали сразу на карту галактики (см. их код).
export function isArticleOpen() {
  return modalBackdrop.classList.contains('open');
}

// Пристыкована ли к модалу именно эта конкретная панель — нужно articles.js,
// чтобы при переходе между статьями-справочниками через #refToolbar просто
// подменять iframe, а не переоткрывать модал (без лишней анимации заново).
export function isDockedWith(toolbarEl) {
  return isArticleOpen() && dockedToolbar && dockedToolbar.el === toolbarEl;
}

document.getElementById('modalClose').addEventListener('click', closeModal);
modalBackdrop.addEventListener('click', (e) => {
  if (!modalArmed) return;
  if (e.target === modalBackdrop) closeModal();
});
