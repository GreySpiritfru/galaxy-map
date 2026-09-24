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
import { escapeHtml } from './modal.js?v=145';
import { canEdit, showEditor } from './editor.js?v=145';
import { renderFrame, renderNodeLinks } from './node-window.js?v=145';

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
export function getOpenCharacter() { return current; }

function setActive(btn) {
  [sheetBtn, notesBtn, rollsBtn].forEach(b => b.classList.toggle('active', b === btn));
}

// Вкладка-заглушка вместо анкеты. Панель остаётся, вернуться на анкету —
// одним тапом по «Анкета».
function showStub(btn, title, text) {
  content.classList.remove('is-article');
  content.innerHTML = `
    <div class="char-stub">
      <div class="char-stub-title">${escapeHtml(title)}</div>
      <div>${escapeHtml(text)}</div>
    </div>`;
  setActive(btn);
}

function showSheet() {
  if (!current) return;
  if (current.sheetUrl) renderFrame(content, current.sheetUrl);
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
  if (changed) content.innerHTML = '';
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

/* ============================================================
   Броски (24.09.2026). История бросков пишет бот (dice_rolls.py на сервере):
   в группе «/d20+3 Гил'ви взламывает дверь сл15». Бросок сразу сохраняется
   на сервере, а в rolls.json репозитория уходит пачкой раз в 20 минут —
   поэтому свежий бросок видно в чате сразу, а здесь — с задержкой.
   Формат: {"characters": {id: [{t, d, r, m?, s, dc?, o?, a?, l?}, …]}},
   новые первыми; o — crit / critfail / success / fail.
   ============================================================ */
const ROLLS_URL = 'rolls.json';
let rollsCache = null; // {at, data}
async function loadRolls() {
  if (rollsCache && Date.now() - rollsCache.at < 60000) return rollsCache.data;
  let data = {characters: {}};
  try {
    const resp = await fetch(ROLLS_URL, {cache: 'no-cache'});
    // 404 — бот ещё ни разу не выгружал броски; это не ошибка.
    if (resp.status !== 404) data = await resp.json();
  } catch (e) { /* нет сети/битый файл — покажем «бросков нет» */ }
  rollsCache = {at: Date.now(), data};
  return data;
}

const OUTCOME = {
  crit: ['💥', 'критический успех', 'is-crit'],
  critfail: ['💀', 'критический провал', 'is-critfail'],
  success: ['✅', 'успех', 'is-success'],
  fail: ['❌', 'провал', 'is-fail'],
};

function rollDate(t) {
  const d = new Date(t * 1000);
  return d.toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
}

function rollRow(r) {
  const dice = Array.isArray(r.r) ? r.r.join(', ') : '';
  const mod = r.m ? ` ${r.m > 0 ? '+' : '−'} ${Math.abs(r.m)}` : '';
  const o = OUTCOME[r.o];
  const verdict = o ? `<span class="roll-verdict ${o[2]}">${o[0]} ${o[1]}${r.dc ? ` · сл ${escapeHtml(r.dc)}` : ''}</span>`
    : (r.dc ? `<span class="roll-verdict">сл ${escapeHtml(r.dc)}</span>` : '');
  const link = /^https:\/\/t\.me\//.test(r.l || '')
    ? `<a class="roll-link" href="${escapeHtml(r.l)}" target="_blank" rel="noopener" title="Сообщение в чате">↗</a>` : '';
  return `<li class="roll${o ? ' ' + o[2] : ''}">
      <div class="roll-total">${escapeHtml(r.s)}</div>
      <div class="roll-body">
        <div class="roll-action">${r.a ? escapeHtml(r.a) : '<span class="roll-muted">без описания</span>'}</div>
        <div class="roll-meta">${escapeHtml(r.d || '')}: [${escapeHtml(dice)}]${escapeHtml(mod)} ${verdict}</div>
      </div>
      <div class="roll-side"><span class="roll-date">${rollDate(r.t)}</span>${link}</div>
    </li>`;
}

async function showRolls() {
  if (!current) return;
  const char = current;
  setActive(rollsBtn);
  content.classList.remove('is-article');
  content.innerHTML = '<div class="char-stub">Загрузка бросков…</div>';
  const data = await loadRolls();
  // Пока грузилось, игрок мог уйти на другую вкладку или персонажа.
  if (current !== char || !rollsBtn.classList.contains('active')) return;
  const list = (data.characters && data.characters[char.id]) || [];
  const how = `В группе: <code>/d20 ${escapeHtml((char.name || '').split(' ').pop() || 'Имя')} действие сл15</code>. `
    + 'В чате бросок виден сразу, здесь — в течение ~20 минут.';
  if (!list.length) {
    content.innerHTML = `<div class="char-stub"><div class="char-stub-title">Бросков пока нет</div><div>${how}</div></div>`;
    return;
  }
  const d20 = list.filter(r => /^d20([+-]|$)/.test(r.d || '') && Array.isArray(r.r));
  const avg = d20.length ? (d20.reduce((s, r) => s + r.r[0], 0) / d20.length).toFixed(1) : null;
  const crits = list.filter(r => r.o === 'crit').length;
  const fails = list.filter(r => r.o === 'critfail').length;
  const summary = [`бросков: ${list.length}`, avg ? `средний d20: ${avg}` : '', crits ? `💥 ${crits}` : '', fails ? `💀 ${fails}` : '']
    .filter(Boolean).join(' · ');
  content.innerHTML = `
    <div class="rolls">
      <div class="rolls-summary">${summary}</div>
      <ul class="rolls-list">${list.map(rollRow).join('')}</ul>
      <div class="rolls-hint">${how}</div>
    </div>`;
}

rollsBtn.addEventListener('click', showRolls);

// ✕ (#charToolbarClose) вешает js/navigation.js — closeTop(): если поверх
// открыт редактор, тот же крестик сначала закрывает его.
