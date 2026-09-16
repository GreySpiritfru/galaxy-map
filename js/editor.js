/* ============================================================
   Редактор карты: персонажи — игрокам, сюжеты/локации/события — владельцу.

   Как это устроено целиком (подробно — раздел «Редактор» в CLAUDE.md):
   - игрок пишет боту @phenome2_bot в личку «редактор»; бот проверяет, что он
     в группе, и присылает кнопку клавиатуры с картой по ссылке
     `?edit=1&mine=<id персонажей через запятую>` (владельцу — `mine=*`);
   - внизу карты кнопка «✏️ Мои персонажи» (у владельца «✏️ Редактор») —
     список всего, что можно править; в окне персонажа — вкладка «✏️ Правка»;
   - «Сохранить» отправляет изменения боту через Telegram.WebApp.sendData
     (работает ТОЛЬКО у карты, открытой кнопкой клавиатуры; окно при этом
     закрывается), бот ещё раз проверяет права и поля и коммитит JSON в
     репозиторий;
   - отправленная правка сразу накладывается на карту этого игрока, не
     дожидаясь GitHub Pages (см. «Отправленные правки» ниже).

   ⚠️ `mine` из адреса — только подсказка, какие вкладки показывать. Защитой
   он НЕ является (адрес можно переписать руками): право на правку проверяет
   бот при получении данных, по своей таблице привязок на сервере.
   ============================================================ */
import { modalContent, escapeHtml, openIframeModal, openModal } from './modal.js?v=116';

const params = new URLSearchParams(location.search);
const EDIT_MODE = params.get('edit') === '1';
const MINE = new Set((params.get('mine') || '').split(',').map(s => s.trim()).filter(Boolean));
// `mine=*` бот ставит владельцу группы — ему можно править всё.
const ALL = MINE.has('*');

// Лимиты — те же, что проверяет бот (map_editor.py). Менять в обоих местах.
const TEXT_MAX = 60;
const URL_MAX = 300;
const LINKS_MAX = 10;
const TITLE_MAX = 80;
const SHORT_TITLE_MAX = 30;
const CODE_MAX = 10;
const COLOR_MAX = 40;
// Больше sendData не примет.
const SEND_MAX_BYTES = 4096;

const TEXT_FIELDS = [
  ['name', 'Имя'],
  ['race', 'Раса'],
  ['role', 'Роль'],
];

const FIELD_LABELS = {
  character: {
    name: 'Имя', race: 'Раса', role: 'Роль', sheetUrl: 'Анкета', parent: 'Привязка', links: 'Союзники',
    x: 'Место на карте', y: 'Место на карте', submapX: 'Место на карте локации', submapY: 'Место на карте локации',
  },
  node: {
    title: 'Название', shortTitle: 'Короткое название', code: 'Номер', archiveUrl: 'Архив', color: 'Цвет',
    role: 'Тип', parent: 'Привязка', links: 'Связи', x: 'Место на карте', y: 'Место на карте',
  },
};

function fieldLabels(kind, keys) {
  const table = FIELD_LABELS[kind === 'character' ? 'character' : 'node'];
  return [...new Set(keys.map(key => table[key] || key))];
}

export function canEdit(id) {
  return EDIT_MODE && (ALL || MINE.has(id));
}

export function canEditNodes() {
  return EDIT_MODE && ALL;
}

/* Всё, что знает только map.js (граф, камера, окна локаций), приходит сюда
   через initEditor — editor.js сам ничего не открывает на карте и не двигает. */
let hooks = null;

export function initEditor(h) {
  hooks = h;
  const fab = document.getElementById('editorFab');
  if (fab && EDIT_MODE && MINE.size) {
    const own = [...MINE].filter(id => h.graph.has(id)).length;
    fab.textContent = ALL ? '✏️ Редактор' : (own === 1 ? '✏️ Мой персонаж' : '✏️ Мои персонажи');
    fab.hidden = false;
    fab.addEventListener('click', showEditorList);
  }
}

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* Поля точки в том виде, в каком их показывает и отправляет форма: пустое
   поле — '', нет координат — null. По ним же сравниваются черновик с данными
   и отправленная правка со скачанным файлом. */
function fieldsOf(kind, d) {
  const common = {
    parent: d.parent || '',
    links: Array.isArray(d.links) ? [...d.links] : [],
    x: typeof d.x === 'number' ? d.x : null,
    y: typeof d.y === 'number' ? d.y : null,
  };
  if (kind === 'character') {
    return {
      name: d.name || '', race: d.race || '', role: d.role || '', sheetUrl: d.sheetUrl || '', ...common,
      submapX: typeof d.submapX === 'number' ? d.submapX : null,
      submapY: typeof d.submapY === 'number' ? d.submapY : null,
    };
  }
  if (kind === 'story') {
    return {
      title: d.title || '', ...common,
      shortTitle: d.shortTitle || '', code: d.code || '', archiveUrl: d.archiveUrl || '', color: d.color || '',
    };
  }
  return {title: d.title || '', ...common, role: d.role === 'event' ? 'event' : ''};
}

