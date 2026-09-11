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
import { escapeHtml } from './modal.js?v=23';

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

export function openStory(s) {
  const codeHtml = s.code ? `<span class="story-code">${escapeHtml(s.code)}</span> ` : '';
  const imagesHtml = (Array.isArray(s.images) ? s.images : [])
    .map(src => `<img class="story-banner-img" src="${escapeHtml(src)}" alt="" loading="lazy">`)
    .join('');
  const descHtml = s.description ? escapeHtml(s.description).replace(/\n/g, '<br>') : '';

  storyContent.innerHTML = `
    ${imagesHtml}
    <div class="story-title">${codeHtml}${escapeHtml(s.title || '')}</div>
    <details class="story-accordion" open>
      <summary>Описание истории:</summary>
      <div class="story-accordion-body">${descHtml}</div>
    </details>
  `;

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
