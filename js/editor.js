/* ============================================================
   Редактор персонажей для игроков.

   Как это устроено целиком (подробно — раздел «Редактор» в CLAUDE.md):
   - игрок пишет боту @phenome2_bot в личку «редактор»; бот проверяет, что он
     в группе, и присылает кнопку клавиатуры с картой по ссылке
     `?edit=1&mine=<id персонажей через запятую>`;
   - здесь, в окне СВОЕГО персонажа, появляется вкладка «✏️ Правка» с формой;
   - «Сохранить» отправляет изменения боту через Telegram.WebApp.sendData
     (работает ТОЛЬКО у карты, открытой кнопкой клавиатуры; окно при этом
     закрывается), бот ещё раз проверяет права и поля и коммитит
     characters.json в репозиторий.

   ⚠️ `mine` из адреса — только подсказка, какие вкладки показывать. Защитой
   он НЕ является (адрес можно переписать руками): право на правку проверяет
   бот при получении данных, по своей таблице привязок на сервере.
   ============================================================ */
import { modalContent, escapeHtml } from './modal.js?v=104';

const params = new URLSearchParams(location.search);
const EDIT_MODE = params.get('edit') === '1';
const MINE = new Set((params.get('mine') || '').split(',').map(s => s.trim()).filter(Boolean));
// `mine=*` бот ставит владельцу группы — ему можно править всех персонажей.
const ALL = MINE.has('*');

// Лимиты — те же, что проверяет бот (handbook_bot.py, validate_character_changes).
const TEXT_MAX = 60;
const URL_MAX = 300;
const LINKS_MAX = 10;
const TEXT_FIELDS = [
  ['name', 'Имя'],
  ['race', 'Раса'],
  ['role', 'Роль'],
];

export function canEdit(id) {
  return EDIT_MODE && (ALL || MINE.has(id));
}

/* Всё, что знает только map.js (граф, камера, окна локаций), приходит сюда
   через initEditor — editor.js сам ничего не открывает и не двигает. */
let hooks = null;
export function initEditor(h) { hooks = h; }

// Черновики живут, пока открыта страница: игрок может уйти тапать место на
// карте и вернуться к форме, не потеряв остальные правки.
const drafts = new Map();

function originalOf(char) {
  return {
    name: char.name || '',
    race: char.race || '',
    role: char.role || '',
    sheetUrl: char.sheetUrl || '',
    parent: char.parent || '',
    links: Array.isArray(char.links) ? [...char.links] : [],
    x: typeof char.x === 'number' ? char.x : null,
    y: typeof char.y === 'number' ? char.y : null,
    submapX: typeof char.submapX === 'number' ? char.submapX : null,
    submapY: typeof char.submapY === 'number' ? char.submapY : null,
  };
}

function draftOf(char) {
  if (!drafts.has(char.id)) drafts.set(char.id, originalOf(char));
  return drafts.get(char.id);
}

function changedFields(char, draft) {
  const orig = originalOf(char);
  const set = {};
  Object.keys(orig).forEach(key => {
    const a = orig[key], b = draft[key];
    const same = Array.isArray(a) ? JSON.stringify(a) === JSON.stringify(b) : a === b;
    if (!same) set[key] = b;
  });
  return set;
}

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

function nodeLabel(node) {
  return node.data.shortTitle || node.data.title || node.data.name || node.id;
}

function sendToBot(payload) {
  const tg = window.Telegram && window.Telegram.WebApp;
  const json = JSON.stringify(payload);
  // platform 'unknown' — страница открыта не в Telegram (обычный браузер,
  // локальная проверка): отправлять некуда, показываем, что ушло бы боту.
  if (!tg || tg.platform === 'unknown' || typeof tg.sendData !== 'function') {
    return {ok: false, preview: json};
  }
  try {
    tg.sendData(json); // закрывает мини-приложение
    return {ok: true};
  } catch (e) {
    return {ok: false, error: e.message || String(e), preview: json};
  }
}

