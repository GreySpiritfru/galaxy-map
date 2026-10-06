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
  const RINGS = [{cx: 1180 * S, cy: CY, dir: 1, phase: 0}, {cx: 1384 * S, cy: CY, dir: -1, phase: 0.5}];
  const BOUNDS = {x0: -300, y0: -1600, x1: 21800, y1: 9200};
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
  // пазы колец: выемка в обшивке сверху и снизу, где ходят шарниры лифтов (сквозная — дно за корпусом)
  const NW = 9, ND = 15, RX = RINGS.map(r => r.cx / S);
  const NOTCH_T = RX.flatMap(x => [[x - NW, TOP], [x - NW, TOP + ND], [x + NW, TOP + ND], [x + NW, TOP]]);
  const NOTCH_B = RX.slice().reverse().flatMap(x => [[x + NW, BOT], [x + NW, BOT - ND], [x - NW, BOT - ND], [x - NW, BOT]]);
  const HULL = [[10, 385], [51, 378], [93, 394], [130, 402], [168, 407], [210, 400], [253, 386], [272, 366], [282, 362],
    [250, 352], [211, 334], ...DOME, ...BEND_T, ...NOTCH_T, [1602, TOP], [1602, BOT], ...NOTCH_B, ...BEND_B, [330, FB], [300, 563], [264, 541],
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


  let drawnFor = 0;
  function drawShip() {
    const lw = Math.max(4, 2 / cam.z), thin = lw * 0.6, hair = lw * 0.38;
    drawnFor = cam.z;
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
    tread: [0x0b1840, 0x21408f, 1], tread2: [0x08133a, 0x1a3578, 1], edge: [0x142a66, 0x4670cc, 1], side: [0x566c78, 0xbfd1d9, 1],
    inner: [0x2c393f, 0x8fa4ac, 1], iedge: [0x44545c, 0xb6c9d1, 1], solar: [0x06102c, 0x16337a, 1],
    shaft: [0x52626a, 0xd0dde2, 1], foot: [0x44545b, 0xb8c8ce, 1], cab: [0x76858c, 0xf1f5f7, 1],
    ink: [C.line, C.line, 1], ink85: [C.line, C.line, 0.85], ink6: [C.line, C.line, 0.6],
    light: [0xe9fbff, 0xe9fbff, 0.95], light7: [0xe9fbff, 0xe9fbff, 0.7], lightDim: [0xe9fbff, 0xe9fbff, 0.32],
    glow: [0x8fdcff, 0x8fdcff, 0.13], glowDim: [0x8fdcff, 0x8fdcff, 0.08], halo: [0xbfe6ff, 0xbfe6ff, 0.16],
    grid: [0x5d88e6, 0x5d88e6, 0.55], gridHi: [0x5d88e6, 0x5d88e6, 0.75], warm: [C.warm, C.warm, 1],
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
  const P_RING = 24, NLIFT = 4;                                    // панелей по кругу, лифтов на кольцо
  const tone = n => 0.5 + 0.62 * (n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
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
    const r0 = HH - 13 * S, r1 = RING.Ri + 2 * S, wa = 4 * S, wt = 4 * S;   // основание — на дне паза в обшивке
    for (const {s, ph} of list) {
      const at = (a, rho, tau = 0) => S3(W3(r, ph, a, rho, tau));
      // свая: на грани к носу — стеклянная шахта с огнями, внутри едут кабины (одна вверх, другая вниз)
      drawBox(mb, r, ph, [[r0, -wa, wa, -wt, wt], [r1 - 16 * S, -wa, wa, -wt, wt]], 'shaft', lw, (sp, n) => {
        if (n[0] > -0.9) return;
        const a0 = r0 + 16 * S, a1 = r1 - 22 * S;
        mb.line([at(-wa, a0), at(-wa, a1)], Math.max(1.2, 3.2 * S * cam.z), 'slot');
        for (let q = a0 + 10 * S; q < a1 - 4 * S; q += 20 * S) mb.disc(...at(-wa, q), Math.max(0.7, 1.1 * S * cam.z), 'lightDim');
        const u = (Math.sin(t * 0.42 + s * 1.9 + ri * 2.4) + 1) / 2, rc = a0 + (a1 - a0 - 7 * S) * u;   // кабина — огонь в шахте
        mb.line([at(-wa, rc), at(-wa, rc + 7 * S)], Math.max(1, 2.4 * S * cam.z), 'warm');
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

  function drawNotches(mb) {
    for (const r of RINGS) for (const top of [true, false]) {
      const x0 = r.cx - NW * S, x1 = r.cx + NW * S, y0 = (top ? TOP : BOT - ND) * S, y1 = (top ? TOP + ND : BOT) * S;
      mb.poly([[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map(([x, y]) => toScreen(x, y)), 'notch', top ? [0, 0, 0.8, 0.8] : [0.8, 0.8, 0, 0]);
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
    // грани: тон — в каждой вершине по нормали, между вершинами плавно; у ленты панели через одну темнее
    for (const i of segs) {
      const p0 = G.pos[i], p1 = G.pos[i + 1];
      for (const f of PROF) {
        if (!G.vis[i][f.j]) continue;
        const row = f.mat === 'tread' && Math.floor(i / G.sub) % 2 ? 'tread2' : f.mat;
        mb.quad(p0[f.j], p0[f.j2], p1[f.j2], p1[f.j], row, G.tn[i][f.j], G.tn[i + 1][f.j]);
      }
    }
    const dP = Math.PI * 2 / P_RING, inHalf = ph => (Math.cos(ph) > 0) === front;
    if (front) {
      // солнечные панели на ленте: тёмные, с сеткой ячеек
      const e = (RING.bw - RING.c) * 0.8;
      for (let p = 0; p < P_RING; p++) {
        const a0 = G.rot + (p + 0.1) * dP, a1 = G.rot + (p + 0.9) * dP, am = (a0 + a1) / 2;
        if (!inHalf(am) || Math.cos(am) < 0.1) continue;
        const along = ax => [0, 1, 2, 3, 4].map(q => rp(r, a0 + (a1 - a0) * q / 4, RING.R, ax));
        const L = along(-e), Rt = along(e), M = along(0), tt = tone(nrm3(PROF[2], am));
        for (let q = 0; q < 4; q++) mb.poly([L[q], L[q + 1], Rt[q + 1], Rt[q]], 'solar', tt);
        mb.line([...L, ...Rt.slice().reverse()], lw * 0.4, 'gridHi', true);
        mb.line(M, lw * 0.3, 'grid');
        for (const q of [1, 2, 3]) mb.line([L[q], Rt[q]], lw * 0.3, 'grid');
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
    // пунктир огней на боковине (как на арте) — с ореолом
    const rm = (RING.Ri + RING.c2 + RING.R - RING.c) / 2;
    for (let p = 0; p < P_RING; p++) for (const [u0, u1] of [[0.1, 0.32], [0.39, 0.61], [0.68, 0.9]]) {
      const a0 = G.rot + (p + u0) * dP, a1 = G.rot + (p + u1) * dP;
      if (!inHalf((a0 + a1) / 2)) continue;
      const pts = [rp(r, a0, rm, -RING.bw), rp(r, (a0 + a1) / 2, rm, -RING.bw), rp(r, a1, rm, -RING.bw)];
      mb.line(pts, Math.max(2, 8 * S * cam.z), front ? 'glow' : 'glowDim');
      mb.line(pts, Math.max(1.1, 3.4 * S * cam.z), front ? 'light' : 'light7');
    }
    if (front) {
      // бегущие огни на швах ленты
      for (let p = 0; p < P_RING; p += 2) {                        // огонь на каждом втором шве
        const a = G.rot + p * dP;
        if (!inHalf(a) || Math.cos(a) < 0.05) continue;
        const h = Math.sin((p + 1) * 12.9898 + ri * 78.233) * 43758.5453, rnd = h - Math.floor(h);   // свой ритм у каждого огня
        const [x, y] = rp(r, a, RING.R, 0), on = ((t * (0.22 + 0.2 * rnd) + rnd * 7.3) % 1) < 0.35;
        if (on) mb.disc(x, y, Math.max(2, 6.5 * S * cam.z), 'halo');
        mb.disc(x, y, Math.max(1, 2.8 * S * cam.z), on ? 'light' : 'lightDim');
      }
    } else {
      // внутренняя сторона: два ряда окон
      for (let p = 0; p < P_RING; p++) for (const u of [0.18, 0.4, 0.62, 0.84]) {
        const a = G.rot + (p + u) * dP;
        if (!inHalf(a) || Math.cos(a) > -0.02) continue;
        for (const ax of [-RING.bw * 0.42, RING.bw * 0.42]) mb.line([rp(r, a - dP * 0.07, RING.Ri, ax), rp(r, a + dP * 0.07, RING.Ri, ax)], Math.max(1, 3.4 * S * cam.z), 'light7');
      }
    }
  }
  function drawRings(t) {
    const geo = RINGS.map(r => ringGeom(r, t)), back = MB_BACK.reset(), front = MB_FRONT.reset();
    RINGS.forEach((r, i) => drawRingHalf(back, r, i, geo[i], false, t));
    drawNotches(back);                                                    // дно пазов в обшивке
    RINGS.forEach((r, i) => drawLifts(back, r, i, geo[i], false, t));     // дальние лифты — поверх дальних граней
    RINGS.forEach((r, i) => drawRingShadow(front, geo[i]));               // тень ближней половины — на корпус
    RINGS.forEach((r, i) => drawLifts(front, r, i, geo[i], true, t));     // ближние — под ближними гранями
    RINGS.forEach((r, i) => drawRingHalf(front, r, i, geo[i], true, t));
    back.flush(ringsBack); front.flush(ringsFront);
  }

  // ---------- районы ----------
  // v4: районы носа переделаны — их правка из v3 не переносится, правка городских районов переносится
  const STORE = 'phenomSchemaZones4', STORE_OLD = 'phenomSchemaZones3';
  let zones = SCHEMA.zones.map(z => ({...z, poly: z.poly.map(p => [...p])}));
  try {
    let saved = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!saved) saved = (JSON.parse(localStorage.getItem(STORE_OLD) || 'null') || []).filter(s => zones.find(z => z.id === s.id)?.part === 'city');
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
      zonesG.poly(z.poly.flat(), true).fill({color: col, alpha: z.free ? 0.12 : 0.34}).stroke({width: lw, color: z.free ? 0x5b6a70 : col, alpha: 0.95, join: 'round'});
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
    if (!selected || selected.kind !== 'zone') return;
    hiG.poly(zones[selected.i].poly.flat(), true).stroke({width: Math.max(5, 3.5 / cam.z), color: 0xAFEEEE});
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  function showCard(hit) {
    selected = hit; drawHighlight();
    const card = document.getElementById('card');
    if (!hit) { card.classList.remove('open'); return; }
    let html;
    if (hit.kind === 'zone') {
      const z = zones[hit.i], n = z.buildings.length;
      const part = z.part === 'front' ? 'Передняя оболочка' : 'Феном-Сити';
      html = z.free ? `<h2>Свободная зона</h2><div class="sub">Феном-Сити</div><p>Здесь были «Технические помещения» и край «Района модулей». Место под новый район.</p>`
        : `<h2>${esc(z.name)}</h2><div class="sub">${part} · ${n ? n + ' ' + (n === 1 ? 'здание' : n < 5 ? 'здания' : 'зданий') : 'зданий пока нет'}</div>`
          + `<div class="chips">${z.buildings.map(b => `<span>${esc(b)}</span>`).join('')}</div>`;
    } else {
      const [t, sub, text] = INFO[hit.kind];
      html = `<h2>${t}${hit.kind === 'ring' ? ' ' + (hit.i + 1) : ''}</h2><div class="sub">${sub}</div><p>${text}</p>`;
    }
    document.getElementById('cardBody').innerHTML = html;
    card.classList.add('open');
  }
  document.getElementById('cardClose').onclick = () => showCard(null);

  // ---------- фокус на части ----------
  const FOCUS = {
    all: {box: {x0: 0, y0: -700, x1: 21200, y1: 7800}},
    nose: {box: {x0: 0, y0: 950, x1: 9600, y1: 6000}, keep: ['front']},
    city: {box: {x0: 5300, y0: 1300, x1: 15200, y1: 5800}, keep: ['city']},
    rings: {box: {x0: 9700, y0: -700, x1: 16300, y1: 7800}, keep: ['rings']},
    stern: {box: {x0: 14600, y0: 300, x1: 21300, y1: 7600}, keep: ['stern']},
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
    const hit = hitTest(...toWorld(sx, sy));
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
    applyLayer(world, 0); applyLayer(artTop, 0);
    stars.width = sw(); stars.height = sh();
    stars.tilePosition.set(-cam.x * cam.z * 0.03 + sw() / 2, -cam.y * cam.z * 0.03);
    {
      const t0 = performance.now(), camKey = `${cam.x.toFixed(2)},${cam.y.toFixed(2)},${cam.z.toFixed(5)},${SCX},${SCY}`;
      const due = camKey !== ringCamKey || tFixed !== null || Math.abs(t - ringT) * RING.speed * RING.R * cam.z > 0.35;   // сдвиг ленты на экране, px
      if (!ringsOn) { clearMesh(ringsBack); clearMesh(ringsFront); ringCamKey = ''; }
      else if (due) { drawRings(t); ringT = t; ringCamKey = camKey; ringMs = ringMs * 0.9 + (performance.now() - t0) * 0.1; }
    }
    placeLabels();
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
  window.__ship = {cam, setFocus, flyTo, showCard, hitTest, toWorld, toScreen, zones, setEditing, setT: v => { tFixed = v; }, rings: v => { ringsOn = v; },
    benchRings: (n = 60) => { const t0 = performance.now(); for (let i = 0; i < n; i++) drawRings(20 + i * 0.016); return +((performance.now() - t0) / n).toFixed(2); }};
  const q = new URLSearchParams(location.search);
  if (q.get('f')) setFocus(q.get('f'));
})();
