/* ============================================================
   Ноды по разделам (25.09.2026, v=150) — третья раскладка тех же узлов.

   Идея игрока: новичку в нодах ничего не понятно, где что. Кнопка ▦ в режиме
   нод раскладывает ВСЕ узлы по ячейкам-разделам с подписями: «Набор открыт»,
   «Сюжеты идут», «Локации», «Системы», «Базовые маркеры», «Архив». Персонажи
   стоят сеткой рядом со своей точкой (сюжетом, локацией), а не отдельным
   разделом.

   Связи между самими точками (Феном → Переворот, Крейсер; система → точка в
   ней) — СКОБКИ слева от разделов (v=151, идея игрока): вертикальная линия на
   семью «родитель + его дети-точки», от неё отводы к каждой точке, у родителя
   на скобке ●. Скобка идёт сквозь разделы, поэтому связь видна, в каком бы
   разделе ни оказались родитель и ребёнок. Пересекающиеся скобки разводятся
   по дорожкам: короткие ближе к точкам, длинные левее.

   Как и две другие раскладки (mapX/graphX в map.js), это ЗАМОРОЖЕННЫЕ
   координаты, посчитанные один раз при загрузке: sectionX/sectionY/
   sectionSize у каждого узла. Переключение — перелёт между готовыми
   позициями, никакой физики (грабли №15/18). Модуль сам в x/y узлов не
   пишет и от DOM зависит только в renderSections.

   Раздел точки выводится из её полей (sectionOf), отдельного поля «раздел»
   в данных нет: набор (recruit) → сюжет (beacon) → галочка «Локация» →
   остальное. Завершённое — всегда в архив, система — всегда в «Системы».
   ============================================================ */
const ns = 'http://www.w3.org/2000/svg';

/* Два набора размеров (единицы карты). Компактный — для узкого экрана
   (телефон, v=152): на 375×812 обычный занимал 2.1 экрана, игрок попросил,
   чтобы помещалось. Маркеры мельче, отступы плотнее. Подписи у персонажей
   есть в обоих (v=153, игрок: «это у нас архив, тут нужны имена»; стопка
   аватаров и сворачивание отвергнуты — «меню ради меню»). Выбирается по
   ширине панели при загрузке.
   Заголовок раздела стоит В ЛИНИИ рамки (разрывает верхнюю линию, v=153):
   padTop — от этой линии до маркеров, padBottom — от маркеров до низа. */
const PROFILES = {
  normal: {
    size: {world: 7, character: 4.5, system: 7},
    font: {world: 1.8, character: 1.45, system: 1.8},
    charCellW: 7.6,       // ячейка персонажа: маркер + подпись (ограничивает и её)
    worldCellMinW: 11,
    labelGap: 0.5,        // от низа маркера до подписи
    cellGapY: 1.3,        // под подписью до следующего ряда
    ownerGap: 1.2,        // от точки до сетки её персонажей
    itemGapX: 2.6, itemGapY: 2.2,
    pad: 2.4, padTop: 2.2, padBottom: 1.4, titleFont: 2.3, sectionGap: 2.8,
    laneStep: 2.2, laneGap: 1.4,   // скобки: шаг дорожек и зазор до рамок
    /* Маркер персонажа при кадре «по ширине» — не мельче этого (px). Без
       ограничения подбор под форму экрана брал широкую раскладку (высокая
       колонка тоже «похожа» на телефон, если её сжать), и маркеры выходили
       мельче пальца. */
    minCharPx: 28,
    maxCols: 5,           // колонок персонажей у точки, дальше — ряд ниже
  },
  compact: {
    size: {world: 6, character: 4.2, system: 6},
    font: {world: 1.5, character: 1.3, system: 1.5},
    charCellW: 6.6,
    worldCellMinW: 9,
    labelGap: 0.35,
    cellGapY: 0.8,
    ownerGap: 1.0,
    itemGapX: 1.8, itemGapY: 1.1,
    pad: 1.5, padTop: 1.7, padBottom: 0.9, titleFont: 1.9, sectionGap: 2.2,
    laneStep: 1.8, laneGap: 1.1,
    minCharPx: 26,
    // 5, а не 4: сетка уже — камера по ширине крупнее, и колонка на 375×812
    // вырастала до 1.9 экрана (маркер 36 px); с 5 — ~30 px и ниже.
    maxCols: 5,
  },
};
const COMPACT_BELOW_PX = 560;
let P = PROFILES.normal;
// Ширина раздела (единицы карты) — в этих пределах.
const WIDTH_MIN = 30, WIDTH_MAX = 170;

