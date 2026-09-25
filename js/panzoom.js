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
     ещё активен (например, палец отпустил один из двух при щипке). */
  let busyDrag = false, busyPinch = false, busyAnim = false;
  function refreshBusy() {
    svg.classList.toggle('panning', busyDrag || busyPinch || busyAnim);
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
  let animFrameId = null;
  function cancelAnim() {
    if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
    if (busyAnim) { busyAnim = false; refreshBusy(); }
  }
  function easeInOutCubic(t) { return t < 0.5 ? 4*t*t*t : 1 - Math.pow(-2*t + 2, 3) / 2; }
  function animateViewBox(target, duration, onDone) {
    cancelAnim();
    busyAnim = true; refreshBusy();
    const start = {...cur};
    const t0 = performance.now();
    function step(now) {
      const t = Math.min(1, (now - t0) / duration);
      const e = easeInOutCubic(t);
      setViewBox({
        x: start.x + (target.x - start.x) * e,
        y: start.y + (target.y - start.y) * e,
        w: start.w + (target.w - start.w) * e,
        h: start.h + (target.h - start.h) * e,
      });
      if (t < 1) {
        animFrameId = requestAnimationFrame(step);
      } else {
        animFrameId = null;
        busyAnim = false; refreshBusy();
        if (onDone) onDone();
      }
    }
    animFrameId = requestAnimationFrame(step);
  }

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    cancelAnim();
    const zoomFactor = Math.pow(1.0015, -e.deltaY);
    const p = clientToSvgPoint(e.clientX, e.clientY);
    zoomAt(p.x, p.y, zoomFactor);
  }, {passive:false});

  let isPanning = false, panStart = null, panViewStart = null, moved = false, downTarget = null;

  /* Долгое нажатие — та же схема, что у тапа: элемент помечается __onLongPress.
     Срабатывает, если палец продержали LONG_PRESS_MS и почти не сдвинули
     (LONG_PRESS_SLOP — дрожание пальца больше 3 px, после которых уже едет
     карта). Обработчик вернул false — нажатие не его, отпускание остаётся
     обычным тапом; иначе тап на отпускании не срабатывает. */
  const LONG_PRESS_MS = 500;
  const LONG_PRESS_SLOP = 10;
  let longPressTimer = null, longPressDone = false;
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

  svg.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    cancelAnim();
    // Запоминаем реальную цель ДО setPointerCapture — после захвата все дальнейшие
    // события (move/up) таргетятся на сам svg, а не на элемент под пальцем,
    // поэтому e.target в pointerup для поиска __onTap уже не годится.
    downTarget = e.target;
    svg.setPointerCapture(e.pointerId);
    isPanning = true; moved = false;
    panStart = {x: e.clientX, y: e.clientY};
    panViewStart = {...cur};
    cancelLongPress();
    longPressDone = false;
    const longPress = findLongPressHandler(e.target);
    if (longPress) {
      longPressTimer = setTimeout(() => {
        longPressTimer = null;
        if (!isPanning || pinch.active) return;
        longPressDone = longPress(e) !== false;
        if (longPressDone) { isPanning = false; busyDrag = false; refreshBusy(); }
      }, LONG_PRESS_MS);
    }
  });

  svg.addEventListener('pointermove', (e) => {
    if (!isPanning) return;
    e.preventDefault();
    const dx = e.clientX - panStart.x, dy = e.clientY - panStart.y;
    if (longPressTimer && Math.hypot(dx, dy) > LONG_PRESS_SLOP) cancelLongPress();
    // Класс вешаем не на pointerdown, а только когда палец реально поехал —
    // иначе подписи моргали бы на каждом обычном тапе по системе/маркеру.
    if (!moved && (Math.abs(dx) > 3 || Math.abs(dy) > 3)) {
      moved = true;
      busyDrag = true; refreshBusy();
    }
    // preserveAspectRatio="xMidYMid meet" на не-квадратном экране оставляет пустые поля
    // по одной из осей — масштаб пикселей должен быть ОДИНАКОВЫМ для x и y (он единый,
    // так как aspect ratio сохраняется), а не считаться раздельно от полной ширины/высоты
    // контейнера, иначе перетаскивание по короткой оси контейнера ощущается слабее.
    const renderScale = Math.min(
      (svg.clientWidth || 1) / panViewStart.w,
      (svg.clientHeight || 1) / panViewStart.h
    );
    const scaleX = 1 / renderScale;
    const scaleY = 1 / renderScale;
    setViewBox(clampViewBox({
      x: panViewStart.x - dx * scaleX,
      y: panViewStart.y - dy * scaleY,
      w: panViewStart.w, h: panViewStart.h
    }));
  });

  svg.addEventListener('pointerup', (e) => {
    cancelLongPress();
    if (longPressDone) {
      // Нажатие уже обработано долгим — отпускание не тап и не конец драга.
      longPressDone = false;
      try { svg.releasePointerCapture(e.pointerId); } catch (err) {}
      return;
    }
    if (isPanning) {
      svg.releasePointerCapture(e.pointerId);
      if (!moved) {
        const tap = findTapHandler(downTarget);
        if (tap) tap(e);
        else if (onClick) onClick(clientToSvgPoint(e.clientX, e.clientY), e);
      }
    }
    isPanning = false;
    busyDrag = false; refreshBusy();
  });
  svg.addEventListener('pointercancel', () => {
    cancelLongPress();
    isPanning = false;
    busyDrag = false; refreshBusy();
  });

  let pinch = {active:false, startDist:0, startView:null, center:null};
  function dist(a,b){ return Math.hypot(b.clientX-a.clientX, b.clientY-a.clientY); }

  svg.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      cancelLongPress();
      cancelAnim();
      pinch.active = true;
      busyPinch = true; refreshBusy();
      pinch.startDist = dist(e.touches[0], e.touches[1]);
      pinch.startView = {...cur};
      const mx = (e.touches[0].clientX + e.touches[1].clientX)/2;
      const my = (e.touches[0].clientY + e.touches[1].clientY)/2;
      pinch.center = clientToSvgPoint(mx, my);
    }
  }, {passive:true});

  svg.addEventListener('touchmove', (e) => {
    if (!pinch.active || e.touches.length !== 2) return;
    e.preventDefault();
    const d = dist(e.touches[0], e.touches[1]);
    const rawF = pinch.startDist / d;
    /* Тот же приём, что и в zoomAt() (грабли №3 — "дрейф камеры на упоре
       зума"): сначала клэмпим ширину под лимиты, ЗАТЕМ пересчитываем РЕАЛЬНО
       применённый коэффициент по клэмпнутой ширине — и уже им двигаем x/y.

       Раньше тут x/y считались по НЕклэмпнутому rawF, а w/h — тоже по
       rawF, но их потом урезал clampViewBox() ПОСЛЕ. На упоре зума (палец
       продолжает щипок, а ширина уже не может ни расти, ни падать дальше
       лимита) получалось: позиция посчитана для одной ширины (rawF), а
       реально применяется другая (клэмпнутая) — с каждым кадром щипка
       camera съезжала в сторону пальцев при зуме до упора и в обратную при
       отдалении до упора. На компьютере не воспроизводилось — там тот же
       баг был бы у колёсика, но zoomAt() его чинит с 12.09.2026; сюда,
       второй путь изменения зума, чинить тогда не догадались (баг
       воспроизводится только жестом двух пальцев, playwright/автотесты
       мышью и колёсиком его не ловят). */
    const newW = Math.max(minW, Math.min(maxW, pinch.startView.w * rawF));
    const f = newW / pinch.startView.w;
    setViewBox(clampViewBox({
      x: pinch.center.x - (pinch.center.x - pinch.startView.x) * f,
      y: pinch.center.y - (pinch.center.y - pinch.startView.y) * f,
      w: newW, h: pinch.startView.h * f
    }));
  }, {passive:false});

  svg.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) {
      pinch.active = false;
      busyPinch = false; refreshBusy();
    }
  });

  return {
    /* Перетаскивание карты, начатое НЕ на самой карте (на кнопке угла поверх
       неё, v=158, замечание игрока: зацепил пальцем «Справочник» — карта не
       двигается). Вызывающий сам следит за пальцем и отдаёт смещение от
       точки нажатия; математика та же, что у обычного драга выше. */
    externalPan: () => {
      cancelAnim();
      const start = {...cur};
      busyDrag = true; refreshBusy();
      return {
        move: (dx, dy) => {
          const rs = Math.min((svg.clientWidth || 1) / start.w, (svg.clientHeight || 1) / start.h);
          setViewBox(clampViewBox({x: start.x - dx / rs, y: start.y - dy / rs, w: start.w, h: start.h}));
        },
        end: () => { busyDrag = false; refreshBusy(); },
      };
    },
    zoomIn: () => { cancelAnim(); zoomAt(cur.x+cur.w/2, cur.y+cur.h/2, 1.25); },
    zoomOut: () => { cancelAnim(); zoomAt(cur.x+cur.w/2, cur.y+cur.h/2, 1/1.25); },
    reset: () => { cancelAnim(); setViewBox({...initialViewBox}); },
    centerOn: (x, y) => setViewBox(clampViewBox({x: x-cur.w/2, y: y-cur.h/2, w:cur.w, h:cur.h})),
    // Центрирует на (x,y) на ФИКСИРОВАННОМ уровне приближения targetWidth (в единицах
    // viewBox, не зависит от того, насколько был зумлен пользователь до этого — в
    // отличие от zoomAt/zoomIn, где новый масштаб считается относительно текущего).
    // Без duration — мгновенно (как centerOn); с duration — плавный анимированный
    // перелёт камеры, по завершении которого вызывается onDone.
    focusOn: (x, y, targetWidth, duration, onDone) => {
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
