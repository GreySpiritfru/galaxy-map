/* ============================================================
   Окно мировой точки — ОДНО на все точки world.json (23.09.2026).

   До этого одна и та же по смыслу карточка рисовалась тремя разными кусками
   кода: простой модал у точки с одним текстом, «info»-ветка в js/phenom.js у
   Кольца Авалона и отдельный файл js/stories.js у сюжета. Расходились они
   только тем, чего у точки НЕ заполнено, — поэтому здесь один рендер, который
   просто пропускает пустое: нет баннеров — нет картинок, нет архива — нет
   кнопки, нет детей-персонажей — нет их ряда.

   ⚠️ Физически окон ТРИ (#phenomOverlay, #storyOverlay, #charOverlay) — это
   не дубль, а СЛОИ: точка, открытая из окна своего родителя, должна лечь
   поверх него, а не вместо (локация -> сюжет -> персонаж, см. раздел про
   стекинг в CLAUDE.md). Рисует их этот файл, хозяева слоёв — phenom.js
   (нижний, он же умеет тайловую карту), stories.js (средний) и characters.js
   (верхний, персонаж; с 24.09.2026 — раньше он был статьёй в модале).
   ============================================================ */
import { escapeHtml } from './modal.js?v=166';
import { REF_ARTICLES } from './articles.js?v=166';

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

/* Статья точки, которую можно показать ПРЯМО В ОКНЕ (24.09.2026, эксперимент
   на Авалоне по идее игрока): статья справочника (article.ref) или ссылка на
   Teletype. Другие сайты в iframe обычно не пускают (X-Frame-Options) —
   у них статья остаётся ссылкой под описанием. */
export function embeddedArticleUrl(view) {
  const art = view && view.article;
  if (!art) return '';
  if (art.ref) return REF_ARTICLES[art.ref] || '';
  return /^https:\/\/teletype\.in\//i.test(art.url || '') ? art.url : '';
}

/* Страница (статья точки, анкета персонажа) телом окна. Общая для всех слоёв.
   ⚠️ Без loading="lazy": с ним Teletype не прокручивает к якорю раздела
   (#e5M4 у Авалона — раздел внутри «Магии»), статья открывается с начала.
   Та же страница уже открыта (вернулись через ↑ или «назад») — не
   перезагружаем: игрок остаётся там, где читал.
   is-teletype — у Teletype сверху своя плашка, она уезжает под панель окна
   (css .node-article-frame.is-teletype); у telegra.ph/graph.org её нет. */
export function renderFrame(container, url) {
  container.classList.add('is-article');
  const old = container.querySelector('iframe.node-article-frame');
  if (old && old.dataset.src === url) return;
  const teletype = /^https:\/\/teletype\.in\//i.test(url);
  container.innerHTML = `<iframe class="node-article-frame${teletype ? ' is-teletype' : ''}" src="${escapeHtml(url)}"></iframe>`;
  container.firstElementChild.dataset.src = url;
}

/* Набор игроков (поле recruit, 25.09.2026) — плашка «Набор открыт» над
   описанием: первое, что новичок видит в окне сюжета. У завершённой точки
   не показывается, даже если поле забыли очистить. floating — поверх статьи
   (iframe) внизу окна, со своим ✕: встроить её в чужую страницу нельзя. */
function recruitHtml(view, floating) {
  if (!view.recruit || view.completed) return '';
  return `<div class="node-recruit${floating ? ' is-floating' : ''}">
      ${floating ? '<button type="button" class="node-recruit-close" aria-label="Скрыть">✕</button>' : ''}
      <div class="node-recruit-head">📣 Набор открыт</div>
      <div class="node-recruit-body">${escapeHtml(view.recruit).replace(/\n/g, '<br>')}</div>
    </div>`;
}

/* Содержимое окна: баннеры, заголовок, набор, описание в сворачиваемой
   цитате. Всё необязательное — точка объявляет только то, что у неё есть.

   ⚠️ Ряда персонажей тут больше нет (24.09.2026): персонажи-дети вместе с
   детьми-точками — в ряду переходов под панелью (renderNodeLinks ниже).
   Раньше ряд портретов жил внутри текста и уезжал вместе с ним. */
