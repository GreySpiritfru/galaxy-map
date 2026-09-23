/* ============================================================
   Окно мировой точки — ОДНО на все точки world.json (23.09.2026).

   До этого одна и та же по смыслу карточка рисовалась тремя разными кусками
   кода: простой модал у точки с одним текстом, «info»-ветка в js/phenom.js у
   Кольца Авалона и отдельный файл js/stories.js у сюжета. Расходились они
   только тем, чего у точки НЕ заполнено, — поэтому здесь один рендер, который
   просто пропускает пустое: нет баннеров — нет картинок, нет архива — нет
   кнопки, нет детей-персонажей — нет их ряда.

   ⚠️ Физически окон по-прежнему ДВА (#phenomOverlay и #storyOverlay) — это не
   дубль, а два СЛОЯ: точка, открытая из окна своего родителя, должна лечь
   поверх него, а не вместо (локация -> сюжет -> персонаж, см. раздел про
   стекинг в CLAUDE.md). Рисует их обоих этот файл, хозяева слоёв — phenom.js
   (нижний, он же умеет тайловую карту) и stories.js (верхний).
   ============================================================ */
import { escapeHtml } from './modal.js?v=125';

// Пост в Telegram-канале со списком всех сюжетов — один и тот же для любой
// точки, поэтому не в данных, а константой здесь.
export const STORIES_INDEX_URL = 'https://t.me/phenomesdeep/1/206';

/* Разбивает персонажей точки на группы связанных между собой (по их links) —
   связные компоненты. Один персонаж без союзников — группа из одного. Порядок
   внутри группы и между группами сохраняет исходный порядок из
   characters.json, чтобы список не прыгал между открытиями. */
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

function chipHtml(c) {
  return `
    <button class="story-character-chip" data-char-id="${escapeHtml(c.id)}" title="${escapeHtml(c.name || '')}">
      ${c.image
        ? `<img src="${escapeHtml(c.image)}" alt="">`
        : `<span class="story-character-fallback">${escapeHtml((c.name || '?').trim().charAt(0))}</span>`}
    </button>`;
}

/* Содержимое окна: ряд персонажей, баннеры, заголовок, описание в
   сворачиваемой цитате. Всё необязательное — точка объявляет только то, что у
   неё есть. onCharacter(id) вызывается по тапу на портрет.

   Персонажи-дети показываются у ЛЮБОЙ точки, а не только у сюжета
   (23.09.2026, по просьбе игрока): привязал персонажа к кораблю — он виден в
   окне корабля, ровно как раньше у сюжета. */
export function renderNodeContent(container, view, onCharacter) {
  const chars = Array.isArray(view.characters) ? view.characters : [];
  const charsHtml = chars.length ? `
    <div class="story-characters">
      ${groupByLinks(chars).map(group => group.length > 1
        ? `<div class="story-character-group">${group.map(chipHtml).join('')}</div>`
        : chipHtml(group[0])).join('')}
    </div>` : '';

  const imagesHtml = (Array.isArray(view.images) ? view.images : [])
    .map(src => `<img class="story-banner-img" src="${escapeHtml(src)}" alt="" loading="lazy">`)
    .join('');

  const codeHtml = view.code ? `<span class="story-code">${escapeHtml(view.code)}</span> ` : '';
  const doneHtml = view.completed ? ' <span class="story-completed">✅ Завершён</span>' : '';
  const descHtml = view.description
    ? `<details class="story-accordion" open>
         <summary>Описание:</summary>
         <div class="story-accordion-body">${escapeHtml(view.description).replace(/\n/g, '<br>')}</div>
       </details>`
    : '';

  container.innerHTML = `
    ${charsHtml}
    ${imagesHtml}
    <div class="story-title">${codeHtml}${escapeHtml(view.title || '')}${doneHtml}</div>
    ${descHtml}
  `;

  container.querySelectorAll('.story-character-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      // Окно точки НЕ закрываем — окно персонажа открывается ПОВЕРХ него
      // (модал выше по z-index, см. грабли №7), поэтому закрытие анкеты сразу
      // возвращает к той же точке без повторного перехода через карту.
      if (onCharacter) onCharacter(btn.dataset.charId);
    });
  });
}

/* Кнопки ряда-таббара. refs — элементы конкретного слоя (у каждого свои id в
   разметке), view — та же точка, handlers — что делать по нажатию. Кнопка,
   которой у точки нет содержимого, прячется целиком: пустых кнопок в ряду
   быть не должно, он и так узкий (грабли №12). */
export function applyNodeToolbar(refs, view, handlers) {
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };

  // Переход к родителю: подпись и иконка приходят из map.js (PARENT_KIND_META).
  show(refs.parent, !!view.parentMeta);
  if (refs.parent && view.parentMeta) {
    refs.parent.querySelector('.tabbar-btn-icon').textContent = view.parentMeta.icon;
    refs.parent.querySelector('.tabbar-btn-label').textContent = view.parentMeta.label;
  }

  /* Статья. Два источника: "ref" — статья-справочник из js/articles.js
     (открывает общий обработчик по data-ref), "url" — любая внешняя ссылка.
     Раньше это умела только локация с submap, теперь — любая точка. */
  const art = view.article;
  show(refs.article, !!art);
  if (refs.article && art) {
    refs.article.querySelector('.tabbar-btn-label').textContent = art.label || 'Статья';
    if (art.ref) {
      refs.article.dataset.ref = art.ref;
      refs.article.onclick = null; // дальше сработает общий обработчик [data-ref]
    } else {
      delete refs.article.dataset.ref;
      refs.article.onclick = () => window.open(art.url, '_blank', 'noopener');
    }
  }

  show(refs.archive, !!view.archiveUrl);
  if (refs.archive) {
    refs.archive.onclick = view.archiveUrl
      ? () => window.open(view.archiveUrl, '_blank', 'noopener')
      : null;
  }

  // Оглавление сюжетов в канале — только у точки с маяком: ровно она и есть
  // «сюжет» в новой схеме (галочка отвечает за мигание и за эту кнопку).
  show(refs.index, !!view.beacon);
  if (refs.index) {
    refs.index.onclick = () => window.open(STORIES_INDEX_URL, '_blank', 'noopener');
  }

  if (refs.edit) refs.edit.hidden = !view.canEdit;

  // Вкладки детей-точек (у Фенома это его сюжеты). Пересчитываются при КАЖДОМ
  // открытии: ряд общий на все точки, и вкладки предыдущей остались бы висеть
  // в окне следующей (баг 14.09.2026, см. CLAUDE.md).
  if (refs.toolbar) {
    refs.toolbar.querySelectorAll('.phenom-story-tab').forEach(el => el.remove());
    (view.children || []).forEach(item => {
      const btn = document.createElement('button');
      btn.className = 'tabbar-btn phenom-story-tab';
      btn.innerHTML = '<span class="tabbar-btn-icon" aria-hidden="true"></span><span class="tabbar-btn-label"></span>';
      btn.querySelector('.tabbar-btn-icon').textContent = item.icon;
      btn.querySelector('.tabbar-btn-label').textContent = item.label;
      btn.title = item.label;
      btn.addEventListener('click', () => handlers.onChild && handlers.onChild(item.id));
      refs.toolbar.appendChild(btn);
    });
  }
}
