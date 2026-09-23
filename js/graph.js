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

/* Базовый размер точки по её типу. Типов ровно три, и делятся они по тому,
   КТО правит точку, а не по тому, что на ней нарисовано (23.09.2026):
   - world     — мировая точка (world.json), правит владелец группы. Локация,
                 фракция, корабль, сюжет — всё это одна и та же точка, разница
                 только в заполненных полях (см. world.json в CLAUDE.md);
   - character — игровая точка (characters.json), правит игрок-владелец;
   - system    — виртуальный узел системы, его «маркер» на карте это подпись
                 StellarMaps (см. mapHidden ниже).
   Реальный размер узла может оказаться меньше базового, см. CHILD_SHRINK. */
const BASE_SIZE = { world: 8, character: 3, system: 8 };

/* Размеры тех же узлов в режиме "Ноды" (см. layoutGraphView внизу файла) —
   иерархия там намеренно ПЛОЩЕ, чем на карте.

   Почему нельзя просто взять те же размеры: в режиме нод весь граф сжат в
   один компактный кластер, и камера наводится на него целиком. Масштаб
   меняется у ВСЕГО разом, поэтому одно только приближение не делает мелкие
   узлы крупнее ОТНОСИТЕЛЬНО крупных — персонаж так и остаётся в 4 раза
   мельче локации и на телефоне выходит меньше пальца. Значение имеет только
   соотношение "размер узла к размеру кластера", и поднимать надо именно его.

   8 / 8 / 4.5 при CHILD_SHRINK 0.8 даёт цепочку Феном(8) -> сюжет(6.4) ->
   персонаж(4.5): иерархия на глаз всё ещё читается (каждый следующий
   заметно мельче), но персонаж уже полноценная кликабельная мишень, а не
   точка. На карте те же узлы остаются прежними (8 / 4.4 / 2) — там мелкий
   персонаж правильный, он спутник на орбите, а не самостоятельное место. */
const GRAPH_VIEW_SIZE = { world: 8, character: 4.5, system: 8 };
const GRAPH_VIEW_SHRINK = 0.8;

/* "wide": true у мировой точки (world.json) — маркер шире своей высоты,
   чтобы внутрь аккуратно лёг широкий арт (Кольцо Авалона). Ширина нужна
   РАСКЛАДКЕ, а не только отрисовке: маркер той же высоты, но в 1.6 раза шире,
   иначе налезает на соседей (15.09.2026). Поэтому число живёт здесь, а
   js/map.js берёт его отсюда же — один источник правды.
   ⚠️ Пропорции нельзя выводить из самой картинки: раскладка считается один раз
   до того, как арт загрузился, и зависеть от сети она не должна. */
export const WIDE_ASPECT = 1.6;

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

/* Тот же просвет, но для раскладки режима "Ноды" — там он заметно теснее.

   ⚠️ Просвет — это НЕ косметика, а главная ручка "насколько крупными выйдут
   маркеры на экране". Увеличить сами размеры узлов бесполезно: из них же
   считаются и радиусы колец, так что кластер растёт ровно во столько же раз,
   камера отъезжает — и на экране ничего не меняется. Значение имеет только
   отношение "размер узла к размеру кластера", а поднимает его именно
   ужимание просветов. */
const GRAPH_VIEW_GAP = 0.55;

/* Текущий просвет: подменяется на время расчёта раскладки нод (см.
   layoutGraphView). Вынесен в переменную по той же причине, что и подмена
   size там же, — minDistance/ringRadius читают его напрямую, и протаскивать
   "каким просветом мерить" параметром через пять функций, общих для обеих
   раскладок, было бы хуже. */
let gap = GAP;

/* Дети корня расходятся по полному кругу, дети любого узла глубже — по
   дуге, развёрнутой ПРОЧЬ от деда. Иначе поддерево растёт обратно внутрь
   кольца, прямо на своих же соседей. */
const CHILD_ARC = Math.PI * 1.7;