/* Тело окна — две вкладки (v=166, решение игрока): «Описание» (базовая,
   открыта сразу) и «Статья» (есть, только если у точки задана статья).
   v=140–165 статья, если была, ЗАМЕНЯЛА описание — описание из world.json
   у таких точек было не увидеть вовсе.

   Статья грузится только по нажатию «Статья» (раньше Teletype качался при
   каждом открытии окна). Переключение вкладок iframe НЕ пересоздаёт — он
   прячется атрибутом hidden (display:none не перезагружает страницу, а
   вынимание из DOM — перезагружает): место чтения сохраняется. Возврат к той
   же точке — тоже без перезагрузки (фрейм с тем же адресом остаётся). */
export function renderNodeContent(container, view) {
  const url = embeddedArticleUrl(view);
  const frame = container.querySelector(':scope > iframe.node-article-frame');
  [...container.children].forEach(n => { if (n !== frame || frame.dataset.src !== url) n.remove(); });
  container.insertAdjacentHTML('afterbegin', `<div class="node-desc">${descriptionHtml(view)}</div>`);
  // Набор поверх статьи — плашка со своим ✕ (встроить её в чужую страницу
  // нельзя). Пересоздаётся на каждое открытие: набор могли поменять.
  const recruit = recruitHtml(view, true);
  if (recruit) {
    container.insertAdjacentHTML('beforeend', recruit);
    const plaque = container.lastElementChild;
    plaque.hidden = true;
    plaque.querySelector('.node-recruit-close').onclick = () => plaque.remove();
  }
  container.__descScroll = 0;
}

/* Показать вкладку тела: 'desc' или 'article'. Подсветка кнопок — здесь же. */
export function showNodeBody(refs, view, which) {
  const container = refs.body;
  const url = embeddedArticleUrl(view);
  const article = which === 'article' && !!url;
  if (refs.desc) refs.desc.classList.toggle('active', !article);
  if (refs.article) refs.article.classList.toggle('active', article);
  if (!container) return;
  const desc = container.querySelector(':scope > .node-desc');
  let frame = container.querySelector(':scope > iframe.node-article-frame');
  if (article && !frame) {
    const teletype = /^https:\/\/teletype\.in\//i.test(url);
    container.insertAdjacentHTML('beforeend', `<iframe class="node-article-frame${teletype ? ' is-teletype' : ''}" src="${escapeHtml(url)}"></iframe>`);
    frame = container.lastElementChild;
    frame.dataset.src = url;
  }
  // Прокрутка описания — своя, у статьи прокручивает iframe; контейнер со
  // статьёй должен стоять в нуле, иначе фрейм уехал бы вместе с ним.
  if (article && !container.classList.contains('is-article')) container.__descScroll = container.scrollTop;
  container.classList.toggle('is-article', article);
  if (desc) desc.hidden = article;
  if (frame) frame.hidden = !article;
  const plaque = container.querySelector(':scope > .node-recruit.is-floating');
  if (plaque) plaque.hidden = !article;
  container.scrollTop = article ? 0 : (container.__descScroll || 0);
}

function descriptionHtml(view) {
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

  return `
    ${imagesHtml}
    <div class="story-title">${codeHtml}${escapeHtml(view.title || '')}${doneHtml}</div>
    ${recruitHtml(view, false)}
    ${descHtml}
  `;
}

/* Значок кнопки таб-бара, ведущей к точке, — её маркер (markerEl ниже), по
   предложению игрока 24.09.2026: «куда я попаду» видно ещё до нажатия.
   ⚠️ У системы арт не берётся (tabIconOf в map.js отдаёт пустую картинку):
   её «картинка» — карта всей системы, в значке она читается тёмным пятном
   (та же причина, что SYSTEM_ART_ZOOM в нодах). Ей рисуется бирюзовый круг
   с буквой. */
