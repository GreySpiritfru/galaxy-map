/* ============================================================
   Окно мировой точки — ОДНО на все точки world.json (23.09.2026).

   До этого одна и та же по смыслу карточка рисовалась тремя разными кусками
   кода: простой модал у точки с одним текстом, «info»-ветка в js/phenom.js у
   Кольца Авалона и отдельный файл js/stories.js у сюжета. Расходились они
   только тем, чего у точки НЕ заполнено, — поэтому здесь один рендер, который
   просто пропускает пустое: нет баннеров — нет картинок, нет статьи — нет
   кнопки, нет детей-персонажей — нет их ряда.

   ⚠️ Физически окон ТРИ (#phenomOverlay, #storyOverlay, #charOverlay) — это
   не дубль, а СЛОИ: точка, открытая из окна своего родителя, должна лечь
   поверх него, а не вместо (локация -> сюжет -> персонаж, см. раздел про
   стекинг в CLAUDE.md). Рисует их этот файл, хозяева слоёв — phenom.js
   (нижний, он же умеет тайловую карту), stories.js (средний) и characters.js
   (верхний, персонаж; с 24.09.2026 — раньше он был статьёй в модале).
   ============================================================ */
import { escapeHtml } from './modal.js?v=178';
import { REF_ARTICLES } from './articles.js?v=178';
import { renderMirror, scrollToAnchor, anchorOf, openExternal } from './reader.js?v=178';

/* Куда идти новичку: шаблон анкеты и контакты админов — посты инфоканала.
   Одни и те же в обучении (js/tour.js) и в плашке набора ниже. */
