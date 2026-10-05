/* ============================================================
   Окно персонажа — ТРЕТИЙ слой общего окна точки (24.09.2026).

   Раньше персонаж открывался как статья-справочник: общий модал с iframe и
   пристыкованной шторкой, со своей кнопкой «Сюжет» среди действий. Теперь это
   такое же окно, как у мировой точки (js/node-window.js): сверху действия
   (Анкета, Правка, Заметки, Броски), под ними ряд переходов (↑ родитель и
   союзники), телом — анкета. Слой свой (#charOverlay), а не общий с сюжетом:
   персонаж открывается ПОВЕРХ окна своего сюжета, и закрытие возвращает туда
   (Феном → сюжет → персонаж, три уровня).

   Данные — characters.json, что показать (view) собирает map.js: там граф,
   камера и переходы.
   ============================================================ */
import { escapeHtml } from './modal.js?v=204';
import { canEdit, showEditor } from './editor.js?v=204';
import { renderSheet, renderNodeLinks } from './node-window.js?v=204';
import { loadRolls, rollsOf, rollRowHtml, d20Faces, average } from './rolls.js?v=204';

const overlay = document.getElementById('charOverlay');
const content = document.getElementById('charContent');
const links = document.getElementById('charLinks');
const sheetBtn = document.getElementById('charSheet');
const notesBtn = document.getElementById('charNotes');
const rollsBtn = document.getElementById('charRolls');
// «✏️ Правка» — только у своих персонажей и только в карте, открытой
// кнопкой из лички бота (см. js/editor.js).
const editBtn = document.getElementById('charEdit');

// Персонаж, чьё окно открыто сейчас (запись из characters.json).
let current = null;

function setActive(btn) {
  [sheetBtn, notesBtn, rollsBtn].forEach(b => b.classList.toggle('active', b === btn));
}

// Вкладка-заглушка вместо анкеты. Панель остаётся, вернуться на анкету —
// одним тапом по «Анкета».
/* Тело «Заметок»/«Бросков» — отдельный ребёнок рядом с анкетой, а анкета
   только прячется (v=202, аудит): раньше innerHTML стирал её, и при возврате
   на «Анкету» чужая страница грузилась заново с начала. Место чтения анкеты
   запоминается. */
const SHEET_SEL = ':scope > .node-mirror, :scope > .node-article-frame';
function tabBody() {
  const sheet = content.querySelector(SHEET_SEL);
  if (sheet && !sheet.hidden) { content.__sheetScroll = content.scrollTop; sheet.hidden = true; }
  let el = content.querySelector(':scope > .char-tab');
  if (!el) {
    el = document.createElement('div');
    el.className = 'char-tab';
    content.appendChild(el);
  }
  el.hidden = false;
  content.classList.remove('is-article');
  content.scrollTop = 0;
  return el;
}

function showStub(btn, title, text) {
  tabBody().innerHTML = `
    <div class="char-stub">
      <div class="char-stub-title">${escapeHtml(title)}</div>
      <div>${escapeHtml(text)}</div>
    </div>`;
  setActive(btn);
}

function showSheet() {
  if (!current) return;
  // Своя копия анкеты (articles/, js/reader.js), нет её — чужая страница.
  // Та же анкета уже есть (спрятана под «Бросками») — просто показать её там же.
  const sheet = content.querySelector(SHEET_SEL);
  if (current.sheetUrl && sheet && sheet.dataset.src === current.sheetUrl) {
    const tab = content.querySelector(':scope > .char-tab');
    if (tab) tab.hidden = true;
    sheet.hidden = false;
    if (sheet.classList.contains('node-article-frame')) content.classList.add('is-article');
    content.scrollTop = content.__sheetScroll || 0;
    setActive(sheetBtn);
    return;
  }
  if (current.sheetUrl) renderSheet(content, current.sheetUrl);
  // Анкеты нет — окно всё равно открывается, иначе тап по маркеру выглядел
  // бы так, будто ничего не произошло.
  else showStub(sheetBtn, current.name || 'Персонаж', 'Анкета пока не заполнена.');
  setActive(sheetBtn);
}

/* view — {char, parentMeta, characters, children} (собирает map.js),
   handlers — {onParent, onCharacter, onChild}, opts.edit — сразу открыть
   форму правки поверх окна (возврат после выбора места на карте). */
export function openCharacter(view, handlers, {edit = false} = {}) {
  const changed = !current || current.id !== view.char.id;
  current = view.char;
  editBtn.hidden = !canEdit(current.id);
  renderNodeLinks(links, view, handlers || {});
  // Другой персонаж — старую анкету долой, даже если тот же адрес не сменился
  // бы (у разных персонажей он разный, но заглушка «Заметок» могла остаться).
  if (changed) { content.innerHTML = ''; content.__sheetScroll = 0; }
  showSheet();
  overlay.classList.add('open');
  if (edit && canEdit(current.id)) showEditor(current);
}

export function isCharacterOpen() {
  return overlay.classList.contains('open');
}

export function closeCharacter() {
  overlay.classList.remove('open');
  current = null;
}

sheetBtn.addEventListener('click', showSheet);

editBtn.addEventListener('click', () => {
  if (current && canEdit(current.id)) showEditor(current);
});

notesBtn.addEventListener('click', () => {
  showStub(notesBtn, 'Заметки', 'Раздел в разработке: тут будут заметки по персонажу.');
});

/* Броски (24.09.2026). История — rolls.json (бот, dice_rolls.py), загрузка и
   строка броска — js/rolls.js, общие с «Игрой» сюжета. В группе:
   «/d20+3 Гил'ви взламывает дверь сл15». */
async function showRolls() {
  if (!current) return;
  const char = current;
  setActive(rollsBtn);
  const body = tabBody();
  body.innerHTML = '<div class="char-stub">Загрузка бросков…</div>';
  const data = await loadRolls();
  // Пока грузилось, игрок мог уйти на другую вкладку или персонажа.
  if (current !== char || !rollsBtn.classList.contains('active')) return;
  const list = rollsOf(data, 'characters', char.id);
  const how = `В группе: <code>/d20 ${escapeHtml((char.name || '').split(' ').pop() || 'Имя')} действие сл15</code>. `
    + 'В чате бросок виден сразу, здесь — в течение ~20 минут.';
  if (!list.length) {
    body.innerHTML = `<div class="char-stub"><div class="char-stub-title">Бросков пока нет</div><div>${how}</div></div>`;
    return;
  }
  const d20 = d20Faces(list);
  const avg = d20.length ? average(d20).toFixed(1) : null;
  const crits = list.filter(r => r.o === 'crit').length;
  const fails = list.filter(r => r.o === 'critfail').length;
  const summary = [`бросков: ${list.length}`, avg ? `средний d20: ${avg}` : '', crits ? `💥 ${crits}` : '', fails ? `💀 ${fails}` : '']
    .filter(Boolean).join(' · ');
  body.innerHTML = `
    <div class="rolls">
      <div class="rolls-summary">${summary}</div>
      <ul class="rolls-list">${list.map(rollRowHtml).join('')}</ul>
      <div class="rolls-hint">${how}</div>
    </div>`;
}

rollsBtn.addEventListener('click', showRolls);

// ✕ (#charToolbarClose) вешает js/navigation.js — closeTop(): если поверх
// открыт редактор, тот же крестик сначала закрывает его.