export function setTabIcon(span, meta) {
  if (!span || !meta) return;
  span.textContent = '';
  // Не точка (нет формы маркера) — остаётся смайлик: это действие, а не переход.
  if (!meta.shape) { span.textContent = meta.icon || ''; return; }
  span.appendChild(markerEl(meta, 'tab-node-icon'));
}

/* ПРАВИЛО (24.09.2026): эмодзи — это действие, форма маркера — это точка.

   Всё, что ведёт к точке (родитель, ребёнок, персонаж, точка в системе),
   рисуется её маленьким маркером: той же формы, что на карте, с её артом.
   Нет арта — та же форма, залитая цветом её заглушки на карте, с первой
   буквой названия, как у портретов персонажей. Раньше у точки без арта на
   кнопке оставался 📍 или 🎬, и «перейти к Бездне» выглядело так же, как
   «открыть архив».

   Битый путь к картинке — откат на букву (по событию error, как createMapIcon
   на карте откатывается на заглушку). */
export function markerEl(meta, extraClass) {
  const el = document.createElement('span');
  el.className = ['node-marker', 'shape-' + (meta.shape || 'circle'),
    meta.kind ? 'kind-' + meta.kind : '', meta.done ? 'is-done' : '', extraClass || '']
    .filter(Boolean).join(' ');
  if (meta.ring) el.style.borderColor = meta.ring;
  const letter = () => {
    el.textContent = meta.letter || '?';
    if (meta.fill) el.style.background = meta.fill;
  };
  if (meta.image) {
    const img = document.createElement('img');
    img.alt = '';
    img.addEventListener('error', () => { img.remove(); letter(); });
    img.src = meta.image;
    el.appendChild(img);
  } else {
    letter();
  }
  return el;
}


/* ============================================================
   Шторка переходов под панелью окна (24.09.2026).

   Что тут: все переходы к точкам — ↑ родитель (значок ↑ на маркере), места и
   сюжеты, персонажи (союзники — одной группой в пунктирной рамке, как нить
   между ними на карте). Закреплённые (pinned) внутри своих групп — вперёд.
   Сверху в панели — только действия (эмодзи — действие, маркер — точка).

   Как устроено (идея игрока, вторая версия того же дня): маркеры лежат с
   переносом строк, а видна только верхняя часть — «шторка» выдвигается за
   язычок под плашкой на нужную высоту: скрыто → один ряд → два → … → все.
   Потянуть — высота идёт за пальцем/мышью и при отпускании встаёт ровно на
   границу ряда. Нажать — следующая ступень по кругу. На язычке — сколько
   маркеров ещё спрятано.
   Раньше (v=127–143): ряд в одну строку, лишнее под чипом «+N», который
   раскрывал отдельный список по разделам, и отдельный язычок «свернуть» —
   три органа управления на одну задачу. Горизонтальную прокрутку игрок
   отверг ещё раньше.

   ⚠️ Точки идут первыми не только ради вида: при пятнадцати персонажах места
   оказались бы во втором-третьем ряду.
   ============================================================ */

function linkChip(item, onTap, extraClass) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'link-chip link-chip--' + (item.kind === 'character' ? 'char' : 'point')
    + (extraClass ? ' ' + extraClass : '');
  btn.title = item.kindLabel
    ? `${item.kindLabel}: ${item.name || item.label}`
    : (item.name || item.label || '');
  const slot = document.createElement('span');
  slot.className = 'link-chip-slot';
  slot.appendChild(markerEl(item, 'link-chip-marker'));
  const cap = document.createElement('span');
  cap.className = 'link-chip-caption';
  cap.textContent = item.label || item.name || '';
  btn.append(slot, cap);
  btn.addEventListener('click', () => onTap(item.id));
  return btn;
}

/* Закреплённые (галочка «Закрепить» в редакторе, поле pinned) — вперёд, в
   остальном порядок из данных. У персонажей закреплённый тянет вперёд всю
   свою группу союзников — groupByLinks собирает группы в порядке первого
   участника. */
const pinnedFirst = (list) => [...list.filter(i => i.pinned), ...list.filter(i => !i.pinned)];

