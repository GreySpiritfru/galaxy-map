/* ============================================================
   Окно-вкладыш сюжетного маркера — тот же внешний слой, что и у окна
   "Феном" (.phenom-overlay/.phenom-card): карта галактики под ним видна,
   только затемнена по краям. Но внутри не тайловая карта, а текст: заголовок,
   баннер-изображения, сворачиваемое описание (нативный <details>/<summary> —
   не нужно вручную городить JS-состояние открыто/закрыто) и кнопка "Архив
   постов сюжета" в шторке сверху, ведущая на полный текст сюжета вовне
   (полный состав ведущих/персонажей сознательно НЕ дублируется на карте —
   он уже есть в архиве). Данные — см. stories.json и openStory() в map.js.
   ============================================================ */
import { escapeHtml } from './modal.js?v=50';

// Пост в Telegram-канале со списком всех сюжетов — один и тот же для любого
// открытого сюжета, поэтому не в stories.json, а константой здесь.
const STORIES_INDEX_URL = 'https://t.me/phenomesdeep/1/206';

const storyOverlay = document.getElementById('storyOverlay');
const storyContent = document.getElementById('storyContent');
const storyArchiveBtn = document.getElementById('storyArchive');
const storyTelegramBtn = document.getElementById('storyTelegram');
let storyArmed = false;

storyTelegramBtn.addEventListener('click', () => {
  window.open(STORIES_INDEX_URL, '_blank', 'noopener');
});

// Переход "сюжет -> персонаж" (обратная сторона кнопки "Сюжет" в окне
// персонажа, см. js/characters.js): map.js регистрирует сюда колбэк, который
// наводит камеру на персонажа и открывает его окно — тот же общий механизм
// focusAndOpen, что и у всех остальных переходов между маркерами. Тут просто
// дырка для этого колбэка, чтобы stories.js не пришлось знать про
// camera/openCharacter напрямую.
let goToCharacter = null;
export function setCharacterNavigator(fn) { goToCharacter = fn; }

/* Разбивает персонажей сюжета на группы связанных между собой (по их
   links) — связные компоненты. Один персонаж без союзников — группа из
   одного. Порядок внутри группы и между группами сохраняет исходный
   порядок из characters.json, чтобы список не прыгал между открытиями. */
function groupByLinks(chars) {
  const byId = new Map(chars.map(c => [c.id, c]));
  const visited = new Set();
  const groups = [];
  chars.forEach(c => {
    if (visited.has(c.id)) return;
    const group = [];
    const stack = [c];
    visited.add(c.id);
    while (stack.length) {
      const cur = stack.pop();
      group.push(cur);
      (cur.links || []).forEach(id => {
        const other = byId.get(id);
        if (!other || visited.has(id)) return;
        visited.add(id);
        stack.push(other);
      });
    }
    groups.push(group);
  });
  return groups;
}

export function openStory(s) {
  const codeHtml = s.code ? `<span class="story-code">${escapeHtml(s.code)}</span> ` : '';
  const imagesHtml = (Array.isArray(s.images) ? s.images : [])
    .map(src => `<img class="story-banner-img" src="${escapeHtml(src)}" alt="" loading="lazy">`)
    .join('');
  const descHtml = s.description ? escapeHtml(s.description).replace(/\n/g, '<br>') : '';

  /* s.__characters — персонажи, привязанные к этому сюжету ("parent" в
     characters.json), проставляется в map.js перед вызовом openStory().
     Каждый — {id, name, image, links}, где links это союзники ВНУТРИ этого
     же сюжета. Тот же маркер-квадрат, что и на карте (см.
     .story-character-chip в css/styles.css), тап уводит прямо к персонажу —
     обратная связь к кнопке "Сюжет" в его собственном окне.

     Связанные персонажи собираются в одну группу (.story-character-group) и
     стоят вместе под общей чертой — тот же смысл, что у нити между ними на
     карте, только здесь это HTML, а не SVG. */
  const chars = Array.isArray(s.__characters) ? s.__characters : [];
  const chipHtml = (c) => `
    <button class="story-character-chip" data-char-id="${escapeHtml(c.id)}" title="${escapeHtml(c.name || '')}">
      ${c.image
        ? `<img src="${escapeHtml(c.image)}" alt="">`
        : `<span class="story-character-fallback">${escapeHtml((c.name || '?').trim().charAt(0))}</span>`}
    </button>`;
  const charsHtml = chars.length ? `
    <div class="story-characters">
      ${groupByLinks(chars).map(group => group.length > 1
        ? `<div class="story-character-group">${group.map(chipHtml).join('')}</div>`
        : chipHtml(group[0])).join('')}
    </div>` : '';

  storyContent.innerHTML = `
    ${charsHtml}
    ${imagesHtml}
    <div class="story-title">${codeHtml}${escapeHtml(s.title || '')}</div>
    <details class="story-accordion" open>
      <summary>Описание истории:</summary>
      <div class="story-accordion-body">${descHtml}</div>
    </details>
  `;

  storyContent.querySelectorAll('.story-character-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      // Окно сюжета НЕ закрываем — окно персонажа открывается поверх него
      // (модал персонажа выше в z-index, см. грабли №7), а само окно
      // сюжета остаётся открытым позади. Так закрытие анкеты персонажа
      // (крестик/фон) сразу возвращает к тому же сюжету без повторного
      // перехода через карту.
      if (goToCharacter) goToCharacter(btn.dataset.charId);
    });
  });

  storyArchiveBtn.style.display = s.archiveUrl ? '' : 'none';
  storyArchiveBtn.onclick = s.archiveUrl
    ? () => window.open(s.archiveUrl, '_blank', 'noopener')
    : null;

  storyOverlay.classList.add('open');
  // Та же защита от "хвоста" клика по маркеру, что и у окна Феном/модала
  // маркеров — без неё синтетический клик, идущий следом за тапом по
  // маркеру, тут же закрывал бы только что открывшееся окно.
  storyArmed = false;
  setTimeout(() => { storyArmed = true; }, 300);
}

// Открыто ли окно сюжета сейчас — нужно снаружи (js/navigation.js) для
// единого "шага назад" (ESC/Telegram BackButton/history браузера).
export function isStoryOpen() {
  return storyOverlay.classList.contains('open');
}

export function closeStory() {
  storyOverlay.classList.remove('open');
}

document.getElementById('storyClose').addEventListener('click', closeStory);
storyOverlay.addEventListener('click', (e) => {
  if (!storyArmed) return;
  if (e.target === storyOverlay) closeStory();
});
