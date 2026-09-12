/* ============================================================
   Окно персонажа. Устроено как статья-справочник: тот же полноэкранный
   модал с iframe и та же "пристыкованная" панель сверху (см. openIframeModal
   в modal.js), только вкладки не про переход между статьями, а про одного
   персонажа — анкета, связанный сюжет, заметки, броски.

   Данные — characters.json, отрисовка маркеров — renderCharacters() в map.js
   (маркеры персонажей квадратные со скруглением, чтобы отличались от круглых
   маркеров фракций и сюжетов).
   ============================================================ */
import { openIframeModal, closeModal, isDockedWith, modalContent, escapeHtml } from './modal.js?v=50';

const charToolbar = document.getElementById('charToolbar');
const sheetBtn = document.getElementById('charSheet');
const storyBtn = document.getElementById('charStory');
const notesBtn = document.getElementById('charNotes');
const rollsBtn = document.getElementById('charRolls');

// Персонаж, чьё окно открыто сейчас. Нужен и кнопкам этой панели, и map.js —
// оттуда вешается переход на связанный сюжет (там есть и список сюжетов, и
// камера, см. #charStory в map.js).
let current = null;
export function getOpenCharacter() { return current; }

function setActive(btn) {
  [sheetBtn, notesBtn, rollsBtn].forEach(b => b.classList.toggle('active', b === btn));
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

export function openCharacter(char) {
  current = char;
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

notesBtn.addEventListener('click', () => {
  showStub(notesBtn, 'Заметки', 'Раздел в разработке: тут будут заметки по персонажу.');
});

rollsBtn.addEventListener('click', () => {
  showStub(rollsBtn, 'Броски', 'Раздел в разработке: тут будет история бросков кубов.');
});

document.getElementById('charToolbarClose').addEventListener('click', closeModal);

// Кнопка "Сюжет" видима только если персонаж к сюжету привязан, а её
// обработчик живёт в map.js — там есть и загруженный список сюжетов, и
// камера для перелёта к маркеру.
export function updateStoryButton(hasStory) {
  storyBtn.style.display = hasStory ? '' : 'none';
}