// Родитель, точки и персонажи — готовые элементы шторки; группа союзников —
// один элемент (не рвётся между рядами). data-count — сколько переходов
// внутри. Между непустыми частями — разделители.
function linkItems(view, go) {
  const parent = view.parentMeta && view.parentMeta.id ? view.parentMeta : null;
  const points = pinnedFirst(Array.isArray(view.children) ? view.children : []);
  const chars = pinnedFirst(Array.isArray(view.characters) ? view.characters : []);
  const parts = [];
  if (parent) parts.push([linkChip(parent, go.parent, 'link-chip--parent')]);
  if (points.length) parts.push(points.map(p => linkChip(p, go.point)));
  if (chars.length) {
    parts.push(groupByLinks(chars).map(group => {
      if (group.length === 1) return linkChip(group[0], go.char);
      const box = document.createElement('span');
      box.className = 'link-group';
      box.dataset.count = group.length;
      group.forEach(c => box.appendChild(linkChip(c, go.char)));
      return box;
    }));
  }
  const items = [];
  parts.forEach((part, k) => {
    if (k) {
      const div = document.createElement('span');
      div.className = 'link-divider';
      div.dataset.count = 0;
      items.push(div);
    }
    part.forEach(el => {
      if (!el.dataset.count) el.dataset.count = 1;
      items.push(el);
    });
  });
  const total = (parent ? 1 : 0) + points.length + chars.length;
  return {items, total};
}

/* Ступени шторки — высоты, на которых она встаёт: 0 (скрыта), низ первого
   ряда, второго, …, всё. Последняя ступень не выше SHADE_MAX_SHARE экрана —
   дальше шторка прокручивается внутри себя. null — ширины ещё нет (окно
   системы до открытия — display:none). */
const SHADE_MAX_SHARE = 0.55;
function shadeStops(grid) {
  if (!grid.clientWidth) return null;
  const pad = parseFloat(getComputedStyle(grid).paddingBottom) || 0;
  // Ряды — по верхнему краю элементов (в сетке align-items: flex-start,
  // у всех элементов ряда он общий); низ ряда — самый низкий из них.
  const lines = [];
  [...grid.children].forEach(i => {
    if (i.classList.contains('link-divider')) return;
    const top = i.offsetTop;
    const bottom = top + i.offsetHeight;
    const line = lines.find(l => Math.abs(l.top - top) < 4);
    if (line) line.bottom = Math.max(line.bottom, bottom);
    else lines.push({top, bottom});
  });
  lines.sort((a, b) => a.top - b.top);
  const bottoms = lines.map(l => Math.ceil(l.bottom + pad));
  const full = grid.scrollHeight;
  const cap = Math.round(window.innerHeight * SHADE_MAX_SHARE);
  const stops = [0, ...bottoms.filter(b => b < full - 4 && b < cap)];
  stops.push(Math.min(full, cap));
  return stops;
}

// Сколько переходов ниже видимой высоты шторки (для счётчика на язычке).
function hiddenBelow(grid, height) {
  let n = 0;
  [...grid.children].forEach(i => {
    if (i.offsetTop + i.offsetHeight > height + 1) n += Number(i.dataset.count || 0);
  });
  return n;
}

// Шторки, которые надо переложить при повороте экрана.
const liveRows = new Set();
window.addEventListener('resize', () => liveRows.forEach(fn => fn()));

/* На какой ступени шторка — своя память у каждого вида окна: в окне системы
   по умолчанию скрыта (точки и так видны на её карте маркерами), в окне точки
   — один ряд. Храним номер ступени, последнюю — как 'all' (рядов у разных
   точек разное число). Хранилище недоступно (приватный режим) — умолчание. */
const SHADE_KEY = 'galaxyMapLinksShade';
function readShade(kind, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(SHADE_KEY) || '{}')[kind];
    return (typeof v === 'number' || v === 'all') ? v : fallback;
  } catch (e) { return fallback; }
}
function writeShade(kind, level) {
  try {
    const all = JSON.parse(localStorage.getItem(SHADE_KEY) || '{}');
    all[kind] = level;
    localStorage.setItem(SHADE_KEY, JSON.stringify(all));
  } catch (e) { /* не запомнили — не страшно */ }
}