const SECTIONS = [
  {key: 'recruit', title: '📣 Набор открыт', accent: 'gold'},
  {key: 'active', title: 'Сюжеты идут'},
  {key: 'locations', title: 'Локации'},
  {key: 'markers', title: 'Базовые маркеры'},
  // Системы — рядом с архивом и так же серые (игрок): это справка «где что»,
  // а не то, куда зовут играть.
  {key: 'systems', title: 'Системы', dim: true},
  {key: 'archive', title: 'Архив', dim: true},
  {key: 'loose', title: 'Персонажи без точки'},
];

function sectionOf(node) {
  if (node.kind === 'system') return 'systems';
  const d = node.data;
  if (d.completed === true) return 'archive';
  if (typeof d.recruit === 'string' && d.recruit.trim()) return 'recruit';
  if (d.beacon) return 'active';
  if (d.location === true) return 'locations';
  return 'markers';
}

// Ближайший предок-точка (мировая или система) — рядом с ним персонаж и встанет.
function ownerOf(node, included) {
  let cur = node.parent;
  while (cur) {
    if (cur.kind !== 'character' && included.has(cur)) return cur;
    cur = cur.parent;
  }
  return null;
}

/* Группы союзников (связные по links) в исходном порядке characters.json —
   как в окне точки. В сетке группа стоит подряд и по возможности в одном ряду
   (placeGrid), иначе пунктир союза тянулся бы через весь ряд. */
function linkGroups(chars) {
  const set = new Set(chars);
  const seen = new Set();
  const groups = [];
  chars.forEach(c => {
    if (seen.has(c)) return;
    const stack = [c];
    seen.add(c);
    const group = [];
    while (stack.length) {
      const cur = stack.pop();
      group.push(cur);
      cur.links.forEach(o => { if (set.has(o) && !seen.has(o)) { seen.add(o); stack.push(o); } });
    }
    group.sort((a, b) => chars.indexOf(a) - chars.indexOf(b));
    groups.push(group);
  });
  return groups;
}

/* Места персонажей в сетке из cols колонок. Группа, которая не влезает в
   хвост ряда, но влезла бы в целый ряд, начинает новый ряд. */
function placeGrid(groups, cols) {
  const slots = [];
  let col = 0, row = 0;
  groups.forEach(group => {
    if (col > 0 && group.length <= cols && col + group.length > cols) { col = 0; row++; }
    group.forEach(c => {
      if (col >= cols) { col = 0; row++; }
      slots.push({c, col, row});
      col++;
    });
  });
  return {slots, rows: slots.length ? row + 1 : 0};
}

const markerW = (n) => P.size[n.kind] * (n.aspect || 1);
const ownerCellW = (n) => Math.max(markerW(n), P.worldCellMinW);
const cellH = (kind) => P.size[kind] + P.labelGap + P.font[kind] * 1.2 + P.cellGapY;
const charCellH = () => cellH('character');

/* h — место под элемент вместе с просветом до следующего ряда, vh — видимая
   высота (до низа последней подписи): по ней считаются подложка группы и низ
   раздела, иначе снизу оставался лишний пустой ряд (замечание игрока). */
function measureItem(item, width) {
  const ownerW = item.owner ? ownerCellW(item.owner) : 0;
  const n = item.members.length;
  if (!n) {
    const h = cellH(item.owner.kind);
    return {cols: 0, slots: [], w: ownerW, h, vh: h - P.cellGapY};
  }
  const room = width - ownerW - (item.owner ? P.ownerGap : 0);
  const cols = Math.max(1, Math.min(n, P.maxCols, Math.floor(room / P.charCellW)));
  const grid = placeGrid(item.groups, cols);
  const h = Math.max(item.owner ? cellH(item.owner.kind) : 0, grid.rows * charCellH());
  return {
    cols, slots: grid.slots,
    w: ownerW + (item.owner ? P.ownerGap : 0) + cols * P.charCellW,
    h, vh: h - P.cellGapY,
  };
}

// Ширина заголовка раздела — оценка на глаз (жирный шрифт интерфейса, эмодзи
// шире буквы): слой при отрисовке скрыт, мерить getComputedTextLength нечем.
const titleWidth = (text, font) => [...text].reduce((w, ch) =>
  w + font * (ch === ' ' ? 0.3 : ch.codePointAt(0) > 0x2000 ? 1.2 : 0.62), 0);

