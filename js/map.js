/* ============================================================
   Загрузка и инициализация карты галактики
   ============================================================ */
import { createPanZoom } from './panzoom.js?v=120';
import { openModal, closeModal, escapeHtml } from './modal.js?v=120';
import { openSystem, slugify, closeSystem, isSystemOpen, getOpenSystem, setSystemDecorator, setSystemTabs, setSystemPickHandler, trySystemPick } from './system-view.js?v=120';
import { openSubmap, setPhenomChildren, setSubmapCharacters, closePhenom, isPhenomOpen, setSubmapPickHandler } from './phenom.js?v=120';
import { initEditor, canEditNodes, showNodeEditor, applyPendingEdits, showPendingToast } from './editor.js?v=120';
import { openStory, setCharacterNavigator, closeStory, getOpenStory, setStoryParentButton } from './stories.js?v=120';
import { openCharacter, getOpenCharacter, updateStoryButton } from './characters.js?v=120';
import { buildNodes, layoutNodes, layoutGraphView, siblingLinks, LOCATION_ASPECT } from './graph.js?v=120';

const SVG_PATH = 'map.svg';

/* Точки на карте (маркеры фракций/персонажей и т.п.) больше не зашиты в коде —
   они грузятся из markers.json, лежащего рядом с этим index.html. См. renderMarkers() ниже. */

let calibMode = false;
const calibPanel = document.getElementById('calibPanel');

/* Выбор места тапом для редактора (js/editor.js). Пока задан — следующий тап
   по карте (или по маркеру) отдаёт координаты сюда, а не открывает окно. */
let mapPickHandler = null;
function finishMapPick(p) {
  const handler = mapPickHandler;
  mapPickHandler = null;
  handler(p);
}

