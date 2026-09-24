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
import { escapeHtml } from './modal.js?v=141';
import { REF_ARTICLES } from './articles.js?v=141';

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

/* Содержимое окна: баннеры, заголовок, описание в сворачиваемой цитате. Всё
   необязательное — точка объявляет только то, что у неё есть.

   ⚠️ Ряда персонажей тут больше нет (24.09.2026): персонажи-дети вместе с
   детьми-точками — в ряду переходов под панелью (renderNodeLinks ниже).
   Раньше ряд портретов жил внутри текста и уезжал вместе с ним. */
export function renderNodeContent(container, view) {
  /* Есть статья — она и есть тело окна: базовая вкладка «Статья» открыта
     сразу, описание из world.json не показывается (оно остаётся запасным
     вариантом на случай, если статьи нет). Своё название и обложка у статьи
     есть, баннеры и заголовок над ней не дублируем. */
  const articleUrl = embeddedArticleUrl(view);
  container.classList.toggle('is-article', !!articleUrl);
  if (articleUrl) {
    /* ⚠️ Без loading="lazy": с ним Teletype не прокручивает к якорю раздела
       (#e5M4 у Авалона — раздел внутри «Магии»), статья открывается с начала.
       Проверено: тот же адрес без lazy сразу встаёт на «Кольцо Авалона». */
    // Та же статья уже открыта (вернулись к точке через ↑ или «назад») — не
    // перезагружаем: игрок остаётся там, где читал.
    const old = container.querySelector('iframe.node-article-frame');
    if (old && old.dataset.src === articleUrl) return;
    container.innerHTML = `<iframe class="node-article-frame" src="${escapeHtml(articleUrl)}"></iframe>`;
    container.firstElementChild.dataset.src = articleUrl;
    return;
  }
  const art = view.article;
  const linkHtml = art && art.url
    ? `<p class="node-article-link"><a href="${escapeHtml(art.url)}" target="_blank" rel="noopener">📖 ${escapeHtml(art.label || 'Статья')} ↗</a></p>`
    : '';

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
    ${imagesHtml}
    <div class="story-title">${codeHtml}${escapeHtml(view.title || '')}${doneHtml}</div>
    ${descHtml}
    ${linkHtml}
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

// Кнопка родителя: маркер + название; тип родителя («Сюжет», «Место») — в
// подсказке. Общая для окна точки и окна персонажа (js/characters.js).
export function setParentButton(btn, meta) {
  setTabIcon(btn.querySelector('.tabbar-btn-icon'), meta);
  btn.querySelector('.tabbar-btn-label').textContent = meta.label;
  btn.title = meta.kindLabel ? `${meta.kindLabel}: ${meta.name || meta.label}` : (meta.name || meta.label);
}

/* ============================================================
   Ряд переходов под панелью окна (24.09.2026).

   Две разные вещи раньше жили вперемешку: панель сверху держала и действия
   над открытой точкой (статья, архив, правка), и переходы к её детям-точкам
   (вкладками), а персонажи-дети были отдельным рядом портретов внутри текста.
   Вкладки детей сжимали панель: замер на 375 px — при двух детях уже две
   подписи обрезаны, при пяти ячейка 43 px (меньше пальца), при восьми 27 px.

   Теперь: сверху только действия (состав фиксирован), здесь — все переходы к
   детям. Две группы в одном ряду: сначала места и сюжеты (крупнее, как на
   карте родитель крупнее своих персонажей), разделитель, потом персонажи
   (союзники — одной группой в пунктирной рамке, как нить между ними на
   карте). Ряд всегда в ОДНУ строку: что не влезло — под «+N», который
   раскрывает полный список по группам. Горизонтальная прокрутка сознательно
   не взята — игрок однажды её уже отверг на панелях.

   ⚠️ Точки идут первыми не только ради вида: при пятнадцати персонажах места
   иначе ушли бы под «+N».

   Дополнено тем же днём: самым первым — РОДИТЕЛЬ (переехал сюда из панели
   действий, значок ↑ на маркере), внутри групп закреплённые (pinned) идут
   вперёд, а под рядом — язычок «свернуть» (в окне системы ряд по умолчанию
   свёрнут).
   ============================================================ */
const LINK_GAP = 10; // = gap у .node-links-row в css

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
   остальном порядок из данных. Раскладка жадная и идёт слева, поэтому первые
   под «+N» не уходят. У персонажей закреплённый тянет вперёд всю свою группу
   союзников — groupByLinks собирает группы в порядке первого участника. */
const pinnedFirst = (list) => [...list.filter(i => i.pinned), ...list.filter(i => !i.pinned)];

function parentChip(parent, go) {
  return linkChip(parent, go.parent, 'link-chip--parent');
}

// Родитель, точки и персонажи — готовые элементы ряда; группа союзников — один
// элемент (её нельзя разрывать «+N» посередине). data-count — сколько
// переходов внутри. Между непустыми частями — разделители.
function linkItems(view, go) {
  const parent = view.parentMeta && view.parentMeta.id ? view.parentMeta : null;
  const points = pinnedFirst(Array.isArray(view.children) ? view.children : []);
  const chars = pinnedFirst(Array.isArray(view.characters) ? view.characters : []);
  const parts = [];
  if (parent) parts.push([parentChip(parent, go)]);
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
  return {items, parent, points, chars};
}

/* Прячет в ряду всё, что не влезает, и показывает «+N». false — ряд ещё не
   разложен (окно системы до открытия — display:none), надо повторить. */
function fitLinks(row, more) {
  const items = [...row.children].filter(c => c !== more);
  items.forEach(i => { i.hidden = false; });
  more.hidden = true;
  const W = row.clientWidth;
  if (!W) return false;
  if (row.scrollWidth <= W + 1) return true;
  more.hidden = false;
  /* Ширины меряем ДО того, как что-то прятать, и дальше считаем сами: не
     влезший элемент пропускается, а следующий пробует встать на его место.
     Иначе широкая группа союзников посреди ряда уносила бы под «+N» и всех
     одиночек за собой, оставив полряда пустым (замер на «Бездне»: 80 px из
     332 пропадали). Порядок внутри ряда от этого может чуть поменяться — не
     страшно, полный список под «+N» всё равно показывает всех по порядку. */
  const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
  const widths = items.map(i => {
    const cs = getComputedStyle(i);
    return i.offsetWidth + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);
  });
  const limit = W - pad - more.offsetWidth - LINK_GAP;
  let x = pad, hiddenCount = 0;
  items.forEach((i, k) => {
    // Разделитель ставим только если за ним влезет хоть кто-то (проверка ниже).
    if (x + widths[k] <= limit) { x += widths[k] + LINK_GAP; return; }
    i.hidden = true;
    hiddenCount += Number(i.dataset.count || 0);
  });
  // Разделитель последним видимым элементом — висел бы ни к чему.
  const visible = items.filter(i => !i.hidden);
  const last = visible[visible.length - 1];
  if (last && last.classList.contains('link-divider')) last.hidden = true;
  // Под «+N» не ушло ни одного перехода (спрятался разве что разделитель) —
  // «+0» не показываем.
  if (!hiddenCount) { more.hidden = true; return true; }
  more.querySelector('.link-chip-caption').textContent = 'ещё';
  more.querySelector('.link-more-n').textContent = '+' + hiddenCount;
  return true;
}