/* Раскладка при заданной внутренней ширине раздела. Точка со связями (solo)
   занимает свою строку: в неё упирается отвод скобки. Остальные идут
   потоком по нескольку в ряд. */
function flow(sections, width) {
  // Первый заголовок стоит на линии рамки и наполовину торчит над ней.
  let y = P.titleFont * 0.6;
  const placed = [];
  sections.forEach(sec => {
    const top = y;
    let cx = 0, cy = y + P.padTop, rowH = 0;
    // Рамка раздела — по его содержимому (v=154, «панели динамические»):
    // где много — шире, где одна точка — узкая. Не уже своего заголовка.
    let right = titleWidth(sec.title, P.titleFont) + 1.4, contentBottom = cy;
    const newRow = () => { if (cx > 0) { cx = 0; cy += rowH + P.itemGapY; rowH = 0; } };
    const items = sec.items.map(item => {
      const m = measureItem(item, width);
      if (item.solo || cx + m.w > width) newRow();
      const at = {item, m, x: cx, y: cy};
      right = Math.max(right, cx + m.w);
      contentBottom = Math.max(contentBottom, cy + m.vh);
      cx += m.w + P.itemGapX;
      rowH = Math.max(rowH, m.h);
      if (item.solo) newRow();
      return at;
    });
    const bottom = contentBottom + P.padBottom;
    placed.push({sec, top, bottom, right, items});
    y = bottom + P.sectionGap;
  });
  return {placed, height: y - P.sectionGap};
}

/* Семьи для скобок: родитель-точка + его дети-точки (персонажи не в счёт —
   они и так стоят сеткой у своей точки). Плюс союзы между точками — скобка
   из двух, пунктиром. */
function familiesOf(points) {
  const set = new Set(points);
  const fams = [];
  points.forEach(p => {
    const kids = p.children.filter(c => set.has(c));
    if (kids.length) fams.push({kind: 'parent', parent: p, members: [p, ...kids]});
  });
  const drawn = new Set();
  points.forEach(p => p.links.forEach(o => {
    if (!set.has(o)) return;
    const key = p.id < o.id ? p.id + '|' + o.id : o.id + '|' + p.id;
    if (drawn.has(key)) return;
    drawn.add(key);
    fams.push({kind: 'link', parent: null, members: [p, o]});
  }));
  return fams;
}

/* Дорожки скобок по порядку строк: короткие — ближе к точкам (дорожка 0),
   длинные — левее, пересекающиеся — на разных дорожках. Порядок строк от
   ширины раздела не зависит (у каждой точки со связью своя строка), поэтому
   считается один раз. */
function assignLanes(fams, rowIndex) {
  fams.forEach(f => {
    const idx = f.members.map(n => rowIndex.get(n));
    f.from = Math.min(...idx);
    f.to = Math.max(...idx);
  });
  const lanes = [];
  [...fams].sort((a, b) => (a.to - a.from) - (b.to - b.from)).forEach(f => {
    let lane = lanes.findIndex(list => list.every(g => g.to < f.from || g.from > f.to));
    if (lane < 0) { lane = lanes.length; lanes.push([]); }
    lanes[lane].push(f);
    f.lane = lane;
  });
  return lanes.length;
}

/* Считает раскладку и пишет в узлы sectionX/sectionY/sectionSize. У нитей
   ставит sectionKeep: в разделах видны только союзы ВНУТРИ одной группы
   (персонажи одной точки); связи между точками — скобками слева.
   paneWidthPx — ширина панели: по ней набор размеров (компактный на
   телефоне) и потолок ширины. Возвращает габариты и что рисовать. */