const RELAX_PASSES = 220;   // проходов релаксации с пружинами
const RELAX_SETTLE = 40;    // добивающих проходов только на расталкивание
const RELAX_RATE = 0.5;     // доля коррекции за проход (меньше 1 — чтобы узлы не скакали)
const PARENT_PULL = 0.05;   // насколько родитель тянет ребёнка к нужному расстоянию
const LINK_PULL = 0.05;     // насколько союзники притягиваются друг к другу
/* Союзники из РАЗНЫХ колец (у них разные родители) в режиме нод тянутся
   впятеро слабее: сильная пружина вытаскивала персонажа из кольца его сюжета к
   чужому кластеру. Смотреть друг на друга их разворачивает orientRing, а не
   пружина. */
const CROSS_LINK_PULL = 0.01;
/* Нить не должна проходить под чужим маркером: просвет между краем маркера и
   линией (см. clearThreads в relax). */
const LINE_CLEARANCE_SHARE = 0.5; // доля от gap

/* Союз на КАРТЕ дальше этого расстояния (в единицах карты, между стартовыми
   позициями узлов) — «далёкий»: пружина его не тянет, нить на карте не
   рисуется (класс .far, показывается только в режиме нод). Раньше союзники из
   сюжетов на разных концах карты стягивались друг к другу из своих колец, и
   пунктир шёл через полкарты. 40 — половина кадра, на который камера наводится
   при тапе по маркеру (FOCUS_WIDTH в map.js): ближняя связь целиком видна рядом. */
export const MAP_LINK_REACH = 40;

/* Радиус «зоны» маркера для расталкивания: половина его ШИРИНЫ — у широких
   точек она больше половины высоты. Круг с запасом по вертикали, зато
   гарантированно без наездов. */
function radiusOf(node) {
  return node.size * (node.aspect || 1) / 2;
}

// Расстояние между ЦЕНТРАМИ двух узлов, при котором их маркеры не касаются.
function minDistance(a, b) {
  return radiusOf(a) + radiusOf(b) + gap;
}

/* Радиус кольца, на которое сядут `count` детей с радиусом childR вокруг
   родителя с радиусом parentR. Берём больший из двух: не ближе к родителю,
   чем позволяют их размеры, и не теснее друг к другу, чем позволяют свои. */
function ringRadius(parentR, childR, count, arc) {
  const clearance = parentR + childR + gap;
  if (count <= 1) return clearance;
  const step = arc >= TWO_PI - 1e-6 ? arc / count : arc / (count - 1);
  const spacing = 2 * childR + gap;
  const needed = spacing / (2 * Math.sin(Math.min(step, Math.PI) / 2));
  return Math.max(clearance, needed);
}

function subtreeNodes(node, out = []) {
  out.push(node);
  node.children.forEach(child => { if (child.onMap) subtreeNodes(child, out); });
  return out;
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
        size: BASE_SIZE[kind] || BASE_SIZE.world,
        // Второй размер того же узла — для режима "Ноды" (см. GRAPH_VIEW_SIZE
        // выше и layoutGraphView внизу). Считается ровно так же, как size,
        // просто по своей таблице и со своим CHILD_SHRINK.
        graphSize: GRAPH_VIEW_SIZE[kind] || GRAPH_VIEW_SIZE.world,
        aspect: (kind === 'world' && item.wide) ? WIDE_ASPECT : 1,
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
        /* mapHidden — узел есть в режиме «Ноды», но НЕ на карте галактики
           (17.09.2026): сама система (kind 'system' — её «маркер» на карте это
           подпись StellarMaps) и всё, что внутри неё. Считается ниже. */
        mapHidden: kind === 'system',
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
      child.graphSize = Math.min(child.graphSize, node.graphSize * GRAPH_VIEW_SHRINK);
      // Родителя на карте нет — значит и ребёнку не вокруг чего вставать:
      // всё поддерево уходит с карты целиком. Иначе дети "постоянного"
      // сюжета остались бы висеть без якоря в случайном месте.
      if (!node.onMap) child.onMap = false;
      // Внутри системы — на карте галактики не рисуется (вместо маркера значок у
      // подписи системы, см. renderSystemBadges в map.js), в нодах — как обычно.
      if (node.mapHidden) child.mapHidden = true;
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
  roots.forEach(root => {
    root.x = Number(root.data.x) || 0;
    root.y = Number(root.data.y) || 0;
  });
  placeChildren(roots);
}

/* То же самое, но БЕЗ расстановки самих корней — они уже стоят там, где их
   поставил вызывающий. Вынесено из placeTree, потому что у режима "Ноды"
   корни берутся не из x/y в JSON, а пакуются вокруг центра (см. packRoots и
   layoutGraphView внизу файла); всё остальное — кольца детей, дуги, порядок
   союзников — у обеих раскладок общее и должно оставаться общим. */