export const JOIN_LINKS = {
  form: 'https://t.me/Phenome_hub/23',
  contacts: 'https://t.me/Phenome_hub/17',
};

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
      <div class="node-recruit-actions">
        <button type="button" class="node-recruit-btn" data-join="form">📝 Шаблон анкеты</button>
        <button type="button" class="node-recruit-btn" data-join="contacts">💬 Написать нам</button>
      </div>
    </div>`;
}
/* Кнопки набора (v=177) — те же, что в финале обучения: плашка без них
   звала, но не говорила, куда идти. Один обработчик на все плашки (они
   пересоздаются при каждом открытии окна). */
document.addEventListener('click', (e) => {
  const btn = e.target.closest && e.target.closest('.node-recruit [data-join]');
  if (btn && JOIN_LINKS[btn.dataset.join]) openExternal(JOIN_LINKS[btn.dataset.join]);
});

/* Содержимое окна: баннеры, заголовок, набор, описание в сворачиваемой
   цитате. Всё необязательное — точка объявляет только то, что у неё есть.

   ⚠️ Ряда персонажей тут больше нет (24.09.2026): персонажи-дети вместе с
   детьми-точками — в шторке переходов плашки окна (renderNodeLinks ниже).
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
  // Та же статья, что уже открыта (вернулись к точке), — остаётся вместе с
  // местом чтения: и iframe, и своя копия (.node-mirror).
  const keep = [...container.children].filter(n =>
    (n.matches('iframe.node-article-frame') || n.matches('.node-mirror')) && n.dataset.src === url);
  [...container.children].forEach(n => { if (!keep.includes(n)) n.remove(); });
  if (!keep.some(n => n.matches('.node-mirror'))) container.__artScroll = null;
  // Другая точка — места чтения прежней вкладки не переносим (showNodeBody).
  delete container.dataset.tab;
  container.__gameScroll = 0;
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

/* Показать вкладку тела: 'desc' или 'article'. Подсветка кнопок — здесь же.

   Статья (01.10.2026): сначала своя копия (js/reader.js, .node-mirror) — она
   рисуется в том же контейнере, что описание, со своей прокруткой (плашка
   окна уезжает, как на описании). Копии нет — iframe, как было (.is-article:
   контейнер без прокрутки, листает сама страница). on-article — «открыта
   вкладка статьи» в обоих случаях (по нему phenom.js возвращается со своей
   карты на ту же вкладку). */
export function showNodeBody(refs, view, which) {
  const container = refs.body;
  const url = embeddedArticleUrl(view);
  const game = which === 'game' && !!(container && container.querySelector(':scope > .node-game'));
  const article = which === 'article' && !!url;
  const tab = game ? 'game' : (article ? 'article' : 'desc');
  if (refs.desc) refs.desc.classList.toggle('active', tab === 'desc');
  if (refs.article) refs.article.classList.toggle('active', article);
  if (refs.game) refs.game.classList.toggle('active', game);
  if (!container) return;
  const desc = container.querySelector(':scope > .node-desc');
  const gameEl = container.querySelector(':scope > .node-game');
  const mirror = container.querySelector(':scope > .node-mirror');
  const frame = container.querySelector(':scope > iframe.node-article-frame');
  // Место чтения — своё у описания, «Игры» и копии статьи (у iframe — внутри
  // него). dataset.tab — какая вкладка открыта сейчас (её же смотрит
  // phenom.js, возвращаясь со своей карты); нет — окно только что открыто.
  const prev = container.dataset.tab;
  if (prev === 'article' && !container.classList.contains('is-article')) container.__artScroll = container.scrollTop;
  if (prev === 'desc') container.__descScroll = container.scrollTop;
  if (prev === 'game') container.__gameScroll = container.scrollTop;
  container.dataset.tab = tab;
  container.classList.toggle('on-article', article);
  if (desc) desc.hidden = tab !== 'desc';
  if (gameEl) gameEl.hidden = !game;
  const plaque = container.querySelector(':scope > .node-recruit.is-floating');
  // Прокрутку ставим сами — уезжающие вкладки не должны принять её за жест
  // (wireDockAutoHide); вкладку нажали на плашке — пусть она будет вся.
  const setScroll = (y) => {
    container.__ignoreScrollUntil = performance.now() + 200;
    container.scrollTop = y;
  };
  const card = container.closest('.phenom-card');
  if (card && card.__showDock) card.__showDock();

  if (!article) {
    if (mirror) mirror.hidden = true;
    if (frame) frame.hidden = true;
    if (plaque) plaque.hidden = true;
    container.classList.remove('is-article');
    setScroll((game ? container.__gameScroll : container.__descScroll) || 0);
    return;
  }
  if (mirror && mirror.dataset.src === url) {
    mirror.hidden = false;
    if (frame) frame.hidden = true;
    if (plaque) plaque.hidden = true;
    container.classList.remove('is-article');
    setScroll(container.__artScroll || 0);
    return;
  }
  if (frame && frame.dataset.src === url) {
    showFrame();
    return;
  }
  // Ни копии, ни фрейма ещё нет: спросим у копии статей, пока — «Загрузка…».
  if (plaque) plaque.hidden = true;
  container.classList.remove('is-article');
  const holder = document.createElement('div');
  holder.className = 'node-mirror';
  holder.dataset.src = url;
  holder.innerHTML = '<div class="mirror-loading">Загрузка…</div>';
  container.appendChild(holder);
  setScroll(0);
  const fallback = () => {
    if (!holder.isConnected) return;
    holder.remove();
    if (container.classList.contains('on-article')) showFrame();
  };
  renderMirror(url, container).then(art => {
    if (!holder.isConnected) return;
    if (!art) { fallback(); return; }
    holder.textContent = '';
    // Набор игроков — над статьёй, как над описанием (плавающая плашка —
    // только для чужой страницы, в которую её не встроить).
    holder.insertAdjacentHTML('afterbegin', recruitHtml(view, false));
    holder.appendChild(art);
    if (container.classList.contains('on-article') && !holder.hidden) {
      setScroll(0);
      scrollToAnchor(container, anchorOf(url));
    }
  }).catch(fallback);

  function showFrame() {
    let f = container.querySelector(':scope > iframe.node-article-frame');
    if (!f || f.dataset.src !== url) {
      if (f) f.remove();
      const teletype = /^https:\/\/teletype\.in\//i.test(url);
      container.insertAdjacentHTML('beforeend', `<iframe class="node-article-frame${teletype ? ' is-teletype' : ''}" src="${escapeHtml(url)}"></iframe>`);
      f = container.lastElementChild;
      f.dataset.src = url;
    }
    f.hidden = false;
    const m = container.querySelector(':scope > .node-mirror');
    if (m) m.hidden = true;
    if (plaque) plaque.hidden = false;
    // Контейнер со статьёй-фреймом стоит в нуле, иначе фрейм уехал бы с ним.
    container.classList.add('is-article');
    setScroll(0);
  }
}

/* ============================================================
   «♟️ Игра» — третья вкладка тела окна (02.10.2026, v=177, идея игрока).

   Шторка плашки окна — это меню ПЕРЕХОДОВ (маркер и короткое имя), а не
   состав: в ней не видно, кто кем играет, и у локации нет персонажей её
   сюжетов. Здесь — фактический состав: все персонажи ветки (сама точка и
   её точки-потомки), с расой и ролью, союзники (links) — одной рамкой, как
   пунктир на карте. Без имён игроков: их на карту не
   выносим. Вкладка задумана как «игровое» место окна — сюда же потом лягут
   статистика сюжета и броски, которые описанию лишние.
   Данные — view.roster из map.js (worldView): [{id, own, head, chars}].
   Нет ни одного персонажа — вкладки нет.
   ============================================================ */
const plural = (n, one, few, many) => {
  const a = n % 10, b = n % 100;
  if (a === 1 && b !== 11) return one;
  return a >= 2 && a <= 4 && (b < 12 || b > 14) ? few : many;
};

function rosterRow(c, onTap) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'game-row';
  btn.appendChild(markerEl(c, 'game-row-marker'));
  const text = document.createElement('span');
  text.className = 'game-row-text';
  const name = document.createElement('span');
  name.className = 'game-row-name';
  name.textContent = c.fullName || c.name || c.label || '';
  text.appendChild(name);
  const sub = [c.race, c.role].filter(Boolean).join(' · ');
  if (sub) {
    const s = document.createElement('span');
    s.className = 'game-row-sub';
    s.textContent = sub;
    text.appendChild(s);
  }
  const arrow = document.createElement('span');
  arrow.className = 'game-row-arrow';
  arrow.setAttribute('aria-hidden', 'true');
  arrow.textContent = '›';
  btn.append(text, arrow);
  btn.addEventListener('click', () => onTap(c.id));
  return btn;
}

function renderGame(container, view, handlers) {
  const old = container.querySelector(':scope > .node-game');
  if (old) old.remove();
  const sections = (Array.isArray(view.roster) ? view.roster : []).filter(s => s.chars && s.chars.length);
  if (!sections.length) return null;
  const toChar = (id) => { if (handlers.onCharacter) handlers.onCharacter(id); };
  const toPoint = (id) => { if (handlers.onChild) handlers.onChild(id); };

  const root = document.createElement('div');
  root.className = 'node-game';
  root.hidden = true;
  const total = sections.reduce((n, s) => n + s.chars.length, 0);
  const grouped = sections.map(s => groupByLinks(pinnedFirst(s.chars)));
  const allies = grouped.reduce((n, gs) => n + gs.filter(g => g.length > 1).length, 0);

  const title = document.createElement('div');
  title.className = 'game-title';
  title.textContent = 'Состав';
  const summary = document.createElement('div');
  summary.className = 'game-summary';
  summary.textContent = [
    `${total} ${plural(total, 'персонаж', 'персонажа', 'персонажей')}`,
    allies ? `${allies} ${plural(allies, 'группа', 'группы', 'групп')} союзников` : '',
    sections.length > 1 ? `${sections.length} ${plural(sections.length, 'точка', 'точки', 'точек')}` : '',
  ].filter(Boolean).join(' · ');
  root.append(title, summary);

  sections.forEach((s, k) => {
    const sec = document.createElement('section');
    sec.className = 'game-section';
    // Заголовок — только когда точек несколько: у сюжета список и так его.
    if (sections.length > 1) {
      if (s.own || !s.head) {
        const h = document.createElement('div');
        h.className = 'game-section-head';
        h.textContent = view.title || '';
        sec.appendChild(h);
      } else {
        const h = document.createElement('button');
        h.type = 'button';
        h.className = 'game-section-head is-link';
        h.appendChild(markerEl(s.head, 'game-head-marker'));
        const t = document.createElement('span');
        t.textContent = s.head.name || s.head.label || '';
        h.appendChild(t);
        h.addEventListener('click', () => toPoint(s.id));
        sec.appendChild(h);
      }
    }
    grouped[k].forEach(group => {
      if (group.length === 1) { sec.appendChild(rosterRow(group[0], toChar)); return; }
      const box = document.createElement('div');
      box.className = 'game-group';
      group.forEach(c => box.appendChild(rosterRow(c, toChar)));
      sec.appendChild(box);
    });
    root.appendChild(sec);
  });
  container.appendChild(root);
  return root;
}

/* Анкета персонажа (01.10.2026): своя копия, если есть, иначе чужая страница
   во фрейме (renderFrame). Та же анкета уже показана — не трогаем (место
   чтения остаётся). Пока копия грузилась, игрок ушёл на «Броски» — holder
   уже вынут из контейнера, и поздний ответ ничего не портит. */
export function renderSheet(container, url) {
  const existing = container.querySelector(':scope > .node-mirror, :scope > iframe.node-article-frame');
  if (existing && existing.dataset.src === url && container.children.length === 1) return;
  container.classList.remove('is-article');
  container.innerHTML = '';
  const holder = document.createElement('div');
  holder.className = 'node-mirror';
  holder.dataset.src = url;
  holder.innerHTML = '<div class="mirror-loading">Загрузка анкеты…</div>';
  container.appendChild(holder);
  container.__ignoreScrollUntil = performance.now() + 200;
  container.scrollTop = 0;
  const fallback = () => {
    if (!holder.isConnected) return;
    renderFrame(container, url);
  };
  renderMirror(url, container).then(art => {
    if (!holder.isConnected) return;
    if (!art) { fallback(); return; }
    holder.textContent = '';
    holder.appendChild(art);
    scrollToAnchor(container, anchorOf(url));
  }).catch(fallback);
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
   «открыть статью».

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
   Плашка окна — ВНИЗУ (02.10.2026, v=178, решение игрока по макетам).

   Было (v=143–177): плашка сверху — панель действий, под ней шторка
   переходов рядами маркеров с подписями. На телефоне ~200 px сверху (в
   полноэкранном Telegram — ещё 84 px его кнопок), подписи обрезались
   («Найто А…»), пунктирные рамки союзников рвали ряды. Теперь плашка внизу,
   как панель карты, — одна плавающая карточка из двух частей:
   - строка «где я и кто тут» (.node-strip): родитель — маркер, имя и «›»
     (тап ведёт к нему, как «назад» в iOS), дальше название точки и стопки —
     до трёх маркеров внахлёст и число: места/сюжеты и персонажи отдельно
     (по форме маркера и так видно, где что). Тап по строке (кроме родителя)
     или протяжка вверх — шторка со всеми переходами над строкой;
   - вкладки окна (.phenom-toolbar). При прокрутке тела они уезжают вниз, а
     строка остаётся (wireDockAutoHide ниже).
   Шторка — те же ступени, что раньше (ряд, два, …, все), только растёт
   вверх; по умолчанию свёрнута в строку (решение игрока), выбор
   запоминается. Родителя в шторке нет — он в строке. Союзники — на общей
   золотой подложке (раньше — пунктирная рамка).

   Цели касания (что нажимается — игрок просил проверить на промахи):
   родитель — своя кнопка не уже 44 px (минимум Apple HIG), всё остальное в
   строке — одна большая кнопка «раскрыть». Отдельные лица в стопке НЕ
   нажимаются: 22 px внахлёст — меньше минимума WCAG 2.5.8 (24 px), промахи
   были бы гарантированы. Промахнуться можно только на границе «родитель |
   название», и цена промаха разная: лишний тап по названию просто раскроет
   шторку.

   Окно системы пока сверху (переезжает следующим шагом): там строка над
   шторкой, а шторка растёт вниз (column-reverse в css, знак — grow ниже).
   ============================================================ */

// Подпись под маркером персонажа в шторке — первое слово имени («Найто
// Афетович» → «Найто»): полное имя в 50 px обрезалось. Инициал («О. Гил'ви»)
// — вместе со следующим словом. Полное имя — в подсказке.
function chipCaption(item) {
  const text = item.label || item.name || '';
  if (item.kind !== 'character') return text;
  const words = text.trim().split(/\s+/);
  if (words.length > 1 && (words[0].length <= 2 || words[0].endsWith('.'))) return words.slice(0, 2).join(' ');
  return words[0] || text;
}

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
  cap.textContent = chipCaption(item);
  btn.append(slot, cap);
  btn.addEventListener('click', () => onTap(item.id));
  return btn;
}

/* Закреплённые (галочка «Закрепить» в редакторе, поле pinned) — вперёд, в
   остальном порядок из данных. У персонажей закреплённый тянет вперёд всю
   свою группу союзников — groupByLinks собирает группы в порядке первого
   участника. */
const pinnedFirst = (list) => [...list.filter(i => i.pinned), ...list.filter(i => !i.pinned)];

// Элементы шторки: места и сюжеты, потом персонажи; группа союзников — один
// элемент (не рвётся между рядами). data-count — сколько переходов внутри.
// Между непустыми частями — разделитель.
function linkItems(view, go) {
  const points = pinnedFirst(Array.isArray(view.children) ? view.children : []);
  const chars = pinnedFirst(Array.isArray(view.characters) ? view.characters : []);
  const parts = [];
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
  return {items, points, chars};
}

// Стопка в строке: до STACK_FACES маркеров внахлёст (первый — сверху) и число.
const STACK_FACES = 3;
function stackEl(list, label) {
  const s = document.createElement('span');
  s.className = 'node-stack';
  s.title = `${label}: ${list.length}`;
  list.slice(0, STACK_FACES).forEach((m, i) => {
    const face = markerEl(m, 'node-stack-face');
    face.style.zIndex = String(STACK_FACES - i);
    s.appendChild(face);
  });
  const n = document.createElement('span');
  n.className = 'node-stack-n';
  n.textContent = String(list.length);
  s.appendChild(n);
  return s;
}

const CHEVRON_SVG = '<svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 7.5 6 4l3.5 3.5"/></svg>';

/* Строка: [родитель ›] [название · стопки · шеврон]. Родителя нет — перед
   названием маркер самой точки. Раскрывать нечего (у точки нет ни детей, ни
   персонажей) — строка остаётся подписью, без шеврона. */
function stripEl(view, parent, title, points, chars, canOpen, go) {
  const el = document.createElement('div');
  el.className = 'node-strip';
  if (parent) {
    const crumb = document.createElement('button');
    crumb.type = 'button';
    crumb.className = 'node-crumb';
    const pname = parent.name || parent.label || '';
    crumb.title = parent.kindLabel ? `${parent.kindLabel}: ${pname}` : pname;
    crumb.appendChild(markerEl(parent, 'node-strip-marker'));
    const name = document.createElement('span');
    name.className = 'node-crumb-name';
    name.textContent = parent.label || pname;
    const sep = document.createElement('span');
    sep.className = 'node-crumb-sep';
    sep.setAttribute('aria-hidden', 'true');
    sep.textContent = '›';
    crumb.append(name, sep);
    crumb.addEventListener('click', go.parent);
    el.appendChild(crumb);
  }
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'node-strip-open' + (canOpen ? '' : ' is-static');
  if (canOpen) open.title = 'Все переходы — нажми или потяни';
  else open.tabIndex = -1;
  if (!parent && view.self) open.appendChild(markerEl(view.self, 'node-strip-marker'));
  const t = document.createElement('span');
  t.className = 'node-strip-title';
  t.textContent = title;
  open.appendChild(t);
  if (points.length) open.appendChild(stackEl(points, 'Места и сюжеты'));
  if (chars.length) open.appendChild(stackEl(chars, 'Персонажи'));
  if (canOpen) {
    const chev = document.createElement('span');
    chev.className = 'node-strip-chev';
    chev.innerHTML = CHEVRON_SVG;
    open.appendChild(chev);
  }
  el.appendChild(open);
  return {el, open};
}

/* Ступени шторки — высоты, на которых она встаёт: 0 (свёрнута в строку),
   низ первого ряда, второго, …, всё. Последняя ступень не выше
   SHADE_MAX_SHARE экрана — дальше шторка прокручивается внутри себя. null —
   ширины ещё нет (окно системы до открытия — display:none). */
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

// Шторки, которые надо переложить при повороте экрана.
const liveRows = new Set();
window.addEventListener('resize', () => liveRows.forEach(fn => fn()));

/* На какой ступени шторка — своя память у каждого вида окна (точка,
   система). Храним номер ступени, последнюю — как 'all' (рядов у разных
   точек разное число). Хранилище недоступно (приватный режим) — умолчание.
   ⚠️ Ключ новый (v=178): в старом у точки по умолчанию лежал «один ряд», и
   переехавшая вниз шторка у всех открывалась бы раскрытой. */
const SHADE_KEY = 'galaxyMapLinksShade2';
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

/* Плашка лежит ПОВЕРХ тела, а тело отступает снизу на её высоту (--dock-h на
   карточке). Пока шторку тянут или она доезжает до ступени, отступ не
   трогаем: иначе текст перекладывался бы каждый кадр. Выставляется один раз,
   когда шторка встала. Уезжающие вкладки высоту не меняют (transform). */
const dockObservers = new WeakSet();
function syncDock(card) {
  const dock = card && card.querySelector(':scope > .node-dock');
  if (!dock || dock.classList.contains('is-moving')) return;
  card.style.setProperty('--dock-h', dock.offsetHeight + 'px');
}
document.querySelectorAll('.phenom-card').forEach(card => {
  const dock = card.querySelector(':scope > .node-dock');
  if (!dock || !window.ResizeObserver || dockObservers.has(dock)) return;
  dockObservers.add(dock);
  new ResizeObserver(() => syncDock(card)).observe(dock);
  wireDockAutoHide(card, dock);
});

/* Вкладки уезжают при прокрутке — ВСЛЕД ЗА ТЕКСТОМ, строка остаётся (v=178;
   до этого так уезжала вся плашка сверху, v=171–177). Листают вниз — вкладки
   опускаются за край и гаснут, вся карточка садится на их место; вверх —
   возвращаются. Остановились (140 мс тишины или scrollend) — доводка: вкладки
   либо целиком на месте, либо целиком спрятаны; спорное решает направление.
   Колесо мыши (v=172) — вдвое медленнее текста и без доводки: один щелчок
   колеса не прячет их целиком.
   ⚠️ Сдвиг не больше прокрутки тела: у самого верха текста вкладки всегда на
   месте, и вернуть их — потянуть текст вниз, без лишних нажатий.
   Работает только на НАШЕЙ прокрутке (описание, «Игра», своя копия статьи,
   броски) — в чужом iframe о прокрутке не узнать, там вкладки стоят. */
const DOCK_SNAP_IDLE_MS = 140;   // столько тишины после прокрутки — и доводим
const DOCK_SNAP_BIAS = 0.3;      // доля пути, после которой едем к другой ступени
const DOCK_REVEAL_EDGE_PX = 40;  // компьютер: мышь у нижнего края — вкладки возвращаются
const DOCK_WHEEL_RATIO = 0.45;   // колесо: вкладки едут на такую долю прокрутки текста
const DOCK_WHEEL_HOLD_MS = 400;  // столько после события колеса прокрутка считается колёсной
function wireDockAutoHide(card, dock) {
  const body = card.querySelector('.story-content');
  const bar = dock.querySelector(':scope > .phenom-toolbar');
  if (!body || !bar) return;
  let offset = 0, lastY = body.scrollTop, dir = 0, idle = 0;
  // Высота вкладок — из кэша: читать геометрию на каждом событии прокрутки нельзя.
  let barH = 0;
  const measure = () => { barH = bar.offsetHeight; };
  const maxOffset = () => Math.max(0, Math.min(barH, body.scrollTop));
  const set = (value, animate) => {
    offset = Math.max(0, Math.min(maxOffset(), value));
    const moved = offset > 0.5;
    dock.classList.toggle('dock-snap', !!animate);
    dock.style.transform = moved ? `translateY(${offset}px)` : '';
    // Гаснут вдвое быстрее, чем уезжают: к середине пути их уже не видно.
    bar.style.opacity = moved ? String(Math.max(0, 1 - 2 * offset / (barH || 1))) : '';
    card.classList.toggle('tabs-moving', moved);
  };
  const snap = () => {
    clearTimeout(idle);
    const t = offset / (barH || 1);
    let target = dir > 0 ? (t > DOCK_SNAP_BIAS ? barH : 0) : (t < 1 - DOCK_SNAP_BIAS ? 0 : barH);
    // Целиком не спрятать (текст прокручен меньше высоты вкладок) — вернуть.
    if (target > maxOffset()) target = 0;
    set(target, true);
  };
  card.__showDock = () => { clearTimeout(idle); set(0, true); };
  if (window.ResizeObserver) new ResizeObserver(() => { measure(); if (offset) set(offset); }).observe(bar);
  measure();
  let wheelUntil = 0;
  body.addEventListener('wheel', () => { wheelUntil = performance.now() + DOCK_WHEEL_HOLD_MS; }, {passive: true});
  const byWheel = () => performance.now() < wheelUntil;
  body.addEventListener('scroll', () => {
    const y = body.scrollTop;
    const dy = y - lastY;
    lastY = y;
    // Прокрутку поставил код (вернулись с «Статьи» на «Описание») — не жест.
    if (performance.now() < (body.__ignoreScrollUntil || 0)) return;
    if (dy) dir = Math.sign(dy);
    clearTimeout(idle);
    if (byWheel()) { set(offset + dy * DOCK_WHEEL_RATIO, false); return; }
    set(offset + dy, false);
    idle = setTimeout(snap, DOCK_SNAP_IDLE_MS);
  }, {passive: true});
  // Где есть — конец прокрутки (с докатом) ловится сразу, без ожидания.
  body.addEventListener('scrollend', () => {
    if (byWheel() || performance.now() < (body.__ignoreScrollUntil || 0)) return;
    snap();
  });
  // Сменилось содержимое тела (другая точка, анкета, броски) — вкладки на месте.
  new MutationObserver(() => { clearTimeout(idle); lastY = body.scrollTop; set(0, false); })
    .observe(body, {childList: true});
  // Компьютер: мышь к нижнему краю — вкладки возвращаются.
  card.addEventListener('mousemove', (e) => {
    if (offset > 0.5 && window.innerHeight - e.clientY < DOCK_REVEAL_EDGE_PX + barH) card.__showDock();
  });
  // Фокус с клавиатуры внутри плашки — показать вкладки.
  dock.addEventListener('focusin', () => card.__showDock());
}

/* opts.fold — вид окна для памяти ступени ('point' | 'system').
   view: parentMeta (родитель), self (маркер самой точки), children (места и
   сюжеты), characters (персонажи); stripTitle — подпись строки, если у окна
   нет своей точки (окно системы). */
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
  const {items, points, chars} = linkItems(view, go);
  const parent = view.parentMeta && view.parentMeta.id ? view.parentMeta : null;
  const title = (view.self && (view.self.label || view.self.name)) || view.stripTitle || '';
  const canOpen = items.length > 0;
  el.hidden = !canOpen && !parent && !title;
  if (el.hidden) return;

  // Окно шторки (видимая часть) и сетка маркеров с переносом внутри него.
  const shade = document.createElement('div');
  shade.className = 'node-links-row';
  const grid = document.createElement('div');
  grid.className = 'node-links-grid';
  items.forEach(i => grid.appendChild(i));
  shade.appendChild(grid);
  const strip = stripEl(view, parent, title, points, chars, canOpen, go);
  el.append(shade, strip.el);

  const card = el.closest('.phenom-card');
  const dock = el.closest('.node-dock');
  // Внизу шторка растёт вверх (тянуть вверх — открыть), в окне системы — вниз.
  const grow = dock ? -1 : 1;
  let stops = [0];
  let level = 0;
  let height = 0;

  const paint = () => {
    el.classList.toggle('folded', height <= 0);
    if (canOpen) strip.open.setAttribute('aria-expanded', String(height > 0));
    // Всё не влезло даже на последней ступени — дальше крутится внутри.
    shade.classList.toggle('scrolls', level === stops.length - 1 && grid.scrollHeight > height + 1);
  };
  // Встать на ступень (animate — плавно, иначе сразу).
  const setLevel = (k, animate) => {
    level = Math.max(0, Math.min(k, stops.length - 1));
    height = stops[level];
    if (dock && animate) dock.classList.add('is-moving');
    shade.classList.toggle('animate', !!animate);
    shade.style.height = height + 'px';
    paint();
    if (!animate) { if (card) syncDock(card); return; }
    // Отступ тела — когда шторка доехала (страховка таймером, если transitionend не придёт).
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      if (dock) dock.classList.remove('is-moving');
      if (card) syncDock(card);
    };
    shade.addEventListener('transitionend', finish, {once: true});
    setTimeout(finish, 320);
  };
  const saveLevel = () => writeShade(kind, level === stops.length - 1 && level > 0 ? 'all' : level);

  if (canOpen) {
    // Нажатие — свернуть, если открыта хоть на ряд, иначе открыть целиком.
    strip.open.addEventListener('click', () => {
      setLevel(level > 0 ? 0 : stops.length - 1, true);
      saveLevel();
    });
    /* Протяжка строки — высота идёт за пальцем/мышью, при отпускании встаёт
       на ближайшую ступень. Сдвиг меньше SHADE_DRAG_PX — это тап, его
       обрабатывает click кнопки (родитель или «раскрыть»). Протянули — click
       после отпускания гасим: он не должен ни раскрыть шторку ещё раз, ни
       увести к родителю. */
    /* Движение слушаем на всём документе, пока тянут: мышь за быстрый рывок
       уходит со строки (у пальца браузер сам держит касание за строкой). А
       захватывать указатель сразу на pointerdown нельзя — тогда click
       достался бы строке, а не кнопке под пальцем. */
    const SHADE_DRAG_PX = 6;
    let drag = null;
    let swallowUntil = 0;
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = (e.clientY - drag.y) * grow;
      if (!drag.moved && Math.abs(dy) < SHADE_DRAG_PX) return;
      if (!drag.moved) {
        drag.moved = true;
        if (dock) dock.classList.add('is-moving');
        shade.classList.remove('animate');
      }
      height = Math.max(0, Math.min(drag.h + dy, stops[stops.length - 1]));
      shade.style.height = height + 'px';
      paint();
    };
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = drag.moved;
      drag = null;
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', release);
      document.removeEventListener('pointercancel', release);
      if (!moved) return;
      swallowUntil = performance.now() + 400;
      let best = 0;
      stops.forEach((s, k) => { if (Math.abs(s - height) < Math.abs(stops[best] - height)) best = k; });
      setLevel(best, true);
      saveLevel();
    };
    strip.el.addEventListener('pointerdown', (e) => {
      if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = {id: e.pointerId, y: e.clientY, h: height, moved: false};
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', release);
      document.addEventListener('pointercancel', release);
    });
    strip.el.addEventListener('click', (e) => {
      if (performance.now() < swallowUntil) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  // Раскладка — когда у шторки есть ширина: окно системы до открытия вообще
  // display:none. Несколько кадров подождать и сдаться.
  const saved = readShade(kind, 0);
  let tries = 0;
  const refit = () => {
    const s = shadeStops(grid);
    if (!s) { if (++tries < 20) requestAnimationFrame(refit); return; }
    stops = s;
    setLevel(saved === 'all' ? stops.length - 1 : saved, false);
  };
  shade.style.height = '0px';
  paint();
  if (!canOpen) { if (card) syncDock(card); return; }
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
  // «Игра» — есть, только если у ветки точки есть персонажи (renderGame).
  const game = refs.body ? renderGame(refs.body, view, handlers) : null;
  if (refs.game) {
    show(refs.game, !!game);
    refs.game.onclick = game ? toBody('game') : null;
  }
  showNodeBody(refs, view, 'desc');

  if (refs.edit) refs.edit.hidden = !view.canEdit;

  // ⚠️ Вкладок детей-точек в этом ряду больше НЕТ (24.09.2026): они уехали в
  // шторку переходов (renderNodeLinks выше). Панель действий теперь
  // не зависит от данных — ✕, родитель и максимум четыре действия.
}