// Ряды, которые надо переложить при повороте экрана.
const liveRows = new Set();
window.addEventListener('resize', () => liveRows.forEach(fn => fn()));

/* Свёрнут ли ряд — своя память у каждого вида окна (24.09.2026, идея игрока):
   в окне системы ряд по умолчанию закрыт (точки и так видны на её карте
   маркерами), в окне точки — открыт. Выбор игрока запоминается на устройстве.
   Хранилище может быть недоступно (приватный режим) — тогда просто умолчание. */
const FOLD_KEY = 'galaxyMapLinksFolded';
function readFold(kind, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}')[kind];
    return typeof v === 'boolean' ? v : fallback;
  } catch (e) { return fallback; }
}
function writeFold(kind, folded) {
  try {
    const all = JSON.parse(localStorage.getItem(FOLD_KEY) || '{}');
    all[kind] = folded;
    localStorage.setItem(FOLD_KEY, JSON.stringify(all));
  } catch (e) { /* не запомнили — не страшно */ }
}

/* opts.fold — вид окна для памяти свёрнутости ('point' | 'system'),
   opts.foldedByDefault — умолчание для него. */
export function renderNodeLinks(el, view, handlers, opts) {
  if (!el) return;
  const fold = (opts && opts.fold) || 'point';
  el.textContent = '';
  el.classList.remove('expanded');
  if (el.__refit) { liveRows.delete(el.__refit); el.__refit = null; }
  const collapse = () => el.classList.remove('expanded');
  const go = {
    parent: () => { collapse(); if (handlers.onParent) handlers.onParent(); },
    point: (id) => { collapse(); if (handlers.onChild) handlers.onChild(id); },
    char: (id) => { collapse(); if (handlers.onCharacter) handlers.onCharacter(id); },
  };
  const {items, parent, points, chars} = linkItems(view, go);
  el.hidden = !items.length;
  if (!items.length) return;

  const row = document.createElement('div');
  row.className = 'node-links-row';
  items.forEach(i => row.appendChild(i));

  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'link-chip link-chip--more';
  more.innerHTML = '<span class="link-chip-slot"><span class="node-marker link-more-n"></span></span><span class="link-chip-caption"></span>';
  more.addEventListener('click', () => el.classList.toggle('expanded'));
  row.appendChild(more);

  // Полный список под «+N» — те же чипы, по группам, с переносом строк.
  const all = document.createElement('div');
  all.className = 'node-links-all';
  const section = (title, list) => {
    if (!list.length) return;
    const h = document.createElement('div');
    h.className = 'node-links-heading';
    h.textContent = title;
    const wrap = document.createElement('div');
    wrap.className = 'node-links-wrap';
    list.forEach(i => wrap.appendChild(i));
    all.append(h, wrap);
  };
  if (parent) section('Входит в', [parentChip(parent, go)]);
  section('Места и сюжеты', points.map(p => linkChip(p, go.point)));
  section('Персонажи', linkItems({characters: chars}, go).items);

  /* Язычок под рядом: свернуть / развернуть. В свёрнутом виде от ряда
     остаётся только он — со счётчиком, чтобы было видно, что там что-то есть. */
  const total = (parent ? 1 : 0) + points.length + chars.length;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'node-links-toggle';
  const paint = () => {
    const folded = el.classList.contains('folded');
    toggle.textContent = folded ? `▾ Переходы · ${total}` : '▴';
    toggle.setAttribute('aria-expanded', String(!folded));
    toggle.title = folded ? 'Показать переходы' : 'Свернуть переходы';
  };
  toggle.addEventListener('click', () => {
    const folded = !el.classList.contains('folded');
    el.classList.toggle('folded', folded);
    collapse();
    writeFold(fold, folded);
    paint();
    if (!folded && el.__refit) el.__refit(); // пока был свёрнут, ширины не было
  });
  el.classList.toggle('folded', readFold(fold, !!(opts && opts.foldedByDefault)));
  paint();

  el.append(row, all, toggle);

  // Раскладка — только когда у ряда есть ширина: окно системы до открытия
  // вообще display:none. Несколько кадров подождать и сдаться — лучше показать
  // всё без «+N», чем зависнуть.
  let tries = 0;
  const refit = () => {
    if (el.classList.contains('folded')) return; // развернут — пересчитается
    if (!fitLinks(row, more) && ++tries < 20) requestAnimationFrame(refit);
  };
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
     переходов (renderNodeLinks). В окне персонажа (#charStory) кнопка
     осталась: там ряда переходов нет, окно — статья в iframe. */

  /* Статья. Два источника: "ref" — статья-справочник из js/articles.js
     (открывает общий обработчик по data-ref), "url" — любая внешняя ссылка.
     Раньше это умела только локация с submap, теперь — любая точка. */
  /* Базовая вкладка окна (24.09.2026, эксперимент на Авалоне): «Статья», если
     статью можно показать прямо в окне, иначе «Описание». Она есть у КАЖДОЙ
     точки и подсвечена, пока открыто тело окна, — как «Карта системы» в окне
     системы. Раньше «Статья» открывала справочник поверх окна.
     Клик по ней — вернуться к телу окна со своей карты (phenom.js вешает
     onclick сам); в верхнем слое своей карты нет, клик ничего не делает. */
  const art = view.article;
  if (refs.article) {
    const inline = !!embeddedArticleUrl(view);
    show(refs.article, true);
    refs.article.querySelector('.tabbar-btn-label').textContent = inline ? 'Статья' : 'Описание';
    refs.article.title = inline ? (art.label || 'Статья') : 'Описание';
    refs.article.classList.add('active');
    refs.article.onclick = null;
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

  // ⚠️ Вкладок детей-точек в этом ряду больше НЕТ (24.09.2026): они уехали в
  // ряд переходов под панелью (renderNodeLinks ниже). Панель действий теперь
  // не зависит от данных — ✕, родитель и максимум четыре действия.
}