/* Плашка окна (панель + шторка) лежит ПОВЕРХ тела, а тело отступает на её
   высоту (--head-h на карточке). Пока шторку тянут или она доезжает до
   ступени, отступ не трогаем: иначе текст и статья перекладывались бы
   каждый кадр. Выставляется один раз, когда шторка встала. */
const headObservers = new WeakSet();
function syncHead(card) {
  const head = card && card.querySelector(':scope > .node-head');
  if (!head || head.classList.contains('is-moving')) return;
  card.style.setProperty('--head-h', head.offsetHeight + 'px');
}
document.querySelectorAll('.phenom-card').forEach(card => {
  const head = card.querySelector(':scope > .node-head');
  if (!head || !window.ResizeObserver || headObservers.has(head)) return;
  headObservers.add(head);
  new ResizeObserver(() => syncHead(card)).observe(head);
});

/* opts.fold — вид окна для памяти ступени ('point' | 'system'),
   opts.foldedByDefault — по умолчанию скрыта. */
export function renderNodeLinks(el, view, handlers, opts) {
  if (!el) return;
  const kind = (opts && opts.fold) || 'point';
  el.textContent = '';
  if (el.__refit) { liveRows.delete(el.__refit); el.__refit = null; }
  const go = {
    parent: () => { if (handlers.onParent) handlers.onParent(); },
    point: (id) => { if (handlers.onChild) handlers.onChild(id); },
    char: (id) => { if (handlers.onCharacter) handlers.onCharacter(id); },
  };
  const {items, total} = linkItems(view, go);
  el.hidden = !items.length;
  if (!items.length) return;

  // Окно (видимая часть шторки) и сетка маркеров с переносом внутри него.
  const shade = document.createElement('div');
  shade.className = 'node-links-row';
  const grid = document.createElement('div');
  grid.className = 'node-links-grid';
  items.forEach(i => grid.appendChild(i));
  shade.appendChild(grid);

  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'node-links-toggle';
  toggle.title = 'Потяни или нажми, чтобы открыть больше';
  el.append(shade, toggle);

  const card = el.closest('.phenom-card');
  const head = el.closest('.node-head');
  let stops = [0];
  let level = 0;
  let height = 0;

  const paint = () => {
    const n = hiddenBelow(grid, height);
    toggle.textContent = height <= 0 ? `▾ ${total}` : (n ? `▾ +${n}` : '▴');
    toggle.setAttribute('aria-expanded', String(height > 0));
    el.classList.toggle('folded', height <= 0);
    // Всё не влезло даже на последней ступени — дальше крутится внутри.
    shade.classList.toggle('scrolls', level === stops.length - 1 && grid.scrollHeight > height + 1);
  };
  // Встать на ступень (animate — плавно, иначе сразу).
  const setLevel = (k, animate) => {
    level = Math.max(0, Math.min(k, stops.length - 1));
    height = stops[level];
    if (head && animate) head.classList.add('is-moving');
    shade.classList.toggle('animate', !!animate);
    shade.style.height = height + 'px';
    paint();
    if (!animate) { if (card) syncHead(card); return; }
    // Отступ тела — когда шторка доехала (страховка таймером, если transitionend не придёт).
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (head) head.classList.remove('is-moving');
      if (card) syncHead(card);
    };
    shade.addEventListener('transitionend', finish, {once: true});
    setTimeout(finish, 320);
  };
  const saveLevel = () => writeShade(kind, level === stops.length - 1 && level > 0 ? 'all' : level);

  // Тянуть или нажать — один жест: сдвиг больше SHADE_DRAG_PX — это тяга.
  const SHADE_DRAG_PX = 4;
  let drag = null;
  toggle.addEventListener('pointerdown', (e) => {
    drag = {id: e.pointerId, y: e.clientY, h: height, moved: false};
    try { toggle.setPointerCapture(e.pointerId); } catch (err) { /* не критично */ }
  });
  toggle.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const dy = e.clientY - drag.y;
    if (!drag.moved && Math.abs(dy) < SHADE_DRAG_PX) return;
    if (!drag.moved) {
      drag.moved = true;
      if (head) head.classList.add('is-moving');
      shade.classList.remove('animate');
    }
    height = Math.max(0, Math.min(drag.h + dy, stops[stops.length - 1]));
    shade.style.height = height + 'px';
    paint();
  });
  const release = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const moved = drag.moved;
    drag = null;
    if (moved) {
      // Ближайшая ступень к тому месту, где отпустили.
      let best = 0;
      stops.forEach((s, k) => { if (Math.abs(s - height) < Math.abs(stops[best] - height)) best = k; });
      setLevel(best, true);
    } else {
      setLevel((level + 1) % stops.length, true); // нажатие — следующая ступень по кругу
    }
    saveLevel();
  };
  toggle.addEventListener('pointerup', release);
  toggle.addEventListener('pointercancel', release);
  // Клик с клавиатуры (Enter/пробел) — тоже следующая ступень.
  toggle.addEventListener('click', (e) => {
    if (e.detail !== 0) return; // мышь/палец уже обработаны в pointerup
    setLevel((level + 1) % stops.length, true);
    saveLevel();
  });

  // Раскладка — когда у шторки есть ширина: окно системы до открытия вообще
  // display:none. Несколько кадров подождать и сдаться.
  const saved = readShade(kind, opts && opts.foldedByDefault ? 0 : 1);
  let tries = 0;
  const refit = () => {
    const s = shadeStops(grid);
    if (!s) { if (++tries < 20) requestAnimationFrame(refit); return; }
    stops = s;
    setLevel(saved === 'all' ? stops.length - 1 : saved, false);
  };
  shade.style.height = '0px';
  paint();
  el.__refit = () => { tries = 0; refit(); };
  liveRows.add(el.__refit);
  refit();
}

