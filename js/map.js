/* ============================================================
   Загрузка и инициализация карты галактики
   ============================================================ */
import { createPanZoom } from './panzoom.js?v=23';
import { openModal, closeModal, escapeHtml } from './modal.js?v=23';
import { openSystem, slugify } from './system-view.js?v=23';
import { openPhenom } from './phenom.js?v=23';
import { openStory } from './stories.js?v=23';

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
    zoomInLimit: 0.02,
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
     выглядел как повторяющиеся кляксы. Каждое пятно — обычный круг с
     feGaussianBlur (не radialGradient — тот же самый градиент, растянутый
     по ВСЕМ прямоугольникам маски отдельными заливками, давал заметные швы
     на стыках между ними). Все пятна — в одной group с clip-path по тем же
     прямоугольникам маски, чтобы не наезжать на настоящую карту, но при
     этом рисуются как единые фигуры без стыков. */
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

    // Размытие — без него круг тумана выглядит чёткой плоской "монетой".
    const blurFilter = document.createElementNS(NS, 'filter');
    blurFilter.setAttribute('id', 'cosmosBlur');
    blurFilter.setAttribute('x', '-60%');
    blurFilter.setAttribute('y', '-60%');
    blurFilter.setAttribute('width', '220%');
    blurFilter.setAttribute('height', '220%');
    const feBlur = document.createElementNS(NS, 'feGaussianBlur');
    feBlur.setAttribute('stdDeviation', (core.w * 0.02).toFixed(1));
    blurFilter.appendChild(feBlur);
    defs.appendChild(blurFilter);

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
    nebulaGroup.setAttribute('filter', 'url(#cosmosBlur)');
    NEBULA_COLORS.forEach((color) => {
      const blob = document.createElementNS(NS, 'circle');
      blob.setAttribute('cx', (reach.x0 + Math.random() * (reach.x1 - reach.x0)).toFixed(1));
      blob.setAttribute('cy', (reach.y0 + Math.random() * (reach.y1 - reach.y0)).toFixed(1));
      // "Растянуть раза в 2 больше" по сравнению с первой версией — большие пятна на весь фон.
      blob.setAttribute('r', (reachMinSide * (0.18 + Math.random() * 0.12)).toFixed(1));
      blob.setAttribute('fill', color);
      blob.setAttribute('opacity', (0.10 + Math.random() * 0.06).toFixed(2));
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

    const BIG = core.w * 3; // с большим запасом, чтобы гарантированно перекрыть любой уровень зума
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

  document.getElementById('calibToggle').addEventListener('click', () => {
    calibMode = !calibMode;
    calibPanel.style.display = calibMode ? 'block' : 'none';
    calibPanel.textContent = calibMode ? 'Кликни по карте' : '';
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
  function focusAndOpen(x, y, openFn) {
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
  function createMapIcon({x, y, image, dotFill, dotStroke, ringColor, onTap}) {
    const g = document.createElementNS(ns, 'g');
    g.setAttribute('class', 'hotspot');
    g.setAttribute('transform', `translate(${x} ${y})`);

    function addDefaultDot() {
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('r', 3.5);
      c.setAttribute('fill', dotFill);
      c.setAttribute('stroke', dotStroke);
      c.setAttribute('stroke-width', 0.5);
      c.style.cursor = 'pointer';
      g.appendChild(c);
    }

    if (image) {
      // круглая картинка-аватар вместо обычной точки, с тонкой обводкой
      const clipId = 'clip-' + Math.random().toString(36).slice(2, 9);
      const clip = document.createElementNS(ns, 'clipPath');
      clip.setAttribute('id', clipId);
      const clipCircle = document.createElementNS(ns, 'circle');
      clipCircle.setAttribute('r', MARKER_SIZE/2);
      clip.appendChild(clipCircle);
      g.appendChild(clip);

      const img = document.createElementNS(ns, 'image');
      img.setAttribute('href', image);
      img.setAttribute('x', -MARKER_SIZE/2);
      img.setAttribute('y', -MARKER_SIZE/2);
      img.setAttribute('width', MARKER_SIZE);
      img.setAttribute('height', MARKER_SIZE);
      img.setAttribute('preserveAspectRatio', 'xMidYMid slice');
      img.setAttribute('clip-path', `url(#${clipId})`);
      img.style.cursor = 'pointer';

      const ring = document.createElementNS(ns, 'circle');
      ring.setAttribute('r', MARKER_SIZE/2);
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', ringColor);
      ring.setAttribute('stroke-width', 0.4);

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

  function renderMarkers(markers) {
    markers.forEach(m => {
      if (typeof m.x !== 'number' || typeof m.y !== 'number') return;
      createMapIcon({
        x: m.x, y: m.y, image: m.image,
        dotFill: 'rgba(255,200,50,0.9)', dotStroke: '#111', ringColor: '#fff',
        onTap: () => {
          if (calibMode) { showCalib(m.x, m.y); return; }
          if (m.id === 'phenome') { focusAndOpen(m.x, m.y, openPhenom); return; }
          const titleHtml = m.title ? `<div class="modal-title">${escapeHtml(m.title)}</div>` : '';
          const textHtml = m.text ? `<div>${escapeHtml(m.text).replace(/\n/g, '<br>')}</div>` : '';
          focusAndOpen(m.x, m.y, () => openModal(titleHtml + textHtml));
        },
      });
    });
  }

  function renderStories(stories) {
    stories.forEach(s => {
      if (typeof s.x !== 'number' || typeof s.y !== 'number') return;
      // s.color — необязательный цвет из stories.json, переопределяет цвет
      // кольца (если есть картинка маркера) или заглушки-кружка (если нет).
      // По умолчанию — золотое кольцо/фиолетовая заглушка, отличает сюжетные
      // маркеры от обычных (белое кольцо/жёлтая заглушка, см. renderMarkers).
      createMapIcon({
        x: s.x, y: s.y, image: s.markerImage,
        dotFill: s.color || 'rgba(196,148,255,0.95)', dotStroke: '#1a0f2e',
        ringColor: s.color || '#ffd76a',
        onTap: () => {
          if (calibMode) { showCalib(s.x, s.y); return; }
          focusAndOpen(s.x, s.y, () => openStory(s));
        },
      });
    });
  }

  const markersPromise = loadJsonList(MARKERS_PATH);
  markersPromise.then(renderMarkers);
  loadJsonList(STORIES_PATH).then(renderStories);

  // Все входы в Феном ведут через один и тот же перелёт камеры (focusAndOpen
  // выше), что и клик по маркеру "phenome" на карте: кнопка 🚀 в углу карты и
  // правая половина двойной вкладки "Феном" внутри статьи. Координаты маркера
  // берём из markers.json (id "phenome"), а не хардкодим — чтобы не
  // разъезжались при переносе маркера.
  async function gotoPhenomOnMap() {
    const markers = await markersPromise;
    const phenomMarker = markers.find(m => m.id === 'phenome');
    if (phenomMarker) focusAndOpen(phenomMarker.x, phenomMarker.y, openPhenom);
    else openPhenom();
  }

  document.getElementById('gotoPhenom').addEventListener('click', gotoPhenomOnMap);

  // Правая половина вкладки "Феном" в таб-баре статей: уводит из статьи в само
  // место. Статью перед этим закрываем — иначе она так и осталась бы висеть
  // поверх окна Феном (модал статей выше него по z-index, см. грабли №7).
  document.getElementById('refPhenomMap').addEventListener('click', () => {
    closeModal();
    gotoPhenomOnMap();
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
  });

})();
