/* ============================================================
   Единый граф всех точек карты.

   Раньше связь была ровно одна и зашитая: у персонажа поле storyId, и он
   рисовался вокруг своего сюжета. Всё остальное (фракции, сами сюжеты,
   Феном) жило плоским списком без всяких отношений, а "цепочки" персонажей
   между собой строились СЛУЧАЙНО при каждой загрузке страницы — красиво, но
   ничего не значило.

   Теперь у ЛЮБОЙ точки — из markers.json, stories.json, characters.json —
   могут быть два необязательных поля:

     "parent": "<id>"          — к кому она привязана (её "планета");
     "links":  ["<id>", ...]   — с кем она в союзе (равные ей узлы).

   Ссылаться можно на что угодно и куда угодно между файлами: сюжет к
   Феному, персонаж к сюжету, сюжет к сюжету, обычный маркер к персонажу.
   Тип точки на правила раскладки не влияет вообще — влияет только её место
   в дереве. Отсюда и единый модуль: разбор связей и расчёт позиций тут,
   отрисовка — в js/map.js.

   Что считается здесь:
   - дерево (parent) и союзы (links), с защитой от битых id и циклов;
   - размер каждого узла — чем глубже, тем мельче (спутник меньше планеты);
   - позиции: корни стоят на своих x/y из JSON, дети — кольцом вокруг
     родителя, дальше вниз по дереву рекурсивно;
   - нити между узлами: сплошные "родитель -> ребёнок" и пунктирные
     "союз <-> союз".

   ⚠️ Это НЕ физика в кадре. Весь расчёт (включая релаксацию ниже) —
   один раз при загрузке страницы, дальше позиции заморожены. Непрерывный
   пересчёт положений сознательно не делаем, см. грабли №15/18 в CLAUDE.md.
   ============================================================ */

const TWO_PI = Math.PI * 2;

/* Базовый размер точки по её типу — тот же, что был до появления графа
   (8 у фракций и сюжетов, 2 у персонажа-спутника). Реальный размер узла
   может оказаться меньше базового, см. CHILD_SHRINK. */
const BASE_SIZE = { marker: 8, story: 8, character: 3 };

/* Ребёнок не может быть крупнее этой доли от родителя. Благодаря этому
   иерархия читается на глаз, а не только по форме маркера: Феном (8) ->
   сюжет (4.4) -> персонаж (2). При этом у сюжета-корня размер остаётся
   прежним (8), а персонаж и там, и там выходит одинаковым — базовые 2
   меньше, чем доля от любого из этих родителей. */
const CHILD_SHRINK = 0.55;

/* Просвет между краями двух маркеров — ЕДИНСТВЕННАЯ ручка "теснее/
   просторнее" на всю раскладку. Все рабочие расстояния считаются из неё и
   из размеров самих маркеров, а не подбираются по отдельности: раньше на
   каждое расстояние была своя константа, они не знали про размеры, и
   маркеры налезали друг на друга и на родителя. */
const GAP = 1.1;

/* Дети корня расходятся по полному кругу, дети любого узла глубже — по
   дуге, развёрнутой ПРОЧЬ от деда. Иначе поддерево растёт обратно внутрь
   кольца, прямо на своих же соседей. */
const CHILD_ARC = Math.PI * 1.7;

const RELAX_PASSES = 220;   // проходов релаксации с пружинами
const RELAX_SETTLE = 40;    // добивающих проходов только на расталкивание
const RELAX_RATE = 0.5;     // доля коррекции за проход (меньше 1 — чтобы узлы не скакали)
const PARENT_PULL = 0.05;   // насколько родитель тянет ребёнка к нужному расстоянию
const LINK_PULL = 0.05;     // насколько союзники притягиваются друг к другу

// Расстояние между ЦЕНТРАМИ двух узлов, при котором их маркеры не касаются.
function minDistance(a, b) {
  return (a.size + b.size) / 2 + GAP;
}

/* Радиус кольца, на которое сядут `count` детей размера childSize вокруг
   родителя размера parentSize. Берём больший из двух: не ближе к родителю,
   чем позволяют их размеры, и не теснее друг к другу, чем позволяют свои. */
function ringRadius(parentSize, childSize, count, arc) {
  const clearance = (parentSize + childSize) / 2 + GAP;
  if (count <= 1) return clearance;
  const step = arc >= TWO_PI - 1e-6 ? arc / count : arc / (count - 1);
  const spacing = childSize + GAP;
  const needed = spacing / (2 * Math.sin(Math.min(step, Math.PI) / 2));
  return Math.max(clearance, needed);
}

/* Разбор сырых списков в узлы графа. sources — [{kind, items}], где items
   это уже загруженный JSON-массив. Возвращает Map id -> узел.

   Битые связи НЕ роняют раскладку и не ругаются в консоль: ссылка на
   несуществующий id просто игнорируется (узел остаётся корнем и встанет на
   свои x/y), как и ссылка на самого себя. Это тот же принцип, что у
   рассинхрона systems/manifest.json — молча выпадает, ловится глазами. */
