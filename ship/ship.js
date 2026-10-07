/* Феном — схема корабля (v3), PixiJS (WebGL). Строго сбоку.
   Силуэт — по боковому виду корабля (ship_side.png, 2000×758), детали — по
   исходному арту. Корпус не сужается под кольцами: кольца уходят в пазы
   обшивки, город внутри — одна полость одного масштаба. Районы — только
   контуры (без картинок из PSB): передние нарисованы по носу, городские
   перенесены из разметки PSB (build_schema.py → schema.json).
   Единицы мира = пиксели бокового вида × 10. ?art=1 — подложить вид сбоку. */
(async () => {
  const SCHEMA = await (await fetch('schema.json?' + Date.now())).json();
  const S = SCHEMA.scale;
  const P = (x, y) => [x * S, y * S];
  const PL = pts => pts.flatMap(([x, y]) => [x * S, y * S]);
  const TOP = 170, BOT = 540, CY = (TOP + BOT) / 2 * S, HH = (BOT - TOP) / 2 * S;   // корпус полной высоты
  // кольцо: R — наружная поверхность (синяя лента), th — толщина, bw — половина ширины вдоль корабля,
  // c/c2 — фаски наружных/внутренних рёбер; k — насколько кольца развёрнуты к зрителю
  const RING = {R: 360 * S, th: 46 * S, bw: 30 * S, c: 8 * S, c2: 6 * S, k: 0.34, depth: 0.05, speed: 0.07};
  RING.Ri = RING.R - RING.th;
  const RINGS = [{cx: 1220 * S, cy: CY, dir: 1, phase: 0}, {cx: 1424 * S, cy: CY, dir: -1, phase: 0.5}];
  const BOUNDS = {x0: -300, y0: -1600, x1: 24600, y1: 9200};     // справа — место под факел двигателя
  const C = {hull: 0xa9b5b6, hullHi: 0xbac6c7, hullLo: 0x95a2a4, hullDark: 0x7f8c8f, line: 0x0d1114, navy: 0x1f3b7d, navyDk: 0x14275a,
             dash: 0xe9f0f4, hole: 0x1b2427, hole2: 0x2a3538, glow: 0x7fe3ff, warm: 0xffd27a};
  const ZONE_COLORS = {
    'Капитанский мостик': 0x5b8cff, 'Район модулей': 0xffb34d, 'Район космопорта': 0x4fd1c5,
    'Район ферм': 0x8bd36a, 'Район лесов': 0x4caf50, 'Район аквакультуры': 0x38a3d6, 'Пригород': 0xc9a46a,
    'Спальный район': 0x9c8cff, 'Центральный город': 0xffe066, 'Заводской район': 0xb07a4f, 'Ночной район': 0xd65db1,
    'Пустоши': 0xcf8f5a, 'Тюремный район': 0x8a8a8a, 'Район новой застройки': 0xe0c070, 'Район Фронтира': 0xe06a5a,
  };

  const stageEl = document.getElementById('stage');
  const app = new PIXI.Application();
  await app.init({resizeTo: stageEl, background: '#06070b', antialias: true, preference: 'webgl',
                  resolution: Math.min(window.devicePixelRatio || 1, 2), autoDensity: true});
  stageEl.appendChild(app.canvas);
  const gl = app.renderer.gl;
  const maxTex = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : '?';

  // ---------- камера (низ экрана занят панелью) ----------
  const cam = {x: 10000, y: CY, z: 0.05};
  const sw = () => app.screen.width, sh = () => app.screen.height;
  const dockH = () => (document.getElementById('dock')?.offsetHeight || 0) + 10;
  const cyS = () => (sh() - dockH()) / 2;
  // центр экрана — раз в кадр: высота панели из DOM, а toScreen зовётся тысячи раз за кадр
  let SCX = 0, SCY = 0;
  const syncCenter = () => { SCX = sw() / 2; SCY = cyS(); };
  const toScreen = (x, y, d = 0) => { const s = cam.z * (1 + d); return [SCX + (x - cam.x) * s, SCY + (y - cam.y) * s]; };
  const toWorld = (sx, sy) => [cam.x + (sx - SCX) / cam.z, cam.y + (sy - SCY) / cam.z];
  const applyLayer = (c, d = 0) => { const s = cam.z * (1 + d); c.scale.set(s); c.position.set(SCX - cam.x * s, SCY - cam.y * s); };
  const fitZoom = (b, pad = 0.92) => Math.min(sw() / (b.x1 - b.x0), (sh() - dockH()) / (b.y1 - b.y0)) * pad;
  const Z_MAX = 1.2;
  const zMin = () => fitZoom(BOUNDS, 0.95) * 0.8;
  function clampCam() {
    cam.z = Math.min(Z_MAX, Math.max(zMin(), cam.z));
    const hw = sw() / 2 / cam.z, hh = (sh() - dockH()) / 2 / cam.z;
    const cx = (BOUNDS.x0 + BOUNDS.x1) / 2, cy = (BOUNDS.y0 + BOUNDS.y1) / 2;
    cam.x = hw * 2 >= BOUNDS.x1 - BOUNDS.x0 ? cx : Math.min(BOUNDS.x1 - hw, Math.max(BOUNDS.x0 + hw, cam.x));
    cam.y = hh * 2 >= BOUNDS.y1 - BOUNDS.y0 ? cy : Math.min(BOUNDS.y1 - hh, Math.max(BOUNDS.y0 + hh, cam.y));
  }

  // ---------- звёзды ----------
  const starTex = (() => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
    const g = cv.getContext('2d');
    for (let i = 0; i < 900; i++) {
      const r = Math.random() ** 3 * 1.6 + 0.3, a = 0.25 + Math.random() * 0.75;
      g.fillStyle = Math.random() < 0.12 ? `rgba(180,200,255,${a})` : Math.random() < 0.06 ? `rgba(255,220,190,${a})` : `rgba(255,255,255,${a})`;
      g.beginPath(); g.arc(Math.random() * 1024, Math.random() * 1024, r, 0, 7); g.fill();
    }
    return PIXI.Texture.from(cv);
  })();
  const stars = new PIXI.TilingSprite({texture: starTex, width: sw(), height: sh()});

  // ---------- слои ----------
  // кольца — сетки треугольников (дальняя половина под корпусом, ближняя над ним)
  const mkMesh = () => new PIXI.Mesh({geometry: new PIXI.MeshGeometry({positions: new Float32Array(6), uvs: new Float32Array(6), indices: new Uint32Array([0, 1, 2])}),
                                      texture: PIXI.Texture.WHITE});
  const clearMesh = m => { m.geometry.positions = new Float32Array(6); m.geometry.uvs = new Float32Array(6); m.geometry.indices = new Uint32Array([0, 1, 2]); };
  const ringsBack = mkMesh();
  const world = new PIXI.Container();
  const artC = new PIXI.Container();
  const hullG = new PIXI.Graphics(), zonesG = new PIXI.Graphics(), detailG = new PIXI.Graphics();
  const sternG = new PIXI.Graphics(), turbG = new PIXI.Graphics(), hiG = new PIXI.Graphics();
  const ringsFront = mkMesh();
  const zoneLabels = new PIXI.Container(), partLabels = new PIXI.Container(), editG = new PIXI.Graphics();
  world.addChild(artC, hullG, zonesG, detailG, sternG, turbG, hiG);
  app.stage.addChild(stars, ringsBack, world, ringsFront, zoneLabels, partLabels, editG);
  const artTop = new PIXI.Container(); app.stage.addChild(artTop);

  if (new URLSearchParams(location.search).get('art')) {
    const a = new PIXI.Sprite(await PIXI.Assets.load('ship_side.png'));
    a.width = 2000 * S; a.height = 758 * S; a.alpha = 0.45; artC.addChild(a); world.removeChild(artC); artTop.addChild(artC);
  }

  // ---------- силуэт корабля (пиксели арта) ----------
  function bez(p0, c1, c2, p1, n = 18) {
    const out = [];
    for (let i = 1; i <= n; i++) {
      const t = i / n, u = 1 - t;
      out.push([u ** 3 * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t ** 3 * p1[0],
                u ** 3 * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t ** 3 * p1[1]]);
    }
    return out;
  }
  // Нос выше и ниже города (FT/FB); у спойлера корпус сгибается и дальше идёт на уровне
  // города до самой кормы — без сужения под кольцами. Купол — те же кривые, что в build_schema.py.
  const FT = 146, FB = 572;
  const DOME = [...bez([211, 334], [222, 292], [292, 214], [410, 178]), ...bez([410, 178], [470, 160], [540, 148], [640, FT])];
  const BEND_T = [[800, FT], [836, 157], [872, 165], [910, TOP]], BEND_B = [[910, BOT], [872, 546], [836, 555], [800, 567], [786, FB]];
  // кольца сидят на обоймах вокруг корпуса (рисует ship.svg) — кольцевой жёлоб, в который входят сваи лифтов;
  // силуэт корпуса без выреза. NW/ND — размеры шарнира для запасного рисунка кодом
  const NW = 6, ND = 15, RX = RINGS.map(r => r.cx / S);
  const HULL = [[10, 385], [51, 378], [93, 394], [130, 402], [168, 407], [210, 400], [253, 386], [272, 366], [282, 362],
    [250, 352], [211, 334], ...DOME, ...BEND_T, [1602, TOP], [1602, BOT], ...BEND_B, [330, FB], [300, 563], [264, 541],
    [168, 494], [157, 483], [72, 428], [10, 392]];
  const domeY = x => { for (let i = 1; i < DOME.length; i++) if (DOME[i][0] >= x) { const [ax, ay] = DOME[i - 1], [bx, by] = DOME[i]; return ay + (by - ay) * (x - ax) / (bx - ax); } return FT; };
  // разрез: мостик (под куполом, над визором), клинок (модули и космопорт), город
  const BRIDGE_IN = 26;                                             // обшивка купола над мостиком (в build_schema.py так же)
  const CAV_BRIDGE = [[258, 322], ...DOME.filter(([x]) => x > 272 && x < 556).map(([x, y]) => [x, y + BRIDGE_IN]), [560, domeY(560) + BRIDGE_IN],
    [560, 328], [362, 322], [290, 310]];
  const CAV_JAW = [[178, 409], [230, 394], [262, 374], [282, 366], [560, 362], [560, 544],
    [340, 546], [296, 538], [256, 522], [185, 486], [178, 484]];
  const CAV_CITY = [[560, 192], [1482, 192], [1482, 522], [560, 522]];
  // корма — обводка по боковому виду: передняя плита с прямыми рваными гранями, за ней
  // задняя плита в тени (видна слева, в V-вырезе и в нижней щели). Точки — пиксели
  // бокового вида; AX: масштаб SK вокруг оси хребта, задняя плита — от конца корпуса.
  const SK = 1.15, AX = ([x, y]) => [1546 + (x - 1540) * SK, CY / S + (y - 397) * SK];   // центр кормы — на оси корпуса
  const STERN = [[1583, 163], [1620, 130], [1735, 133], [1712, 163], [1733, 210], [1763, 217], [1788, 247], [1832, 133], [1900, 130],
    [1918, 157], [1929, 177], [1913, 177], [1913, 184], [1933, 187], [1950, 228], [1925, 231], [1925, 237], [1953, 239], [1982, 302],
    [1945, 307], [1986, 355], [1962, 400], [1988, 403], [1970, 443], [1928, 443], [1927, 452], [1945, 457], [1895, 550],
    [1903, 552], [1883, 589], [1813, 591], [1787, 466], [1752, 498], [1718, 501], [1703, 540], [1727, 575], [1693, 578], [1655, 658],
    [1562, 665], [1612, 412], [1612, 300]].map(AX);
  // задняя плита — тот же силуэт, сдвинут к носу; её левая кромка — прямая (от верхнего угла до нижнего)
  const STERN_SIDE = (() => {
    const p = STERN.map(([x, y]) => [x - 24, y + 2]), n = p.length, a = p[0], b = p[n - 3];   // [1583,163] и [1562,665]
    for (const k of [n - 2, n - 1]) { const u = (p[k][1] - a[1]) / (b[1] - a[1]); p[k] = [a[0] + (b[0] - a[0]) * u, p[k][1]]; }
    return p;
  })();
  const STERN_EDGE_X = y => {                                        // левая кромка передней плиты на высоте y (мир/S)
    const E = [[1583, 163], [1612, 300], [1612, 412], [1562, 665]].map(AX);
    for (let i = 0; i < E.length - 1; i++) if (y >= E[i][1] && y <= E[i + 1][1]) return E[i][0] + (E[i + 1][0] - E[i][0]) * (y - E[i][1]) / (E[i + 1][1] - E[i][1]);
    return E[0][0];
  };
  const STERN_PANELS = [
    [[1665, 171], [1692, 171], [1715, 219], [1675, 219]],               // окно верхнего крыла
    [[1622, 310], [1690, 311], [1700, 348], [1629, 347]],               // короб слева посередине
    [[1786, 316], [1935, 316], [1967, 351], [1801, 350]],               // лицо балки
    [[1780, 423], [1916, 419], [1889, 439], [1793, 440]],               // скос под балкой
    [[1627, 447], [1765, 448], [1740, 480], [1698, 483], [1650, 591], [1597, 592]],   // большая панель нижнего крыла
    [[1843, 147], [1848, 147], [1825, 239], [1820, 237]],               // прорезь правого зубца
  ].map(p => p.map(AX));
  const STERN_TRIS = [[[1742, 313], [1760, 348], [1726, 348]], [[1726, 366], [1762, 366], [1743, 392]]].map(p => p.map(AX));
  const STERN_UNDER = [[1785, 357], [1985, 355], [1962, 400], [1792, 401]].map(AX);   // нижняя грань балки-короба
  const STERN_BOXES = [[[1612, 301], [1700, 302], [1717, 355], [1618, 355]], [[1767, 305], [1943, 308], [1985, 355], [1785, 357]]].map(p => p.map(AX));
  const STERN_VENTS = [[[1616, 245], [1763, 250], [1773, 283], [1625, 281]]].map(p => p.map(AX));     // длинная решётка
  const STERN_SLOTS = [[1812, 257], [1878, 257], [1889, 283], [1827, 284]].map(AX);                    // решётка-короб с прорезями
  // геометрия для сборки черновой модели в Blender (blender_ship.py), единицы — пиксели бокового вида
  window.__geom = () => ({TOP, BOT, FT, FB, CY: CY / S, HH: HH / S, HULL, DOME, BEND_T, BEND_B, NW, ND, RX,
    CAV_BRIDGE, CAV_JAW, CAV_CITY, BRIDGE_IN, STERN, STERN_SIDE, STERN_UNDER, STERN_BOXES, STERN_PANELS, STERN_TRIS, STERN_VENTS, STERN_SLOTS,
    STERN_EDGE: [[1583, 163], [1612, 300], [1612, 412], [1562, 665]].map(AX),
    RING: {R: RING.R / S, th: RING.th / S, bw: RING.bw / S, c: RING.c / S, c2: RING.c2 / S, k: RING.k}});


  // ---------- статичная часть корабля из ship.svg ----------
  // Корпус, детали и корма — файл ship.svg (правится в Inkscape). Кодом — только
  // кольца, лифты, районы. Нет файла или ?code=1 — рисует код ниже (по нему же
  // выгружается файл: __exportSvg). Единицы файла — пиксели бокового вида.
  // Слои по порядку: «Корпус…» — под районами, «Детали…» — над районами, «Корма…» —
  // над всем; слой с другим именем идёт туда же, куда предыдущий. «Референс…» и
  // «Ориентир…» пропускаются.
  // Вектор (быстро, чётко на любом зуме): заливки, обводки, градиенты, дыры.
  // Запекается браузером в картинку при загрузке (мягкое, на кадр не влияет):
  // фигуры с размытием/фильтром, маской, обрезкой, клоны (use), текст и весь слой,
  // чьё имя начинается с «Мягкое». Режим наложения слоя — по имени: «умножение»,
  // «экран», «добавление» (свечение).
  // Тёмные обводки (яркость < 15%) держат толщину на экране, прочие — в единицах корабля.
  // мигалки: кружки слоя «Мигалки…» в ship.svg — рисует и анимирует код (цвет — заливка; data-mode
  // blink | strobe | pulse | flicker | room (окно: свет то включается, то гаснет), data-period и data-phase в секундах)
  const LAMPS = [];
  const T_STATIC = performance.now();
  const STATIC_REF = {v: await (async () => {
    if (new URLSearchParams(location.search).has('code')) return null;
    let txt;
    try { const r = await fetch('ship.svg?' + Date.now()); if (!r.ok) return null; txt = await r.text(); } catch (e) { return null; }
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const root0 = doc.documentElement;
    if (!root0 || root0.nodeName !== 'svg') return null;
    root0.querySelectorAll('script, foreignObject').forEach(n => n.remove());
    for (const n of root0.querySelectorAll('*')) for (const a of [...n.attributes]) if (/^on/i.test(a.name)) n.removeAttribute(a.name);
    root0.querySelectorAll('image').forEach(n => { const h = n.getAttribute('href') || n.getAttribute('xlink:href') || ''; if (!/^data:image\//.test(h)) n.remove(); });
    const host = document.createElement('div');
    host.style.cssText = 'position:fixed;left:0;top:0;width:10px;height:10px;overflow:hidden;opacity:0;pointer-events:none';
    const root = document.importNode(root0, true);
    host.appendChild(root); document.body.appendChild(host);
    const DM = q => new DOMMatrix([q.a, q.b, q.c, q.d, q.e, q.f]);      // getCTM бывает SVGMatrix без transformPoint
    const inv = DM(root.getCTM()).inverse();
    const num = v => { const x = parseFloat(v); return Number.isFinite(x) ? x : 0; };
    const rgb = v => { const m = /rgba?\(([^)]+)\)/.exec(v || ''); if (!m) return null; const [r, g, b, a] = m[1].split(',').map(Number); return {c: (r << 16) | (g << 8) | b, a: a ?? 1}; };
    const urlId = v => { const m = /url\(\s*["']?#([^"')]+)["']?\s*\)/.exec(v || ''); return m ? m[1] : null; };
    const byId = id => { try { return root.querySelector('#' + CSS.escape(id)); } catch (e) { return null; } };
    const dOf = el => {
      const g = n => num(el.getAttribute(n));
      switch (el.nodeName) {
        case 'path': return el.getAttribute('d') || '';
        case 'rect': {
          const x = g('x'), y = g('y'), w = g('width'), h = g('height');
          const rx = Math.min(w / 2, g('rx') || g('ry')), ry = Math.min(h / 2, g('ry') || rx);
          if (!rx) return `M${x} ${y}h${w}v${h}h${-w}Z`;
          return `M${x + rx} ${y}h${w - 2 * rx}a${rx} ${ry} 0 0 1 ${rx} ${ry}v${h - 2 * ry}a${rx} ${ry} 0 0 1 ${-rx} ${ry}h${2 * rx - w}a${rx} ${ry} 0 0 1 ${-rx} ${-ry}v${2 * ry - h}a${rx} ${ry} 0 0 1 ${rx} ${-ry}Z`;
        }
        case 'circle': case 'ellipse': {
          const c = el.nodeName === 'circle', cx = g('cx'), cy = g('cy'), rx = c ? g('r') : g('rx'), ry = c ? g('r') : g('ry');
          return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0Z`;
        }
        case 'polygon': case 'polyline': {
          const p = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
          let d = ''; for (let i = 0; i + 1 < p.length; i += 2) d += (i ? 'L' : 'M') + p[i] + ' ' + p[i + 1];
          return d + (el.nodeName === 'polygon' ? 'Z' : '');
        }
        case 'line': return `M${g('x1')} ${g('y1')}L${g('x2')} ${g('y2')}`;
      }
      return '';
    };
    // градиент SVG → FillGradient в координатах мира (у сложных — запекание)
    const frac = (v, def) => { if (v == null || v === '') return def; return /%$/.test(v) ? parseFloat(v) / 100 : num(v); };
    function gradientOf(el, id, m, op) {
      const chain = [], seen = new Set();
      for (let n = byId(id); n && !seen.has(n) && /Gradient$/.test(n.nodeName); ) {
        seen.add(n); chain.push(n);
        const h = n.getAttribute('href') || n.getAttribute('xlink:href');
        n = h && h[0] === '#' ? byId(h.slice(1)) : null;
      }
      if (!chain.length) return null;
      const attr = k => { for (const c of chain) if (c.hasAttribute(k)) return c.getAttribute(k); return null; };
      const sEl = chain.find(c => c.querySelector('stop'));
      if (!sEl) return null;
      let last = 0;
      const stops = [...sEl.querySelectorAll('stop')].map(st => {
        const cs = getComputedStyle(st), c = rgb(cs.stopColor) || {c: 0, a: 1};
        const a = c.a * (cs.stopOpacity === '' ? 1 : num(cs.stopOpacity)) * op;
        last = Math.max(last, Math.min(1, Math.max(0, frac(st.getAttribute('offset'), 0))));
        return {offset: last, color: `rgba(${c.c >> 16},${(c.c >> 8) & 255},${c.c & 255},${+a.toFixed(4)})`};
      });
      let T = m;
      if ((attr('gradientUnits') || 'objectBoundingBox') === 'objectBoundingBox') {
        let b; try { b = el.getBBox(); } catch (e) { return null; }
        T = T.multiply(new DOMMatrix([b.width, 0, 0, b.height, b.x, b.y]));
      }
      const gtEl = chain.find(c => c.hasAttribute('gradientTransform'));
      if (gtEl) { const t = gtEl.gradientTransform.baseVal.consolidate(); if (t) { const q = t.matrix; T = T.multiply(new DOMMatrix([q.a, q.b, q.c, q.d, q.e, q.f])); } }
      const P = (x, y) => { const p = T.transformPoint({x, y}); return {x: p.x * S, y: p.y * S}; };
      if (chain[0].nodeName === 'linearGradient') {
        return new PIXI.FillGradient({type: 'linear', textureSpace: 'global', colorStops: stops,
          start: P(frac(attr('x1'), 0), frac(attr('y1'), 0)), end: P(frac(attr('x2'), 1), frac(attr('y2'), 0))});
      }
      const cx = frac(attr('cx'), 0.5), cy = frac(attr('cy'), 0.5), r = frac(attr('r'), 0.5);
      const fx = frac(attr('fx'), cx), fy = frac(attr('fy'), cy);
      // эллипс — образ окружности: оси через разложение 2×2
      const E = (T.a + T.d) / 2, Fv = (T.a - T.d) / 2, G = (T.b + T.c) / 2, H = (T.b - T.c) / 2;
      const Q = Math.hypot(E, H), R = Math.hypot(Fv, G), s1 = Q + R, s2 = Math.abs(Q - R);
      const rot = (Math.atan2(G, Fv) + Math.atan2(H, E)) / 2;
      return new PIXI.FillGradient({type: 'radial', textureSpace: 'global', colorStops: stops, center: P(fx, fy), innerRadius: 0,
        outerCenter: P(cx, cy), outerRadius: r * s1 * S, scale: s1 ? s2 / s1 : 1, rotation: rot});
    }
    const paint = (el, prop, opProp, m, op) => {
      const cs = getComputedStyle(el), v = cs[prop], o = (cs[opProp] === '' ? 1 : num(cs[opProp])) * op;
      const gid = urlId(v);
      if (gid) { const fg = gradientOf(el, gid, m, o); return fg ? {fill: fg, alpha: 1} : null; }
      const c = rgb(v); return c ? {color: c.c, alpha: c.a * o} : null;
    };
    const DRAW = 'path, rect, circle, ellipse, polygon, polyline, line, text, use, image';
    const inDefs = n => !!n.closest('defs, clipPath, mask, pattern, marker, symbol, linearGradient, radialGradient, filter');
    const hasFx = n => { const cs = getComputedStyle(n); return n.hasAttribute('filter') || n.hasAttribute('mask') || n.hasAttribute('clip-path') ||
      (cs.filter && cs.filter !== 'none') || (cs.mask && cs.mask !== 'none') || (cs.clipPath && cs.clipPath !== 'none'); };
    let maxBlur = 0;
    root.querySelectorAll('feGaussianBlur').forEach(b => { for (const v of (b.getAttribute('stdDeviation') || '0').split(/[\s,]+/)) maxBlur = Math.max(maxBlur, num(v)); });
    const blendOf = l => /умнож|multiply/i.test(l) ? 'multiply' : /экран|screen|освет/i.test(l) ? 'screen' : /добав|свеч|add/i.test(l) ? 'add' : 'normal';

    const chunks = [];                     // {target, kind: 'vec', items} | {target, kind: 'bake', els, blend}
    let target = 'hull', bakeN = 0;
    for (const layer of root.children) {
      if (layer.nodeName !== 'g') continue;
      const label = layer.getAttribute('inkscape:label') || layer.getAttribute('id') || '';
      if (/^(ref|референс|ориентир)/i.test(label) || getComputedStyle(layer).display === 'none') continue;
      if (/^(мигалк|blink)/i.test(label)) {
        for (const el of layer.querySelectorAll('circle, ellipse, path, rect')) {
          let b; try { b = el.getBBox(); } catch (e) { continue; }
          const m = inv.multiply(DM(el.getCTM())), c = m.transformPoint({x: b.x + b.width / 2, y: b.y + b.height / 2});
          const sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)), col = rgb(getComputedStyle(el).fill) || {c: 0xffffff};
          const nm = k => { const v = parseFloat(el.getAttribute('data-' + k)); return Number.isFinite(v) ? v : null; };
          const cs = getComputedStyle(el);
          if (el.nodeName === 'path' && cs.fill === 'none' && rgb(cs.stroke)) {                // штрих-окно: от первой до последней точки
            let a, z; try { const L = el.getTotalLength(); a = m.transformPoint(el.getPointAtLength(0)); z = m.transformPoint(el.getPointAtLength(L)); } catch (e) { continue; }
            LAMPS.push({seg: true, x: (a.x + z.x) / 2, y: (a.y + z.y) / 2, len: Math.hypot(z.x - a.x, z.y - a.y), ang: Math.atan2(z.y - a.y, z.x - a.x),
                        r: num(cs.strokeWidth) * sc, color: rgb(cs.stroke).c, mode: el.getAttribute('data-mode') || 'room', period: nm('period') ?? 6, phase: nm('phase') ?? 0});
            continue;
          }
          LAMPS.push({x: c.x, y: c.y, r: Math.max(b.width, b.height) / 2 * sc, color: col.c, mode: el.getAttribute('data-mode') || 'blink',
                      period: nm('period') ?? 1.6, phase: nm('phase') ?? 0});
        }
        continue;
      }
      if (/корма|stern/i.test(label)) target = 'stern'; else if (/детал|detail/i.test(label)) target = 'detail'; else if (/корпус|hull/i.test(label)) target = 'hull';
      const soft = /^(мягк|soft)/i.test(label), blend = blendOf(label);
      const push = (kind, x) => {
        let c = chunks[chunks.length - 1];
        if (!c || c.kind !== kind || c.target !== target || c.blend !== blend || c.layer !== layer) { c = {target, kind, blend, layer, items: [], els: []}; chunks.push(c); }
        (kind === 'vec' ? c.items : c.els).push(x);
      };
      for (const el of layer.querySelectorAll(DRAW)) {
        if (inDefs(el)) continue;
        let op = 1, hidden = false, fx = false;
        for (let n = el; n && n !== layer.parentNode; n = n.parentNode) {
          const cs = getComputedStyle(n);
          if (cs.display === 'none' || cs.visibility === 'hidden') { hidden = true; break; }
          if (cs.opacity !== '') op *= num(cs.opacity);
          if (n !== layer && hasFx(n)) fx = true;
        }
        if (hidden) continue;
        if (soft || fx || el.nodeName === 'text' || el.nodeName === 'use' || el.nodeName === 'image') { el.setAttribute('data-bk', String(bakeN++)); push('bake', el); continue; }
        const d = dOf(el); if (!d) continue;
        const m = inv.multiply(DM(el.getCTM()));
        let path;
        try { path = new PIXI.GraphicsPath(d).transform(new PIXI.Matrix(m.a * S, m.b * S, m.c * S, m.d * S, m.e * S, m.f * S)); } catch (e) { continue; }
        path.checkForHoles = true;
        const cs = getComputedStyle(el), sc = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c));
        const fill = el.nodeName !== 'line' && el.nodeName !== 'polyline' ? paint(el, 'fill', 'fillOpacity', m, op) : null;
        let stroke = null;
        if (num(cs.strokeWidth) > 0) {
          const p = paint(el, 'stroke', 'strokeOpacity', m, op);
          if (p) {
            const lum = p.fill ? 1 : (0.3 * (p.color >> 16) + 0.59 * ((p.color >> 8) & 255) + 0.11 * (p.color & 255)) / 255;
            stroke = {...p, w: num(cs.strokeWidth) * sc, dark: lum < 0.15,
                      join: ['round', 'bevel'].includes(cs.strokeLinejoin) ? cs.strokeLinejoin : 'miter',
                      cap: ['round', 'square'].includes(cs.strokeLinecap) ? cs.strokeLinecap : 'butt'};
          }
        }
        if (fill || stroke) push('vec', {path, fill, stroke});
      }
    }
    // запекание: каждый кусок — свой обрезанный по рамке SVG, отрисованный браузером
    const svgText = new XMLSerializer().serializeToString(root);
    for (const c of chunks) {
      if (c.kind !== 'bake') continue;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const el of c.els) {
        let b; try { b = el.getBBox(); } catch (e) { continue; }
        const m = inv.multiply(DM(el.getCTM()));
        for (const [x, y] of [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]) {
          const p = m.transformPoint({x, y}); x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
        }
      }
      if (!(x1 > x0 && y1 > y0)) continue;
      const pad = 3 + 3.2 * maxBlur + 2;
      x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
      const w = x1 - x0, h = y1 - y0, res = Math.min(2, 4096 / Math.max(w, h));   // мягкому много не надо: 2 пикселя на единицу
      const keep = new Set(c.els.map(e => e.getAttribute('data-bk')));
      const d2 = new DOMParser().parseFromString(svgText, 'image/svg+xml'), r2 = d2.documentElement;
      for (const n of [...r2.querySelectorAll(DRAW)]) if (!inDefs(n) && !keep.has(n.getAttribute('data-bk'))) n.remove();
      for (const l of [...r2.children]) {
        const lb = l.getAttribute('inkscape:label') || l.getAttribute('id') || '';
        if (l.nodeName === 'g' && /^(ref|референс|ориентир)/i.test(lb)) l.remove();
      }
      r2.setAttribute('viewBox', `${x0} ${y0} ${w} ${h}`);
      r2.setAttribute('width', Math.ceil(w * res)); r2.setAttribute('height', Math.ceil(h * res));
      r2.setAttribute('preserveAspectRatio', 'none');
      const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(r2)], {type: 'image/svg+xml'}));
      try {
        const img = new Image(); img.src = url; await img.decode();
        const cv = document.createElement('canvas'); cv.width = Math.ceil(w * res); cv.height = Math.ceil(h * res);
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        c.tex = PIXI.Texture.from(cv); c.box = {x: x0, y: y0, w, h};
      } catch (e) { console.warn('ship.svg: не запеклось', e); } finally { URL.revokeObjectURL(url); }
    }
    host.remove();
    window.__bakeInfo = chunks.filter(c => c.tex).map(c => [c.layer.getAttribute('inkscape:label'), c.tex.width, c.tex.height]);
    const ready = chunks.filter(c => c.kind === 'vec' ? c.items.length : c.tex);
    if (!ready.length) return null;
    // контейнеры вместо трёх Graphics кода: по порядку — вектор и запечённое вперемешку
    const C = {hull: new PIXI.Container(), detail: new PIXI.Container(), stern: new PIXI.Container()};
    for (const [k, g] of [['hull', hullG], ['detail', detailG], ['stern', sternG]]) { const i = world.getChildIndex(g); world.removeChild(g); world.addChildAt(C[k], i); }
    for (const c of ready) {
      if (c.kind === 'vec') { c.g = new PIXI.Graphics(); C[c.target].addChild(c.g); continue; }
      const sp = new PIXI.Sprite(c.tex);
      sp.position.set(c.box.x * S, c.box.y * S); sp.width = c.box.w * S; sp.height = c.box.h * S;
      sp.blendMode = c.blend; C[c.target].addChild(sp);
    }
    return ready;
  })()};
  window.__staticMs = Math.round(performance.now() - T_STATIC);

  // ---------- фон районов (ship/bg/ — build_bg.py из PSB) ----------
  // Город: картинка 1/8 всегда, плитки 1/4 и 1/2 — только видимые и по приближению (ушли с экрана — выгружаются).
  // Нос: по картинке на район. Лежит под заливкой районов: их цвет — лёгкий оттенок поверх арта.
  const bgC = new PIXI.Container(), frameC = new PIXI.Container();             // фон — под заливкой районов, рамка-«Гигаструктура» — над ней
  world.addChildAt(bgC, world.getChildIndex(zonesG));
  world.addChildAt(frameC, world.getChildIndex(zonesG) + 1);
  const BG = await (async () => { try { const r = await fetch('bg/bg.json?' + Date.now()); return r.ok ? await r.json() : null; } catch (e) { return null; } })();
  const BG_SETS = [];
  if (BG) {
    const BV = '?v=' + (BG.v || 1);                                              // версия набора — плитки не из кэша после пересборки
    const put = (sp, x0, y0, x1, y1) => { sp.position.set(x0 * S, y0 * S); sp.width = (x1 - x0) * S; sp.height = (y1 - y0) * S; };
    for (const [c, cont] of [[BG.city, bgC], [BG.frame, frameC]]) {
      if (!c) continue;
      const base = c.levels.find(l => l.file);
      if (base) PIXI.Assets.load('bg/' + base.file + BV).then(t => { const sp = new PIXI.Sprite(t); put(sp, c.X0, c.Y0, c.X1, c.Y1); cont.addChildAt(sp, 0); }).catch(() => {});
      BG_SETS.push({c, cont, BV, tiles: new Map(), have: Object.fromEntries(c.levels.filter(l => l.have).map(l => [l.dir, new Set(l.have)]))});
    }
    for (const f of BG.front) PIXI.Assets.load('bg/' + f.file + BV).then(t => { const sp = new PIXI.Sprite(t); put(sp, f.x0, f.y0, f.x1, f.y1); bgC.addChild(sp); }).catch(() => {});
  }
  function syncBg(now) {
    for (const set of BG_SETS) {
      const {c, cont, tiles, BV} = set, kx = (c.X1 - c.X0) * S / c.w, ky = (c.Y1 - c.Y0) * S / c.h;
      const tiled = c.levels.filter(l => l.cols).sort((a, b) => a.f - b.f);
      const pxPerPsb = cam.z * kx;
      let L = null;
      if ((1 / c.levels.find(l => l.file).f) * pxPerPsb > 1.6) { L = tiled[tiled.length - 1]; for (const t of tiled) if ((1 / t.f) * pxPerPsb <= 1.6) { L = t; break; } }
      if (L) {
        const [wx0, wy0] = toWorld(0, 0), [wx1, wy1] = toWorld(sw(), sh());
        const tp = c.tile / L.f;                                   // плитка в пикселях PSB
        const cA = Math.max(0, Math.floor((wx0 - c.X0 * S) / kx / tp)), cB = Math.min(L.cols - 1, Math.floor((wx1 - c.X0 * S) / kx / tp));
        const rA = Math.max(0, Math.floor((wy0 - c.Y0 * S) / ky / tp)), rB = Math.min(L.rows - 1, Math.floor((wy1 - c.Y0 * S) / ky / tp));
        const have = set.have[L.dir];
        for (let r = rA; r <= rB; r++) for (let q = cA; q <= cB; q++) {
          if (have && !have.has(`${r}_${q}`)) continue;            // у рамки пустых плиток нет в наборе
          const key = `${L.dir}/${r}_${q}`; let e = tiles.get(key);
          if (!e) {
            e = {sp: null, seen: now, url: 'bg/' + key + '.webp' + BV}; tiles.set(key, e);
            PIXI.Assets.load(e.url).then(t => {
              if (tiles.get(key) !== e) { PIXI.Assets.unload(e.url); return; }
              const sp = e.sp = new PIXI.Sprite(t);
              sp.position.set(c.X0 * S + q * tp * kx, c.Y0 * S + r * tp * ky);
              sp.width = (t.width + 1) / L.f * kx; sp.height = (t.height + 1) / L.f * ky;   // +1 текстель — без щелей на стыках
              sp.zIndex = L.f; cont.addChild(sp); cont.sortChildren();
            }).catch(() => tiles.delete(key));
          }
          e.seen = now;
        }
      }
      for (const [key, e] of tiles) if (now - e.seen > 4000) {
        tiles.delete(key);
        if (e.sp) { cont.removeChild(e.sp); e.sp.destroy(); PIXI.Assets.unload(e.url); }
      }
    }
  }

  // ---------- анимация: мигалки, главный двигатель, маневровые сопла ----------
  // Только спрайты (позиция/размер/прозрачность раз в кадр) — без перерисовки векторов.
  const canvasTex = (w, h, draw) => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h); return PIXI.Texture.from(cv); };
  const glowTex = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    for (const [o, a] of [[0, 1], [0.18, 0.62], [0.45, 0.2], [0.75, 0.05], [1, 0]]) gr.addColorStop(o, `rgba(255,255,255,${a})`);
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const dotTex = canvasTex(32, 32, (g, w) => { g.fillStyle = '#fff'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 1, 0, 7); g.fill(); });
  // факел: ярко у сопла, к хвосту гаснет и сужается
  const flameTex = canvasTex(256, 64, (g, w, h) => {
    const im = g.createImageData(w, h);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) {
      const u = x / (w - 1), v = (y - (h - 1) / 2) / ((h - 1) / 2), wid = 0.95 - 0.7 * u;
      const a = Math.pow(1 - u, 1.6) * Math.exp(-Math.pow(v / wid, 2) * 2.2) * Math.pow(Math.max(0, 1 - v * v), 2) * Math.min(1, x / 6);   // края гаснут в ноль
      const k = (y * w + x) * 4; im.data[k] = im.data[k + 1] = im.data[k + 2] = 255; im.data[k + 3] = Math.round(255 * Math.min(1, a));
    }
    g.putImageData(im, 0, 0);
  });
  const fxC = new PIXI.Container();
  world.addChildAt(fxC, world.getChildIndex(turbG));
  // огонь главного двигателя — ПОД кораблём: выходит из-за задней грани, будто изнутри блока
  const engC = new PIXI.Container();
  world.addChildAt(engC, world.getChildIndex(artC) + 1);
  const spr = (tex, tint, blend = 'add', ax = 0.5, parent = fxC) => { const s = new PIXI.Sprite(tex); s.anchor.set(ax, 0.5); s.tint = tint; s.blendMode = blend; parent.addChild(s); return s; };
  // главный двигатель — большой центральный блок кормы (path201/path197 в ship.svg), огонь — с его задней грани-шеврона
  const ENG = {x: 2020, y: 305, h: 96, power: 1};                // начало факела — внутри блока, за задней гранью; power — яркость (0…1.5)
  const eng = {
    light: spr(glowTex, 0x5fc8ff, 'add', 0.5, engC), outer: spr(flameTex, 0x4fb8ff, 'add', 0, engC), mid: spr(flameTex, 0x9fe6ff, 'add', 0, engC),
    core: spr(flameTex, 0xf2fdff, 'add', 0, engC), mouth: spr(glowTex, 0xbff4ff, 'add', 0.5, engC),
    diamonds: [0, 1, 2, 3, 4].map(() => spr(glowTex, 0xe8fbff, 'add', 0.5, engC)),
  };
  // маневровые сопла у передней кромки кормы — смотрят к носу
  const THR = [{x: 1576, y: 587.8}, {x: 1573, y: 626.5}].map(p => ({...p, flame: spr(flameTex, 0x9fe6ff, 'add', 0), glow: spr(glowTex, 0x7fe3ff)}));
  for (const l of LAMPS) {
    l.glow = spr(glowTex, l.color); l.core = spr(l.seg ? PIXI.Texture.WHITE : dotTex, l.color, 'normal');
    if (l.seg) { l.glow.rotation = l.core.rotation = l.ang; }
  }
  // ремонтный дрон: облетает корму по рабочим точкам, на каждой зависает и варит (вспышки и искры)
  const DRONE_PX = 0.1875;                                         // единиц корабля на пиксель текстуры (96 px = 18 ед.)
  const droneTex = canvasTex(96, 56, g => {
    const rr = (x, y, w, h, r) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
    g.lineJoin = 'round'; g.strokeStyle = '#0d1114';
    g.lineWidth = 3; g.beginPath(); g.moveTo(52, 37); g.lineTo(60, 47); g.lineTo(75, 49); g.strokeStyle = '#3d484e'; g.stroke();   // рука-манипулятор
    g.strokeStyle = '#0d1114'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(27, 15); g.lineTo(23, 6); g.stroke();                                   // антенна
    rr(4, 18, 12, 16, 3); g.fillStyle = '#56636a'; g.fill(); g.stroke();                              // кормовой движок
    rr(14, 13, 56, 26, 8); g.fillStyle = '#b9c5c6'; g.fill(); g.stroke();                              // корпус
    g.fillStyle = '#d6e0e1'; g.fillRect(20, 16, 40, 4);                                                // светлый верх
    g.fillStyle = '#1f3b7d'; g.fillRect(15, 30, 54, 4);                                                // синяя полоса
    rr(53, 18, 14, 10, 3); g.fillStyle = '#1b2427'; g.fill(); g.stroke();                              // окуляр
    g.fillStyle = '#7fe3ff'; g.beginPath(); g.arc(62, 23, 2.6, 0, 7); g.fill();
  });
  const DRONE_SPOTS = [[1700, 122], [1930, 150], [2006, 272], [1962, 468], [1764, 538], [1664, 384]];
  const DRONE_HOME = [1840, 330], DR_MOVE = 5, DR_WELD = 4;
  const drone = {thr: spr(glowTex, 0x7fe3ff), body: spr(droneTex, 0xffffff, 'normal'), lamp: spr(glowTex, 0xff4a4a),
                 flash: spr(glowTex, 0xcfe8ff), sparks: [...Array(8)].map(() => spr(dotTex, 0xffd27a, 'add'))};
  // где дрон при заданном t: центр, куда смотрит, варит ли (кончик инструмента — справа снизу от центра)
  const TIP = [(75 - 48) * DRONE_PX, (49 - 28) * DRONE_PX];
  function droneAt(t) {
    const cyc = DR_MOVE + DR_WELD, n = DRONE_SPOTS.length, k = Math.floor(t / cyc), u = t - k * cyc;
    const A = DRONE_SPOTS[((k % n) + n) % n], B = DRONE_SPOTS[(((k + 1) % n) + n) % n];
    const dirB = B[0] >= DRONE_HOME[0] ? 1 : -1, dirA = A[0] >= DRONE_HOME[0] ? 1 : -1;          // к корме лицом: справа — смотрит влево и наоборот
    const at = (P, d) => [P[0] - d * TIP[0], P[1] - TIP[1]];                                           // центр так, чтобы инструмент касался точки
    if (u >= DR_MOVE) { const c = at(B, -dirB); return {x: c[0], y: c[1], face: -dirB, weld: u - DR_MOVE, move: 0}; }
    const e = u / DR_MOVE, q = e * e * (3 - 2 * e), P0 = at(A, -dirA), P2 = at(B, -dirB);
    const mx = (P0[0] + P2[0]) / 2, my = (P0[1] + P2[1]) / 2, ox = mx - DRONE_HOME[0], oy = my - DRONE_HOME[1], ol = Math.hypot(ox, oy) || 1;
    const P1 = [mx + ox / ol * 70, my + oy / ol * 70];                                                // дугой в стороне от корпуса
    const x = (1 - q) ** 2 * P0[0] + 2 * (1 - q) * q * P1[0] + q * q * P2[0], y = (1 - q) ** 2 * P0[1] + 2 * (1 - q) * q * P1[1] + q * q * P2[1];
    const dx = 2 * (1 - q) * (P1[0] - P0[0]) + 2 * q * (P2[0] - P1[0]);
    return {x, y, face: q < 0.85 ? (dx >= 0 ? 1 : -1) : -dirB, weld: -1, move: Math.sin(Math.PI * e)};
  }
  const hash = n => { const h = Math.sin(n * 12.9898) * 43758.5453; return h - Math.floor(h); };
  const lampLevel = (l, t) => {
    const f = (((t + l.phase) / l.period) % 1 + 1) % 1;
    switch (l.mode) {
      case 'strobe': return f < 0.035 || (f > 0.11 && f < 0.145) ? 1 : 0;              // двойная вспышка
      case 'pulse': return 0.5 - 0.5 * Math.cos(f * Math.PI * 2);
      case 'room': {                                                                  // окно-комната: свет то горит, то нет (раз в период — решение заново)
        const u = (t + l.phase) / l.period, k = Math.floor(u), on = n => hash(n * 3.1 + l.x * 0.37 + l.y * 1.3) > 0.32 ? 1 : 0.06;
        const a = on(k - 1), b = on(k), q = Math.min(1, (u - k) / 0.12);
        return a + (b - a) * q;
      }
      case 'flicker': { const k = Math.floor((t + l.phase) * 9); return hash(k + l.x) < 0.07 ? 0.25 : 0.85 + 0.15 * hash(k * 1.7 + l.y); }   // окно: изредка моргает
      default: return Math.max(0, Math.min(1, (0.5 - Math.abs(f - 0.25)) * 8 - 1.5));    // мягкий включился/погас
    }
  };
  function animFx(t) {
    const z = cam.z, px = v => v / z;                              // экранные пиксели → единицы мира
    for (const l of LAMPS) {
      if (l.seg) {                                                     // штрих-окно: горит — светлый с ореолом, погас — тусклый
        const lv = lampLevel(l, t), X = l.x * S, Y = l.y * S;
        l.core.position.set(X, Y); l.core.width = l.len * S; l.core.height = Math.max(l.r * S, px(1.1)); l.core.alpha = 0.22 + 0.78 * lv;
        l.glow.position.set(X, Y); l.glow.width = (l.len + l.r * 3) * S; l.glow.height = Math.max(l.r * 3.2 * S, px(3)); l.glow.alpha = lv * 0.22;
        continue;
      }
      const lv = lampLevel(l, t), g = Math.max(l.r * 7 * S, px(5 + 3 * l.r)) * (0.75 + 0.25 * lv);
      l.glow.position.set(l.x * S, l.y * S); l.glow.width = l.glow.height = g; l.glow.alpha = lv * 0.95 * Math.min(1, l.r / 2);   // у окон свечение слабее, чем у ходовых огней
      const c = Math.max(l.r * 1.6 * S, px(1.6)); l.core.position.set(l.x * S, l.y * S); l.core.width = l.core.height = c; l.core.alpha = 0.3 + 0.7 * lv;
    }
    // факел: дрожит по длине и яркости, вдоль бегут «ромбы» (ударные волны)
    const fl = 1 + 0.06 * Math.sin(t * 31) + 0.04 * Math.sin(t * 53 + 1.3) + 0.05 * (hash(Math.floor(t * 24)) - 0.5);
    const X = ENG.x * S, Y = ENG.y * S, H = ENG.h * S;
    eng.light.position.set(X + 60 * S, Y); eng.light.width = eng.light.height = 560 * S * (0.96 + 0.04 * fl); eng.light.alpha = 0.1 * ENG.power;
    eng.outer.position.set(X, Y); eng.outer.width = 440 * S * fl; eng.outer.height = H * 1.3; eng.outer.alpha = 0.34 * ENG.power;
    eng.mid.position.set(X, Y); eng.mid.width = 290 * S * fl; eng.mid.height = H * 0.85; eng.mid.alpha = 0.45 * ENG.power;
    eng.core.position.set(X, Y); eng.core.width = 170 * S * (2 - fl); eng.core.height = H * 0.5; eng.core.alpha = 0.6 * ENG.power;
    eng.mouth.position.set(X + 26 * S, Y); eng.mouth.width = 50 * S; eng.mouth.height = H * 1.1 * fl; eng.mouth.alpha = 0.45 * ENG.power;
    eng.diamonds.forEach((d, i) => {
      const u = ((t * 0.7 + i / eng.diamonds.length) % 1), x = X + (70 + u * 280) * S * fl;
      d.position.set(x, Y); d.width = (28 - 14 * u) * S; d.height = (H * 0.34) * (1 - 0.6 * u); d.alpha = (1 - u) * 0.32 * ENG.power;
    });
    {
      const d = droneAt(t), bob = Math.sin(t * 2.1) * 0.8 * (d.weld >= 0 ? 0.3 : 1), x = d.x * S, y = (d.y + bob) * S;
      const b = drone.body; b.position.set(x, y); b.width = 96 * DRONE_PX * S; b.height = 56 * DRONE_PX * S; b.scale.x = Math.abs(b.scale.x) * d.face;
      drone.thr.position.set(x - d.face * 8 * S, y); drone.thr.width = drone.thr.height = 9 * S * (0.7 + 0.3 * Math.sin(t * 27));
      drone.thr.alpha = 0.25 + 0.6 * d.move;
      const lb = ((t * 0.8) % 1) < 0.15 ? 1 : 0.15;                                                   // огонёк на антенне
      drone.lamp.position.set(x - d.face * 4.5 * S, y - 4 * S); drone.lamp.width = drone.lamp.height = Math.max(3 * S, px(5)); drone.lamp.alpha = lb;
      const tx = x + d.face * TIP[0] * S, ty = y + TIP[1] * S, weld = d.weld >= 0 && d.weld < DR_WELD - 0.4;
      const fk = Math.floor(t * 22), on = weld && hash(fk) > 0.25;
      drone.flash.position.set(tx, ty); drone.flash.width = drone.flash.height = (9 + 7 * hash(fk + 3)) * S; drone.flash.alpha = on ? 0.6 + 0.4 * hash(fk + 7) : 0;
      drone.sparks.forEach((sp, i) => {
        const life = 0.45, a = ((t + i * life / drone.sparks.length) % life) / life, id = Math.floor((t + i * life / drone.sparks.length) / life) * 8 + i;
        const ang = (d.face > 0 ? Math.PI : 0) + (hash(id) - 0.5) * 2.2, v = 18 + 16 * hash(id + 1);
        sp.position.set(tx + Math.cos(ang) * v * a * S, ty + (Math.sin(ang) * v * a + 14 * a * a) * S);
        sp.width = sp.height = Math.max(0.9 * S, px(1.5)); sp.alpha = weld ? (1 - a) : 0;
      });
    }
    THR.forEach((p, i) => {
      const f = 0.8 + 0.2 * Math.sin(t * 23 + i * 2.1) + 0.1 * (hash(Math.floor(t * 18) + i * 7) - 0.5);
      p.flame.position.set((p.x - 3) * S, p.y * S); p.flame.width = 30 * S * f; p.flame.height = 11 * S;
      p.flame.scale.x = -Math.abs(p.flame.scale.x); p.flame.alpha = 0.85;                              // факел влево, к носу
      p.glow.position.set(p.x * S, p.y * S); p.glow.width = 22 * S * f; p.glow.height = 34 * S * f; p.glow.alpha = 0.7;
    });
  }

  let drawnFor = 0;
  function drawShip() {
    const lw = Math.max(4, 2 / cam.z), thin = lw * 0.6, hair = lw * 0.38;
    drawnFor = cam.z;
    if (STATIC_REF.v) {
      for (const c of STATIC_REF.v) {
        if (c.kind !== 'vec') continue;
        const g = c.g; g.clear();
        for (const e of c.items) {
          g.path(e.path);
          if (e.fill) g.fill(e.fill);
          if (e.stroke) {
            const k = e.stroke, width = k.dark ? k.w / 0.4 * lw : Math.max(k.w * S, 2 / cam.z);
            g.stroke(k.fill ? {fill: k.fill, width, join: k.join, cap: k.cap} : {width, color: k.color, alpha: k.alpha, join: k.join, cap: k.cap});
          }
        }
      }
      return;
    }
    hullG.clear();
    hullG.poly(PL(HULL), true).fill({color: C.hull});
    // верх носа и купол чуть светлее (смотрят вверх), киль — темнее
    hullG.poly(PL([...DOME.filter(([x]) => x > 300), ...BEND_T.slice(0, 2), [836, 168], [800, 158], [560, 158], [560, domeY(560) + 6],
      ...DOME.filter(([x]) => x > 300 && x < 556).reverse().map(([x, y]) => [x, y + 6])]), true).fill({color: C.hullHi});
    hullG.poly(PL([[157, 483], [168, 494], [264, 541], [300, 563], [330, FB], ...BEND_B.slice().reverse(), [910, 532], [870, 537], [832, 545],
      [794, 549], [300, 549], [236, 517]]), true).fill({color: C.hullLo});
    // светотень по высоте: верх обшивки города светлее, низ темнее
    hullG.rect(...P(910, TOP), 656 * S, 5 * S).fill({color: C.hullHi});
    hullG.rect(...P(910, BOT - 6), 656 * S, 6 * S).fill({color: C.hullLo});
    // клинок: нижняя кромка в тени
    hullG.poly(PL([[10, 392], [72, 428], [157, 483], [178, 486], [178, 476], [150, 471], [70, 419], [24, 392]]), true).fill({color: C.hullLo});
    // сгиб у спойлера: скошенные пластины сверху и снизу
    hullG.poly(PL([...BEND_T, [910, 182], [868, 176], [832, 168], [796, 158]]), true).fill({color: C.hullDark, alpha: 0.55});
    hullG.poly(PL([...BEND_B.slice(0, 4), [796, 556], [832, 545], [868, 536], [910, 529]]), true).fill({color: C.hullDark, alpha: 0.45});
    // корпус между вторым кольцом и кормой уходит в тень кормы
    for (const cav of [CAV_BRIDGE, CAV_JAW, CAV_CITY]) hullG.poly(PL(cav), true).fill({color: 0x121820}).stroke({width: thin, color: C.line});
    {   // обводка корпуса без торца у кормы: торец уходит в корму, а на отдалении толстая линия вылезала из-под неё
      const iT = HULL.findIndex(([x, y]) => x === 1602 && y === TOP), path = [...HULL.slice(iT + 1), ...HULL.slice(0, iT + 1)];
      hullG.poly(PL(path), false).stroke({width: lw * 1.4, color: C.line, join: 'round'});
    }

    detailG.clear();
    const seam = (pts, w = hair, a = 0.75) => { detailG.moveTo(...P(...pts[0])); for (const p of pts.slice(1)) detailG.lineTo(...P(...p)); detailG.stroke({width: w, color: C.line, alpha: a, join: 'round'}); };
    // пунктир по дуге длины: штрих dash, пропуск gap (пиксели арта)
    const dashPath = (pts, dash, gap) => {
      let on = true, left = dash;
      for (let i = 0; i < pts.length - 1; i++) {
        let [ax, ay] = pts[i]; const [bx, by] = pts[i + 1];
        let L = Math.hypot(bx - ax, by - ay); if (!L) continue;
        const ux = (bx - ax) / L, uy = (by - ay) / L;
        while (L > 1e-6) {
          const st = Math.min(left, L);
          if (on) detailG.moveTo(...P(ax, ay)).lineTo(...P(ax + ux * st, ay + uy * st));
          ax += ux * st; ay += uy * st; L -= st; left -= st;
          if (left <= 1e-6) { on = !on; left = on ? dash : gap; }
        }
      }
    };
    const lights = (pts, dash = 9, gap = 6, w = 3.2) => {             // светящаяся полоса огней: ореол + ядро
      dashPath(pts, dash, gap); detailG.stroke({width: Math.max(lw * 1.2, w * 2.6 * S), color: C.glow, alpha: 0.16, cap: 'round'});
      dashPath(pts, dash, gap); detailG.stroke({width: Math.max(2.2, w * S), color: C.dash, alpha: 0.95, cap: 'round'});
    };
    const dots = (x0, y0, cols, rows, dx = 5, dy = 4) => {            // ряды иллюминаторов
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) detailG.rect(...P(x0 + c * dx, y0 + r * dy), 2.4 * S, 1.6 * S);
      detailG.fill({color: C.dash, alpha: 0.8});
    };

    // визор мостика и синяя полоса между куполом и клинком — как на чертеже
    detailG.poly(PL([[211, 334], [252, 297], [288, 305], [361, 320], [560, 329], [560, 346], [266, 348]]), true)
      .fill({color: C.navy}).stroke({width: thin, color: C.line});
    detailG.poly(PL([[282, 352], [560, 352], [560, 360], [282, 362]]), true).fill({color: 0x2d363b});
    // огни: верхняя полоса по куполу, крыше носа и через сгиб — вдоль всего города; нижняя — по килю и низу города
    lights([...DOME.filter(([x]) => x > 330).map(([x, y]) => [x, y + 7]), [790, FT + 8], [834, 163], [870, 171], [910, 178], [RX[0] - 28, 178]], 10, 6);
    lights([[RX[0] + 28, 178], [RX[1] - 28, 178]], 10, 6); lights([[RX[1] + 28, 178], [1535, 178]], 10, 6);
    lights([[606, 171], [690, 171], [702, 180], [784, 180]], 7, 5, 2.6);
    lights([[340, 568], [782, 568], [798, 564]], 10, 6);
    lights([[930, 532], [RX[0] - 28, 532]], 9, 6, 2.6); lights([[RX[0] + 28, 532], [RX[1] - 28, 532]], 9, 6, 2.6); lights([[RX[1] + 28, 532], [1535, 532]], 9, 6, 2.6);
    lights([[300, 340], [540, 340]], 7, 5, 2.4);
    // иллюминаторы рядами — как на арте
    dots(590, 160, 8, 2); dots(712, 160, 6, 2); dots(980, 183.5, 9, 1); dots(1300, 183.5, 7, 1);
    dots(1050, 526, 8, 1); dots(1250, 526, 6, 1);
    // швы обшивки: поперечные на полосах над и под городом, по килю — скосы плит
    for (const x of [1010, 1270, 1450]) { seam([[x, TOP + 3], [x, 191]]); seam([[x, 523], [x, BOT - 3]]); }
    for (const x of [380, 590, 760]) seam([[x, 550], [x - 5, FB - 3]]);
    seam([[560, 158], [790, 158]], hair, 0.5);
    // рёбра шпангоутов по срезу корпуса над и под городом (как на разрезе)
    for (let x = 572; x < 1478; x += 22) if (RX.every(c => Math.abs(x - c) > 26)) { detailG.moveTo(...P(x, 188)).lineTo(...P(x, 192)); detailG.moveTo(...P(x, 522)).lineTo(...P(x, 526)); }
    detailG.stroke({width: hair, color: C.line, alpha: 0.55});
    // ступица кольца: паз утоплен в обшивку — вокруг щели рамка-углубление со скосами,
    // поперёк щели ось-шарнир (сторона обшивки), на рамке огни
    for (const x of RX) for (const top of [true, false]) {
      const f = ([dx, dy]) => [x + dx, top ? TOP + dy : BOT - dy], q = pts => PL(pts.map(f));
      for (const sgn of [-1, 1]) {
        detailG.poly(q([[sgn * NW, 0], [sgn * 21, 0], [sgn * 21, 20], [sgn * NW, 20]]), true).fill({color: 0x7c898c});      // стенка углубления
        detailG.poly(q([[sgn * 21, 0], [sgn * 26, 0], [sgn * 26, 20], [sgn * 21, 20]]), true).fill({color: top ? 0x95a2a4 : 0x8a979a});
      }
      detailG.poly(q([[-NW, ND], [NW, ND], [NW, 20], [-NW, 20]]), true).fill({color: top ? 0x95a2a4 : 0x6f7b80});  // дно-кромка под щелью
      detailG.poly(q([[-26, 0], [26, 0], [26, 20], [-26, 20]]), true).stroke({width: thin, color: C.line, join: 'round'});
      detailG.poly(q([[-NW, 0], [NW, 0], [NW, ND], [-NW, ND]]), true).stroke({width: thin, color: C.line, join: 'round'});
      // опоры шарнира в стенках паза
      for (const sgn of [-1, 1]) detailG.circle(...P(...f([sgn * 15, ND - 5.2])), 3.2 * S).fill({color: 0x56636a}).stroke({width: hair, color: C.line});
      detailG.circle(...P(...f([-23.5, 16])), 1.3 * S).circle(...P(...f([23.5, 16])), 1.3 * S).fill({color: C.glow, alpha: 0.9});
    }
    // шлюзы космопорта в киле, под ними гравитационный щит
    for (const [x0, x1] of [[400, 470], [490, 560]]) {
      detailG.poly(PL([[x0, 551], [x1, 551], [x1, 565], [x0, 565]]), true).fill({color: C.hole}).stroke({width: thin, color: C.line});
      detailG.moveTo(...P(x0 + 4, FB + 4)).lineTo(...P(x1 - 4, FB + 4)).stroke({width: lw * 1.6, color: C.glow, alpha: 0.85});
    }
    // маневровые дюзы на киле
    for (const x of [612, 680]) detailG.roundRect(...P(x, 553), 24 * S, 9 * S, 2 * S).fill({color: C.hole2}).stroke({width: hair, color: C.line});
    // шипы-антенны на крыше носа и спойлер на сгибе — по арту
    for (const [x, h] of [[596, 34], [686, 30], [764, 24]]) {               // светлая и тёмная грань — объём
      const y = domeY(x) + 1, tip = [x + 20, FT - h];
      detailG.poly(PL([[x - 5, y], [x - 1, y], tip]), true).fill({color: 0xc6d1d3});
      detailG.poly(PL([[x - 1, y], [x + 3, y], tip]), true).fill({color: 0x66727a});
      detailG.poly(PL([[x - 5, y], [x + 3, y], tip]), true).stroke({width: hair, color: C.line, join: 'round'});
    }
    detailG.poly(PL([[778, FT], [792, 131], [828, 127], [850, 138], [846, 158], [836, 157], [800, FT]]), true)
      .fill({color: C.hull}).stroke({width: thin, color: C.line, join: 'round'});
    detailG.moveTo(...P(842, 132)).lineTo(...P(866, 118)).stroke({width: lw, color: C.line});
    detailG.poly(PL([[816, 121], [870, 110], [906, 108], [894, 120], [834, 126]]), true)
      .fill({color: C.hullHi}).stroke({width: thin, color: C.line, join: 'round'});
    detailG.poly(PL([[836, 121], [890, 112], [886, 116], [838, 124]]), true).fill({color: C.navy});
    // корпус между городом и кормой: стык-муфта (швы), без синей полосы
    seam([[1490, TOP + 2], [1490, BOT - 2]], hair, 0.5);
    lights([[1494, 300], [1540, 300]], 6, 4, 2.4); lights([[1494, 412], [1540, 412]], 6, 4, 2.4);
    dots(1496, 214, 8, 2); dots(1496, 470, 8, 2);
    detailG.roundRect(...P(1500, 336), 38 * S, 52 * S, 3 * S).fill({color: C.hole2}).stroke({width: thin, color: C.line});
    for (let k = 1; k < 9; k++) detailG.moveTo(...P(1500, 336 + k * 5.8)).lineTo(...P(1538, 336 + k * 5.8));
    detailG.stroke({width: hair, color: C.line, alpha: 0.7});
    seam([[1494, 250], [1540, 250]]); seam([[1494, 454], [1540, 454]]);
    // клинок: щели вентиляции и треугольный воздухозаборник — как на арте
    for (const k of [0, 1, 2]) detailG.poly(PL([[96 + k * 7, 424], [102 + k * 7, 413], [105 + k * 7, 413], [99 + k * 7, 424]]), true).fill({color: C.line});
    detailG.poly(PL([[128, 452], [168, 426], [168, 452]]), true).fill({color: C.hole}).stroke({width: thin, color: C.line, join: 'round'});
    lights([[52, 387], [93, 402], [130, 410], [170, 414]], 7, 5, 2.4);
    // купол над мостиком: шов панели и иллюминаторы в освободившейся обшивке
    seam(DOME.filter(([x]) => x > 290 && x < 556).map(([x, y]) => [x, y + 19]), hair, 0.55);
    dots(440, domeY(440) + 11, 7, 1); dots(500, domeY(500) + 11, 5, 1);
    // тень под крылом спойлера
    detailG.poly(PL([[830, 128], [878, 119], [902, 119], [890, 127], [840, 133]]), true).fill({color: 0x000000, alpha: 0.18});

    sternG.clear();
    const clipY = (poly, y0, above) => {                               // срез многоугольника горизонталью
      const out = [], inn = p => above ? p[1] <= y0 : p[1] >= y0;
      poly.forEach((q, i) => {
        const p = poly[(i + poly.length - 1) % poly.length];
        if (inn(q) !== inn(p)) { const u = (y0 - p[1]) / (q[1] - p[1]); out.push([p[0] + (q[0] - p[0]) * u, y0]); }
        if (inn(q)) out.push(q);
      });
      return out;
    };
    // задняя плита видна только над и под корпусом: на высоте корпуса она позади него
    for (const part of [clipY(STERN_SIDE, TOP, true), clipY(STERN_SIDE, BOT, false)])
      if (part.length > 2) sternG.poly(PL(part), true).fill({color: 0x46525a}).stroke({width: lw, color: C.line, join: 'round'});
    // корпус заходит в корму до кромки крыла
    {
      const xs = STERN_EDGE_X(TOP), xb = STERN_EDGE_X(BOT), xm = STERN_EDGE_X(CY / S);
      const neck = [[1600, TOP], [xs + 2, TOP], [xm + 2, AX([0, 300])[1]], [xm + 2, AX([0, 412])[1]], [xb + 2, BOT], [1600, BOT]];
      sternG.poly(PL(neck), true).fill({color: C.hull});
      sternG.rect(...P(1600, TOP), (xs - 1598) * S, 5 * S).fill({color: C.hullHi});
      sternG.rect(...P(1600, BOT - 6), (xb - 1598) * S, 6 * S).fill({color: C.hullLo});
      // тень крыла на корпусе: силуэт передней плиты, сдвинутый к носу и вниз, только в полосе корпуса
      const sh = clipY(clipY(STERN.map(([x, y]) => [x - 16, y + 9]), TOP, false), BOT, true);
      if (sh.length > 2) sternG.poly(PL(sh), true).fill({color: 0x0b1418, alpha: 0.28});
      sternG.moveTo(...P(1600, TOP)).lineTo(...P(xs + 2, TOP)).moveTo(...P(1600, BOT)).lineTo(...P(xb + 2, BOT)).stroke({width: lw * 1.4, color: C.line});
    }
    // нижняя часть двигателя: блок под корпусом у кормы, два сопла
    const eng = [[1540, BOT + 10], [1640, BOT + 10], [1640, BOT + 112], [1576, BOT + 112], [1548, BOT + 92], [1540, BOT + 60]];
    sternG.poly(PL(eng), true).fill({color: 0x5a666c}).stroke({width: lw, color: C.line, join: 'round'});
    sternG.poly(PL([[1540, BOT + 10], [1640, BOT + 10], [1640, BOT + 20], [1543, BOT + 20]]), true).fill({color: 0x6f7b81});
    for (const [x, y] of [[1530, BOT + 42], [1538, BOT + 78]]) {          // раструб расширяется к носу, срез виден эллипсом
      sternG.poly(PL([[x + 22, y - 9], [x, y - 14], [x, y + 14], [x + 22, y + 9]]), true).fill({color: 0x3d484e}).stroke({width: thin, color: C.line, join: 'round'});
      sternG.poly(PL([[x + 22, y - 9], [x + 6, y - 12], [x + 6, y - 6], [x + 22, y - 4]]), true).fill({color: 0x6f7b81});
      sternG.ellipse(...P(x, y), 5 * S, 14 * S).fill({color: 0x1b2226}).stroke({width: thin, color: C.line});
      sternG.ellipse(...P(x - 1, y), 2.6 * S, 9 * S).fill({color: C.glow, alpha: 0.45});
    }
    sternG.poly(PL(STERN), true).fill({color: C.hull});
    sternG.poly(PL(clipY(STERN, AX([0, 404])[1], false)), true).fill({color: 0x9eabad});     // нижняя плита (под балкой) — в тени
    sternG.moveTo(...P(...AX([1620, 404]))).lineTo(...P(...AX([1952, 403]))).stroke({width: thin, color: C.line, alpha: 0.8});
    // скос у левой кромки: тонкая тёмная грань, как на арте
    sternG.poly(PL([[1583, 163], [1612, 300], [1612, 412], [1562, 665], [1572, 665], [1621, 412], [1621, 300], [1592, 163]].map(AX)), true)
      .fill({color: 0x000000, alpha: 0.12});
    sternG.poly(PL(STERN), true).stroke({width: lw * 1.4, color: C.line, join: 'round'});
    // короба (выступают): светлая верхняя кромка, тень снизу
    sternG.poly(PL(STERN_UNDER), true).fill({color: 0xa2afb1}).stroke({width: thin, color: C.line, join: 'round'});
    for (const p of STERN_BOXES) {
      sternG.poly(PL(p.map(([x, y]) => [x + 2, y + 5])), true).fill({color: 0x000000, alpha: 0.16});
      sternG.poly(PL(p), true).fill({color: C.hullHi}).stroke({width: thin, color: C.line, join: 'round'});
    }
    for (const p of STERN_PANELS) {
      sternG.poly(PL(p.map(([x, y]) => [x, y + 2.5])), true).fill({color: 0xd2dcdd});   // светлая кромка снизу — панель утоплена
      sternG.poly(PL(p), true).fill({color: C.hullLo}).stroke({width: thin, color: C.line, join: 'round'});
    }
    for (const p of STERN_TRIS) sternG.poly(PL(p), true).fill({color: C.hullLo}).stroke({width: thin, color: C.line, join: 'round'});
    for (const p of STERN_VENTS) {
      sternG.poly(PL(p), true).fill({color: C.hole2}).stroke({width: thin, color: C.line});
      const [[ax, ay], [bx, by], [cx, cy], [dx, dy]] = p;             // решётка: косые рёбра и продольная планка
      for (let k = 1; k < 14; k++) {
        const u = k / 14;
        sternG.moveTo(...P(ax + (bx - ax) * u, ay + (by - ay) * u)).lineTo(...P(dx + (cx - dx) * u + 3, dy + (cy - dy) * u));
      }
      sternG.moveTo(...P((ax + dx) / 2, (ay + dy) / 2)).lineTo(...P((bx + cx) / 2, (by + cy) / 2));
      sternG.stroke({width: hair, color: C.line, alpha: 0.8});
    }
    sternG.poly(PL(STERN_SLOTS), true).fill({color: C.hullLo}).stroke({width: thin, color: C.line, join: 'round'});
    {
      const [[ax, ay], [bx, by], [cx, cy], [dx, dy]] = STERN_SLOTS;
      for (const v of [0.32, 0.7]) for (let k = 0; k < 4; k++) {
        const u = 0.14 + k * 0.22, x0 = ax + (bx - ax) * u + (dx - ax) * v, y0 = ay + (by - ay) * u + (dy - ay) * v;
        sternG.roundRect(...P(x0, y0 - 3), 6 * S, 8 * S, 2 * S);
      }
      sternG.fill({color: 0x1d2529});
    }

  }

  // ---------- кольца: объёмное тело из граней ----------
  // Сечение кольца (a — вдоль оси корабля, ρ — по радиусу) протягивается вокруг
  // оси, каждая грань сегмента — четырёхугольник. Вид наискосок: экранный
  // x = X + k·Z, поэтому видна ли грань — решает её нормаль, а внутри половины
  // кольца видимые грани не перекрываются: порядок рисования задаёт сам список.
  // Сегменты привязаны к кольцу и крутятся вместе с ним: швы, огни и окна на
  // ленте, боковине и внутренней стороне едут одинаково. Ближняя половина
  // (Z > 0) — над корпусом, дальняя — под ним. Цвета — как на арте: синяя лента
  // снаружи, светлая боковина с пунктиром огней, серая внутренняя сторона.
  // Всё кольцо с лифтами — одна сетка треугольников на слой (дальний/ближний),
  // цвет — из палитры-текстуры: строка — материал, вдоль строки — от тени к свету.
  // Так светотень плавная, а кадр собирается за доли миллисекунды.
  const PROF = (() => {
    const {bw, c, c2, R: Ro, Ri} = RING;
    const v = [[-bw, Ri + c2], [-bw, Ro - c], [-bw + c, Ro], [bw - c, Ro], [bw, Ro - c], [bw, Ri + c2], [bw - c2, Ri], [-bw + c2, Ri]];
    const mat = ['side', 'edge', 'tread', 'edge', 'side', 'iedge', 'inner', 'iedge'];
    return v.map(([a0, r0], j) => {
      const [a1, r1] = v[(j + 1) % v.length], L = Math.hypot(a1 - a0, r1 - r0);
      return {j, j2: (j + 1) % v.length, a0, r0, a1, r1, na: -(r1 - r0) / L, nr: (a1 - a0) / L, mat: mat[j]};
    });
  })();
  const mix = (a, b, t) => {
    const ch = (c, sh) => (c >> sh) & 255;
    return [16, 8, 0].reduce((acc, sh) => acc | (Math.round(ch(a, sh) + (ch(b, sh) - ch(a, sh)) * t) << sh), 0);
  };
  // палитра: материал → [тень, свет, непрозрачность]
  const PAL = {
    tread: [0x0b1840, 0x21408f, 1], tread2: [0x0a173d, 0x1e3b86, 1], edge: [0x142a66, 0x4670cc, 1], side: [0x566c78, 0xbfd1d9, 1],
    inner: [0x2c393f, 0x8fa4ac, 1], iedge: [0x44545c, 0xb6c9d1, 1],
    shaft: [0x52626a, 0xd0dde2, 1], foot: [0x44545b, 0xb8c8ce, 1], liftCab: [0xffc061, 0xffc061, 1], liftCabGlow: [0xff9a3c, 0xff9a3c, 0.34],   // кабина лифта — тёплый огонь в шахте с ореолом cab: [0x76858c, 0xf1f5f7, 1],
    ink: [C.line, C.line, 1], ink85: [C.line, C.line, 0.85], ink6: [C.line, C.line, 0.6],
    light: [0xe9fbff, 0xe9fbff, 0.95], light7: [0xe9fbff, 0xe9fbff, 0.7], lightDim: [0xe9fbff, 0xe9fbff, 0.32],
    glow: [0x8fdcff, 0x8fdcff, 0.13], glowDim: [0x8fdcff, 0x8fdcff, 0.08], halo: [0xbfe6ff, 0xbfe6ff, 0.16],
panelEdge: [0x07102e, 0x07102e, 0.75], busbar: [0x7fa6ef, 0x7fa6ef, 0.4], glint: [0xd8ecff, 0xd8ecff, 0.07], glint2: [0xd8ecff, 0xd8ecff, 0.14], glint3: [0xe8f6ff, 0xe8f6ff, 0.24],
    warm: [C.warm, C.warm, 1],
    slot: [0x17232a, 0x17232a, 1], warmGlow: [C.warm, C.warm, 0.22], hinge: [0x93a2a8, 0x93a2a8, 1], notch: [0x161d22, 0x2f3b42, 1], shade: [0x000000, 0x000000, 0.24],
  };
  const PAL_KEYS = Object.keys(PAL), PAL_W = 64, ROW = {};
  PAL_KEYS.forEach((k, i) => { ROW[k] = i; });
  const palTex = (() => {
    const cv = document.createElement('canvas'); cv.width = PAL_W; cv.height = PAL_KEYS.length * 2;
    const g = cv.getContext('2d');
    PAL_KEYS.forEach((k, row) => {
      const [a, b, al] = PAL[k];
      for (let x = 0; x < PAL_W; x++) {
        const c = mix(a, b, x / (PAL_W - 1));
        g.fillStyle = `rgba(${c >> 16},${(c >> 8) & 255},${c & 255},${al})`; g.fillRect(x, row * 2, 1, 2);
      }
    });
    return PIXI.Texture.from(cv);
  })();
  ringsBack.texture = palTex; ringsFront.texture = palTex;
  const ROWV = {}; PAL_KEYS.forEach((k, i) => { ROWV[k] = (i * 2 + 1) / (PAL_KEYS.length * 2); });
  const UQ = t => (0.5 + (t < 0 ? 0 : t > 1 ? 1 : t) * (PAL_W - 1)) / PAL_W;   // тон 0…1 → u в палитре
  // сетка на кадр: вершины, координаты в палитре, треугольники (порядок = порядок рисования).
  // Массивы выделены заранее и переиспользуются — кадр не плодит мусор.
  class MeshBuf {
    constructor(vc = 16384) { this.P = new Float32Array(vc * 2); this.U = new Float32Array(vc * 2); this.I = new Uint32Array(vc * 3); this.n = 0; this.m = 0; }
    reset() { this.n = 0; this.m = 0; return this; }
    room(nv, ni) {
      if ((this.n + nv) * 2 > this.P.length) {
        const vc = Math.max(this.P.length, (this.n + nv) * 2) * 2, P = new Float32Array(vc), U = new Float32Array(vc);
        P.set(this.P); U.set(this.U); this.P = P; this.U = U;
      }
      if (this.m + ni > this.I.length) { const I = new Uint32Array(Math.max(this.I.length, this.m + ni) * 2); I.set(this.I); this.I = I; }
    }
    vx(x, y, u, v) { const k = this.n * 2; this.P[k] = x; this.P[k + 1] = y; this.U[k] = u; this.U[k + 1] = v; return this.n++; }
    tri(a, b, c) { const m = this.m; this.I[m] = a; this.I[m + 1] = b; this.I[m + 2] = c; this.m = m + 3; }
    // выпуклый многоугольник веером; ts — тон в каждой вершине или один на всех
    poly(pts, row, ts = 0.5) {
      const L = pts.length; this.room(L, (L - 2) * 3);
      const b = this.n, v = ROWV[row], arr = Array.isArray(ts);
      for (let k = 0; k < L; k++) this.vx(pts[k][0], pts[k][1], UQ(arr ? ts[k] : ts), v);
      for (let k = 1; k < L - 1; k++) this.tri(b, b + k, b + k + 1);
    }
    quad(a, b, c, d, row, ta, tb) {                                  // a→b и d→c — две стороны, тон ta у a/b, tb у c/d
      this.room(4, 6);
      const s = this.n, v = ROWV[row], ua = UQ(ta), ub = UQ(tb);
      this.vx(a[0], a[1], ua, v); this.vx(b[0], b[1], ua, v); this.vx(c[0], c[1], ub, v); this.vx(d[0], d[1], ub, v);
      this.tri(s, s + 1, s + 2); this.tri(s, s + 2, s + 3);
    }
    // ломаная толщиной w экранных пикселей, стыки со скосом (острые — срезаются)
    line(pts, w, row, closed = false) {
      const xs = LX, ys = LY; let n = 0;
      for (const p of pts) if (!n || Math.abs(p[0] - xs[n - 1]) + Math.abs(p[1] - ys[n - 1]) > 0.05) { xs[n] = p[0]; ys[n] = p[1]; n++; }
      if (closed && n > 2 && Math.abs(xs[0] - xs[n - 1]) + Math.abs(ys[0] - ys[n - 1]) < 0.05) n--;
      if (n < 2) return;
      const segs = closed ? n : n - 1;
      for (let i = 0; i < segs; i++) {
        const j = (i + 1) % n, dx = xs[j] - xs[i], dy = ys[j] - ys[i], L = Math.sqrt(dx * dx + dy * dy) || 1;
        LNX[i] = -dy / L; LNY[i] = dx / L;
      }
      this.room(n * 2, segs * 6);
      const h = w / 2, u = UQ(0.5), v = ROWV[row], base = this.n;
      for (let i = 0; i < n; i++) {
        const hasPrev = closed || i > 0, hasNext = closed || i < n - 1, ip = (i - 1 + n) % n, inx = i % segs;
        let mx, my;
        if (hasPrev && hasNext) {
          const ax = LNX[ip], ay = LNY[ip], bx = LNX[inx], by = LNY[inx];
          mx = ax + bx; my = ay + by; const L = Math.sqrt(mx * mx + my * my);
          if (L < 0.2) { mx = bx; my = by; } else { mx /= L; my /= L; const k = Math.max(0.35, mx * bx + my * by); mx /= k; my /= k; }
        } else if (hasNext) { mx = LNX[inx]; my = LNY[inx]; } else { mx = LNX[ip]; my = LNY[ip]; }
        this.vx(xs[i] + mx * h, ys[i] + my * h, u, v); this.vx(xs[i] - mx * h, ys[i] - my * h, u, v);
      }
      for (let i = 0; i < segs; i++) { const a = base + i * 2, b = base + ((i + 1) % n) * 2; this.tri(a, a + 1, b + 1); this.tri(a, b + 1, b); }
    }
    disc(x, y, r, row) { const pts = []; for (const [cx, cy] of DISC) pts.push([x + r * cx, y + r * cy]); this.poly(pts, row); }
    flush(mesh) {
      const g = mesh.geometry;
      g.positions = this.P.subarray(0, this.n * 2); g.uvs = this.U.subarray(0, this.n * 2); g.indices = this.I.subarray(0, this.m);
    }
  }
  const LX = new Float64Array(4096), LY = new Float64Array(4096), LNX = new Float64Array(4096), LNY = new Float64Array(4096);
  const DISC = [...Array(14)].map((_, k) => [Math.cos(k * Math.PI / 7), Math.sin(k * Math.PI / 7)]);
  const MB_BACK = new MeshBuf(), MB_FRONT = new MeshBuf();
  const LIGHT = (() => { const v = [-0.3, -0.62, 0.72], L = Math.hypot(...v); return v.map(x => x / L); })();
  const P_RING = 24, NLIFT = 4, TREAD_SHEEN = 0.22;                                    // панелей по кругу, лифтов на кольцо
  const SIDE_DASH = [[[0.06, 0.5], [0.56, 0.63], [0.69, 0.94]], [[0.06, 0.3], [0.36, 0.43], [0.49, 0.94]], [[0.06, 0.64], [0.7, 0.77], [0.83, 0.9]]];
  const tone = n => 0.5 + 0.62 * (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
  // середина между светом и взглядом (взгляд в косой проекции: (-k, 0, 1)) — по ней блик на панелях ленты
  // (у нормали ленты нет составляющей вдоль оси — берём проекцию на плоскость кольца, иначе максимум блика < 1)
  const HALF = (() => { const v = [-RING.k, 0, 1], L = Math.hypot(...v), h = LIGHT.map((x, i) => x + v[i] / L), M = Math.hypot(h[1], h[2]); return [0, h[1] / M, h[2] / M]; })();
  const nrm3 = (f, ph) => [f.na, f.nr * Math.sin(ph), f.nr * Math.cos(ph)];
  const faceVis = (f, ph) => -RING.k * f.na + f.nr * Math.cos(ph) > 1e-4;
  // точка кольца: угол, радиус, сдвиг вдоль оси → экран (у ближних точек чуть больше масштаб)
  function rp(r, ph, rad, ax = 0) {
    const c = Math.cos(ph);
    return toScreen(r.cx + ax + rad * RING.k * c, r.cy + rad * Math.sin(ph), RING.depth * c * rad / RING.R);
  }
  // точка в рамке спицы: a — вдоль оси, ρ — по радиусу, τ — по касательной → мир (X, Y, Z) и экран
  const W3 = (r, ph, a, rho, tau) => {
    const s = Math.sin(ph), c = Math.cos(ph);
    return [r.cx + a, r.cy + rho * s + tau * c, rho * c - tau * s];
  };
  const S3 = ([X, Y, Z]) => toScreen(X + RING.k * Z, Y, RING.depth * Z / RING.R);

  function ringGeom(r, t) {                                        // расчёты кольца на кадр — общие для половин
    const rot = r.phase + r.dir * t * RING.speed, Rpx = RING.R * cam.z;
    // сегменты мелкие: у узкого эллипса сверху и снизу изгиб резкий, крупный шаг даёт изломы
    const sub = Rpx > 700 ? 12 : Rpx > 260 ? 8 : 5;
    const N = P_RING * sub, d = Math.PI * 2 / N, ang = i => rot + i * d;
    const pos = [], vis = [], tn = [];
    for (let b = 0; b <= N; b++) {
      const ph = ang(b), sn = Math.sin(ph), cs = Math.cos(ph), pr = [], tr = [];
      for (const f of PROF) { pr.push(rp(r, ph, f.r0, f.a0)); tr.push(0.5 + 0.62 * (f.na * LIGHT[0] + f.nr * (sn * LIGHT[1] + cs * LIGHT[2]))); }
      pos.push(pr); tn.push(tr);
    }
    for (let i = 0; i < N; i++) { const cs = Math.cos(ang(i + 0.5)), vr = []; for (const f of PROF) vr.push(-RING.k * f.na + f.nr * cs > 1e-4); vis.push(vr); }
    return {rot, sub, N, d, ang, pos, vis, tn};
  }
  // сегменты половины — подряд, начиная со стыка половин (чтобы обводка шла одной линией)
  function halfSegs(G, front) {
    const isF = i => Math.cos(G.ang(i + 0.5)) > 0;
    let i0 = 0;
    for (let i = 0; i < G.N; i++) if (isF(i) === front && isF(i - 1) !== front) { i0 = i; break; }
    const out = [];
    for (let q = 0; q < G.N; q++) { const i = (i0 + q) % G.N; if (isF(i) === front) out.push(i); else if (out.length) break; }
    return out;
  }
  // выпуклый «ящик» (спица, кабина, опора): 8 углов в рамке спицы, видимые грани с тенью и обводкой
  const BOX_FACES = [[0, 1, 3, 2], [4, 5, 7, 6], [0, 1, 5, 4], [2, 3, 7, 6], [0, 2, 6, 4], [1, 3, 7, 5]];
  function drawBox(mb, r, ph, ends, row, lw, hook) {
    const P = [];                                                   // ends: [[ρ, aLo, aHi, τLo, τHi], [ρ, …]]
    for (const [rho, aL, aH, tL, tH] of ends) for (const a of [aL, aH]) for (const tau of [tL, tH]) P.push(W3(r, ph, a, rho, tau));
    const cen = P.reduce((s, p) => [s[0] + p[0] / 8, s[1] + p[1] / 8, s[2] + p[2] / 8], [0, 0, 0]);
    for (const q of BOX_FACES) {
      const p = q.map(i => P[i]);
      const u = [p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]], v = [p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]];
      let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      const fc = p.reduce((s, x) => [s[0] + x[0] / 4, s[1] + x[1] / 4, s[2] + x[2] / 4], [0, 0, 0]);
      if (n[0] * (fc[0] - cen[0]) + n[1] * (fc[1] - cen[1]) + n[2] * (fc[2] - cen[2]) < 0) n = n.map(x => -x);
      const L = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1; n = [n[0] / L, n[1] / L, n[2] / L];
      if (-RING.k * n[0] + n[2] <= 1e-4) continue;
      const sp = p.map(S3);
      mb.poly(sp, row, tone(n)); mb.line(sp, lw, 'ink', true);
      if (hook) hook(sp, n);
    }
  }

  function drawLifts(mb, r, ri, G, front, t) {
    const lw = Math.max(1.1, 2.2 * cam.z), list = [];
    for (let s = 0; s < NLIFT; s++) {
      const ph = G.rot + (s + 0.5) * Math.PI * 2 / NLIFT, c = Math.cos(ph);
      if ((c > 0) === front) list.push({s, ph, z: c});
    }
    list.sort((a, b) => a.z - b.z);                                 // дальние раньше
    const r0 = HH + 3 * S, r1 = RING.Ri + 2 * S, wa = 4 * S, wt = 4 * S;    // основание — в жёлобе обоймы (её радиус HH + 6)
    for (const {s, ph} of list) {
      const at = (a, rho, tau = 0) => S3(W3(r, ph, a, rho, tau));
      // свая: на грани к носу — стеклянная шахта с огнями, внутри едут кабины (одна вверх, другая вниз)
      drawBox(mb, r, ph, [[r0, -wa, wa, -wt, wt], [r1 - 16 * S, -wa, wa, -wt, wt]], 'shaft', lw, (sp, n) => {
        if (n[0] > -0.9) return;
        const a0 = r0 + 16 * S, a1 = r1 - 22 * S;
        mb.line([at(-wa, a0), at(-wa, a1)], Math.max(1.2, 3.2 * S * cam.z), 'slot');
        for (let q = a0 + 10 * S; q < a1 - 4 * S; q += 20 * S) mb.disc(...at(-wa, q), Math.max(0.7, 1.1 * S * cam.z), 'lightDim');
        const u = (Math.sin(t * 0.42 + s * 1.9 + ri * 2.4) + 1) / 2, rc = a0 + (a1 - a0 - 7 * S) * u;   // кабина — тёплый огонь в шахте
        mb.line([at(-wa, rc - 1.5 * S), at(-wa, rc + 8.5 * S)], Math.max(2, 5.5 * S * cam.z), 'liftCabGlow');
        mb.line([at(-wa, rc), at(-wa, rc + 7 * S)], Math.max(1, 2.4 * S * cam.z), 'liftCab');
      });
      // обоймы на свае
      for (const q of [0.34, 0.67]) {
        const rho = r0 + (r1 - r0) * q;
        drawBox(mb, r, ph, [[rho - 1.5 * S, -wa * 1.25, wa * 1.25, -wt * 1.25, wt * 1.25], [rho + 1.5 * S, -wa * 1.25, wa * 1.25, -wt * 1.25, wt * 1.25]], 'foot', lw * 0.8);
      }
      // у ленты свая плавно расширяется в опору
      drawBox(mb, r, ph, [[r1 - 18 * S, -wa, wa, -wt, wt], [r1, -RING.bw * 0.5, RING.bw * 0.5, -wt * 1.1, wt * 1.1]], 'foot', lw);
    }
  }

  function drawRingShadow(mb, G) {
    const dx = 9 * S * cam.z, dy = 15 * S * cam.z, o = p => [p[0] + dx, p[1] + dy];
    for (const i of halfSegs(G, true)) {
      const p0 = G.pos[i], p1 = G.pos[i + 1];
      for (const f of PROF) if (G.vis[i][f.j]) mb.poly([o(p0[f.j]), o(p0[f.j2]), o(p1[f.j2]), o(p1[f.j])], 'shade');
    }
  }
  function drawRingHalf(mb, r, ri, G, front, t) {
    const segs = halfSegs(G, front), lw = Math.max(2, 4 * cam.z);
    // грани: тон — в каждой вершине по нормали, между вершинами плавно; лента — синие сегменты со швами (как на арте), через один чуть темнее
    for (const i of segs) {
      const p0 = G.pos[i], p1 = G.pos[i + 1];
      for (const f of PROF) {
        if (!G.vis[i][f.j]) continue;
        let ta = G.tn[i][f.j], tb = G.tn[i + 1][f.j], row = f.mat;
        if (f.mat === 'tread') {
          // сегмент ленты — гладкая пластина: свет переливается от одного шва к другому
          if (Math.floor(i / G.sub) % 2) row = 'tread2';
          const q0 = (i % G.sub) / G.sub, q1 = (i % G.sub + 1) / G.sub;
          ta += TREAD_SHEEN * (0.55 - q0); tb += TREAD_SHEEN * (0.55 - q1);
        }
        mb.quad(p0[f.j], p0[f.j2], p1[f.j2], p1[f.j], row, ta, tb);
      }
    }
    const dP = Math.PI * 2 / P_RING, inHalf = ph => (Math.cos(ph) > 0) === front;
    if (front) {
      // детали солнечных панелей на ленте: утопленная рамка, две продольные шины, блик-диагональ на сегментах к свету
      const e = (RING.bw - RING.c) * 0.84, eb = e * 0.36;
      for (let p = 0; p < P_RING; p++) {
        const a0 = G.rot + (p + 0.05) * dP, a1 = G.rot + (p + 0.95) * dP, am = (a0 + a1) / 2;
        if (!inHalf(am) || Math.cos(am) < 0.12) continue;
        const at = (q, ax) => rp(r, a0 + (a1 - a0) * q, RING.R, ax), Q = [0, 0.25, 0.5, 0.75, 1];
        const L = Q.map(q => at(q, -e)), Rt = Q.map(q => at(q, e));
        mb.line([...L, ...Rt.slice().reverse()], lw * 0.32, 'panelEdge', true);
        for (const ax of [-eb, eb]) mb.line(Q.map(q => at(0.03 + q * 0.94, ax)), lw * 0.24, 'busbar');
        const n = nrm3(PROF[2], am), sp = Math.pow(Math.max(0, n[0] * HALF[0] + n[1] * HALF[1] + n[2] * HALF[2]), 70);
        if (sp > 0.12) mb.poly([at(0.16, -e), at(0.27, -e), at(0.45, e), at(0.34, e)], sp > 0.6 ? 'glint3' : sp > 0.3 ? 'glint2' : 'glint');
      }
    }
    // обводка вдоль кольца: по контуру видимого — толще, по рёбрам между гранями — тоньше
    for (let j = 0; j < PROF.length; j++) {
      const ja = (j + PROF.length - 1) % PROF.length;
      let run = null;
      const flush = () => { if (run && run.pts.length > 1) mb.line(run.pts, run.st === 2 ? lw * 1.2 : lw * 0.45, run.st === 2 ? 'ink' : 'ink6'); run = null; };
      for (const i of segs) {
        const va = G.vis[i][ja], vb = G.vis[i][j], st = va && vb ? 1 : va || vb ? 2 : 0;
        if (!run || run.st !== st) { flush(); if (st) run = {st, pts: [G.pos[i][j]]}; }
        if (run) run.pts.push(G.pos[i + 1][j]);
      }
      flush();
    }
    // швы панелей — поперёк всех видимых граней
    for (const i of segs) {
      if (i % G.sub) continue;
      for (const f of PROF) if (G.vis[i][f.j]) mb.line([G.pos[i][f.j], G.pos[i][f.j2]], lw * 0.55, 'ink85');
    }
    // огни на боковине (как на арте): тонкая линия ближе к внутренней кромке — длинный штрих и пара коротких,
    // рисунок чередуется по панелям; ореол узкий
    const rm = RING.Ri + RING.c2 + (RING.R - RING.c - RING.Ri - RING.c2) * 0.36;
    for (let p = 0; p < P_RING; p++) for (const [u0, u1] of SIDE_DASH[p % 3]) {
      const a0 = G.rot + (p + u0) * dP, a1 = G.rot + (p + u1) * dP;
      if (!inHalf((a0 + a1) / 2)) continue;
      const pts = [0, 0.25, 0.5, 0.75, 1].map(q => rp(r, a0 + (a1 - a0) * q, rm, -RING.bw));
      mb.line(pts, Math.max(1.6, 3.6 * S * cam.z), front ? 'glow' : 'glowDim');
      mb.line(pts, Math.max(1, 1.6 * S * cam.z), front ? 'light' : 'light7');
    }
    if (front) {
      // бегущие огни на швах ленты
      for (let p = 0; p < P_RING; p += 2) {                        // огонь на каждом втором шве
        const a = G.rot + p * dP;
        if (!inHalf(a) || Math.cos(a) < 0.05) continue;
        const h = Math.sin((p + 1) * 12.9898 + ri * 78.233) * 43758.5453, rnd = h - Math.floor(h);   // свой ритм у каждого огня
        const [x, y] = rp(r, a, RING.R, 0), on = ((t * (0.22 + 0.2 * rnd) + rnd * 7.3) % 1) < 0.35;
        if (on) mb.disc(x, y, Math.max(1.6, 3.4 * S * cam.z), 'halo');
        mb.disc(x, y, Math.max(0.8, 1.4 * S * cam.z), on ? 'light' : 'lightDim');
      }
    } else {
      // внутренняя сторона: два ряда окон
      for (let p = 0; p < P_RING; p++) for (const u of [0.18, 0.4, 0.62, 0.84]) {
        const a = G.rot + (p + u) * dP;
        if (!inHalf(a) || Math.cos(a) > -0.02) continue;
        for (const ax of [-RING.bw * 0.42, RING.bw * 0.42]) mb.line([rp(r, a - dP * 0.07, RING.Ri, ax), rp(r, a + dP * 0.07, RING.Ri, ax)], Math.max(1, 1.8 * S * cam.z), 'light7');
      }
    }
  }
  function drawRings(t) {
    const geo = RINGS.map(r => ringGeom(r, t)), back = MB_BACK.reset(), front = MB_FRONT.reset();
    RINGS.forEach((r, i) => drawRingHalf(back, r, i, geo[i], false, t));
    RINGS.forEach((r, i) => drawLifts(back, r, i, geo[i], false, t));     // дальние лифты — поверх дальних граней
    RINGS.forEach((r, i) => drawRingShadow(front, geo[i]));               // тень ближней половины — на корпус
    RINGS.forEach((r, i) => drawLifts(front, r, i, geo[i], true, t));     // ближние — под ближними гранями
    RINGS.forEach((r, i) => drawRingHalf(front, r, i, geo[i], true, t));
    back.flush(ringsBack); front.flush(ringsFront);
  }

  // ---------- районы ----------
  // v5 (07.10.2026): свободные зоны ушли в фермы/аквакультуру, нос — по вырезам ship.svg, город до 1482 —
  // прежняя правка в браузере не переносится (старые контуры перебили бы новые)
  const STORE = 'phenomSchemaZones5', STORE_OLD = null;
  let zones = SCHEMA.zones.map(z => ({...z, poly: z.poly.map(p => [...p])}));
  try {
    let saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!saved && STORE_OLD) saved = (JSON.parse(localStorage.getItem(STORE_OLD) || 'null') || []).filter(s => zones.find(z => z.id === s.id)?.part === 'city');
    if (saved && Array.isArray(saved)) for (const s of saved) { const z = zones.find(z => z.id === s.id); if (z && Array.isArray(s.poly)) z.poly = s.poly; }
  } catch (e) { /* без сохранённой правки */ }
  const labelStyle = {fontFamily: 'system-ui, Segoe UI, sans-serif', fontSize: 26, fontWeight: '600', fill: 0xffffff,
                      stroke: {color: 0x0b0e12, width: 5, join: 'round'}, align: 'center', wordWrap: true, wordWrapWidth: 260};
  const labels = zones.map(z => { const t = new PIXI.Text({text: z.name, style: labelStyle, resolution: 2}); t.anchor.set(0.5); zoneLabels.addChild(t); return t; });
  const centroid = poly => {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const f = poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
      a += f; cx += (poly[j][0] + poly[i][0]) * f; cy += (poly[j][1] + poly[i][1]) * f;
    }
    return a ? [cx / (3 * a), cy / (3 * a)] : poly[0];
  };
  const bbox = poly => { const xs = poly.map(p => p[0]), ys = poly.map(p => p[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  let zonesFor = 0, zonesDirty = true;
  function drawZones() {
    zonesFor = cam.z; zonesDirty = false;
    zonesG.clear();
    const lw = Math.max(3, 1.6 / cam.z);
    for (const z of zones) {
      const col = z.free ? 0x8a9aa0 : (ZONE_COLORS[z.name] ?? 0xffffff);
      zonesG.poly(z.poly.flat(), true).fill({color: col, alpha: z.free ? 0.12 : BG ? 0.14 : 0.34}).stroke({width: lw, color: z.free ? 0x5b6a70 : col, alpha: 0.95, join: 'round'});
    }
  }
  function placeLabels() {
    zoneLabels.visible = zonesOn;
    if (!zonesOn) return;
    zones.forEach((z, i) => {
      const t = labels[i], [cx, cy] = z.__c || (z.__c = centroid(z.poly)), [x0, y0, x1, y1] = z.__b || (z.__b = bbox(z.poly));
      const [sx, sy] = toScreen(cx, cy), wpx = (x1 - x0) * cam.z, hpx = (y1 - y0) * cam.z;
      const fs = Math.min(15, Math.max(9, wpx / 9));
      t.position.set(sx, sy); t.scale.set(fs / 26);
      t.visible = wpx > 46 && hpx > 18;
      t.alpha = Math.min(1, (wpx - 46) / 30);
    });
  }

  // ---------- подписи частей (дальний вид) ----------
  const PARTS = [['Передняя оболочка', 330, 120], ['Феном-Сити', 1060, 150], ['Кольца', 1314, -80], ['Техническая\nзадняя оболочка', 1770, 60]];
  for (const [t, x, y] of PARTS) {
    const tx = new PIXI.Text({text: t, style: {fontFamily: 'system-ui, Segoe UI, sans-serif', fontSize: 30, fill: 0xd6dbe6, align: 'center'}, resolution: 2});
    tx.anchor.set(0.5, 1); tx.__w = P(x, y); partLabels.addChild(tx);
  }

  // ---------- попадание, подсветка, карточка ----------
  const INFO = {
    shell: ['Технические помещения', 'Оболочка вдоль всего корабля', 'Двухслойная оболочка: технические коридоры, узлы давления, температуры и гравитации, вентиляция. Гравитация в коридорах иногда нестабильна.'],
    ring: ['Кольцо', 'Техническая задняя оболочка', 'Радиус около двух километров. Больше 80% внутри — гравитационные установки, есть научные станции и экскурсии. Снаружи солнечные панели. Кольца крутятся в разные стороны, к оболочке города ведут лифты.'],
    stern: ['Техническая задняя оболочка', 'Двигатель и подкрылки', 'Технические отделы двигателя и зоны безопасности. Двигатель питает две турбины, «подкрылки» — электростанции и оружейные батареи.'],
  };
  const inside = (px, py, poly) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [x1, y1] = poly[i], [x2, y2] = poly[j]; if ((y1 > py) !== (y2 > py) && px < (x2 - x1) * (py - y1) / (y2 - y1) + x1) c = !c; } return c; };
  const HULL_W = HULL.map(([x, y]) => [x * S, y * S]), STERN_W = STERN.map(([x, y]) => [x * S, y * S]);
  const STERN_SIDE_W = STERN_SIDE.map(([x, y]) => [x * S, y * S]);
  function ringHit(wx, wy, front) {
    for (let i = 0; i < RINGS.length; i++) {
      const r = RINGS[i], sy = (wy - r.cy) / RING.R;
      if (Math.abs(sy) > 1.04) continue;
      const c = Math.sqrt(Math.max(0, 1 - sy * sy)) * (front ? 1 : -1), xc = r.cx + RING.R * RING.k * c;
      // лента от левой боковины до правого края (боковина видна слева, её ширина — толщина кольца × разворот)
      if (wx > xc - RING.bw - RING.th * RING.k * Math.abs(c) - 8 * S && wx < xc + RING.bw + 8 * S) return i;
    }
    return -1;
  }
  function hitTest(wx, wy) {
    let i = ringHit(wx, wy, true); if (i >= 0) return {kind: 'ring', i};
    if (inside(wx, wy, STERN_W) || inside(wx, wy, STERN_SIDE_W)) return {kind: 'stern'};
    if (zonesOn) { i = zones.findIndex(z => inside(wx, wy, z.poly)); if (i >= 0) return {kind: 'zone', i}; }
    if (inside(wx, wy, HULL_W)) return {kind: 'shell'};
    i = ringHit(wx, wy, false); if (i >= 0) return {kind: 'ring', i};
    return null;
  }
  let selected = null;
  function drawHighlight() {
    hiG.clear();
    if (selected && selected.kind === 'bld' && blds[selected.i].art) { const r = blds[selected.i].art; hiG.rect(r.x0, r.y0, r.x1 - r.x0, r.y1 - r.y0).stroke({width: Math.max(4, 2.5 / cam.z), color: 0xAFEEEE}); return; }
    if (!selected || selected.kind !== 'zone') return;
    hiG.poly(zones[selected.i].poly.flat(), true).stroke({width: Math.max(5, 3.5 / cam.z), color: 0xAFEEEE});
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  function showCard(hit) {
    selected = hit; drawHighlight();
    const card = document.getElementById('card');
    if (!hit) { card.classList.remove('open'); return; }
    let html;
    if (hit.kind === 'bld') {
      const b = blds[hit.i];
      html = `<h2>${esc(b.name)}</h2><div class="sub">${esc(zones[b.zi].name)} · здание</div><p>${b.art ? 'Описание появится позже.' : 'Набросок: место примерное, описание появится позже.'}</p>`;
    } else if (hit.kind === 'zone') {
      const z = zones[hit.i], names = blds.filter(b => b.zi === hit.i).map(b => b.name), n = names.length;
      const part = z.part === 'front' ? 'Передняя оболочка' : 'Феном-Сити';
      html = z.free ? `<h2>Свободная зона</h2><div class="sub">Феном-Сити</div><p>Здесь были «Технические помещения» и край «Района модулей». Место под новый район.</p>`
        : `<h2>${esc(z.name)}</h2><div class="sub">${part} · ${n ? n + ' ' + (n === 1 ? 'здание' : n < 5 ? 'здания' : 'зданий') : 'зданий пока нет'}</div>`
          + `<div class="chips">${names.map(b => `<span>${esc(b)}</span>`).join('')}</div>`;
    } else {
      const [t, sub, text] = INFO[hit.kind];
      html = `<h2>${t}${hit.kind === 'ring' ? ' ' + (hit.i + 1) : ''}</h2><div class="sub">${sub}</div><p>${text}</p>`;
    }
    document.getElementById('cardBody').innerHTML = html;
    card.classList.add('open');
  }
  document.getElementById('cardClose').onclick = () => showCard(null);

  // ---------- здания и персонажи ----------
  // Здания — НАБРОСОК: названия из schema.json (z.buildings), в пустых районах — по типовому из BLD_EXTRA;
  // место случайное внутри района, но одно и то же при каждом открытии (зерно — имя). Персонажи — из окна
  // Фенома (setChars), submapX/submapY — единицы мира (пиксели бокового вида × 10). Значки — в экранных
  // пикселях поверх подписей районов: размер не зависит от приближения.
  const BLD_EXTRA = {'Капитанский мостик': ['Рубка'], 'Район модулей': ['Склад модулей', 'Сборочный цех'],
    'Район космопорта': ['Ангар', 'Диспетчерская'], 'Район ферм': ['Теплицы', 'Элеватор'], 'Район лесов': ['Лесничество'],
    'Район аквакультуры': ['Садки', 'Рыбный рынок'], 'Пригород': ['Посёлок'], 'Спальный район': ['Жилой блок'],
    'Центральный город': ['Ратуша'], 'Заводской район': ['Цех'], 'Ночной район': ['Клуб'], 'Пустоши': ['Свалка'],
    'Тюремный район': ['Тюрьма'], 'Район новой застройки': ['Стройка'], 'Район Фронтира': ['Застава']};
  const seedOf = str => { let h = 2166136261; for (const ch of String(str)) h = Math.imul(h ^ ch.codePointAt(0), 16777619); return h >>> 0; };
  const rngOf = seed => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const edgeDist = (x, y, poly) => {
    let m = Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [ax, ay] = poly[j], [bx, by] = poly[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
      const t = L ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L)) : 0;
      m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy));
    }
    return m;
  };
  // «лучший из кандидатов» (Mitchell): точка внутри района, подальше от края, подписи и уже стоящих
  function spotIn(poly, taken, rnd, margin) {
    const [x0, y0, x1, y1] = bbox(poly);
    let best = null, bestD = -1;
    for (let k = 0; k < 40; k++) {
      const x = x0 + rnd() * (x1 - x0), y = y0 + rnd() * (y1 - y0);
      if (!inside(x, y, poly) || edgeDist(x, y, poly) < margin) continue;
      const d = taken.reduce((m, [tx, ty]) => Math.min(m, Math.hypot(x - tx, y - ty)), Infinity);
      if (d > bestD) { bestD = d; best = [x, y]; }
    }
    return best || centroid(poly);
  }
  const markC = new PIXI.Container(); app.stage.addChildAt(markC, app.stage.getChildIndex(zoneLabels) + 1);
  const bldTex = canvasTex(64, 64, g => {
    g.fillStyle = '#0c1116'; g.strokeStyle = '#fff'; g.lineWidth = 5;
    g.beginPath(); g.roundRect(5, 5, 54, 54, 12); g.fill(); g.stroke();
    g.fillStyle = '#fff';
    g.fillRect(16, 30, 9, 19); g.fillRect(28, 18, 9, 31); g.fillRect(40, 25, 9, 24);   // три корпуса
  });
  const markLabel = text => { const t = new PIXI.Text({text, style: {...labelStyle, fontSize: 22, fontWeight: '500', wordWrapWidth: 220}, resolution: 2}); t.anchor.set(0.5, 0); return t; };
  const blds = [];
  zones.forEach((z, zi) => {
    const names = z.buildings.length ? z.buildings : (BLD_EXTRA[z.name] || []);
    const rnd = rngOf(seedOf(z.name)), taken = [centroid(z.poly)];
    const [x0, y0, x1, y1] = bbox(z.poly), margin = Math.min(x1 - x0, y1 - y0) * 0.12;
    for (const name of names) {
      const w = spotIn(z.poly, taken, rnd, margin); taken.push(w);
      const c = new PIXI.Container(), ic = new PIXI.Sprite(bldTex), lb = markLabel(name);
      ic.anchor.set(0.5); ic.tint = ZONE_COLORS[z.name] ?? 0xffffff; lb.y = 12;
      c.addChild(ic, lb); markC.addChild(c);
      blds.push({name, zi, w, c, ic, lb});
    }
  });

  // Арты зданий из PSB (bld/buildings.json — cut_buildings.py): картинка в единицах мира на своём месте из
  // Photoshop (тот же перенос, что у фона, без растяжения), под деталями корпуса. Здание с артом заменяет
  // значок-набросок с тем же названием; подпись — экранная, при приближении.
  const bldArtC = new PIXI.Container();
  world.addChildAt(bldArtC, world.getChildIndex(frameC) + 1);
  const normName = n => String(n).toLowerCase().replace(/[«»"'.\s]/g, '').replace(/ё/g, 'е');
  try {
    const BJ = await (await fetch('bld/buildings.json?' + Date.now())).json();
    for (const it of BJ.items || []) {
      const zi = zones.findIndex(z => inside(it.x, it.y, z.poly));
      const old = blds.findIndex(b => !b.art && normName(b.name) === normName(it.name));
      if (old >= 0) { blds[old].c.destroy({children: true}); blds.splice(old, 1); }
      const lb = markLabel(it.name); lb.anchor.set(0.5, 0); markC.addChild(lb);
      const b = {name: it.name, zi: zi >= 0 ? zi : 0, w: [it.x, it.y], art: {x0: it.x - it.w / 2, y0: it.y - it.h / 2, x1: it.x + it.w / 2, y1: it.y + it.h / 2}, lb};
      blds.push(b);
      PIXI.Assets.load('bld/' + it.file + '?v=' + (BJ.v || 1)).then(t => {
        const sp = new PIXI.Sprite(t); sp.position.set(b.art.x0, b.art.y0); sp.width = it.w; sp.height = it.h; bldArtC.addChild(sp); b.sp = sp;
      }).catch(() => {});
    }
  } catch (e) { /* без артов — остаются значки */ }
  // персонажи: круглый аватар (или буква) в бирюзовом кольце — как на карте галактики
  let chars = [], onChar = null, pickCb = null;
  const charTex = (img, name) => canvasTex(96, 96, (g, w) => {
    g.save(); g.beginPath(); g.arc(48, 48, 42, 0, Math.PI * 2); g.clip();
    if (img) g.drawImage(img, 0, 0, w, w);
    else { g.fillStyle = '#1d3a40'; g.fillRect(0, 0, w, w); g.fillStyle = '#AFEEEE'; g.font = '600 44px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText((name || '?').trim().charAt(0).toUpperCase(), 48, 51); }
    g.restore(); g.lineWidth = 6; g.strokeStyle = '#AFEEEE'; g.beginPath(); g.arc(48, 48, 43, 0, Math.PI * 2); g.stroke();
  });
  function setChars(list, cb) {
    for (const ch of chars) { ch.c.destroy({children: true}); }
    onChar = cb || null;
    chars = (list || []).filter(c => Number.isFinite(c.x) && Number.isFinite(c.y)).map(d => {
      const c = new PIXI.Container(), ic = new PIXI.Sprite(charTex(null, d.name)), lb = markLabel(String(d.name || '').split(/\s+/).slice(0, 2).join(' '));
      ic.anchor.set(0.5); lb.y = 14; c.addChild(ic, lb); markC.addChild(c);
      const ch = {id: d.id, name: d.name, w: [d.x, d.y], c, ic, lb};
      // путь к аватару — от корня сайта (страница схемы лежит в ship/); только свои картинки
      if (d.image && /^images\/[\w\-./%]+(\?[\w=.&-]*)?$/.test(d.image)) {
        const im = new Image();
        im.onload = () => { if (!ic.destroyed) { ic.texture = charTex(im, d.name); } };
        im.src = '../' + d.image;
      }
      return ch;
    });
  }
  // выбор места для редактора: следующий тап по схеме отдаётся колбэку (единицы мира, целые)
  function pick(cb) { pickCb = cb || null; document.body.classList.toggle('picking', !!pickCb); }
  function placeMarks() {
    const show = zonesOn, k = cam.z;
    for (const b of blds) {
      const sel = selected && selected.kind === 'bld' && blds[selected.i] === b;
      if (b.art) {                                    // арт рисует мир; здесь только подпись под ним
        const hpx = (b.art.y1 - b.art.y0) * k;
        b.lb.visible = show && (sel || hpx > 70);
        if (b.lb.visible) { const [sx, sy] = toScreen(b.w[0], b.art.y1); b.lb.position.set(sx, sy + 2); b.lb.scale.set(0.5); }
        continue;
      }
      const z = zones[b.zi], [x0, , x1] = z.__b || (z.__b = bbox(z.poly)), wpx = (x1 - x0) * k;
      const a = Math.max(0, Math.min(1, (wpx - 70) / 50));
      b.c.visible = show && a > 0.02;
      if (!b.c.visible) continue;
      const [sx, sy] = toScreen(...b.w);
      b.c.position.set(sx, sy); b.c.alpha = a;
      b.ic.scale.set((sel ? 30 : 22) / 64);
      b.lb.visible = sel || wpx > 260; b.lb.scale.set(0.5);
    }
    const ca = Math.max(0, Math.min(1, (k - 0.035) / 0.02));
    for (const ch of chars) {
      ch.c.visible = ca > 0.02;
      if (!ch.c.visible) continue;
      const [sx, sy] = toScreen(...ch.w);
      ch.c.position.set(sx, sy); ch.c.alpha = ca;
      ch.ic.scale.set(28 / 96); ch.lb.visible = k > 0.12; ch.lb.scale.set(0.5);
    }
  }
  // попадание по значку — в экранных пикселях (палец), персонажи поверх зданий
  function markHit(sx, sy) {
    let best = null, bd = 20;
    for (const ch of chars) if (ch.c.visible) { const d = Math.hypot(ch.c.x - sx, ch.c.y - sy); if (d < bd) { bd = d; best = {kind: 'char', id: ch.id}; } }
    if (best) return best;
    bd = 18;
    const [wx, wy] = toWorld(sx, sy);
    for (let i = blds.length - 1; i >= 0; i--) { const r = blds[i].art; if (r && zonesOn && wx > r.x0 && wx < r.x1 && wy > r.y0 && wy < r.y1) return {kind: 'bld', i}; }
    blds.forEach((b, i) => { if (b.c && b.c.visible) { const d = Math.hypot(b.c.x - sx, b.c.y - sy); if (d < bd) { bd = d; best = {kind: 'bld', i}; } } });
    return best;
  }

  // ---------- фокус на части ----------
  const FOCUS = {
    all: {box: {x0: 0, y0: -700, x1: 22600, y1: 7800}},           // справа — начало факела двигателя
    nose: {box: {x0: 0, y0: 950, x1: 9600, y1: 6000}, keep: ['front']},
    city: {box: {x0: 5300, y0: 1300, x1: 15200, y1: 5800}, keep: ['city']},
    rings: {box: {x0: 9700, y0: -700, x1: 16300, y1: 7800}, keep: ['rings']},
    stern: {box: {x0: 14600, y0: 300, x1: 23400, y1: 7600}, keep: ['stern']},
  };
  let focus = 'all';
  const lens = document.getElementById('lens');
  function placeLens(animate = true) {
    const b = document.querySelector(`#modes [data-f="${focus}"]`);
    if (!b) return;
    lens.classList.toggle('ready', animate);
    lens.style.width = b.offsetWidth + 'px';
    lens.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  let flight = null;
  function flyTo(b, dur = 750) {
    const z1 = Math.min(Z_MAX, fitZoom(b));
    flight = {t0: performance.now(), dur, from: {...cam}, to: {x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: z1}};
  }
  const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  function setFocus(f) {
    focus = f; flyTo(FOCUS[f].box);
    document.querySelectorAll('#modes [data-f]').forEach(b => b.classList.toggle('active', b.dataset.f === f));
    placeLens();
  }
  window.addEventListener('resize', () => { syncCenter(); placeLens(false); });

  // ---------- правка разметки: перетаскивание вершин районов ----------
  let zonesOn = true, editing = false, drag = null;
  const editBtn = document.getElementById('editBtn'), editBar = document.getElementById('editBar');
  function setEditing(on) {
    editing = on; editBtn.classList.toggle('active', on); editBar.hidden = !on; showCard(null);
  }
  editBtn.onclick = () => setEditing(!editing);
  function saveZones() {
    try { localStorage.setItem(STORE, JSON.stringify(zones.map(z => ({id: z.id, poly: z.poly})))); } catch (e) { /* приватное окно */ }
  }
  document.getElementById('copyZones').onclick = async () => {
    const text = JSON.stringify(zones.map(z => ({id: z.id, poly: z.poly.map(([x, y]) => [Math.round(x / S), Math.round(y / S)])})));
    try { await navigator.clipboard.writeText(text); flash('Разметка скопирована'); }
    catch (e) { prompt('Скопируй разметку:', text); }
  };
  document.getElementById('resetZones').onclick = () => {
    zones = SCHEMA.zones.map(z => ({...z, poly: z.poly.map(p => [...p])}));
    try { localStorage.removeItem(STORE); } catch (e) { /* ничего */ }
    zonesDirty = true; flash('Разметка сброшена');
  };
  function flash(t) { const el = document.getElementById('editHint'); el.textContent = t; setTimeout(() => { el.textContent = 'Тяни точки углов районов'; }, 1600); }
  function nearestVertex(sx, sy) {
    let best = null, bd = 18 * 18;
    zones.forEach((z, zi) => z.poly.forEach(([x, y], vi) => {
      const [px, py] = toScreen(x, y), d = (px - sx) ** 2 + (py - sy) ** 2;
      if (d < bd) { bd = d; best = {zi, vi}; }
    }));
    if (!best) return null;
    const [bx, by] = toScreen(...zones[best.zi].poly[best.vi]), group = [];
    zones.forEach((z, zi) => z.poly.forEach(([x, y], vi) => {
      const [px, py] = toScreen(x, y);
      if ((px - bx) ** 2 + (py - by) ** 2 < 100) group.push({zi, vi, x, y});
    }));
    return {group, start: toWorld(bx, by)};
  }
  function drawEdit() {
    editG.clear();
    if (!editing) return;
    for (const z of zones) for (const [x, y] of z.poly) {
      const [sx, sy] = toScreen(x, y);
      editG.circle(sx, sy, 5).fill({color: 0xffffff}).stroke({width: 2, color: 0x0b0e12});
    }
  }

  // ---------- ввод ----------
  const pointers = new Map();
  let downAt = null, moved = false, pinch = null;
  const cv = app.canvas;
  cv.addEventListener('pointerdown', e => {
    try { cv.setPointerCapture(e.pointerId); } catch (err) { /* синтетический указатель */ }
    pointers.set(e.pointerId, {x: e.clientX, y: e.clientY});
    flight = null;
    if (pointers.size === 1) {
      downAt = {x: e.clientX, y: e.clientY}; moved = false;
      drag = editing ? nearestVertex(e.clientX, e.clientY) : null;
    }
    if (pointers.size === 2) {
      drag = null;
      const [a, b] = [...pointers.values()];
      pinch = {d: Math.hypot(a.x - b.x, a.y - b.y), z: cam.z, w: toWorld((a.x + b.x) / 2, (a.y + b.y) / 2)};
      moved = true;
    }
  });
  cv.addEventListener('pointermove', e => {
    const p = pointers.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (pointers.size === 1) {
      if (downAt && Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 6) moved = true;
      if (drag) {
        const [wx, wy] = toWorld(e.clientX, e.clientY), dxw = wx - drag.start[0], dyw = wy - drag.start[1];
        for (const v of drag.group) { const z = zones[v.zi]; z.poly[v.vi] = [Math.round(v.x + dxw), Math.round(v.y + dyw)]; z.__c = z.__b = null; }
        zonesDirty = true;
      } else if (moved) { cam.x -= dx / cam.z; cam.y -= dy / cam.z; clampCam(); }
    } else if (pointers.size === 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      cam.z = Math.min(Z_MAX, Math.max(zMin(), pinch.z * d / pinch.d));
      cam.x = pinch.w[0] - (mx - sw() / 2) / cam.z; cam.y = pinch.w[1] - (my - cyS()) / cam.z;
      clampCam();
    }
  });
  const up = e => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    if (drag && pointers.size === 0) { saveZones(); drag = null; downAt = null; return; }
    if (pointers.size === 0 && !moved && downAt && !editing) tap(e.clientX, e.clientY);
    if (pointers.size === 0) downAt = null;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => {
    e.preventDefault(); flight = null;
    const [wx, wy] = toWorld(e.clientX, e.clientY);
    cam.z = Math.min(Z_MAX, Math.max(zMin(), cam.z * Math.exp(-e.deltaY * 0.0015)));
    cam.x = wx - (e.clientX - sw() / 2) / cam.z; cam.y = wy - (e.clientY - cyS()) / cam.z;
    clampCam();
  }, {passive: false});
  const sameHit = (a, b) => a && b && a.kind === b.kind && a.i === b.i;
  function tap(sx, sy) {
    if (pickCb) { const cb = pickCb, [wx, wy] = toWorld(sx, sy); pick(null); cb({x: Math.round(wx), y: Math.round(wy)}); return; }
    const mh = markHit(sx, sy);
    if (mh && mh.kind === 'char') { showCard(null); if (onChar) onChar(mh.id); return; }
    const hit = mh || hitTest(...toWorld(sx, sy));
    showCard(sameHit(hit, selected) ? null : hit);
  }
  document.getElementById('modes').addEventListener('click', e => {
    const b = e.target.closest('button[data-f]'); if (!b) return;
    showCard(null); setFocus(b.dataset.f);
  });
  window.addEventListener('keydown', e => { if (e.key === 'a' && artC.children[0]) artC.visible = !artC.visible; });

  // ---------- кадр ----------
  const times = [];
  let fpsAt = 0, tFixed = null, ringsOn = true, ringMs = 0, ringT = -1, ringCamKey = '';
  cam.z = fitZoom(FOCUS.all.box); cam.x = (FOCUS.all.box.x0 + FOCUS.all.box.x1) / 2; cam.y = (FOCUS.all.box.y0 + FOCUS.all.box.y1) / 2;
  clampCam(); syncCenter(); drawShip(); placeLens(false);
  document.getElementById('loading').remove();
  app.ticker.add(tk => {
    syncCenter();
    const now = performance.now(), t = tFixed ?? now / 1000;
    if (flight) {
      const k = Math.min(1, (now - flight.t0) / flight.dur), e = ease(k);
      const lz = Math.log(flight.from.z) + (Math.log(flight.to.z) - Math.log(flight.from.z)) * e;
      cam.z = Math.exp(lz); cam.x = flight.from.x + (flight.to.x - flight.from.x) * e; cam.y = flight.from.y + (flight.to.y - flight.from.y) * e;
      if (k >= 1) flight = null;
      clampCam();
    }
    if (Math.abs(Math.log(cam.z / drawnFor)) > 0.2) drawShip();
    if (zonesDirty || Math.abs(Math.log(cam.z / zonesFor)) > 0.2) drawZones();
    applyLayer(world, 0); applyLayer(artTop, 0); animFx(t); syncBg(now);
    stars.width = sw(); stars.height = sh();
    stars.tilePosition.set(-cam.x * cam.z * 0.03 + sw() / 2, -cam.y * cam.z * 0.03);
    {
      const t0 = performance.now(), camKey = `${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(5)},${SCX},${SCY}`;
      const due = camKey !== ringCamKey || tFixed !== null || Math.abs(t - ringT) * RING.speed * RING.R * cam.z > 0.35;   // сдвиг ленты на экране, px
      if (!ringsOn) { clearMesh(ringsBack); clearMesh(ringsFront); ringCamKey = ''; }
      else if (due) { drawRings(t); ringT = t; ringCamKey = camKey; ringMs = ringMs * 0.9 + (performance.now() - t0) * 0.1; }
    }
    placeLabels(); placeMarks(); bldArtC.visible = zonesOn;
    const pl = Math.max(0, Math.min(1, (0.06 - cam.z) / 0.025));
    partLabels.visible = pl > 0.01;
    for (const lb of partLabels.children) { const [x, y] = toScreen(...lb.__w); lb.position.set(x, y); lb.scale.set(0.5); lb.alpha = pl; }
    if (selected) drawHighlight();
    drawEdit();
    times.push(tk.deltaMS); if (times.length > 180) times.shift();
    if (now - fpsAt > 500) {
      fpsAt = now;
      const s = [...times].sort((a, b) => a - b), med = s[Math.floor(s.length / 2)], base = s[Math.floor(s.length * 0.1)];
      const drop = times.filter(x => x > base * 1.5).length / times.length * 100;
      document.getElementById('fps').innerHTML = `кадр ${med.toFixed(1)} мс · кольца ${ringMs.toFixed(1)} мс · пропуски ${drop.toFixed(0)}% · текстура до ${maxTex}`;
    }
  });
  // выгрузка статичной части (как её рисует код) в SVG со слоями — для ship.svg
  window.__exportSvg = () => {
    const f = v => +(v / S).toFixed(2), hex = c => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
    const layers = {hull: [], detail: [], stern: []};
    const saved = [], z0 = cam.z;
    for (const [key, g] of [['hull', hullG], ['detail', detailG], ['stern', sternG]]) {
      const out = layers[key];
      let cur = '', tick = 0, last = '';
      const commit = (act, st) => {
        const d = (tick === 0 && last) ? last : cur.trim();
        if (d) {
          const prev = out[out.length - 1], a = st.alpha ?? 1;
          if (act === 'fill') out.push({d, fill: hex(st.color ?? 0), fo: a});
          else {
            const item = {stroke: hex(st.color ?? 0), so: a, sw: f(st.width ?? 1), join: st.join || 'miter', cap: st.cap || 'butt'};
            if (prev && prev.d === d && !prev.stroke) Object.assign(prev, item); else out.push({d, ...item});
          }
        }
        last = d; cur = ''; tick = 0;
      };
      const add = t => { cur += t + ' '; tick++; };
      const rec = {
        clear() { cur = ''; tick = 0; last = ''; return rec; },
        poly(p, close) { let t = ''; for (let i = 0; i + 1 < p.length; i += 2) t += (i ? 'L' : 'M') + f(p[i]) + ' ' + f(p[i + 1]) + ' '; add(t + (close ? 'Z' : '')); return rec; },
        rect(x, y, w, h) { add(`M${f(x)} ${f(y)} h${f(w)} v${f(h)} h${-f(w)} Z`); return rec; },
        roundRect(x, y, w, h, r) {
          const X = f(x), Y = f(y), W = f(w), H = f(h), R = Math.min(f(r), W / 2, H / 2), q = v => +v.toFixed(2);
          add(`M${q(X + R)} ${Y} h${q(W - 2 * R)} a${R} ${R} 0 0 1 ${R} ${R} v${q(H - 2 * R)} a${R} ${R} 0 0 1 ${-R} ${R} h${q(2 * R - W)} a${R} ${R} 0 0 1 ${-R} ${-R} v${q(2 * R - H)} a${R} ${R} 0 0 1 ${R} ${-R} Z`);
          return rec;
        },
        ellipse(x, y, rx, ry) { add(`M${f(x - rx)} ${f(y)} a${f(rx)} ${f(ry)} 0 1 0 ${f(2 * rx)} 0 a${f(rx)} ${f(ry)} 0 1 0 ${-f(2 * rx)} 0 Z`); return rec; },
        circle(x, y, r) { return rec.ellipse(x, y, r, r); },
        moveTo(x, y) { add(`M${f(x)} ${f(y)}`); return rec; },
        lineTo(x, y) { add(`L${f(x)} ${f(y)}`); return rec; },
        fill(st) { commit('fill', st || {}); return rec; },
        stroke(st) { commit('stroke', st || {}); return rec; },
      };
      const own = {};
      for (const k of Object.keys(rec)) { own[k] = Object.prototype.hasOwnProperty.call(g, k) ? g[k] : undefined; g[k] = rec[k]; }
      saved.push([g, own]);
    }
    const st0 = STATIC_REF.v; STATIC_REF.v = null;
    try { cam.z = 1; drawShip(); } finally {
      cam.z = z0; STATIC_REF.v = st0;
      for (const [g, own] of saved) for (const k of Object.keys(own)) { if (own[k] === undefined) delete g[k]; else g[k] = own[k]; }
      drawShip();
    }
    const el = e => {
      let a = `<path d="${e.d}"`;
      a += e.fill ? ` fill="${e.fill}"${e.fo !== 1 ? ` fill-opacity="${+e.fo.toFixed(3)}"` : ''}` : ' fill="none"';
      if (e.stroke) a += ` stroke="${e.stroke}" stroke-width="${e.sw}"${e.so !== 1 ? ` stroke-opacity="${+e.so.toFixed(3)}"` : ''}${e.join !== 'miter' ? ` stroke-linejoin="${e.join}"` : ''}${e.cap !== 'butt' ? ` stroke-linecap="${e.cap}"` : ''}`;
      return '    ' + a + '/>';
    };
    const L = (id, label, items) => `  <g id="${id}" inkscape:groupmode="layer" inkscape:label="${label}">\n${items.map(el).join('\n')}\n  </g>`;
    const guide = [];
    for (const r of RINGS) {
      const cx = r.cx / S, cy = r.cy / S;
      for (const rad of [RING.R / S, RING.Ri / S]) guide.push(`    <ellipse cx="${cx}" cy="${cy}" rx="${+(rad * RING.k).toFixed(2)}" ry="${rad}" fill="none" stroke="#00e5ff" stroke-width="1.5" stroke-dasharray="6 4"/>`);
    }
    return `<?xml version="1.0" encoding="UTF-8"?>
<!-- Феном: статичная часть корабля для схемы (страница ship/). Единицы — пиксели бокового вида.
     Слои рисуются на странице так: «Корпус» → районы (schema.json) → «Детали» → «Корма».
     Слои с именем на «Референс…» / «Ориентир…» страница пропускает. Кольца и лифты рисует код,
     их место — в слое «Ориентир». Тёмные обводки держат толщину на экране при отдалении,
     остальное масштабируется вместе с кораблём. Картинки (image) страница не показывает. -->
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" xmlns:inkscape="http://www.inkscape.org/namespaces/inkscape"
     xmlns:sodipodi="http://sodipodi.sourceforge.net/DTD/sodipodi-0.dtd" width="2180" height="900" viewBox="-40 -80 2180 900">
  <g id="ref-art" inkscape:groupmode="layer" inkscape:label="Референс: вид сбоку (ship_side.png рядом с файлом)" sodipodi:insensitive="true" style="display:none" opacity="0.5">
    <image href="ship_side.png" xlink:href="ship_side.png" x="0" y="0" width="2000" height="758"/>
  </g>
${L('hull', 'Корпус', layers.hull)}
${L('detail', 'Детали', layers.detail)}
${L('stern', 'Корма', layers.stern)}
  <g id="ref-rings" inkscape:groupmode="layer" inkscape:label="Ориентир: кольца (рисует код)" sodipodi:insensitive="true">
${guide.join('\n')}
  </g>
</svg>
`;
  };
  window.__ship = {app, setChars, pick, fx: fxC, cam, setFocus, flyTo, showCard, hitTest, toWorld, toScreen, zones, setEditing, setT: v => { tFixed = v; }, rings: v => { ringsOn = v; },
    benchRings: (n = 60) => { const t0 = performance.now(); for (let i = 0; i < n; i++) drawRings(20 + i * 0.016); return +((performance.now() - t0) / n).toFixed(2); }};
  const q = new URLSearchParams(location.search);
  if (q.get('f')) setFocus(q.get('f'));
})();