/* orient — развернуть кольца так, чтобы узлы, связанные с ДРУГИМИ ветками
   графа, смотрели в их сторону (orientRing ниже). Только для режима нод: на
   карте далёкие связи не рисуются вовсе, а ближние и так рядом. */
function placeChildren(roots, orient = false) {
  const queue = roots.slice();
  const placed = new Set(roots);

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
    const childR = Math.max(...children.map(radiusOf));
    const radius = ringRadius(radiusOf(node), childR, children.length, arc);

    const angles = (orient && orientRing(node, children, outward, arc, placed))
      || children.map((_, i) => ringAngle(i, children.length, outward, arc));
    children.forEach((child, i) => {
      child.rest = radius;
      child.x = node.x + radius * Math.cos(angles[i]);
      child.y = node.y + radius * Math.sin(angles[i]);
      placed.add(child);
      queue.push(child);
    });
  }
}

// Угол i-го из count детей: весь круг начиная с start либо дуга с серединой на start.
function ringAngle(i, count, start, arc) {
  if (count === 1) return start;
  if (arc >= TWO_PI - 1e-6) return start + i * (TWO_PI / count);
  return start + arc * (i / (count - 1) - 0.5);
}

/* Порядок детей на кольце с учётом связей, уходящих в ДРУГИЕ ветки графа.

   Раньше кольцо всегда начиналось сверху, и персонаж, связанный с чужим
   кластером, мог оказаться на дальней от него стороне — нить шла через весь
   свой кластер под чужими маркерами (Мина ↔ Райден, 15.09.2026). Теперь для
   каждого ребёнка считается направление на его внешних союзников (и на
   союзников всего его поддерева: сюжет с таким персонажем тоже поворачивается
   к нужной стороне), и из вариантов «повернуть кольцо / отразить / сдвинуть
   по дуге» выбирается тот, где дети смотрят туда, куда уходят их нити, а
   союзники-соседи по кольцу остаются рядом.

   Союзник, которого ещё не расставили (обход идёт сверху вниз), берётся по
   ближайшему уже стоящему предку — корню его кластера или его сюжету.
   Нет внешних связей — null, кольцо встаёт как раньше. */