/* ============================================================
   Отправленные правки — видны в карте сразу.

   Бот коммитит JSON в репозиторий, а GitHub Pages отдаёт новую версию только
   через минуту-две (сборка + кэш). Всё это время игрок, открывший карту заново,
   видел бы СТАРЫЕ данные и думал, что правка не сохранилась. Поэтому каждая
   отправленная правка запоминается в localStorage и при загрузке карты
   накладывается поверх скачанных JSON (applyPendingEdits, до раскладки графа),
   пока файл не догонит.

   Для каждого поля помним новое значение (to) и прежние (before). В скачанном
   файле одно из прежних — правка ещё не доехала, показываем новое; совпало с
   to — доехала, поле забываем; ни то ни другое — после нас поле успел поменять
   кто-то ещё (владелец группы), его правку не затираем. Через PENDING_TTL
   запись забывается в любом случае: если бот правку отклонил, он написал об
   этом в личке. Видно это только на устройстве, с которого сохраняли.
   ============================================================ */
const PENDING_KEY = 'galaxyMapPendingEdits';
const PENDING_TTL = 30 * 60 * 1000;
// Что наложено при этой загрузке: 'kind:id' -> запись. Для подсказок в формах и списке.
let pendingNow = new Map();

function readPending() {
  try {
    const list = JSON.parse(localStorage.getItem(PENDING_KEY) || '[]');
    return Array.isArray(list)
      ? list.filter(e => e && typeof e.id === 'string' && typeof e.at === 'number' && e.fields && typeof e.fields === 'object')
      : [];
  } catch (e) {
    return [];
  }
}

function writePending(list) {
  try {
    if (list.length) localStorage.setItem(PENDING_KEY, JSON.stringify(list));
    else localStorage.removeItem(PENDING_KEY);
  } catch (e) {}
}

function rememberPending(kind, id, before, set) {
  const list = readPending().filter(e => Date.now() - e.at < PENDING_TTL);
  let entry = list.find(e => e.kind === kind && e.id === id);
  if (!entry) {
    entry = {kind, id, fields: {}};
    list.push(entry);
  }
  entry.at = Date.now();
  Object.keys(set).forEach(key => {
    const old = entry.fields[key];
    // Вторая правка того же поля до того, как доехала первая: и исходное
    // значение, и первое новое — оба «ещё не доехало».
    const was = old ? [...old.before, old.to] : [before[key]];
    entry.fields[key] = {
      to: set[key],
      before: was.filter((v, i) => !same(v, set[key]) && was.findIndex(w => same(w, v)) === i),
    };
  });
  writePending(list);
  pendingNow.set(kind + ':' + id, entry);
}

/* lists — {location: markers, story: stories, character: characters}, прямо
   скачанные массивы: правки пишутся в них на месте. Возвращает, сколько точек
   показано с ещё не доехавшими правками. */
export function applyPendingEdits(lists) {
  const now = Date.now();
  const keep = [];
  pendingNow = new Map();
  readPending().forEach(entry => {
    if (now - entry.at >= PENDING_TTL) return;
    const item = (lists[entry.kind] || []).find(it => it && it.id === entry.id);
    // Файл не скачался или точки в нём нет — ничего не накладываем, но и не
    // забываем: при следующей загрузке файл может оказаться на месте.
    if (!item) { keep.push(entry); return; }
    const current = fieldsOf(entry.kind, item);
    const fields = {};
    Object.entries(entry.fields).forEach(([key, f]) => {
      if (!f || !(key in current) || same(current[key], f.to)) return;
      if (!Array.isArray(f.before) || !f.before.some(v => same(v, current[key]))) return;
      if (f.to === null || (key === 'role' && !f.to)) delete item[key];
      else item[key] = Array.isArray(f.to) ? [...f.to] : f.to;
      fields[key] = f;
    });
    if (Object.keys(fields).length) {
      const rest = {...entry, fields};
      keep.push(rest);
      pendingNow.set(entry.kind + ':' + entry.id, rest);
    }
  });
  writePending(keep);
  return pendingNow.size;
}

function pendingHint(kind, id) {
  const entry = pendingNow.get(kind + ':' + id);
  if (!entry) return '';
  const labels = fieldLabels(kind, Object.keys(entry.fields));
  return `<div class="editor-pending">⏳ Недавно сохранено: ${escapeHtml(labels.join(', '))}. `
    + 'Ты уже видишь новое, у остальных появится через минуту-две.</div>';
}

