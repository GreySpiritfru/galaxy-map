/* ============================================================
   Заметки персонажа из notes.json — вкладка «📝 Заметки» (js/characters.js).

   Пишет бот (character_notes.py на сервере): «заметка Райн …», «предмет Райн
   Аптечка ×3», «предмет Райн Батарея 3/5», фото с подписью — запись с артом;
   правка кнопками прямо в сообщении в чате. В notes.json запись уходит пачкой
   через ~1,5 минуты после правки — здесь видно с задержкой.
   Формат: {"characters": {id: [запись, …]}}. Запись — {i, k, x, q?, c?, s?, d?,
   img?, t, u}: k — item (снаряжение) / note (памятка), x — текст, q —
   количество, c — [заряды, максимум], s — откуда/зачем, d — памятка выполнена,
   img — арт в images/notes/. Автора записи нет: файл публичный.
   ============================================================ */
import { escapeHtml } from './modal.js?v=210';
import { fetchT } from './net.js?v=210';

const NOTES_URL = 'notes.json';
let notesCache = null; // {at, data}

export async function loadNotes() {
  if (notesCache && Date.now() - notesCache.at < 60000) return notesCache.data;
  let data = {characters: {}};
  try {
    const resp = await fetchT(NOTES_URL, {cache: 'no-cache'});
    if (resp.status !== 404) data = await resp.json();
  } catch (e) { /* нет сети/битый файл — покажем «заметок нет» */ }
  notesCache = {at: Date.now(), data};
  return data;
}

export function notesOf(data, id) {
  const box = data && data.characters;
  const list = box && Object.prototype.hasOwnProperty.call(box, id) ? box[id] : null;
  return Array.isArray(list) ? list.filter(n => n && typeof n === 'object' && typeof n.x === 'string') : [];
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

function gearHtml(n) {
  const img = typeof n.img === 'string' && IMG_RE.test(n.img) ? n.img : '';
  // ×1 не показываем: у предмета количество есть всегда (с 16.10.2026 — 1 по умолчанию).
  const qty = Number.isFinite(n.q) && n.q !== 1 ? `<span class="note-qty${n.q === 0 ? ' is-empty' : ''}">×${n.q}</span>` : '';
  const art = img
    ? `<button class="note-art" type="button" aria-label="Арт крупнее"><img src="${escapeHtml(img)}" alt="" loading="lazy"></button>`
    : `<div class="note-art is-blank" aria-hidden="true">${escapeHtml((n.x.trim()[0] || '•').toUpperCase())}</div>`;
  const empty = (Number.isFinite(n.q) && n.q === 0) || (Array.isArray(n.c) && Number(n.c[0]) === 0);
  return `<li class="note-gear${empty ? ' is-spent' : ''}">
      ${art}${qty}
      <div class="note-name">${escapeHtml(n.x)}</div>
      ${Array.isArray(n.c) ? chargesHtml(n.c) : ''}
      ${n.s ? `<div class="note-src">${escapeHtml(n.s)}</div>` : ''}
    </li>`;
}

function memoHtml(n) {
  const img = typeof n.img === 'string' && IMG_RE.test(n.img) ? n.img : '';
  return `<li class="note-memo${n.d ? ' is-done' : ''}">
      <span class="note-check" aria-hidden="true">${n.d ? '✓' : ''}</span>
      <div class="note-memo-body">
        <div class="note-memo-text">${escapeHtml(n.x)}</div>
        ${n.s ? `<div class="note-src">${escapeHtml(n.s)}</div>` : ''}
        ${img ? `<button class="note-art is-inline" type="button" aria-label="Арт крупнее"><img src="${escapeHtml(img)}" alt="" loading="lazy"></button>` : ''}
      </div>
    </li>`;
}

/* Тело вкладки. name — имя для подсказки команды. */
export function notesHtml(list, name) {
  // Первое настоящее слово имени: «О. Гил'ви» → «Гил'ви» (инициал в команде не найдётся).
  const short = escapeHtml((name || '').split(' ').find(w => w.replace(/[.'’]/g, '').length > 2) || 'Имя');
  const how = `В группе: <code>заметки ${short}</code> — посмотреть и править кнопками,
    <code>предмет ${short} Аптечка ×3</code>, <code>заметка ${short} Пистолет — поднят в посте</code>,
    фото с подписью — запись с артом. Видно всем; здесь — через пару минут после правки.`;
  if (!list.length) {
    return `<div class="char-stub"><div class="char-stub-title">Заметок пока нет</div><div class="rolls-hint">${how}</div></div>`;
  }
  const gear = list.filter(n => n.k === 'item');
  const memos = list.filter(n => n.k !== 'item');
  const open = memos.filter(n => !n.d).length;
  return `<div class="notes">
      ${gear.length ? `<div class="notes-head"><span>🎒 Снаряжение</span><span class="notes-count">${gear.length}</span></div>
        <ul class="notes-gear">${gear.map(gearHtml).join('')}</ul>` : ''}
      ${memos.length ? `<div class="notes-head"><span>📝 Заметки</span><span class="notes-count">${open ? `открыто ${open} из ${memos.length}` : memos.length}</span></div>
        <ul class="notes-memos">${memos.map(memoHtml).join('')}</ul>` : ''}
      <div class="rolls-hint">${how}</div>
    </div>`;
}

// Тап по арту — крупнее / обратно (один открытый за раз).
export function wireNotes(body) {
  body.addEventListener('click', (e) => {
    const btn = e.target.closest('.note-art');
    if (!btn || !body.contains(btn)) return;
    const was = btn.classList.contains('is-open');
    body.querySelectorAll('.note-art.is-open').forEach(b => b.classList.remove('is-open'));
    if (!was) btn.classList.add('is-open');
  });
}