function orientRing(node, children, outward, arc, placed) {
  const n = children.length;
  const inside = new Set(subtreeNodes(node));
  const anchorOf = (other) => {
    let cur = other;
    while (cur && !placed.has(cur)) cur = cur.parent;
    return cur;
  };
  const prefs = children.map(child => {
    let vx = 0, vy = 0;
    subtreeNodes(child).forEach(m => m.links.forEach(other => {
      if (!other.onMap || inside.has(other)) return;
      const anchor = anchorOf(other);
      if (!anchor) return;
      const dx = anchor.x - node.x, dy = anchor.y - node.y, d = Math.hypot(dx, dy);
      if (d < 1e-6) return;
      vx += dx / d; vy += dy / d;
    }));
    const weight = Math.hypot(vx, vy);
    return weight > 1e-6 ? {angle: Math.atan2(vy, vx), weight} : null;
  });
  if (!prefs.some(Boolean)) return null;

  const index = new Map(children.map((c, i) => [c, i]));
  const siblingPairs = [];
  children.forEach((c, i) => c.links.forEach(other => {
    const j = index.get(other);
    if (j > i) siblingPairs.push([i, j]);
  }));

  const full = arc >= TWO_PI - 1e-6;
  const candidates = [];
  [1, -1].forEach(dir => {
    if (full) {
      // Поворот всего кольца мелким шагом (и зеркально): порядок соседей не рвётся.
      const steps = Math.max(16, n * 4);
      for (let k = 0; k < steps; k++) {
        const start = outward + k * TWO_PI / steps;
        candidates.push(children.map((_, i) => start + dir * i * (TWO_PI / n)));
      }
    } else {
      // Дуга: циклический сдвиг порядка (и зеркально). Разрыв группы союзников
      // на концах дуги штрафуется ниже.
      for (let s = 0; s < n; s++) {
        candidates.push(children.map((_, i) => {
          const slot = (i + s) % n;
          return ringAngle(dir > 0 ? slot : n - 1 - slot, n, outward, arc);
        }));
      }
    }
  });

  let best = null;
  candidates.forEach(angles => {
    let cost = 0;
    prefs.forEach((p, i) => { if (p) cost += p.weight * (1 - Math.cos(angles[i] - p.angle)); });
    siblingPairs.forEach(([i, j]) => { cost += 0.5 * (1 - Math.cos(angles[i] - angles[j])); });
    // Строго меньше: при равенстве остаётся первый вариант — прежняя раскладка.
    if (!best || cost < best.cost - 1e-9) best = {cost, angles};
  });
  return best.angles;
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
   снова втянуть узел в соседа, и итог был бы с наездами.

   threads — нити, из-под которых выталкиваются чужие маркеры (clearThreads);
   linkPull(a, b) — сила пружины союза для пары (0 — не тянуть). */
function relax(nodes, threads, linkPull) {
  const move = (node, dx, dy) => {
    if (node.pinned) return;
    node.x += dx; node.y += dy;
  };

  /* Маркер, лежащий на чужой нити, отодвигается от неё поперёк, а нить (её
     незакреплённые концы) — от него: половина на половину, закреплённое не
     двигается. Проекция за концами отрезка не считается — там наезд на сам
     конец, это дело separate(). */
  const clearance = gap * LINE_CLEARANCE_SHARE;
  const clearThreads = () => {
    threads.forEach(({a, b}) => {
      const vx = b.x - a.x, vy = b.y - a.y;
      const len2 = vx * vx + vy * vy;
      if (len2 < 1e-9) return;
      nodes.forEach(c => {
        if (c === a || c === b) return;
        const s = ((c.x - a.x) * vx + (c.y - a.y) * vy) / len2;
        if (s <= 0 || s >= 1) return;
        let dx = c.x - (a.x + s * vx), dy = c.y - (a.y + s * vy);
        let d = Math.hypot(dx, dy);
        const need = radiusOf(c) + clearance;
        if (d >= need) return;
        if (d < 1e-6) { dx = -vy; dy = vx; d = Math.hypot(dx, dy); }
        const ux = dx / d, uy = dy / d;
        const lineMovable = !(a.pinned && b.pinned);
        const cShare = c.pinned ? 0 : (lineMovable ? 0.5 : 1);
        const push = (need - d) * RELAX_RATE;
        move(c, ux * push * cShare, uy * push * cShare);
        if (!lineMovable) return;
        const lineShare = 1 - cShare;
        // Конец ближе к маркеру сдвигается сильнее — так нить поворачивается, а не едет целиком.
        move(a, -ux * push * lineShare * (1 - s), -uy * push * lineShare * (1 - s));
        move(b, -ux * push * lineShare * s, -uy * push * lineShare * s);
      });
    });
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
        const strength = linkPull(node, other);
        if (!strength) return;
        const rest = minDistance(node, other);
        const dx = node.x - other.x, dy = node.y - other.y;
        const d = Math.hypot(dx, dy) || 1e-6;
        if (d <= rest) return; // ближе не тянем, этим занимается расталкивание
        const pull = (d - rest) * strength;
        move(node, -dx / d * pull, -dy / d * pull);
      });
    });
    clearThreads();
    separate();
  }
  // Расталкивание — последним: нить из-под маркера можно не дотолкать, а вот
  // маркеры друг на друга налезать не должны никогда.
  for (let pass = 0; pass < RELAX_SETTLE; pass++) { clearThreads(); separate(); }
}

/* Список нитей: kind 'parent' — сплошная нить к родителю, 'link' —
   пунктирная к союзнику (в css/styles.css это .map-thread и
   .map-thread.link).

   ⚠️ Нить хранит ССЫЛКИ на оба своих узла (a/b), а не их координаты. Раньше
   координаты копировались сюда один раз и застывали — этого хватало, пока
   раскладка была ровно одна и считалась один раз при загрузке. С появлением
   режима "Ноды" (15.09.2026) у каждого узла ДВЕ позиции, и между ними ещё и
   анимированный перелёт — нить обязана следовать за узлами в каждом кадре, а
   не помнить, где они были когда-то. Набор рёбер при этом у обеих раскладок
   ОДИН И ТОТ ЖЕ (связи-то не меняются, меняются только координаты), поэтому
   считается он тоже один раз. */
