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
import { escapeHtml } from './modal.js?v=36';

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
// закрывает текущую позицию карты, наводит камеру на персонажа и открывает
// его окно — тот же общий механизм focusAndOpen, что и у всех остальных
// переходов между маркерами. Тут просто дырка для этого колбэка, чтобы
// stories.js не пришлось знать про camera/openCharacter напрямую.
let goToCharacter = null;
export function setCharacterNavigator(fn) { goToCharacter = fn; }

export function openStory(s) {
  const codeHtml = s.code ? `<span class="story-code">${escapeHtml(s.code)}</span> ` : '';
  const imagesHtml = (Array.isArray(s.images) ? s.images : [])
    .map(src => `<img class="story-banner-img" src="${escapeHtml(src)}" alt="" loading="lazy">`)
    .join('');
  const descHtml = s.description ? escapeHtml(s.description).replace(/\n/g, '<br>') : '';

  // s.__characters — персонажи, закреплённые за этим сюжетом (storyId в
  // characters.json), проставляется в map.js перед вызовом openStory(). Тот
  // же маркер-квадрат, что и на карте (см. .story-character-chip в
  // css/styles.css) — тап уводит прямо к персонажу, обратная связь к кнопке
  // "Сюжет" в его собственном окне.
  const chars = Array.isArray(s.__characters) ? s.__characters : [];
  const charsHtml = chars.length ? `
    <div class="story-characters">
      ${chars.map(c => `
        <button class="story-character-chip" data-char-id="${escapeHtml(c.id)}" title="${escapeHtml(c.name || '')}">
          ${c.image
            ? `<img src="${escapeHtml(c.image)}" alt="">`
            : `<span class="story-character-fallback">${escapeHtml((c.name || '?').trim().charAt(0))}</span>`}
        </button>`).join('')}
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
      const char = chars.find(c => c.id === btn.dataset.charId);
      if (!char) return;
      closeStory();
      if (goToCharacter) goToCharacter(char);
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

function closeStory() {
  storyOverlay.classList.remove('open');
}

document.getElementById('storyClose').addEventListener('click', closeStory);
storyOverlay.addEventListener('click', (e) => {
  if (!storyArmed) return;
  if (e.target === storyOverlay) closeStory();
});
