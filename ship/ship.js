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
  // кругов нет — грани (игрок, 10.10.2026): r < 20 ед. — 8 граней, < 80 — 12, крупнее — 16; плоская грань сверху
  // (было 8/20 → 8/12/16; игрок: «12 и меньше — норма», грани должны читаться). Восьмиугольник — 8 вершин против
  // ~25–45 у круга PixiJS (notes/vector-craft.md). Плоский массив для poly().
  const nOf = r => r < 20 ? 8 : r < 80 ? 12 : 16;
  const ngon = (x, y, rx, ry = rx, n = nOf(Math.max(rx, ry))) => {
    const o = [];
    for (let k = 0; k < n; k++) { const a = -Math.PI / 2 + Math.PI * (2 * k + 1) / n; o.push(x + rx * Math.cos(a), y + ry * Math.sin(a)); }
    return o;
  };
  // прямоугольник со скошенными углами вместо скруглённого (roundRect): c — срез угла
  const arcN = (r, span) => Math.max(2, Math.round(nOf(r) * span / (2 * Math.PI)));   // граней у дуги: как у круга того же радиуса
  const cvPoly = (g, f) => { g.beginPath(); g.moveTo(f[0], f[1]); for (let i = 2; i < f.length; i += 2) g.lineTo(f[i], f[i + 1]); g.closePath(); };   // холст: плоский массив
  const cham = (x, y, w, h, c) => [x + c, y, x + w - c, y, x + w, y + c, x + w, y + h - c, x + w - c, y + h, x + c, y + h, x, y + h - c, x, y + c];
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
    'Капитанский мостик': 0x5b8cff, 'Район модулей': 0xffb34d, 'Космопорт': 0x4fd1c5,
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
  for (const [k, g] of Object.entries({hullG, zonesG, detailG, sternG, turbG, hiG, editG})) g.label = k;   // имена слоёв — для отладки и замеров
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
          const q = ngon(cx, cy, rx, ry, nOf(Math.max(rx, ry) * S));               // грани, не круг
          let d = ''; for (let i = 0; i < q.length; i += 2) d += (i ? 'L' : 'M') + q[i] + ' ' + q[i + 1];
          return d + 'Z';
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
                      // круглые стыки и концы — острыми/прямоугольными: вершин в 3–7 раз меньше (notes/vector-craft.md)
                      join: cs.strokeLinejoin === 'bevel' ? 'bevel' : 'miter',
                      cap: ['round', 'square'].includes(cs.strokeLinecap) ? 'square' : 'butt'};
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
      if (c.kind === 'vec') { c.g = new PIXI.Graphics({label: `svg:${c.target}:${c.layer.getAttribute('inkscape:label') || c.layer.id}`}); C[c.target].addChild(c.g); continue; }
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
  const dotTex = canvasTex(32, 32, (g, w) => { g.fillStyle = '#fff'; cvPoly(g, ngon(w / 2, w / 2, w / 2 - 1, w / 2 - 1, 8)); g.fill(); });   // огонёк — восьмиугольник
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
    const rr = (x, y, w, h, r) => cvPoly(g, cham(x, y, w, h, r));                 // скошенные углы
    g.lineJoin = 'miter'; g.strokeStyle = '#0d1114';
    g.lineWidth = 3; g.beginPath(); g.moveTo(52, 37); g.lineTo(60, 47); g.lineTo(75, 49); g.strokeStyle = '#3d484e'; g.stroke();   // рука-манипулятор
    g.strokeStyle = '#0d1114'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(27, 15); g.lineTo(23, 6); g.stroke();                                   // антенна
    rr(4, 18, 12, 16, 3); g.fillStyle = '#56636a'; g.fill(); g.stroke();                              // кормовой движок
    rr(14, 13, 56, 26, 8); g.fillStyle = '#b9c5c6'; g.fill(); g.stroke();                              // корпус
    g.fillStyle = '#d6e0e1'; g.fillRect(20, 16, 40, 4);                                                // светлый верх
    g.fillStyle = '#1f3b7d'; g.fillRect(15, 30, 54, 4);                                                // синяя полоса
    rr(53, 18, 14, 10, 3); g.fillStyle = '#1b2427'; g.fill(); g.stroke();                              // окуляр
    g.fillStyle = '#7fe3ff'; cvPoly(g, ngon(62, 23, 2.6)); g.fill();
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
            g.stroke(k.fill ? {fill: k.fill, width, join: k.join, cap: k.cap, miterLimit: 3} : {width, color: k.color, alpha: k.alpha, join: k.join, cap: k.cap, miterLimit: 3});
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
      hullG.poly(PL(path), false).stroke({width: lw * 1.4, color: C.line, join: 'miter', miterLimit: 3});
    }

    detailG.clear();
    const seam = (pts, w = hair, a = 0.75) => { detailG.moveTo(...P(...pts[0])); for (const p of pts.slice(1)) detailG.lineTo(...P(...p)); detailG.stroke({width: w, color: C.line, alpha: a, join: 'miter', miterLimit: 3}); };
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
      dashPath(pts, dash, gap); detailG.stroke({width: Math.max(lw * 1.2, w * 2.6 * S), color: C.glow, alpha: 0.16, cap: 'square'});
      dashPath(pts, dash, gap); detailG.stroke({width: Math.max(2.2, w * S), color: C.dash, alpha: 0.95, cap: 'square'});
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
      detailG.poly(q([[-26, 0], [26, 0], [26, 20], [-26, 20]]), true).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
      detailG.poly(q([[-NW, 0], [NW, 0], [NW, ND], [-NW, ND]]), true).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
      // опоры шарнира в стенках паза
      for (const sgn of [-1, 1]) detailG.poly(ngon(...P(...f([sgn * 15, ND - 5.2])), 3.2 * S), true).fill({color: 0x56636a}).stroke({width: hair, color: C.line});
      detailG.poly(ngon(...P(...f([-23.5, 16])), 1.3 * S), true).poly(ngon(...P(...f([23.5, 16])), 1.3 * S), true).fill({color: C.glow, alpha: 0.9});
    }
    // шлюзы космопорта в киле, под ними гравитационный щит
    for (const [x0, x1] of [[400, 470], [490, 560]]) {
      detailG.poly(PL([[x0, 551], [x1, 551], [x1, 565], [x0, 565]]), true).fill({color: C.hole}).stroke({width: thin, color: C.line});
      detailG.moveTo(...P(x0 + 4, FB + 4)).lineTo(...P(x1 - 4, FB + 4)).stroke({width: lw * 1.6, color: C.glow, alpha: 0.85});
    }
    // маневровые дюзы на киле
    for (const x of [612, 680]) detailG.poly(cham(...P(x, 553), 24 * S, 9 * S, 2 * S), true).fill({color: C.hole2}).stroke({width: hair, color: C.line});
    // шипы-антенны на крыше носа и спойлер на сгибе — по арту
    for (const [x, h] of [[596, 34], [686, 30], [764, 24]]) {               // светлая и тёмная грань — объём
      const y = domeY(x) + 1, tip = [x + 20, FT - h];
      detailG.poly(PL([[x - 5, y], [x - 1, y], tip]), true).fill({color: 0xc6d1d3});
      detailG.poly(PL([[x - 1, y], [x + 3, y], tip]), true).fill({color: 0x66727a});
      detailG.poly(PL([[x - 5, y], [x + 3, y], tip]), true).stroke({width: hair, color: C.line, join: 'miter', miterLimit: 3});
    }
    detailG.poly(PL([[778, FT], [792, 131], [828, 127], [850, 138], [846, 158], [836, 157], [800, FT]]), true)
      .fill({color: C.hull}).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
    detailG.moveTo(...P(842, 132)).lineTo(...P(866, 118)).stroke({width: lw, color: C.line});
    detailG.poly(PL([[816, 121], [870, 110], [906, 108], [894, 120], [834, 126]]), true)
      .fill({color: C.hullHi}).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
    detailG.poly(PL([[836, 121], [890, 112], [886, 116], [838, 124]]), true).fill({color: C.navy});
    // корпус между городом и кормой: стык-муфта (швы), без синей полосы
    seam([[1490, TOP + 2], [1490, BOT - 2]], hair, 0.5);
    lights([[1494, 300], [1540, 300]], 6, 4, 2.4); lights([[1494, 412], [1540, 412]], 6, 4, 2.4);
    dots(1496, 214, 8, 2); dots(1496, 470, 8, 2);
    detailG.poly(cham(...P(1500, 336), 38 * S, 52 * S, 3 * S), true).fill({color: C.hole2}).stroke({width: thin, color: C.line});
    for (let k = 1; k < 9; k++) detailG.moveTo(...P(1500, 336 + k * 5.8)).lineTo(...P(1538, 336 + k * 5.8));
    detailG.stroke({width: hair, color: C.line, alpha: 0.7});
    seam([[1494, 250], [1540, 250]]); seam([[1494, 454], [1540, 454]]);
    // клинок: щели вентиляции и треугольный воздухозаборник — как на арте
    for (const k of [0, 1, 2]) detailG.poly(PL([[96 + k * 7, 424], [102 + k * 7, 413], [105 + k * 7, 413], [99 + k * 7, 424]]), true).fill({color: C.line});
    detailG.poly(PL([[128, 452], [168, 426], [168, 452]]), true).fill({color: C.hole}).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
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
      if (part.length > 2) sternG.poly(PL(part), true).fill({color: 0x46525a}).stroke({width: lw, color: C.line, join: 'miter', miterLimit: 3});
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
    sternG.poly(PL(eng), true).fill({color: 0x5a666c}).stroke({width: lw, color: C.line, join: 'miter', miterLimit: 3});
    sternG.poly(PL([[1540, BOT + 10], [1640, BOT + 10], [1640, BOT + 20], [1543, BOT + 20]]), true).fill({color: 0x6f7b81});
    for (const [x, y] of [[1530, BOT + 42], [1538, BOT + 78]]) {          // раструб расширяется к носу, срез виден эллипсом
      sternG.poly(PL([[x + 22, y - 9], [x, y - 14], [x, y + 14], [x + 22, y + 9]]), true).fill({color: 0x3d484e}).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
      sternG.poly(PL([[x + 22, y - 9], [x + 6, y - 12], [x + 6, y - 6], [x + 22, y - 4]]), true).fill({color: 0x6f7b81});
      sternG.poly(ngon(...P(x, y), 5 * S, 14 * S), true).fill({color: 0x1b2226}).stroke({width: thin, color: C.line});
      sternG.poly(ngon(...P(x - 1, y), 2.6 * S, 9 * S), true).fill({color: C.glow, alpha: 0.45});
    }
    sternG.poly(PL(STERN), true).fill({color: C.hull});
    sternG.poly(PL(clipY(STERN, AX([0, 404])[1], false)), true).fill({color: 0x9eabad});     // нижняя плита (под балкой) — в тени
    sternG.moveTo(...P(...AX([1620, 404]))).lineTo(...P(...AX([1952, 403]))).stroke({width: thin, color: C.line, alpha: 0.8});
    // скос у левой кромки: тонкая тёмная грань, как на арте
    sternG.poly(PL([[1583, 163], [1612, 300], [1612, 412], [1562, 665], [1572, 665], [1621, 412], [1621, 300], [1592, 163]].map(AX)), true)
      .fill({color: 0x000000, alpha: 0.12});
    sternG.poly(PL(STERN), true).stroke({width: lw * 1.4, color: C.line, join: 'miter', miterLimit: 3});
    // короба (выступают): светлая верхняя кромка, тень снизу
    sternG.poly(PL(STERN_UNDER), true).fill({color: 0xa2afb1}).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
    for (const p of STERN_BOXES) {
      sternG.poly(PL(p.map(([x, y]) => [x + 2, y + 5])), true).fill({color: 0x000000, alpha: 0.16});
      sternG.poly(PL(p), true).fill({color: C.hullHi}).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
    }
    for (const p of STERN_PANELS) {
      sternG.poly(PL(p.map(([x, y]) => [x, y + 2.5])), true).fill({color: 0xd2dcdd});   // светлая кромка снизу — панель утоплена
      sternG.poly(PL(p), true).fill({color: C.hullLo}).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
    }
    for (const p of STERN_TRIS) sternG.poly(PL(p), true).fill({color: C.hullLo}).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
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
    sternG.poly(PL(STERN_SLOTS), true).fill({color: C.hullLo}).stroke({width: thin, color: C.line, join: 'miter', miterLimit: 3});
    {
      const [[ax, ay], [bx, by], [cx, cy], [dx, dy]] = STERN_SLOTS;
      for (const v of [0.32, 0.7]) for (let k = 0; k < 4; k++) {
        const u = 0.14 + k * 0.22, x0 = ax + (bx - ax) * u + (dx - ax) * v, y0 = ay + (by - ay) * u + (dy - ay) * v;
        sternG.poly(cham(...P(x0, y0 - 3), 6 * S, 8 * S, 2 * S), true);
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
    disc(x, y, r, row, D = DISC) { const pts = []; for (const [cx, cy] of D) pts.push([x + r * cx, y + r * cy]); this.poly(pts, row); }
    flush(mesh) {
      const g = mesh.geometry;
      g.positions = this.P.subarray(0, this.n * 2); g.uvs = this.U.subarray(0, this.n * 2); g.indices = this.I.subarray(0, this.m);
    }
  }
  const LX = new Float64Array(4096), LY = new Float64Array(4096), LNX = new Float64Array(4096), LNY = new Float64Array(4096);
  // огни колец — грани, плоская сверху: 8 (огонёк), 12 (ореол); было 14
  const facet = n => [...Array(n)].map((_, k) => { const a = -Math.PI / 2 + Math.PI * (2 * k + 1) / n; return [Math.cos(a), Math.sin(a)]; });
  const DISC = facet(8), DISC12 = facet(12);
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
    // сегменты мелкие: у узкого эллипса сверху и снизу изгиб резкий, крупный шаг даёт изломы. Кольцо — большая форма:
    // плавное (игрок, 10.10.2026; проба 24 гранями — v90–91: кусок-панель целиком прыгал между половинами на
    // границе сверху и снизу — окна «из воздуха», дребезг линий; notes/vector-craft.md, «Анимация псевдо-3D»)
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
        if (on) mb.disc(x, y, Math.max(1.6, 3.4 * S * cam.z), 'halo', DISC12);
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
  // v5 (07.10.2026): свободные зоны ушли в фермы/аквакультуру, нос — по вырезам ship.svg, город до 1482;
  // v6 (08.10.2026): аквакультура — от уровня лесов, фермы забрали её верх (фон
  // перерисован под это). Прежняя правка в браузере не переносится (старые контуры перебили бы новые)
  const STORE = 'phenomSchemaZones6', STORE_OLD = null;
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
      zonesG.poly(z.poly.flat(), true).fill({color: col, alpha: z.free ? 0.12 : BG ? 0.14 : 0.34}).stroke({width: lw, color: z.free ? 0x5b6a70 : col, alpha: 0.95, join: 'miter', miterLimit: 3});
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
    'Космопорт': ['Ангар', 'Верфь'], 'Район ферм': ['Теплицы', 'Элеватор'], 'Район лесов': ['Лесничество'],
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
      const zi = it.zone ? zones.findIndex(z => z.name === it.zone) : zones.findIndex(z => inside(it.x, it.y, z.poly));
      const old = blds.findIndex(b => !b.art && normName(b.name) === normName(it.name));
      if (old >= 0) { blds[old].c.destroy({children: true}); blds.splice(old, 1); }
      const lb = markLabel(it.name); lb.anchor.set(0.5, 0); markC.addChild(lb);
      const b = {name: it.name, zi: zi >= 0 ? zi : 0, w: [it.x, it.y], art: {x0: it.x - it.w / 2, y0: it.y - it.h / 2, x1: it.x + it.w / 2, y1: it.y + it.h / 2}, lb};
      blds.push(b);
      if (it.file) PIXI.Assets.load('bld/' + it.file + '?v=' + (BJ.v || 1)).then(t => {   // без file — рисует код (главная станция маглева)
        const sp = new PIXI.Sprite(t); sp.position.set(b.art.x0, b.art.y0); sp.width = it.w; sp.height = it.h; bldArtC.addChild(sp); b.sp = sp;
      }).catch(() => {});
    }
  } catch (e) { /* без артов — остаются значки */ }
  // ---------- стены города (09.10.2026, v5) ----------
  // Вместо растровой рамки «Гигаструктура» и затемнения-«ромбов». Отвергнуты: v1 (шестерни, синие полосы),
  // v2 (повторялись одни и те же структуры), v3 (постройки глубоко в районах — «линейный город, а стена растёт
  // ВВЕРХ, мы смотрим сверху»). v4/v5 — узкая полоса стены: снаружи верх стены с sci-fi деталями (плиты,
  // кабели, решётки, ряды огней, люки), к городу — фасад с обликом района (окна у центра, неон у Ночного,
  // жар у Заводского, броня у Пустошей, зелень у ферм, вода у аквакультуры, плющ у леса, леса у Фронтира).
  // В город выступают только редкие башни разной формы (висячая v2 — любимая игроком, шпиль, ступени, вилка,
  // диск на стебле…) с акцентом района. v5 (игрок): убраны бегущие импульсы и лифты на фасаде; вместо них —
  // жилой модуль у центра (лифтовую башню игрок убрал), парящие сады у ферм; у Ночного — тёмное стекло с неоновыми полосами без
  // цветного контура; у аквакультуры вместо башен — одно большое место: бассейн, большой водопад с чашей и
  // пеной, каналы с малыми водопадами. Башни — слоем НАД маглевом (пути уходят в них, как в тоннель; раньше
  // поезда ехали поверх башен). Рисуется ОДИН раз (линии в единицах мира), живое — спрайты.
  // Местные оси стороны: u — вдоль стены, v — внутрь полости (v = 0 — край полости, v = t — грань стены).
  const WL = {x0: 5600, y0: 1920, x1: 14820, y1: 5220};
  const WG = {base: 0x6d787b, dark: 0x4f585b, deep: 0x343c3f, lit: 0x9aa6a8, mid: 0x7a8588, hi: 0xb3bec0,
              warm: 0xffd27a, white: 0xfff1d6, fire: 0xff8a3c, green: [0x5f8f4a, 0x7fb35a, 0x4d7a3c, 0x93c26a],
              water: 0xbfe6e2, pool: 0x8fc9c4, foam: 0xe6fffb, glass: 0x22262f};
  const wallC = new PIXI.Container(), wallShade = new PIXI.Container(), wallG = new PIXI.Graphics(), wallFx = new PIXI.Container();
  wallC.addChild(wallShade, wallG, wallFx);
  world.addChildAt(wallC, world.getChildIndex(bldArtC) + 1);
  // башни — отдельным слоем под маглевом (кладётся в блоке маглева, когда есть mgC)
  const towerC = new PIXI.Container(), towerG = new PIXI.Graphics(), towerFx = new PIXI.Container();
  towerC.addChild(towerG, towerFx);
  let gfx = wallG, fxc = wallFx;                            // куда рисуют помощники: стена или башни
  const WSIDES = [
    {k: 'top', o: [WL.x0, WL.y0], u: [1, 0], v: [0, 1], len: WL.x1 - WL.x0, t: 80},
    {k: 'bot', o: [WL.x0, WL.y1], u: [1, 0], v: [0, -1], len: WL.x1 - WL.x0, t: 80},
    {k: 'nose', o: [WL.x0, WL.y0], u: [0, 1], v: [1, 0], len: WL.y1 - WL.y0, t: 96},
    {k: 'stern', o: [WL.x1, WL.y0], u: [0, 1], v: [-1, 0], len: WL.y1 - WL.y0, t: 96},
  ];
  const WTOP = 0.4;                                          // доля полосы — верх стены (дальше — фасад)
  // места станций маглева в стене (ST в блоке маглева) — там башен нет; особые места — лифтовая башня у центра
  const WSKIP = {top: [9000 - WL.x0, 13150 - WL.x0], bot: [7600 - WL.x0, 10950 - WL.x0], nose: [3450 - WL.y0], stern: [3570 - WL.y0]};   // nose — портал главной станции маглева
  const WLIFT = {k: 'top', u: 10500 - WL.x0};   // жилой модуль: Центральный город, левее Ратуши
  const wpt = (sd, u, v) => [sd.o[0] + sd.u[0] * u + sd.v[0] * v, sd.o[1] + sd.u[1] * u + sd.v[1] * v];
  const wpoly = (sd, pts) => pts.flatMap(([u, v]) => wpt(sd, u, v));
  const wr = rngOf(seedOf('стены Фенома v5')), wR = (a, b) => a + wr() * (b - a), wRI = (a, b) => Math.floor(wR(a, b + 1));
  const wPick = arr => arr[Math.floor(wr() * arr.length)];
  const zoneNameAt = (x, y) => (zones.find(z => inside(x, y, z.poly)) || {}).name;
  const WKIT = {'Центральный город': 'hab', 'Пригород': 'hab', 'Спальный район': 'hab', 'Ночной район': 'night',
    'Заводской район': 'factory', 'Пустоши': 'util', 'Тюремный район': 'util', 'Район ферм': 'garden',
    'Район аквакультуры': 'water', 'Район лесов': 'vines', 'Район Фронтира': 'build', 'Район новой застройки': 'util'};   // новая застройка — трущобы (игрок)
  const NEON = [0xff4fd8, 0xb86bff, 0xff6b9a];               // розовый/фиолетовый — без оранжевого и синего
  const shadeTex = canvasTex(4, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(0.35, 'rgba(0,0,0,0.2)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  const beamTex = canvasTex(128, 64, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, 'rgba(255,240,200,0.9)'); gr.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(0, h / 2 - 2); g.lineTo(w, 0); g.lineTo(w, h); g.lineTo(0, h / 2 + 2); g.closePath(); g.fill();
  });
  const ringTex = canvasTex(64, 64, (g, w) => { g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 4; g.lineJoin = 'miter'; cvPoly(g, ngon(w / 2, w / 2, w / 2 - 4, w / 2 - 4, 12)); g.stroke(); });
  const LW = 3.5, TH = 1.8;                                  // контур и тонкие линии — в единицах мира
  const wP = (sd, pts, fill, a = 1) => gfx.poly(wpoly(sd, pts), true).fill({color: fill, alpha: a}).stroke({width: LW, color: C.line, join: 'miter', miterLimit: 3});
  const wF = (sd, pts, fill, a = 1) => gfx.poly(wpoly(sd, pts), true).fill({color: fill, alpha: a});
  const wLine = (sd, pts, w, color, a = 1) => gfx.poly(wpoly(sd, pts), false).stroke({width: w, color, alpha: a, cap: 'square', join: 'miter', miterLimit: 3});
  const wRect = (sd, u0, v0, u1, v1, fill, a = 1) => wF(sd, [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], fill, a);
  const wDot = (sd, u, v, r, fill, a = 1) => gfx.poly(ngon(...wpt(sd, u, v), r), true).fill({color: fill, alpha: a});
  const wallPoly = (sd, pts) => gfx.poly(wpoly(sd, pts), true).stroke({width: LW, color: C.line, join: 'miter', miterLimit: 3});
  const wRing = (sd, u, v, r, fill, a = 1) => gfx.poly(ngon(...wpt(sd, u, v), r), true).fill({color: fill, alpha: a}).stroke({width: LW, color: C.line});
  // живое
  const wFx = {blink: [], lift: [], smoke: [], fall: [], neon: [], flame: [], beam: [], ripple: [], win: [], drone: [], screen: [], crane: []};
  // убранное (игрок) всё равно «съедает» вызовы wr: иначе перетасуется вся раскладка башен
  const wSkip = n => { for (let i = 0; i < n; i++) wr(); };
  // спрайт-рамка в осях стороны: локальные x = u, y = v (с отражением у нижней/кормовой стены)
  const wFrame = (sd, u, v) => { const c = new PIXI.Container(); c.position.set(...wpt(sd, u, v)); c.rotation = Math.atan2(sd.u[1], sd.u[0]); c.scale.y = sd.u[0] * sd.v[1] - sd.u[1] * sd.v[0]; fxc.addChild(c); return c; };
  const crateTex = canvasTex(16, 12, (g, w, h) => { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.strokeStyle = '#0d1114'; g.lineWidth = 2; g.strokeRect(1, 1, w - 2, h - 2); g.beginPath(); g.moveTo(w / 2, 1); g.lineTo(w / 2, h - 1); g.stroke(); });
  const ROBO = 0xe0a63c;                                     // промышленный жёлтый — тележки крана, разметка
  const wSpr = (tex, x, y, tint, size, blend = 'add') => { const s = new PIXI.Sprite(tex); s.anchor.set(0.5); s.position.set(x, y); s.tint = tint; s.blendMode = blend; s.width = s.height = size; fxc.addChild(s); return s; };
  const blinkAt = (sd, u, v, tint = 0xff5a4a, size = 60) => wFx.blink.push({b: wSpr(glowTex, ...wpt(sd, u, v), tint, size), ph: wr() * 6.28, sp: 1.1 + wr() * 1.4});
  const flameAt = (sd, u, v) => {
    wFx.flame.push({b: wSpr(glowTex, ...wpt(sd, u, v), WG.fire, 70), ph: wr() * 6.28});
    for (let i = 0; i < 2; i++) wFx.smoke.push({b: wSpr(glowTex, 0, 0, 0x8a9396, 60, 'normal'), sd, u, v, ph: i / 2 + wr() * 0.2});
  };
  // струи воды: n капель-штрихов бегут от v0 к v1 в полосе шириной wd
  const dropsAt = (sd, u, wd, v0, v1, n, len = 16) => {
    for (let i = 0; i < n; i++) {
      const d = new PIXI.Sprite(PIXI.Texture.WHITE); d.anchor.set(0.5); d.tint = WG.foam; fxc.addChild(d);
      wFx.fall.push({d, sd, u: u + wR(-wd / 2, wd / 2), v0, v1, ph: wr(), sp: 0.5 + wr() * 0.5, len});
    }
  };
  const fallAt = (sd, u, L) => {                             // малый водопад с грани стены в город
    wLine(sd, [[u, sd.t], [u, sd.t + L]], 12, WG.water, 0.35); wLine(sd, [[u, sd.t], [u, sd.t + L]], 4, WG.foam, 0.5);
    dropsAt(sd, u, 6, sd.t, sd.t + L, 3);
  };
  // ---------- верх стены: sci-fi «гриблы» по сегментам случайной длины ----------
  function wallTop(sd) {
    const {len: L, t} = sd, vt = t * WTOP;
    wP(sd, [[0, 0], [L, 0], [L, t], [0, t]], WG.base);
    wF(sd, [[0, 0], [L, 0], [L, vt], [0, vt]], WG.dark);
    for (let u = wR(0, 60); u < L;) {
      const len = wR(50, 220), kind = wr(), u1 = Math.min(L, u + len);
      if (kind < 0.3) {                                       // утопленная плита
        wRect(sd, u + 4, vt * 0.15, u1 - 4, vt * 0.85, wr() < 0.5 ? WG.deep : WG.mid, 0.9);
        wLine(sd, [[u + 4, vt * 0.15], [u1 - 4, vt * 0.15]], TH, WG.hi, 0.5);
      } else if (kind < 0.5) {                                // пучок кабелей
        for (let k = 0; k < 3; k++) wLine(sd, [[u, vt * (0.25 + k * 0.22)], [u1, vt * (0.25 + k * 0.22)]], 3, k % 2 ? WG.deep : WG.lit, 0.85);
      } else if (kind < 0.68) {                               // решётка
        for (let x = u + 6; x < u1 - 6; x += 11) wRect(sd, x, vt * 0.2, x + 6, vt * 0.8, WG.deep, 0.9);
      } else if (kind < 0.85) {                               // ряд огней
        for (let x = u + 10; x < u1 - 6; x += 18) wDot(sd, x, vt * 0.5, 3.2, wr() < 0.7 ? WG.white : WG.warm, 0.85);
      } else {                                                // технический люк
        wRect(sd, u + 8, vt * 0.2, u + 8 + Math.min(40, len - 16), vt * 0.8, WG.mid, 1);
        wLine(sd, [[u + 8, vt * 0.2], [u + 8 + Math.min(40, len - 16), vt * 0.8]], TH, C.line, 0.6);
      }
      wLine(sd, [[u1, 0], [u1, vt]], TH, C.line, 0.6);        // шов сегмента
      u = u1;
    }
    wLine(sd, [[0, vt], [L, vt]], 7, WG.deep); wLine(sd, [[0, vt - 2], [L, vt - 2]], 2, WG.hi, 0.6);   // магистраль
    wF(sd, [[0, t - 7], [L, t - 7], [L, t], [0, t]], WG.lit);                                       // кромка фасада
  }
  // ---------- зелень: лиана (изгиб, сужение, листья, иногда цветок), гирлянда, куст ----------
  const LEAF = [0x5f8f4a, 0x7fb35a, 0x4d7a3c, 0x93c26a, 0x6aa04f];
  function vine(sd, u, v, L, {sway = 6, w0 = 3.6, flower = 0.25} = {}) {
    const pts = [], ph = wr() * 6.28, k = wR(0.8, 1.6);
    for (let s = 0; s <= L; s += 5) pts.push([u + Math.sin(s / L * Math.PI * k + ph) * sway * (s / L), v + s]);
    const n = pts.length, cut = [0, Math.floor(n * 0.45), Math.floor(n * 0.8), n - 1];
    const st = Math.max(1, Math.round(n / 4)), on = j => j % st === 0 || cut.includes(j);   // стебель гранями: опорные точки, листья — по всем
    for (let i = 0; i < 3; i++) if (cut[i + 1] > cut[i]) wLine(sd, pts.slice(cut[i], cut[i + 1] + 1).filter((_, j) => on(cut[i] + j)), w0 * (1 - i * 0.28), 0x3f6a30, 0.95);
    for (let i = 2; i < n; i += 2) {                         // листья поочерёдно по сторонам
      const [a, b] = pts[i], [pa, pb] = pts[i - 1], tl = Math.hypot(a - pa, b - pb) || 1, tu = (a - pa) / tl, tv = (b - pb) / tl;
      const side = i % 4 ? 1 : -1, nu = -tv * side, nv = tu * side, sz = wR(6.5, 10) * (1 - i / n * 0.4);
      wF(sd, [[a, b], [a + nu * sz * 0.6 + tu * sz * 0.35, b + nv * sz * 0.6 + tv * sz * 0.35], [a + nu * sz * 1.25, b + nv * sz * 1.25], [a + nu * sz * 0.6 - tu * sz * 0.2, b + nv * sz * 0.6 - tv * sz * 0.2]], wPick(LEAF), 0.95);
    }
    const [eu, ev] = pts[n - 1];
    if (wr() < flower) { const c = wPick([0xffb3d1, 0xfff1d6, 0xffd27a]); for (let q = 0; q < 5; q++) { const g = q / 5 * 6.28; wDot(sd, eu + Math.cos(g) * 2.6, ev + Math.sin(g) * 2.6, 2, c, 0.95); } wDot(sd, eu, ev, 1.4, 0xffd27a); }
    else wDot(sd, eu, ev, 2.4, wPick(LEAF));
  }
  function festoon(sd, u0, u1, v, sag) {                    // гирлянда: провисает между двумя точками — вниз по миру
    if (!sd.v[1]) return;                                   // на боковых стенах «вниз» — вдоль стены, гирлянд нет
    sag *= sd.v[1]; const pts = [];
    for (let i = 0; i <= 16; i++) { const f = i / 16; pts.push([u0 + (u1 - u0) * f, v + sag * 4 * f * (1 - f)]); }
    wLine(sd, pts.filter((_, i) => i % 4 === 0), 2.2, 0x3f6a30, 0.9);   // провис гранями
    for (let i = 1; i < 16; i++) { const [a, b] = pts[i]; wDot(sd, a + wR(-2, 2), b + wR(1, 4), wR(2.5, 4.5), wPick(LEAF)); }
  }
  function bush(sd, u, v, r) {                              // куст: тень, несколько крон, блик
    wDot(sd, u + r * 0.25, v + r * 0.3, r * 1.05, 0x23331d, 0.45);
    for (let q = 0; q < 4; q++) wDot(sd, u + wR(-r, r) * 0.6, v + wR(-r, r) * 0.5, r * wR(0.55, 0.85), wPick(LEAF), 0.95);
    wDot(sd, u - r * 0.3, v - r * 0.3, r * 0.3, 0xb8e08c, 0.6);
  }
  // ---------- фасад по районам: только внутри полосы (v от vt до t) ----------
  const FACADE = {
    hab(sd, u0, u1) {
      const v0 = sd.t * WTOP + 6, v1 = sd.t - 10;
      for (let u = u0; u < u1;) {                            // модули разной ширины: окна рядами, разделители
        const w = Math.min(u1 - u, wR(80, 200)), rows = wRI(2, 3), lit = wR(0.35, 0.75);
        for (let r = 0; r < rows; r++) for (let x = u + 8; x < u + w - 12; x += 14) {
          const v = v0 + (r + 0.5) * (v1 - v0) / rows - 3;
          wRect(sd, x, v, x + 9, v + 6, wr() < lit ? WG.warm : WG.deep, 0.8);
        }
        wLine(sd, [[u + w, v0 - 4], [u + w, v1 + 6]], TH, C.line, 0.6);
        u += w;
      }
    },
    night(sd, u0, u1) {
      const v0 = sd.t * WTOP + 6, v1 = sd.t - 10;
      for (let u = u0; u < u1;) {
        const w = Math.min(u1 - u, wR(90, 220)), c = wPick(NEON);
        wRect(sd, u + 3, v0, u + w - 3, v1 + 4, WG.glass, 0.9);                       // тёмное стекло
        wLine(sd, [[u + 6, v0 + 2], [u + w - 6, v0 + 2]], 3, c, 0.85);
        for (let x = u + 10; x < u + w - 14; x += 16) wRect(sd, x, (v0 + v1) / 2 - 4, x + 10, (v0 + v1) / 2 + 4, wr() < 0.35 ? c : wr() < 0.5 ? WG.warm : WG.deep, 0.8);
        if (wr() < 0.45) { const su = u + w / 2; wRect(sd, su - 20, v0 + 5, su + 20, v1 - 2, c, 0.8); wFx.neon.push({b: wSpr(glowTex, ...wpt(sd, su, (v0 + v1) / 2), c, 80), ph: wr() * 6.28, sp: 2 + wr() * 3}); }
        u += w;
      }
    },
    factory(sd, u0, u1) {                                     // заводская стена (игрок, 09.10.2026): броня, трубы, вентрешётки, ворота цехов; по верху — кран-балки с грузом
      for (let u = u0 + 10; u < u1 - 40; u += wR(60, 140)) wR(30, 60);                        // прежние решётки и трубы — только вызовы wr
      for (let u = u0 + wR(80, 200); u < u1 - 60; u += wR(260, 520)) { wR(12, 22); wSkip(3); }
      const fr = rngOf(seedOf('завод ' + sd.k + u0)), fR = (a, b) => a + fr() * (b - a);
      const vt = sd.t * WTOP, f0 = vt + 3, f1 = sd.t - 6;
      // фасад: плиты брони разной ширины, в каждой — своё: вентрешётка, трубы, ворота цеха, окна
      for (let u = u0; u < u1;) {
        const w = Math.min(u1 - u, fR(70, 190)), kind = fr();
        wRect(sd, u + 2, f0, u + w - 2, f1, fr() < 0.5 ? WG.mid : WG.base, 1);
        wLine(sd, [[u + w, f0], [u + w, f1]], LW, C.line, 0.8);
        if (kind < 0.3) {                                     // вентрешётка
          const a = u + w * 0.15, b = u + w * 0.85;
          wRect(sd, a - 3, f0 + 5, b + 3, f1 - 5, WG.dark, 1);
          for (let x = a; x < b; x += 7) wRect(sd, x, f0 + 8, x + 3.5, f1 - 8, WG.deep, 0.95);
        } else if (kind < 0.55) {                             // пучок труб с фланцами
          for (const [f, r] of [[0.3, 4], [0.55, 5.5], [0.8, 3.5]]) {
            const v = f0 + (f1 - f0) * f;
            wLine(sd, [[u + 4, v], [u + w - 4, v]], r * 2, WG.lit, 1); wLine(sd, [[u + 4, v - r * 0.4], [u + w - 4, v - r * 0.4]], 1.2, WG.hi, 0.8);
            for (let x = u + fR(10, 30); x < u + w - 8; x += fR(28, 46)) wRect(sd, x, v - r - 1.5, x + 4, v + r + 1.5, WG.deep, 0.9);
          }
        } else if (kind < 0.78) {                             // ворота цеха: ламели и жёлто-чёрная полоса у края
          const a = u + w * 0.2, b = u + w * 0.8;
          wP(sd, [[a, f0 + 4], [b, f0 + 4], [b, f1], [a, f1]], WG.deep);
          for (let v = f0 + 9; v < f1 - 6; v += 5) wLine(sd, [[a + 3, v], [b - 3, v]], 1.2, WG.base, 0.8);
          for (let x = a + 2; x < b - 6; x += 8) wF(sd, [[x, f1 - 6], [x + 4, f1 - 6], [x + 6.5, f1 - 1], [x + 2.5, f1 - 1]], ROBO, 0.9);
        } else {                                              // узкие окна-бойницы
          for (let x = u + 12; x < u + w - 14; x += fR(22, 40)) wRect(sd, x, (f0 + f1) / 2 - 2.5, x + 10, (f0 + f1) / 2 + 2.5, fr() < 0.25 ? WG.warm : WG.deep, 0.9);
        }
        u += w;
      }
      // верх стены: подкрановые пути, по концам — площадки со штабелями контейнеров
      wRect(sd, u0, 4, u1, vt - 4, WG.deep, 0.55);
      for (const v of [7, vt - 7]) { wLine(sd, [[u0, v], [u1, v]], 3, WG.hi, 0.75); wLine(sd, [[u0, v + 2], [u1, v + 2]], 1.2, C.line, 0.6); }
      const CARGO = [0xc9a46a, 0xb8c2c4, 0x8d9a7a, 0x9aa6a8];
      const pad = uc => {
        wP(sd, [[uc - 32, 6], [uc + 32, 6], [uc + 32, vt - 6], [uc - 32, vt - 6]], WG.mid);
        for (const s of [-1, 1]) {                                          // контейнеры по бокам площадки, середина — под крюк
          const x = uc + s * 22, y = vt / 2;
          wP(sd, [[x - 7, y - 8], [x + 7, y - 8], [x + 7, y + 8], [x - 7, y + 8]], CARGO[Math.floor(fr() * CARGO.length)]); wLine(sd, [[x, y - 8], [x, y + 8]], 1.2, C.line, 0.6);
        }
        for (const s of [-1, 1]) for (let i = 0; i < 3; i++) wF(sd, [[uc + s * 31 - s * i * 5, 7], [uc + s * 31 - s * (i * 5 + 2.5), 7], [uc + s * 31 - s * (i * 5 + 2.5), 10], [uc + s * 31 - s * i * 5, 10]], ROBO, 0.95);
      };
      // кран-балки: мост поперёк верха стены возит контейнер от площадки к площадке
      for (let k = 0, n = Math.max(1, Math.round((u1 - u0) / 650)); k < n; k++) {
        const a = u0 + (u1 - u0) * k / n + 40, b = u0 + (u1 - u0) * (k + 1) / n - 40;
        pad(a); pad(b);
        const c = wFrame(sd, a, 0);
        c.addChild(new PIXI.Graphics().rect(-12, 0, 24, 6).fill({color: WG.mid}).stroke({width: 1.4, color: C.line}).rect(-12, vt - 6, 24, 6).fill({color: WG.mid}).stroke({width: 1.4, color: C.line})
          .rect(-8, 1, 4, vt - 2).fill({color: WG.hi}).stroke({width: 1.4, color: C.line}).rect(4, 1, 4, vt - 2).fill({color: WG.hi}).stroke({width: 1.4, color: C.line}));   // две балки моста, тележки по концам
        const cg = new PIXI.Sprite(crateTex); cg.anchor.set(0.5); cg.width = 14; cg.height = 17;
        const tr = new PIXI.Graphics().rect(-10, -4, 20, 8).fill({color: ROBO}).stroke({width: 1.4, color: C.line}).rect(-3, -2.5, 6, 5).fill({color: WG.deep});
        c.addChild(cg, tr);
        wFx.crane.push({c, tr, cg, sd, a, b, vt, ph: fr(), per: fR(12, 18), cargo: CARGO});
      }
    },
    util(sd, u0, u1) {
      const v0 = sd.t * WTOP + 4, v1 = sd.t - 8;
      for (let u = u0; u < u1;) {                             // броня: плиты двух оттенков, бойницы
        const w = Math.min(u1 - u, wR(70, 180));
        wRect(sd, u + 2, v0, u + w - 2, v1, wr() < 0.5 ? WG.mid : WG.base, 1);
        wLine(sd, [[u + w, v0], [u + w, v1]], LW, C.line, 0.8);
        for (let x = u + 14; x < u + w - 16; x += wR(30, 60)) wRect(sd, x, (v0 + v1) / 2 - 2, x + 12, (v0 + v1) / 2 + 2, wr() < 0.2 ? WG.warm : WG.deep, 0.9);
        u += w;
      }
    },
    garden(sd, u0, u1) {
      const v0 = sd.t * WTOP + 4, v1 = sd.t - 6;
      for (let u = u0 + wR(0, 10); u < u1; u += wR(16, 30)) bush(sd, u, wR(v0 + 8, v1 - 4), wR(5, 9));          // кусты на террасах фасада
      for (let u = u0 + wR(10, 40); u < u1 - 10;) {                                                            // лианы и гирлянды за край
        if (wr() < 0.3) { const b = Math.min(u1, u + wR(40, 90)); festoon(sd, u, b, sd.t - 2, wR(10, 22)); u = b + wR(10, 40); }
        else { vine(sd, u, sd.t - 4, wR(18, 60)); u += wR(14, 40); }
      }
      for (let u = u0 + wR(0, 60); u < u1; u += wR(200, 420)) wLine(sd, [[u, sd.t * WTOP * 0.3], [Math.min(u1, u + wR(60, 140)), sd.t * WTOP * 0.3]], 5, WG.pool, 0.6);   // полив
    },
    water(sd, u0, u1) {
      const vt = sd.t * WTOP;
      wLine(sd, [[u0, vt * 0.5], [u1, vt * 0.5]], 10, WG.pool, 0.7);                 // канал на верху стены
      wLine(sd, [[u0, vt * 0.5], [u1, vt * 0.5]], 3, WG.foam, 0.6);
      for (let u = u0; u < u1; u += wR(12, 24)) wDot(sd, u, wR(vt + 8, sd.t - 8), wR(3, 6), 0x7fa7a3, 0.6);       // мокрый фасад
    },
    vines(sd, u0, u1) {
      const vt = sd.t * WTOP;
      for (let u = u0 + wR(0, 12); u < u1; u += wR(12, 24)) vine(sd, u, vt + 2, wR(sd.t - vt - 8, sd.t - vt + 45), {sway: 5, w0: 2.6, flower: 0.12});   // плющ по фасаду и за край
      for (let u = u0 + wR(20, 80); u < u1 - 60; u += wR(90, 200)) festoon(sd, u, u + wR(40, 80), sd.t - 3, wR(12, 26));
    },
    build(sd, u0, u1) {
      const v0 = sd.t * WTOP + 4, v1 = sd.t - 6;
      for (let u = u0; u < u1; u += wR(18, 30)) wLine(sd, [[u, v0], [u, v1]], TH, WG.hi, 0.7);   // строительные леса
      for (let v = v0; v <= v1; v += (v1 - v0) / 2) wLine(sd, [[u0, v], [u1, v]], TH, WG.hi, 0.6);
      for (let u = u0 + wR(20, 80); u < u1 - 40; u += wR(160, 320)) wRect(sd, u, v0 + 3, u + wR(30, 70), v1 - 3, WG.mid, 0.9);   // уже собранные панели
    },
  };
  // ---------- башни: форма + акцент района ----------
  // три семейства поровну (игрок, 09.10.2026): конусы (висячая v2 и исходные), угловатые/прямоугольные, экзотика
  const FAMILIES = [['hang', 'step', 'spire'], ['block', 'chamfer', 'twin', 'fin', 'fin'], ['hexstack', 'disc']];
  const FAMILY_W = [0, 0, 1, 1, 1, 2];                       // экзотика реже: зубчатые/угловатые игроку нравятся больше
  const wTowers = [];                                      // для отладки: __ship.towers
  function tower(sd, u, kit, anim = false) {
    // формы: hang (висячая v2) и плоские блоки + sci-fi: hexstack (шестигранные модули на хребте), ring (кольцо-станция
    // на стебле); арки-ворота игрок отверг. Остроконечные step/spire игрок убрал (09.10.2026, «конусы»).
    const t = sd.t, v0 = t - 3;
    let w = wR(100, 240), d = wR(140, 280);
    let shape = wPick(FAMILIES[wPick(FAMILY_W)]);           // арок и пустых колец нет (игрок)
    if (kit === 'night') { shape = 'club'; w = wR(190, 250); d = wR(170, 230); }   // у Ночного — свой клуб
    if (kit === 'util' || kit === 'build') { shape = wPick(['block', 'chamfer', 'watch', 'watch']); d = Math.min(d, 210); }   // трущобы, тюрьма, окраины — утилитарно
    if (anim) { shape = 'hexstack'; w = 250; d = 280; }        // башня с городской жизнью — крупная, окна во всех модулях
    const body = kit === 'night' ? WG.glass : WG.mid, shade = kit === 'night' ? 0x000000 : WG.dark, sa = kit === 'night' ? 0.35 : 0.5;
    const solid = (pts, fill = body) => { const p = pts.map(([a, b]) => [u + a, v0 + b]); wP(sd, p, fill); wF(sd, p.map(([a, b]) => [Math.max(a, u + w * 0.06), b]), shade, sa); };
    const hex = (cv, r) => { const p = []; for (let k = 0; k < 6; k++) { const g = Math.PI / 6 + k * Math.PI / 3; p.push([r * Math.cos(g), cv + r * Math.sin(g)]); } return p; };
    const arc = (cv, r0, r1, g0, g1, n = 18) => { const o = [], i = []; for (let k = 0; k <= n; k++) { const g = g0 + (g1 - g0) * k / n; o.push([r1 * Math.cos(g), cv + r1 * Math.sin(g)]); i.push([r0 * Math.cos(g), cv + r0 * Math.sin(g)]); } return [...o, ...i.reverse()]; };
    let tipV, panels = [[-w * 0.14, w * 0.14, d * 0.3, d * 0.58]], ribs = true, base = true;
    if (shape === 'hang') {                                   // висячая ступенчатая (v2): плечи, перехват, игла
      const a = wR(0.28, 0.38), b = wR(0.12, 0.2);
      const half = s => [[0, 0], [s * w / 2, 0], [s * w / 2, d * 0.3], [s * w * a, d * 0.42], [s * w * a, d * 0.62], [s * w * b, d * 0.74], [s * w * 0.06, d], [0, d + 10]];
      solid([...half(-1), ...half(1).reverse()]); tipV = v0 + d + 6;
      wRect(sd, u - w * 0.08, v0 + d * 0.46, u - w * 0.02, v0 + d * 0.6, WG.warm, 0.7); wLine(sd, [[u, v0 + d * 0.62], [u, v0 + d * 0.95]], TH, WG.hi, 0.6);
    } else if (shape === 'hexstack') {                        // шестигранные модули на общем хребте
      solid([[-w / 2, 0], [w / 2, 0], [w * 0.3, d * 0.12], [-w * 0.3, d * 0.12]]);
      solid([[-w * 0.05, d * 0.1], [w * 0.05, d * 0.1], [w * 0.05, d * 0.9], [-w * 0.05, d * 0.9]], WG.deep);
      const pods = [[0.3, 0.36], [0.58, 0.28], [0.82, 0.2]];
      for (const [f, rf] of pods) {
        const r = w * rf, cv = d * f; solid(hex(cv, r));
        solid(hex(cv, r * 0.55), kit === 'night' ? WG.glass : WG.lit);
        for (let k = 0; k < 6; k++) { const g = k * Math.PI / 3; wDot(sd, u + Math.cos(g) * r * 0.78, v0 + cv + Math.sin(g) * r * 0.78, 2.4, WG.white, 0.8); }
      }
      panels = pods.map(([f, rf]) => [-w * rf * 0.45, w * rf * 0.45, d * f - w * rf * 0.4, d * f + w * rf * 0.4]);
      if (!anim) panels = [panels[1]];
      tipV = v0 + d * 0.82 + w * 0.2; ribs = false;
    } else if (shape === 'step') {                            // ступенчатый конус (исходный)
      const a = wR(0.5, 0.7), b = wR(0.2, 0.35);
      solid([[-w / 2, 0], [w / 2, 0], [w / 2, d * 0.4], [w * a / 2, d * 0.45], [w * a / 2, d * 0.7], [w * b / 2, d * 0.75], [0, d], [-w * b / 2, d * 0.75], [-w * a / 2, d * 0.7], [-w * a / 2, d * 0.45], [-w / 2, d * 0.4]]);
      tipV = v0 + d; panels = [[-w * a * 0.35, w * a * 0.35, d * 0.46, d * 0.68]];
    } else if (shape === 'spire') {                           // шпиль (исходный)
      const a = wR(0.3, 0.5);
      solid([[-w / 2, 0], [w / 2, 0], [w * a / 2, d * 0.3], [w * a / 2, d * 0.65], [w * 0.08, d * 0.85], [0, d], [-w * 0.08, d * 0.85], [-w * a / 2, d * 0.65], [-w * a / 2, d * 0.3]]);
      tipV = v0 + d; panels = [[-w * a * 0.35, w * a * 0.35, d * 0.32, d * 0.62]];
    } else if (shape === 'block') {                           // прямоугольные ярусы-уступы
      const tiers = [[1, 0.42], [wR(0.6, 0.78), 0.3], [wR(0.32, 0.48), 0.28]];
      let v = 0, off = 0;
      for (const [fw, fd] of tiers) {
        const hw = w * fw / 2, dd = d * fd;
        solid([[off - hw, v], [off + hw, v], [off + hw, v + dd], [off - hw, v + dd]]);
        wLine(sd, [[u + off - hw + 4, v0 + v + dd - 4], [u + off + hw - 4, v0 + v + dd - 4]], TH, WG.hi, 0.6);
        v += dd; off += wR(-0.06, 0.06) * w;
      }
      tipV = v0 + d; ribs = false;
      panels = [[-w * 0.3, w * 0.3, d * 0.46, d * 0.68]];
    } else if (shape === 'round') { const o = [[-w / 2, 0], [w / 2, 0]]; const n = arcN(w / 2, Math.PI); for (let k = 0; k <= n; k++) { const g = Math.PI * k / n; o.push([w / 2 * Math.cos(g), d * 0.25 + d * 0.45 * Math.sin(g)]); } solid(o); tipV = v0 + d * 0.66; }
    else if (shape === 'chamfer') { const c = Math.min(d * 0.35, w * 0.3); solid([[-w / 2, 0], [w / 2, 0], [w * 0.38, d * 0.5], [w * 0.38, d - c], [w * 0.38 - c, d], [-w * 0.38 + c, d], [-w * 0.38, d - c], [-w * 0.38, d * 0.5]]); tipV = v0 + d * 0.85; }
    else if (shape === 'twin') { solid([[-w / 2, 0], [w / 2, 0], [w / 2, d * 0.45], [w * 0.36, d], [w * 0.16, d * 0.52], [-w * 0.16, d * 0.52], [-w * 0.36, d], [-w / 2, d * 0.45]]); tipV = v0 + d * 0.98; panels = [[-w * 0.14, w * 0.14, d * 0.12, d * 0.45]]; }
    else if (shape === 'disc') {                              // диск на стебле: кольца, огни по кругу
      solid([[-w / 2, 0], [w / 2, 0], [w * 0.14, d * 0.25], [w * 0.14, d * 0.55], [-w * 0.14, d * 0.55], [-w * 0.14, d * 0.25]]);
      const r = w * 0.42, cv = v0 + d * 0.72;
      wRing(sd, u, cv, r, body); wDot(sd, u + r * 0.12, cv + r * 0.12, r * 0.8, WG.dark, 0.45); wRing(sd, u, cv, r * 0.58, WG.lit);
      for (let k = 0; k < 10; k++) { const g = k / 10 * Math.PI * 2; wDot(sd, u + Math.cos(g) * r * 0.8, cv + Math.sin(g) * r * 0.8, 2.6, WG.white, 0.8); }
      tipV = cv; panels = [[-w * 0.12, w * 0.12, d * 0.24, d * 0.52]];
    } else if (shape === 'fin') {                             // зубчатая: невысокая (≤ ~150), тупые зубцы со срезом, средний чуть длиннее
      const f = Math.max(2, Math.min(4, Math.floor(w / 55))), cw = w / f, mid = (f - 1) / 2, D = Math.min(d, 150), o = [[-w / 2, 0]], tips = [];   // зубец не уже 55
      for (let i = 0; i < f; i++) {
        const a = -w / 2 + i * cw, depth = D * (0.72 + 0.28 * (1 - Math.abs(i - mid) / Math.max(1, mid)));
        o.push([a + cw * 0.1, depth * 0.62], [a + cw * 0.3, depth], [a + cw * 0.7, depth], [a + cw * 0.9, depth * 0.62]);   // срезанный конец
        if (i < f - 1) o.push([a + cw, depth * 0.5]);                                 // неглубокая выемка
        tips.push([a + cw * 0.5, depth]);
      }
      o.push([w / 2, 0]); solid(o);
      wRect(sd, u - w * 0.44, v0 + D * 0.12, u + w * 0.44, v0 + D * 0.3, WG.deep, 0.85);  // полоса окон у основания
      for (let x = u - w * 0.4; x < u + w * 0.4; x += 11) wRect(sd, x, v0 + D * 0.16, x + 6, v0 + D * 0.26, wr() < 0.5 ? WG.warm : WG.deep, 0.85);
      for (const [a, b] of tips) { wLine(sd, [[u + a, v0 + D * 0.34], [u + a, v0 + b - 6]], TH, WG.hi, 0.55); wDot(sd, u + a, v0 + b - 8, 2.6, WG.warm, 0.9); }
      const c = tips[Math.floor(f / 2)];
      tipV = v0 + c[1]; ribs = false; panels = [];
    } else if (shape === 'watch') {                           // утилитарная вышка: ствол, площадка, будка
      const sw = w * 0.16, ph = d * 0.62;
      solid([[-w * 0.36, 0], [w * 0.36, 0], [sw, d * 0.16], [-sw, d * 0.16]]);
      solid([[-sw, d * 0.14], [sw, d * 0.14], [sw, ph], [-sw, ph]]);
      for (let v = d * 0.2; v < ph - 10; v += 22) { wLine(sd, [[u - sw, v0 + v], [u + sw, v0 + v + 18]], TH, C.line, 0.5); wLine(sd, [[u + sw, v0 + v], [u - sw, v0 + v + 18]], TH, C.line, 0.5); }
      solid([[-w * 0.34, ph], [w * 0.34, ph], [w * 0.3, ph + d * 0.18], [-w * 0.3, ph + d * 0.18]], WG.base);
      for (let x = u - w * 0.26; x < u + w * 0.26; x += 14) wRect(sd, x, v0 + ph + d * 0.06, x + 8, v0 + ph + d * 0.11, wr() < 0.4 ? WG.warm : WG.deep, 0.85);
      tipV = v0 + ph + d * 0.18; ribs = false; base = false; panels = [];
    } else if (shape === 'club') {                            // клуб Ночного района: стекло, неон, голо-экран, прожекторы
      const c1 = wPick(NEON), c2 = NEON[(NEON.indexOf(c1) + 1) % NEON.length];
      solid([[-w / 2, 0], [w / 2, 0], [w / 2, d * 0.5], [w * 0.32, d * 0.68], [w * 0.32, d * 0.92], [w * 0.12, d], [-w * 0.12, d], [-w * 0.32, d * 0.92], [-w * 0.32, d * 0.68], [-w / 2, d * 0.5]]);
      for (const [f, c] of [[0.14, c1], [0.24, c2], [0.34, c1]]) wLine(sd, [[u - w * 0.46, v0 + d * f], [u + w * 0.46, v0 + d * f]], 3, c, 0.85);   // неоновые ярусы
      for (let x = u - w * 0.42; x < u + w * 0.42; x += 14) wRect(sd, x, v0 + d * 0.39, x + 8, v0 + d * 0.45, wPick([c1, c2, WG.warm, WG.deep]), 0.85);
      wLine(sd, [[u - w / 2, v0 + d * 0.5], [u - w * 0.32, v0 + d * 0.68]], 3, c2, 0.8); wLine(sd, [[u + w / 2, v0 + d * 0.5], [u + w * 0.32, v0 + d * 0.68]], 3, c2, 0.8);
      // голо-экран: переливается цветами
      const [bx, by] = wpt(sd, u, v0 + d * 0.8), scr = new PIXI.Sprite(PIXI.Texture.WHITE);
      wRect(sd, u - w * 0.26, v0 + d * 0.7, u + w * 0.26, v0 + d * 0.9, 0x0b0d12, 0.95);
      scr.anchor.set(0.5); scr.position.set(bx, by); scr.width = w * 0.48; scr.height = d * 0.17; scr.blendMode = 'add'; fxc.addChild(scr);
      const halo = wSpr(glowTex, bx, by, c1, w * 0.9);
      wFx.screen.push({scr, halo, ph: wr() * 6.28});
      wSkip(2);                                              // прожекторы танцпола убраны (игрок)
      tipV = v0 + d; ribs = false; base = false; panels = [];
    } else { const f = wRI(2, 4), o = [[-w / 2, 0]]; for (let i = 0; i < f; i++) { const a = -w / 2 + i * w / f; o.push([a + w / f * 0.15, d * wR(0.6, 1)], [a + w / f * 0.85, d * wR(0.6, 1)]); } o.push([w / 2, 0]); solid(o); tipV = v0 + d * 0.55; panels = [[-w * 0.14, w * 0.14, d * 0.12, d * 0.45]]; }
    if (ribs) for (let k = 1; k <= 3; k++) wLine(sd, [[u - w * 0.26, v0 + d * 0.1 * k], [u + w * 0.26, v0 + d * 0.1 * k]], TH, C.line, 0.55);
    if (base) for (let x = u - w * 0.3; x <= u + w * 0.3; x += 16) wDot(sd, x, v0 + d * 0.05, 2.6, WG.white, 0.7);     // огни-сигналы
    // акцент района — в «панелях» формы
    for (const [pa, pb, pc, pe] of panels) {
      if (kit === 'hab') {
        for (let v = v0 + pc + 4; v < v0 + pe - 6; v += d * 0.07) for (let x = u + pa + 3; x < u + pb - 6; x += 12) {
          if (anim) {                                          // городская жизнь: окна загораются и гаснут
            const s = new PIXI.Sprite(PIXI.Texture.WHITE), [cx, cy] = wpt(sd, x + 3.5, v + 2.5);
            s.anchor.set(0.5); s.position.set(cx, cy); s.width = 7; s.height = 5; s.tint = WG.warm; fxc.addChild(s);
            wRect(sd, x, v, x + 7, v + 5, WG.deep, 0.8);
            wFx.win.push({s, ph: wr() * 6.28, sp: 0.05 + wr() * 0.25, warm: wr() < 0.8});
          } else wRect(sd, x, v, x + 7, v + 5, wr() < 0.55 ? WG.warm : WG.deep, 0.8);
        }
      } else if (kit === 'night') {                           // неоновые полосы внутри тёмного стекла
        const c = wPick(NEON), m = (pa + pb) / 2, hw = (pb - pa) / 2;
        for (const f of [-0.6, 0, 0.6]) wLine(sd, [[u + m + hw * f, v0 + pc], [u + m + hw * f, v0 + pe]], 3, c, 0.85);
        wRect(sd, u + pa, v0 + pc + (pe - pc) * 0.3, u + pb, v0 + pc + (pe - pc) * 0.42, c, 0.7);
        wFx.neon.push({b: wSpr(glowTex, ...wpt(sd, u + m, v0 + (pc + pe) / 2), c, 100), ph: wr() * 6.28, sp: 1.5 + wr() * 2});
      }
    }
    if (anim) for (let i = 0; i < 2; i++) {                    // аэрокары кружат вокруг башни
      const car = new PIXI.Sprite(PIXI.Texture.WHITE); car.anchor.set(0.5); car.tint = WG.white; car.width = 12; car.height = 6; fxc.addChild(car);
      const g = wSpr(glowTex, 0, 0, i ? 0xff5a4a : WG.warm, 34);
      wFx.drone.push({car, g, sd, u, v: v0 + d * 0.45, ru: w * 0.75 + 30, rv: d * 0.5 + 20, sp: (0.25 + wr() * 0.15) * (i ? -1 : 1), ph: wr() * 6.28});
    }
    if (kit === 'factory') { const r = Math.min(24, w * 0.12), cv = v0 + d * 0.3; wRing(sd, u, cv, r + 6, WG.base); wDot(sd, u, cv, r, 0x1a1210); flameAt(sd, u, cv); }
    else if (kit === 'util') {                                // турель и прожектор — только у вышки (игрок: светящиеся фонари убрать везде, кроме неё)
      const ph = wr() * 6.28;
      if (shape === 'watch') {
        const cv = Math.min(tipV - 10, v0 + d * 0.5);
        wRing(sd, u, cv, 16, WG.base);
        const [x, y] = wpt(sd, u, cv), b = new PIXI.Sprite(beamTex);
        b.anchor.set(0, 0.5); b.position.set(x, y); b.tint = 0xfff0c8; b.blendMode = 'add'; b.alpha = 0.32; b.width = 420; b.height = 180; fxc.addChild(b);
        wFx.beam.push({b, base: Math.atan2(sd.v[1], sd.v[0]), ph});
      }
    }
    else if (kit === 'garden') { for (let x = u - w * 0.32; x < u + w * 0.32; x += 14) bush(sd, x, v0 + wR(d * 0.08, d * 0.35), wR(5, 8)); for (let x = u - w * 0.3; x < u + w * 0.3; x += wR(20, 34)) vine(sd, x, v0 + d * 0.4, wR(20, 50)); }
    else if (kit === 'vines') { for (let x = u - w * 0.36; x < u + w * 0.36; x += wR(10, 18)) vine(sd, x, v0, wR(d * 0.3, d * 0.75), {sway: 5, w0: 2.6, flower: 0.15}); }
    else if (kit === 'build') { wLine(sd, [[u, v0 + d * 0.2], [u, tipV + 40]], 4, WG.deep); wLine(sd, [[u - 30, tipV + 40], [u + wR(60, 120), tipV + 40]], 3, WG.deep); }
    blinkAt(sd, u, tipV, kit === 'night' ? wPick(NEON) : 0xff5a4a, 50);
    const [tx, ty] = wpt(sd, u, v0 + d / 2); wTowers.push({side: sd.k, u: Math.round(u), kit, shape, x: Math.round(tx), y: Math.round(ty)});
  }
  // ---------- особые места ----------
  // постройка (полуширина hw, вглубь d от грани) задевает арт здания?
  const artHit = (sd, u, hw, d) => {
    const [ax, ay] = wpt(sd, u - hw, sd.t), [bx, by] = wpt(sd, u + hw, sd.t + d);
    const x0 = Math.min(ax, bx) - 20, x1 = Math.max(ax, bx) + 20, y0 = Math.min(ay, by) - 20, y1 = Math.max(ay, by) + 20;
    return blds.some(b => b.art && b.art.x0 < x1 && b.art.x1 > x0 && b.art.y0 < y1 && b.art.y1 > y0);
  };
  // жилой модуль у центра: невысокие ярусы (вглубь ~130), ряды окон, балконы, огни на крыше
  function habModule(sd, u) {
    const v0 = sd.t - 3, w = 340, tiers = [[w, 52], [w * 0.78, 44], [w * 0.5, 34]];
    let v = v0, off = 0;
    for (const [tw, th] of tiers) {
      const a = u + off - tw / 2, b = u + off + tw / 2;
      wP(sd, [[a, v], [b, v], [b - 6, v + th], [a + 6, v + th]], WG.mid);
      wF(sd, [[u + off + tw * 0.18, v], [b, v], [b - 6, v + th], [u + off + tw * 0.18, v + th]], WG.dark, 0.5);
      for (let r = 0; r < 2; r++) for (let x = a + 12; x < b - 14; x += 13) wRect(sd, x, v + 8 + r * (th - 16) / 2, x + 8, v + 13 + r * (th - 16) / 2, wr() < 0.6 ? WG.warm : WG.deep, 0.85);
      wLine(sd, [[a - 4, v + th], [b + 4, v + th]], 3, WG.hi, 0.8);              // балкон-терраса
      v += th; off += wR(-14, 14);
    }
    for (let x = u - w * 0.2; x <= u + w * 0.2; x += 20) wDot(sd, x, v - 6, 2.8, WG.white, 0.8);
    blinkAt(sd, u - w * 0.22, v - 2); blinkAt(sd, u + w * 0.22, v - 2);
  }
  // парящий сад у ферм: платформа-полукруг (вглубь ~140), ярусы грядок, купол-оранжерея, свисающая зелень
  function gardenDeck(sd, u, scale = 1) {
    const v0 = sd.t - 3, w = 380 * scale, d = 140 * scale, deck = [[-w / 2, 0], [w / 2, 0], [w / 2, d * 0.35]];
    const dn = arcN(w / 2, Math.PI);
    for (let k = 0; k <= dn; k++) { const g = Math.PI * k / dn; deck.push([w / 2 * Math.cos(g), d * 0.35 + d * 0.65 * Math.sin(g)]); }
    deck.push([-w / 2, d * 0.35]);
    wP(sd, deck.map(([a, b]) => [u + a, v0 + b]), WG.mid);
    wF(sd, deck.map(([a, b]) => [u + Math.max(a, w * 0.1), v0 + b]), WG.dark, 0.45);
    for (let r = 0; r < 3; r++) {                            // ярусы грядок: полосы зелени по дуге
      const rr = 0.85 - r * 0.25;
      for (let k = 1; k < 20; k++) {
        const g = Math.PI * k / 20, a = w / 2 * rr * Math.cos(g), b = d * 0.3 + d * 0.62 * rr * Math.sin(g);
        bush(sd, u + a, v0 + b, wR(5, 8) * scale);
      }
      if (r < 2) { const pts = []; for (let k = 0; k <= dn; k++) { const g = Math.PI * k / dn; pts.push([u + w / 2 * (rr - 0.12) * Math.cos(g), v0 + d * 0.3 + d * 0.62 * (rr - 0.12) * Math.sin(g)]); } wLine(sd, pts, 3, WG.pool, 0.55); }   // полив
    }
    // оранжерея: сводчатая стеклянная теплица (сверху — прямоугольник со сводом): растения внутри, рёбра, конёк, блик
    const gw = w * 0.46, gd = d * 0.32, gu = u, gv = v0 + d * 0.3, rr = gd / 2, cu0 = gu - gw / 2 + rr, cu1 = gu + gw / 2 - rr, cv = gv + rr;
    const caps = [];
    const cn = arcN(rr, Math.PI);                             // свод оранжереи — гранями
    for (let k = 0; k <= cn; k++) { const g = -Math.PI / 2 + Math.PI * k / cn; caps.push([cu1 + Math.cos(g) * rr, cv + Math.sin(g) * rr]); }
    for (let k = 0; k <= cn; k++) { const g = Math.PI / 2 + Math.PI * k / cn; caps.push([cu0 + Math.cos(g) * rr, cv + Math.sin(g) * rr]); }
    wF(sd, caps, 0x1f2a1c, 0.55);                                                                                      // почва под стеклом
    for (let x = cu0 - rr * 0.5; x < cu1 + rr * 0.5; x += 9) for (const f of [-0.45, 0, 0.45]) wDot(sd, x + wR(-2, 2), cv + rr * f, wR(3, 5.5), wPick(LEAF), 0.9);   // ряды растений
    wF(sd, caps, 0xd8f2c8, 0.2);
    wF(sd, caps.map(([a, b]) => [a, Math.min(b, cv - rr * 0.35)]), 0xffffff, 0.18);                                // блик на своде
    for (let x = cu0; x <= cu1 + 0.1; x += (cu1 - cu0) / 6) wLine(sd, [[x, gv + 1], [x, gv + gd - 1]], 1.6, WG.hi, 0.85);   // рёбра
    wLine(sd, [[cu0 - rr * 0.7, cv], [cu1 + rr * 0.7, cv]], 2, WG.hi, 0.9);                                       // конёк
    gfx.poly(wpoly(sd, caps), true).stroke({width: 2.5, color: WG.hi, alpha: 0.95, join: 'miter', miterLimit: 3});
    wSkip(2);                                                 // фонари у оранжереи убраны (игрок)
    for (let k = 2; k < 15; k += 2) {                         // зелень свисает с края платформы
      const g = Math.PI * k / 16, a = w / 2 * Math.cos(g), b = d * 0.35 + d * 0.65 * Math.sin(g);
      vine(sd, u + a, v0 + b - 4, wR(18, 50) * scale, {flower: 0.4});
    }
    for (const s of [-1, 1]) wDot(sd, u + s * w * 0.42, v0 + d * 0.2, 4, WG.warm, 0.9);
  }
  // большой водопад аквакультуры: бассейн на стене, водослив, поток, чаша с пеной, каналы с малыми водопадами
  function bigFall(sd, u) {
    const t = sd.t, v0 = t - 3, bw = 380, bd = 120, fw = 70, fl = 230;
    const basin = [[-bw / 2, 0], [bw / 2, 0], [bw / 2, bd * 0.45]];
    const bn = arcN(bw / 2, Math.PI);
    for (let k = 0; k <= bn; k++) { const g = Math.PI * k / bn; basin.push([bw / 2 * Math.cos(g), bd * 0.45 + bd * 0.55 * Math.sin(g)]); }
    basin.push([-bw / 2, bd * 0.45]);
    wP(sd, basin.map(([a, b]) => [u + a, v0 + b]), WG.mid);
    const water = []; for (let k = 0; k <= bn; k++) { const g = Math.PI * k / bn; water.push([u + (bw / 2 - 22) * Math.cos(g), v0 + bd * 0.4 + (bd * 0.5) * Math.sin(g)]); }
    wF(sd, [[u - bw / 2 + 22, v0 + 14], [u + bw / 2 - 22, v0 + 14], ...water], WG.pool, 0.9);
    for (let k = 1; k <= 3; k++) wLine(sd, [[u - bw * 0.3, v0 + bd * 0.2 * k + 10], [u + bw * 0.3, v0 + bd * 0.2 * k + 10]], 2, WG.foam, 0.35);
    wRect(sd, u - fw / 2 - 8, v0 + bd - 8, u + fw / 2 + 8, v0 + bd + 4, WG.lit, 1);           // водослив
    // поток в район
    const f0 = v0 + bd + 2, f1 = f0 + fl;
    wF(sd, [[u - fw / 2, f0], [u + fw / 2, f0], [u + fw * 0.7, f1], [u - fw * 0.7, f1]], WG.water, 0.4);
    wF(sd, [[u - fw * 0.3, f0], [u + fw * 0.3, f0], [u + fw * 0.4, f1], [u - fw * 0.4, f1]], WG.foam, 0.35);
    dropsAt(sd, u, fw, f0, f1, 14, 24);
    // внизу — разлив веером в район (вода уходит в каналы аквакультуры), пена и расходящиеся круги
    for (let k = 0; k < 22; k++) {                          // мягкое пятно: вода растекается по району
      const q = wr(), du = wR(-1, 1) * fw * (0.6 + 1.6 * q), dv = q * 110 - 8;
      wDot(sd, u + du, f1 + dv, wR(18, 40) * (1 - q * 0.4), WG.pool, 0.1 + (1 - q) * 0.14);
    }
    for (let k = 0; k < 9; k++) wDot(sd, u + wR(-fw * 0.8, fw * 0.8), f1 + wR(-12, 14), wR(5, 12), WG.foam, 0.55);
    dropsAt(sd, u, fw * 2.2, f1 + 4, f1 + 105, 8, 14);
    for (let i = 0; i < 3; i++) { const r = wSpr(ringTex, ...wpt(sd, u, f1 + 6), WG.foam, 60, 'normal'); wFx.ripple.push({r, ph: i / 3}); }
    for (let i = 0; i < 3; i++) wFx.smoke.push({b: wSpr(glowTex, 0, 0, 0xe6fffb, 60, 'normal'), sd, u: u + wR(-30, 30), v: f1, ph: i / 3, mist: true});
    // каналы вдоль стены в обе стороны и малые водопады на концах
    for (const s of [-1, 1]) {
      const a = u + s * bw / 2, b = Math.max(300, u + s * (bw / 2 + wR(220, 320)));
      wLine(sd, [[a, t - 14], [b, t - 14]], 10, WG.pool, 0.8); wLine(sd, [[a, t - 14], [b, t - 14]], 3, WG.foam, 0.6);
      fallAt(sd, b, wR(70, 110));
    }
    wSkip(4);                                                 // мигалки у бассейна убраны (игрок)
  }
  // ---------- раскладка ----------
  WSIDES.forEach(sd => {
    const sh = new PIXI.Sprite(shadeTex);                  // тень от стены в город — 220 вглубь
    const [x, y] = wpt(sd, 0, sd.t);
    sh.position.set(x, y); sh.rotation = Math.atan2(sd.u[1], sd.u[0]); sh.width = sd.len; sh.height = 220;
    if (sd.k === 'bot' || sd.k === 'nose') sh.scale.y *= -1;
    wallShade.addChild(sh);
  });
  // участки стены по районам: [{u0, u1, kit}]
  function runs(sd) {
    const out = [];
    for (let u = 0; u < sd.len; u += 40) {
      const kit = WKIT[zoneNameAt(...wpt(sd, u + 20, sd.t + 25))] || 'util', last = out[out.length - 1];
      if (last && last.kit === kit) last.u1 = u + 40; else out.push({u0: u, u1: u + 40, kit});
    }
    return out;
  }
  let wallsDrawn = false;
  function drawWalls() {
    if (wallsDrawn) return;
    wallsDrawn = true;
    const special = [];
    let animDone = false;
    for (const sd of WSIDES) {
      gfx = wallG; fxc = wallFx;
      wallTop(sd);
      const rs = runs(sd);
      for (const r of rs) FACADE[r.kit](sd, Math.max(r.u0, 230), Math.min(r.u1, sd.len - 230));
      gfx = towerG; fxc = towerFx;
      const marks = [...WSKIP[sd.k]];
      if (sd.k === WLIFT.k) { habModule(sd, WLIFT.u); marks.push(WLIFT.u); }
      for (const r of rs) if (r.kit === 'garden' && r.u1 - r.u0 > 900) {               // парящий сад — посередине участка ферм
        let c = (Math.max(r.u0, 300) + Math.min(r.u1, sd.len - 300)) / 2;
        while ((artHit(sd, c, 200, 160) || WSKIP[sd.k].some(x => Math.abs(x - c) < 460)) && c > r.u0 + 400) c -= 120;   // не на арт и не на проём станции (сад остаётся на u 1010)
        if (WSKIP[sd.k].some(x => Math.abs(x - c) < 420)) continue;
        gardenDeck(sd, c, sd.k === 'top' || sd.k === 'bot' ? 1 : 0.8); marks.push(c);
      }
      const wet = sd.k === 'bot' && rs.find(r => r.kit === 'water');                  // большой водопад — один, внизу у аквакультуры
      if (wet) { const c = Math.max(560, (wet.u0 + Math.min(wet.u1, sd.len - 230)) / 2); bigFall(sd, c); marks.push(c); }
      const spots = [];
      for (let u = wR(380, 800); u < sd.len - 420; u += wR(750, 1600)) spots.push(u);
      for (const r of rs) {                                                           // у каждого участка района — хотя бы одна башня
        const a = Math.max(r.u0, 420), b = Math.min(r.u1, sd.len - 420);
        if (b - a > 500 && !spots.some(u => u >= a && u < b)) spots.push((a + b) / 2);
      }
      spots.sort((a, b) => a - b);
      const placed = [];
      for (const u0 of spots) {
        const run = rs.find(r => u0 >= r.u0 && u0 < r.u1) || {u0: 0, u1: sd.len, kit: 'util'}, kit = run.kit;
        if (kit === 'water') continue;                                                 // у аквакультуры вместо башен — водопад
        // место занято артом здания, особым местом или соседней башней — ищем рядом вдоль стены, в своём участке
        const ok = u => u > Math.max(run.u0, 400) && u < Math.min(run.u1, sd.len - 400) && !artHit(sd, u, 130, 300)
          && !marks.some(s => Math.abs(s - u) < 420) && !placed.some(s => Math.abs(s - u) < 520);
        const u = [0, 150, -150, 300, -300, 450, -450, 600, -600].map(o => u0 + o).find(ok);
        if (u === undefined) continue;
        placed.push(u);
        const anim = !animDone && kit === 'hab' && sd.k === 'bot';                   // одна башня с городской жизнью
        if (anim) animDone = true;
        tower(sd, u, kit, anim);
      }
    }
    gfx = wallG; fxc = wallFx;
    // консоли: держат пути маглева перед гранью стены — три минималистичные формы (игрок: «подпорки маглева»; балку с косынкой и тумбу отверг)
    const cr = rngOf(seedOf('консоли маглева'));             // свой генератор — раскладка башен не трогается
    for (const sd of WSIDES) for (let u = 520; u < sd.len - 400; u += 700) {
      const T = sd.t - 2, E = sd.t + 44, k = cr();
      if (k < 0.45) {                                         // трапеция: шов у стены, болты
        wP(sd, [[u - 30, T], [u + 30, T], [u + 18, E - 6], [u - 18, E - 6]], WG.mid);
        wF(sd, [[u, T], [u + 30, T], [u + 18, E - 6], [u, E - 6]], WG.dark, 0.85);
        wLine(sd, [[u - 27, T + 8], [u + 27, T + 8]], TH, C.line, 0.55);
        for (const x of [-14, 14]) wDot(sd, u + x, T + 18, 2, WG.hi, 0.8);
      } else if (k < 0.75) {                                  // ступенчатая: широкий ярус у стены, узкий к путям
        wP(sd, [[u - 32, T], [u + 32, T], [u + 32, T + 14], [u - 32, T + 14]], WG.mid);
        wF(sd, [[u, T], [u + 32, T], [u + 32, T + 14], [u, T + 14]], WG.dark, 0.85);
        wP(sd, [[u - 15, T + 14], [u + 15, T + 14], [u + 12, E - 6], [u - 12, E - 6]], WG.mid);
        wF(sd, [[u, T + 14], [u + 15, T + 14], [u + 12, E - 6], [u, E - 6]], WG.dark, 0.85);
        wLine(sd, [[u - 28, T + 11], [u + 28, T + 11]], TH, WG.hi, 0.6);
      } else {                                                // «ласточкин хвост»: узкая у стены, раскрывается к путям, ребро поперёк
        wP(sd, [[u - 12, T], [u + 12, T], [u + 24, E - 6], [u - 24, E - 6]], WG.mid);
        wF(sd, [[u, T], [u + 12, T], [u + 24, E - 6], [u, E - 6]], WG.dark, 0.85);
        wLine(sd, [[u - 17, T + 17], [u + 17, T + 17]], TH, WG.hi, 0.6);
        wRect(sd, u - 3, T + 4, u + 3, T + 13, WG.deep, 0.8);
      }
      // опорная плита под путями и замок пути
      wP(sd, [[u - 22, E - 7], [u + 22, E - 7], [u + 22, E + 1], [u - 22, E + 1]], WG.lit);
      wRect(sd, u - 6, E - 5, u + 6, E - 1, WG.deep, 0.9);
    }
    // угловые башни — 12 граней (по 12 секторам: спицы — в вершины), ступенями к центру, целиком внутри полости
    const g12 = (x, y, r) => ngon(x, y, r, r, 12);
    for (const [cx, cy] of [[WL.x0, WL.y0], [WL.x1, WL.y0], [WL.x0, WL.y1], [WL.x1, WL.y1]]) {
      const ix = cx === WL.x0 ? 1 : -1, iy = cy === WL.y0 ? 1 : -1, x = cx + ix * 124, y = cy + iy * 124;
      wallG.poly(g12(x, y, 122), true).fill({color: WG.base}).stroke({width: LW, color: C.line});
      wallG.poly(g12(x + ix * 12, y + iy * 12, 98), true).fill({color: WG.dark, alpha: 0.7});
      wallG.poly(g12(x, y, 83), true).fill({color: WG.mid}).stroke({width: LW, color: C.line});
      wallG.poly(g12(x - ix * 10, y - iy * 10, 57), true).fill({color: WG.lit, alpha: 0.35});
      wallG.poly(g12(x, y, 42), true).fill({color: WG.deep}).stroke({width: TH, color: C.line});
      for (let k = 0; k < 12; k++) { const a = (k + 0.5) / 12 * Math.PI * 2; wallG.poly([x + Math.cos(a) * 86, y + Math.sin(a) * 86, x + Math.cos(a) * 120, y + Math.sin(a) * 120], false).stroke({width: TH, color: C.line, alpha: 0.6}); }
      for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; wallG.poly(ngon(x + Math.cos(a) * 99, y + Math.sin(a) * 99, 3), true).fill({color: WG.white, alpha: 0.8}); }
      wallG.poly(ngon(x, y, 10), true).fill({color: WG.warm, alpha: 0.9});
    }
    drawNoseTrims();
  }
  // ---------- обводка районов носа (09.10.2026): мостик, модули, космопорт ----------
  // Как стена города, но тонкая (~22): тёмная внешняя кромка, лицевая полоса из плит разной длины, светлая внутренняя
  // кромка. Облик по лору («Районы Фенома» 1.1–1.3): мостик — пульты и индикаторы (рубка, ИИ), модули — ряды тёплых
  // окон и террасы (администрация, посольства, отели), космопорт — большие окна-стёкла и разметка ворот ангаров.
  // Край у носовой стены города (x = WL.x0) не обводится — там стена; между модулями и космопортом стены нет (игрок).
  const NOSE_KIT = {'Капитанский мостик': 'bridge', 'Район модулей': 'mod', 'Космопорт': 'port'};
  function drawNoseTrims() {
    const nr = rngOf(seedOf('нос: обводка районов')), nR = (a, b) => a + nr() * (b - a), W = 22;
    const AMBER = 0xffb84d, GL = 0xb9d7d4;
    for (const z of zones) {
      const kit = NOSE_KIT[z.name]; if (!kit) continue;
      let poly = z.poly.filter((q, i, a) => i === 0 || q[0] !== a[i - 1][0] || q[1] !== a[i - 1][1]);
      if (poly[0][0] === poly[poly.length - 1][0] && poly[0][1] === poly[poly.length - 1][1]) poly.pop();
      let inner = mgOffset(poly, W);
      if (!inside(...inner[0], poly)) { poly = poly.reverse(); inner = mgOffset(poly, W); }     // полоса — внутрь района
      const n = poly.length;
      for (let i = 0; i < n; i++) {
        const a = poly[i], b = poly[(i + 1) % n], qa = inner[i], qb = inner[(i + 1) % n];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (L < 1 || (a[0] >= WL.x0 - 1 && b[0] >= WL.x0 - 1)) continue;                          // край у стены города
        if ((kit === 'port' || kit === 'mod') && Math.abs(a[1] - 4870) < 1 && Math.abs(b[1] - 4870) < 1) continue;   // между модулями и космопортом стены нет (игрок)
        const ux = (b[0] - a[0]) / L, uy = (b[1] - a[1]) / L;
        let vx = -uy, vy = ux; const mx = (qa[0] + qb[0] - a[0] - b[0]) / 2, my = (qa[1] + qb[1] - a[1] - b[1]) / 2;
        if (mx * vx + my * vy < 0) { vx = -vx; vy = -vy; }
        const sd = {o: a, u: [ux, uy], v: [vx, vy]};                                               // оси отрезка: u — вдоль, v — внутрь
        const P = (f, k) => [a[0] + (b[0] - a[0]) * f + ((qa[0] - a[0]) * (1 - f) + (qb[0] - b[0]) * f) * k, a[1] + (b[1] - a[1]) * f + ((qa[1] - a[1]) * (1 - f) + (qb[1] - b[1]) * f) * k];
        wF(S0, [P(0, 0), P(1, 0), P(1, 1), P(0, 1)], WG.base);                                      // лицевая полоса
        wF(S0, [P(0, 0), P(1, 0), P(1, 5 / W), P(0, 5 / W)], WG.deep);                              // тёмная внешняя кромка
        for (let u = nR(0, 20); u < L;) {                     // плиты разной длины с деталями района
          const e = Math.min(L, u + nR(26, 70)), k = nr();
          if (e - u > 12 && u > 6 && e < L - 6) {
            if (kit === 'bridge') {
              if (k < 0.45) { wRect(sd, u + 3, 7, e - 3, 18, WG.deep, 0.9); for (let x = u + 6; x < e - 5; x += 6) wRect(sd, x, 11, x + 2.5, 13.5, nr() < 0.7 ? C.glow : AMBER, 0.85); }   // пульт с индикаторами
              else if (k < 0.7) for (let x = u + 5; x < e - 5; x += 7) wRect(sd, x, 8, x + 4, 17, WG.deep, 0.9);       // решётка
              else wRect(sd, u + 3, 8, e - 3, 17, WG.mid, 0.9);
            } else if (kit === 'mod') {
              if (k < 0.5) for (let x = u + 5; x < e - 6; x += 8) wRect(sd, x, 9, x + 5, 15, nr() < 0.6 ? WG.warm : 0x3a4148, 0.85);   // окна
              else if (k < 0.75) { wRect(sd, u + 3, 8, e - 3, 17, WG.mid, 0.9); wLine(sd, [[u + 4, 17], [e - 4, 17]], 2, WG.hi, 0.8); }   // терраса
              else for (let x = u + 5; x < e - 5; x += 7) wRect(sd, x, 8, x + 4, 17, WG.deep, 0.9);
            } else {
              if (k < 0.5) { wRect(sd, u + 3, 7, e - 3, 18, GL, 0.85); wLine(sd, [[u + 4, 9], [e - 4, 9]], 1.4, 0xffffff, 0.5); for (let x = u + 16; x < e - 6; x += 16) wLine(sd, [[x, 7], [x, 18]], 1.2, WG.mid, 0.9); }   // большие окна
              else if (k < 0.7) { wRect(sd, u + 3, 8, e - 3, 17, WG.deep, 0.95); for (let x = u + 4; x < e - 8; x += 8) wF(sd, [[x, 17], [x + 4, 17], [x + 7, 8], [x + 3, 8]], ROBO, 0.9); }   // ворота ангара
              else wRect(sd, u + 3, 8, e - 3, 17, WG.mid, 0.9);
            }
          }
          if (e < L - 1) wLine(sd, [[e, 5], [e, W]], 1.2, C.line, 0.55);                          // шов плиты
          u = e;
        }
        wLine(S0, [P(0, 1), P(1, 1)], 2.2, WG.lit, 0.9);                                             // светлая внутренняя кромка
        wLine(S0, [P(0, 0), P(1, 0)], LW, C.line, 0.9);                                              // контур
      }
    }
  }
  function animWalls(t) {
    for (const b of wFx.blink) b.b.alpha = Math.pow(Math.max(0, Math.sin(t * b.sp + b.ph)), 8) * 0.95;
    for (const l of wFx.lift) {                               // кабина: едет, стоит на концах
      const k = 0.5 + 0.5 * Math.sin(t * l.sp * 6.28 + l.ph), [x, y] = wpt(l.sd, l.u, l.v0 + (l.v1 - l.v0) * Math.min(1, Math.max(0, k * 1.2 - 0.1)));
      l.cab.position.set(x, y); l.cab.rotation = Math.atan2(l.sd.v[1], l.sd.v[0]) - Math.PI / 2;
    }
    for (const s of wFx.smoke) {                              // дым над трубой / водяная пыль у водопада (вид сверху)
      const k = (t * 0.15 + s.ph) % 1, [x, y] = wpt(s.sd, s.u + Math.sin(k * 5 + s.ph * 9) * 12, s.v + k * 30);
      s.b.position.set(x, y); s.b.width = s.b.height = 40 + k * 110; s.b.alpha = (s.mist ? 0.18 : 0.3) * Math.sin(k * Math.PI);
    }
    for (const f of wFx.flame) f.b.alpha = 0.55 + 0.3 * Math.sin(t * 9 + f.ph) * Math.sin(t * 3.7 + f.ph * 2);
    for (const n of wFx.neon) n.b.alpha = Math.sin(t * n.sp + n.ph) > -0.6 ? 0.7 : 0.15;
    for (const f of wFx.fall) {
      const k = (t * f.sp + f.ph) % 1, [px, py] = wpt(f.sd, f.u, f.v0 + (f.v1 - f.v0) * k);
      f.d.position.set(px, py); f.d.rotation = Math.atan2(f.sd.v[1], f.sd.v[0]) - Math.PI / 2; f.d.width = 4; f.d.height = f.len; f.d.alpha = 0.75 * Math.sin(k * Math.PI);
    }
    for (const r of wFx.ripple) { const k = (t * 0.35 + r.ph) % 1; r.r.width = r.r.height = 40 + k * 160; r.r.alpha = 0.6 * (1 - k); }
    for (const b of wFx.beam) b.b.rotation = b.base + Math.sin(t * (b.sp || 0.5) + b.ph) * (b.amp || 0.7);
    for (const sc of wFx.screen) {                          // голо-экран: цвет плавно идёт по неону, иногда мерцает
      const k = (t * 0.25 + sc.ph) % NEON.length, i = Math.floor(k), f = k - i, a = NEON[i], b = NEON[(i + 1) % NEON.length];
      const mix = (x, y) => Math.round(x + (y - x) * f), col = (mix(a >> 16, b >> 16) << 16) | (mix((a >> 8) & 255, (b >> 8) & 255) << 8) | mix(a & 255, b & 255);
      sc.scr.tint = col; sc.halo.tint = col; sc.scr.alpha = Math.sin(t * 13 + sc.ph) > 0.93 ? 0.25 : 0.75; sc.halo.alpha = 0.45;
    }
    for (const c of wFx.crane) {                            // цикл: взял груз → везёт → опустил → порожняком назад
      const cyc = t / c.per + c.ph, k = cyc % 1, sm = x => x * x * (3 - 2 * x);
      const e = k < 0.12 ? 0 : k < 0.45 ? sm((k - 0.12) / 0.33) : k < 0.6 ? 1 : k < 0.93 ? 1 - sm((k - 0.6) / 0.33) : 0;
      const hold = k < 0.12 || k > 0.45 && k < 0.6;           // на площадке тележка ходит поперёк — к штабелю и обратно
      c.c.position.set(...wpt(c.sd, c.a + (c.b - c.a) * e, 0));
      const ty = c.vt / 2 + (hold ? Math.sin((k < 0.12 ? k / 0.12 : (k - 0.45) / 0.15) * Math.PI) * (c.vt / 2 - 14) : 0);
      c.tr.y = ty; c.cg.y = ty;
      c.cg.visible = k < 0.52; c.cg.tint = c.cargo[Math.floor(cyc) % c.cargo.length];
    }
    for (const w of wFx.win) { const on = Math.sin(t * w.sp + w.ph) > -0.2; w.s.alpha = on ? 0.85 : 0; w.s.tint = w.warm ? WG.warm : WG.white; }
    for (const d of wFx.drone) {
      const g = t * d.sp + d.ph, [x, y] = wpt(d.sd, d.u + Math.cos(g) * d.ru, d.v + Math.sin(g) * d.rv), [x2, y2] = wpt(d.sd, d.u + Math.cos(g + 0.05 * Math.sign(d.sp)) * d.ru, d.v + Math.sin(g + 0.05 * Math.sign(d.sp)) * d.rv);
      d.car.position.set(x, y); d.car.rotation = Math.atan2(y2 - y, x2 - x); d.g.position.set(x, y); d.g.alpha = 0.6 + 0.3 * Math.sin(t * 6 + d.ph);
    }
  }
  // ---------- маглев (08.10.2026) ----------
  // По статье «Районы Фенома», 2.1, и решениям игрока (метро не рисуем). Сеть — замкнутые маршруты по
  // опорным точкам (прямые и диагонали 45°, углы скруглены); общие участки совпадают точь-в-точь, расхождение
  // на углу выглядит стрелкой-съездом. Поезд никогда не едет назад (кроме технического).
  //   A — кольцо по краям полости с уступами; Bi — встречное кольцо внутри него;
  //   C — от главной станции через Пригородную и Центральную башни, вниз через город на нижний путь;
  //   D — кольцо с петлёй через башню Ночного района.
  // Техническая линия — на самой обшивке сверху (над деталями корпуса), один жёлтый состав туда-обратно.
  // Станции редкие: главная — арт «Станция маглева» (стык ферм/мостика/модулей), у башен — площадки,
  // по краям — отсеки цвета обшивки ship.svg. Масштаб: единица ≈ 1,5 м, вагон 70 ед. (~100 м — крупнее
  // жизни в ~4 раза), издали вагон не мельче 7 px. Вид поездов — сверху (как карта районов), с тенью.
  const MG = {T: 2035, B: 5105, L: 5731, R: 14689, J: 90, gap: 26, r: 150, tech: 1898, carL: 70, carW: 14, carGap: 6};
  const mgC = new PIXI.Container(), mgG = new PIXI.Graphics(), mgTrains = new PIXI.Container(), mgTop = new PIXI.Graphics();
  mgC.addChild(mgG, mgTrains, mgTop);                                       // mgTop — переходы над путями (поезд идёт под ними)
  world.addChildAt(towerC, world.getChildIndex(wallC) + 1);                  // башни стен — под путями: маглев идёт на высоком уровне (игрок, 09.10.2026)
  const techC = new PIXI.Container(), techG = new PIXI.Graphics();               // на обшивке — поверх деталей корпуса
  techC.addChild(techG);
  world.addChildAt(techC, world.getChildIndex(fxC));        // detailG к этому времени заменён контейнером ship.svg — кладём под огни
  // главная станция лежит на полосе обшивки ship.svg — она и пути (въезд в неё) выше слоёв ship.svg;
  // кольца — на сцене поверх всего мира, их это не касается. Порядок: … ship.svg → станция → пути и поезда → тех. линия
  const stC = new PIXI.Container(), stG = new PIXI.Graphics(), stFx = new PIXI.Container(); stC.addChild(stG, stFx);   // stFx — живое: лифт, ленты, голо, дроны
  world.addChildAt(stC, world.getChildIndex(techC));
  world.addChildAt(mgC, world.getChildIndex(techC));                         // пути — поверх башен и станции
  // скругление углов ломаной: дуга радиуса r (не длиннее 45 % соседних отрезков)
  function mgFillet(w, closed, r) {
    const n = w.length, out = [], at = i => w[(i + n) % n];
    for (let i = 0; i < n; i++) {
      const p = at(i);
      if (!closed && (i === 0 || i === n - 1)) { out.push(p); continue; }
      const a = at(i - 1), b = at(i + 1);
      const lu = Math.hypot(p[0] - a[0], p[1] - a[1]), lv = Math.hypot(b[0] - p[0], b[1] - p[1]);
      const ex = (p[0] - a[0]) / lu, ey = (p[1] - a[1]) / lu, fx = (b[0] - p[0]) / lv, fy = (b[1] - p[1]) / lv;
      const th = Math.acos(Math.max(-1, Math.min(1, ex * fx + ey * fy))), sg = Math.sign(ex * fy - ey * fx);
      if (th < 1e-3) { out.push(p); continue; }
      const t = Math.min(r * Math.tan(th / 2), 0.45 * lu, 0.45 * lv), rr = t / Math.tan(th / 2);
      const p1 = [p[0] - ex * t, p[1] - ey * t], c = [p1[0] - ey * sg * rr, p1[1] + ex * sg * rr];
      const a0 = Math.atan2(p1[1] - c[1], p1[0] - c[0]), k = Math.max(3, Math.ceil(th / 0.12));
      for (let j = 0; j <= k; j++) { const g = a0 + sg * th * j / k; out.push([c[0] + rr * Math.cos(g), c[1] + rr * Math.sin(g)]); }
    }
    return out;
  }
  // параллель замкнутой ломаной (по часовой на экране — внутрь)
  function mgOffset(w, d) {
    const n = w.length, nr = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
    return w.map((p, i) => {
      const n1 = nr(w[(i - 1 + n) % n], p), n2 = nr(p, w[(i + 1) % n]), mx = n1[0] + n2[0], my = n1[1] + n2[1], ml = Math.hypot(mx, my);
      const k = d / ((mx / ml) * n1[0] + (my / ml) * n1[1]);
      return [p[0] + mx / ml * k, p[1] + my / ml * k];
    });
  }
  // путь: точки + длины с начала; at(s) — точка и угол; near(p) — длина до ближайшей точки пути и расстояние
  function mgPath(pts, closed) {
    if (closed) pts = [...pts, pts[0]];
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    const len = cum[cum.length - 1];
    const at = s => {
      s = closed ? ((s % len) + len) % len : Math.max(0, Math.min(len, s));
      let lo = 0, hi = cum.length - 1;
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= s) lo = m; else hi = m; }
      const [ax, ay] = pts[lo], [bx, by] = pts[hi], k = (s - cum[lo]) / ((cum[hi] - cum[lo]) || 1);
      return [ax + (bx - ax) * k, ay + (by - ay) * k, Math.atan2(by - ay, bx - ax)];
    };
    const near = ([x, y]) => {
      let best = [Infinity, 0];
      for (let i = 1; i < pts.length; i++) {
        const [ax, ay] = pts[i - 1], [bx, by] = pts[i], dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
        const t = L2 ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L2)) : 0, d = Math.hypot(x - ax - t * dx, y - ay - t * dy);
        if (d < best[0]) best = [d, cum[i - 1] + t * (cum[i] - cum[i - 1])];
      }
      return best;
    };
    return {pts, len, closed, at, near};
  }
  const {T, B, L, R, J} = MG;
  // главная станция (09.10.2026): у носовой стены между Капитанским мостиком и Районом модулей (на полосе обшивки
  // ship.svg) и краем Района ферм. Пути — лёгкий заезд без разворота: у носа кольцо уходит диагоналями на D внутрь,
  // через проём в стене проходит вдоль платформ (A — x = jx, Bi — на 26 правее) и возвращается. Разворотная петля
  // через весь зал (v48) игрок отверг — «слишком огромно».
  const SL = {jx: 5601, y0: 3250, y1: 3640};
  const stJog = [[L, SL.y1 + (L - SL.jx)], [SL.jx, SL.y1], [SL.jx, SL.y0], [L, SL.y0 - (L - SL.jx)]];
  const ringA = [...stJog, [L, T], [6600, T], [6600 + J, T + J], [7350, T + J], [7350 + J, T], [10500, T], [10500 + J, T + J],
    [11300, T + J], [11300 + J, T], [R, T], [R, B], [13400, B], [13400 - J, B - J], [12600, B - J], [12600 - J, B], [9300, B],
    [9300 - J, B - J], [8300, B - J], [8300 - J, B], [L, B]];
  const iTop = ringA.findIndex(p => p[0] === 11300 + J), iR = ringA.findIndex(p => p[0] === R && p[1] === T);
  const iBot = ringA.findIndex(p => p[0] === 9300 && p[1] === B);
  const routeC = [...ringA.slice(0, stJog.length + 4), [7600, 2345], [7600, 3000], [7850, 3250], [8500, 3250], [8670, 3080], [9930, 3080], [10090, 3240],
    [10400, 3240], [10700, 3540], [10700, 4880], [10400, B], ...ringA.slice(iBot)];
  const routeD = [...ringA.slice(0, iTop + 1), [11800, T], [12000, T + 200], [12000, 3100], [12200, 3300], [12330, 3300], [12530, 3100],
    [12530, T + 200], [12730, T], ...ringA.slice(iR)];
  const MP = {
    A: mgPath(mgFillet(ringA, true, MG.r), true), Bi: mgPath(mgFillet(mgOffset(ringA, MG.gap), true, MG.r - MG.gap), true),
    C: mgPath(mgFillet(routeC, true, MG.r), true), D: mgPath(mgFillet(routeD, true, MG.r), true),
  };
  // техническая линия (игрок, 09.10.2026): по обшивке вплотную к верху стены города; у носа — вниз вдоль носовой стены к
  // главной станции (тех. платформа у крыши станции); на корме — под задним кольцом и дальше, в тоннель-кожух, уходящий
  // в кормовой блок к двигателю (технические отсеки): поезд в нём скрывается
  // кромка кормового блока («крыла»), наклонная: x = 16132 + (y − 1675)·0.2036 (замер __ship.toWorld) — за ней всё скрыто
  // стоянка (игрок): повернута и прижата к станции — последний участок вдоль её верхней кромки (кромка — как в STN.yt)
  const TECH = {sx: 5582, wx: 5162, end: 16720, wing: y => 16132 + (y - 1675) * 0.2036, ty: x => 3246 + 0.0317 * (x - 4500) - 4 - 13};
  const techLine = mgPath(mgFillet([[TECH.wx, TECH.ty(TECH.wx)], [TECH.sx, TECH.ty(TECH.sx)], [TECH.sx, MG.tech], [TECH.end, MG.tech]], false, 80), false);
  // станции: kind — вид отсека; e — край, к которому прижат (top/bot/stern)
  const ST = [{x: SL.jx + 13, y: (SL.y0 + SL.y1) / 2, kind: 'main'},                          // главная: A и Bi — по разные стороны
    {x: 9000, y: T, kind: 'bay', e: 'top', v: 0}, {x: 13150, y: T, kind: 'bay', e: 'top', v: 1},
    {x: 7600, y: B, kind: 'bay', e: 'bot', v: 1}, {x: 10950, y: B, kind: 'bay', e: 'bot', v: 0}, {x: R, y: 3570, kind: 'bay', e: 'stern', v: 2},
    {x: 8191, y: 3250, kind: 'tower'}, {x: 10192, y: 3240, kind: 'tower'}, {x: 12263, y: 3300, kind: 'tower'}];
  const stopsOf = p => ST.map(st => p.near([st.x, st.y])).filter(([d]) => d < 45).map(([, s]) => s).sort((a, b) => a - b);
  // вагоны сверху: капсула с тенью; на «крыше» — продольная полоса и оборудование, снизу (камера чуть сбоку) —
  // светлая полоса окон. Голова/хвост — обтекатель с остеклением кабины. Текстура 128×32, кузов — y 9..23.
  const carTex = (o, nose) => canvasTex(128, 32, g => {
    const body = (dy) => {
      if (nose) cvPoly(g, [4, 9, 70, 9, 99, 10.2, 118, 12.9, 125, 16, 118, 19.1, 99, 21.8, 70, 23, 4, 23].map((v, i) => i % 2 ? v + dy : v));   // обтекатель гранями
      else cvPoly(g, cham(3, 9 + dy, 122, 14, 3.5));
    };
    g.fillStyle = 'rgba(0,0,0,0.38)'; body(5); g.fill();                              // тень — вниз-вбок
    const gr = g.createLinearGradient(0, 9, 0, 23); gr.addColorStop(0, o.hi); gr.addColorStop(0.55, o.body); gr.addColorStop(1, o.lo);
    g.fillStyle = gr; body(0); g.fill();
    g.save(); body(0); g.clip();
    g.fillStyle = o.win; g.fillRect(0, 19.5, 128, 2.2);                               // окна — бок, видный сверху-сбоку
    g.fillStyle = o.ridge; g.fillRect(6, 14.6, nose ? 66 : 116, 1.6);                // продольная полоса крыши
    g.fillStyle = o.gear; for (const x of nose ? [16, 40] : [14, 52, 90]) g.fillRect(x, 11.5, 14, 2.4);   // оборудование на крыше
    if (nose) { g.fillStyle = o.cab; cvPoly(g, ngon(100, 15.5, 13, 3.6, 8)); g.fill(); }     // остекление кабины
    g.restore();
    g.strokeStyle = 'rgba(8,12,16,0.85)'; g.lineWidth = 1.2; body(0); g.stroke();
  });
  const LOOK = {
    civ: {hi: '#ffffff', body: '#dfe7eb', lo: '#9eadb4', win: '#7fe3ff', ridge: '#8fa1a9', gear: '#b9c6cc', cab: '#1d3a48', glow: 0x9feeff},
    tech: {hi: '#ffe2a8', body: '#ffb84d', lo: '#b9741f', win: '#fff2c0', ridge: '#3a2a10', gear: '#6b4a1a', cab: '#2a1d0c', glow: 0xffc061},
  };
  const TEX = Object.fromEntries(Object.entries(LOOK).map(([k, o]) => [k, {car: carTex(o, false), nose: carTex(o, true), glow: o.glow}]));
  const mgList = [];
  const rnd = (a, b) => a + Math.random() * (b - a);
  function mgTrain(kind, path, dir, s, cars, o = {}) {
    const Tx = TEX[kind], sp = [], parent = o.parent || mgTrains;
    const glow = new PIXI.Sprite(glowTex); glow.anchor.set(0.5); glow.tint = Tx.glow; glow.blendMode = 'add'; parent.addChild(glow);
    for (let i = 0; i < cars; i++) {
      const end = i === 0 || i === cars - 1, c = new PIXI.Sprite(end ? Tx.nose : Tx.car);
      c.anchor.set(0.5, 0.5); c.__flip = end && i === cars - 1 && cars > 1; parent.addChild(c); sp.push(c);
    }
    const tr = {path, dir, s, v: 0, cars: sp, glow, stops: path.closed ? stopsOf(path) : [], vmax: o.vmax ?? 260, acc: o.acc ?? 90,
                dwell: o.wait0 ?? 0, wait: o.wait ?? [2.5, 4], shuttle: !path.closed};
    mgList.push(tr); return tr;
  }
  // s — середина состава. До следующей остановки по ходу; у открытого пути — пока хвост не упрётся в конец
  function mgAhead(tr, half) {
    const {path: p, dir, s} = tr;
    if (!p.closed) return dir > 0 ? p.len - half - s : s - half;
    let best = Infinity;
    for (const st of tr.stops) { const d = ((dir > 0 ? st - s : s - st) % p.len + p.len) % p.len; if (d > 1 && d < best) best = d; }
    return best;
  }
  // составы: по маршрутам, разнесены по длине; Bi — навстречу
  for (const [k, dir, n] of [['A', 1, 2], ['Bi', -1, 3], ['C', 1, 2], ['D', 1, 2]]) {
    const p = MP[k];
    for (let i = 0; i < n; i++) mgTrain('civ', p, dir, (i + 0.15 + Math.random() * 0.3) / n * p.len + (k === 'C' ? 900 : 0), 4, {wait0: rnd(0, 2)});
  }
  const techTr = mgTrain('tech', techLine, -1, techLine.len, 4, {vmax: 180, acc: 40, wait0: 4, wait: [12, 25], parent: techC});
  // поверх поезда: тех. платформа у станции. За кромкой кормового блока линия и поезд скрыты маской (игрок: «за крыло» —
  // поезд просто заезжает внутрь кормы; потом крыло станет прозрачным в слоёном режиме, там — техническая стоянка:
  // тогда маску снять/сдвинуть, путь до TECH.end уже есть). Тоннель-кожух со створками (v76–78) убран.
  const techTop = new PIXI.Graphics(); techC.addChild(techTop);
  for (const [k, g] of Object.entries({wallG, towerG, mgG, mgTop, techG, techTop, stG})) g.label = k;
  {
    const g = techTop, {sx, wx, ty} = TECH, yt = x => ty(x) + 13;   // yt — верхняя кромка станции
    // платформа между путём и крышей станции: плиты в такт кромке станции, жёлтая кромка у пути, люки в крышу, упор
    const x0 = wx + 4, x1 = sx - 90, P = (x, d) => [x, ty(x) + d];
    g.poly([...P(x0, 8), ...P(x1, 8), ...P(x1, 14), ...P(x0, 14)], true).fill({color: WG.mid}).stroke({width: 1.2, color: C.line});
    g.poly([...P(x0, 8), ...P(x1, 8), ...P(x1, 9.8), ...P(x0, 9.8)], true).fill({color: ROBO});
    for (let x = x0 + 30; x < x1 - 4; x += 34) g.poly([...P(x, 9.8), ...P(x + 1, 9.8), ...P(x + 1, 14), ...P(x, 14)], true).fill({color: C.line, alpha: 0.45});
    for (const x of [x0 + 80, x1 - 90]) g.poly([...P(x, 10.5), ...P(x + 12, 10.5), ...P(x + 12, 13.5), ...P(x, 13.5)], true).fill({color: WG.deep});   // люки в крышу станции
    g.poly([...P(wx - 4, -6), ...P(wx + 3, -6), ...P(wx + 3, 6), ...P(wx - 4, 6)], true).fill({color: ROBO}).stroke({width: 1.2, color: C.line});   // упор
  }
  const techMask = new PIXI.Graphics().poly([0, 0, TECH.wing(0), 0, TECH.wing(20000), 20000, 0, 20000], true).fill({color: 0xffffff});   // видно только до кромки крыла
  world.addChild(techMask); techC.mask = techMask;
  // станция у стены (09.10.2026): вокзал — часть стены (в её полосе), платформы по обе стороны пары путей,
  // крытые переходы от стены к дальней платформе — над путями. Оси стороны стены (WSIDES): u — вдоль, v — внутрь.
  // Пути: A — в 35 ед. от грани стены, Bi — в 61. v — вариант кровли: 0 — световой фонарь, 1 — два павильона, 2 — купола.
  const bayAt = st => { const sd = WSIDES.find(q => q.k === st.e); return [sd, st.e === 'stern' ? st.y - WL.y0 : st.x - WL.x0]; };
  const BAY = {S: 200, P: 165};                              // полудлина вокзала в стене и платформ
  function mgLobby(st) {                                      // рисуется один раз в слой стены (gfx = wallG)
    const [sd, u] = bayAt(st), t = sd.t, vt = t * WTOP, {S} = BAY;
    wP(sd, [[u - S, 2], [u + S, 2], [u + S, t + 3], [u - S, t + 3]], WG.base);                    // корпус вокзала на всю толщину стены
    wF(sd, [[u + S * 0.35, 2], [u + S, 2], [u + S, t + 3], [u + S * 0.35, t + 3]], WG.dark, 0.5);
    // зал: стеклянный фасад к городу, импосты, тёплые окна
    wP(sd, [[u - S + 18, vt + 6], [u + S - 18, vt + 6], [u + S - 18, t - 4], [u - S + 18, t - 4]], WG.glass);
    for (let x = u - S + 30; x < u + S - 24; x += 22) {
      wLine(sd, [[x, vt + 7], [x, t - 5]], TH, WG.mid, 0.8);
      wRect(sd, x + 4, vt + 12, x + 16, t - 10, wr2() < 0.6 ? WG.warm : 0x3a4148, 0.75);
    }
    wLine(sd, [[u - S + 18, t - 1], [u + S - 18, t - 1]], 3, WG.hi, 0.8);                        // козырёк над выходом на платформу
    // кровля (верх стены)
    if (st.v === 0) {                                         // длинный световой фонарь с рёбрами
      wP(sd, [[u - S + 30, vt * 0.25], [u + S - 30, vt * 0.25], [u + S - 30, vt * 0.8], [u - S + 30, vt * 0.8]], 0xb9d7d4);
      wF(sd, [[u - S + 30, vt * 0.25], [u + S - 30, vt * 0.25], [u + S - 30, vt * 0.42], [u - S + 30, vt * 0.42]], 0xffffff, 0.25);
      for (let x = u - S + 46; x < u + S - 34; x += 18) wLine(sd, [[x, vt * 0.25], [x, vt * 0.8]], TH, WG.mid, 0.9);
    } else if (st.v === 1) {                                  // два павильона со скатами
      for (const q of [-1, 1]) {
        const c = u + q * S * 0.48, hw = S * 0.32;
        wP(sd, [[c - hw, vt * 0.15], [c + hw, vt * 0.15], [c + hw, vt * 0.9], [c - hw, vt * 0.9]], WG.mid);
        wF(sd, [[c, vt * 0.15], [c + hw, vt * 0.15], [c + hw, vt * 0.9], [c, vt * 0.9]], WG.dark, 0.5);
        wLine(sd, [[c - hw + 4, vt * 0.52], [c + hw - 4, vt * 0.52]], 2.5, WG.hi, 0.8);            // конёк
      }
      wRect(sd, u - S * 0.14, vt * 0.3, u + S * 0.14, vt * 0.75, WG.deep, 0.9);
    } else {                                                  // ряд куполов (вид сверху — диски с бликом)
      for (let k = -3; k <= 3; k++) {
        const c = u + k * S * 0.26, r = vt * 0.36;
        wRing(sd, c, vt * 0.5, r, 0xb9d7d4); wDot(sd, c - r * 0.3, vt * 0.5 - r * 0.3, r * 0.35, 0xffffff, 0.35);
      }
    }
  }
  function mgPlatforms(st, lw) {                              // платформы и переходы: в слой маглева (перерисовка по приближению)
    const [sd, u] = bayAt(st), t = sd.t, {P} = BAY, g0 = gfx;
    gfx = mgG;
    for (const [v0, v1, edge] of [[t + 1, t + 24, t + 22], [t + 72, t + 96, t + 74]]) {          // ближняя (у стены) и дальняя (со стороны города)
      wP(sd, [[u - P, v0], [u + P, v0], [u + P, v1], [u - P, v1]], WG.lit);
      wF(sd, [[u + P * 0.4, v0], [u + P, v0], [u + P, v1], [u + P * 0.4, v1]], WG.dark, 0.25);
      wLine(sd, [[u - P + 4, edge], [u + P - 4, edge]], 2, WG.warm, 0.9);                         // кромка у пути
      const cv0 = edge < v1 - 4 ? edge + 3 : v0 + 2, cv1 = edge < v1 - 4 ? v1 - 2 : edge - 3;     // навес — со стороны от пути
      wP(sd, [[u - P + 12, cv0], [u + P - 12, cv0], [u + P - 12, cv1], [u - P + 12, cv1]], WG.mid);        // навес — одна кровля с рёбрами
      wF(sd, [[u + P * 0.4, cv0], [u + P - 12, cv0], [u + P - 12, cv1], [u + P * 0.4, cv1]], WG.dark, 0.4);
      for (let x = u - P + 26; x < u + P - 20; x += 16) wLine(sd, [[x, cv0 + 1], [x, cv1 - 1]], 1.2, C.line, 0.35);
    }
    for (const q of [-1, 1]) wP(sd, [[u + q * P, t + 72], [u + q * (P + 26), t + 78], [u + q * (P + 26), t + 92], [u + q * P, t + 96]], WG.base);   // лестницы-сходы с дальней платформы
    // крытые переходы: от вокзала над путями к дальней платформе
    gfx = mgTop;
    for (const q of st.v === 1 ? [-0.62, 0, 0.62] : [-0.5, 0.5]) {
      const c = u + q * P;
      wP(sd, [[c - 9, t - 2], [c + 9, t - 2], [c + 9, t + 76], [c - 9, t + 76]], WG.mid);
      wF(sd, [[c + 2, t - 2], [c + 9, t - 2], [c + 9, t + 76], [c + 2, t + 76]], WG.dark, 0.5);
      wRect(sd, c - 4, t + 2, c + 1, t + 72, 0xb9d7d4, 0.85);                                      // стеклянная крыша галереи
    }
    gfx = g0;
  }
  // ---------- главная станция маглева (09.10.2026, v50) ----------
  // Лор («Районы Фенома», 1.1–1.3): связь космопорта, административных модулей и мостика. Компактно, у носовой стены,
  // корпус повторяет полосу обшивки ship.svg (она сужается к стене — кромки замерены по картинке): клиновидный нос на
  // запад, кромки с плитами, под полупрозрачным стеклянным сводом — зал (эскалаторы, киоски, скамьи, люди, кадки);
  // у пути A — платформа под стеклянным навесом. Проём в стене — путь. На стороне ферм — платформа для Bi и
  // технический отсек (вентиляторы, трубы, кабели), немного зелени. Шахты, галереи и спуск техлинии (v48–49) убраны.
  const S0 = {o: [0, 0], u: [1, 0], v: [0, 1]};               // мировые оси для помощников стен
  const GLASS = 0xb9d7d4;
  // геометрия главной станции — общая для зала (stG) и навеса над путями (mgTop)
  const STN = {XW: 5150, XE: SL.jx - 9, pa: 3304, pb: 3586, bx: SL.jx + 39, bw: 52, wf: WL.x0 + 96,   // bw — ширина платформы Bi, wf — грань носовой стены
    yt: x => 3246 + 0.0317 * (x - 4500) - 4, yb: x => 3638 - 0.0127 * (x - 4500) - 6};   // кромки полосы обшивки (замер __ship.toScreen), верх — до самого края
  const mixC = (a, b, t) => { const m = (s) => Math.round(((a >> s) & 255) + (((b >> s) & 255) - ((a >> s) & 255)) * t); return (m(16) << 16) | (m(8) << 8) | m(0); };
  const rrect = (x0, y0, x1, y1, r) => { const o = []; for (const [cx, cy, a0] of [[x1 - r, y0 + r, -Math.PI / 2], [x1 - r, y1 - r, 0], [x0 + r, y1 - r, Math.PI / 2], [x0 + r, y0 + r, Math.PI]]) for (let k = 0; k <= 1; k++) { const g = a0 + Math.PI / 2 * k; o.push([cx + Math.cos(g) * r, cy + Math.sin(g) * r]); } return o; };
  const FRAME = 0xd9dcd6, RUST = 0xa9553c, AMBER = 0xffb84d;  // рамы-порталы, терракотовая полоса и табло — по арту-референсу
  // рама-портал: светлая, тонкий контур (жирный контур игроку читался «решёткой»), тень с одной стороны
  // ---- живое на станции и в вестибюле: кабина лифта, бегущие ступени и ленты, голо-экраны, уборочные дроны ----
  const SFX = {lift: [], bars: [], holo: [], drone: []};
  const sSpr = (w, h, tint, a = 1) => { const sp = new PIXI.Sprite(PIXI.Texture.WHITE); sp.anchor.set(0.5); sp.width = w; sp.height = h; sp.tint = tint; sp.alpha = a; stFx.addChild(sp); return sp; };
  const holo = (x, y, w, h, c1, c2) => { const sp = sSpr(w, h, c1, 0.7); sp.position.set(x, y); SFX.holo.push({s: sp, c1, c2, ph: wr2() * 6.28}); };   // голо-экран: цвет переливается, мерцает
  const beltBars = (x, y0, y1, dir, n, sp, w = 10, tint = 0xb8c2c4, a = 0.6) => { for (let i = 0; i < n; i++) SFX.bars.push({s: sSpr(w, 1.8, tint, 0), x, y0, y1, dir, sp, off: (y1 - y0) * i / n, a}); };
  function cleanDrone(pts) {                                    // уборочный дрон: квадратный корпус, жёлтая полоса, ездит по кругу
    const c = new PIXI.Container();
    c.addChild(new PIXI.Graphics().poly(cham(-5, -5, 10, 10, 2.5), true).fill({color: WG.lit}).stroke({width: 1, color: C.line}).rect(-5, -1, 10, 2).fill({color: ROBO}).rect(3, -3, 2, 6).fill({color: 0x1a1f22}));
    stFx.addChild(c);
    const cum = [0]; for (let i = 1; i <= pts.length; i++) { const a = pts[i - 1], b = pts[i % pts.length]; cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1])); }
    SFX.drone.push({c, pts, cum, len: cum[cum.length - 1], sp: 9, ph: wr2() * 100});
  }
  function animStation(t) {
    for (const L of SFX.lift) {                                 // лифт: стоит наверху, едет вниз, стоит, едет вверх
      const k = (t / L.per + L.ph) % 1, sm = x => x * x * (3 - 2 * x);
      const e = k < 0.15 ? 0 : k < 0.5 ? sm((k - 0.15) / 0.35) : k < 0.65 ? 1 : 1 - sm((k - 0.65) / 0.35);
      L.c.position.set(L.x, L.y0 + (L.y1 - L.y0) * e);
    }
    for (const b of SFX.bars) {                                 // ступени и ленты бегут; у концов гаснут
      const L = b.y1 - b.y0, d = (b.off + t * b.sp) % L;
      b.s.position.set(b.x, b.dir > 0 ? b.y0 + d : b.y1 - d); b.s.alpha = b.a * Math.min(1, d / 10, (L - d) / 10);
    }
    for (const h of SFX.holo) { h.s.tint = mixC(h.c1, h.c2, 0.5 + 0.5 * Math.sin(t * 0.8 + h.ph)); h.s.alpha = Math.sin(t * 11 + h.ph) > 0.96 ? 0.25 : 0.6 + 0.15 * Math.sin(t * 2.3 + h.ph); }
    for (const d of SFX.drone) {
      const s_ = (t * d.sp + d.ph) % d.len; let i = 1; while (d.cum[i] < s_) i++;
      const a = d.pts[i - 1], b = d.pts[i % d.pts.length], f = (s_ - d.cum[i - 1]) / ((d.cum[i] - d.cum[i - 1]) || 1);
      d.c.position.set(a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f); d.c.rotation = Math.atan2(b[1] - a[1], b[0] - a[0]);
    }
  }
  const holoPillar = (x, y, r, c1, c2) => {                    // голо-колонна: квадратное основание, голо-экран сверху
    wF(S0, [[x - r + 5, y - r + 6], [x + r + 5, y - r + 6], [x + r + 5, y + r + 6], [x - r + 5, y + r + 6]], 0x000000, 0.3);
    wP(S0, [[x - r, y - r], [x + r, y - r], [x + r, y + r], [x - r, y + r]], WG.mid);
    wP(S0, [[x - r * 0.6, y - r * 0.6], [x + r * 0.6, y - r * 0.6], [x + r * 0.6, y + r * 0.6], [x - r * 0.6, y + r * 0.6]], 0x1a1f22);
    holo(x, y, r * 1.1, r * 1.1, c1, c2);
  };
  const frameBar = (pts, shade) => { wF(S0, pts, FRAME, 0.93); gfx.poly(wpoly(S0, pts), true).stroke({width: 1.1, color: C.line, alpha: 0.5, join: 'miter', miterLimit: 3}); if (shade) wF(S0, shade, WG.dark, 0.28); };
  // пересечение вертикали x с многоугольником: [ymin, ymax]
  const spanAt = (pts, x) => {
    let lo = Infinity, hi = -Infinity;
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      if ((ax - x) * (bx - x) > 0 || ax === bx) continue;
      const y = ay + (by - ay) * (x - ax) / (bx - ax); lo = Math.min(lo, y); hi = Math.max(hi, y);
    }
    return [lo, hi];
  };
  // ---------- космопорт под станцией и район ангаров (09.10.2026) ----------
  // Игрок: космопорт с залом ожидания — компактная постройка прямо под станцией маглева (на краю Района модулей),
  // эскалаторы и лифты наверх в станцию, отделка — как у станции; выход на улицу сквозь носовую стену к стоянке
  // автобусов и атмосферных шаттлов. Бывший «Район космопорта» — Район ангаров: только ангары, космолёты, верфь
  // (лор 1.1: верфи ближе к носу, ангары ближе к городу, шлюз в нижней части носа). Людей нет (правило игрока).
  // Рисуется в stG (над ship.svg) до станции — станция ложится сверху. Арты «Ангары» и «Дипломатические корпуса» не перекрываются.
  function plateRim(body, w, pal = [WG.mid, WG.deep]) {       // кромка по периметру: плиты случайной длины со швами
    const rim = mgOffset(body, w);
    for (let i = 0, run = 0, dark = false, next = wR2(18, 46); i < body.length; i++) {
      const j = (i + 1) % body.length, L = Math.hypot(body[j][0] - body[i][0], body[j][1] - body[i][1]);
      for (let a = 0; a < L - 0.01;) {
        const b = Math.min(L, a + (next - run)), fa = a / L, fb = b / L;
        const P = (q, f) => [q[i][0] + (q[j][0] - q[i][0]) * f, q[i][1] + (q[j][1] - q[i][1]) * f];
        wF(S0, [P(body, fa), P(body, fb), P(rim, fb), P(rim, fa)], dark ? pal[1] : pal[0], 0.9);
        run += b - a; a = b;
        if (run >= next - 0.01) { wLine(S0, [P(body, fb), P(rim, fb)], 1.2, C.line, 0.5); dark = wr2() < 0.45; run = 0; next = wR2(18, 46); }
      }
    }
    gfx.poly(wpoly(S0, rim), true).stroke({width: 1.4, color: C.line, alpha: 0.6, join: 'miter', miterLimit: 3});
    return rim;
  }
  const blockAt = (x0, y0, x1, y1, fill, sh = 0.45) => {         // плита с контуром и тенью справа
    wP(S0, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], fill);
    if (sh) wF(S0, [[x0 + (x1 - x0) * 0.62, y0], [x1, y0], [x1, y1], [x0 + (x1 - x0) * 0.62, y1]], WG.dark, sh);
  };
  const arcBand = (cx, cy, r0, r1, a0, a1, n = 20) => {           // сектор кольца: изогнутая галерея
    const o = [], i = [];
    for (let k = 0; k <= n; k++) { const g = a0 + (a1 - a0) * k / n; o.push([cx + Math.cos(g) * r1, cy + Math.sin(g) * r1]); i.push([cx + Math.cos(g) * r0, cy + Math.sin(g) * r0]); }
    return [...o, ...i.reverse()];
  };
  // космолёт (вид сверху): нос по углу ang; s — масштаб; vtol — с гондолами (атмосферный шаттл)
  function craft(cx, cy, ang, sc = 1, vtol = false) {
    const c = Math.cos(ang), sn = Math.sin(ang), T = ([a, b]) => [cx + (a * c - b * sn) * sc, cy + (a * sn + b * c) * sc];
    const SH = pts => wF(S0, pts.map(([x, y]) => [x + 6 * sc, y + 8 * sc]), 0x000000, 0.35);
    const body = [[50, 0], [26, -9], [-34, -10], [-40, 0], [-34, 10], [26, 9]].map(T);
    const wing = q => (vtol ? [[10, q * 8], [-6, q * 26], [-22, q * 26], [-20, q * 9]] : [[4, q * 8], [-26, q * 36], [-36, q * 36], [-26, q * 9]]).map(T);
    for (const q of [-1, 1]) { SH(wing(q)); wP(S0, wing(q), 0xcfd6d9); }
    if (vtol) for (const q of [-1, 1]) { const g = [[-4, q * 22], [-24, q * 22], [-24, q * 32], [-4, q * 32]].map(T); SH(g); wP(S0, g, WG.mid); }   // гондолы двигателей
    SH(body); wP(S0, body, 0xdfe7eb);
    wP(S0, [[40, -3], [26, -5], [26, 5], [40, 3]].map(T), 0x1d3a48);
    for (const q of [-1, 1]) wP(S0, [[-36, q * 6 - 2.5], [-44, q * 6 - 2.5], [-44, q * 6 + 2.5], [-36, q * 6 + 2.5]].map(T), WG.deep);
    wLine(S0, [[-20, 0], [30, 0]].map(T), 1.4 * sc, ROBO, 0.9);
  }
  const octPad = (cx, cy, r) => {                              // посадочная площадка: восьмиугольник, шевроны, огни
    const c = r * 0.41, oct = [[cx - c, cy - r], [cx + c, cy - r], [cx + r, cy - c], [cx + r, cy + c], [cx + c, cy + r], [cx - c, cy + r], [cx - r, cy + c], [cx - r, cy - c]];
    wF(S0, oct.map(([x, y]) => [x + 12, y + 14]), 0x000000, 0.3);
    wP(S0, oct, WG.mid); wP(S0, oct.map(([x, y]) => [cx + (x - cx) * 0.84, cy + (y - cy) * 0.84]), 0x454d50);
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      const mx = cx + dx * r * 0.7, my = cy + dy * r * 0.7, tx = -dy, ty = dx;
      wLine(S0, [[mx + tx * 10 - dx * 4, my + ty * 10 - dy * 4], [mx + dx * 4, my + dy * 4], [mx - tx * 10 - dx * 4, my - ty * 10 - dy * 4]], 2.4, ROBO, 0.9);
    }
    for (const [x, y] of oct) wRect(S0, x + (cx - x) * 0.1 - 2.5, y + (cy - y) * 0.1 - 2.5, x + (cx - x) * 0.1 + 2.5, y + (cy - y) * 0.1 + 2.5, AMBER, 0.9);
  };
  function drawSpaceport() {
    const SH = (pts, dx = 12, dy = 14, a = 0.3) => wF(S0, pts.map(([x, y]) => [x + dx, y + dy]), 0x000000, a);
    // ================= район ангаров =================
    // верфь (у носа): сухой док с рельсами кранов, строящийся корабль — каркас из рёбер, часть обшивки; мостовые краны
    const D0 = 2580, D1 = 3480, DY0 = 4905, DY1 = 5190, dcy = (DY0 + DY1) / 2;
    SH([[D0, DY0], [D1, DY0], [D1, DY1], [D0, DY1]]);
    wP(S0, [[D0, DY0], [D1, DY0], [D1, DY1], [D0, DY1]], 0x30373a);
    for (const y of [DY0 + 9, DY1 - 9]) { wLine(S0, [[D0 + 6, y], [D1 - 6, y]], 4, WG.hi, 0.8); wLine(S0, [[D0 + 6, y + 2], [D1 - 6, y + 2]], 1.2, C.line, 0.6); }
    for (let x = D0 + 12; x < D1 - 30; x += 70) wRect(S0, x, DY0 - 30, x + 54, DY0 - 4, wr2() < 0.5 ? WG.mid : WG.base, 1);   // мастерские вдоль дока
    const hull = [[D0 + 60, dcy], [D0 + 190, dcy - 72], [D1 - 130, dcy - 84], [D1 - 70, dcy - 62], [D1 - 70, dcy + 62], [D1 - 130, dcy + 84], [D0 + 190, dcy + 72]];
    wF(S0, hull, 0x9aa6a8, 0.25);
    for (let x = D0 + 70; x < D1 - 80; x += 40) if (wr2() < 0.55) {                                     // уже обшитые секции
      const [a0, a1] = spanAt(hull, x + 1), [b0, b1] = spanAt(hull, x + 39);
      if (a1 > a0 && b1 > b0) wF(S0, [[x + 1, a0], [x + 39, b0], [x + 39, b1], [x + 1, a1]], 0xb8c2c4, 0.95);
    }
    for (let x = D0 + 80; x < D1 - 75; x += 20) { const [y0, y1] = spanAt(hull, x); if (y1 > y0) wLine(S0, [[x, y0], [x, y1]], 1.8, WG.hi, 0.85); }   // рёбра
    wLine(S0, [[D0 + 70, dcy], [D1 - 72, dcy]], 3, WG.mid, 0.95);                                       // киль
    gfx.poly(wpoly(S0, hull), true).stroke({width: 1.6, color: C.line, alpha: 0.85, join: 'miter', miterLimit: 3});
    for (const x of [D0 + 250, D0 + 520, D0 + 790]) {                                                    // мостовые краны поперёк дока
      wF(S0, [[x + 4, DY0 - 2], [x + 18, DY0 - 2], [x + 18, DY1 + 10], [x + 4, DY1 + 10]], 0x000000, 0.25);
      wP(S0, [[x - 6, DY0 - 4], [x + 6, DY0 - 4], [x + 6, DY1 + 4], [x - 6, DY1 + 4]], ROBO);
      for (let y = DY0 + 8; y < DY1 - 4; y += 14) wLine(S0, [[x - 5, y], [x + 5, y + 10]], 1.2, C.line, 0.45);
      const ty = DY0 + 40 + wr2() * (DY1 - DY0 - 80);
      wP(S0, [[x - 11, ty - 8], [x + 11, ty - 8], [x + 11, ty + 8], [x - 11, ty + 8]], WG.mid);
    }
    // шлюз в киле (нижний край носа): гравитационный щит в жёлто-чёрной раме; перед ним — площадка с кораблём
    const LX0 = 3560, LX1 = 3940, LY = 5440;
    wP(S0, [[LX0, LY - 22], [LX1, LY - 22], [LX1, LY + 20], [LX0, LY + 20]], 0x1a1f22);
    wF(S0, [[LX0 + 10, LY - 14], [LX1 - 10, LY - 14], [LX1 - 10, LY + 12], [LX0 + 10, LY + 12]], C.glow, 0.3);
    for (let y = LY - 10; y < LY + 10; y += 5) wLine(S0, [[LX0 + 12, y], [LX1 - 12, y]], 1, 0xe6fffb, 0.35);
    for (let x = LX0; x < LX1 - 6; x += 12) for (const y of [LY - 22, LY + 14]) wF(S0, [[x, y], [x + 6, y], [x + 9, y + 6], [x + 3, y + 6]], ROBO, 0.95);
    octPad(3750, 5205, 74); craft(3756, 5205, Math.PI, 1);
    wLine(S0, [[3750, 5280], [3750, LY - 24]], 14, 0x30373a, 0.9);                                       // выезд к шлюзу
    for (let y = 5286; y < LY - 30; y += 22) wLine(S0, [[3750, y], [3750, y + 11]], 1.6, ROBO, 0.85);
    // ангары (у города): два ряда боксов лицом к перрону; в боксах — космолёты; кровли уступами (ярусы)
    const HX0 = 4510, HX1 = 5568, AY0 = 5072, AY1 = 5228;
    wP(S0, [[HX0, AY0], [HX1, AY0], [HX1, AY1], [HX0, AY1]], 0x30373a);                                  // перрон
    for (let x = HX0 + 10; x < HX1 - 20; x += 30) wLine(S0, [[x, (AY0 + AY1) / 2], [x + 16, (AY0 + AY1) / 2]], 2, ROBO, 0.85);
    for (const [y0, y1, open, xe] of [[4886, AY0, 1, 5470], [AY1, 5410, -1, HX1]]) {   // у северного ряда в конце — посадочный павильон
      for (let x = HX0; x + 96 <= xe + 1; x += 96) {
        const mouth = open > 0 ? y1 : y0, back = open > 0 ? y0 : y1;
        SH([[x, y0], [x + 96, y0], [x + 96, y1], [x, y1]], 10, 12, 0.3);
        wP(S0, [[x, y0], [x + 96, y0], [x + 96, y1], [x, y1]], WG.base);
        wF(S0, [[x + 9, mouth - open * 120], [x + 87, mouth - open * 120], [x + 87, mouth], [x + 9, mouth]], 0x262c2f, 1);   // открытый бокс
        for (let k = 0; k < 3; k++) {                                                                      // кровля уступами (этажи)
          const ya = back + open * k * 22, yb = ya + open * 22;
          wF(S0, [[x + 4, ya], [x + 92, ya], [x + 92, yb], [x + 4, yb]], [WG.mid, WG.lit, WG.mid][k], 0.95);
          wLine(S0, [[x + 4, yb], [x + 92, yb]], 1.2, C.line, 0.5);
        }
        for (let q = x + 10; q < x + 86; q += 9) wF(S0, [[q, mouth - open * 4], [q + 5, mouth - open * 4], [q + 7, mouth], [q + 2, mouth]], ROBO, 0.9);   // разметка у ворот
        if (wr2() < 0.75) craft(x + 48, mouth - open * 62, open > 0 ? Math.PI / 2 : -Math.PI / 2, 0.92);
      }
    }
    // ================= вестибюль под станцией маглева (Район модулей) =================
    // Он НАМНОГО ниже станции: на него падает длинная тень станции, стены спускаются уступами, пол темнее пола станции.
    const VX0 = 5160, VX1 = WL.x0 - 4, VY0 = STN.yb(5378) - 6, VY1 = 4000;
    const vb = [[VX0, VY0], [VX1, VY0], [VX1, VY1], [VX0 + 40, VY1], [VX0, VY1 - 40]];
    wP(S0, vb, WG.base);
    plateRim(vb, 12);
    for (const [d, col] of [[12, 0x5d666a], [17, 0x4b5457], [22, 0x3c4447]]) wF(S0, mgOffset(vb, d), col);   // стены уступами вниз
    const vf = mgOffset(vb, 26);
    wP(S0, vf, 0x353c3f);
    for (let x = VX0 + 44; x < VX1 - 26; x += 22) { const [ya, yb_] = spanAt(vf, x); if (yb_ > ya) wLine(S0, [[x, ya + 2], [x, yb_ - 2]], 1, 0x000000, 0.14); }
    // стойки регистрации: ограждения очереди, стойки с экранами, лента багажа
    for (let k = 0; k < 2; k++) {                             // две простые стойки регистрации (игрок): столешница с номером, сторона сотрудника с монитором, весы
      const x = 5364 + k * 48;                                   // справа (игрок)
      wF(S0, [[x + 4, 3790], [x + 46, 3790], [x + 46, 3812], [x + 4, 3812]], 0x000000, 0.2);
      wP(S0, [[x, 3786], [x + 42, 3786], [x + 42, 3796], [x, 3796]], WG.lit);
      wP(S0, [[x, 3796], [x + 42, 3796], [x + 42, 3806], [x, 3806]], WG.mid);
      wRect(S0, x + 4, 3788, x + 12, 3793, 0xfff1d6, 0.9);                                                              // номер
      wRect(S0, x + 16, 3798.5, x + 26, 3802.5, C.glow, 0.85);                                                           // монитор
      wRect(S0, x + 30, 3788, x + 39, 3794, 0x2a2f31, 1);                                                                // весы
    }
    wLine(S0, [[5362, 3815], [5460, 3815]], 7, 0x4b5457, 1); for (let x = 5366; x < 5458; x += 7) wLine(S0, [[x, 3812], [x, 3818]], 1, WG.hi, 0.6);   // транспортёр багажа
    // торговые капсулы (sci-fi): скошенный корпус, тёмная стеклянная витрина, световая кайма, голо-экран над стойкой
    const ACC = [C.glow, 0xff6b9a, AMBER, 0x7fb35a];
    for (let k = 0; k < 4; k++) {
      const x = 5236 + k * 60, y = 3840, c = ACC[k], c2 = ACC[(k + 1) % 4];
      const pod = [[x + 7, y], [x + 33, y], [x + 40, y + 7], [x + 40, y + 19], [x + 33, y + 26], [x + 7, y + 26], [x, y + 19], [x, y + 7]];
      wF(S0, pod.map(([a, b]) => [a + 5, b + 6]), 0x000000, 0.3);
      wP(S0, pod, WG.mid);
      const inner = pod.map(([a, b]) => [x + 20 + (a - x - 20) * 0.8, y + 13 + (b - y - 13) * 0.75]);
      wP(S0, inner, 0x22262f);
      gfx.poly(wpoly(S0, inner), true).stroke({width: 1.6, color: c, alpha: 0.9, join: 'miter', miterLimit: 3});
      for (let q = 0; q < 4; q++) wRect(S0, x + 9 + q * 6, y + 15, x + 13 + q * 6, y + 19, [0xe9f0f4, c, 0xffd27a, 0xb3bec0][(q + k) % 4], 0.9);   // товар на витрине
      holo(x + 20, y + 8, 18, 5, c, c2);
    }
    // островок отдыха под станцией: голо-колонна и кресла вокруг; автоматы у восточной стены; уборочный дрон
    holoPillar(5404, 3700, 12, C.glow, AMBER);
    for (const [dx, dy] of [[-26, -10], [-26, 10], [26, -10], [26, 10]]) wP(S0, [[5404 + dx - 7, 3700 + dy - 6], [5404 + dx + 7, 3700 + dy - 6], [5404 + dx + 7, 3700 + dy + 6], [5404 + dx - 7, 3700 + dy + 6]], WG.lit);
    for (const y of [3714, 3734, 3754]) { wP(S0, [[5540, y - 8], [5562, y - 8], [5562, y + 8], [5540, y + 8]], 0x2a2f31); wRect(S0, 5542, y + 3, 5547, y + 6, C.glow, 0.9); for (let q = 0; q < 3; q++) wRect(S0, 5549 + q * 4, y - 5, 5551 + q * 4, y + 1, [AMBER, 0xff6b9a, 0x7fb35a][q], 0.9); }
    cleanDrone([[5230, 3827], [5505, 3827], [5505, 3872], [5230, 3872]]);   // объезжает капсулы по свободным проходам
    // магазины вдоль западной и южной стен: витрины и вывески
    const GOODS = [0xffd27a, 0x7fb35a, 0xff8a3c, 0xb3bec0, 0xd99a7a, 0x9aa6a8, 0xe9f0f4, 0xff6b9a];
    for (let k = 0; k < 6; k++) {                                // мини-магазинчики: светлый зал, полка у стены, стол-витрина, прилавок с кассой, стеклянный фасад со входом, вывеска
      const y = 3660 + k * 50, x0 = VX0 + 28, x1 = VX0 + 64, h = 44, sign = [RUST, AMBER, C.glow, 0xff6b9a, 0x7fb35a, AMBER][k];
      wP(S0, [[x0, y], [x1, y], [x1, y + h], [x0, y + h]], 0x6d7679);                                                    // торговый зал
      for (const [a0, b0, a1, b1] of [[x0, y, x1, y + 3], [x0, y + h - 3, x1, y + h], [x0, y, x0 + 3, y + h]]) wRect(S0, a0, b0, a1, b1, WG.mid, 1);   // стены
      wRect(S0, x0 + 4, y + 5, x0 + 8, y + h - 5, 0x4b5457, 1);                                                          // полка у стены
      for (let r = y + 7; r < y + h - 7; r += 5) wRect(S0, x0 + 5, r, x0 + 7, r + 3, GOODS[Math.floor(wr2() * GOODS.length)], 0.95);
      wP(S0, [[x0 + 13, y + 16], [x0 + 22, y + 16], [x0 + 22, y + 32], [x0 + 13, y + 32]], WG.lit);                    // стол-витрина
      for (let r = y + 18; r < y + 30; r += 5) for (const q of [x0 + 14.5, x0 + 18]) wRect(S0, q, r, q + 2.5, r + 2.5, GOODS[Math.floor(wr2() * GOODS.length)], 0.95);
      wP(S0, [[x0 + 12, y + 5], [x1 - 5, y + 5], [x1 - 5, y + 11], [x0 + 12, y + 11]], WG.lit);                          // прилавок
      wRect(S0, x1 - 13, y + 6, x1 - 8, y + 10, 0x1a1f22, 1); wRect(S0, x1 - 12, y + 7, x1 - 9, y + 8.5, C.glow, 0.9);  // касса
      wF(S0, [[x1 - 3, y + 3], [x1, y + 3], [x1, y + 24], [x1 - 3, y + 24]], GLASS, 0.9);                               // стеклянный фасад (ниже — вход)
      wRect(S0, x1, y + 2, x1 + 3, y + h - 2, sign, 0.95);                                                               // вывеска по фронту
    }
    // зал ожидания: ряды кресел, табло, кадки — под рамами-порталами и стеклом
    const wx0 = 5236, wx1 = 5540, wy0 = 3878, wy1 = 3964;
    for (let x = wx0 + 4; x < wx1 - 30; x += 38) for (let y = wy0 + 10; y < wy1 - 10; y += 17) {                 // скамьи: тёплое «дерево», спинка, подлокотники
      wF(S0, [[x + 7, y + 2], [x + 35, y + 2], [x + 35, y + 9], [x + 7, y + 9]], 0x000000, 0.25);
      wRect(S0, x + 5, y, x + 33, y + 6, 0xa0784f, 1); wRect(S0, x + 5, y, x + 33, y + 1.8, 0x6b4f34, 1);
      for (const q of [x + 4, x + 32]) wRect(S0, q, y - 0.5, q + 2, y + 6.5, 0x2a2f31, 1);
    }
    for (const [x, y] of [[5470, 3846], [5530, 3846]]) { wP(S0, [[x - 8, y - 8], [x + 8, y - 8], [x + 8, y + 8], [x - 8, y + 8]], WG.mid); bush(S0, x, y, 6); }
    wF(S0, [[wx0, wy0], [wx1, wy0], [wx1, wy1], [wx0, wy1]], GLASS, 0.2);
    for (let x = wx0; x <= wx1 + 0.1; x += 40) frameBar([[x - 3, wy0], [x + 3, wy0], [x + 3, wy1], [x - 3, wy1]], [[x + 1, wy0], [x + 3, wy0], [x + 3, wy1], [x + 1, wy1]]);
    // ---- выход на улицу: переход сквозь носовую стену той же ширины, что и площадь; рамы-порталы на гранях стены ----
    const XY0 = 3620, XY1 = 3686;                              // вплотную к границе станции (игрок)
    wP(S0, [[VX1 - 2, XY0], [STN.wf, XY0], [STN.wf, XY1], [VX1 - 2, XY1]], WG.mid);
    wF(S0, [[VX1 + 2, XY0 + 6], [STN.wf - 2, XY0 + 6], [STN.wf - 2, XY1 - 6], [VX1 + 2, XY1 - 6]], GLASS, 0.85);
    for (let x = VX1 + 18; x < STN.wf - 8; x += 22) frameBar([[x - 2.5, XY0 - 1], [x + 2.5, XY0 - 1], [x + 2.5, XY1 + 1], [x - 2.5, XY1 + 1]]);
    for (const y of [XY0 + 2, XY1 - 2]) wLine(S0, [[VX1, y], [STN.wf, y]], 2, RUST, 0.95);
    // со стороны вестибюля: проём в восточной стене (сквозь кромку и уступы), дорожка в зал, турникеты, стрелки, табло, кадки
    {
      const IW = VX1 - 28, cy = (XY0 + XY1) / 2, hw = 27, R = 52, ex = 5470, ey = 3764;
      // осевая: от проёма на запад, плавный поворот вниз, в зал к стойкам регистрации
      const mid = [];
      for (let x = VX1 + 2; x > ex + R; x -= 8) mid.push([x, cy]);
      const tn = arcN(R, Math.PI / 2); for (let k = 0; k <= tn; k++) { const g = -Math.PI / 2 - Math.PI / 2 * k / tn; mid.push([ex + R + Math.cos(g) * R, cy + R + Math.sin(g) * R]); }
      for (let y = cy + R + 8; y <= ey; y += 8) mid.push([ex, y]);
      const nrm = mid.map((q, i) => { const a = mid[Math.max(0, i - 1)], b = mid[Math.min(mid.length - 1, i + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / L, (b[0] - a[0]) / L]; });
      const sideA = mid.map(([x, y], i) => [x + nrm[i][0] * hw, y + nrm[i][1] * hw]), sideB = mid.map(([x, y], i) => [x - nrm[i][0] * hw, y - nrm[i][1] * hw]);
      wP(S0, [...sideA, ...sideB.reverse()], 0x5d666a);                                                       // дорожка — светлее пола
      sideB.reverse();
      for (let i = 1; i < mid.length - 1; i += 2) wLine(S0, [sideA[i], sideB[i]], 1, 0x000000, 0.14);        // швы плитки
      for (const sd_ of [sideA, sideB]) wLine(S0, sd_, 2.2, FRAME, 0.9);                                       // бортики
      for (const i of [Math.floor(mid.length * 0.2), Math.floor(mid.length * 0.5), Math.floor(mid.length * 0.8)]) {   // стрелки — к выходу (против хода осевой)
        const [x, y] = mid[i], [nx, ny] = nrm[i], tx = -ny, ty = nx;                                            // tx,ty — к проёму
        for (const d of [-6, 6]) { const bx = x + tx * d, by = y + ty * d; wLine(S0, [[bx - tx * 4 + nx * 6, by - ty * 4 + ny * 6], [bx + tx * 3, by + ty * 3], [bx - tx * 4 - nx * 6, by - ty * 4 - ny * 6]], 1.8, AMBER, 0.9); }
      }
      for (const x of [IW, VX1 - 2]) frameBar([[x - 3, XY0], [x + 3, XY0], [x + 3, XY1], [x - 3, XY1]], [[x, XY0], [x + 3, XY0], [x + 3, XY1], [x, XY1]]);   // рамы проёма
      for (let y = XY0 + 10; y < XY1 - 10; y += 12) {                                                          // турникеты выхода
        wRect(S0, IW - 30, y, IW - 22, y + 3, WG.lit, 1); wRect(S0, IW - 22, y + 0.5, IW - 20, y + 2.5, C.glow, 0.9);
      }
      wRect(S0, IW - 12, XY0 + 8, IW - 6, XY0 + 22, 0x1a1f22, 1); wRect(S0, IW - 11, XY0 + 10, IW - 7, XY0 + 20, C.glow, 0.85);   // табло «выход»
      for (const y of [XY1 + 12]) { wP(S0, [[IW - 14, y - 6], [IW - 2, y - 6], [IW - 2, y + 6], [IW - 14, y + 6]], WG.mid); bush(S0, IW - 8, y, 5); }   // кадки у проёма
    }
    // ---- переход к космопорту: крытая галерея с траволаторами вдоль правого края Района модулей ----
    const GX0 = 5548, GX1 = WL.x0 - 6, GY0 = VY1 - 6, GY1 = 4884;
    wF(S0, [[GX0 + 8, GY0], [GX1 + 10, GY0], [GX1 + 10, GY1], [GX0 + 8, GY1]], 0x000000, 0.25);
    wP(S0, [[GX0, GY0], [GX1, GY0], [GX1, GY1], [GX0, GY1]], WG.mid);
    for (const [x0, dir] of [[GX0 + 6, 1], [GX0 + 24, -1]]) {      // две ленты: к космопорту и обратно
      wF(S0, [[x0, GY0 + 4], [x0 + 14, GY0 + 4], [x0 + 14, GY1 - 4], [x0, GY1 - 4]], 0x262b2d, 1);
      for (let y = GY0 + 14; y < GY1 - 10; y += 16) wLine(S0, [[x0 + 3, y - dir * 3], [x0 + 7, y + dir * 2], [x0 + 11, y - dir * 3]], 1.3, AMBER, 0.75);
      beltBars(x0 + 7, GY0 + 6, GY1 - 6, dir, 26, 24, 11, 0xe9f0f4, 0.4);
    }
    wF(S0, [[GX0 + 2, GY0 + 2], [GX1 - 2, GY0 + 2], [GX1 - 2, GY1 - 2], [GX0 + 2, GY1 - 2]], GLASS, 0.4);
    for (let y = GY0 + 20; y < GY1 - 6; y += 42) frameBar([[GX0 - 2, y - 2.5], [GX1 + 2, y - 2.5], [GX1 + 2, y + 2.5], [GX0 - 2, y + 2.5]]);
    wLine(S0, [[GX0 + 1, GY0], [GX0 + 1, GY1]], 2.2, RUST, 0.95);
    // посадочный павильон у перрона космопорта: выходы к кораблям
    const PX0 = 5476, PX1 = WL.x0 - 6, PY0 = 4880, PY1 = 5070;
    wF(S0, [[PX0 + 10, PY0 + 12], [PX1 + 10, PY0 + 12], [PX1 + 10, PY1 + 12], [PX0 + 10, PY1 + 12]], 0x000000, 0.3);
    const pv = [[PX0, PY0], [PX1, PY0], [PX1, PY1], [PX0, PY1]];
    wP(S0, pv, WG.base); plateRim(pv, 10);
    const pf = mgOffset(pv, 12); wP(S0, pf, 0x3c4447);
    for (let y = PY0 + 30; y < PY1 - 50; y += 18) for (let x = PX0 + 18; x < PX1 - 50; x += 30) wRect(S0, x, y, x + 22, y + 5, WG.lit, 0.9);   // кресла
    wRect(S0, PX1 - 30, PY0 + 30, PX1 - 22, PY0 + 70, 0x1a1f22, 1); for (let r = PY0 + 33; r < PY0 + 68; r += 4) wRect(S0, PX1 - 28, r, PX1 - 24, r + 2, AMBER, 0.9);
    for (let k = 0; k < 3; k++) {                             // три выхода на перрон
      const x = PX0 + 14 + k * 34;
      wRect(S0, x, PY1 - 14, x + 24, PY1 + 2, 0x262c2f, 1);
      for (let q = x + 2; q < x + 22; q += 6) wF(S0, [[q, PY1 - 2], [q + 3, PY1 - 2], [q + 5, PY1 + 2], [q + 2, PY1 + 2]], ROBO, 0.95);
    }
  }
  // посадочная зона депо у выхода из вестибюля: тот же асфальт; тротуар под стеклянным навесом, «зебра» к полосе
  // автобусов, столбики, табло; рамы-порталы на гранях стены поверх
  function exitBoarding() {
    const XY0 = 3620, XY1 = 3686, X0 = STN.wf, SW = 40;
    wP(S0, [[X0, XY0 + 2], [X0 + SW, XY0 + 2], [X0 + SW, XY1 - 2], [X0, XY1 - 2]], 0x8f989a);
    for (let y = XY0 + 10; y < XY1 - 4; y += 12) wLine(S0, [[X0 + 2, y], [X0 + SW - 2, y]], 1, 0x000000, 0.12);
    for (let x = X0 + SW + 6; x < X0 + SW + 40; x += 8) wRect(S0, x, XY0 + 12, x + 4, XY1 - 12, 0xfff1d6, 0.65);   // «зебра»
    for (let y = XY0 + 8; y < XY1 - 4; y += 12) wRect(S0, X0 + SW - 4, y, X0 + SW, y + 4, 0x1a1f22, 1);           // столбики
    wF(S0, [[X0 + 2, XY0 + 4], [X0 + SW - 6, XY0 + 4], [X0 + SW - 6, XY1 - 4], [X0 + 2, XY1 - 4]], GLASS, 0.45);
    for (let y = XY0 + 6; y < XY1 - 2; y += 18) frameBar([[X0, y - 2.5], [X0 + SW - 4, y - 2.5], [X0 + SW - 4, y + 2.5], [X0, y + 2.5]]);
    wRect(S0, X0 + 10, XY1 - 26, X0 + 16, XY1 - 10, 0x1a1f22, 1); for (let r = XY1 - 24; r < XY1 - 11; r += 3) wRect(S0, X0 + 11.5, r, X0 + 14.5, r + 1.5, AMBER, 0.9);
    for (const x of [WL.x0, STN.wf]) frameBar([[x - 5, XY0 - 4], [x + 5, XY0 - 4], [x + 5, XY1 + 4], [x - 5, XY1 + 4]], [[x + 1, XY0 - 4], [x + 5, XY0 - 4], [x + 5, XY1 + 4], [x + 1, XY1 + 4]]);
  }
  // атмосферный шаттл-такси (вид сверху, нос на восток): капсула-кузов, короткие крылья-пилоны с двигателями на концах,
  // маршевое сопло сзади, стеклянный нос, табличка «такси» на крыше. Не самолёт — летающее такси.
  function shuttleTaxi(x, y, col) {
    const L = 64, H = 18, yc = y + 12, x0 = x + 4, sh = pts => wF(S0, pts.map(([a, b]) => [a + 3, b + 4]), 0x000000, 0.35);
    for (const q of [-1, 1]) {
      const wing = [[x0 + 20, yc + q * 7], [x0 + 42, yc + q * 7], [x0 + 38, yc + q * 13], [x0 + 24, yc + q * 13]];
      sh(wing); wP(S0, wing, WG.mid);
      const pod = rrect(x0 + 16, yc + q * 15 - 4, x0 + 44, yc + q * 15 + 4, 4);                                 // двигатель на конце крыла
      sh(pod); wP(S0, pod, 0xb8c2c4);
      wRect(S0, x0 + 40, yc + q * 15 - 2.5, x0 + 44, yc + q * 15 + 2.5, 0x1a1f22, 1);                              // воздухозаборник
      wRect(S0, x0 + 16, yc + q * 15 - 2.5, x0 + 19, yc + q * 15 + 2.5, ROBO, 0.95);                              // сопло
    }
    const nz = rrect(x0 - 6, yc - 5, x0 + 4, yc + 5, 3); sh(nz); wP(S0, nz, WG.deep); wRect(S0, x0 - 6, yc - 3, x0 - 3, yc + 3, ROBO, 0.95);   // маршевое сопло
    const body = rrect(x0, yc - H / 2, x0 + L, yc + H / 2, 9);
    sh(body); wP(S0, body, col);
    wF(S0, rrect(x0, yc, x0 + L, yc + H / 2, 7), 0x000000, 0.15);
    wP(S0, rrect(x0 + L - 22, yc - 6, x0 + L - 3, yc + 6, 6), 0x1d3a48);                                          // стеклянный нос
    wRect(S0, x0 + 24, yc - 3, x0 + 34, yc + 3, col === 0xffd27a ? 0x2a2f31 : ROBO, 0.95);                         // табличка такси
  }
  // эскалаторы и лифт: из вестибюля (низ, y1) в зал станции (верх, y0). Ленты светлее вверху и темнее внизу — глубина;
  // колодец с тенью, стеклянные балюстрады, площадки-гребёнки на концах, стрелки направления
  function escalatorBank(cx, y0, y1) {
    const bw = 12, n = 3, W = n * bw + (n + 1) * 3, x0 = cx - W / 2;
    wF(S0, [[x0 + 8, y0 + 12], [x0 + W + 12, y0 + 12], [x0 + W + 12, y1 + 16], [x0 + 8, y1 + 16]], 0x000000, 0.3);
    wP(S0, [[x0 - 4, y0], [x0 + W + 4, y0], [x0 + W + 4, y1], [x0 - 4, y1]], 0x1a1f22);
    for (let i = 0; i < n; i++) {
      const bx = x0 + 3 + i * (bw + 3), up = i !== 1, segs = 8;
      for (let k = 0; k < segs; k++) {
        const ya = y0 + 14 + (y1 - y0 - 28) * k / segs, yb_ = y0 + 14 + (y1 - y0 - 28) * (k + 1) / segs;
        wF(S0, [[bx, ya], [bx + bw, ya], [bx + bw, yb_], [bx, yb_]], mixC(0x737c7f, 0x23282a, k / (segs - 1)), 1);
      }
      for (let y = y0 + 16; y < y1 - 14; y += 4) wLine(S0, [[bx + 1, y], [bx + bw - 1, y]], 0.8, 0x000000, 0.35);   // ступени
      const ay = up ? y0 + 24 : y1 - 24, sg = up ? -1 : 1;
      wLine(S0, [[bx + 2.5, ay - sg * 3], [bx + bw / 2, ay + sg * 3], [bx + bw - 2.5, ay - sg * 3]], 1.6, AMBER, 0.95);
      beltBars(bx + bw / 2, y0 + 16, y1 - 16, up ? -1 : 1, 7, 14, 10, 0xc8d0d2, 0.55);   // бегущие ступени
    }
    for (let i = 0; i <= n; i++) { const x = x0 + i * (bw + 3) + 1.5; wLine(S0, [[x, y0 + 12], [x, y1 - 12]], 2.4, 0xe9f0f4, 0.9); }   // балюстрады
    for (const [ya, yb_] of [[y0, y0 + 13], [y1 - 13, y1]]) wP(S0, [[x0 - 4, ya], [x0 + W + 4, ya], [x0 + W + 4, yb_], [x0 - 4, yb_]], 0xb8c2c4);   // площадки
  }
  function fillStationHall(yt) {
    for (let y = 3350; y < 3560; y += 18) { wRect(S0, 5494, y, 5504, y + 4, WG.lit, 1); wRect(S0, 5504, y + 1, 5506, y + 3, C.glow, 0.9); }   // турникеты к платформе
    wLine(S0, [[5262, 3552], [5262, 3540], [5280, 3522], [5488, 3522]], 2, AMBER, 0.55);                      // путеводные линии на полу
    wLine(S0, [[5351, 3552], [5351, 3546], [5359, 3538], [5488, 3538]], 2, C.glow, 0.45);
    const sofa = (x, y, rot, flip) => {                       // угловой диван: спинка, сиденье, швы подушек, столик; rot — ×90°, flip — зеркало
      const c = [1, 0, -1, 0][rot], sn = [0, 1, 0, -1][rot], T = ([a, b]) => [x + a * flip * c - b * sn, y + a * flip * sn + b * c], P = pts => pts.map(T);
      wF(S0, P([[-32, -17], [32, -17], [32, 17], [-32, 17]]).map(([u, v]) => [u + 6, v + 6]), 0x000000, 0.18);
      wP(S0, P([[-32, -17], [32, -17], [32, -4], [-19, -4], [-19, 17], [-32, 17]]), 0x6b4f34);
      wF(S0, P([[-28, -13], [30, -13], [30, -5], [-20, -5], [-20, 15], [-28, 15]]), 0xa0784f);
      for (let q = -8; q < 30; q += 13) wLine(S0, P([[q, -13], [q, -5]]), 1, 0x6b4f34, 0.9);
      wLine(S0, P([[-28, 4], [-20, 4]]), 1, 0x6b4f34, 0.9);
      wP(S0, P([[-9, 0], [16, 0], [16, 13], [-9, 13]]), 0x22262f);
    };
    sofa(5238, 3372, 0, 1); sofa(5352, 3376, 0, -1); sofa(5446, 3380, 2, 1); sofa(5300, 3478, 1, 1);
    for (const x of [5310, 5430]) { const y = yt(x) + 28; wP(S0, [[x - 9, y], [x + 9, y], [x + 9, y + 14], [x - 9, y + 14]], 0x2a2f31); wRect(S0, x - 7, y + 10, x + 7, y + 12, C.glow, 0.9); for (let q = 0; q < 3; q++) wRect(S0, x - 6 + q * 5, y + 2, x - 3 + q * 5, y + 7, [AMBER, 0xff6b9a, 0x7fb35a][q], 0.9); }   // автоматы
    holoPillar(5440, 3466, 14, AMBER, C.glow);
  }
  function liftAndEscalators() {
    const y0 = 3556, y1 = 3768;
    escalatorBank(5262, y0, y1);                               // второй марш (x 5440) убран — к нему упиралась дорожка выхода (игрок)
    const lx = 5351;                                           // стеклянная шахта лифта, кабина посередине, двери на концах
    wF(S0, [[lx - 6, y0 + 10], [lx + 22, y0 + 10], [lx + 22, y1 + 14], [lx - 6, y1 + 14]], 0x000000, 0.3);
    wP(S0, [[lx - 14, y0], [lx + 14, y0], [lx + 14, y1], [lx - 14, y1]], WG.mid);
    for (let k = 0; k < 6; k++) { const ya = y0 + 6 + (y1 - y0 - 12) * k / 6, yb_ = y0 + 6 + (y1 - y0 - 12) * (k + 1) / 6; wF(S0, [[lx - 9, ya], [lx + 9, ya], [lx + 9, yb_], [lx - 9, yb_]], mixC(0xb9d7d4, 0x4f6a6c, k / 5), 0.9); }
    for (let y = y0 + 20; y < y1 - 10; y += 22) wLine(S0, [[lx - 9, y], [lx + 9, y]], 1.2, WG.mid, 0.9);
    const cab = new PIXI.Container();                          // кабина — ездит (живое)
    cab.addChild(new PIXI.Graphics().rect(-8, -10, 16, 20).fill({color: WG.lit}).stroke({width: 1.2, color: C.line}).rect(-0.6, -9, 1.2, 18).fill({color: C.line, alpha: 0.6}).rect(-4, -7, 8, 3).fill({color: WG.mid}).rect(-6, 6, 12, 2).fill({color: ROBO}));
    stFx.addChild(cab); SFX.lift.push({c: cab, x: lx, y0: y0 + 18, y1: y1 - 18, per: 13, ph: 0});
    for (const y of [y0 + 2, y1 - 6]) wRect(S0, lx - 8, y, lx + 8, y + 4, ROBO, 0.95);
  }
  function drawStation() {
    const g0 = gfx; gfx = stG;
    drawSpaceport();
    const {jx} = SL, {XW, XE, pa, pb, bx, bw, wf, yt, yb} = STN, ym = x => (yt(x) + yb(x)) / 2;
    // ---- нижний уровень у ферм: автобусное депо (земля); эстакада маглева над ним бросает длинную тень ----
    const dx0 = bx + bw, dx1 = dx0 + 122, dy0 = 3262, dy1 = 3690;   // до выхода из вестибюля — один асфальт (игрок)
    wP(S0, [[dx0, dy0], [dx1 - 18, dy0], [dx1, dy0 + 18], [dx1, dy1 - 18], [dx1 - 18, dy1], [dx0, dy1]], 0x3b4245);
    for (let y = dy0 + 14; y < dy1 - 50; y += 18) wLine(S0, [[dx0 + 16, y], [dx0 + 16, y + 9]], 1.6, 0xfff1d6, 0.45);   // проезд вдоль эстакады
    for (let k = 0; k <= 7; k++) { const y = dy0 + 26 + k * 38; wLine(S0, [[dx0 + 36, y], [dx1 - 6, y]], 1.4, 0xfff1d6, 0.4); }   // разметка стоянок
    for (const k of [4, 6]) shuttleTaxi(dx0 + 40, dy0 + 26 + k * 38 + 7, k === 4 ? 0xffd27a : 0xdfe7eb);   // атмосферные шаттлы-такси
    for (const k of [0, 1, 3]) {                               // автобусы (вид сверху): кузов, кондиционеры на крыше, жёлтая полоса
      const y = dy0 + 26 + k * 38 + 11, x = dx0 + 44, bus = [[x, y], [x + 62, y], [x + 68, y + 4], [x + 68, y + 12], [x + 62, y + 16], [x, y + 16]];
      wF(S0, bus.map(([a, b]) => [a + 3, b + 4]), 0x000000, 0.35);
      wP(S0, bus, 0xdfe7eb); wF(S0, bus.map(([a, b]) => [a, Math.max(b, y + 9)]), 0x9eadb4, 0.45);
      wRect(S0, x + 14, y + 4, x + 26, y + 12, WG.mid, 0.9); wRect(S0, x + 34, y + 4, x + 46, y + 12, WG.mid, 0.9);
      wLine(S0, [[x + 62, y + 2], [x + 62, y + 14]], 2, ROBO, 0.95);
    }
    for (let x = dx0 + 40; x < dx1 - 10; x += 16) { wRect(S0, x, dy0 + 6, x + 8, dy0 + 16, WG.mid, 1); wRect(S0, x + 2.5, dy0 + 9, x + 5.5, dy0 + 12, ROBO, 1); }   // зарядные стойки
    for (let k = 0; k < 5; k++) wF(S0, [[dx1 - 2, dy0 + 150 + k * 10], [dx1 + 4, dy0 + 150 + k * 10], [dx1 + 4, dy0 + 155 + k * 10], [dx1 - 2, dy0 + 155 + k * 10]], k % 2 ? 0x1a1a1a : ROBO, 0.95);   // шлагбаум выезда
    exitBoarding();                                            // посадочная зона у выхода из вестибюля — на асфальте депо
    // тень эстакады (платформы и навес высоко — тень длинная, падает на депо и стену)
    wF(S0, [[XE - 72 + 56, yt(XE) + 44], [bx + bw + 56, yt(XE) + 44], [bx + bw + 56, yb(XE) + 44], [XE - 72 + 56, yb(XE) + 44]], 0x000000, 0.32);
    // ---- участки носовой стены выше и ниже станции, где пути изгибаются к кольцу: стена «в стиле станции» ----
    // (игрок: стену прямо под станцией не трогать; проработать соседние участки — кронштейны, синергия со станцией)
    {
      gfx = wallG;
      const sd = WSIDES.find(q => q.k === 'nose'), t = sd.t, vt = t * WTOP;
      const zones = [[3135 - WL.y0, yt(XE) - WL.y0 - 2], [yb(XE) - WL.y0 + 2, 3772 - WL.y0]];
      for (const [ua, ub] of zones) {
        wP(sd, [[ua, 0], [ub, 0], [ub, t], [ua, t]], WG.base);
        wF(sd, [[ua, 0], [ub, 0], [ub, vt], [ua, vt]], WG.dark);
        for (let u = ua + 4; u < ub - 4;) {                   // верх стены: плиты и решётки
          const e = Math.min(ub - 4, u + wR2(26, 60));
          if (wr2() < 0.55) wRect(sd, u + 3, vt * 0.15, e - 3, vt * 0.85, wr2() < 0.5 ? WG.deep : WG.mid, 0.9);
          else for (let x = u + 5; x < e - 5; x += 9) wRect(sd, x, vt * 0.2, x + 5, vt * 0.8, WG.deep, 0.9);
          wLine(sd, [[e, 0], [e, vt]], TH, C.line, 0.6); u = e;
        }
        wLine(sd, [[ua, vt], [ub, vt]], 7, WG.deep); wLine(sd, [[ua, vt - 2], [ub, vt - 2]], 2, WG.hi, 0.6);   // магистраль
        // фасад к фермам — продолжение вокзала: остекление с тёплыми окнами, терракотовая полоса, светлая кромка
        wP(sd, [[ua + 8, vt + 8], [ub - 8, vt + 8], [ub - 8, t - 16], [ua + 8, t - 16]], WG.glass);
        for (let u = ua + 12; u < ub - 14; u += 13) wRect(sd, u, vt + 12, u + 8, t - 20, wr2() < 0.55 ? WG.warm : 0x3a4148, 0.8);
        wRect(sd, ua + 4, t - 14, ub - 4, t - 8, RUST, 0.95);
        for (let u = ua + 20; u < ub - 20; u += 46) for (const d of [0, 8]) wLine(sd, [[u + d, t - 12.5], [u + d - 4, t - 11], [u + d, t - 9.5]], 1.3, 0xfff1d6, 0.9);
        wF(sd, [[ua, t - 7], [ub, t - 7], [ub, t], [ua, t]], WG.lit);
        for (const u of [ua, ub]) {                           // торцы модуля — светлые рамы, как порталы навеса
          wP(sd, [[u - 5, -2], [u + 5, -2], [u + 5, t + 2], [u - 5, t + 2]], FRAME);
          wF(sd, [[u + 1, -2], [u + 5, -2], [u + 5, t + 2], [u + 1, t + 2]], WG.dark, 0.3);
        }
      }
      // прижимы рельсов на верху стены и кронштейны над фермой (из грани стены к изгибу путей)
      const inZone = y => zones.some(([ua, ub]) => y - WL.y0 > ua + 6 && y - WL.y0 < ub - 6);
      for (const [k, P] of [['A', MP.A], ['Bi', MP.Bi]]) for (let q = 0; q < P.len; q += 34) {
        const [x, y, a] = P.at(q);
        if (!inZone(y) || x < WL.x0 || x > wf + 120) continue;           // только у носа (Bi на этой высоте есть и у кормы)
        const nx = -Math.sin(a), ny = Math.cos(a), c = Math.cos(a), sn = Math.sin(a);
        if (x < wf - 4) {                                     // на стене: поперечный прижим под путём
          const q4 = (al, ac) => [x + c * al + nx * ac, y + sn * al + ny * ac];
          frameBar([q4(-3.5, -13), q4(3.5, -13), q4(3.5, 13), q4(-3.5, 13)]);
        } else if (k === 'Bi') {                              // над фермой: кронштейн от грани стены под оба пути
          const x1 = x + 14;
          wF(S0, [[wf + 6, y - 2], [x1 + 6, y - 2], [x1 + 6, y + 12], [wf + 6, y + 12]], 0x000000, 0.25);     // тень вниз-вбок
          frameBar([[wf - 2, y - 5], [x1, y - 5], [x1, y + 5], [wf - 2, y + 5]], [[wf - 2, y + 1.5], [x1, y + 1.5], [x1, y + 5], [wf - 2, y + 5]]);
          wP(S0, [[wf - 2, y - 10], [wf + 10, y - 10], [wf + 10, y + 10], [wf - 2, y + 10]], WG.base);        // пята в стене
        }
      }
      gfx = stG;
    }
    // ---- корпус зала: верх по кромке обшивки, левый край — изгиб вверх (нижняя кромка плавно поднимается к носу) ----
    const body = [[XW + 34, yt(XW + 34)], [XE, yt(XE)], [XE, yb(XE)], [XW + 170, yb(XW + 170)]];
    const c0 = [XW + 170, yb(XW + 170)], c1 = [XW + 70, yb(XW + 70) + 2], c2 = [XW - 4, ym(XW) + 50], c3 = [XW + 2, yt(XW) + 30];
    for (let k = 1; k <= 14; k++) {
      const t = k / 14, u = 1 - t;
      body.push([u * u * u * c0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * c3[0], u * u * u * c0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * c3[1]]);
    }
    wF(S0, body.map(([x, y]) => [x + 24, y + 46]), 0x000000, 0.4);                 // станция высоко — тень длинная, ложится на вестибюль
    wP(S0, body, WG.base);
    // кромка по всему периметру: плиты разной длины (без пустых углов — идут и по изгибу носа)
    const rim = mgOffset(body, 15);
    for (let i = 0, run = 0, dark = false, next = wR2(18, 46); i < body.length; i++) {
      const j = (i + 1) % body.length, L = Math.hypot(body[j][0] - body[i][0], body[j][1] - body[i][1]);
      for (let a = 0; a < L - 0.01;) {
        const b = Math.min(L, a + (next - run)), fa = a / L, fb = b / L;
        const P = (q, f) => [q[i][0] + (q[j][0] - q[i][0]) * f, q[i][1] + (q[j][1] - q[i][1]) * f];
        wF(S0, [P(body, fa), P(body, fb), P(rim, fb), P(rim, fa)], dark ? WG.deep : WG.mid, 0.9);
        run += b - a; a = b;
        if (run >= next - 0.01) { wLine(S0, [P(body, fb), P(rim, fb)], 1.2, C.line, 0.5); dark = wr2() < 0.45; run = 0; next = wR2(18, 46); }
      }
    }
    gfx.poly(wpoly(S0, rim), true).stroke({width: 1.4, color: C.line, alpha: 0.6, join: 'miter', miterLimit: 3});
    // нос: угловой пост управления с полосой окон
    const nx = XW + 30, ny = yt(XW) + 52;
    wP(S0, [[nx, ny], [nx + 40, ny], [nx + 52, ny + 14], [nx + 52, ny + 30], [nx, ny + 30]], WG.mid);
    wRect(S0, nx + 6, ny + 8, nx + 44, ny + 14, WG.glass, 0.95);
    for (let x = nx + 8; x < nx + 42; x += 7) wRect(S0, x, ny + 9, x + 4, ny + 13, AMBER, 0.8);
    // ---- зал: пол и наполнение (без людей) ----
    const hall = mgOffset(body, 20).map(([x, y]) => [Math.min(x, XE - 78), y]);
    wP(S0, hall, 0x4c5558);
    for (let x = XW + 60; x < XE - 80; x += 24) { const [y0, y1] = spanAt(hall, x); if (y1 > y0) wLine(S0, [[x, y0 + 2], [x, y1 - 2]], 1, 0x000000, 0.12); }
    for (const x of [5250, 5370, 5490]) {                     // киоски у северной стены зала
      const y = yt(x) + 30;
      wP(S0, [[x - 12, y], [x + 12, y], [x + 12, y + 16], [x - 12, y + 16]], WG.mid);
      wRect(S0, x - 10, y + 11, x + 10, y + 15, WG.warm, 0.85);
    }
    for (let x = 5480; x < XE - 95; x += 34) { const y = yb(x) - 38; wRect(S0, x, y, x + 20, y + 5, WG.lit, 0.9); }   // скамьи у южной стены
    for (const x of [5500]) { const y = yb(x) - 54; wP(S0, [[x - 8, y - 8], [x + 8, y - 8], [x + 8, y + 8], [x - 8, y + 8]], WG.mid); bush(S0, x, y, 6); }   // кадки
    liftAndEscalators();                                       // из вестибюля (ниже) в зал станции: два марша и лифт
    fillStationHall(yt);
    // ---- свод: массивные рамы-порталы поперёк зала (как на арте), между ними — матовое стекло ----
    wF(S0, hall, GLASS, 0.22);
    wF(S0, hall.map(([x, y]) => [x, Math.min(y, yt(x) + 44)]), 0xffffff, 0.1);
    for (let x = XW + 40; x < XE - 84; x += 46) {
      const [y0, y1] = spanAt(hall, x); if (!(y1 - y0 > 30)) continue;
      frameBar([[x - 4, y0], [x + 4, y0], [x + 4, y1], [x - 4, y1]], [[x + 1.5, y0], [x + 4, y0], [x + 4, y1], [x + 1.5, y1]]);
    }
    for (const f of [0.3, 0.7]) wLine(S0, [[XW + 90, yt(XW + 90) + (yb(XW + 90) - yt(XW + 90)) * f], [XE - 80, yt(XE - 80) + (yb(XE - 80) - yt(XE - 80)) * f]], 1.6, FRAME, 0.6);
    gfx.poly(wpoly(S0, hall), true).stroke({width: 2.5, color: FRAME, alpha: 0.9, join: 'miter', miterLimit: 3});
    // ---- верхний уровень: платформы и ложе путей между ними ----
    wP(S0, [[XE, pa], [bx, pa], [bx, pb], [XE, pb]], 0x2a2f31);                                                   // ложе: решётка
    for (let y = pa + 4; y < pb - 2; y += 6) wLine(S0, [[XE + 2, y], [bx - 2, y]], 1, WG.mid, 0.35);
    const platform = (x0, x1, edge) => {
      const sg = edge > x0 ? 1 : -1, outer = sg > 0 ? x0 : x1;           // sg: в какую сторону путь
      wP(S0, [[x0, pa], [x1, pa], [x1, pb], [x0, pb]], 0xc9cdc6);
      wF(S0, [[x0, pa], [x1, pa], [x1, pa + 8], [x0, pa + 8]], WG.dark, 0.2);
      wLine(S0, [[edge - sg * 3, pa + 4], [edge - sg * 3, pb - 4]], 2.6, WG.warm, 0.95);                          // жёлтая кромка
      for (let y = pa + 6; y < pb - 6; y += 6) wRect(S0, edge - sg * 9 - 1.5, y, edge - sg * 9 + 1.5, y + 3, 0xfff1d6, 0.6);   // тактильная полоса
      wRect(S0, outer, pa, outer + sg * 9, pb, RUST, 0.95);                                                          // терракотовая стена-полоса
      for (let y = pa + 24; y < pb - 20; y += 92) {                                                                  // «‹‹» на полосе
        for (const d of [0, 8]) wLine(S0, [[outer + sg * 2, y + d], [outer + sg * 7, y + d - 5], [outer + sg * 2, y + d - 10]], 1.6, 0xfff1d6, 0.9);
      }
      const xm = (x0 + x1) / 2 - sg * 4;
      for (let y = pa + 52; y < pb - 30; y += 92) wRect(S0, xm - 3, y, xm + 3, y + 26, WG.mid, 0.95);              // скамьи
      for (const y of [pa + 20, pb - 36]) {                                                                          // табло
        wRect(S0, xm + sg * 10 - 3, y, xm + sg * 10 + 3, y + 16, 0x1a1f22, 1);
        for (let r = y + 2; r < y + 15; r += 3) wRect(S0, xm + sg * 10 - 1.5, r, xm + sg * 10 + 1.5, r + 1.5, AMBER, 0.9);
      }
    };
    platform(XE - 72, XE, XE);
    platform(bx, bx + bw, bx);
    for (const y of [pa + 70, pb - 70]) {                     // лифтовые шахты платформа → депо (квадратные)
      wP(S0, [[bx + bw, y - 12], [bx + bw + 22, y - 12], [bx + bw + 22, y + 12], [bx + bw, y + 12]], WG.mid);
      wRect(S0, bx + bw + 5, y - 7, bx + bw + 17, y + 7, GLASS, 0.9);
    }
    gfx = g0;
  }
  const wR2 = (a, b) => a + wr2() * (b - a);
  let mgFor = 0, lobbiesDrawn = false;
  const wr2 = rngOf(seedOf('вокзалы у стен'));   // приближение, под которое нарисованы пути
  function drawMaglev() {
    mgFor = cam.z; mgG.clear(); mgTop.clear(); techG.clear();
    if (!lobbiesDrawn) { lobbiesDrawn = true; const g0 = gfx; gfx = wallG; ST.filter(st => st.kind === 'bay').forEach(mgLobby); gfx = g0; drawStation(); }
    // направляющая — светлая балка цвета обшивки с тёмным контуром (как линии ship.svg), посередине — шина
    const base = Math.max(14, 2.6 / cam.z), edge = base + Math.max(4, 1.2 / cam.z), mid = Math.max(2.5, 0.55 / cam.z), lw = Math.max(2.5, 0.6 / cam.z);
    const routes = Object.values(MP);
    for (const p of routes) mgG.poly(p.pts.flat(), false).stroke({width: edge, color: C.line, alpha: 0.85, join: 'miter', miterLimit: 3, cap: 'square'});
    for (const p of routes) mgG.poly(p.pts.flat(), false).stroke({width: base, color: C.hullLo, alpha: 0.95, join: 'miter', miterLimit: 3, cap: 'square'});
    for (const p of routes) mgG.poly(p.pts.flat(), false).stroke({width: mid, color: 0x5d6b70, alpha: 0.9, join: 'miter', miterLimit: 3, cap: 'square'});
    // опоры-«шпалы» направляющей — редкие поперечины (только вблизи)
    if (cam.z > 0.25) for (const p of routes) for (let s = 0; s < p.len; s += 120) {
      const [x, y, a] = p.at(s), nx = -Math.sin(a) * base * 0.62, ny = Math.cos(a) * base * 0.62;
      mgG.poly([x - nx, y - ny, x + nx, y + ny], false).stroke({width: lw, color: C.hullDark, alpha: 0.9});
    }
    for (const st of ST) {
      if (st.kind === 'bay') mgPlatforms(st, lw);
      else if (st.kind === 'main') {                                          // главная: навес над путями — рамы-порталы, стекло, подвесные балки
        const g0 = gfx; gfx = mgTop;
        const {XE, bx, bw, yt, yb} = STN, x0 = XE - 72, x1 = bx + bw, y0 = yt(XE), y1 = yb(XE);
        wF(S0, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], GLASS, 0.16);
        for (const x of [SL.jx, SL.jx + 26]) {                                   // подвесные балки над путями — тёмные (светлые сливались с рельсами)
          wLine(S0, [[x, y0 + 4], [x, y1 - 4]], 5, 0x1c2124, 0.95); wLine(S0, [[x - 1.2, y0 + 4], [x - 1.2, y1 - 4]], 1, WG.mid, 0.8);
        }
        for (let y = y0, k = 0; y <= y1 + 0.1; y += (y1 - y0) / 7, k++) {                                      // рамы-порталы; крайние — толще
          const h = k === 0 || y > y1 - 1 ? 7 : 4.5, yy = Math.min(Math.max(y, y0 + h), y1 - h);
          frameBar([[x0, yy - h], [x1, yy - h], [x1, yy + h], [x0, yy + h]], [[x0, yy + h * 0.3], [x1, yy + h * 0.3], [x1, yy + h], [x0, yy + h]]);
          for (const x of [x0, x1 - 8]) { wF(S0, [[x, yy - h - 1.5], [x + 8, yy - h - 1.5], [x + 8, yy + h + 1.5], [x, yy + h + 1.5]], WG.mid, 1); gfx.poly(wpoly(S0, [[x, yy - h - 1.5], [x + 8, yy - h - 1.5], [x + 8, yy + h + 1.5], [x, yy + h + 1.5]]), true).stroke({width: 1.1, color: C.line, alpha: 0.5}); }   // опоры — квадратные
        }
        for (const x of [x0 + 2, x1 - 2]) wLine(S0, [[x, y0], [x, y1]], 3, FRAME, 0.95);
        gfx.poly(wpoly(S0, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]), true).stroke({width: 1.6, color: C.line, alpha: 0.8});
        gfx = g0;
      }
      else if (st.kind === 'tower') {                                        // стоянка у башни (09.10.2026: миниатюрная, по пути)
        const p = Object.values(MP).find(q => q.near([st.x, st.y])[0] < 45);
        const a = p ? p.at(p.near([st.x, st.y])[1])[2] : 0, ca = Math.cos(a), sa = Math.sin(a);
        const L = (along, across) => [st.x + ca * along - sa * across, st.y + sa * along + ca * across];   // вдоль / поперёк пути
        const R4 = (a0, a1, c0, c1) => [...L(a0, c0), ...L(a1, c0), ...L(a1, c1), ...L(a0, c1)];
        const off = base / 2 + 3, pl = 54, pw = Math.max(7, 1.2 / cam.z);
        for (const sgn of [-1, 1]) {
          const c0 = sgn * off, c1 = sgn * (off + pw);
          mgG.poly(R4(-pl, pl, c0, c1), true).fill({color: WG.lit}).stroke({width: lw * 0.7, color: C.line, alpha: 0.9});       // платформа
          mgG.poly(R4(-pl * 0.7, pl * 0.7, c1, c1 + sgn * pw * 0.6), true).fill({color: WG.deep, alpha: 0.95});                  // навес
          for (let k = -2; k <= 2; k++) mgG.poly(ngon(...L(k * pl * 0.32, (c0 + c1) / 2), Math.max(1.6, 0.3 / cam.z)), true).fill({color: WG.warm, alpha: 0.95});
        }
        mgG.poly(R4(-pl - 4, -pl + 4, -off - pw, off + pw), true).fill({color: WG.mid}).stroke({width: lw * 0.6, color: C.line, alpha: 0.8});   // торцы-перемычки
        mgG.poly(R4(pl - 4, pl + 4, -off - pw, off + pw), true).fill({color: WG.mid}).stroke({width: lw * 0.6, color: C.line, alpha: 0.8});
      }
    }
    // техническая линия на обшивке: тонкая тёмная направляющая с опорами
    techG.poly(techLine.pts.flat(), false).stroke({width: Math.max(10, 1.6 / cam.z), color: 0x3b464b, alpha: 0.9, cap: 'square'});
    techG.poly(techLine.pts.flat(), false).stroke({width: Math.max(2.5, 0.5 / cam.z), color: 0xffb84d, alpha: 0.75});
    for (let x = 5800; x < TECH.wing(MG.tech) - 20; x += 400) techG.rect(x - 4, MG.tech - 12, 8, 24).fill({color: 0x3b464b, alpha: 0.8});
    for (let y = 2150; y < 3100; y += 300) techG.rect(TECH.sx - 12, y - 4, 24, 8).fill({color: 0x3b464b, alpha: 0.8});
  }
  function animMaglev(dt) {
    // стены — часть корабля: видны и без районов; маглев — вместе с районами
    if (!mgFor || Math.abs(Math.log(cam.z / mgFor)) > 0.2) { drawWalls(); drawMaglev(); }
    animWalls(performance.now() / 1000); animStation(performance.now() / 1000);
    mgC.visible = techC.visible = zonesOn;
    if (!zonesOn) return;
    const m = Math.max(1, 7 / (MG.carL * cam.z));            // издали вагон не мельче 7 px
    const step = (MG.carL + MG.carGap) * m, sx = MG.carL * m / 122, sy = MG.carW * m / 14;
    for (const tr of mgList) {
      const n = tr.cars.length, half = (n - 1) / 2 * step + MG.carL * m / 2;
      if (!tr.path.closed) tr.s = Math.max(half, Math.min(tr.path.len - half, tr.s));
      if (tr.dwell > 0) tr.dwell -= dt;
      else {
        const d = mgAhead(tr, half);
        // интервал: вагон другого состава впереди на том же направлении (±60°) — тормозим за ним
        const [hx, hy, ha] = tr.path.at(tr.s + tr.dir * half), hd = ha + (tr.dir < 0 ? Math.PI : 0), cs = Math.cos(hd), sn = Math.sin(hd);
        let free = Infinity;
        for (const o of mgList) if (o !== tr && o.path !== techLine) for (const c of o.cars) {
          const dx = c.x - hx, dy = c.y - hy, al = dx * cs + dy * sn;
          if (al > 0 && al < 400 * m && Math.abs(-dx * sn + dy * cs) < MG.carW * m && Math.cos(c.rotation - hd) > 0.5) free = Math.min(free, al - MG.carL * m / 2);
        }
        tr.v = Math.min(tr.v + tr.acc * dt, tr.vmax, Math.sqrt(2 * tr.acc * Math.max(0, d - 0.5)) + 4, Math.sqrt(2 * tr.acc * Math.max(0, free - 40 * m)));
        const st = Math.min(tr.v * dt, Math.max(0, d));
        tr.s += tr.dir * st;
        if (d - st <= 0.5) {
          tr.v = 0; tr.dwell = rnd(...tr.wait);
          if (tr.shuttle) tr.dir = -tr.dir;                  // технический: голова — с другой стороны (вагоны одинаковые)
          if (tr.path.closed) tr.s = ((tr.s % tr.path.len) + tr.path.len) % tr.path.len;
        }
      }
      // вагон 0 — головной, по ходу; последний — хвост, обтекатель развёрнут назад
      for (let i = 0; i < n; i++) {
        const [x, y, a] = tr.path.at(tr.s + tr.dir * ((n - 1) / 2 - i) * step);
        const c = tr.cars[i]; c.position.set(x, y);
        c.rotation = a + (tr.dir < 0 ? Math.PI : 0);
        c.scale.set(c.__flip ? -sx : sx, Math.cos(c.rotation) >= 0 ? sy : -sy);   // хвост — обтекателем назад; тень — всегда вниз
      }
      const [hx, hy] = tr.path.at(tr.s + tr.dir * half);
      tr.glow.position.set(hx, hy); tr.glow.width = tr.glow.height = MG.carW * m * 3.4;
      tr.glow.alpha = tr.dwell > 0 ? 0.22 : 0.5;
    }
  }
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
    animMaglev(tFixed !== null ? 0 : Math.min(0.1, tk.deltaMS / 1000));
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
  window.__ship = {app, maglev: mgList, setChars, pick, fx: fxC, cam, setFocus, flyTo, showCard, hitTest, toWorld, toScreen, zones, towers: wTowers, setEditing, setT: v => { tFixed = v; }, rings: v => { ringsOn = v; },
    benchRings: (n = 60) => { const t0 = performance.now(); for (let i = 0; i < n; i++) drawRings(20 + i * 0.016); return +((performance.now() - t0) / n).toFixed(2); }};
  const q = new URLSearchParams(location.search);
  if (q.get('f')) setFocus(q.get('f'));
})();