const linkKey = (a, b) => a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;

/* far — ключи далёких на карте союзов (см. MAP_LINK_REACH): у таких нитей
   far = true, map.js рисует их только в режиме нод. */
function buildThreads(nodes, far = new Set()) {
  const threads = [];
  nodes.forEach(node => {
    if (node.parent && node.parent.onMap) {
      threads.push({kind: 'parent', a: node.parent, b: node});
    }
  });
  // Союз — связь двусторонняя, рисовать её надо один раз на пару.
  const drawn = new Set();
  nodes.forEach(node => {
    node.links.forEach(other => {
      if (!other.onMap) return; // союзник живёт вне карты — нить рисовать не к чему
      const key = linkKey(node, other);
      if (drawn.has(key)) return;
      drawn.add(key);
      threads.push({kind: 'link', a: node, b: other, far: far.has(key)});
    });
  });
  return threads;
}

/* Основная раскладка — "как на карте": корни стоят на своих координатах из
   JSON, дети кольцами вокруг них. Пишет x/y прямо в узлы и возвращает нити. */
/* ⚠️ Узлы mapHidden (система и всё внутри неё) в карточной раскладке не
   участвуют: места на карте не занимают и соседей не расталкивают. Их «позиция
   на карте» — звезда системы: оттуда они вылетают при переходе в ноды и туда
   возвращаются. Возвращаются ВСЕ нити, у нитей к таким узлам nodesOnly = true —
   map.js рисует их только в режиме нод, как далёкие союзы. */
export function layoutNodes(byId) {
  const onMap = [...byId.values()].filter(n => n.onMap);
  const nodes = onMap.filter(n => !n.mapHidden);
  placeTree(nodes.filter(n => !n.parent));
  // Далёкость — по стартовой раскладке, ДО пружин: иначе пружина сама и
  // стянула бы союзников в «ближних».
  const far = new Set();
  nodes.forEach(node => node.links.forEach(other => {
    if (other.onMap && !other.mapHidden && Math.hypot(node.x - other.x, node.y - other.y) > MAP_LINK_REACH) far.add(linkKey(node, other));
  }));
  relax(nodes, buildThreads(nodes, far).filter(t => !t.far && !t.a.mapHidden && !t.b.mapHidden),
    (a, b) => far.has(linkKey(a, b)) || a.mapHidden || b.mapHidden ? 0 : LINK_PULL);
  onMap.filter(n => n.mapHidden).forEach(n => {
    let anchor = n;
    while (anchor.parent && anchor.kind !== 'system') anchor = anchor.parent;
    n.x = Number(anchor.data.x) || 0;
    n.y = Number(anchor.data.y) || 0;
  });
  const threads = buildThreads(onMap, far);
  threads.forEach(t => { t.nodesOnly = t.a.mapHidden || t.b.mapHidden; });
  return threads;
}

/* ============================================================
   Раскладка режима "Ноды" (15.09.2026)

   Вторая, полностью независимая раскладка ТЕХ ЖЕ узлов: граф собирается в
   один компактный кластер вокруг заданной точки, вместо того чтобы
   растягиваться по географии карты. Смысл — показать СТРУКТУРУ связей,
   которую на самой карте разглядеть нельзя: корни там разбросаны по
   координатам из JSON за сотни единиц друг от друга, а персонажи жмутся
   вокруг них точками по 2 единицы.

   Считается один раз при загрузке, рядом с основной, и дальше заморожена —
   ровно как и та (см. предупреждение про "это НЕ физика в кадре" в шапке
   файла). Переключение между режимами — это интерполяция между двумя
   готовыми наборами координат, а не пересчёт.
   ============================================================ */

// Просвет между КЛАСТЕРАМИ (корень со всем поддеревом), а не между отдельными
// маркерами — для них есть общий GAP.
const GRAPH_VIEW_ROOT_GAP = 1.4;
// Шаг спирали, по которой ищется свободное место под очередной кластер.
// Мельче — плотнее упаковка и дольше поиск; 2 единицы это заметно меньше
// самого мелкого кластера, то есть точность упаковки ограничена не им.
const GRAPH_VIEW_SEED_STEP = 2;
const GRAPH_VIEW_SEED_TRIES = 5000;
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