export function buildNodes(sources) {
  const byId = new Map();

  sources.forEach(({kind, items}) => {
    (items || []).forEach(item => {
      if (!item || typeof item.id !== 'string' || !item.id) return;
      if (byId.has(item.id)) return; // id обязан быть уникален на весь граф, дубль игнорируем
      byId.set(item.id, {
        id: item.id,
        kind,
        data: item,
        parent: null,
        children: [],
        links: [],
        depth: 0,
        size: BASE_SIZE[kind] || BASE_SIZE.marker,
        x: 0, y: 0,
        rest: 0,      // желаемое расстояние до родителя (радиус его кольца)
        pinned: false, // корень: стоит на координатах из JSON, релаксация его не двигает
        /* onMap: false — точка есть в данных и в дереве, но маркера на карте
           у неё нет: в раскладку не входит, соседей не расталкивает, нитей к
           ней не рисуется, переходить к ней надо без перелёта камеры (некуда
           лететь). Общий механизм на случай точки, которая существует только
           как "раздел" внутри окна родителя, а не как место на карте —
           сейчас в проекте им никто не пользуется, но он проверен (тесты в
           истории сессии) и оставлен как есть на будущее. */
        onMap: item.onMap !== false,
      });
    });
  });

  // --- родители ---
  byId.forEach(node => {
    const parentId = node.data.parent;
    if (typeof parentId !== 'string' || !parentId) return;
    const parent = byId.get(parentId);
    if (!parent || parent === node) return;
    node.parent = parent;
  });

  /* Цикл (A -> B -> A, хоть какой длины) разрываем в том узле, на котором
     его заметили: иначе обход дерева уйдёт в бесконечность. Проверять надо
     ПОСЛЕ того, как проставлены все родители — на полуготовом дереве цикл
     можно не увидеть, и результат зависел бы от порядка перебора. */
  byId.forEach(node => {
    const seen = new Set([node]);
    let cur = node.parent;
    while (cur) {
      if (seen.has(cur)) { node.parent = null; break; }
      seen.add(cur);
      cur = cur.parent;
    }
  });

  byId.forEach(node => {
    if (node.parent) node.parent.children.push(node);
    else node.pinned = true;
  });

  /* Союзы двусторонние: достаточно прописать links у одного из пары, второй
     получит связь автоматически. Так в JSON не нужно дублировать одну и ту
     же связь в обе стороны и следить, чтобы они не разъехались. */
  byId.forEach(node => {
    const ids = Array.isArray(node.data.links) ? node.data.links : [];
    ids.forEach(id => {
      const other = byId.get(id);
      if (!other || other === node) return;
      if (!node.links.includes(other)) node.links.push(other);
      if (!other.links.includes(node)) other.links.push(node);
    });
  });

  // --- глубина, размер и "есть ли маркер на карте", сверху вниз ---
  const roots = [...byId.values()].filter(n => !n.parent);
  const queue = roots.slice();
  while (queue.length) {
    const node = queue.shift();
    node.children.forEach(child => {
      child.depth = node.depth + 1;
      child.size = Math.min(child.size, node.size * CHILD_SHRINK);
      // Родителя на карте нет — значит и ребёнку не вокруг чего вставать:
      // всё поддерево уходит с карты целиком. Иначе дети "постоянного"
      // сюжета остались бы висеть без якоря в случайном месте.
      if (!node.onMap) child.onMap = false;
      queue.push(child);
    });
  }

  return byId;
}

/* Порядок детей на кольце: союзники должны оказаться соседями, иначе нить
   союза протянется через весь круг и раскладка перестанет читаться.
   Группируем детей по связным компонентам (только по связям ВНУТРИ этой
   группы детей) и выкладываем каждую компоненту подряд. */
function orderSiblings(children) {
  const inGroup = new Set(children);
  const visited = new Set();
  const ordered = [];
  children.forEach(child => {
    if (visited.has(child)) return;
    const stack = [child];
    visited.add(child);
    while (stack.length) {
      const node = stack.pop();
      ordered.push(node);
      node.links.forEach(other => {
        if (!inGroup.has(other) || visited.has(other)) return;
        visited.add(other);
        stack.push(other);
      });
    }
  });
  return ordered;
}

/* Стартовая раскладка: корни — на своих координатах из JSON, дети — кольцом
   вокруг родителя, и так вниз по дереву. Это только приближение, до
   состояния без пересечений его доводит relax() ниже. */