export function layoutSections(byId, threads, cx, cy, paneWidthPx) {
  P = paneWidthPx && paneWidthPx < COMPACT_BELOW_PX ? PROFILES.compact : PROFILES.normal;
  const nodes = [...byId.values()].filter(n => n.onMap);
  const included = new Set(nodes);
  const points = nodes.filter(n => n.kind !== 'character');
  const bySection = new Map(SECTIONS.map(s => [s.key, []]));
  const itemOf = new Map();
  const itemByOwner = new Map();

  const fams = familiesOf(points);
  // Порядок семей — по первому появлению родителя в данных; точка в
  // нескольких семьях получает ключ первой: так члены семьи встают рядом.
  const famKey = new Map();
  fams.forEach((f, i) => f.members.forEach(n => { if (!famKey.has(n)) famKey.set(n, i); }));

  points.forEach(n => {
    const item = {owner: n, members: [], groups: [], solo: famKey.has(n)};
    itemByOwner.set(n, item);
    itemOf.set(n, item);
    bySection.get(sectionOf(n)).push(item);
  });
  const loose = {owner: null, members: [], groups: [], solo: false};
  nodes.filter(n => n.kind === 'character').forEach(n => {
    const owner = ownerOf(n, included);
    const item = owner ? itemByOwner.get(owner) : loose;
    item.members.push(n);
    itemOf.set(n, item);
  });
  if (loose.members.length) bySection.get('loose').push(loose);
  bySection.forEach(items => items.forEach(item => { item.groups = linkGroups(item.members); }));
  /* Порядок внутри раздела: сначала точки со связями (по семьям — чтобы
     скобки были короче), потом с персонажами (они шире и занимают ряд),
     мелкие добивают хвост. Сортировка устойчивая — иначе порядок из данных. */
  const rank = (item) => item.solo ? 0 : (item.members.length ? 1 : 2);
  bySection.forEach(items => items.sort((a, b) =>
    rank(a) - rank(b) || (a.solo && b.solo ? famKey.get(a.owner) - famKey.get(b.owner) : 0)));

  const sections = SECTIONS.map(s => ({...s, items: bySection.get(s.key)})).filter(s => s.items.length);
  if (!sections.length) return {width: 0, height: 0, top: cy, frames: [], groups: [], labels: [], brackets: []};

  const rowIndex = new Map();
  sections.forEach(s => s.items.forEach(item => { if (item.solo) rowIndex.set(item.owner, rowIndex.size); }));
  const laneCount = assignLanes(fams, rowIndex);
  const gutter = laneCount ? (laneCount - 1) * P.laneStep + P.laneGap + 0.8 : 0;

  /* Ширина — по самой широкой точке с персонажами в P.maxCols колонок
     (v=154: подбор под форму экрана на компьютере растягивал сетку в одну
     строку, игроку больше нравились персонажи «друг под другом»). Потолок —
     из размера экрана: персонаж не мельче P.minCharPx (20 px — поля кадра). */
  const widest = Math.max(0, ...sections.flatMap(s => s.items.map(item => measureItem(item, Infinity).w)));
  const byPane = paneWidthPx
    ? (paneWidthPx - 20) * P.size.character / P.minCharPx - gutter - P.pad * 2
    : WIDTH_MAX;
  const width = Math.max(WIDTH_MIN, Math.min(widest, byPane));
  const {placed, height} = flow(sections, width);
  const W = gutter + Math.max(...placed.map(p => p.right)) + P.pad * 2;
  const x0 = cx - W / 2, y0 = cy - height / 2;
  const frameX = x0 + gutter;

  const frames = [], groups = [], labels = [];
  // Шрифт 0 — подписи нет (персонажи в компактном наборе).
  const label = (n, x, y) => P.font[n.kind] && labels.push({
    text: n.kind === 'character' ? (n.data.name || n.id) : (n.data.shortTitle || n.data.title || n.id),
    x, y, font: P.font[n.kind],
    maxW: n.kind === 'character' ? P.charCellW - 0.5 : ownerCellW(n) - 0.5,
    dim: n.kind === 'world' && n.data.completed === true,
  });

  placed.forEach(({sec, top, bottom, right, items}) => {
    frames.push({key: sec.key, x: frameX, y: y0 + top, w: right + P.pad * 2, h: bottom - top, title: sec.title,
      accent: sec.accent || '', dim: !!sec.dim, titleFont: P.titleFont, pad: P.pad});
    items.forEach(({item, m, x, y}) => {
      const ix = frameX + P.pad + x, iy = y0 + y;
      if (item.owner && item.members.length) groups.push({owner: item.owner.id, x: ix - 0.8, y: iy - 0.5, w: m.w + 1.6, h: m.vh + 0.9});
      let gx = ix;
      if (item.owner) {
        const o = item.owner, s = P.size[o.kind];
        const cw = ownerCellW(o);
        o.sectionX = ix + cw / 2;
        o.sectionY = iy + s / 2;
        o.sectionSize = s;
        label(o, o.sectionX, iy + s + P.labelGap + P.font[o.kind]);
        gx = ix + cw + P.ownerGap;
      }
      m.slots.forEach(({c, col, row}) => {
        const s = P.size.character;
        c.sectionX = gx + col * P.charCellW + P.charCellW / 2;
        c.sectionY = iy + row * charCellH() + s / 2;
        c.sectionSize = s;
        label(c, c.sectionX, iy + row * charCellH() + s + P.labelGap + P.font.character);
      });
    });
  });

  // Скобки: вертикаль на дорожке + отвод к левому краю маркера каждой точки.
  const brackets = fams.map(f => {
    const lx = frameX - P.laneGap - f.lane * P.laneStep;
    const ys = f.members.map(n => n.sectionY);
    return {
      kind: f.kind, x: lx, y1: Math.min(...ys), y2: Math.max(...ys),
      ticks: f.members.map(n => ({y: n.sectionY, x2: n.sectionX - markerW(n) / 2 - 0.4})),
      dot: f.parent ? f.parent.sectionY : null,
    };
  });

  threads.forEach(t => {
    t.sectionKeep = t.kind === 'link' && t.a.kind === 'character'
      && itemOf.get(t.a) !== undefined && itemOf.get(t.a) === itemOf.get(t.b);
  });
  return {width: W, height, top: y0, charSize: P.size.character, frames, groups, labels, brackets};
}