/* Радиус круга, в который целиком помещается узел со всем своим поддеревом.
   Дети стоят на кольце радиуса ringRadius, и каждый из них торчит наружу ещё
   на свой собственный такой же радиус — отсюда и рекурсия. Оценка сверху
   (берём самого "толстого" ребёнка для всех), и это именно то, что нужно:
   лучше оставить лишний просвет, чем получить наложение двух сюжетов. */
function subtreeRadius(node) {
  const children = node.children.filter(c => c.onMap);
  if (!children.length) return radiusOf(node);
  const childR = Math.max(...children.map(radiusOf));
  const arc = node.parent ? CHILD_ARC : TWO_PI;
  return ringRadius(radiusOf(node), childR, children.length, arc)
       + Math.max(...children.map(subtreeRadius));
}

/* Упаковка корней вокруг (0,0): самый крупный кластер в центр, каждый
   следующий — в первое свободное место на спирали Фибоначчи, где он ещё ни с
   кем не пересекается.

   Почему не просто кольцо и не "посеять и дать релаксации расталкивать":
   - кольцо оставляет дырку посередине (при 8 корнях это выглядит бубликом,
     а не созвездием) и растягивается по самому крупному кластеру;
   - релаксация расталкивает ОТДЕЛЬНЫЕ маркеры, а не кластеры целиком: два
     наложившихся сюжета она не разведёт, а перемешает — персонажи одного
     окажутся между персонажами другого. Поэтому корни обязаны встать без
     пересечений СРАЗУ, до релаксации, а её дело — только подчистить мелочь
     внутри кластеров.
   Спираль Фибоначчи равномерно заполняет диск (а не кольцо), а проверка на
   пересечение по радиусам поддеревьев делает упаковку плотной: мелкий
   кластер сядет в первую же щель, а не займёт место размером с самый
   крупный. */
/* aspect — ширина/высота экрана: спираль растягивается под ФОРМУ экрана, а не
   остаётся круглой.

   Зачем (15.09.2026, после замера на телефоне): кадр всегда квадратный
   (preserveAspectRatio="xMidYMid meet"), поэтому на вертикальном телефоне
   камеру ограничивает ШИРИНА кластера, а по высоте 45% экрана простаивало
   впустую. Круглое пятно на вертикальном экране — это пустые поля сверху и
   снизу и, как следствие, мелкие маркеры: чтобы влезть по ширине, камера
   отъезжает дальше, чем нужно. Вытянув пятно по форме экрана, мы сужаем
   именно ту сторону, которая упирается, — и всё на экране становится крупнее
   без единого изменения самих размеров узлов.

   ⚠️ Проверка на пересечение остаётся КРУГОВОЙ (radius + radius) — растянута
   только траектория поиска, то есть куда мы пробуем поставить кластер, а не
   чем меряем "не налезли ли". Поэтому гарантия "корни не пересекаются"
   сохраняется при любом aspect.

   ⚠️ Считается один раз при загрузке, под ТОГДАШНИЙ экран: повернув телефон,
   игрок получит раскладку, подогнанную под прежнюю ориентацию. Кадр при этом
   всё равно пересчитается (graphViewWidth в map.js) и всё останется видно —
   просто уже не так плотно. Пересчитывать всю раскладку на поворот не стали:
   узлы бы прыгнули на новые места, а это дороже потерянной плотности. */
/* ⚠️ Кластеры, между которыми есть союзы (15.09.2026), ставятся ВПЛОТНУЮ друг к
   другу: для такого корня перебирается PACK_CANDIDATES свободных мест, и из
   них берётся то, где он ближе к уже поставленным союзным кластерам (с
   поправкой на удалённость от центра — пятно не должно расползаться). Без
   союзов — как раньше, первое свободное место. */
