/* ============================================================
   Загрузка и инициализация карты галактики
   ============================================================ */
import { createPanZoom } from './panzoom.js?v=50';
import { openModal, closeModal, escapeHtml } from './modal.js?v=50';
import { openSystem, slugify } from './system-view.js?v=50';
import { openSubmap, setPhenomChildren, setSubmapCharacters } from './phenom.js?v=50';
import { openStory, setCharacterNavigator } from './stories.js?v=50';
import { openCharacter, getOpenCharacter, updateStoryButton } from './characters.js?v=50';
import { buildNodes, layoutNodes, siblingLinks } from './graph.js?v=50';

const SVG_PATH = 'map.svg';

/* Точки на карте (маркеры фракций/персонажей и т.п.) больше не зашиты в коде —
   они грузятся из markers.json, лежащего рядом с этим index.html. См. renderMarkers() ниже. */

let calibMode = false;
const calibPanel = document.getElementById('calibPanel');

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
    onClick: (p) => { if (calibMode) showCalib(p.x, p.y); }
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

  document.getElementById('zoomIn').addEventListener('click', pz.zoomIn);
  document.getElementById('zoomOut').addEventListener('click', pz.zoomOut);
  document.getElementById('reset').addEventListener('click', pz.reset);

  document.getElementById('calibToggle').addEventListener('click', (e) => {
    calibMode = !calibMode;
    e.currentTarget.classList.toggle('active', calibMode);
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

  // Сворачиваемое меню инструментов (zoom/reset/калибровка) — скрыто по умолчанию,
  // разворачивается по кнопке "⋯" рядом с кнопкой "Феном".
  const toolsToggle = document.getElementById('toolsToggle');
  const controlsTools = document.getElementById('controlsTools');
  toolsToggle.addEventListener('click', () => {
    const open = controlsTools.classList.toggle('open');
    toolsToggle.classList.toggle('open', open);
    toolsToggle.setAttribute('aria-expanded', String(open));
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
  /* shape: 'circle' (по умолчанию — фракции/персонажи в markers.json и сюжеты)
     или 'square' — квадрат со скруглёнными углами, им отличаются маркеры
     персонажей из characters.json. Форма задаётся в одном месте и одинаково
     влияет и на обрезку картинки-аватара, и на обводку, и на заглушку. */
  function makeIconShape(shape, size) {
    if (shape === 'square') {
      const r = document.createElementNS(ns, 'rect');
      r.setAttribute('x', -size/2);
      r.setAttribute('y', -size/2);
      r.setAttribute('width', size);
      r.setAttribute('height', size);
      r.setAttribute('rx', size * 0.45); // скругление углов
      return r;
    }
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('r', size/2);
    return c;
  }

  function createMapIcon({x, y, image, dotFill, dotStroke, ringColor, shape, size, onTap}) {
    const iconSize = size || MARKER_SIZE;
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'hotspot');
    g.setAttribute('transform', `translate(${x} ${y})`);

    function addDefaultDot() {
      const c = makeIconShape(shape, iconSize * 0.875); // та же пропорция, что была у фиксированных 7/8
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
      clip.appendChild(makeIconShape(shape, iconSize));
      g.appendChild(clip);

      const img = document.createElementNS(ns, 'image');
      img.setAttribute('href', image);
      img.setAttribute('x', -iconSize/2);
      img.setAttribute('y', -iconSize/2);
      img.setAttribute('width', iconSize);
      img.setAttribute('height', iconSize);
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('clip-path', `url(#${clipId})`);
      img.style.cursor = 'pointer';

      const ring = makeIconShape(shape, iconSize);
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
    svg.appendChild(g);
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
    marker:    {shape: 'circle', dotFill: 'rgba(255,200,50,0.9)',   dotStroke: '#111',    ringColor: '#fff'},
    story:     {shape: 'circle', dotFill: 'rgba(196,148,255,0.95)', dotStroke: '#1a0f2e', ringColor: '#ffd76a'},
    character: {shape: 'square', dotFill: 'rgba(175,238,238,0.92)', dotStroke: '#0b2b2b', ringColor: '#AFEEEE'},
  };

  // Картинка маркера исторически лежит в разных полях у разных файлов
  // (markerImage у сюжета, image у остальных) — сводим в одном месте, чтобы
  // отрисовка про это больше не знала.
  function nodeImage(node) {
    return node.data.markerImage || node.data.image || '';
  }

  function nodeTitle(node) {
    const d = node.data;
    if (node.kind === 'story') return [d.code, d.title].filter(Boolean).join('. ');
    return d.title || d.name || node.id;
  }

  /* Что открыть по узлу — зависит только от его типа (а для маркеров ещё и
     от наличия поля submap). Это единственная точка входа на ВСЕ переходы:
     тап по карте, кнопка "Сюжет" в окне персонажа, переход из окна сюжета к
     персонажу, кнопки сюжетов внутри Фенома. Отсюда же и одинаковый перелёт
     камеры везде (goToNode ниже). */
  function openNode(node) {
    if (node.kind === 'story') { openStory(node.data); return; }
    if (node.kind === 'character') {
      updateStoryButton(Boolean(node.parent));
      openCharacter(node.data);
      return;
    }
    // Маркер с полем submap ("Феном" сейчас единственный, но не единственно
    // возможный — см. openSubmapNode) — не карточка с текстом, а
    // окно-вкладыш со своей тайловой картой/картинкой.
    if (node.kind === 'marker' && node.data.submap) { openSubmapNode(node); return; }
    const titleHtml = node.data.title ? `<div class="modal-title">${escapeHtml(node.data.title)}</div>` : '';
    const textHtml = node.data.text ? `<div>${escapeHtml(node.data.text).replace(/\n/g, '<br>')}</div>` : '';
    openModal(titleHtml + textHtml);
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
     открытии — раз он берётся прямо из node.children, никакой отдельной
     регистрации на старте страницы не нужно, и это же автоматически
     работает для любого будущего маркера с submap, не только для Фенома. */
  function openSubmapNode(node) {
    const mapChars = node.children.filter(child =>
      child.kind === 'character' &&
      typeof child.data.submapX === 'number' &&
      typeof child.data.submapY === 'number'
    );
    const byId = new Map(mapChars.map(c => [c.id, c]));
    setSubmapCharacters(
      mapChars.map(c => ({id: c.id, name: nodeTitle(c), image: c.data.image || '', x: c.data.submapX, y: c.data.submapY})),
      (id) => { const c = byId.get(id); if (c) openNode(c); }
    );
    openSubmap(node.data.submap);
  }

  // Точке без маркера на карте (onMap: false, см. js/graph.js) лететь некуда —
  // позиции у неё нет вообще, открываем её окно сразу. instant — см.
  // focusAndOpen выше: передаётся дальше без изменений.
  function goToNode(node, instant) {
    if (!node.onMap) { openNode(node); return; }
    focusAndOpen(node.x, node.y, () => openNode(node), instant);
  }

  /* Нити между узлами: сплошная к родителю, пунктирная к союзнику (см.
     .map-thread в css/styles.css). Обычные статичные <line> — по цене это
     то же самое, что любая другая векторная линия на карте, дорог тут текст
     и SVG-фильтры, а не линии (грабли №15/18). Рисуются ДО маркеров, чтобы
     лежать под ними. */
  function renderThreads(threads) {
    threads.forEach(t => {
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', t.x1);
      line.setAttribute('y1', t.y1);
      line.setAttribute('x2', t.x2);
      line.setAttribute('y2', t.y2);
      line.setAttribute('class', t.kind === 'link' ? 'map-thread link' : 'map-thread');
      svg.appendChild(line);
    });
  }

  function renderNodes(nodes) {
    nodes.forEach(node => {
      if (!node.onMap) return; // живёт только внутри окна родителя, маркера на карте нет
      const style = NODE_STYLE[node.kind] || NODE_STYLE.marker;
      createMapIcon({
        x: node.x, y: node.y, size: node.size,
        image: nodeImage(node), shape: style.shape,
        dotFill: node.data.color || style.dotFill,
        dotStroke: style.dotStroke,
        ringColor: node.data.color || style.ringColor,
        onTap: () => {
          if (calibMode) { showCalib(node.x, node.y); return; }
          goToNode(node);
        },
      });
    });
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

  /* Вкладки внутри окна Феном — это его дети-СЮЖЕТЫ в графе, то есть все
     точки с "parent": "phenome" и kind === 'story' (персонажи, привязанные
     напрямую к Феному, сюда не входят — у них своё место внутри самого
     submap-окна, см. openSubmapNode ниже). Список собирается из графа, а не
     перечисляется руками: привязали в JSON ещё один сюжет — вкладка появится
     сама. Подпись берём из shortTitle, потому что в таб-баре помещается лишь
     пара слов (см. грабли №12), а не полное название. */
  function wirePhenomWindow(graph) {
    const phenom = graph.get('phenome');
    if (!phenom) return;
    const tabs = phenom.children
      .filter(child => child.kind === 'story')
      .map(child => ({
        id: child.id,
        label: child.data.shortTitle || nodeTitle(child),
        icon: '🎬',
      }));
    // instant: true — уходим из уже закрытого (см. closePhenom в goTo
    // js/phenom.js) окна Феном, перелёт по невидимой карте тут не нужен.
    setPhenomChildren(tabs, (id) => {
      const node = graph.get(id);
      if (node) goToNode(node, true);
    });
  }

  /* Три файла грузятся параллельно, но раскладка считается, только когда
     приехали все: связи ходят МЕЖДУ файлами (персонаж -> сюжет -> Феном), и
     по части графа позиции посчитать нельзя. Раньше маркеры фракций
     рисовались сразу, не дожидаясь остальных — теперь так нельзя. */
  const graphReady = Promise.all([
    loadJsonList(MARKERS_PATH),
    loadJsonList(STORIES_PATH),
    loadJsonList(CHARACTERS_PATH),
  ]).then(([markers, stories, characters]) => {
    const graph = buildNodes([
      {kind: 'marker', items: markers},
      {kind: 'story', items: stories},
      {kind: 'character', items: characters},
    ]);
    renderThreads(layoutNodes(graph));
    renderNodes([...graph.values()]);
    wireStoryWindows(graph);
    wirePhenomWindow(graph);
    return graph;
  });

  /* Кнопка "Сюжет" в панели персонажа: уводит к его родителю в графе (у
     персонажа это сюжет). Обработчик живёт здесь, а не в characters.js,
     потому что тут есть и граф, и камера — ровно так же сделан переход
     "Карта" у Фенома (#refPhenomMap ниже). */
  document.getElementById('charStory').addEventListener('click', async () => {
    const char = getOpenCharacter();
    if (!char) return;
    const graph = await graphReady;
    const node = graph.get(char.id);
    if (!node || !node.parent) return; // родителя нет/удалили — молча ничего не делаем
    closeModal(); // иначе анкета останется висеть поверх окна родителя
    goToNode(node.parent, true); // уходим из уже закрытого окна персонажа, карта не видна — без перелёта
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
  const MANIFEST_PATH = 'systems/manifest.json';
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

  const setupSystemLabels = (readySlugs) => {
    svg.querySelectorAll('text').forEach(textEl => {
      const name = textEl.textContent.trim();
      if (!name) return;

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
        // ты едешь (см. .map-label-major в css/styles.css).
        textEl.classList.add('map-label-major');
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
  Promise.all([fontsReady, loadReadySystems()]).then(([, readySlugs]) => {
    setupSystemLabels(readySlugs);
    // Сохранённый выбор режима подписей применяем именно ЗДЕСЬ, а не раньше:
    // класс .map-label-major проставляется внутри setupSystemLabels, и до
    // этого момента "важных" подписей ещё нет — включив режим раньше, мы бы
    // на секунду спрятали вообще всё, включая названия фракций.
    try {
      if (localStorage.getItem(LABELS_MINIMAL_KEY) === '1') applyLabelsMinimal(true);
    } catch (e) {}
  });

})();