// Подпись длиннее ячейки — обрезаем с многоточием (ширина буквы — на глаз,
// с запасом: шрифт интерфейса, кириллица).
function fitText(text, font, maxW) {
  const max = Math.max(3, Math.floor(maxW / (font * 0.58)));
  const s = String(text).trim();
  return s.length <= max ? s : s.slice(0, max - 1).trimEnd() + '…';
}

/* Рамки разделов, подложки групп, скобки и подписи — один <g>, который map.js
   кладёт в слой графа под нити и маркеры. Всё статично: рисуется один раз,
   видимость — классом на <svg> (.sections-shown, css). Текста тут ~40
   элементов — по цене ничто рядом с 1600 подписями карты (грабли №15). */
export function renderSections(layout) {
  const g = document.createElementNS(ns, 'g');
  g.setAttribute('class', 'sections-layer');
  const el = (tag, attrs, cls) => {
    const e = document.createElementNS(ns, tag);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v));
    if (cls) e.setAttribute('class', cls);
    g.appendChild(e);
    return e;
  };
  /* Рамка — заливка отдельно (rect без обводки) и обводка путём с разрывом
     под заголовок: заголовок стоит прямо в верхней линии. */
  layout.frames.forEach(f => {
    const mods = (f.accent ? ' is-' + f.accent : '') + (f.dim ? ' is-dim' : '');
    const r = 2, {x, y, w, h} = f;
    // data-section — по нему обучение (js/tour.js) находит раздел для выреза.
    el('rect', {x, y, width: w, height: h, rx: r, 'data-section': f.key}, 'section-frame-fill' + mods);
    const g1 = x + f.pad - 0.7, g2 = x + f.pad + titleWidth(f.title, f.titleFont) + 0.7;
    el('path', {d: `M ${g2} ${y} H ${x + w - r} A ${r} ${r} 0 0 1 ${x + w} ${y + r} V ${y + h - r}`
      + ` A ${r} ${r} 0 0 1 ${x + w - r} ${y + h} H ${x + r} A ${r} ${r} 0 0 1 ${x} ${y + h - r}`
      + ` V ${y + r} A ${r} ${r} 0 0 1 ${x + r} ${y} H ${g1}`}, 'section-frame' + mods);
    // Базовая линия ниже линии рамки на треть кегля — буквы садятся на неё серединой.
    const t = el('text', {x: x + f.pad, y: y + f.titleFont * 0.35, 'font-size': f.titleFont}, 'section-title' + mods);
    t.textContent = f.title;
  });
  // data-owner — точка группы: обучение подсвечивает сюжет вместе с персонажами.
  layout.groups.forEach(b => el('rect', {x: b.x, y: b.y, width: b.w, height: b.h, rx: 1.4, 'data-owner': b.owner}, 'section-group'));
  layout.brackets.forEach(b => {
    const cls = 'section-bracket' + (b.kind === 'link' ? ' is-link' : '');
    el('line', {x1: b.x, y1: b.y1, x2: b.x, y2: b.y2}, cls);
    b.ticks.forEach(t => el('line', {x1: b.x, y1: t.y, x2: t.x2, y2: t.y}, cls));
    if (b.dot !== null) el('circle', {cx: b.x, cy: b.dot, r: 0.6}, 'section-bracket-dot');
  });
  layout.labels.forEach(l => {
    const t = el('text', {x: l.x, y: l.y, 'font-size': l.font, 'text-anchor': 'middle'},
      'section-label' + (l.dim ? ' is-dim' : ''));
    t.textContent = fitText(l.text, l.font, l.maxW);
  });
  return g;
}