const toast = document.getElementById('editorToast');
let toastTimer = 0;
export function showPendingToast() {
  if (!toast || !pendingNow.size) return;
  toast.textContent = '⏳ Твои последние правки уже на карте — у остальных появятся через минуту-две.';
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 7000);
}
toast?.addEventListener('click', () => { toast.hidden = true; });

/* ============================================================
   Черновики, отправка, проверки
   ============================================================ */

// Черновики живут, пока открыта страница: игрок может уйти тапать место на
// карте и вернуться к форме, не потеряв остальные правки.
// Ключ — 'character:<id>' / 'story:<id>' / 'location:<id>'.
const drafts = new Map();

function draftFor(kind, data) {
  const key = kind + ':' + data.id;
  if (!drafts.has(key)) drafts.set(key, {kind, data, draft: fieldsOf(kind, data)});
  return drafts.get(key).draft;
}

function changesOf(kind, data, draft) {
  const orig = fieldsOf(kind, data);
  const set = {};
  Object.keys(orig).forEach(key => { if (!same(orig[key], draft[key])) set[key] = draft[key]; });
  // Координаты уходят только парой: бот не примет одну без другой (новое место
  // могло совпасть со старым по одной из осей).
  if ('x' in set || 'y' in set) { set.x = draft.x; set.y = draft.y; }
  if ('submapX' in set || 'submapY' in set) { set.submapX = draft.submapX; set.submapY = draft.submapY; }
  return set;
}

function telegram() {
  const tg = window.Telegram && window.Telegram.WebApp;
  // platform 'unknown' — страница открыта не в Telegram (обычный браузер,
  // локальная проверка): отправлять некуда.
  return tg && tg.platform !== 'unknown' && typeof tg.sendData === 'function' ? tg : null;
}

/* Есть несохранённые правки — Telegram переспросит, если закрыть карту свайпом
   или крестиком (Bot API 6.2+). Перед sendData выключается: окно закрывает сам бот. */
let closingConfirmation = false;
function setClosingConfirmation(on) {
  const tg = telegram();
  if (!tg || on === closingConfirmation) return;
  if (typeof tg.isVersionAtLeast !== 'function' || !tg.isVersionAtLeast('6.2')) return;
  try {
    if (on) tg.enableClosingConfirmation();
    else tg.disableClosingConfirmation();
    closingConfirmation = on;
  } catch (e) {}
}

function syncClosingConfirmation() {
  let dirty = false;
  for (const {kind, data, draft} of drafts.values()) {
    if (Object.keys(changesOf(kind, data, draft)).length) { dirty = true; break; }
  }
  setClosingConfirmation(dirty);
}

/* remember — запомнить правку как отправленную. Вызывается ДО sendData: окно
   закрывается сразу, и код после него может уже не выполниться. */
function sendToBot(payload, remember) {
  const json = JSON.stringify(payload);
  if (new TextEncoder().encode(json).length > SEND_MAX_BYTES) {
    return {ok: false, error: 'Слишком много изменений за раз — сохрани часть, потом остальное.'};
  }
  const tg = telegram();
  if (!tg) return {ok: false, preview: json};
  let snapshot = null;
  try { snapshot = localStorage.getItem(PENDING_KEY); } catch (e) {}
  try {
    if (remember) remember();
    setClosingConfirmation(false);
    tg.sendData(json);
    return {ok: true};
  } catch (e) {
    // Не отправилось — и запоминать нечего.
    try {
      if (snapshot === null) localStorage.removeItem(PENDING_KEY);
      else localStorage.setItem(PENDING_KEY, snapshot);
    } catch (e2) {}
    return {ok: false, error: `Не отправилось: ${e.message || e}`};
  }
}

