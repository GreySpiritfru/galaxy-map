/* ============================================================
   Окно персонажа. Устроено как статья-справочник: тот же полноэкранный
   модал с iframe и та же "пристыкованная" панель сверху (см. openIframeModal
   в modal.js), только вкладки не про переход между статьями, а про одного
   персонажа — анкета, связанный сюжет, заметки, броски.

   Данные — characters.json, отрисовка маркеров — renderCharacters() в map.js
   (маркеры персонажей квадратные со скруглением, чтобы отличались от круглых
   маркеров фракций и сюжетов).
   ============================================================ */
import { openIframeModal, isDockedWith, modalContent, escapeHtml } from './modal.js?v=129';
import { canEdit, showEditor } from './editor.js?v=129';
import { setTabIcon } from './node-window.js?v=129';

const charToolbar = document.getElementById('charToolbar');
const sheetBtn = document.getElementById('charSheet');
const storyBtn = document.getElementById('charStory');
const notesBtn = document.getElementById('charNotes');
const rollsBtn = document.getElementById('charRolls');
// «✏️ Правка» — только у своих персонажей и только в карте, открытой
// кнопкой из лички бота (см. js/editor.js).
const editBtn = document.getElementById('charEdit');

// Персонаж, чьё окно открыто сейчас. Нужен и кнопкам этой панели, и map.js —
// оттуда вешается переход на связанный сюжет (там есть и список сюжетов, и
// камера, см. #charStory в map.js).
let current = null;
export function getOpenCharacter() { return current; }

function setActive(btn) {
  [sheetBtn, notesBtn, rollsBtn, editBtn].forEach(b => b.classList.toggle('active', b === btn));
}

// Вкладка-заглушка вместо iframe. Панель при этом остаётся пристыкованной,
// так что вернуться на анкету можно одним тапом.
function showStub(btn, title, text) {
  modalContent.innerHTML = `
    <div class="char-stub">
      <div class="char-stub-title">${escapeHtml(title)}</div>
      <div>${escapeHtml(text)}</div>
    </div>`;
  setActive(btn);
}

export function openCharacter(char, {edit = false} = {}) {
  current = char;
  editBtn.hidden = !canEdit(char.id);
  if (edit && canEdit(char.id)) {
    // Возврат к форме после выбора места на карте — анкету не грузим вовсе.
    openIframeModal('about:blank', charToolbar, editBtn);
    showEditor(char);
    setActive(editBtn);
    return;
  }
  if (char.sheetUrl) {
    openIframeModal(char.sheetUrl, charToolbar, sheetBtn);
  } else {
    // Анкеты нет — открываем на заглушке, но окно всё равно должно появиться,
    // иначе тап по маркеру выглядел бы как будто ничего не произошло.
    openIframeModal('about:blank', charToolbar, sheetBtn);
    showStub(sheetBtn, char.name || 'Персонаж', 'Анкета пока не заполнена.');
  }
  setActive(sheetBtn);
}

sheetBtn.addEventListener('click', () => {
  if (!current || !current.sheetUrl) return;
  // Уже на анкете — ничего не делаем, чтобы не перезагружать iframe впустую
  // (и чтобы не переоткрывать модал, ломая точку возврата панели, см. грабли №13).
  const iframe = modalContent.querySelector('iframe');
  if (isDockedWith(charToolbar) && iframe && iframe.src === current.sheetUrl) return;
  modalContent.innerHTML = `<iframe src="${escapeHtml(current.sheetUrl)}" loading="lazy"></iframe>`;
  setActive(sheetBtn);
});

editBtn.addEventListener('click', () => {
  if (!current || !canEdit(current.id)) return;
  showEditor(current);
  setActive(editBtn);
});

notesBtn.addEventListener('click', () => {
  showStub(notesBtn, 'Заметки', 'Раздел в разработке: тут будут заметки по персонажу.');
});

rollsBtn.addEventListener('click', () => {
  showStub(rollsBtn, 'Броски', 'Раздел в разработке: тут будет история бросков кубов.');
});

// ✕ (#charToolbarClose) больше не вешается тут — js/navigation.js сам вешает
// на него closeTop() (единая точка входа для всех "закрывающих" кнопок
// сразу, см. комментарий там).

// Кнопка "Сюжет"/"Локация" видима только если у персонажа вообще есть
// родитель в графе, а подпись/иконка зависят от ЕГО типа (marker="Локация",
// story="Сюжет", см. PARENT_KIND_META в map.js) — Ледо/Текила привязаны
// напрямую к Феному (маркеру), а не к сюжету, и кнопка должна называться
// соответственно. Сам обработчик клика живёт в map.js — там есть и граф, и
// камера для перелёта к маркеру родителя.
export function updateStoryButton(meta) {
  storyBtn.style.display = meta ? '' : 'none';
  if (!meta) return;
  // Значок — арт самого сюжета/места, а не смайлик (setTabIcon в node-window.js).
  setTabIcon(storyBtn.querySelector('.tabbar-btn-icon'), meta);
  storyBtn.querySelector('.tabbar-btn-label').textContent = meta.label;
}