/* Кнопки ряда-таббара. refs — элементы конкретного слоя (у каждого свои id в
   разметке), view — та же точка, handlers — что делать по нажатию. Кнопка,
   которой у точки нет содержимого, прячется целиком: пустых кнопок в ряду
   быть не должно, он и так узкий (грабли №12). */
export function applyNodeToolbar(refs, view, handlers) {
  const show = (el, on) => { if (el) el.style.display = on ? '' : 'none'; };

  /* ⚠️ Кнопки родителя в панели больше нет (24.09.2026): родитель — тоже
     точка, и по правилу «форма маркера — переход» он первым стоит в ряду
     переходов (renderNodeLinks). У персонажа так же — его окно с 24.09.2026
     тоже общее (js/characters.js). */

  /* Статья — "ref" (статья справочника из js/articles.js) или "url".
     v=166: «Описание» — базовая вкладка, есть у каждой точки и подсвечена при
     открытии. «Статья» — только если в редакторе задана ссылка: Teletype и
     статьи справочника — вкладкой в окне, другие сайты (в iframe обычно не
     пускают) — в новой вкладке браузера. handlers.beforeBody — нижний слой
     уходит со своей карты (phenom.js). */
  const art = view.article;
  const inline = !!embeddedArticleUrl(view);
  const toBody = (which) => () => {
    if (handlers.beforeBody) handlers.beforeBody();
    showNodeBody(refs, view, which);
  };
  if (refs.desc) {
    show(refs.desc, true);
    refs.desc.onclick = toBody('desc');
  }
  if (refs.article) {
    show(refs.article, !!(art && (art.url || inline)));
    refs.article.title = (art && art.label) || 'Статья';
    refs.article.onclick = inline ? toBody('article')
      : (art && art.url ? () => window.open(art.url, '_blank', 'noopener') : null);
  }
  showNodeBody(refs, view, 'desc');

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

  // ⚠️ Вкладок детей-точек в этом ряду больше НЕТ (24.09.2026): они уехали в
  // ряд переходов под панелью (renderNodeLinks ниже). Панель действий теперь
  // не зависит от данных — ✕, родитель и максимум четыре действия.
}