// Как normalize_name у бота: регистр, ё/е, кавычки и лишние пробелы не важны.
function normalizeName(text) {
  return String(text || '').toLowerCase().replace(/ё/g, 'е').replace(/["'’ʼ`«»]/g, '').replace(/\s+/g, ' ').trim();
}

function luhn(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = +digits[digits.length - 1 - i];
    if (i % 2) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

/* Номера банковских карт и телефонов в публичные файлы карты не пишем — та же
   проверка у бота (find_sensitive в map_editor.py). Только явные случаи:
   13–19 цифр с верной контрольной суммой карты и российский номер телефона.
   ⚠️ Без lookbehind в регулярках: старые iOS его не знают, и модуль упал бы
   целиком вместе с картой. */
function findSensitive(text) {
  const s = String(text || '');
  for (const m of s.matchAll(/\d(?:[ -]?\d){12,18}/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (luhn(digits)) return 'номер карты';
  }
  if (/(?:^|[^\d+])(?:\+7|8)[\s(-]*\d{3}[\s)-]*\d{3}[\s-]*\d{2}[\s-]*\d{2}(?!\d)/.test(s)) return 'номер телефона';
  return '';
}

/* Общие для обеих форм проверки текстовых полей: символы " < > (бот их не
   пропускает — см. _check_markup в map_editor.py) и номера карт/телефонов. */
function textProblem(kind, set, keys, sensitiveKeys) {
  for (const key of keys) {
    if (key in set && /["<>]/.test(set[key])) return `${fieldLabels(kind, [key])[0]}: символы " < > нельзя.`;
  }
  for (const key of sensitiveKeys) {
    const what = key in set && findSensitive(set[key]);
    if (what) return `${fieldLabels(kind, [key])[0]}: похоже на ${what} — такое на карту не пишем.`;
  }
  return '';
}

function nodeLabel(node) {
  return node.data.shortTitle || node.data.title || node.data.name || node.id;
}

// Полное название — для списка и заголовков, где места хватает.
function fullTitle(node) {
  const d = node.data;
  if (node.kind === 'story') return [d.code, d.title].filter(Boolean).join('. ') || node.id;
  return d.title || d.name || node.id;
}

function statusHelpers(form) {
  const status = form.querySelector('.editor-status');
  const say = (text, isError) => {
    status.textContent = text;
    status.classList.toggle('is-error', !!isError);
  };
  const report = (res) => {
    // Обычно окно после sendData уже закрыто — это на случай, если нет.
    if (res.ok) say('Отправлено боту — ответ придёт в личку.');
    else if (res.error) say(res.error, true);
    else say(`Не в Telegram — боту ушло бы: ${res.preview}`);
  };
  return {say, report};
}

// Отметки союзников/связей: собираем заново из формы при каждом клике.
function wireLinks(form, draft, say, what) {
  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.name !== 'links') return;
    draft.links = [...form.querySelectorAll('input[name="links"]:checked:not(:disabled)')].map(i => i.value);
    if (draft.links.length > LINKS_MAX) {
      el.checked = false;
      draft.links = draft.links.filter(id => id !== el.value);
      say(`Не больше ${LINKS_MAX} ${what}.`, true);
    }
  });
}

function linkChip(n, draft, incoming, label) {
  const own = draft.links.includes(n.id);
  const locked = incoming.has(n.id);
  return `<label class="editor-link${locked ? ' is-locked' : ''}">
    <input type="checkbox" name="links" value="${escapeHtml(n.id)}"${own || locked ? ' checked' : ''}${locked ? ' disabled' : ''}>
    <span>${escapeHtml(label)}</span>
  </label>`;
}

/* ============================================================
   Список «✏️ Мои персонажи» / «✏️ Редактор»
   ============================================================ */
export function showEditorList() {
  if (!hooks || !EDIT_MODE || !MINE.size) return;
  const nodes = [...hooks.graph.values()];
  const byTitle = (a, b) => fullTitle(a).localeCompare(fullTitle(b), 'ru');
  const chars = nodes.filter(n => n.kind === 'character' && canEdit(n.id)).sort(byTitle);
  // Персонаж один — список из одной строки был бы лишним тапом.
  if (chars.length === 1 && !canEditNodes()) {
    hooks.openCharacterEditor(chars[0]);
    return;
  }
  const sections = [['Персонажи', chars]];
  if (canEditNodes()) {
    sections.push(
      ['Сюжеты', nodes.filter(n => n.kind === 'story').sort(byTitle)],
      ['Локации', nodes.filter(n => n.kind === 'location' && n.data.role !== 'event').sort(byTitle)],
      ['События', nodes.filter(n => n.kind === 'location' && n.data.role === 'event').sort(byTitle)],
    );
  }
  const total = sections.reduce((sum, [, list]) => sum + list.length, 0);

  const row = (n) => {
    const title = fullTitle(n);
    const image = n.data.markerImage || n.data.image || '';
    const sub = n.kind === 'character' ? (n.parent ? fullTitle(n.parent) : 'отдельно на карте') : '';
    const pending = pendingNow.has(n.kind + ':' + n.id);
    return `<button type="button" class="editor-item" data-id="${escapeHtml(n.id)}" data-search="${escapeHtml(normalizeName(title))}">
      <span class="editor-item-avatar${n.kind === 'character' ? '' : ' is-round'}">
        <span>${escapeHtml(title.trim().charAt(0).toUpperCase() || '?')}</span>
        ${image ? `<img src="${escapeHtml(image)}" alt="" loading="lazy" onerror="this.remove()">` : ''}
      </span>
      <span class="editor-item-text">
        <span class="editor-item-name">${escapeHtml(title)}${pending ? ' <span title="Недавно сохранено">⏳</span>' : ''}</span>
        ${sub ? `<span class="editor-item-sub">${escapeHtml(sub)}</span>` : ''}
      </span>
    </button>`;
  };

  openModal(`
    <div class="editor-list">
      <div class="modal-title">${ALL ? '✏️ Редактор карты' : '✏️ Мои персонажи'}</div>
      <div class="editor-hint">Выбери, что править. Сохранённое сразу видно у тебя, у остальных — через минуту-две.</div>
      ${total > 8 ? '<input class="editor-search" type="search" placeholder="Поиск по названию" autocomplete="off">' : ''}
      ${sections.filter(([, list]) => list.length).map(([label, list]) => `
        <div class="editor-list-section">
          ${sections.length > 1 ? `<div class="editor-list-title">${label}</div>` : ''}
          ${list.map(row).join('')}
        </div>`).join('') || '<div class="editor-hint">Пока нечего править — попроси владельца группы открыть тебе правку персонажа.</div>'}
    </div>`);

  const list = modalContent.querySelector('.editor-list');
  list.addEventListener('click', (e) => {
    const btn = e.target.closest('.editor-item');
    const node = btn && hooks.graph.get(btn.dataset.id);
    if (!node) return;
    if (node.kind === 'character') hooks.openCharacterEditor(node);
    else showNodeEditor(node);
  });
  list.querySelector('.editor-search')?.addEventListener('input', (e) => {
    const q = normalizeName(e.target.value);
    list.querySelectorAll('.editor-list-section').forEach(section => {
      let visible = 0;
      section.querySelectorAll('.editor-item').forEach(item => {
        item.hidden = !!q && !item.dataset.search.includes(q);
        if (!item.hidden) visible++;
      });
      section.hidden = !visible;
    });
  });
}

/* ============================================================
   Персонаж
   ============================================================ */

// Ближайший предок (по черновому parent), у которого есть своя карта
// (submap типа dzi) — туда и ставится персонаж «внутри локации».
function submapLocationFor(draft) {
  if (!hooks) return null;
  let node = draft.parent ? hooks.graph.get(draft.parent) : null;
  const seen = new Set();
  while (node && !seen.has(node)) {
    seen.add(node);
    if (node.kind === 'location' && node.data.submap && node.data.submap.type === 'dzi') return node;
    node = node.parent;
  }
  return null;
}

export function showEditor(char) {
  if (!hooks || !canEdit(char.id)) return;
  const draft = draftFor('character', char);
  const graph = hooks.graph;
  const selfNode = graph.get(char.id);

  const parents = [...graph.values()].filter(n => (n.kind === 'story' || n.kind === 'location') && n.onMap !== false);
  const stories = parents.filter(n => n.kind === 'story');
  // "role": "event" в markers.json — это события (ромбы на карте: Гроксы,
  // Терране и т.п.), а не локации, — отдельной группой.
  const events = parents.filter(n => n.kind === 'location' && n.data.role === 'event');
  const locations = parents.filter(n => n.kind === 'location' && n.data.role !== 'event');
  const option = (n) => `<option value="${escapeHtml(n.id)}"${draft.parent === n.id ? ' selected' : ''}>${escapeHtml(nodeLabel(n))}</option>`;

  // Союз двусторонний (см. graph.js): если связь записана у ДРУГОГО
  // персонажа, снять её отсюда нельзя — показываем отмеченной и неактивной.
  const incoming = new Set(selfNode ? selfNode.links.map(n => n.id) : []);
  draft.links.forEach(id => incoming.delete(id));
  const others = [...graph.values()].filter(n => n.kind === 'character' && n.id !== char.id);
  // Союзники — по сюжетам/локациям, свой (по черновой привязке) первым: союзники
  // чаще всего там, а сплошной ряд из всех персонажей карты читать неудобно.
  const groups = new Map();
  others.forEach(n => {
    const key = n.parent ? n.parent.id : '';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(n);
  });
  const groupKeys = [...groups.keys()].sort((a, b) => (b === draft.parent) - (a === draft.parent));

  const loc = submapLocationFor(draft);
  const place = !draft.parent
    ? `<div class="editor-place">
         <div>Карта галактики: <b>${draft.x == null ? 'не указано' : `${draft.x}, ${draft.y}`}</b></div>
         <button type="button" class="editor-btn" data-act="pick-map">📍 Указать на карте</button>
       </div>`
    : `<div class="editor-hint">На карте галактики персонаж стоит рядом со своей привязкой.</div>`;
  const submapPlace = loc
    ? `<div class="editor-place">
         <div>Карта «${escapeHtml(nodeLabel(loc))}»: <b>${draft.submapX == null ? 'не указано' : `${draft.submapX}, ${draft.submapY}`}</b></div>
         <button type="button" class="editor-btn" data-act="pick-submap">🏙 Указать на карте локации</button>
         ${draft.submapX == null ? '' : '<button type="button" class="editor-btn editor-btn--ghost" data-act="clear-submap">Убрать</button>'}
       </div>`
    : '';

  modalContent.innerHTML = `
    <form class="editor" autocomplete="off">
      <div class="editor-title">✏️ ${escapeHtml(char.name || char.id)}</div>
      ${pendingHint('character', char.id)}

      <fieldset class="editor-section">
        <legend>Анкета</legend>
        ${TEXT_FIELDS.map(([key, label]) => `
          <label class="editor-field">${label}
            <input name="${key}" maxlength="${TEXT_MAX}" value="${escapeHtml(draft[key])}">
          </label>`).join('')}
        <label class="editor-field">Ссылка на анкету
          <input name="sheetUrl" type="url" maxlength="${URL_MAX}" placeholder="https://…" value="${escapeHtml(draft.sheetUrl)}">
        </label>
      </fieldset>

      <fieldset class="editor-section">
        <legend>Аватар</legend>
        <div class="editor-avatar-row">
          <div class="editor-avatar">
            ${char.image
              ? `<img src="${escapeHtml(char.image)}" alt="" onerror="this.remove()">`
              : ''}
            <span>${escapeHtml((char.name || '?').trim().charAt(0).toUpperCase())}</span>
          </div>
          <div>
            <div class="editor-hint">${char.image ? 'Текущий аватар.' : 'Аватара пока нет.'} Окно закроется, бот попросит прислать арт в личку. Правки формы сохранятся заодно.</div>
            <button type="button" class="editor-btn" data-act="avatar">🖼 Сменить аватар</button>
          </div>
        </div>
      </fieldset>

      <fieldset class="editor-section">
        <legend>Привязка и место</legend>
        <label class="editor-field">Где персонаж
          <select name="parent">
            <option value=""${draft.parent ? '' : ' selected'}>— Отдельно, своё место на карте —</option>
            ${stories.length ? `<optgroup label="Сюжеты">${stories.map(option).join('')}</optgroup>` : ''}
            ${locations.length ? `<optgroup label="Локации">${locations.map(option).join('')}</optgroup>` : ''}
            ${events.length ? `<optgroup label="События">${events.map(option).join('')}</optgroup>` : ''}
          </select>
        </label>
        ${place}
        ${submapPlace}
      </fieldset>

      <fieldset class="editor-section">
        <legend>Союзники</legend>
        ${groupKeys.map(key => `
          <div class="editor-links-group">
            <div class="editor-links-title">${escapeHtml(key ? fullTitle(graph.get(key)) : 'Отдельно на карте')}</div>
            <div class="editor-links">${groups.get(key).map(n => linkChip(n, draft, incoming, n.data.name || n.id)).join('')}</div>
          </div>`).join('')}
        <div class="editor-hint">Серые отметки — союз указан у другого персонажа, снять его может только его игрок.</div>
      </fieldset>

      <div class="editor-status" role="status"></div>
      <div class="editor-actions">
        <button type="button" class="editor-btn editor-btn--ghost" data-act="reset">Сбросить</button>
        <button type="submit" class="editor-btn editor-btn--primary">💾 Сохранить</button>
      </div>
    </form>`;

  const form = modalContent.querySelector('form');
  const {say, report} = statusHelpers(form);
  wireLinks(form, draft, say, 'союзников');

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.name !== 'links' && el.name in draft) draft[el.name] = el.value.trim();
    syncClosingConfirmation();
  });
  // Смена привязки меняет, какие поля места вообще показывать — перерисовка.
  form.querySelector('select[name="parent"]').addEventListener('change', () => showEditor(char));

  const problemOf = (set) => {
    const problem = textProblem('character', set, ['name', 'race', 'role', 'sheetUrl'], ['name', 'race', 'role']);
    if (problem) return problem;
    if (set.sheetUrl && !/^https:\/\/\S+$/i.test(set.sheetUrl)) return 'Ссылка на анкету должна начинаться с https:// и быть без пробелов.';
    if ('name' in set) {
      if (!set.name) return 'Имя не может быть пустым.';
      const wanted = normalizeName(set.name);
      if (others.some(n => normalizeName(n.data.name) === wanted)) return `Имя «${set.name}» уже занято другим персонажем.`;
    }
    return '';
  };

  // next — 'avatar': после сохранения полей бот ещё и попросит арт. Всё одной
  // отправкой: sendData закрывает окно, второй раз отправить уже не выйдет.
  const submit = (next) => {
    const set = changesOf('character', char, draft);
    const hasSet = Object.keys(set).length > 0;
    if (!hasSet && !next) { say('Изменений нет.'); return; }
    const problem = hasSet ? problemOf(set) : '';
    if (problem) { say(problem, true); return; }
    const payload = hasSet ? {v: 1, t: 'char', id: char.id, set} : {v: 1, t: next, id: char.id};
    if (hasSet && next) payload.next = next;
    const before = fieldsOf('character', char);
    report(sendToBot(payload, hasSet ? () => rememberPending('character', char.id, before, set) : null));
  };

  form.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'pick-map') {
      hooks.pickOnMap(char, (p) => { draft.x = Math.round(p.x); draft.y = Math.round(p.y); syncClosingConfirmation(); });
    } else if (act === 'pick-submap') {
      hooks.pickOnSubmap(char, loc, (p) => { draft.submapX = Math.round(p.x); draft.submapY = Math.round(p.y); syncClosingConfirmation(); });
    } else if (act === 'clear-submap') {
      draft.submapX = null; draft.submapY = null;
      syncClosingConfirmation();
      showEditor(char);
    } else if (act === 'reset') {
      drafts.delete('character:' + char.id);
      syncClosingConfirmation();
      showEditor(char);
    } else if (act === 'avatar') {
      submit('avatar');
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(null);
  });
}

/* ============================================================
   Сюжеты, локации и события — только владелец группы (mine=*).
   Данные — stories.json и markers.json («role»: «event» = событие).

   Описание и картинку форма НЕ отправляет сама: sendData ограничен 4096
   байтами, а описание сюжета бывает длиннее (у «Переворота» ~5 КБ в UTF-8).
   Кнопки «Изменить описание»/«Сменить картинку» закрывают карту (сохранив
   заодно поля формы), и бот ждёт текст или фото следующим сообщением в личке.
   ============================================================ */
export function showNodeEditor(node) {
  if (!hooks || !canEditNodes() || !node || (node.kind !== 'story' && node.kind !== 'location')) return;
  const draft = draftFor(node.kind, node.data);
  const graph = hooks.graph;
  const isStory = node.kind === 'story';
  const kindLabel = isStory ? 'Сюжет' : (draft.role === 'event' ? 'Событие' : 'Локация');
  const submap = node.data.submap;
  // Где описание вообще показывается: у сюжета, у события/локации без своей
  // карты (карточка) и у локации-«info» (текст в окне, как у Авалона). У
  // локации с тайловой картой (Феном) описание — статья справочника.
  const hasText = isStory || !submap || submap.type === 'info';

  // Привязать к себе или к своему же потомку нельзя — получится цикл.
  const descendants = new Set();
  (function collect(n) { n.children.forEach(ch => { descendants.add(ch.id); collect(ch); }); })(node);
  const targets = [...graph.values()].filter(n =>
    (n.kind === 'story' || n.kind === 'location') && n.id !== node.id && !descendants.has(n.id));
  const groups = [
    ['Сюжеты', targets.filter(n => n.kind === 'story')],
    ['Локации', targets.filter(n => n.kind === 'location' && n.data.role !== 'event')],
    ['События', targets.filter(n => n.kind === 'location' && n.data.role === 'event')],
  ];
  const option = (n) => `<option value="${escapeHtml(n.id)}"${draft.parent === n.id ? ' selected' : ''}>${escapeHtml(nodeLabel(n))}</option>`;
  const linkTargets = [...graph.values()].filter(n => (n.kind === 'story' || n.kind === 'location') && n.id !== node.id);
  const incoming = new Set(node.links.map(n => n.id));
  draft.links.forEach(id => incoming.delete(id));

  const image = isStory ? (node.data.markerImage || (node.data.images || [])[0] || '') : (node.data.image || '');
  const input = (name, label, max, extra = '') =>
    `<label class="editor-field">${label}<input name="${name}" maxlength="${max}" value="${escapeHtml(draft[name])}" ${extra}></label>`;

  openIframeModal('about:blank', null);
  modalContent.innerHTML = `
    <form class="editor" autocomplete="off">
      <div class="editor-title">✏️ ${escapeHtml(kindLabel)}: ${escapeHtml(node.data.title || node.id)}</div>
      ${pendingHint(node.kind, node.id)}

      <fieldset class="editor-section">
        <legend>Основное</legend>
        ${input('title', 'Название', TITLE_MAX)}
        ${isStory ? `
          ${input('shortTitle', 'Короткое название (для вкладки в окне локации)', SHORT_TITLE_MAX)}
          ${input('code', 'Номер (например 2 или К.3)', CODE_MAX)}
          ${input('archiveUrl', 'Ссылка на архив', URL_MAX, 'type="url" placeholder="https://…"')}
          ${input('color', 'Цвет маркера (пусто — по умолчанию)', COLOR_MAX, 'placeholder="#ffd76a"')}
        ` : (submap ? '' : `
          <label class="editor-field">Тип
            <select name="role">
              <option value=""${draft.role ? '' : ' selected'}>Локация</option>
              <option value="event"${draft.role === 'event' ? ' selected' : ''}>Событие (ромб)</option>
            </select>
          </label>`)}
      </fieldset>

      <fieldset class="editor-section">
        <legend>${hasText ? 'Описание и картинка' : 'Картинка'}</legend>
        <div class="editor-avatar-row">
          <div class="editor-avatar">
            ${image ? `<img src="${escapeHtml(image)}" alt="" onerror="this.remove()">` : ''}
            <span>${escapeHtml((node.data.title || '?').trim().charAt(0).toUpperCase())}</span>
          </div>
          <div>
            <div class="editor-hint">Окно закроется, бот попросит прислать ${hasText ? 'текст или фото' : 'фото'} в личку. Правки формы сохранятся заодно.${hasText ? ' Текущее описание бот пришлёт — его можно скопировать и поправить.' : ' Описание этой локации — статья справочника.'}</div>
            ${hasText ? '<button type="button" class="editor-btn" data-act="text">📝 Изменить описание</button>' : ''}
            <button type="button" class="editor-btn" data-act="image">🖼 Сменить картинку</button>
          </div>
        </div>
      </fieldset>

      <fieldset class="editor-section">
        <legend>Привязка и место</legend>
        <label class="editor-field">Где находится
          <select name="parent">
            <option value=""${draft.parent ? '' : ' selected'}>— Отдельно, своё место на карте —</option>
            ${groups.map(([label, list]) => list.length ? `<optgroup label="${label}">${list.map(option).join('')}</optgroup>` : '').join('')}
          </select>
        </label>
        ${draft.parent
          ? '<div class="editor-hint">На карте галактики стоит рядом со своей привязкой.</div>'
          : `<div class="editor-place">
               <div>Карта галактики: <b>${draft.x == null ? 'не указано' : `${draft.x}, ${draft.y}`}</b></div>
               <button type="button" class="editor-btn" data-act="pick-map">📍 Указать на карте</button>
             </div>`}
      </fieldset>

      <fieldset class="editor-section">
        <legend>Связи</legend>
        <div class="editor-links">
          ${linkTargets.map(n => linkChip(n, draft, incoming, nodeLabel(n))).join('')}
        </div>
        <div class="editor-hint">Серые отметки — связь записана у другой точки, снимается в её правке.</div>
      </fieldset>

      <div class="editor-status" role="status"></div>
      <div class="editor-actions">
        <button type="button" class="editor-btn editor-btn--ghost" data-act="reset">Сбросить</button>
        <button type="submit" class="editor-btn editor-btn--primary">💾 Сохранить</button>
      </div>
    </form>`;

  const form = modalContent.querySelector('form');
  const {say, report} = statusHelpers(form);
  wireLinks(form, draft, say, 'связей');

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.name !== 'links' && el.name in draft) draft[el.name] = el.value.trim();
    syncClosingConfirmation();
  });
  form.querySelector('select[name="parent"]').addEventListener('change', () => showNodeEditor(node));

  const problemOf = (set) => {
    if ('title' in set && !set.title) return 'Название не может быть пустым.';
    const problem = textProblem(node.kind, set, ['title', 'shortTitle', 'code', 'archiveUrl'], ['title', 'shortTitle']);
    if (problem) return problem;
    if (set.archiveUrl && !/^https:\/\/\S+$/i.test(set.archiveUrl)) return 'Ссылка на архив должна начинаться с https:// и быть без пробелов.';
    if (set.color && !/^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\))$/i.test(set.color)) return 'Цвет: например #ffd76a (или пусто — цвет по умолчанию).';
    return '';
  };

  // next — 'text' / 'image': после полей бот ждёт описание или картинку.
  const submit = (next) => {
    const set = changesOf(node.kind, node.data, draft);
    const hasSet = Object.keys(set).length > 0;
    if (!hasSet && !next) { say('Изменений нет.'); return; }
    const problem = hasSet ? problemOf(set) : '';
    if (problem) { say(problem, true); return; }
    const payload = hasSet ? {v: 1, t: 'node', id: node.id, set} : {v: 1, t: next, id: node.id};
    if (hasSet && next) payload.next = next;
    const before = fieldsOf(node.kind, node.data);
    report(sendToBot(payload, hasSet ? () => rememberPending(node.kind, node.id, before, set) : null));
  };

  form.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'pick-map') {
      hooks.pickPlace(node.data.title || 'точка', (p) => {
        draft.x = Math.round(p.x);
        draft.y = Math.round(p.y);
        syncClosingConfirmation();
      }, () => showNodeEditor(node));
    } else if (act === 'reset') {
      drafts.delete(node.kind + ':' + node.id);
      syncClosingConfirmation();
      showNodeEditor(node);
    } else if (act === 'text' || act === 'image') {
      submit(act);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submit(null);
  });
}
