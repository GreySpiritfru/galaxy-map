/* ============================================================
   Заметки персонажа из notes.json — вкладка «📝 Заметки» (js/characters.js).

   Пишет бот (character_notes.py на сервере): «заметка Райн …», «предмет Райн
   Аптечка ×3», «предмет Райн Батарея 3/5», фото с подписью — запись с артом;
   правка кнопками прямо в сообщении в чате. В notes.json запись уходит пачкой
   после 5 минут тишины, не чаще раза в 20 минут — здесь видно с задержкой.
   Формат: {"characters": {id: [запись, …]}}. Запись — {i, k, x, q?, c?, s?, d?,
   img?, t, u}: k — item (снаряжение) / note (памятка), x — текст, q —
   количество, c — [заряды, максимум], s — откуда/зачем, d — памятка выполнена,
   img — арт в images/notes/, o — id персонажа-владельца чужого предмета, on —
   имя владельца-НПС (17.10.2026). Автора записи нет: файл публичный.
   ============================================================ */
import { escapeHtml } from './modal.js?v=222';
import { fetchT } from './net.js?v=222';

const NOTES_URL = 'notes.json';
let notesCache = null; // {at, data}
let notesLoading = null;

export async function loadNotes() {
  if (notesCache && Date.now() - notesCache.at < 60000) return notesCache.data;
  if (notesLoading) return notesLoading;
  notesLoading = (async () => {
    try {
      const resp = await fetchT(NOTES_URL, {cache: 'no-cache'});
      if (!resp.ok && resp.status !== 404) throw new Error('notes HTTP');
      const data = resp.status === 404 ? {characters: {}} : await resp.json();
      if (!data || !data.characters || typeof data.characters !== 'object' || Array.isArray(data.characters)) {
        throw new Error('notes format');
      }
      notesCache = {at: Date.now(), data};
      return data;
    } catch (e) {
      // Сбой сети не стирает последнюю удачную загрузку и не выдаётся за пустой список.
      return {characters: notesCache?.data.characters || {}, loadError: true};
    }
  })();
  try { return await notesLoading; }
  finally { notesLoading = null; }
}

function cleanNote(n) {
  if (!n || typeof n !== 'object' || typeof n.x !== 'string' || !n.x.trim()) return null;
  const note = {x: n.x.slice(0, 120), k: n.k === 'item' ? 'item' : 'note', d: n.d === true};
  if (Number.isInteger(n.q) && n.q >= 0 && n.q <= 9999) note.q = n.q;
  if (Array.isArray(n.c) && n.c.length === 2 && n.c.every(Number.isInteger)
      && n.c[0] >= 0 && n.c[0] <= n.c[1] && n.c[1] > 0 && n.c[1] <= 99) note.c = n.c;
  if (typeof n.s === 'string') note.s = n.s.slice(0, 3500); // описание до 3500 (17.10.2026)
  if (typeof n.o === 'string' && /^[A-Za-z0-9_-]{1,53}$/.test(n.o)) note.o = n.o;
  else if (typeof n.on === 'string' && n.on.trim()) note.on = n.on.slice(0, 40);
  if (typeof n.img === 'string' && n.img.length <= 140 && !/\s/.test(n.img) && IMG_RE.test(n.img)) note.img = n.img;
  return note;
}

export function notesOf(data, id) {
  const box = data && data.characters;
  const list = box && Object.prototype.hasOwnProperty.call(box, id) ? box[id] : null;
  const notes = Array.isArray(list) ? list.slice(0, 40).map(cleanNote).filter(Boolean) : [];
  notes.loadError = data?.loadError === true; // состояние загрузки передаём вместе со списком, API вкладки прежний
  return notes;
}

// Арт — только свой файл из images/notes/ (запись пишет бот, но файл публичный).
const IMG_RE = /^images\/notes\/[A-Za-z0-9_-]+\.jpg(\?v=\d+)?$/;

function chargesHtml(c) {
  const [cur, max] = c.map(Number);
  if (!(max > 0)) return '';
  const cells = max <= 12
    ? Array.from({length: max}, (_, i) => `<i class="${i < cur ? 'on' : ''}"></i>`).join('')
    : `<b style="width:${Math.round(100 * cur / max)}%"></b>`;
  return `<div class="note-charges${max > 12 ? ' is-bar' : ''}" title="заряды ${cur} из ${max}">${cells}</div>
    <div class="note-charges-num">⚡ ${cur}/${max}</div>`;
}

// Описание: короткое — строкой, длинное — свёрнутым блоком (тап — раскрыть).
function descHtml(s) {
  if (!s) return '';
  if (s.length <= 140 && !s.includes('\n')) return `<div class="note-src">${escapeHtml(s)}</div>`;
  const head = s.split('\n')[0].slice(0, 90);
  return `<details class="note-desc"><summary>${escapeHtml(head)}…</summary><div class="note-src">${escapeHtml(s)}</div></details>`;
}