const PACK_CANDIDATES = 60;
function packRoots(roots, aspect) {
  const safeAspect = Math.min(2, Math.max(0.5, aspect || 1));
  const kx = Math.sqrt(safeAspect), ky = 1 / Math.sqrt(safeAspect);

  const rootOf = (node) => { let cur = node; while (cur.parent) cur = cur.parent; return cur; };
  const linkedRoots = new Map(roots.map(root => [root, new Map()]));
  roots.forEach(root => subtreeNodes(root).forEach(m => m.links.forEach(other => {
    if (!other.onMap) return;
    const otherRoot = rootOf(other);
    if (otherRoot === root || !linkedRoots.has(otherRoot)) return;
    const counts = linkedRoots.get(root);
    counts.set(otherRoot, (counts.get(otherRoot) || 0) + 1);
  })));

  const placed = [];
  roots
    .map(root => ({root, r: subtreeRadius(root)}))
    .sort((a, b) => b.r - a.r)
    .forEach(({root, r}) => {
      const links = linkedRoots.get(root);
      const partners = placed.filter(p => links.has(p.root));
      let best = null, found = 0;
      for (let t = 0; t < GRAPH_VIEW_SEED_TRIES; t++) {
        const angle = t * GOLDEN_ANGLE;
        const d = GRAPH_VIEW_SEED_STEP * Math.sqrt(t);
        const x = d * Math.cos(angle) * kx;
        const y = d * Math.sin(angle) * ky;
        if (!placed.every(p => Math.hypot(p.x - x, p.y - y) >= p.r + r + GRAPH_VIEW_ROOT_GAP)) continue;
        if (!partners.length) { best = {x, y}; break; }
        const cost = d + partners.reduce((sum, p) =>
          sum + links.get(p.root) * (Math.hypot(p.x - x, p.y - y) - p.r - r), 0);
        if (!best || cost < best.cost) best = {x, y, cost};
        if (++found >= PACK_CANDIDATES) break;
      }
      if (!best) best = {x: 0, y: 0};
      root.x = best.x; root.y = best.y;
      placed.push({root, x: best.x, y: best.y, r});
    });
}

/* Считает компактную раскладку и пишет её в x/y узлов (вызывающий обязан
   сам сохранить/восстановить то, что там было до этого — см. map.js).
   Возвращает габариты получившегося кластера: по ним камера наводится на
   него целиком. */
export function layoutGraphView(byId, cx, cy, aspect) {
  const nodes = [...byId.values()].filter(n => n.onMap);
  if (!nodes.length) return {width: 0, height: 0};

  /* Вся раскладка (кольца, просветы, расталкивание) считается в размерах
     РЕЖИМА НОД — они площе карточных, см. GRAPH_VIEW_SIZE. Подменяем size на
     время расчёта вместо того, чтобы протаскивать "каким полем мерить"
     параметром через minDistance/ringRadius/subtreeRadius/placeChildren/
     relax: полей-размеров ровно два, а функций, которые их читают, — пять,
     и все они общие для обеих раскладок. */
  const mapSizes = nodes.map(n => n.size);
  nodes.forEach(n => { n.size = n.graphSize; });
  gap = GRAPH_VIEW_GAP;

  const roots = nodes.filter(n => !n.parent);
  packRoots(roots, aspect);
  placeChildren(roots, true);
  // Корни остаются pinned (упаковка уже развела их без пересечений) — релаксация
  // тут работает только внутри кластеров, доводя кольца детей. Здесь рисуются
  // ВСЕ союзы, в том числе далёкие на карте, — их нити и расчищаем.
  relax(nodes, buildThreads(nodes), (a, b) => a.parent === b.parent ? LINK_PULL : CROSS_LINK_PULL);

  // Габариты — с учётом самих маркеров, а не только их центров: иначе крайний
  // узел наполовину вылезал бы за кадр, на который наведётся камера.
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  nodes.forEach(n => {
    const hw = radiusOf(n), hh = n.size / 2;
    x0 = Math.min(x0, n.x - hw); x1 = Math.max(x1, n.x + hw);
    y0 = Math.min(y0, n.y - hh); y1 = Math.max(y1, n.y + hh);
  });
  const dx = cx - (x0 + x1) / 2, dy = cy - (y0 + y1) / 2;
  nodes.forEach(n => { n.x += dx; n.y += dy; });

  nodes.forEach((n, i) => { n.size = mapSizes[i]; });
  gap = GAP;
  return {width: x1 - x0, height: y1 - y0};
}

/* Союзники узла среди детей ОДНОГО И ТОГО ЖЕ родителя — то, что показывается
   внутри окна сюжета (см. openStory в js/stories.js): там имеет смысл
   показывать связи между персонажами этого сюжета, а не вообще все. */
export function siblingLinks(node) {
  return node.links.filter(other => other.parent === node.parent);
}
