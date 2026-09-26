/* ============================================================
   Переиспользуемый модуль пан/зума поверх произвольного SVG.
   Используется и для карты галактики, и для вида внутри системы —
   логика одна и та же, подключить второй раз к любому новому SVG
   стоит нескольких строк (см. map.js и system-view.js).
   ============================================================ */
export function createPanZoom(svg, opts) {
  opts = opts || {};
  const zoomOutLimit = opts.zoomOutLimit ?? 1;   // 1 = нельзя отдалить дальше исходного охвата карты
  const zoomInLimit = opts.zoomInLimit ?? 0.02;  // насколько можно приблизить
  const boundsPad = opts.boundsPad ?? 0.15;      // запас за краями карты при панорамировании (п.2)
  const onClick = opts.onClick || null;          // (svgPoint, domEvent) => void, для калибровки/т.п.
  /* (viewBox) => void, вызывается на КАЖДОЕ изменение кадра, то есть каждый
     кадр перетаскивания/щипка/перелёта. Поэтому обработчик обязан быть
     дешёвым и сам решать, надо ли ему вообще трогать DOM (см. syncDetailLevel
     в js/map.js — он сравнивает булев признак и выходит, пока тот не менялся). */
  const onViewBox = opts.onViewBox || null;
  /* Ограничивать панорамирование по ВИДИМОЙ области, а не по viewBox.

     viewBox у нас квадратный, а экран — нет: `meet` вписывает квадрат по
     короткой стороне, и по длинной видно больше, чем сам viewBox. На
     телефоне 414×896 при кадре 272 единицы на экране 272×588 единиц карты.
     Старое ограничение держало в границах только квадрат, поэтому по длинной
     стороне камеру можно было увести так, что полэкрана занимала маска.
     Включено только у карты галактики (24.09.2026) — у вида системы своя
     геометрия, его не трогали. */
  const clampVisible = !!opts.clampVisible;
  /* () => boolean — помогать ли с промахами прямо сейчас (см. «Промахи» ниже).
     Вызывающий выключает на время выбора места/калибровки: там тап по пустому
     месту — это и есть нужное действие. Нет опции — помощи нет. */
  const tapAssist = opts.tapAssist || null;

  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

  let vb = svg.getAttribute('viewBox');
  let viewBox;
  if (vb) {
    const parts = vb.trim().split(/\s+/).map(Number);
    viewBox = {x: parts[0], y: parts[1], w: parts[2], h: parts[3]};
  } else {
    const w = svg.getAttribute('width') || svg.clientWidth || 1000;
    const h = svg.getAttribute('height') || svg.clientHeight || 1000;
    viewBox = {x:0, y:0, w:Number(w), h:Number(h)};
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  }

  const initialViewBox = {...viewBox};
  let cur = {...viewBox};

  const minW = initialViewBox.w * zoomInLimit;
  const maxW = initialViewBox.w * zoomOutLimit;

  // П.2: границы панорамирования — не дальше чем boundsPad за пределами исходной карты
  const boundX0 = initialViewBox.x - initialViewBox.w * boundsPad;
  const boundX1 = initialViewBox.x + initialViewBox.w * (1 + boundsPad);
  const boundY0 = initialViewBox.y - initialViewBox.h * boundsPad;
  const boundY1 = initialViewBox.y + initialViewBox.h * (1 + boundsPad);

  function setViewBox(v) {
    cur = v;
    svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    if (onViewBox) onViewBox(cur);
  }

  /* Пока viewBox меняется каждый кадр (перетаскивание, щипок, перелёт камеры),
     на SVG висит класс .panning — чтобы CSS мог на это время спрятать самое
     дорогое в отрисовке. На карте галактики это подписи систем: их ~1600, и
     каждая перерисовывается на КАЖДОМ кадре, съедая почти половину его
     стоимости (замер: 28 мс на кадр всего, 14.4 мс без подписей). См.
     `.svg-widget svg.panning text` в css/styles.css — там же оговорено, какие
     подписи остаются видимыми, чтобы не терять ориентацию при перетаскивании.

     Три независимых источника (мышь/палец, щипок, анимация), поэтому не
     булев флаг, а три — иначе окончание одного гасило бы класс, когда другой
     ещё активен (например, палец отпустил один из двух при щипке).

     ⚠️ Снимается класс с задержкой BUSY_OFF_MS, ставится сразу: жесты часто
     идут вплотную (двойной тап за двойным тапом, щелчки колёсика, отпустил и
     снова потянул) — без задержки подписи мигали бы между ними (замечание
     игрока к v=159: «частые тапы — текст моргает»). */
  let busyDrag = false, busyPinch = false, busyAnim = false, busyWheel = false;
  const BUSY_OFF_MS = 150;
  let busyOffTimer = null;
  function refreshBusy() {
    if (busyDrag || busyPinch || busyAnim || busyWheel) {
      if (busyOffTimer) { clearTimeout(busyOffTimer); busyOffTimer = null; }
      svg.classList.add('panning');
    } else if (!busyOffTimer && svg.classList.contains('panning')) {
      busyOffTimer = setTimeout(() => {
        busyOffTimer = null;
        if (!(busyDrag || busyPinch || busyAnim || busyWheel)) svg.classList.remove('panning');
      }, BUSY_OFF_MS);
    }
  }

  /* Размер панели в пикселях — кэшем, а не чтением в каждом кадре: clampViewBox
     зовётся на каждом кадре жеста сразу после смены viewBox, и чтение геометрии
     там означало бы принудительный пересчёт всей сцены (та же грабля, что с
     затуханием карты, см. CLAUDE.md). */
  let paneW = svg.clientWidth || 0, paneH = svg.clientHeight || 0;
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => { paneW = svg.clientWidth || 0; paneH = svg.clientHeight || 0; }).observe(svg);
  }

  // Центр отрезка длиной size держим внутри [lo, hi]; не влезает целиком —
  // ставим посередине (так на полном отдалении телефон видит карту по центру).
  function clampCenter(c, size, lo, hi) {
    if (size >= hi - lo) return (lo + hi) / 2;
    return Math.max(lo + size / 2, Math.min(hi - size / 2, c));
  }

  function clampViewBox(v) {
    let w = Math.max(minW, Math.min(maxW, v.w));
    let h = v.h * (w / v.w);
    let x = v.x, y = v.y;
    if (clampVisible && paneW && paneH) {
      // Масштаб у meet один на обе оси и задаётся короткой стороной экрана.
      const scale = Math.min(paneW / w, paneH / h);
      const cx = clampCenter(x + w / 2, paneW / scale, boundX0, boundX1);
      const cy = clampCenter(y + h / 2, paneH / scale, boundY0, boundY1);
      return {x: cx - w / 2, y: cy - h / 2, w, h};
    }
    if (x < boundX0) x = boundX0;
    if (x + w > boundX1) x = boundX1 - w;
    if (y < boundY0) y = boundY0;
    if (y + h > boundY1) y = boundY1 - h;
    return {x, y, w, h};
  }

  function clientToSvgPoint(clientX, clientY) {
    const pt = svg.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return {x: cur.x + cur.w/2, y: cur.y + cur.h/2};
    const sp = pt.matrixTransform(ctm.inverse());
    return {x: sp.x, y: sp.y};
  }

  function zoomAt(cx, cy, scaleFactor) {
    // Сначала клэмпим итоговую ширину под лимиты зума...
    let newW = Math.max(minW, Math.min(maxW, cur.w / scaleFactor));
    // ...и пересчитываем РЕАЛЬНО применённый коэффициент масштаба —
    // иначе на упоре в лимит позиция "уезжает" в сторону курсора при каждом
    // повторном скролле (баг с дрейфом камеры на макс./мин. зуме).
    const effectiveScale = cur.w / newW;
    const newH = cur.h / effectiveScale;
    const newX = cx - (cx - cur.x) / effectiveScale;
    const newY = cy - (cy - cur.y) / effectiveScale;
    setViewBox(clampViewBox({x:newX, y:newY, w:newW, h:newH}));
  }

  // Плавный анимированный перелёт камеры (например, "наведение" на маркер
  // Феном перед открытием его окна) — обычный setViewBox() меняет viewBox
  // мгновенно, тут вместо этого интерполируем текущий вид к целевому кадр
  // за кадром через requestAnimationFrame. Отменяется, если пользователь
  // начинает своё собственное перетаскивание/зум поверх анимации.
  //
  // kind 'zoom' — приближение двойным тапом: быстрый старт (easeOut, отклик
  // сразу) и ширина по логарифму — на глаз равномерная скорость зума; x/y
  // идут пропорционально ширине, поэтому точка под пальцем стоит на месте.
  // Такую анимацию новое касание НЕ обрывает (см. pointerdown): частые тапы
  // складываются в цепочку, а не рвут приближение на полпути.
  let animFrameId = null, animKind = null, animTarget = null;
  function cancelAnim() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    animKind = null; animTarget = null;
    if (busyAnim) { busyAnim = false; refreshBusy(); }
  }
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function animateViewBox(target, duration, onDone, kind) {
    cancelAnim();
    busyAnim = true; refreshBusy();
    animKind = kind || 'focus'; animTarget = target;
    const zoom = animKind === 'zoom' && Math.abs(target.w - cur.w) > 1e-9;
    const start = {...cur};
    const t0 = performance.now();
    function step(now) {
      const t = Math.min(1, (now - t0) / duration);
      let v;
      if (zoom) {
        const e = easeOutCubic(t);
        const w = start.w * Math.pow(target.w / start.w, e);
        const k = (start.w - w) / (start.w - target.w);
        v = {
          x: start.x + (target.x - start.x) * k,
          y: start.y + (target.y - start.y) * k,
          w, h: start.h * (w / start.w),
        };
      } else {
        const e = easeInOutCubic(t);
        v = {
          x: start.x + (target.x - start.x) * e,
          y: start.y + (target.y - start.y) * e,
          w: start.w + (target.w - start.w) * e,
          h: start.h + (target.h - start.h) * e,
        };
      }
      setViewBox(v);
      if (t < 1) {
        animFrameId = requestAnimationFrame(step);
      } else {
        animFrameId = null; animKind = null; animTarget = null;
        busyAnim = false; refreshBusy();
        if (onDone) onDone();
      }
    }
    animFrameId = requestAnimationFrame(step);
  }

  /* ============================================================
     Жесты (26.09.2026, v=160) — палец, мышь, щипок, колёсико, двойной тап,
     инерция. Всё на pointer events: один список активных касаний, 1 палец —
     перетаскивание, 2 — щипок; переходы между ними пересчитывают опорную
     точку, поэтому карта не прыгает ни при втором пальце, ни когда один из
     двух отпустили (раньше щипок жил на touch events отдельно, и после него
     оставшийся палец карту не тащил вовсе).

     Пороги — общепринятые, сверены с платформами и картографическими
     библиотеками (подробно — CLAUDE.md, «Жесты карты»):
     - TAP_SLOP: насколько палец может съехать, оставаясь тапом (Android 8dp,
       Leaflet tapTolerance 15 px; мышь — 4 px, у руки на столе дрожи нет).
       До порога карта стоит; дальше едет без скачка — порог вычитается, как
       у прокрутки в Android. Было 3 px на всё: у пальца между касанием и
       отпусканием 2–8 px, и тап по маркеру молча становился перетаскиванием
       (исходная жалоба игрока — «тапаю по 2–3 раза»).
     - DOUBLE_TAP_*: второй тап мимо маркеров не позже 300 мс после первого
       (Android, Hammer; у мыши 400 — ближе к двойному щелчку Windows) и не
       дальше 40 px (у мыши 8) — приблизить вдвое за ZOOM_MS (OpenLayers:
       250 мс). В v=159 было «второй промах за 2.5 с в 60 px» — два отдельных
       клика по пустому месту тоже приближали, это мешало.
     - NEAR_RINGS: только у пальца (мышь точная). Не попал — ищем мишень в
       радиусе ~24 px (мишень пальца по гайдам 44–48 px, а маркер на общем
       виде 10 px). Одна — сработает она; несколько — ничего не угадываем.
       В v=159 «несколько» приближало с одного клика — на плотном кадре (у
       маркера с персонажами, куда камера встаёт после окна) почти любой
       клик рядом приближал.
     - Инерция: скорость пальца за последние FLING_SAMPLE_MS до отпускания,
       затухание экспонентой (OpenLayers Kinetic: −0.005/мс, стоп 0.05 px/мс).
       Остановился перед отпусканием — инерции нет. Касание во время инерции
       её гасит и тапом не считается (как прокрутка в iOS/Android) — иначе
       ловил бы едущую карту и открывал случайный маркер.
     - Колёсико: щелчок колеса (большой deltaY) не прыгает ступенькой, а
       доезжает за ~WHEEL_TAU×3; тачпад (мелкие дельты) — сразу, без
       сглаживания, иначе щипок на тачпаде отставал бы от пальцев.
     ============================================================ */
  const TAP_SLOP = {touch: 10, pen: 8, mouse: 4};
  const DOUBLE_TAP_MS = {touch: 300, pen: 300, mouse: 400};
  const DOUBLE_TAP_PX = {touch: 40, pen: 40, mouse: 8};
  const ZOOM_STEP = 2, ZOOM_MS = 250;
  const NEAR_RINGS = [8, 16, 24];
  const FLING_SAMPLE_MS = 100, FLING_DECAY = 0.005;       // 1/мс: τ = 200 мс, как в OpenLayers
  const FLING_START = 0.25, FLING_STOP = 0.03, FLING_MAX = 4; // px/мс
  const WHEEL_SPEED = 0.002, WHEEL_TAU = 55, WHEEL_SMOOTH_MIN = 40;

  const kindOf = (t) => (t === 'mouse' || t === 'pen') ? t : 'touch';
  // px экрана на единицу кадра (meet — один масштаб на обе оси). Размер панели
  // — из кэша ResizeObserver: читать геометрию в кадре жеста = пересчёт сцены.
  function pxPerUnit(v) {
    const W = paneW || svg.clientWidth || 1, H = paneH || svg.clientHeight || 1;
    return Math.min(W / v.w, H / v.h);
  }

  // Единая точка входа для "тапа" по интерактивному элементу (hotspot, подпись системы и т.п.).
  // Вместо отдельных click-слушателей на каждом элементе — элемент просто помечается
  // свойством __onTap, а здесь мы поднимаемся вверх по DOM от места клика и ищем ближайший
  // помеченный элемент. Так клик и перетаскивание никогда не мешают друг другу: старт
  // перетаскивания больше не блокируется на "чувствительных" точках, а решение — это был
  // клик или свайп — принимается по факту движения, в момент отпускания.
  function findTapHandler(el) {
    while (el && el !== svg) {
      if (el.__onTap) return el.__onTap;
      el = el.parentNode;
    }
    return null;
  }

  // Мишень рядом с точкой тапа: ближайшее кольцо, где нашлось хоть что-то;
  // ровно одна — её обработчик, несколько или ни одной — null. Считается
  // только при промахе пальцем (~35 elementFromPoint, ~10 мс на компьютере).
  function findNearTap(clientX, clientY) {
    for (const r of NEAR_RINGS) {
      const found = new Set();
      const n = Math.max(8, Math.round(2 * Math.PI * r / 10));
      for (let i = 0; i < n; i++) {
        const a = i * 2 * Math.PI / n;
        const el = document.elementFromPoint(clientX + r * Math.cos(a), clientY + r * Math.sin(a));
        if (!el || !svg.contains(el)) continue;
        const h = findTapHandler(el);
        if (h) found.add(h);
      }
      if (found.size === 1) return found.values().next().value;
      if (found.size > 1) return null;
    }
    return null;
  }

  // Приблизить вдвое к точке экрана. Идёт уже приближение — следующая ступень
  // считается от ЕГО цели: частые двойные тапы складываются, а не рвутся.
  function zoomStep(clientX, clientY) {
    const pt = clientToSvgPoint(clientX, clientY);
    const base = (animKind === 'zoom' && animTarget) ? animTarget : cur;
    const newW = Math.max(minW, Math.min(maxW, base.w / ZOOM_STEP));
    if (newW >= base.w * 0.99) return;   // уже на пределе приближения
    const fx = (pt.x - cur.x) / cur.w, fy = (pt.y - cur.y) / cur.h;
    const newH = newW * cur.h / cur.w;
    animateViewBox(clampViewBox({x: pt.x - fx * newW, y: pt.y - fy * newH, w: newW, h: newH}),
      ZOOM_MS, null, 'zoom');
  }

  /* ---------- инерция ---------- */
  let fling = null, samples = [];
  function stopFling() {
    if (!fling) return false;
    cancelAnimationFrame(fling.raf);
    fling = null;
    busyDrag = false; refreshBusy();
    return true;
  }
  function startFling(rs) {
    const now = performance.now();
    const recent = samples.filter(s => now - s.t <= FLING_SAMPLE_MS);
    samples = [];
    if (recent.length < 2) return false;
    const a = recent[0], b = recent[recent.length - 1];
    const dt = Math.max(16, b.t - a.t);
    let vx = (b.x - a.x) / dt, vy = (b.y - a.y) / dt;
    const v = Math.hypot(vx, vy);
    if (v < FLING_START) return false;
    if (v > FLING_MAX) { vx *= FLING_MAX / v; vy *= FLING_MAX / v; }
    fling = {vx, vy, last: now, raf: 0};
    const step = (t) => {
      if (!fling) return;
      const d = Math.min(64, t - fling.last);
      fling.last = t;
      // Путь за кадр — интеграл экспоненты, а не v·dt: не зависит от частоты кадров.
      const k = (1 - Math.exp(-FLING_DECAY * d)) / FLING_DECAY;
      const before = cur;
      setViewBox(clampViewBox({x: cur.x - fling.vx * k / rs, y: cur.y - fling.vy * k / rs, w: cur.w, h: cur.h}));
      // Упёрлись в край — по этой оси дальше не едем.
      if (Math.abs(cur.x - before.x) < 1e-9) fling.vx = 0;
      if (Math.abs(cur.y - before.y) < 1e-9) fling.vy = 0;
      const decay = Math.exp(-FLING_DECAY * d);
      fling.vx *= decay; fling.vy *= decay;
      if (Math.hypot(fling.vx, fling.vy) < FLING_STOP) { fling = null; busyDrag = false; refreshBusy(); return; }
      fling.raf = requestAnimationFrame(step);
    };
    busyDrag = true; refreshBusy();
    fling.raf = requestAnimationFrame(step);
    return true;
  }

  /* ---------- колёсико / тачпад ---------- */
  let wheel = null, wheelIdle = null;
  function stopWheel() {
    if (wheel && wheel.raf) cancelAnimationFrame(wheel.raf);
    wheel = null;
    if (busyWheel) { busyWheel = false; refreshBusy(); }
  }
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    cancelAnim(); stopFling();
    let dy = e.deltaY;
    if (e.deltaMode === 1) dy *= 16;
    else if (e.deltaMode === 2) dy *= (paneH || 800);
    const pt = clientToSvgPoint(e.clientX, e.clientY);
    busyWheel = true; refreshBusy();
    clearTimeout(wheelIdle);
    wheelIdle = setTimeout(() => { if (!wheel) { busyWheel = false; refreshBusy(); } }, BUSY_OFF_MS);
    if (Math.abs(dy) < WHEEL_SMOOTH_MIN && !wheel) {
      zoomAt(pt.x, pt.y, Math.exp(-dy * WHEEL_SPEED));   // тачпад — сразу
      return;
    }
    const base = wheel ? wheel.targetW : cur.w;
    const targetW = Math.max(minW, Math.min(maxW, base * Math.exp(dy * WHEEL_SPEED)));
    const w = wheel || (wheel = {raf: 0, last: performance.now()});
    w.targetW = targetW;
    w.pt = pt; w.fx = (pt.x - cur.x) / cur.w; w.fy = (pt.y - cur.y) / cur.h;
    if (w.raf) return;
    const step = (t) => {
      if (wheel !== w) return;
      const d = Math.min(64, t - w.last);
      w.last = t;
      let nw = cur.w + (w.targetW - cur.w) * (1 - Math.exp(-d / WHEEL_TAU));
      if (Math.abs(nw - w.targetW) < w.targetW * 0.002) nw = w.targetW;
      const nh = nw * cur.h / cur.w;
      setViewBox(clampViewBox({x: w.pt.x - w.fx * nw, y: w.pt.y - w.fy * nh, w: nw, h: nh}));
      if (nw === w.targetW) {
        wheel = null;
        busyWheel = false; refreshBusy();
        return;
      }
      w.raf = requestAnimationFrame(step);
    };
    w.raf = requestAnimationFrame(step);
  }, {passive:false});

  /* ---------- долгое нажатие ----------
     Та же схема, что у тапа: элемент помечается __onLongPress. Срабатывает,
     если палец продержали LONG_PRESS_MS и не сдвинули дальше LONG_PRESS_SLOP.
     Обработчик вернул false — нажатие не его, отпускание остаётся обычным
     тапом; иначе тап на отпускании не срабатывает. */
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_SLOP = 10;
  let longPressTimer = null;
  function cancelLongPress() {
    if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
  }
  function findLongPressHandler(el) {
    while (el && el !== svg) {
      if (el.__onLongPress) return el.__onLongPress;
      el = el.parentNode;
    }
    return null;
  }
  // Меню «сохранить картинку» по долгому нажатию на иконку маркера.
  svg.addEventListener('contextmenu', (e) => {
    if (findLongPressHandler(e.target)) e.preventDefault();
  });

  /* ---------- касания ---------- */
  const pointers = new Map();   // pointerId → {x, y}
  let press = null;             // одно касание: тап или перетаскивание
  let pinch = null;             // два касания
  let lastTap = null;           // тап мимо маркеров — первая половина двойного

  function startPinch() {
    const [a, b] = [...pointers.values()];
    const mid = {x: (a.x + b.x) / 2, y: (a.y + b.y) / 2};
    pinch = {
      dist0: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      mid0: mid, view0: {...cur}, rs0: pxPerUnit(cur),
      p: clientToSvgPoint(mid.x, mid.y),
    };
    busyPinch = true; refreshBusy();
  }
  function movePinch() {
    const [a, b] = [...pointers.values()];
    const d = Math.max(1, Math.hypot(b.x - a.x, b.y - a.y));
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const {view0, p, mid0, rs0} = pinch;
    /* Сначала клэмпим ширину, потом считаем по РЕАЛЬНО применённому
       коэффициенту (грабли №3 — «дрейф камеры на упоре зума»). Точка под
       серединой пальцев едет вместе с ней: щипок заодно и двигает карту. */
    const newW = Math.max(minW, Math.min(maxW, view0.w * pinch.dist0 / d));
    const f = newW / view0.w;
    const rs = rs0 / f;
    setViewBox(clampViewBox({
      x: p.x - (p.x - view0.x) * f - (mx - mid0.x) / rs,
      y: p.y - (p.y - view0.y) * f - (my - mid0.y) / rs,
      w: newW, h: view0.h * f,
    }));
  }
  // Перетаскивание с текущего места — после щипка, когда один палец отпустили.
  function continueDrag(id, type) {
    const pos = pointers.get(id);
    press = {
      id, type, x0: pos.x, y0: pos.y, t0: performance.now(), target: null,
      dragging: true, noTap: true, ox: pos.x, oy: pos.y, view0: {...cur}, rs: pxPerUnit(cur),
    };
    samples = [];
    busyDrag = true; refreshBusy();
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    // Первое касание нового жеста — забываем касания, чей pointerup потерялся
    // (иначе «висящий» палец превратил бы следующий тап в щипок).
    if (e.isPrimary && pointers.size) { pointers.clear(); pinch = null; press = null; busyPinch = false; }
    if (pointers.size >= 2) return;          // третий палец не участвует
    try { svg.setPointerCapture(e.pointerId); } catch (err) {}
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    const type = kindOf(e.pointerType);
    const wasFling = stopFling();
    stopWheel();
    // Приближение двойным тапом касание не обрывает (цепочка тапов), любое
    // другое движение камеры — обрывает, как раньше.
    const zooming = animKind === 'zoom';
    if (!zooming) cancelAnim();

    if (pointers.size === 1) {
      // Реальная цель — ДО захвата: дальше события таргетятся на сам svg.
      press = {
        id: e.pointerId, type, x0: e.clientX, y0: e.clientY, t0: performance.now(),
        target: e.target, dragging: false, noTap: wasFling, chain: zooming,
        longPressed: false,
      };
      samples = [{t: press.t0, x: e.clientX, y: e.clientY}];
      cancelLongPress();
      const longPress = !press.noTap && !zooming && findLongPressHandler(e.target);
      if (longPress) {
        const p0 = press;
        longPressTimer = setTimeout(() => {
          longPressTimer = null;
          if (press !== p0 || p0.dragging || pinch) return;
          if (longPress(e) !== false) {
            p0.longPressed = true;
            busyDrag = false; refreshBusy();
          }
        }, LONG_PRESS_MS);
      }
    } else {
      // Второй палец: щипок. Одиночное касание тапом уже не станет.
      cancelLongPress();
      cancelAnim();
      if (press) press.noTap = true;
      press = null;
      busyDrag = false;
      startPinch();
    }
  });

  svg.addEventListener('pointermove', (e) => {
    const pos = pointers.get(e.pointerId);
    if (!pos) return;
    e.preventDefault();
    pos.x = e.clientX; pos.y = e.clientY;
    if (pinch) { if (pointers.size === 2) movePinch(); return; }
    const p = press;
    if (!p || p.id !== e.pointerId || p.longPressed) return;
    const now = performance.now();
    samples.push({t: now, x: e.clientX, y: e.clientY});
    while (samples.length > 2 && now - samples[0].t > FLING_SAMPLE_MS) samples.shift();
    if (!p.dragging) {
      const dx = e.clientX - p.x0, dy = e.clientY - p.y0;
      const d = Math.hypot(dx, dy);
      if (d > LONG_PRESS_SLOP) cancelLongPress();
      const slop = TAP_SLOP[p.type];
      if (d <= slop) return;
      // Пошло перетаскивание: порог вычитаем, чтобы карта не прыгнула.
      p.dragging = true; p.noTap = true;
      cancelLongPress();
      cancelAnim();
      p.ox = p.x0 + dx / d * slop; p.oy = p.y0 + dy / d * slop;
      p.view0 = {...cur}; p.rs = pxPerUnit(cur);
      busyDrag = true; refreshBusy();
    }
    setViewBox(clampViewBox({
      x: p.view0.x - (e.clientX - p.ox) / p.rs,
      y: p.view0.y - (e.clientY - p.oy) / p.rs,
      w: p.view0.w, h: p.view0.h,
    }));
  });

  function endPointer(e, cancelled) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    try { svg.releasePointerCapture(e.pointerId); } catch (err) {}

    if (pinch) {
      if (pointers.size < 2) {
        pinch = null;
        busyPinch = false;
        if (pointers.size === 1 && !cancelled) continueDrag(pointers.keys().next().value, kindOf(e.pointerType));
        else refreshBusy();
      }
      return;
    }
    const p = press;
    if (!p || p.id !== e.pointerId) return;
    press = null;
    cancelLongPress();
    if (p.longPressed || cancelled) { busyDrag = false; refreshBusy(); return; }
    if (p.dragging) {
      samples.push({t: performance.now(), x: e.clientX, y: e.clientY});
      if (!startFling(p.rs)) { busyDrag = false; refreshBusy(); }
      return;
    }
    if (!p.noTap) handleTap(e, p);
  }
  svg.addEventListener('pointerup', (e) => endPointer(e, false));
  svg.addEventListener('pointercancel', (e) => endPointer(e, true));

  // Двойной тап мимо маркеров → приблизить. true — это был второй тап.
  function doubleTap(e, p) {
    const lt = lastTap;
    if (lt && lt.type === p.type && p.t0 - lt.t <= DOUBLE_TAP_MS[p.type]
        && Math.hypot(e.clientX - lt.x, e.clientY - lt.y) <= DOUBLE_TAP_PX[p.type]) {
      lastTap = null;
      zoomStep(e.clientX, e.clientY);
      return true;
    }
    lastTap = {x: e.clientX, y: e.clientY, t: performance.now(), type: p.type};
    return false;
  }

  function handleTap(e, p) {
    const assist = !!(tapAssist && tapAssist());
    // Тап во время приближения двойным тапом — только часть цепочки тапов:
    // маркер, оказавшийся под пальцем посреди зума, не открываем.
    if (p.chain) { if (assist) doubleTap(e, p); return; }
    const tap = findTapHandler(p.target);
    if (tap) { lastTap = null; tap(e); return; }
    if (assist) {
      if (p.type !== 'mouse') {
        const near = findNearTap(e.clientX, e.clientY);
        if (near) { lastTap = null; near(e); return; }
      }
      if (doubleTap(e, p)) return;
    }
    if (onClick) onClick(clientToSvgPoint(e.clientX, e.clientY), e);
  }

  return {
    /* Перетаскивание карты, начатое НЕ на самой карте (на кнопке угла поверх
       неё, v=158, замечание игрока: зацепил пальцем «Справочник» — карта не
       двигается). Вызывающий сам следит за пальцем и отдаёт смещение от
       точки нажатия; математика та же, что у обычного драга выше. */
    // Первое смещение (порог вызывающего) вычитается — карта не прыгает;
    // отпускание с разгона — та же инерция, что у обычного драга.
    externalPan: () => {
      cancelAnim(); stopFling(); stopWheel();
      const start = {...cur}, rs = pxPerUnit(cur);
      let origin = null;
      samples = [];
      busyDrag = true; refreshBusy();
      return {
        move: (dx, dy) => {
          if (!origin) origin = {x: dx, y: dy};
          samples.push({t: performance.now(), x: dx, y: dy});
          if (samples.length > 2 && samples[samples.length - 1].t - samples[0].t > FLING_SAMPLE_MS) samples.shift();
          setViewBox(clampViewBox({x: start.x - (dx - origin.x) / rs, y: start.y - (dy - origin.y) / rs, w: start.w, h: start.h}));
        },
        end: () => { if (!startFling(rs)) { busyDrag = false; refreshBusy(); } },
      };
    },
    zoomIn: () => { cancelAnim(); zoomAt(cur.x+cur.w/2, cur.y+cur.h/2, 1.25); },
    zoomOut: () => { cancelAnim(); zoomAt(cur.x+cur.w/2, cur.y+cur.h/2, 1/1.25); },
    reset: () => { cancelAnim(); stopFling(); stopWheel(); setViewBox({...initialViewBox}); },
    centerOn: (x, y) => { stopFling(); setViewBox(clampViewBox({x: x-cur.w/2, y: y-cur.h/2, w:cur.w, h:cur.h})); },
    // Центрирует на (x,y) на ФИКСИРОВАННОМ уровне приближения targetWidth (в единицах
    // viewBox, не зависит от того, насколько был зумлен пользователь до этого — в
    // отличие от zoomAt/zoomIn, где новый масштаб считается относительно текущего).
    // Без duration — мгновенно (как centerOn); с duration — плавный анимированный
    // перелёт камеры, по завершении которого вызывается onDone.
    focusOn: (x, y, targetWidth, duration, onDone) => {
      // Инерция и колёсико иначе перебивали бы перелёт кадр за кадром.
      stopFling(); stopWheel();
      const aspect = initialViewBox.h / initialViewBox.w;
      const newW = Math.max(minW, Math.min(maxW, targetWidth));
      const newH = newW * aspect;
      const target = clampViewBox({x: x - newW/2, y: y - newH/2, w: newW, h: newH});
      if (duration) animateViewBox(target, duration, onDone);
      else {
        /* ⚠️ Мгновенная постановка обязана гасить незаконченный перелёт:
           иначе его следующий кадр перезаписал бы только что поставленную
           камеру. Раньше это не проявлялось — окно открывалось, когда
           перелёт уже закончен. С 24.09.2026 окно открывается раньше (см.
           FOCUS_OPEN_SHARE в js/map.js), и тап по вкладке в первые ~300 мс
           уводил бы камеру к прежней точке, а не к выбранной. */
        cancelAnim();
        setViewBox(target);
        if (onDone) onDone();
      }
    },
    getViewBox: () => ({...cur}),
    getInitialViewBox: () => ({...initialViewBox}),
  };
}