function gearHtml(n, nameOf) {
  const img = typeof n.img === 'string' && IMG_RE.test(n.img) ? n.img : '';
  // ×1 не показываем: у предмета количество есть всегда (с 16.10.2026 — 1 по умолчанию).
  const qty = Number.isFinite(n.q) && n.q !== 1 ? `<span class="note-qty${n.q === 0 ? ' is-empty' : ''}">×${n.q}</span>` : '';
  const art = img
    ? `<button class="note-art" type="button" aria-expanded="false" aria-label="Арт: ${escapeHtml(n.x)}"><img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async"></button>`
    : `<div class="note-art is-blank" aria-hidden="true">${escapeHtml((n.x.trim()[0] || '•').toUpperCase())}</div>`;
  const empty = (Number.isFinite(n.q) && n.q === 0) || (Array.isArray(n.c) && Number(n.c[0]) === 0);
  // Персонаж-владелец не найден (удалён / данные разных версий) — пометка всё равно видна.
  const owner = (n.o && (nameOf(n.o) || 'другой персонаж')) || n.on || '';
  return `<li class="note-gear${empty ? ' is-spent' : ''}${img ? '' : ' no-art'}">
      ${art}${qty}
      <div class="note-name">${escapeHtml(n.x)}</div>
      ${owner ? `<div class="note-owner">владелец: ${escapeHtml(owner)}</div>` : ''}
      ${Array.isArray(n.c) ? chargesHtml(n.c) : ''}
      ${descHtml(n.s)}
    </li>`;
}

function memoHtml(n) {
  const img = typeof n.img === 'string' && IMG_RE.test(n.img) ? n.img : '';
  return `<li class="note-memo${n.d ? ' is-done' : ''}">
      <span class="note-check" role="img" aria-label="${n.d ? 'Выполнено' : 'Открыто'}">${n.d ? '✓' : ''}</span>
      <div class="note-memo-body">
        <div class="note-memo-text">${escapeHtml(n.x)}</div>
        ${descHtml(n.s)}
        ${img ? `<button class="note-art is-inline" type="button" aria-expanded="false" aria-label="Арт: ${escapeHtml(n.x)}"><img src="${escapeHtml(img)}" alt="" loading="lazy" decoding="async"></button>` : ''}
      </div>
    </li>`;
}

/* Тело вкладки. name — имя для подсказки команды, nameOf(id) — имя владельца
   чужого предмета. */
export function notesHtml(list, name, nameOf = () => '') {
  const loadError = list?.loadError === true;
  list = Array.isArray(list) ? list.slice(0, 40).map(cleanNote).filter(Boolean) : [];
  // Первое настоящее слово имени: «О. Гил'ви» → «Гил'ви» (инициал в команде не найдётся).
  const short = escapeHtml((typeof name === 'string' ? name : '').split(' ').find(w => w.replace(/[.'’]/g, '').length > 2) || 'Имя');
  const how = `Правка в группе: <code>заметки ${short}</code>. Видно всем. Обновление — после 5 минут тишины, не чаще раза в 20 минут.`;
  if (!list.length) {
    return `<div class="notes"><div class="char-stub-title">${loadError ? 'Не удалось загрузить заметки' : 'Заметок пока нет'}</div><div class="notes-hint">${loadError ? 'Открой вкладку ещё раз, чтобы повторить загрузку.' : how}</div></div>`;
  }
  const gear = list.filter(n => n.k === 'item');
  const memos = list.filter(n => n.k !== 'item');
  const open = memos.filter(n => !n.d).length;
  return `<div class="notes">
      ${loadError ? '<div class="notes-status" role="status">Обновить заметки не удалось. Показана сохранённая копия.</div>' : ''}
      ${gear.length ? `<div class="notes-head"><span>Снаряжение</span><span class="notes-count">${gear.length}</span></div>
        <ul class="notes-gear">${gear.map(n => gearHtml(n, nameOf)).join('')}</ul>` : ''}
      ${memos.length ? `<div class="notes-head"><span>📝 Заметки</span><span class="notes-count">${open ? `открыто ${open} из ${memos.length}` : memos.length}</span></div>
        <ul class="notes-memos">${memos.map(memoHtml).join('')}</ul>` : ''}
      <div class="notes-hint">${how}</div>
    </div>`;
}

// Тап по арту — крупнее / обратно (один открытый за раз).
export function wireNotes(body) {
  if (wired.has(body)) return;
  wired.add(body);
  const closeArts = () => body.querySelectorAll('button.note-art.is-open').forEach(b => {
    b.classList.remove('is-open');
    b.setAttribute('aria-expanded', 'false');
  });
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('button.note-art');
    if (!btn || !body.contains(btn)) return;
    const was = btn.classList.contains('is-open');
    closeArts();
    if (!was) {
      btn.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && body.querySelector('button.note-art.is-open')) {
      closeArts();
      e.stopPropagation();
    }
  });
}
const wired = new WeakSet();