(async function(){
  const container = document.getElementById('svgWidget');
  let svgText;
  try {
    const resp = await fetch(SVG_PATH, {cache:'no-cache'});
    svgText = await resp.text();
  } catch (err) {
    container.innerHTML = '<div style="color:#f88;padding:12px">Ошибка загрузки SVG: ' + err.message + '</div>';
    throw err;
  }

  container.insertAdjacentHTML('afterbegin', svgText);
  const svg = container.querySelector('svg');
  if (!svg) {
    container.innerHTML = '<div style="color:#f88;padding:12px">Файл не содержит тег &lt;svg&gt;.</div>';
    return;
  }
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Карта галактики');

  /* Режим "Графика" (15.09.2026) — та же карта, что и "Карта", только со
     скрытой политической раскраской StellarMaps (заливка территорий фракций,
     их светящийся контур, пунктирные линии секторов внутри, названия фракций
     крупным шрифтом) — оставлены звёздный/туманный фон, гиперлейны (тонкие
     белые линии между системами) и обычные названия систем. Идея игрока: тот
     же экспорт карты, но "как декоративная картинка", без политической
     раскраски поверх.

     Помечаем элементы ОДИН РАЗ здесь, классом `.map-political` — дальше это
     просто display:none по классу в CSS при переключении режима (см.
     `.graphics-mode` в css/styles.css), как и `.labels-minimal`/`.panning`.
     Экспорт StellarMaps каждый раз даёт РАЗНЫЙ набор фракций/территорий —
     метить нужно по СТРУКТУРЕ SVG, а не по конкретным id/цветам.

     Как отличить "территорию" от прочей графики — по факту проверено на
     реальном экспорте (см. историю сессии): у каждой территории в файле
     ровно ОДИН И ТОТ ЖЕ набор из 2-3 <path>, повторяющий её цвет:
       - заливка территории — `fill="<цвет>"`, filter пуст или отсутствует;
       - светящийся контур — тот же цвет в `stroke`, `fill="none"`,
         `filter="url(#fade)"` (те самые 82 blur-фильтра, грабли №18);
       - пунктирные линии секторов ВНУТРИ территории — `stroke-dasharray="3 3"`.
     Гиперлейны (тонкая белая линия, `filter=""`, но `fill="none"` — сплошной
     штрих без цвета) под эти условия не попадают и остаются нетронутыми, как
     и подписи систем (Tahoma) — эта функция трогает только `<path>`.

     ⚠️ Проверено на реальных данных: ровно 29 подписей шрифтом Impact
     (названия фракций) и ровно 29 территорий с этим набором path — числа
     совпали один в один, это и есть подтверждение, что признак верный, а не
     захватывает что-то postороннее. Точечные цветные иконки-"метки
     принадлежности" поверх отдельных звёзд (мелкие `<use>` с цветом фракции)
     этой функцией НЕ трогаются — игрок просил убрать границы и названия,
     про эти точки речи не было; если понадобится — расширить набор классов
     тут же. */
  function classifyPoliticalOverlay() {
    svg.querySelectorAll('path').forEach(p => {
      const filter = p.getAttribute('filter');
      const fill = p.getAttribute('fill');
      const isBorderGlow = (filter || '').includes('fade');
      const isSectorDash = p.getAttribute('stroke-dasharray') === '3 3';
      const isSolidFill = (filter === '' || filter === null)
        && fill && fill !== 'none' && fill !== 'rgba(0,0,0,0.5)';
      if (isBorderGlow || isSectorDash || isSolidFill) p.classList.add('map-political');
      // Заливка территории (5% цвета) и размытое свечение границы — то, что
      // запекается в картинки (см. buildPoliticalBake ниже). Признак тот же,
      // что в tools/bake-political.html — менять вместе.
      if (isBorderGlow || p.getAttribute('fill-opacity') === '0.05') p.classList.add('map-political-baked');
    });
  }
  classifyPoliticalOverlay();

  const pz = createPanZoom(svg, {
    zoomOutLimit: 1,     // нельзя отдалиться дальше исходного вида карты — П.2
    /* Доля исходной ширины, ближе которой не подпускаем. Было 0.02 — это ~12
       единиц в кадре, при которых одна звезда занимала весь экран: смотреть
       там нечего (растр давно превратился в кашу), а поверхности отрисовки
       раздуваются до десятков тысяч пикселей, см. грабли №17-18.
       0.07 — это ~41 единица, то есть вдвое ближе, чем FOCUS_WIDTH (80), на
       который камера встаёт сама при клике по маркеру. Ближе этого уже
       незачем, а предел ОБЯЗАН оставаться меньше FOCUS_WIDTH — иначе
       focusOn() начнёт упираться в него и перестанет долетать куда надо. */
    zoomInLimit: 0.07,
    boundsPad: 0.2,      // запас побольше, чтобы можно было докрутить камеру до самых крайних систем
    onClick: (p) => {
      if (mapPickHandler) { finishMapPick(p); return; }
      if (calibMode) showCalib(p.x, p.y);
    }
  });

  /* Декоративный "космос" для маски — вместо плоской заливки одним цветом.
     Чисто визуальное украшение по краям: это фон, а не игровые данные —
     никаких новых систем тут нет, и ничего на нём не кликабельно (в отличие
     от настоящих точек в markers.json).

     Звёзды — тайлящийся SVG-паттерн (мелкий тайл, повтор незаметен, т.к.
     сами точки маленькие и однородные). Туман — НАОБОРОТ, без тайлинга:
     несколько (см. NEBULA_COLORS) больших уникальных мягких пятен разных
     цветов, раскиданных по всей реально видимой области — тайл с туманом
     выглядел как повторяющиеся кляксы. Каждое пятно — круг, залитый СВОИМ
     радиальным градиентом (от цвета в центре к прозрачному по краю); почему
     именно так, а не через feGaussianBlur и не одним общим градиентом на всю
     маску — подробно расписано ниже, у самого кода пятен. Все пятна лежат в
     одной group с clip-path по прямоугольникам маски, чтобы не наезжать на
     настоящую карту. */
  function buildCosmosDecoration(svgEl, frames, core) {
    const NS = 'http://www.w3.org/2000/svg';
    let defs = svgEl.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(NS, 'defs');
      svgEl.insertBefore(defs, svgEl.firstChild);
    }

    // --- звёзды: небольшой тайлящийся паттерн ---
    const TILE = 90;
    const starPattern = document.createElementNS(NS, 'pattern');
    starPattern.setAttribute('id', 'cosmosStars');
    starPattern.setAttribute('width', TILE);
    starPattern.setAttribute('height', TILE);
    starPattern.setAttribute('patternUnits', 'userSpaceOnUse');

    const bg = document.createElementNS(NS, 'rect');
    bg.setAttribute('width', TILE);
    bg.setAttribute('height', TILE);
    bg.setAttribute('fill', '#0b0b10'); // тот же тон, что и фон виджета — база под звёздами
    starPattern.appendChild(bg);

    for (let i = 0; i < 26; i++) {
      const star = document.createElementNS(NS, 'circle');
      star.setAttribute('cx', (Math.random() * TILE).toFixed(1));
      star.setAttribute('cy', (Math.random() * TILE).toFixed(1));
      star.setAttribute('r', (0.15 + Math.random() * 0.45).toFixed(2));
      star.setAttribute('fill', Math.random() < 0.15 ? '#bcd4ff' : '#ffffff');
      star.setAttribute('opacity', (0.15 + Math.random() * 0.5).toFixed(2));
      starPattern.appendChild(star);
    }
    defs.appendChild(starPattern);

    // --- туман: несколько крупных мягких пятен, обрезанных по рамкам маски ---
    // clip-path по тем же 4 прямоугольникам, что и сама маска — не даёт пятнам
    // наехать на настоящую карту (ядро), при этом сами пятна рисуются как единые
    // фигуры, а не по кускам на каждую рамку (это и давало швы в версии с градиентом).
    const clipPath = document.createElementNS(NS, 'clipPath');
    clipPath.setAttribute('id', 'cosmosMaskClip');
    frames.forEach(f => {
      const r = document.createElementNS(NS, 'rect');
      r.setAttribute('x', f.x);
      r.setAttribute('y', f.y);
      r.setAttribute('width', f.w);
      r.setAttribute('height', f.h);
      clipPath.appendChild(r);
    });
    defs.appendChild(clipPath);

    /* Мягкость пятна даёт радиальный градиент в самой заливке, а НЕ
       feGaussianBlur, как было раньше.

       Почему убрали фильтр: SVG-фильтр заставляет браузер завести отдельную
       офскрин-поверхность размером с область фильтра. У группы тумана bbox
       ~1100 единиц, при filter region 220% это 2432 единицы — на приближении
       до 80 единиц в кадре выходит ~25 000 пикселей, а на максимальном зуме
       больше миллиона, при типичном лимите текстуры 4096. Поверхность не
       выделяется, и движок рисует вместо неё чёрные прямоугольники поверх
       всей карты (воспроизводилось в Telegram Mini App при зуме).

       Градиент такой проблемы не имеет в принципе: это обычная заливка,
       никаких офскрин-буферов. Это НЕ тот градиент, что давал швы раньше —
       тогда один градиент с userSpaceOnUse растягивался по четырём отдельным
       прямоугольникам маски; здесь у каждого пятна свой градиент в границах
       собственного круга, стыковать нечего. */

    const NEBULA_COLORS = ['#000000', '#050507', '#0d0d12', '#020204']; // оттенки чёрного — едва заметные пятна чуть темнее/светлее фона
    // Область, где реально может оказаться пятно на экране — вокруг ядра карты
    // с запасом (примерно совпадает с тем, докуда можно допанорамить + чуть больше).
    const REACH_PAD = 0.3;
    const reach = {
      x0: core.x - core.w * REACH_PAD,
      x1: core.x + core.w * (1 + REACH_PAD),
      y0: core.y - core.h * REACH_PAD,
      y1: core.y + core.h * (1 + REACH_PAD),
    };
    const reachMinSide = Math.min(reach.x1 - reach.x0, reach.y1 - reach.y0);

    const nebulaGroup = document.createElementNS(NS, 'g');
    nebulaGroup.setAttribute('clip-path', 'url(#cosmosMaskClip)');
    NEBULA_COLORS.forEach((color, i) => {
      // Свой градиент на каждое пятно, в долях собственной рамки круга
      // (objectBoundingBox по умолчанию): в центре — цвет, к краю — прозрачно.
      const gradId = 'cosmosNebula' + i;
      const grad = document.createElementNS(NS, 'radialGradient');
      grad.setAttribute('id', gradId);
      const inner = document.createElementNS(NS, 'stop');
      inner.setAttribute('offset', '0%');
      inner.setAttribute('stop-color', color);
      inner.setAttribute('stop-opacity', (0.12 + Math.random() * 0.06).toFixed(2));
      const outer = document.createElementNS(NS, 'stop');
      outer.setAttribute('offset', '100%');
      outer.setAttribute('stop-color', color);
      outer.setAttribute('stop-opacity', '0');
      grad.appendChild(inner);
      grad.appendChild(outer);
      defs.appendChild(grad);

      const blob = document.createElementNS(NS, 'circle');
      blob.setAttribute('cx', (reach.x0 + Math.random() * (reach.x1 - reach.x0)).toFixed(1));
      blob.setAttribute('cy', (reach.y0 + Math.random() * (reach.y1 - reach.y0)).toFixed(1));
      // "Растянуть раза в 2 больше" по сравнению с первой версией — большие пятна на весь фон.
      blob.setAttribute('r', (reachMinSide * (0.18 + Math.random() * 0.12)).toFixed(1));
      blob.setAttribute('fill', `url(#${gradId})`);
      nebulaGroup.appendChild(blob);
    });

    return { starFill: 'url(#cosmosStars)', nebulaGroup };
  }

  /* --- Маска: скрывает служебные звёзды StellarMaps за пределами "ядра" карты ---
     Добавляется поверх исходного содержимого SVG (оно уже вставлено выше), но ниже
     наших собственных hotspot'ов/точек систем, которые добавляются следующим шагом. */
  (function addOuterMask(){
    const core = pz.getInitialViewBox();

    /* ПОДКРУТИТЬ РУКАМИ: насколько маска заходит ВНУТРЬ от края viewBox,
       в единицах SVG (та же система координат, что и у маркеров/калибровки).

       Для ВСЕХ четырёх сторон одинаково: больше число — маска съедает больше
       с этого края; меньше (вплоть до отрицательного) — открывает больше.
       (Раньше в этом комментарии было написано наоборот — неверно, проверено.)

       Значения привязаны к КОНКРЕТНОМУ экспорту карты: после нового экспорта
       из StellarMaps кадр смещается, и их надо пересчитывать заново. Способ,
       которым они подобраны сейчас, — не на глаз: берём координаты подписей,
       которые должны/не должны быть видны, и ставим границу в зазор между
       ними. Текущий кадр (viewBox -524 -370 588 588):
         верх   — прячем "Стебнар" (y=-356.7) и всё выше, оставляем
                  "?-UX95" (y=-352.1)  -> граница по y = -355.5
         низ    — прячем "Арром" (y=210.1), оставляем "?-UX151" (y=209.4)
                  -> граница по y = 209.6
         право  — ничего лишнего за краем нет, открыто до самого viewBox,
                  иначе срезало территорию гроксов (GX-03/GX-04 на x=35)
       ⚠️ Зазоры тут по 1.5-2 единицы, то есть примерно в половину высоты
       подписи — менять эти числа "на глазок" нельзя, сразу или обрежется
       нужное, или вылезет лишнее. */
    const MASK_ADJUST = {
      top: 14.0,
      bottom: 6.5,
      left: -2,
      right: 2,
    };

    // Небольшой нахлёст маски внутрь ядра карты — страхует от "шва":
    // отдельные подписи выровнены не строго по своей точке (text-anchor),
    // и край буквы иногда на пару единиц вылезает за расчётную границу.
    const OVERLAP = 2;

    const coreX0 = core.x + MASK_ADJUST.left + OVERLAP;
    const coreX1 = core.x + core.w - MASK_ADJUST.right - OVERLAP;
    const coreY0 = core.y + MASK_ADJUST.top + OVERLAP;
    const coreY1 = core.y + core.h - MASK_ADJUST.bottom - OVERLAP;

    /* Насколько прямоугольники маски вылезают за край карты. Раньше тут было
       core.w * 3 "с запасом на любой зум" — запас оказался бессмысленным и
       вредным: отдалиться дальше исходного вида нельзя (zoomOutLimit: 1), а
       увести камеру за край можно максимум на boundsPad = 0.2 ширины. То есть
       видимая область НИКОГДА не выходит за core ± 20%, и перекрывать больше
       просто нечего.
       Зато при приближении эти прямоугольники раздувались до десятков тысяч
       пикселей (4118 единиц -> ~42 000 px в кадре шириной 80 единиц, при
       лимите текстуры 4096) — вместе с фильтром тумана это и давало чёрные
       артефакты в Telegram. 0.5 ширины — всё ещё вдвое больше нужного. */
    const BIG = core.w * 0.5;
    const outX0 = core.x - BIG, outX1 = core.x + core.w + BIG;
    const outY0 = core.y - BIG, outY1 = core.y + core.h + BIG;

    // Небольшой нахлёст МЕЖДУ самими прямоугольниками маски (не путать с OVERLAP выше —
    // тот прячет край карты, этот убирает шов между top/bottom и left/right на стыке).
    // На сильном зуме даже субпиксельная погрешность на стыке двух фигур становится
    // заметной линией (антиалиасинг) — нахлёст в 2 единицы с запасом это гасит.
    const SEAM_FIX = 2;

    const frames = [
      { x: outX0, y: outY0, w: outX1 - outX0, h: coreY0 - outY0 },                              // сверху
      { x: outX0, y: coreY1, w: outX1 - outX0, h: outY1 - coreY1 },                              // снизу
      { x: outX0, y: coreY0 - SEAM_FIX, w: coreX0 - outX0, h: (coreY1 - coreY0) + SEAM_FIX*2 },  // слева
      { x: coreX1, y: coreY0 - SEAM_FIX, w: outX1 - coreX1, h: (coreY1 - coreY0) + SEAM_FIX*2 }, // справа
    ];

    // Узор из звёзд/тумана вместо плоского цвета (см. buildCosmosDecoration выше).
    const { starFill, nebulaGroup } = buildCosmosDecoration(svg, frames, core);
    frames.forEach(f => {
      const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      r.setAttribute('x', f.x);
      r.setAttribute('y', f.y);
      r.setAttribute('width', f.w);
      r.setAttribute('height', f.h);
      r.setAttribute('fill', starFill);
      svg.appendChild(r);
    });
    // Пятна тумана — ПОВЕРХ звёзд, одной группой с clip-path (см. buildCosmosDecoration).
    svg.appendChild(nebulaGroup);

    /* Подписи, оказавшиеся ЗА маской, до этого момента всё равно рисовались
       каждый кадр — маска просто закрашивала их сверху уже после отрисовки.
       А текст тут самая дорогая часть сцены: замер показал 28 мс на кадр при
       панораме, 14.8 мс если убрать ВСЕ подписи, и 22.1 мс если убрать только
       эти, за-кадровые. То есть бесплатные -21% к стоимости кадра: видимая
       картинка не меняется вообще, они и так были не видны.
       ⚠️ Именно display:none, а не visibility:hidden. Проверено замером:
       visibility даёт 27.1 мс против 28.0 исходных (почти ничего), потому что
       браузер всё равно делает раскладку глифов и просто не красит результат.
       display выкидывает элемент из дерева отрисовки целиком — 22.1 мс. */
    svg.querySelectorAll('text').forEach(t => {
      const x = parseFloat(t.getAttribute('x'));
      const y = parseFloat(t.getAttribute('y'));
      if (!isFinite(x) || !isFinite(y)) return; // координат нет — не рискуем, оставляем
      if (x < coreX0 || x > coreX1 || y < coreY0 || y > coreY1) t.style.display = 'none';
    });
  })();

  /* --- Фон режима "Графика": карта галактики из ассетов модпака Stellaris ---

     Вместо растра StellarMaps (2048x2048 на весь наш участок, вшит прямо в
     map.svg как base64) в режиме "Графика" показывается сетка тайлов,
     нарезанная из HD-карты галактики модпака — 4096px по стороне, то есть
     вдвое резче. Собирается офлайн через tools/build-graphics-background.py,
     там же расписано, откуда берётся геометрия и почему не скриншоты.

     ⚠️ Тайлы НЕ ГРУЗЯТСЯ, пока игрок не зайдёт в режим — элементы создаются
     без href, браузер за них не качает ничего. Это специально: у части
     игроков тормозит даже на обычном SVG (грабли №16), и платить трафиком за
     режим, в который они не заходят, им незачем. Сначала подставляется
     превью на 1024px (64 КБ) — чтобы переключение не выглядело как пустой
     экран, — и уже следом настоящие тайлы поверх него.

     ⚠️ Тайл 2048px, а не один большой файл: на 4096px у проекта уже ломался
     рендер на части устройств (грабли №1, лимит текстуры GPU). Сетку можно
     поднять до 3x3/4x4 пересборкой (--grid), но это кратно растит память под
     текстуры на телефоне — сначала проверять на живом устройстве.

     Вставляется СРАЗУ ПОСЛЕ базового растра: так поверх него по-прежнему
     рисуются и маска, и подписи систем, и наш graphLayer — порядок слоёв
     остаётся ровно тем же, что и с обычным фоном. */
  const GRAPHICS_DIR = 'images/galaxy/';
  const GRAPHICS_GRID = 3;
  /* Версия тайлов — отдельная от ?v= у кода. Имена файлов фиксированные
     (tile-0-0.webp и т.д.), так что после пересборки другим набором галактики
     (tools/build-graphics-background.py --set ...) браузер продолжил бы
     отдавать старые из кэша. Поднимать при КАЖДОЙ пересборке фона. */
  const GRAPHICS_VER = '23';
  // Микронахлёст между тайлами: без него на стыке видна волосяная щель —
  // браузер интерполирует крайний тексель в пустоту. Доля единицы карты.
  const GRAPHICS_BLEED = 0.06;
  let graphicsTiles = [];
  let graphicsPreview = null;
  let graphicsRequested = false;

  (function buildGraphicsBackdrop(){
    const core = pz.getInitialViewBox();
    // Базовый растр StellarMaps — единственный <image> шириной во весь кадр.
    const baseBackdrop = [...svg.querySelectorAll('image')].find(im => {
      const w = parseFloat(im.getAttribute('width'));
      return isFinite(w) && Math.abs(w - core.w) < 1;
    });
    if (!baseBackdrop) return; // экспорт без растра — режим просто останется на нём
    baseBackdrop.classList.add('map-base-backdrop');

    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('id', 'graphicsBackdrop');

    graphicsPreview = document.createElementNS(NS, 'image');
    graphicsPreview.setAttribute('x', core.x);
    graphicsPreview.setAttribute('y', core.y);
    graphicsPreview.setAttribute('width', core.w);
    graphicsPreview.setAttribute('height', core.h);
    graphicsPreview.setAttribute('preserveAspectRatio', 'none');
    g.appendChild(graphicsPreview);

    const step = core.w / GRAPHICS_GRID;
    for (let r = 0; r < GRAPHICS_GRID; r++) {
      for (let c = 0; c < GRAPHICS_GRID; c++) {
        const t = document.createElementNS(NS, 'image');
        t.setAttribute('x', core.x + c * step);
        t.setAttribute('y', core.y + r * step);
        t.setAttribute('width', step + GRAPHICS_BLEED);
        t.setAttribute('height', step + GRAPHICS_BLEED);
        t.setAttribute('preserveAspectRatio', 'none');
        t.dataset.src = `${GRAPHICS_DIR}tile-${r}-${c}.webp?v=${GRAPHICS_VER}`;
        graphicsTiles.push(t);
        g.appendChild(t);
      }
    }
    baseBackdrop.parentNode.insertBefore(g, baseBackdrop.nextSibling);
  })();

  /* Запечённый политический слой (15.09.2026, жалоба игрока на лаги).
     Заливка территорий (fill-opacity 0.05) и размытое свечение границ — это
     ~0.4 МБ координат контуров, которые браузер растеризует заново на каждом
     кадре перетаскивания. Замер в режиме «Карта» при жесте: 15–17 мс на кадр
     с ними, 7.5 мс без них, 7.5–8 мс если заменить их картинкой. Замена
     размытия обводками без фильтра НЕ помогает (14.8 мс): дорого не размытие,
     а сами контуры. Поэтому tools/bake-political.py снимает этот слой в тайлы
     (тем же движком Chromium), а здесь тайлы встают НА ТО ЖЕ МЕСТО в дереве,
     что и исходные пути, и те прячутся. Пунктир секторов и гиперлинии
     остаются вектором — они дешёвые и должны быть чёткими на зуме.

     ⚠️ Исходные пути прячутся только когда ВСЕ тайлы загрузились (класс
     `political-baked`): нет файлов/битый тайл — остаётся прежний вектор.
     ⚠️ После нового экспорта map.svg — пересобрать тайлы и поднять
     POLITICAL_VER, иначе поверх новой карты будут старые территории. */
  const POLITICAL_DIR = 'images/political/';
  const POLITICAL_GRID = 2;   // = --grid у tools/bake-political.py
  const POLITICAL_VER = '1';
  let politicalTiles = [];
  let politicalRequested = false;

  (function buildPoliticalBake(){
    const first = svg.querySelector('.map-political-baked');
    if (!first) return;
    const core = pz.getInitialViewBox();
    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    // .map-political — чтобы «Графика» прятала и картинку, как и вектор.
    g.setAttribute('class', 'map-political political-bake');
    const step = core.w / POLITICAL_GRID;
    for (let r = 0; r < POLITICAL_GRID; r++) {
      for (let c = 0; c < POLITICAL_GRID; c++) {
        const t = document.createElementNS(NS, 'image');
        t.setAttribute('x', core.x + c * step);
        t.setAttribute('y', core.y + r * step);
        t.setAttribute('width', step + GRAPHICS_BLEED);
        t.setAttribute('height', step + GRAPHICS_BLEED);
        t.setAttribute('preserveAspectRatio', 'none');
        t.dataset.src = `${POLITICAL_DIR}p_${r}_${c}.webp?v=${POLITICAL_VER}`;
        politicalTiles.push(t);
        g.appendChild(t);
      }
    }
    first.parentNode.insertBefore(g, first);
  })();

  // Качаем при первом показе «Карты» (в «Графике» и «Нодах» слой не виден).
  function requestPoliticalTiles() {
    if (politicalRequested || !politicalTiles.length) return;
    politicalRequested = true;
    let left = politicalTiles.length;
    let failed = false;
    politicalTiles.forEach(t => {
      t.addEventListener('load', () => {
        if (--left === 0 && !failed) svg.classList.add('political-baked');
      }, {once: true});
      t.addEventListener('error', () => {
        failed = true;
        svg.querySelector('.political-bake')?.remove();
      }, {once: true});
      t.setAttribute('href', t.dataset.src);
    });
  }

  /* Подставляет href тайлам — ровно один раз, при первом входе в "Графику".

     Базовый растр прячется не сразу, а только когда превью реально
     загрузилось (класс `graphics-ready`): если файлов тайлов нет вообще
     (репозиторий без прогона build-graphics-background.py), режим тихо
     останется на обычном фоне вместо чёрного экрана. Тот же принцип, что у
     битых картинок маркеров в createMapIcon. */
  function requestGraphicsTiles() {
    if (graphicsRequested || !graphicsPreview) return;
    graphicsRequested = true;
    graphicsPreview.addEventListener('load', () => svg.classList.add('graphics-ready'), {once: true});
    graphicsPreview.addEventListener('error', () => {
      graphicsTiles.forEach(t => t.remove());
      graphicsPreview.remove();
    }, {once: true});
    graphicsPreview.setAttribute('href', `${GRAPHICS_DIR}preview.webp?v=${GRAPHICS_VER}`);
    graphicsTiles.forEach(t => {
      t.addEventListener('error', () => t.remove(), {once: true});
      t.setAttribute('href', t.dataset.src);
    });
  }

  /* --- Слой графа: все наши точки и нити между ними, одной группой ---
     Раньше и то, и другое сыпалось прямо в корень <svg>, вперемешку с
     содержимым экспорта StellarMaps и прямоугольниками маски. Отдельная
     группа понадобилась режиму "Ноды" (15.09.2026): там база карты (растр,
     ~1600 подписей, территории, маска) уходит из отрисовки целиком, а
     остаться должны ровно эти элементы — одним селектором
     (`svg.nodes-mode > *:not(#graphLayer)` в css/styles.css) вместо
     перечисления того, что прятать.

     ⚠️ Создаётся ЗДЕСЬ, то есть после маски и до setupSystemLabels — порядок
     в DOM это и порядок отрисовки: маркеры обязаны лежать поверх маски (иначе
     крайние из них ею закрасятся), а невидимые мишени подписей systemLabels
     вставляются не сюда, а рядом со своим <text>, так что с ними конфликта
     нет в любом случае. */
  const graphLayer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  graphLayer.setAttribute('id', 'graphLayer');
  svg.appendChild(graphLayer);

  /* Звёздный фон под графом — тот же тайлящийся паттерн, что и у маски по
     краям карты (см. buildCosmosDecoration): в режиме нод от карты не
     остаётся ничего, и без него узлы висели бы в плоской чёрной пустоте.
     Один <rect> с заливкой-паттерном, никаких фильтров (грабли №17) —
     по цене это ровно те же четыре прямоугольника маски, которые и так
     рисуются на карте постоянно.
     Показывается только в режиме нод (см. .graph-backdrop в css/styles.css) —
     на самой карте он был бы лишним слоем поверх настоящего фона. */
  (function addGraphBackdrop(){
    const core = pz.getInitialViewBox();
    const PAD = 0.35; // с запасом больше boundsPad (0.2), чтобы край не ловился при панорамировании
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('class', 'graph-backdrop');
    r.setAttribute('x', core.x - core.w * PAD);
    r.setAttribute('y', core.y - core.h * PAD);
    r.setAttribute('width', core.w * (1 + PAD * 2));
    r.setAttribute('height', core.h * (1 + PAD * 2));
    r.setAttribute('fill', 'url(#cosmosStars)');
    graphLayer.appendChild(r);
  })();
  const graphBackdrop = graphLayer.querySelector('.graph-backdrop');

  /* Кнопки зума ＋/－/⟲ и калибровки 📍 из угла карты убраны (15.09.2026,
     вместе с меню "⋯"). Сама калибровка (calibMode, showCalib, calibPanel)
     оставлена — она переедет в будущий редактор нод; пока кнопки нет,
     calibToggle === null, и все обращения к нему через ?. */
  const calibToggle = document.getElementById('calibToggle');
  calibToggle?.addEventListener('click', () => {
    calibMode = !calibMode;
    calibToggle.classList.toggle('active', calibMode);
    calibPanel.style.display = calibMode ? 'block' : 'none';
    calibPanel.textContent = calibMode ? 'Кликни по карте' : '';
  });

  /* Кнопка 🏷️ — оставить на карте только готовые системы и названия фракций,
     спрятав остальные ~1600 подписей насовсем (не только на время жеста, как
     .panning). Подписи — самая дорогая часть кадра (см. грабли №15), так что
     это заодно и аварийный тумблер производительности.

     Зачем: в Firefox на телефоне SVG-текст рендерится заметно медленнее, чем
     в Chromium, и карта подлагивает — при том что в Telegram Mini App и в
     Chrome та же самая карта едет плавно. Автоопределения браузера тут
     сознательно нет: вместо угадывания даём игроку явный переключатель.

     Выбор запоминается в localStorage (он живёт в браузере конкретного
     игрока и к репозиторию отношения не имеет, как и флаг обучения). */
  const LABELS_MINIMAL_KEY = 'galaxyMapLabelsMinimal';
  const labelsToggle = document.getElementById('labelsToggle');
  function applyLabelsMinimal(on) {
    svg.classList.toggle('labels-minimal', on);
    labelsToggle.classList.toggle('active', on);
  }
  labelsToggle.addEventListener('click', () => {
    const on = !svg.classList.contains('labels-minimal');
    applyLabelsMinimal(on);
    try { localStorage.setItem(LABELS_MINIMAL_KEY, on ? '1' : '0'); } catch (e) {}
  });

  function showCalib(x, y) {
    const rx = Math.round(x), ry = Math.round(y);
    calibPanel.textContent = `x: ${rx}\ny: ${ry}\n\n{ x: ${rx}, y: ${ry} }`;
  }

  /* --- Точки на карте (фракции/персонажи/сюжеты) — данные из markers.json
     и stories.json. Отрисовка иконки — общий код (createMapIcon), у каждого
     набора точек свой источник данных, свой цвет обводки/заглушки и свой
     обработчик тапа, чтобы визуально и по смыслу их не путать. --- */
  const ns = 'http://www.w3.org/2000/svg';
  const MARKERS_PATH = 'markers.json';
  const STORIES_PATH = 'stories.json';
  const CHARACTERS_PATH = 'characters.json';
  const MARKER_SIZE = 8; // размер картинки-маркера в единицах SVG

  async function loadJsonList(path) {
    try {
      const resp = await fetch(path, {cache:'no-cache'});
      // Не проверяем resp.ok — оно ложно считается false и на статусе 304
      // (файл не изменился, отдан из кэша), из-за чего реально загрузившийся
      // файл принимался бы за ошибку. Пробуем распарсить в любом случае,
      // а сбой парсинга поймает внешний catch.
      const data = await resp.json();
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return []; // файла нет или он битый — просто не рисуем точки, не ошибка
    }
  }

  // Клик по ЛЮБОЙ точке на карте (маркер фракции/персонажа, сюжетный маркер,
  // кнопка "Феном") сначала плавно "приближает" камеру к этой точке на одном
  // и том же фиксированном уровне зума (не зависит от того, насколько был
  // зумлен пользователь до этого), и только когда перелёт долетит —
  // открывается сам контент (модал/окно), как будто он раскрывается из
  // точки на карте. Открытие навешено на onDone анимации перелёта — если она
  // по какой-то причине (троттлинг requestAnimationFrame и т.п.) не долетит
  // до конца, контент не должен оставаться "мёртвым", подстраховываемся
  // таймером: кто добежит первым, тот и открывает, повторный вызов openFn
  // безвреден (все openFn ниже идемпотентны сами по себе).
  const FOCUS_WIDTH = 80; // ширина viewBox в единицах карты — подобрано по месту
  const FOCUS_PAN_DURATION = 650;
  /* instant=true — камера ставится на место МГНОВЕННО (duration 0 у
     pz.focusOn), без анимированного перелёта. Нужно для переходов МЕЖДУ
     уже открытыми окнами (вкладка сюжета внутри Фенома, кнопка "Сюжет" в
     окне персонажа, кружок персонажа внутри окна сюжета и т.п.) — камера в
     эти моменты и так не видна (её закрывает предыдущее/следующее окно),
     а долгий перелёт по невидимой галактике только тормозит переключение
     без всякой пользы. Обычный тап по маркеру НА ВИДИМОЙ карте (галактика
     открыта, ничего поверх неё нет) — единственный случай, где перелёт
     нужен взаправду, и там instant не передаётся (см. вызовы ниже). */
  function focusAndOpen(x, y, openFn, instant) {
    if (instant) { pz.focusOn(x, y, FOCUS_WIDTH, 0); openFn(); return; }
    let opened = false;
    const openOnce = () => { if (!opened) { opened = true; openFn(); } };
    pz.focusOn(x, y, FOCUS_WIDTH, FOCUS_PAN_DURATION, openOnce);
    setTimeout(openOnce, FOCUS_PAN_DURATION + 250);
  }

  // Рисует одну точку-иконку (картинка с кольцом или, если картинки нет/не
  // загрузилась, цветная заглушка-кружок) и вешает на неё тап. dotFill/
  // dotStroke/ringColor — визуальное отличие категорий точек друг от друга
  // (см. вызовы ниже: у сюжетов золотое кольцо/фиолетовая заглушка, у обычных
  // маркеров — как было раньше, белое кольцо/жёлтая заглушка).
  /* shape: 'circle' (по умолчанию — фракции/персонажи в markers.json и сюжеты),
     'square' — квадрат со скруглёнными углами (персонажи из characters.json,
     и "широкий квадрат" у локаций, см. LOCATION_BORDER ниже), 'diamond' — ромб
     (локации с "role": "event" в markers.json, см. graph.js/EVENT_LOCATION_SIZE
     — старые/второстепенные точки), или 'hexagon' — шестиугольник (15.09.2026,
     локации с "border": "hexagon", сейчас только Феном). Форма задаётся в
     одном месте и одинаково влияет и на обрезку картинки-аватара, и на
     обводку, и на заглушку.

     aspect — ширина к высоте (по умолчанию 1, то есть квадрат/круг/ромб/
     шестиугольник обычных пропорций). Нужен только для "широкого квадрата"
     — единственного места в проекте, где маркер не квадратный/не круглый по
     соотношению сторон, а вытянут в ширину, чтобы внутри аккуратно
     помещался широкий арт (напр. "Кольцо Авалона"). Высота (`size`) при
     этом остаётся тем же "размером узла", что и у остальных маркеров —
     меняется только ширина. */
  function makeIconShape(shape, size, aspect = 1) {
    if (shape === 'square') {
      const w = size * aspect, h = size;
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', -w/2);
      r.setAttribute('y', -h/2);
      r.setAttribute('width', w);
      r.setAttribute('height', h);
      r.setAttribute('rx', h * 0.45); // скругление — от высоты, не от ширины, иначе широкий квадрат выглядел бы как таблетка
      return r;
    }
    if (shape === 'diamond') {
      const p = document.createElementNS(ns, 'polygon');
      const h = size/2;
      p.setAttribute('points', `0,${-h} ${h},0 0,${h} ${-h},0`);
      return p;
    }
    if (shape === 'hexagon') {
      const r = size/2;
      // "Плоский верх" (flat-top): первая вершина справа (0°), а не сверху —
      // так шестиугольник читается как "щит"/панель, а не как ромб с двумя
      // лишними гранями.
      const pts = Array.from({length: 6}, (_, i) => {
        const a = (Math.PI / 3) * i;
        return `${(r * Math.cos(a)).toFixed(3)},${(r * Math.sin(a)).toFixed(3)}`;
      });
      const p = document.createElementNS(ns, 'polygon');
      p.setAttribute('points', pts.join(' '));
      return p;
    }
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('r', size/2);
    return c;
  }

  /* "Маяк" сюжетного маркера (игрок, 15.09.2026: сюжеты должны привлекать
     внимание издалека, но мягко). Сходящиеся к маркеру кольца, которые
     стягиваются к центру и тают (лучи-штрихи тоже были — игрок попросил
     убрать, 15.09.2026). Вся анимация — в CSS
     (.story-beacon в css/styles.css), тут только геометрия.

     ⚠️ Производительность (грабли №15/17): анимируются только transform,
     opacity и stroke-dashoffset у простых фигур, БЕЗ фильтров и без opacity
     на больших группах. Обводка — vector-effect: non-scaling-stroke, иначе при
     scale(3) кольцо на подлёте становилось втрое толще. На время жеста
     (.panning), в режиме экономии (🏷️) и при prefers-reduced-motion анимация
     останавливается — см. CSS. pointer-events: none — маяк не расширяет зону
     тапа по маркеру. */
  const BEACON_RINGS = 3;
  function addStoryBeacon(g, iconSize, color) {
    const beacon = document.createElementNS(ns, 'g');
    beacon.setAttribute('class', 'story-beacon');
    beacon.style.color = color;
    for (let i = 0; i < BEACON_RINGS; i++) {
      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('class', 'story-beacon-ring');
      ring.setAttribute('r', iconSize * 0.55);
      ring.style.animationDelay = `${-i * 3.6 / BEACON_RINGS}s`;
      beacon.appendChild(ring);
    }
    g.appendChild(beacon);
  }

  // container — куда положить (по умолчанию слой графа; значки у подписей систем
  // и маркеры внутри окна системы кладутся в свои группы).
  function createMapIcon({x, y, image, dotFill, dotStroke, ringColor, shape, size, aspect, onTap, onLongPress, beacon, container}) {
    const iconSize = size || MARKER_SIZE;
    const iconAspect = aspect || 1;
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'hotspot');
    g.setAttribute('transform', `translate(${x} ${y})`);
    // Маяк — первым ребёнком, ПОД иконкой.
    if (beacon) addStoryBeacon(g, iconSize, beacon);

    function addDefaultDot() {
      const c = makeIconShape(shape, iconSize * 0.875, iconAspect); // та же пропорция, что была у фиксированных 7/8
      c.setAttribute('fill', dotFill);
      c.setAttribute('stroke', dotStroke);
      // Толщина обводки — не фиксированная, а доля от размера самой иконки:
      // у мелких узлов в глубине графа она и должна быть тоньше, а не той же
      // ширины, что у корневого маркера в 4 раза крупнее.
      c.setAttribute('stroke-width', iconSize * 0.0625);
      c.style.cursor = 'pointer';
      g.appendChild(c);
    }

    if (image) {
      // картинка-аватар вместо обычной точки, обрезанная по форме, с тонкой обводкой
      const clipId = 'clip-' + Math.random().toString(36).slice(2, 9);
      const clip = document.createElementNS(ns, 'clipPath');
      clip.setAttribute('id', clipId);
      clip.appendChild(makeIconShape(shape, iconSize, iconAspect));
      g.appendChild(clip);

      const imgW = iconSize * iconAspect;
      const img = document.createElementNS(ns, 'image');
      img.setAttribute('href', image);
      img.setAttribute('x', -imgW/2);
      img.setAttribute('y', -iconSize/2);
      img.setAttribute('width', imgW);
      img.setAttribute('height', iconSize);
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('clip-path', `url(#${clipId})`);
      img.style.cursor = 'pointer';

      const ring = makeIconShape(shape, iconSize, iconAspect);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', ringColor);
      // Та же логика, что у заглушки выше: обводка — доля от размера иконки,
      // а не фиксированное число, иначе на мелких узлах в глубине графа
      // кольцо выглядит непропорционально толстым.
      ring.setAttribute('stroke-width', iconSize * 0.05);

      // Путь на картинку битый/недоступен — тихо откатываемся на обычную точку,
      // а не оставляем дыру на карте
      img.addEventListener('error', () => {
        img.remove(); ring.remove(); clip.remove();
        addDefaultDot();
      });

      g.appendChild(img);
      g.appendChild(ring);
    } else {
      addDefaultDot();
    }

    g.__onTap = onTap;
    if (onLongPress) g.__onLongPress = onLongPress;
    (container || graphLayer).appendChild(g);
    return g;
  }

  /* Внешний вид точки зависит ТОЛЬКО от её типа, а раскладка — только от её
     места в дереве связей (этим занимается js/graph.js). Раньше это было
     перемешано: у каждого типа была своя функция отрисовки со своими же
     правилами расположения, и добавить связь между разными типами было
     некуда. Цвета оставлены прежние: у фракций белое кольцо и жёлтая
     заглушка, у сюжетов золотое кольцо и фиолетовая, у персонажей бирюза и
     квадрат со скруглением — чтобы другую сущность было видно ещё до тапа.
     Поле color в JSON, если заполнено, переопределяет цвет разом. */
  const NODE_STYLE = {
    location:  {shape: 'circle', dotFill: 'rgba(255,200,50,0.9)',   dotStroke: '#111',    ringColor: '#fff'},
    story:     {shape: 'circle', dotFill: 'rgba(196,148,255,0.95)', dotStroke: '#1a0f2e', ringColor: '#ffd76a'},
    character: {shape: 'square', dotFill: 'rgba(175,238,238,0.92)', dotStroke: '#0b2b2b', ringColor: '#AFEEEE'},
    // Система — узел только режима «Ноды»: мини-карта самой системы в бирюзовом круге.
    system:    {shape: 'circle', dotFill: 'rgba(175,238,238,0.25)', dotStroke: '#AFEEEE', ringColor: '#AFEEEE'},
  };

  /* "border" у локации (markers.json, 15.09.2026) — какую ФОРМУ (не цвет, не
     размер) взять вместо обычного круга: "circle" (по умолчанию, можно не
     писать явно), "wide-square" (широкий квадрат — Кольцо Авалона, аспект
     задан тут одной ручкой на все такие локации), "hexagon" (Феном). Не
     путать с "role": "event" — тот про совсем другую категорию точек
     (второстепенные фракции-остатки) и всегда даёт ромб, приоритет выше
     border (см. renderNodes ниже: event проверяется первым). Один источник
     правды вместо разбросанных по коду проверок конкретных id — привяжут
     новую локацию с этим полем, форма подхватится сама. */
  // Ширина широкого квадрата — из graph.js: раскладке она нужна та же самая,
  // иначе маркер налезает на соседей (15.09.2026).
  const LOCATION_BORDER = {
    circle:       {shape: 'circle', aspect: 1},
    'wide-square': {shape: 'square', aspect: LOCATION_ASPECT['wide-square']},
    hexagon:      {shape: 'hexagon', aspect: 1},
  };

  // Картинка маркера исторически лежит в разных полях у разных файлов
  // (markerImage у сюжета, image у остальных) — сводим в одном месте, чтобы
  // отрисовка про это больше не знала.
  function nodeImage(node) {
    if (node.kind === 'system') return `systems/${encodeURIComponent(node.data.slug)}.svg`;
    return node.data.markerImage || node.data.image || '';
  }

  function nodeTitle(node) {
    const d = node.data;
    if (node.kind === 'story') return [d.code, d.title].filter(Boolean).join('. ');
    return d.title || d.name || node.id;
  }

  /* Подпись/иконка кнопки "перейти к родителю" (см. #charStory в
     characters.js и #storyParent в stories.js) — зависят от ТИПА родителя в
     графе, а не от того, кто их вызывает: маркер — это локация (Феном
     сейчас единственный пример, но задуман как общий случай — "маркер
     локации", см. раздел про submap в CLAUDE.md), сюжет — это сюжет. Ледо/
     Текила привязаны НАПРЯМУЮ к Феному (маркеру, а не сюжету — своей
     истории у них нет), и кнопка в их окне персонажа поэтому называется
     "Локация", а не "Сюжет". Один источник правды на оба места вместо двух
     захардкоженных подписей — привяжут в будущем персонажа или сюжет к
     новому типу узла, кнопка сама подхватит правильный текст. */
  // Цвет кольца и заглушки завершённого сюжета (см. isCompleted).
  const COMPLETED_COLOR = '#8a8f98';

  const PARENT_KIND_META = {
    location: {icon: '📍', label: 'Локация'},
    story: {icon: '🎬', label: 'Сюжет'},
    character: {icon: '👤', label: 'Персонаж'},
    system: {icon: '🪐', label: 'Система'},
  };
  function parentButtonMeta(node) {
    if (!node.parent) return null;
    return PARENT_KIND_META[node.parent.kind] || PARENT_KIND_META.location;
  }

  /* Что открыть по узлу — зависит только от его типа (а для маркеров ещё и
     от наличия поля submap). Это единственная точка входа на ВСЕ переходы:
     тап по карте, кнопка "Сюжет"/"Локация" в окне персонажа и сюжета,
     переход из окна сюжета к персонажу, кнопки сюжетов внутри Фенома.
     Отсюда же и одинаковый перелёт камеры везде (goToNode ниже). */
  function openNode(node, opts) {
    if (node.kind === 'story') {
      setStoryParentButton(parentButtonMeta(node));
      openStory(node.data);
      return;
    }
    if (node.kind === 'character') {
      updateStoryButton(parentButtonMeta(node));
      openCharacter(node.data, opts);
      return;
    }
    // Система (родитель сюжета «system:<слаг>»): её окно, камера — на точку focusId внутри.
    if (node.kind === 'system') {
      openSystem(node.data.title, {focusId: opts && opts.focusId});
      return;
    }
    // Маркер с полем submap ("Феном" сейчас единственный, но не единственно
    // возможный — см. openSubmapNode) — не карточка с текстом, а
    // окно-вкладыш со своей тайловой картой/картинкой.
    if (node.kind === 'location' && node.data.submap) { openSubmapNode(node); return; }
    const titleHtml = node.data.title ? `<div class="modal-title">${escapeHtml(node.data.title)}</div>` : '';
    const textHtml = node.data.text ? `<div>${escapeHtml(node.data.text).replace(/\n/g, '<br>')}</div>` : '';
    // Локация без своей карты (сейчас это события) — карточка; владельцу в ней кнопка правки.
    const editHtml = canEditNodes() ? '<div class="modal-edit-row"><button type="button" class="editor-btn" data-node-edit>✏️ Правка</button></div>' : '';
    openModal(titleHtml + textHtml + editHtml);
    document.querySelector('#modalContent [data-node-edit]')?.addEventListener('click', () => showNodeEditor(node));
  }

  /* Открывает submap-окно ЛЮБОГО маркера с полем "submap" в markers.json
     (сейчас физически это одно и то же окно-вкладыш из js/phenom.js — оно
     переоткрывает свой OpenSeadragon-вид на нужный source, см. openSubmap).
     Персонажи ВНУТРИ этой карты — дети узла в графе с заполненными
     submapX/submapY (см. characters.json): они одновременно рисуются
     орбитой вокруг САМОГО маркера на карте галактики (обычный механизм
     graph.js, ничего специально делать не пришлось) И как отдельные точки
     внутри самого submap-окна — это ДВЕ РАЗНЫЕ вещи сразу, координаты никак
     друг с другом не связаны. Список пересчитывается заново при КАЖДОМ
     открытии — раз он берётся из всего поддерева узла (см.
     collectSubmapCharacters ниже), никакой отдельной регистрации на старте
     страницы не нужно, и это же автоматически работает для любого будущего
     маркера с submap, не только для Фенома. */
  // Персонажи с submapX/submapY ГДЕ УГОДНО в поддереве локации — не только
  // её прямые дети (как Ледо/Текила у Фенома), но и дети её сюжетов
  // (14.09.2026, по просьбе игрока: персонаж сюжета, привязанного к
  // локации, должен быть виден и на карте самой локации — выпадающий
  // список и маркер поверх тайлов). Рекурсивно, а не только на 1 уровень
  // вниз — сюжет тоже может быть чьим-то ребёнком глубже.
  function collectSubmapCharacters(node) {
    const result = [];
    node.children.forEach(child => {
      if (child.kind === 'character' && typeof child.data.submapX === 'number' && typeof child.data.submapY === 'number') {
        result.push(child);
      }
      result.push(...collectSubmapCharacters(child));
    });
    return result;
  }

  // Какая локация сейчас открыта в окне-вкладыше — для кнопки «✏️ Правка» (#phenomEdit).
  let openSubmapNodeCurrent = null;

  function openSubmapNode(node) {
    openSubmapNodeCurrent = node;
    const mapChars = collectSubmapCharacters(node);
    const byId = new Map(mapChars.map(c => [c.id, c]));
    setSubmapCharacters(
      mapChars.map(c => ({id: c.id, name: nodeTitle(c), image: c.data.image || '', x: c.data.submapX, y: c.data.submapY})),
      (id) => { const c = byId.get(id); if (c) openNode(c); }
    );
    // Вкладки сюжетов, привязанных ИМЕННО к ЭТОЙ локации (её прямые
    // дети-сюжеты) — пересчитываются заново при КАЖДОМ открытии, а не один
    // раз для Фенома при загрузке страницы (баг, найденный игроком
    // 14.09.2026): #phenomToolbar общий на ВСЕ локации с submap, и старый
    // код (wirePhenomWindow, звал setPhenomChildren только один раз для
    // "phenome") оставлял вкладки Фенома висеть в окне любой другой
    // локации, например "Кольца Авалона". Тот же принцип, что и у
    // персонажей чуть выше — берём из node.children при каждом open, а не
    // регистрируем один раз на старте.
    const storyChildren = node.children.filter(child => child.kind === 'story');
    const storyById = new Map(storyChildren.map(c => [c.id, c]));
    setPhenomChildren(
      storyChildren.map(child => ({
        id: child.id,
        label: child.data.shortTitle || nodeTitle(child),
        icon: isCompleted(child) ? '✅' : '🎬',
      })),
      (id) => { const target = storyById.get(id); if (target) goToNode(target, true); }
    );
    openSubmap(node.data.submap);
  }

  // Точке без маркера на карте (onMap: false, см. js/graph.js) лететь некуда —
  // позиции у неё нет вообще, открываем её окно сразу. instant — см.
  // focusAndOpen выше: передаётся дальше без изменений.
  // opts — передаются в openNode (у системы: focusId — на какую точку внутри навести камеру).
  function goToNode(node, instant, opts) {
    if (!node.onMap) { openNode(node, opts); return; }
    /* В режиме "Ноды" весь граф помещается в кадр целиком (камера наведена на
       кластер), так что лететь некуда — перелёт только сдвинул бы кластер под
       уже открывшимся окном, а после его закрытия игрок обнаружил бы граф не
       там, где оставил. Открываем сразу. */
    if (viewMode === 'nodes') { openNode(node, opts); return; }
    // Точка внутри системы на карте галактики стоит в звезде системы — камера
    // летит к системе. Уже открытая система: камера карты не видна, сразу.
    if (node.mapHidden && isSystemOpen()) { openNode(node, opts); return; }
    focusAndOpen(node.x, node.y, () => openNode(node, opts), instant);
  }

  /* Нити между узлами: сплошная к родителю, пунктирная к союзнику (см.
     .map-thread в css/styles.css). Обычные статичные <line> — по цене это
     то же самое, что любая другая векторная линия на карте, дорог тут текст
     и SVG-фильтры, а не линии (грабли №15/18). Рисуются ДО маркеров, чтобы
     лежать под ними. */
  function renderThreads(threads) {
    threads.forEach(t => {
      const line = document.createElementNS(ns, 'line');
      // .far — союз между точками на разных концах карты (MAP_LINK_REACH в
      // graph.js): на карте такая нить не рисуется, только в режиме нод.
      // .nodes-only — нить к системе или точке внутри неё (на карте их нет).
      line.setAttribute('class', (t.kind === 'link' ? `map-thread link${t.far ? ' far' : ''}` : 'map-thread')
        + (t.nodesOnly ? ' nodes-only' : ''));
      // Координаты не проставляем здесь: нить знает только СВОИ УЗЛЫ (t.a/t.b,
      // см. buildThreads в graph.js), а конкретные числа ставит
      // applyGraphPositions() — и при первой отрисовке, и в каждом кадре
      // перелёта между режимами.
      t.__el = line;
      graphLayer.appendChild(line);
    });
  }

  /* Как выглядит маркер точки — форма, цвета, картинка, маяк. Одно и то же для
     маркера на карте, значка у подписи системы и маркера внутри окна системы. */
  function nodeIconOptions(node) {
    const style = NODE_STYLE[node.kind] || NODE_STYLE.location;
    // "role": "event" в markers.json — старые/второстепенные локации
    // (остались от версии карты до Феном/сюжетов/персонажей): ромб вместо
    // круга, размер уже уменьшен в graph.js (EVENT_LOCATION_SIZE). Цвета
    // пока те же, что у обычной локации — задача была только про форму
    // и размер, не про цвет.
    const isEventLocation = node.kind === 'location' && node.data.role === 'event';
    // "border" в markers.json (необязательное, только для локаций) —
    // явная форма конкретной локации вместо обычного круга: "wide-square"
    // у "Кольца Авалона", "hexagon" у Фенома (см. LOCATION_BORDER выше).
    // "role": "event" проверяется ПЕРВЫМ и даёт ромб независимо от border —
    // это другая категория (второстепенные фракции), а не альтернативная
    // форма локации.
    let shape = style.shape, aspect = 1;
    if (isEventLocation) {
      shape = 'diamond';
    } else if (node.kind === 'location' && node.data.border) {
      const border = LOCATION_BORDER[node.data.border];
      if (border) { shape = border.shape; aspect = border.aspect; }
    }
    return {
      image: nodeImage(node), shape, aspect,
      dotFill: isCompleted(node) ? COMPLETED_COLOR : (node.data.color || style.dotFill),
      dotStroke: style.dotStroke,
      ringColor: isCompleted(node) ? COMPLETED_COLOR : (node.data.color || style.ringColor),
      // Завершённый сюжет (completed в stories.json) — без маяка и серый:
      // зовёт «сюда, тут идёт игра» только то, что ещё идёт.
      beacon: node.kind === 'story' && !isCompleted(node) ? (node.data.color || style.ringColor) : null,
    };
  }

  function renderNodes(nodes) {
    nodes.forEach(node => {
      if (!node.onMap) return; // живёт только внутри окна родителя, маркера на карте нет
      // Иконка всегда рисуется в КАРТОЧНОМ размере (node.size); укрупнение в
      // режиме нод делается масштабом самой группы в applyGraphPositions —
      // так один и тот же <g> годится для обоих режимов, и его не нужно
      // перерисовывать на переключении (а заодно маркер плавно растёт прямо
      // во время перелёта, что и просил игрок).
      node.__el = createMapIcon({
        ...nodeIconOptions(node),
        x: node.x, y: node.y, size: node.size,
        onTap: () => {
          if (mapPickHandler) { finishMapPick({x: node.x, y: node.y}); return; }
          if (calibMode) { showCalib(node.x, node.y); return; }
          goToNode(node);
        },
        // Долгое нажатие — переход между нодами и картой прямо к этому маркеру
        // (locateNode). Во время выбора места/калибровки — обычный тап.
        onLongPress: () => {
          if (mapPickHandler || calibMode) return false;
          locateNode(node);
        },
      });
      // Картинка обесцвечивается в css (.map-node-completed image) — фильтр
      // только на маленькой <image>, не на всей группе (грабли №17).
      if (isCompleted(node)) node.__el.classList.add('map-node-completed');
      // Система и всё внутри неё — только в нодах (на карте вместо них значки у подписи).
      if (node.mapHidden) node.__el.classList.add('nodes-only');
    });
  }

  function isCompleted(node) {
    return node.kind === 'story' && node.data.completed === true;
  }

  /* Окно сюжета показывает своих персонажей рядом маркеров-квадратов (см.
     openStory в js/stories.js). Прокидываем туда не сами объекты из JSON, а
     короткую выжимку — включая то, кто с кем в союзе, чтобы связи были видны
     не только на карте. siblingLinks даёт союзников ВНУТРИ этого же сюжета:
     союз с персонажем из другого сюжета в этом окне показывать незачем. */
  function wireStoryWindows(graph) {
    graph.forEach(node => {
      if (node.kind !== 'story') return;
      node.data.__characters = node.children
        .filter(child => child.kind === 'character')
        .map(child => ({
          id: child.id,
          name: child.data.name || '',
          image: child.data.image || '',
          links: siblingLinks(child).map(other => other.id),
        }));
    });
    // instant: true — переход из уже открытого окна сюжета (тап по кружку
    // персонажа), карта позади него не видна, долгий перелёт ни к чему.
    setCharacterNavigator(id => {
      const node = graph.get(id);
      if (node) goToNode(node, true);
    });
  }

  /* ============================================================
     Системы как места сюжетов (17.09.2026)

     Точка с "parent": "system:<слаг>" живёт ВНУТРИ системы: на карте галактики
     её маркера нет, вместо него — значок справа от подписи системы (как значки
     у названий систем в самой Stellaris), по значку на каждую точку. В окне
     системы — маркер на systemX/systemY (единицы SVG системы) и вкладка в
     таб-баре. В нодах — обычный кластер: система → сюжет → персонажи.
     ============================================================ */

  // Маркер внутри системы — постоянного размера на экране, как значки на карте
  // Stellaris: SVG системы от края до края — ~1000 единиц, и маркер в единицах
  // карты на телефоне был бы то точкой, то блином во весь экран.
  const SYSTEM_MARKER_PX = 30;
  // Ширина кадра (доля всей системы), на которую камера подлетает к маркеру.
  const SYSTEM_FOCUS_SHARE = 0.35;

  function systemChildIcon(child) {
    if (child.kind === 'story') return isCompleted(child) ? '✅' : '🎬';
    if (child.kind === 'character') return '👤';
    return child.data.role === 'event' ? '🔶' : '📍';
  }

  function hasSystemPlace(node) {
    return typeof node.data.systemX === 'number' && typeof node.data.systemY === 'number';
  }

  function wireSystemWindows(graph) {
    const focusIn = (sys, node, duration) => {
      if (!sys || !sys.pz || !hasSystemPlace(node)) return;
      const full = sys.pz.getInitialViewBox().w;
      const w = Math.min(sys.pz.getViewBox().w, full * SYSTEM_FOCUS_SHARE);
      sys.pz.focusOn(node.data.systemX, node.data.systemY, w, duration);
    };

    setSystemDecorator(({slug, svg: sysSvg, pz: sysPz, focusId}) => {
      const sysNode = graph.get('system:' + slug);
      const inside = sysNode ? sysNode.children.filter(c => c.onMap !== false) : [];
      setSystemTabs(inside.map(c => ({id: c.id, icon: systemChildIcon(c), label: c.data.shortTitle || nodeTitle(c)})), (id) => {
        const node = graph.get(id);
        if (!node) return;
        focusIn(getOpenSystem(), node, 0);
        openNode(node);
      });

      if (sysSvg && !sysSvg.__systemMarkers) {
        const layer = document.createElementNS(ns, 'g');
        layer.setAttribute('class', 'system-markers');
        sysSvg.appendChild(layer);
        const markers = inside.filter(hasSystemPlace).map(node => {
          const el = createMapIcon({
            ...nodeIconOptions(node),
            x: node.data.systemX, y: node.data.systemY, size: 1, container: layer,
            onTap: () => {
              if (trySystemPick({x: node.data.systemX, y: node.data.systemY})) return;
              openNode(node);
            },
          });
          if (isCompleted(node)) el.classList.add('map-node-completed');
          return {el, x: node.data.systemX, y: node.data.systemY};
        });
        // Масштаб маркеров — от текущего кадра: сколько единиц SVG в одном
        // пикселе экрана (preserveAspectRatio meet — берём большую из сторон).
        const rescale = () => {
          const vb = sysSvg.viewBox.baseVal;
          const k = Math.max(vb.width / (sysSvg.clientWidth || 1), vb.height / (sysSvg.clientHeight || 1)) * SYSTEM_MARKER_PX;
          markers.forEach(m => m.el.setAttribute('transform', `translate(${m.x} ${m.y}) scale(${k})`));
        };
        rescale();
        if (markers.length) new MutationObserver(rescale).observe(sysSvg, {attributes: true, attributeFilter: ['viewBox']});
        sysSvg.__systemMarkers = true;
      }

      if (focusId && graph.has(focusId)) focusIn({pz: sysPz}, graph.get(focusId), 600);
    });
  }

  /* Значки у подписи системы на карте галактики — по одному на точку внутри,
     слева направо от конца подписи. Кладутся в SVG рядом с самой подписью, а не
     в слой графа: так режим нод прячет их вместе с картой (он оставляет только
     #graphLayer), а «Графика» и 🏷️ — нет. Тап — окно системы с камерой на этой
     точке, долгое нажатие — к этой точке в нодах. */
  const SYSTEM_BADGE_SIZE = 2.6;
  const SYSTEM_BADGE_GAP = 0.6;
  const SYSTEM_BADGE_MAX = 5;
  let labelsBySlug = new Map();

  function renderSystemBadges(graph) {
    graph.forEach(sys => {
      if (sys.kind !== 'system') return;
      const inside = sys.children.filter(c => c.onMap !== false);
      const texts = (labelsBySlug.get(sys.data.slug) || []).filter(t => t.style.display !== 'none');
      if (!inside.length || !texts.length) return;
      const last = texts[texts.length - 1];
      let box;
      try { box = texts[0].getBBox(); } catch (e) { return; }
      const group = document.createElementNS(ns, 'g');
      group.setAttribute('class', 'system-badges');
      last.parentNode.insertBefore(group, last.nextSibling);

      const cy = box.y + box.height / 2;
      const step = SYSTEM_BADGE_SIZE + SYSTEM_BADGE_GAP;
      const x0 = box.x + box.width + SYSTEM_BADGE_GAP * 1.5 + SYSTEM_BADGE_SIZE / 2;
      inside.slice(0, SYSTEM_BADGE_MAX).forEach((node, i) => {
        const el = createMapIcon({
          ...nodeIconOptions(node),
          x: x0 + i * step, y: cy, size: SYSTEM_BADGE_SIZE, container: group,
          onTap: () => {
            if (mapPickHandler) { finishMapPick({x: sys.x, y: sys.y}); return; }
            if (calibMode) { showCalib(sys.x, sys.y); return; }
            goToNode(sys, false, {focusId: node.id});
          },
          onLongPress: () => {
            if (mapPickHandler || calibMode) return false;
            locateNode(node);
          },
        });
        if (isCompleted(node)) el.classList.add('map-node-completed');
      });
      const extra = inside.length - SYSTEM_BADGE_MAX;
      if (extra > 0) {
        const more = document.createElementNS(ns, 'text');
        more.setAttribute('x', x0 + SYSTEM_BADGE_MAX * step - SYSTEM_BADGE_SIZE / 2);
        more.setAttribute('y', cy);
        more.setAttribute('dominant-baseline', 'central');
        more.setAttribute('font-size', '2.4');
        more.setAttribute('fill', '#AFEEEE');
        more.setAttribute('class', 'map-label-major system-badges-more');
        more.textContent = `+${extra}`;
        group.appendChild(more);
      }
    });
  }

  /* ============================================================
     Режимы просмотра: "Карта" и "Ноды" (15.09.2026)

     У каждого узла ДВЕ посчитанные позиции — карточная (mapX/mapY, корни на
     своих координатах из JSON) и графовая (graphX/graphY, всё собрано
     компактным кластером в центре, см. layoutGraphView в js/graph.js).
     Обе считаются один раз при загрузке и заморожены; x/y узла — это "где он
     сейчас", то есть текущий режим либо промежуточный кадр перелёта между
     ними. Благодаря этому весь остальной код (goToNode, focusAndOpen, клики
     по маркерам) продолжает читать x/y и про режимы вообще не знает.

     Третий раздел переключателя ("Графика") — заглушка, кнопка disabled.
     ============================================================ */
  const VIEW_MODE_KEY = 'galaxyMapViewMode';
  // Полная длительность переключения режима: столько едут узлы, и в это же
  // время укладываются оба остальных такта (см. setViewMode ниже).
  const VIEW_TWEEN_DURATION = 750;
  // Запас вокруг кластера, чтобы крайние маркеры не упирались в край экрана.
  // Вторая (после просветов в graph.js) ручка "крупности" маркеров в режиме
  // нод: меньше запас — теснее кадр — крупнее всё на экране.
  const GRAPH_VIEW_PADDING = 1.06;

  const viewSwitch = document.getElementById('viewSwitch');
  const viewSwitchBtns = [...viewSwitch.querySelectorAll('.view-switch-btn')];

  let viewMode = 'map';
  let graphNodes = [], graphThreads = [];
  let graphViewBox = {width: 0, height: 0}, graphViewCenter = {x: 0, y: 0};

  /* Ширина кадра, при которой кластер целиком помещается на ЭТОМ экране.

     Тонкость в том, что viewBox карты квадратный, а preserveAspectRatio у нас
     "xMidYMid meet" (см. panzoom.js) — то есть квадрат вписывается в экран
     целиком, и на вытянутом телефоне по длинной стороне остаётся ЛИШНЕЕ
     видимое место. Считать кадр просто по большей стороне кластера (так было
     в первой версии) на телефоне 375x812 означало взять 88 единиц вместо
     нужных 71 — кластер занимал 2/3 ширины, а сверху и снизу зияла пустота.

     Поэтому: по ширине нужен сам кластер, а по высоте — его высота, пересчитанная
     в "ширины кадра" через пропорции экрана. Считается при КАЖДОМ переключении,
     а не один раз при загрузке: экран можно повернуть. */
  function graphViewWidth() {
    const w = svg.clientWidth || 1, h = svg.clientHeight || 1;
    return Math.max(graphViewBox.width, graphViewBox.height * (w / h)) * GRAPH_VIEW_PADDING;
  }
  let savedMapView = null;   // куда вернуть камеру при возврате на карту
  let viewTweenId = null;
  let viewTransition = 0;    // токен текущего перехода, см. setViewMode

  /* Единственное место, которое пишет позиции в DOM. Вызывается и при первой
     отрисовке, и в каждом кадре перелёта между режимами. Маркер — это <g> с
     transform, нить — <line> с четырьмя координатами, взятыми прямо из её
     узлов (см. buildThreads в graph.js). */
  function applyGraphPositions() {
    graphNodes.forEach(n => {
      if (!n.__el) return;
      n.__el.setAttribute('transform', n.viewScale === 1
        ? `translate(${n.x} ${n.y})`
        : `translate(${n.x} ${n.y}) scale(${n.viewScale})`);
    });
    graphThreads.forEach(t => {
      if (!t.__el) return;
      t.__el.setAttribute('x1', t.a.x);
      t.__el.setAttribute('y1', t.a.y);
      t.__el.setAttribute('x2', t.b.x);
      t.__el.setAttribute('y2', t.b.y);
    });
  }

  // Та же кривая, что у перелёта камеры в js/panzoom.js — узлы и камера
  // должны двигаться синхронно, иначе кластер "плывёт" относительно кадра.
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }

  /* Проявление/растворение карты (15.09.2026, по просьбе игрока — до этого
     она возникала и пропадала мгновенно, целым кадром сразу).

     Анимируется НЕ прозрачность самой карты, а прозрачность звёздного фона,
     который и так лежит ровно между картой и узлами (см. addGraphBackdrop
     выше). Так задумано специально:
     - прозрачность у группы с картой заставила бы движок завести офскрин-
       поверхность размером со всю карту, а она растёт вместе с зумом — ровно
       та же болезнь, что в граблях №17 (чёрные прямоугольники в Telegram).
       Фон же обычный <rect> с заливкой-паттерном, буфера не требует;
     - фон непрозрачен (в паттерне звёзд есть подложка #0b0b10), поэтому
       "наплыл фон" == "карта скрылась", отдельная шторка не нужна;
     - и он же остаётся фоном самого режима нод, то есть это один и тот же
       элемент в обеих ролях, а не служебный слой ради анимации.

     ⚠️ Оба перехода делаются при НЕПОДВИЖНОЙ камере — сначала растворяем,
     потом летим (и наоборот). Совмещать нельзя: пока карта видна, каждый
     кадр смены viewBox стоит те самые ~18 мс (грабли №15), и плавного
     затухания не вышло бы. */
  const MAP_FADE_DURATION = 280;
  // Камера работает только ту часть перехода, в которой карта уже скрыта —
  // остаток после такта затухания. Почему не весь переход — см. setViewMode.
  const CAMERA_DURATION = VIEW_TWEEN_DURATION - MAP_FADE_DURATION;
  function fadeBackdrop(toVisible) {
    return new Promise(resolve => {
      graphBackdrop.style.display = 'block';
      graphBackdrop.style.transition = 'none';
      graphBackdrop.style.opacity = toVisible ? '0' : '1';
      /* Форсируем применение стартового значения до того, как повесим
         transition — иначе браузер схлопнет оба присваивания в одно и
         анимации не будет вовсе. ⚠️ Именно чтение стиля самого фона, а НЕ
         getBoundingClientRect() у <svg>, как было сначала: тот заставляет
         пересчитать геометрию всей сцены (~4700 элементов) и давал выброс
         в ~70 мс ровно на первом кадре затухания. */
      void getComputedStyle(graphBackdrop).opacity;
      graphBackdrop.style.transition = `opacity ${MAP_FADE_DURATION}ms linear`;
      graphBackdrop.style.opacity = toVisible ? '1' : '0';
      setTimeout(() => { graphBackdrop.style.transition = ''; resolve(); }, MAP_FADE_DURATION);
    });
  }

  /* Перелёт узлов между двумя ГОТОВЫМИ раскладками — интерполяция, а не
     физика: никакого пересчёта сил в кадре тут нет (см. предупреждение в
     шапке js/graph.js и грабли №15/18). За кадр меняется ~30 transform'ов и
     ~35 линий по практически пустому SVG — база карты на это время скрыта. */
  function tweenToTargets(duration, onDone) {
    if (viewTweenId) cancelAnimationFrame(viewTweenId);
    const from = graphNodes.map(n => ({x: n.x, y: n.y, s: n.viewScale}));
    const t0 = performance.now();
    function step(now) {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeInOutCubic(t);
      graphNodes.forEach((n, i) => {
        n.x = from[i].x + (n.targetX - from[i].x) * e;
        n.y = from[i].y + (n.targetY - from[i].y) * e;
        n.viewScale = from[i].s + (n.targetScale - from[i].s) * e;
      });
      applyGraphPositions();
      if (t < 1) { viewTweenId = requestAnimationFrame(step); }
      else { viewTweenId = null; if (onDone) onDone(); }
    }
    viewTweenId = requestAnimationFrame(step);
  }

  function updateViewModeUi() {
    viewSwitchBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewMode));
    // Гасит политическую раскраску StellarMaps (границы/заливки территорий,
    // названия фракций) — см. classifyPoliticalOverlay/`.map-political` выше
    // и `.graphics-mode` в css/styles.css. Камера/позиции узлов при этом не
    // меняются — это тот же вид, что "Карта", только с другим CSS.
    svg.classList.toggle('graphics-mode', viewMode === 'graphics');
    /* Далёкие союзы (.map-thread.far) видны только при `.nodes-mode.far-links`:
       nodes-mode ставится ПОСЛЕ затухания карты (узлы уже слетаются), а
       far-links снимается СРАЗУ при уходе из нод — длинная нить не мелькает
       поверх карты ни в одну сторону. */
    svg.classList.toggle('far-links', viewMode === 'nodes');
    // Качаем тайлы фона только когда в режим реально зашли (см.
    // requestGraphicsTiles выше) — до этого момента ноль байт.
    if (viewMode === 'graphics') requestGraphicsTiles();
    if (viewMode === 'map') requestPoliticalTiles();
    /* 📍 калибровка и 🏷️ подписи — инструменты САМОЙ карты, в режиме нод они
       бессмысленны и даже опасны: подписей там нет вообще, а координаты —
       компактной раскладки, а НЕ те, что идут в markers.json. Оставить
       калибровку доступной значило бы предложить игроку списать оттуда числа
       и испортить ими файл. "Графика" в этом смысле — та же карта (те же
       координаты, те же подписи систем), калибровка и подписи там работают
       так же, как и в "Карте". */
    const onMapView = viewMode !== 'nodes';
    if (calibToggle) calibToggle.disabled = !onMapView;
    labelsToggle.disabled = !onMapView;
    if (!onMapView && calibMode) {
      calibMode = false;
      calibToggle?.classList.remove('active');
      calibPanel.style.display = 'none';
      calibPanel.textContent = '';
    }
  }

  /* Долгое нажатие на маркер (16.09.2026) — переключение режима прямо к нему:
     - в нодах: уйти на карту (ту, с которой пришли), камера прилетает не туда,
       откуда уходили в ноды, а к маркеру — чтобы было видно, где он на карте.
       Кадр шире FOCUS_WIDTH — вокруг должно быть видно окрестности;
     - на карте/в «Графике»: уйти в ноды, камера — на этот маркер в графе, чуть
       ближе общего вида (на телефоне общий вид и так на пределе зума, там
       просто центрируется).
     Окно не открывается; по прилёту маркер несколько раз обводится кольцом. */
  const LOCATE_WIDTH = 160;
  const LOCATE_NODES_ZOOM = 0.6;
  const LOCATE_PULSES = 3;
  async function locateNode(node) {
    try { window.Telegram?.WebApp?.HapticFeedback?.impactOccurred('medium'); } catch (e) {}
    const toNodes = viewMode !== 'nodes';
    if (toNodes) {
      await setViewMode('nodes', false, {x: node.graphX, y: node.graphY, w: graphViewWidth() * LOCATE_NODES_ZOOM});
    } else {
      await setViewMode(savedMapMode(), false, {x: node.mapX, y: node.mapY, w: LOCATE_WIDTH});
    }
    if ((viewMode === 'nodes') !== toNodes || !node.__el) return;
    const ring = document.createElementNS(ns, 'circle');
    ring.setAttribute('class', 'map-locate-ring');
    ring.setAttribute('cx', node.x);
    ring.setAttribute('cy', node.y);
    ring.setAttribute('r', (toNodes ? node.graphSize : node.size) * 0.75);
    ring.style.animationIterationCount = LOCATE_PULSES;
    graphLayer.appendChild(ring);
    // По таймеру, а не по animationend: при prefers-reduced-motion анимации нет
    // вовсе, и кольцо осталось бы навсегда. 900 — длительность в css.
    setTimeout(() => ring.remove(), LOCATE_PULSES * 900 + 100);
  }
  // На какую карту возвращаться из нод: ту, что была до них («Графика» тоже карта).
  let mapModeBeforeNodes = 'map';
  function savedMapMode() { return mapModeBeforeNodes; }

  async function setViewMode(mode, instant, focus) {
    if (mode === viewMode || !viewSwitchBtns.some(b => b.dataset.view === mode)) return;
    /* ⚠️ Ждём граф ТОЛЬКО если он ещё не приехал. Просто `await graphReady`
       здесь был бы дедлоком: эта же функция вызывается ИЗНУТРИ graphReady.then
       (применение сохранённого режима при загрузке), а сам промис в этот
       момент ещё не разрешён — его колбэк как раз выполняется. К моменту того
       вызова graphNodes уже заполнен, так что до await дело не доходит. */
    if (!graphNodes.length) await graphReady;
    if (!graphNodes.length) return;

    const wasNodes = (viewMode === 'nodes');
    const toNodes = (mode === 'nodes');

    /* "Карта" <-> "Графика" напрямую (минуя "Ноды") — это ВООБЩЕ не смена
       камеры/позиций, только CSS-класс: оба режима показывают тот же вид на
       тех же координатах, разница только в том, гашена ли политическая
       раскраска (см. updateViewModeUi). Без этого раннего выхода код ниже
       попытался бы вернуть камеру к `savedMapView` — а он заполняется ТОЛЬКО
       при уходе В "Ноды" и остался бы `null`, если игрок ни разу там не был. */
    if (!wasNodes && !toNodes) {
      viewMode = mode;
      updateViewModeUi();
      try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch (e) {}
      return;
    }

    if (toNodes) {
      savedMapView = pz.getViewBox(); // вернёмся ровно туда, откуда ушли
      mapModeBeforeNodes = viewMode;
    }
    viewMode = mode;
    updateViewModeUi();
    try { localStorage.setItem(VIEW_MODE_KEY, mode); } catch (e) {}

    graphNodes.forEach(n => {
      n.targetX = toNodes ? n.graphX : n.mapX;
      n.targetY = toNodes ? n.graphY : n.mapY;
      // Укрупнение мелких узлов в режиме нод — масштабом группы, а не
      // перерисовкой иконки (см. renderNodes). У локаций выходит ровно 1.
      n.targetScale = toNodes ? n.graphSize / n.size : 1;
    });

    const target = focus || (toNodes
      ? {x: graphViewCenter.x, y: graphViewCenter.y, w: graphViewWidth()}
      : {x: savedMapView.x + savedMapView.w / 2, y: savedMapView.y + savedMapView.h / 2, w: savedMapView.w});

    if (instant) {
      graphNodes.forEach(n => { n.x = n.targetX; n.y = n.targetY; n.viewScale = n.targetScale; });
      applyGraphPositions();
      svg.classList.toggle('nodes-mode', toNodes);
      graphBackdrop.style.display = toNodes ? 'block' : 'none';
      graphBackdrop.style.opacity = toNodes ? '1' : '0';
      pz.focusOn(target.x, target.y, target.w, 0);
      return;
    }

    /* Переход в три такта, симметричных в обе стороны. Порядок "спрятать
       карту / показать карту" относительно перелёта НЕ симметричен, и это
       важно для производительности (грабли №15): весь перелёт обязан идти по
       ПУСТОМУ SVG. Покажи мы карту в начале возврата — все ~1600 подписей и
       заливки территорий перерисовывались бы каждый кадр все 750 мс, то есть
       ровно тот кадр в ~18 мс, от которого мы вообще-то убегаем.

       Повторный клик по переключателю во время перехода просто перебивает
       предыдущий: токен делает брошенную последовательность немой, иначе её
       отложенные шаги досрабатывали бы поверх новой. */
    const token = ++viewTransition;
    const alive = () => token === viewTransition;

    /* Узлы едут ВЕСЬ переход целиком, а камера — только вторую его половину,
       ту, где карта уже скрыта. Это и даёт совмещение: затухание карты идёт
       не ДО перелёта, а ОДНОВРЕМЕННО с началом движения узлов, и весь переход
       укладывается в VIEW_TWEEN_DURATION вместо суммы двух этапов.

       ⚠️ Совмещать затухание именно с ДВИЖЕНИЕМ УЗЛОВ можно, а с движением
       КАМЕРЫ — нет, и это не одно и то же. Пока viewBox не меняется, движок
       держит растр карты готовым и перерисовывает только те места, где
       реально проехали маркеры. А смена viewBox заставляет растеризовать всю
       сцену заново: замер на этом переходе — 30 мс на кадр даже с классом
       .panning (зум дороже панорамирования, там пересчитывается ещё и растр
       подложки), то есть на 280 мс затухания пришлось бы ~9 кадров вместо
       ~45, и плавного растворения не вышло бы. Поэтому камера и ждёт, пока
       карта не уйдёт из отрисовки совсем. */
    const nodesDone = new Promise(res => tweenToTargets(VIEW_TWEEN_DURATION, res));

    if (toNodes) {
      // Такт 1: звёзды наплывают поверх ещё живой карты, узлы уже поехали,
      // камера стоит.
      await fadeBackdrop(true);
      if (!alive()) return;
      // Такт 2: карта уходит из отрисовки, камера догоняет узлы по пустому SVG.
      svg.classList.add('nodes-mode');
      pz.focusOn(target.x, target.y, target.w, CAMERA_DURATION);
      await nodesDone;
    } else {
      // Обратный порядок: сначала камера по пустому SVG...
      pz.focusOn(target.x, target.y, target.w, CAMERA_DURATION);
      await new Promise(res => setTimeout(res, CAMERA_DURATION));
      if (!alive()) return;
      // ...потом карта проявляется, пока узлы доезжают последние кадры.
      svg.classList.remove('nodes-mode');
      await Promise.all([fadeBackdrop(false), nodesDone]);
      if (!alive()) return;
      graphBackdrop.style.display = 'none';
    }
  }

  viewSwitchBtns.forEach(btn => {
    btn.addEventListener('click', () => setViewMode(btn.dataset.view, false));
  });

  const MANIFEST_PATH = 'systems/manifest.json';
  /* systems/names.json — переименование подписей систем без нового экспорта
     map.svg: {"название в map.svg": "название на карте"}. Подпись меняется
     прямо в SVG при загрузке, и дальше система живёт под НОВЫМ именем: слаг
     для manifest.json, lore.json и файла systems/<slug>.svg берётся из него.
     Пример: {"?-UX71": "G-UX71"} → файл systems/g-ux71.svg. Нет файла — ничего
     не переименовываем. */
  const NAMES_PATH = 'systems/names.json';
  async function loadSystemNames() {
    try {
      const resp = await fetch(NAMES_PATH, {cache:'no-cache'});
      if (resp.status === 404) return {};
      const data = await resp.json();
      return data && typeof data === 'object' && !Array.isArray(data) ? data : {};
    } catch (e) {
      return {};
    }
  }
  // Список слагов уже готовых систем — один лёгкий запрос вместо 1644 проверок
  // по отдельности. Файла может не быть вообще (пока ни одной системы не готово) —
  // тогда просто ничего не подсвечиваем, это не ошибка.
  async function loadReadySystems() {
    try {
      const resp = await fetch(MANIFEST_PATH, {cache:'no-cache'});
      // Та же история: не полагаемся на resp.ok из-за ложного срабатывания на 304
      const list = await resp.json();
      return new Set(list);
    } catch (e) {
      return new Set();
    }
  }

  // Одна загрузка на всех: и подписи систем, и граф (системы как узлы).
  const namesPromise = loadSystemNames();
  const manifestPromise = loadReadySystems();

  /* Системы как точки графа (17.09.2026): "parent": "system:<слаг>" у сюжета
     или локации. Место системы на карте — её звезда: значок StellarMaps
     (<use href="#icon-…">) стоит прямо перед подписью, подпись висит под ним.
     Имя — с учётом systems/names.json, как у подписи на карте. Только системы
     из manifest.json: нет своей карты — прятать сюжет некуда, и такая привязка
     считается битой (точка встаёт на свои x/y, как при любой битой связи). */
  function collectSystemAnchors(names, readySlugs) {
    const found = new Map();
    svg.querySelectorAll('text').forEach(t => {
      const family = t.getAttribute('font-family') || '';
      if (family === 'Impact' || parseFloat(t.getAttribute('font-size') || '0') >= 4.5) return;
      const raw = t.textContent.trim();
      if (!raw) return;
      const shown = (typeof names[raw] === 'string' && names[raw].trim()) || raw;
      const slug = slugify(shown);
      if (!readySlugs.has(slug)) return;
      let icon = t.previousElementSibling;
      while (icon && icon.classList.contains('sys-hit')) icon = icon.previousElementSibling;
      const ix = parseFloat(icon?.getAttribute('x')), iy = parseFloat(icon?.getAttribute('y'));
      const iw = parseFloat(icon?.getAttribute('width')), ih = parseFloat(icon?.getAttribute('height'));
      const hasIcon = icon && icon.tagName.toLowerCase() === 'use' && [ix, iy, iw, ih].every(isFinite);
      if (found.has(slug) && (found.get(slug).hasIcon || !hasIcon)) return;
      const tx = parseFloat(t.getAttribute('x')), ty = parseFloat(t.getAttribute('y'));
      found.set(slug, {
        slug, title: shown, hasIcon,
        x: hasIcon ? ix + iw / 2 : tx,
        y: hasIcon ? iy + ih / 2 : ty - 1.5,
      });
    });
    return found;
  }
  // Все системы с картой — для «Привязки» в редакторе сюжета/локации.
  let systemChoices = [];

  /* Три файла грузятся параллельно, но раскладка считается, только когда
     приехали все: связи ходят МЕЖДУ файлами (персонаж -> сюжет -> Феном), и
     по части графа позиции посчитать нельзя. Раньше маркеры фракций
     рисовались сразу, не дожидаясь остальных — теперь так нельзя. */
  const graphReady = Promise.all([
    loadJsonList(MARKERS_PATH),
    loadJsonList(STORIES_PATH),
    loadJsonList(CHARACTERS_PATH),
    namesPromise,
    manifestPromise,
  ]).then(([markers, stories, characters, names, readySlugs]) => {
    // Свои отправленные, но ещё не доехавшие до GitHub Pages правки редактора
    // (js/editor.js) — поверх скачанных файлов и ДО раскладки: новая привязка
    // или место должны попасть в расчёт позиций.
    const pendingShown = applyPendingEdits({location: markers, story: stories, character: characters});
    const anchors = collectSystemAnchors(names, readySlugs);
    systemChoices = [...anchors.values()]
      .map(a => ({id: 'system:' + a.slug, title: a.title}))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    // Узлами графа становятся только системы, к которым что-то привязано:
    // остальные в режиме нод были бы пустыми кружками.
    const used = new Set([...markers, ...stories, ...characters]
      .map(item => item && typeof item.parent === 'string' && item.parent.startsWith('system:') ? item.parent.slice(7) : null)
      .filter(Boolean));
    const systems = [...used].filter(slug => anchors.has(slug)).map(slug => {
      const a = anchors.get(slug);
      return {id: 'system:' + slug, slug, title: a.title, x: a.x, y: a.y};
    });
    const graph = buildNodes([
      {kind: 'location', items: markers},
      {kind: 'story', items: stories},
      {kind: 'character', items: characters},
      {kind: 'system', items: systems},
    ]);

    /* Обе раскладки считаются тут же, одна за другой, и обе замораживаются.
       Порядок важен только тем, что вторая перезаписывает x/y — поэтому
       карточные координаты снимаем в mapX/mapY ДО неё, а в конце возвращаем
       x/y на карточные (стартовый режим по умолчанию — "Карта"). */
    const threads = layoutNodes(graph);
    graph.forEach(n => { n.mapX = n.x; n.mapY = n.y; });

    const core = pz.getInitialViewBox();
    graphViewCenter = {x: core.x + core.w / 2, y: core.y + core.h / 2};
    // Форма экрана передаётся в раскладку: кластер вытягивается под неё,
    // чтобы не упираться одной стороной в кадр, пока другая пустует
    // (см. packRoots в graph.js).
    graphViewBox = layoutGraphView(graph, graphViewCenter.x, graphViewCenter.y,
      (svg.clientWidth || 1) / (svg.clientHeight || 1));
    graph.forEach(n => { n.graphX = n.x; n.graphY = n.y; });

    graph.forEach(n => { n.x = n.mapX; n.y = n.mapY; n.viewScale = 1; });

    graphThreads = threads;
    renderThreads(threads);
    renderNodes([...graph.values()]);
    graphNodes = [...graph.values()].filter(n => n.onMap && n.__el);
    applyGraphPositions();
    wireStoryWindows(graph);
    wireSystemWindows(graph);
    wireEditor(graph);
    if (pendingShown) showPendingToast();

    // Сохранённый режим применяем без анимации: страница только что
    // открылась, перелетать не от чего.
    let saved = null;
    try { saved = localStorage.getItem(VIEW_MODE_KEY); } catch (e) {}
    if (saved && saved !== 'map') setViewMode(saved, true);
    else updateViewModeUi();

    openFromLink(graph);
    return graph;
  });

  /* Ссылка сразу на точку (17.09.2026) — для постов в канале и VK:
     - Telegram: https://t.me/phenome2_bot/PhenomeMap?startapp=<id> — Mini App
       получает <id> в initDataUnsafe.start_param (и в адресе как tgWebAppStartParam);
     - браузер: https://greyspiritfru.github.io/galaxy-map/?open=<id>.
     <id> — id сюжета/локации/персонажа из JSON (латиница, цифры, «-» и «_» —
     других знаков startapp не допускает). Камера летит к точке, окно открывается
     как от тапа по маркеру; точка внутри системы открывается сразу поверх карты.
     Ссылки выдаёт бот: «ссылки», «ссылка <название>». */
  function openFromLink(graph) {
    const tg = window.Telegram && window.Telegram.WebApp;
    const params = new URLSearchParams(location.search);
    const id = (tg && tg.initDataUnsafe && tg.initDataUnsafe.start_param)
      || params.get('tgWebAppStartParam') || params.get('open') || '';
    const node = /^[A-Za-z0-9_-]{1,64}$/.test(id) ? graph.get(id) : null;
    if (!node || node.kind === 'system') return;
    goToNode(node);
  }

  /* Редактор персонажей (js/editor.js): выбор места тапом. Окна над картой
     на время выбора закрываются, сверху висит полоска с подсказкой и
     «Отмена»; после тапа (или отмены) окно персонажа открывается заново
     сразу на вкладке «Правка» — черновик формы хранится в editor.js. */
  const pickBanner = document.getElementById('pickBanner');
  const pickBannerText = document.getElementById('pickBannerText');
  let pickCancel = null;
  document.getElementById('pickBannerCancel').addEventListener('click', () => { if (pickCancel) pickCancel(); });

  function wireEditor(graph) {
    // Пока идёт выбор места, кнопка «✏️ Мои персонажи» внизу карты спрятана
    // (.is-picking в css): открыть список посреди выбора — потерять форму.
    const showPickBanner = (text) => {
      pickBannerText.textContent = text;
      pickBanner.hidden = false;
      document.body.classList.add('is-picking');
    };
    const hidePickBanner = () => {
      pickBanner.hidden = true;
      pickCancel = null;
      document.body.classList.remove('is-picking');
    };
    const reopen = (char) => {
      hidePickBanner();
      const node = graph.get(char.id);
      if (node) openNode(node, {edit: true});
    };
    const closeLayers = () => {
      closeModal();
      closeStory();
    };
    /* Место выбирается на pointerup (panzoom) / отпускании пальца (OpenSeadragon),
       а на телефоне браузер ПОСЛЕ этого досылает синтетический click в ту же
       точку экрана. Открой форму сразу — click попадал в неё: чаще всего в
       «📝 Изменить описание» (стоит как раз посередине), и карта закрывалась,
       а бот просил текст. Поэтому форма открывается после этого click (он
       гасится) или через паузу, если его не будет (мышь без click, старый WebView). */
    const afterTap = (fn) => {
      let done = false;
      const run = () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        document.removeEventListener('click', swallow, true);
        fn();
      };
      const swallow = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setTimeout(run, 0);
      };
      document.addEventListener('click', swallow, true);
      const timer = setTimeout(run, 450);
    };
    // Общий выбор места на карте галактики: для персонажа и для сюжета/локации.
    // reopenForm — как вернуться к своей форме после тапа или «Отмены».
    const pickPlace = (label, onPick, reopenForm) => {
      closeLayers();
      closePhenom();
      if (isSystemOpen()) closeSystem();
      if (viewMode === 'nodes') setViewMode('map', true);
      showPickBanner(`📍 Тапни, где стоит ${label}`);
      const back = () => { hidePickBanner(); reopenForm(); };
      mapPickHandler = (p) => { onPick(p); hidePickBanner(); afterTap(reopenForm); };
      pickCancel = () => { mapPickHandler = null; back(); };
    };
    initEditor({
      graph,
      pickPlace,
      systems: systemChoices,
      // Место сюжета/локации внутри системы: её окно, тап — systemX/systemY.
      pickInSystem(label, systemId, onPick, reopenForm) {
        const choice = systemChoices.find(s => s.id === systemId);
        if (!choice) return;
        closeLayers();
        closePhenom();
        const back = () => { hidePickBanner(); reopenForm(); };
        openSystem(choice.title);
        showPickBanner(`🪐 Тапни, где в системе «${choice.title}» стоит ${label}`);
        const done = () => { if (isSystemOpen()) closeSystem(); back(); };
        // Третий путь, кроме тапа и «Отмены»: окно закрыли ✕/«назад» — closeSystem сам вызовет back.
        setSystemPickHandler((p) => { onPick(p); hidePickBanner(); afterTap(done); }, back);
        pickCancel = () => { setSystemPickHandler(null); done(); };
      },
      openCharacterEditor(node) {
        openNode(node, {edit: true});
      },
      pickOnMap(char, onPick) {
        pickPlace(char.name || 'персонаж', onPick, () => reopen(char));
      },
      pickOnSubmap(char, locationNode, onPick) {
        closeLayers();
        openSubmapNode(locationNode);
        showPickBanner(`🏙 Тапни, где на карте «${nodeTitle(locationNode)}» стоит ${char.name || 'персонаж'}`);
        const done = () => { if (isPhenomOpen()) closePhenom(); reopen(char); };
        // Третий путь, кроме тапа и «Отмены»: окно закрыли ✕/«назад» —
        // closePhenom сам вызовет onAbort, и мы вернёмся к форме.
        setSubmapPickHandler((p) => { onPick(p); hidePickBanner(); afterTap(done); }, () => reopen(char));
        pickCancel = () => { setSubmapPickHandler(null); done(); };
      },
    });

    // «✏️ Правка» у сюжета и у локации с картой — только владельцу группы.
    const storyEdit = document.getElementById('storyEdit');
    const phenomEdit = document.getElementById('phenomEdit');
    storyEdit.hidden = phenomEdit.hidden = !canEditNodes();
    storyEdit.addEventListener('click', () => {
      const story = getOpenStory();
      if (story) showNodeEditor(graph.get(story.id));
    });
    phenomEdit.addEventListener('click', () => {
      if (openSubmapNodeCurrent) showNodeEditor(openSubmapNodeCurrent);
    });
  }

  /* Кнопка "Сюжет"/"Локация" в панели персонажа: уводит к его родителю в
     графе (сюжет либо, как у Ледо/Текила, сам Феном-маркер напрямую — см.
     parentButtonMeta выше). Обработчик живёт здесь, а не в characters.js,
     потому что тут есть и граф, и камера — ровно так же сделан переход
     "Карта" у Фенома (#refPhenomMap ниже) и #storyParent чуть ниже. */
  document.getElementById('charStory').addEventListener('click', async () => {
    const char = getOpenCharacter();
    if (!char) return;
    const graph = await graphReady;
    const node = graph.get(char.id);
    if (!node || !node.parent) return; // родителя нет/удалили — молча ничего не делаем
    closeModal(); // иначе анкета останется висеть поверх окна родителя
    // instant: true — родитель либо уже открыт под нами (тогда это просто
    // переоткроет тот же самый экран, идемпотентно), либо карта позади не
    // видна в любом случае (мы были внутри окна персонажа) — перелёт ни к
    // чему в обоих случаях.
    goToNode(node.parent, true);
  });

  /* Кнопка "Сюжет"/"Локация" в панели сюжета — зеркало #charStory выше, для
     сюжета, привязанного к своему родителю (обычно маркер-локация вроде
     Фенома, но общий случай — см. parentButtonMeta). closeStory() тут НЕ
     закрывает родителя — если сюжет был открыт вкладкой ИЗ окна локации
     (см. setPhenomChildren в js/phenom.js), локация всё это время оставалась
     открытой позади и просто снова становится видна; если сюжет открыт сам
     по себе (клик по его собственному маркеру на карте), goToNode ниже
     откроет локацию заново. */
  document.getElementById('storyParent').addEventListener('click', async () => {
    const story = getOpenStory();
    if (!story) return;
    const graph = await graphReady;
    const node = graph.get(story.id);
    if (!node || !node.parent) return;
    closeStory();
    // У системы — камера на маркер этого сюжета внутри неё.
    goToNode(node.parent, true, {focusId: node.id});
  });

  // Все входы в Феном ведут через один и тот же перелёт камеры (focusAndOpen
  // выше), что и клик по маркеру "phenome" на карте: кнопка 🚀 в углу карты и
  // правая половина двойной вкладки "Феном" внутри статьи. Координаты маркера
  // берём из графа (узел "phenome"), а не хардкодим — чтобы не разъезжались
  // при переносе маркера. instant пробрасывается снаружи: кнопка в углу карты
  // видит саму карту (перелёт нужен), а переход из уже открытой статьи —
  // нет (см. #refPhenomMap ниже).
  async function gotoPhenomOnMap(instant) {
    const graph = await graphReady;
    const phenom = graph.get('phenome');
    // Маркера "phenome" нет в markers.json — тот же рассинхрон, что и с
    // манифестом систем: молча ничего не делаем, ловится глазами.
    if (phenom) goToNode(phenom, instant);
  }

  // Кнопка в углу карты — тут камера ДЕЙСТВИТЕЛЬНО видна (обычная галактика,
  // ничего поверх неё не открыто), перелёт нужен взаправду.
  document.getElementById('gotoPhenom').addEventListener('click', () => gotoPhenomOnMap(false));

  // Правая половина вкладки "Феном" в таб-баре статей: уводит из статьи в само
  // место. Статью перед этим закрываем — иначе она так и осталась бы висеть
  // поверх окна Феном (модал статей выше него по z-index, см. грабли №7).
  // instant: true — уходим из уже открытой статьи, карта позади неё не видна.
  document.getElementById('refPhenomMap').addEventListener('click', () => {
    closeModal();
    gotoPhenomOnMap(true);
  });

  /* --- П.3: клик по названию системы (реальные <text> из экспорта StellarMaps) ---
     Ждём document.fonts.ready: в карте зашит кастомный шрифт (Orbitron), и если
     измерять getBBox() до его загрузки, размеры текста считаются по запасному
     шрифту — область клика получается смещена относительно того, что видно на экране. */
  const setupSystemLabels = (readySlugs, names) => {
    svg.querySelectorAll('text').forEach(textEl => {
      let name = textEl.textContent.trim();
      if (!name) return;
      const renamed = typeof names[name] === 'string' ? names[name].trim() : '';
      if (renamed) {
        textEl.textContent = renamed;
        name = renamed;
      }

      // Названия фракций/цивилизаций в экспорте StellarMaps используют другой
      // шрифт (Impact, крупнее), чем обычные системы (Tahoma, мельче) —
      // по этому признаку их и отсеиваем. Это просто return: у таких подписей
      // не заводится ни обработчика, ни мишени, ни даже курсора — они не
      // стоят вообще ничего и на производительность не влияют.
      const fontFamily = textEl.getAttribute('font-family') || '';
      const fontSize = parseFloat(textEl.getAttribute('font-size') || '0');
      if (fontFamily === 'Impact' || fontSize >= 4.5) {
        // Названия фракций остаются на экране во время перетаскивания — их
        // всего пара десятков, на кадр они не влияют, зато по ним видно, куда
        // ты едешь (см. .map-label-major в css/styles.css). Тот же класс, что
        // и у территорий (classifyPoliticalOverlay выше) — режим "Графика"
        // гасит оба одним CSS-правилом, `.map-label-major` при этом отдельно
        // отвечает за видимость во время панорамирования и не пересекается по
        // смыслу: подпись готовой системы (см. ветку ниже) тоже major, но не
        // political — её "Графика" не трогает, это не название империи.
        textEl.classList.add('map-label-major', 'map-political');
        return;
      }

      /* Интерактивны ТОЛЬКО системы, у которых уже есть готовая карта
         (systems/manifest.json). Для остальных полутора тысяч подписей не
         делаем ничего: они остаются просто рисунком.

         Раньше мишень создавалась под КАЖДУЮ подпись — это 1616 вызовов
         getBBox() на старте (каждый принудительно пересчитывает геометрию)
         и столько же лишних узлов в DOM, больше половины которых вдобавок
         лежали под маской и были не видны и не нажимаемы. Сейчас и то, и
         другое — по числу готовых систем, то есть на два порядка меньше.

         ⚠️ Побочный эффект: в режиме калибровки (📍) тап по названию
         неготовой системы больше не показывает её координаты. Координаты
         по-прежнему даёт клик по любому месту карты (см. onClick у
         createPanZoom), так что рабочий процесс расстановки маркеров жив. */
      const slug = slugify(name);
      if (!readySlugs.has(slug)) return;
      // Для значков того, что внутри системы (renderSystemBadges).
      if (!labelsBySlug.has(slug)) labelsBySlug.set(slug, []);
      labelsBySlug.get(slug).push(textEl);

      textEl.setAttribute('fill', '#AFEEEE'); // подсветка готовых систем
      textEl.classList.add('map-label-major'); // готовые системы тоже не прячем при перетаскивании
      textEl.style.cursor = 'pointer';

      // невидимая область побольше самого текста — легче попасть пальцем
      let bbox;
      try { bbox = textEl.getBBox(); } catch (e) { return; }
      const hit = document.createElementNS(ns, 'rect');
      hit.setAttribute('class', 'sys-hit');
      hit.setAttribute('x', bbox.x - 2);
      hit.setAttribute('y', bbox.y - 2);
      hit.setAttribute('width', bbox.width + 4);
      hit.setAttribute('height', bbox.height + 4);
      hit.setAttribute('fill', 'transparent');
      textEl.parentNode.insertBefore(hit, textEl);

      const trigger = () => {
        if (mapPickHandler) { finishMapPick({x: bbox.x + bbox.width/2, y: bbox.y + bbox.height/2}); return; }
        if (calibMode) { showCalib(bbox.x + bbox.width/2, bbox.y + bbox.height/2); return; }
        openSystem(name);
      };
      // помечаем оба элемента — и невидимую область, и сам текст —
      // чтобы клик срабатывал независимо от того, куда именно попал палец
      hit.__onTap = trigger;
      textEl.__onTap = trigger;
    });
  };

  const fontsReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
  const labelsReady = Promise.all([fontsReady, manifestPromise, namesPromise]).then(([, readySlugs, names]) => {
    setupSystemLabels(readySlugs, names);
    // Сохранённый выбор режима подписей применяем именно ЗДЕСЬ, а не раньше:
    // класс .map-label-major проставляется внутри setupSystemLabels, и до
    // этого момента "важных" подписей ещё нет — включив режим раньше, мы бы
    // на секунду спрятали вообще всё, включая названия фракций.
    try {
      if (localStorage.getItem(LABELS_MINIMAL_KEY) === '1') applyLabelsMinimal(true);
    } catch (e) {}
  });
  // Значкам нужны и размеры подписей (после шрифта), и граф.
  Promise.all([labelsReady, graphReady]).then(([, graph]) => renderSystemBadges(graph));

})();