function placeTree(roots) {
  const queue = [];
  roots.forEach(root => {
    root.x = Number(root.data.x) || 0;
    root.y = Number(root.data.y) || 0;
    queue.push(root);
  });

  while (queue.length) {
    const node = queue.shift();
    // Точки без маркера на карте не занимают на ней места и не сдвигают
    // соседей — их просто нет в раскладке (см. onMap в buildNodes).
    const children = orderSiblings(node.children.filter(c => c.onMap));
    if (!children.length) continue;

    // Дети корня занимают весь круг; глубже — дугу прочь от деда, чтобы
    // поддерево росло наружу, а не обратно в родительское кольцо.
    const outward = node.parent
      ? Math.atan2(node.y - node.parent.y, node.x - node.parent.x)
      : -Math.PI / 2;
    const arc = node.parent ? CHILD_ARC : TWO_PI;
    const childSize = Math.max(...children.map(c => c.size));
    const radius = ringRadius(node.size, childSize, children.length, arc);

    children.forEach((child, i) => {
      let angle;
      if (children.length === 1) angle = outward;
      else if (arc >= TWO_PI - 1e-6) angle = outward + i * (TWO_PI / children.length);
      else angle = outward + arc * (i / (children.length - 1) - 0.5);
      child.rest = radius;
      child.x = node.x + radius * Math.cos(angle);
      child.y = node.y + radius * Math.sin(angle);
      queue.push(child);
    });
  }
}

/* Релаксация всего графа разом (а не каждого дерева по отдельности): два
   независимых кластера могут стоять на карте рядом, и расталкивать их надо
   так же, как соседей внутри одного кластера. Корни закреплены — их место
   задано в JSON вручную и двигать его нельзя.

   Силы за проход:
     1) пружина к родителю — слабая, задаёт "хочу быть на таком расстоянии";
     2) пружина вдоль союза — ещё слабее, подтягивает союзников друг к другу;
     3) расталкивание всех со всеми.
   Последние проходы идут БЕЗ пружин: пружина, отработав последней, могла бы
   снова втянуть узел в соседа, и итог был бы с наездами. */
function relax(nodes) {
  const move = (node, dx, dy) => {
    if (node.pinned) return;
    node.x += dx; node.y += dy;
  };

  const separate = () => {
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const need = minDistance(a, b);
        let dx = b.x - a.x, dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) { dx = Math.random() - 0.5; dy = Math.random() - 0.5; d = Math.hypot(dx, dy); }
        if (d >= need) continue;
        // Закреплённый корень не двигается, значит всю коррекцию забирает
        // второй узел пары — иначе они так и остались бы внахлёст.
        const share = (a.pinned || b.pinned) ? 1 : 0.5;
        const push = (need - d) * share * RELAX_RATE;
        move(a, -dx / d * push, -dy / d * push);
        move(b, dx / d * push, dy / d * push);
      }
    }
  };

  for (let pass = 0; pass < RELAX_PASSES; pass++) {
    nodes.forEach(node => {
      if (!node.parent) return;
      const dx = node.x - node.parent.x, dy = node.y - node.parent.y;
      const d = Math.hypot(dx, dy) || 1e-6;
      const pull = (d - node.rest) * PARENT_PULL;
      move(node, -dx / d * pull, -dy / d * pull);
    });
    nodes.forEach(node => {
      node.links.forEach(other => {
        const rest = minDistance(node, other);
        const dx = node.x - other.x, dy = node.y - other.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d <= rest) return; // ближе не тянем, этим занимается расталкивание
        const pull = (d - rest) * LINK_PULL;
        move(node, -dx / d * pull, -dy / d * pull);
      });
    });
    separate();
  }
  for (let pass = 0; pass < RELAX_SETTLE; pass++) separate();
}

/* Считает позиции (пишет x/y прямо в узлы) и возвращает список нитей.
   kind: 'parent' — сплошная нить к родителю, 'link' — пунктирная к союзнику
   (в css/styles.css это .map-thread и .map-thread.link). */
export function layoutNodes(byId) {
  const nodes = [...byId.values()].filter(n => n.onMap);
  placeTree(nodes.filter(n => !n.parent));
  relax(nodes);

  const threads = [];
  nodes.forEach(node => {
    if (node.parent && node.parent.onMap) {
      threads.push({kind: 'parent', x1: node.parent.x, y1: node.parent.y, x2: node.x, y2: node.y});
    }
  });
  // Союз — связь двусторонняя, рисовать её надо один раз на пару.
  const drawn = new Set();
  nodes.forEach(node => {
    node.links.forEach(other => {
      if (!other.onMap) return; // союзник живёт вне карты — нить рисовать не к чему
      const key = node.id < other.id ? `${node.id}|${other.id}` : `${other.id}|${node.id}`;
      if (drawn.has(key)) return;
      drawn.add(key);
      threads.push({kind: 'link', x1: node.x, y1: node.y, x2: other.x, y2: other.y});
    });
  });
  return threads;
}

/* Союзники узла среди детей ОДНОГО И ТОГО ЖЕ родителя — то, что показывается
   внутри окна сюжета (см. openStory в js/stories.js): там имеет смысл
   показывать связи между персонажами этого сюжета, а не вообще все. */
export function siblingLinks(node) {
  return node.links.filter(other => other.parent === node.parent);
}