let currentChar = null;

export function showEditor(char) {
  if (!hooks || !canEdit(char.id)) return;
  currentChar = char;
  const draft = draftOf(char);
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

  const loc = submapLocationFor(draft);
  const hasGalaxyPlace = !draft.parent;
  const place = hasGalaxyPlace
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
            <div class="editor-hint">${char.image ? 'Текущий аватар.' : 'Аватара пока нет.'} Окно закроется, а бот попросит прислать арт в личку.</div>
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
        <div class="editor-links">
          ${others.map(n => {
            const own = draft.links.includes(n.id);
            const locked = incoming.has(n.id);
            return `<label class="editor-link${locked ? ' is-locked' : ''}">
              <input type="checkbox" name="links" value="${escapeHtml(n.id)}"${own || locked ? ' checked' : ''}${locked ? ' disabled' : ''}>
              <span>${escapeHtml(n.data.name || n.id)}</span>
            </label>`;
          }).join('')}
        </div>
        <div class="editor-hint">Серые отметки — союз указан у другого персонажа, снять его может только его игрок.</div>
      </fieldset>

      <div class="editor-status" role="status"></div>
      <div class="editor-actions">
        <button type="button" class="editor-btn editor-btn--ghost" data-act="reset">Сбросить</button>
        <button type="submit" class="editor-btn editor-btn--primary">💾 Сохранить</button>
      </div>
    </form>`;

  const form = modalContent.querySelector('form');
  const status = form.querySelector('.editor-status');
  const say = (text, isError) => {
    status.textContent = text;
    status.classList.toggle('is-error', !!isError);
  };

  form.addEventListener('input', (e) => {
    const el = e.target;
    if (el.name === 'links') {
      draft.links = [...form.querySelectorAll('input[name="links"]:checked:not(:disabled)')].map(i => i.value);
      if (draft.links.length > LINKS_MAX) {
        el.checked = false;
        draft.links = draft.links.filter(id => id !== el.value);
        say(`Не больше ${LINKS_MAX} союзников.`, true);
      }
      return;
    }
    if (el.name in draft) draft[el.name] = el.value.trim();
  });
  // Смена привязки меняет, какие поля места вообще показывать — перерисовка.
  form.querySelector('select[name="parent"]').addEventListener('change', () => showEditor(char));

  form.addEventListener('click', (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'pick-map') {
      hooks.pickOnMap(char, (p) => { draft.x = Math.round(p.x); draft.y = Math.round(p.y); });
    } else if (act === 'pick-submap') {
      hooks.pickOnSubmap(char, loc, (p) => { draft.submapX = Math.round(p.x); draft.submapY = Math.round(p.y); });
    } else if (act === 'clear-submap') {
      draft.submapX = null; draft.submapY = null;
      showEditor(char);
    } else if (act === 'reset') {
      drafts.delete(char.id);
      showEditor(char);
    } else if (act === 'avatar') {
      const res = sendToBot({v: 1, t: 'avatar', id: char.id});
      if (!res.ok) say(res.error ? `Не отправилось: ${res.error}` : `Не в Telegram — боту ушло бы: ${res.preview}`, true);
    }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const set = changedFields(char, draft);
    if (!Object.keys(set).length) { say('Изменений нет.'); return; }
    if (set.sheetUrl && !/^https:\/\//i.test(set.sheetUrl)) { say('Ссылка на анкету должна начинаться с https://', true); return; }
    if ('name' in set && !set.name) { say('Имя не может быть пустым.', true); return; }
    const res = sendToBot({v: 1, t: 'char', id: char.id, set});
    if (!res.ok) say(res.error ? `Не отправилось: ${res.error}` : `Не в Telegram — боту ушло бы: ${res.preview}`, !!res.error);
  });
}

export function getEditingCharacter() { return currentChar; }
