/* ============================================================
   Flappy Phenome (v=197) — мини-игра из подсказки «?» (кнопка 🕹️ под
   «Пройти обучение»). Феном летит к центру Галактики; тап/пробел — импульс.

   Маршрут — череда «встреч» (encounters), между ними свободное место:
   - ворота — стены с проходом, четыре вида: лазерная сетка, фермы станции,
     астероидные столбы, кристаллы (на высоких очках проход «плавает»);
   - объекты, которые облетают сверху или снизу: планета (гигант у края, с
     лунами, звезда), планета в туманности (молнии — просто красота),
     астероидное поле с извилистым коридором, чёрная дыра (тянет к себе);
   - гроксы — отдельные корабли: «!» у правого края → влетают и зависают →
     линия прицела → выстрел → таран по своей линии.
   Каждые SECTOR_EVERY встреч — прыжок в следующую систему карты (свой цвет
   фона, звёзды вытягиваются, баннер); после JUMPS_TO_GROX прыжков — центр
   Галактики, территория гроксов (их больше, стреляют дважды).
   Подбирается: 💎 +1 очко, 🛡️ щит на один удар (планету, луну, звезду щит
   взрывает — «Феному хоть бы хны»), 🚀 портал — GD_TIME секунд полёта как
   корабль в Geometry Dash (держишь — плавно вверх, отпустил — плавно вниз),
   📖 страница комикса «Типа Феном» (страница N появляется после PAGE_AT[N]
   встреч, только следующая неоткрытая; открытые — localStorage, читалка —
   кнопка 📖 на заставке и на экране конца). За планету, разбитую щитом, —
   гигадетонатор (v=198): кнопка справа внизу / F — луч и волна сносят всё
   впереди (стены, планеты, астероиды, дыры, гроксов).

   Модуль грузится ТОЛЬКО по нажатию кнопки (динамический import в
   onboarding.js) — на запуск карты не влияет. Рисует один <canvas> 2D;
   карта под игрой не рисуется (.flappy-overlay непрозрачный, см. css).
   Навигация: слой #flappyOverlay в navigation.js (Esc / «назад» Telegram
   закрывают игру) — оттуда приходит событие 'flappy-close'.
   Рекорд — localStorage galaxyMapFlappyBest (только на этом устройстве).
   ============================================================ */

const BEST_KEY = 'galaxyMapFlappyBest';
const H = 600;                 // высота мира в условных единицах, ширина — по экрану
const GRAVITY = 1300;
const FLAP_VY = -420;
const MAX_FALL = 650;
const STEP = 1 / 120;          // фиксированный шаг физики: одинаково на 60 и 90/120 Гц
const SHIP_S = 0.6;            // Феном нарисован в «единицах арта» (длина ~116), на экране ×0.6
const GROX_S = 0.5;
const GROX_REL = 95;           // таран грокса быстрее, чем «едет» мир
const GROX_WARN = 1.0;         // «!» у правого края до вылета, с
const GROX_CHARGE = 0.6;       // прицеливание перед выстрелом (видна линия), с
const BOLT_SPEED = 480;
const HOLE_PULL = 1100;
// Режим корабля из Geometry Dash: держишь — постоянная тяга вверх, отпустил —
// тяжесть вниз, скорость ограничена (инерция есть, рывков нет).
const GD_TIME = 10;
const GD_UP = 1700, GD_DOWN = 1150, GD_MAX_UP = 340, GD_MAX_DOWN = 360;
const SLOWMO = 0.9;            // замедление после взрыва планеты, с
/* Режим корабля разгоняет мир (v=203, просьба игрока), а в начале режима и
   после его конца на GRAV_TIME перед носом стоит гравитационный щит: смена
   управления (импульсы ↔ тяга) — самый частый момент разбиться. Щит
   пропускает сквозь стены и планеты, камни и луны разбивает, гроксов сбивает,
   заряды гасит; пол — мягкий отскок. Это не обычный щит 🛡️: он не тратится
   и не взрывает планеты. */
const GD_SPEED = 1.22, GRAV_TIME = 2.5;
/* Редкое оружие (v=203): мини-лазеры из носа, случайный вид. Стреляет само —
   тап по-прежнему импульс. Камни и луны разбивает, гроксов сбивает (+1),
   заряды гасит; о стены и планеты — искры. */
const WEAPONS = {
  spread: { name: 'Тройной лазер', time: 5, col: '95,243,238', w: 34 },
  burst: { name: 'Очереди', time: 5, col: '255,215,106', w: 30 },
  shotgun: { name: 'Дробь', time: 0, col: '255,150,90', w: 22 },
  minigun: { name: 'Миниган', time: 3, col: '255,95,95', w: 14 },
};
const SHOT_SPEED = 900;
// Гигадетонатор (как в Spore) — за планету, разбитую щитом; кнопка справа
// внизу или F: луч антиматерии из носа + волна во всю высоту, сносит всё впереди.
const GIGA_MAX = 3, BEAM_TIME = 1.1, BEAM_SPEED = 1600;
const GIGA_ICON = (() => {   // белый «ёж» лучей вокруг ядра — как значок в Spore
  let rays = '';
  for (let i = 0; i < 20; i++) {
    const a = i * Math.PI / 10, l = i % 2 ? 11 : 17, w = i % 2 ? 1.2 : 1.8, c = Math.cos(a), s = Math.sin(a);
    rays += `<line x1="${(c * 4).toFixed(1)}" y1="${(s * 4).toFixed(1)}" x2="${(c * l).toFixed(1)}" y2="${(s * l).toFixed(1)}" stroke-width="${w}"/>`;
  }
  return `<svg class="flappy-giga-icon" viewBox="-20 -20 40 40" aria-hidden="true"><g stroke="#fff" stroke-linecap="round">${rays}</g><circle r="4.5" fill="#fff"/></svg>`;
})();
const COMIC_KEY = 'galaxyMapFlappyComic';
const COMIC_PAGES = 5;
const PAGE_AT = [0, 0, 5, 12, 20, 30];   // страница N — в полёте после стольких встреч (первая открыта сразу)
const comicSrc = (n) => `images/comic/tipa-fenom-${n}.webp`;
const SECTOR_EVERY = 8;       // столько встреч — и прыжок в следующую систему
const JUMPS_TO_GROX = 5;       // после стольких прыжков — центр Галактики
// Системы, у которых есть своя карта (systems/manifest.json), — подписи как на карте.
const SYSTEMS = ['Тау Кита', 'Денеб', 'Цекоран', 'Компас Хора', 'Кхар-ра', 'Тальзеур',
  'Элион’Тель', 'Корона Солвирис', 'Предел Федерации', 'G-UX71', 'Солнце', 'Бездна'];
const GROX_HOME = 'Центр Галактики';

const QUIPS = {
  laser:   ['Лазерная сетка оказалась плотнее щитов', 'Феном слегка поджарился'],
  girder:  ['Стыковка не по плану', 'Это была несущая ферма'],
  rock:    ['Камень в борт', 'Пояс астероидов не прощает', 'Астероид не заметил Феном'],
  crystal: ['Красиво, но остро', 'Кристаллы оказались твёрже брони'],
  planet:  ['Планета не уступила дорогу', 'Навигатор перепутал орбиты'],
  moon:    ['Луна выскочила из-за горизонта', 'Это была не луна…'],
  star:    ['Слишком близко к звезде', 'Феном подгорел'],
  hole:    ['Горизонт событий — это навсегда', 'Сингулярность не отпустила'],
  grox:    ['Таран гроксов', 'Гроксы не пропускают чужаков'],
  bolt:    ['Гроксы открыли огонь', 'Гроксы передают привет', 'Щиты? Какие щиты?'],
  floor:   ['Феном рухнул в бездну', 'Двигатели не вытянули', 'Гравитация победила'],
};

// Цвета фона по секторам: облака туманностей, далёкая галактика.
const PALETTES = [
  ['180,140,255', '95,243,238', '255,140,200'],   // старт — цвета логотипа
  ['255,170,90', '255,120,80', '255,220,140'],
  ['90,150,255', '140,220,255', '120,100,240'],
  ['110,240,170', '70,200,210', '190,255,140'],
  ['255,100,150', '210,90,230', '255,170,130'],
  ['255,110,40', '255,60,50', '255,190,90'],      // территория гроксов
];
const GROX_PAL = 5;
const PLANETS = [   // светлая сторона, тёмная, атмосфера
  ['#8fd8ff', '#1a3d6e', '120,200,255'], ['#ffc07a', '#6b2f14', '255,170,90'],
  ['#c3a2ff', '#2e1b5c', '190,150,255'], ['#a6ec86', '#1f4a26', '150,240,140'],
  ['#efe0b6', '#5c4a2a', '240,220,170'], ['#ff8fa0', '#5a1828', '255,140,160'],
  ['#9ff3e8', '#14514c', '120,240,230'],
];
const MOONS = [['#e2ddd4', '#55514b'], ['#d2c0a4', '#56432e'], ['#bfcad6', '#3b4756']];
const ROCKS = [['#8a7d72', '#3b332e'], ['#808894', '#353a42'], ['#94806a', '#3e3226']];
const CRYSTALS = [
  { a: '#0f4d4b', b: '#5ff3ee', c: '#c9fffb', edge: '#0a2f2e', glow: '95,243,238' },
  { a: '#2b1a55', b: '#a07cff', c: '#e6dbff', edge: '#1a0f36', glow: '180,140,255' },
];
const WALLS = ['laser', 'girder', 'rocks', 'crystal'];
const NAVY = '#1f3373', OUT = '#10141f', GOUT = '#15181c';
// Хитбоксы — круги меньше рисунка (прощающие), в единицах арта.
const SHIP_HIT = [[-48, 0, 14], [-24, 0, 12], [0, 0, 10], [22, -2, 11], [42, -2, 8]];
const GROX_HIT = [[-52, -1, 8], [-30, -5, 11], [0, -6, 14], [34, -4, 12], [-56, 16, 6], [-32, 20, 7], [-6, 15, 7]];
const GROX_LIGHTS = [[-48, -2.5], [-38, -2.2], [-6, -0.5], [14, -1.5], [36, -3]];

const overlay = document.getElementById('flappyOverlay');
let built = false;
let canvas, ctx, scoreEl, panelEl, startEl, bestStartEl, sectorEl, comicEl;
let dpr = 1, scale = 1, W = 400;
let state = 'ready';           // ready | play | dead
let ship, encounters = [], groxes = [], bolts = [], pickups = [], particles = [], texts = [];
let score = 0, best = 0, made = 0, progress = 0, cursor = 0;
let lastGapY = H / 2, lastKinds = [], lastWallStyle = '', lastShieldAt = 0, lastGdAt = 0;
let holding = false, slowmo = 0;
// Удержание (v=202, аудит): нажатые пальцы/кнопки мыши и клавиша — отдельно,
// иначе при мультитаче отпускание любого пальца сбрасывало тягу.
const downPointers = new Set();
let keyHeld = false;
// Пауза при сворачивании/уходе фокуса/повороте (v=202): раньше Феном погибал
// через доли секунды после возврата — физика шла дальше без игрока.
let paused = false, pauseEl = null;
let unlocked = 1, pageOfferAt = 0, newPage = 0, comicOpen = false, comicPage = 1, swipeX = null;
let sightings = null, bgMarks = [], nextMarkAt = 0;   // маркеры карты, проплывающие на фоне
let beam = null, gigaHintShown = false;                // луч гигадетонатора
let shots = [], lastWpnAt = 0, gravSpark = 0;          // мини-лазеры; искры гравищита
let sector = 0, route = [], palShift = 0, paletteIdx = 0, prevPaletteIdx = 0, paletteFade = 1, warp = 0;
let far = null, prevFar = null, stars = null;
let bgScroll = 0, shake = 0, flash = 0, deadAt = 0, trailAcc = 0;
let raf = 0, lastT = 0, acc = 0, time = 0;
let PATH = null, GR = null;
const reduceMotion = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const approach = (v, to, step) => v + clamp(to - v, -step, step);
const TAU = Math.PI * 2;
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }

function loadBest() {
  try { return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0; } catch (e) { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch (e) {}
}
function loadComic() {
  try { return clamp(parseInt(localStorage.getItem(COMIC_KEY) || '1', 10) || 1, 1, COMIC_PAGES); } catch (e) { return 1; }
}
function saveComic(v) {
  try { localStorage.setItem(COMIC_KEY, String(v)); } catch (e) {}
}
function haptic(kind) {
  try {
    const h = window.Telegram?.WebApp?.HapticFeedback;
    if (!h) return;
    if (kind === 'error' || kind === 'success') h.notificationOccurred(kind);
    else h.impactOccurred(kind);
  } catch (e) {}
}

/* ---------- Разметка (один раз) ---------- */
function build() {
  built = true;
  overlay.innerHTML = `
    <canvas class="flappy-canvas"></canvas>
    <button type="button" class="flappy-close" aria-label="Закрыть">✕</button>
    <div class="flappy-score">0</div>
    <div class="flappy-sector"><span class="flappy-sector-kicker"></span><span class="flappy-sector-name"></span></div>
    <div class="flappy-start">
      <div class="flappy-title">Flappy Phenome</div>
      <div class="flappy-hint">Тапни, чтобы дать импульс</div>
      <div class="flappy-sub">Проходи ворота, облетай планеты, астероиды и чёрные дыры. «!» у правого края — летят гроксы: уходи с их линии.</div>
      <div class="flappy-legend"><span>💎 +1</span><span>🛡️ щит — взрывает планеты</span><span>🚀 держи — летишь вверх</span><span>⚡ редкое оружие</span><span>${GIGA_ICON} гигадетонатор за планету</span><span>📖 страницы комикса</span></div>
      <div class="flappy-best-start"></div>
      <button type="button" class="flappy-comic-btn">📖 Комикс «Типа Феном» · <span class="flappy-comic-count"></span></button>
    </div>
    <div class="flappy-panel" hidden>
      <img class="flappy-grox" alt="" hidden>
      <div class="flappy-quip"></div>
      <div class="flappy-where"></div>
      <div class="flappy-result">
        <div><span class="flappy-num flappy-final">0</span><span class="flappy-cap">счёт</span></div>
        <div><span class="flappy-num flappy-best">0</span><span class="flappy-cap">рекорд</span></div>
      </div>
      <div class="flappy-record" hidden>🏆 Новый рекорд!</div>
      <div class="flappy-newpage" hidden></div>
      <div class="flappy-actions">
        <button type="button" class="flappy-again">🔁 Ещё раз</button>
        <button type="button" class="flappy-comic-btn flappy-comic-btn--panel">📖 <span class="flappy-comic-count"></span></button>
      </div>
    </div>
    <div class="flappy-comic" hidden>
      <div class="flappy-comic-head">
        <div class="flappy-comic-heading">
          <div class="flappy-comic-title">Типа Феном</div>
          <div class="flappy-comic-by">комикс · Dragon_Moder_Blaga и SporeMaxis</div>
        </div>
        <button type="button" class="flappy-comic-close" aria-label="Закрыть комикс">✕</button>
      </div>
      <div class="flappy-comic-body">
        <img class="flappy-comic-img" alt="">
        <div class="flappy-comic-lock" hidden></div>
      </div>
      <div class="flappy-comic-nav">
        <button type="button" class="flappy-comic-prev" aria-label="Предыдущая страница">‹</button>
        <div class="flappy-comic-dots"></div>
        <button type="button" class="flappy-comic-next" aria-label="Следующая страница">›</button>
      </div>
    </div>
    <button type="button" class="flappy-giga" hidden aria-label="Гигадетонатор">${GIGA_ICON}<span class="flappy-giga-count"></span></button>`;
  canvas = overlay.querySelector('.flappy-canvas');
  ctx = canvas.getContext('2d');
  scoreEl = overlay.querySelector('.flappy-score');
  panelEl = overlay.querySelector('.flappy-panel');
  startEl = overlay.querySelector('.flappy-start');
  bestStartEl = overlay.querySelector('.flappy-best-start');
  sectorEl = overlay.querySelector('.flappy-sector');
  comicEl = overlay.querySelector('.flappy-comic');
  makeArt();

  overlay.querySelector('.flappy-close').addEventListener('click', closeFlappy);
  overlay.querySelector('.flappy-again').addEventListener('click', (e) => { e.stopPropagation(); reset(); onTap(); });
  overlay.querySelectorAll('.flappy-comic-btn').forEach(b => b.addEventListener('click', (e) => {
    e.stopPropagation();
    openComic(newPage || unlocked);
  }));
  overlay.querySelector('.flappy-comic-close').addEventListener('click', closeComic);
  overlay.querySelector('.flappy-comic-prev').addEventListener('click', () => showPage(comicPage - 1));
  overlay.querySelector('.flappy-comic-next').addEventListener('click', () => showPage(comicPage + 1));
  overlay.querySelector('.flappy-comic-dots').addEventListener('click', (e) => {
    const b = e.target.closest('[data-page]');
    if (b) showPage(+b.dataset.page);
  });
  // Листать комикс свайпом; вертикальная прокрутка страницы — своя.
  const body = overlay.querySelector('.flappy-comic-body');
  body.addEventListener('pointerdown', (e) => { swipeX = [e.clientX, e.clientY]; });
  body.addEventListener('pointerup', (e) => {
    if (!swipeX) return;
    const dx = e.clientX - swipeX[0], dy = e.clientY - swipeX[1];
    swipeX = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) showPage(comicPage + (dx < 0 ? 1 : -1));
  });
  // Гигадетонатор — по нажатию (pointerdown: без задержки click), F на клавиатуре.
  overlay.querySelector('.flappy-giga').addEventListener('pointerdown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.button) return;  // правая/средняя кнопка мыши — не трата детонатора
    fireGiga();
  });
  overlay.addEventListener('pointerdown', (e) => {
    if (e.target.closest('button, .flappy-comic')) return;
    if (e.button) return;
    e.preventDefault();
    downPointers.add(e.pointerId);
    press();
  });
  const up = (e) => { downPointers.delete(e.pointerId); if (!downPointers.size && !keyHeld) release(); };
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', up);
  window.addEventListener('blur', () => { downPointers.clear(); keyHeld = false; release(); pause(); });
  overlay.addEventListener('contextmenu', (e) => e.preventDefault());
  // «Назад» (Esc, Telegram) сначала закрывает комикс, потом игру.
  overlay.addEventListener('flappy-close', () => (comicOpen ? closeComic() : closeFlappy()));
  const isKey = (e) => e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW' || e.code === 'Enter';
  document.addEventListener('keydown', (e) => {
    if (!isOpen()) return;
    if (comicOpen) {
      if (e.code === 'ArrowLeft') showPage(comicPage - 1);
      else if (e.code === 'ArrowRight') showPage(comicPage + 1);
      return;
    }
    // F без модификаторов: Ctrl/Cmd+F — поиск браузера, не детонатор.
    if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) { fireGiga(); return; }
    // Enter/пробел на кнопке игры (✕, «Ещё раз», 📖) — нажатие самой кнопки,
    // а не импульс (v=202).
    if ((e.code === 'Enter' || e.code === 'Space') && e.target.closest && e.target.closest('button')) return;
    if (isKey(e)) {
      e.preventDefault();
      if (e.repeat) return;
      keyHeld = true;
      press();
    }
  });
  document.addEventListener('keyup', (e) => {
    if (!isKey(e)) return;
    keyHeld = false;
    if (!downPointers.size) release();
  });
  window.addEventListener('resize', () => { if (isOpen()) { resize(); pause(); } });
  document.addEventListener('visibilitychange', () => { lastT = 0; release(); if (document.hidden) pause(); });
  // Telegram свернули (шторка, другое приложение) — Bot API 8.0.
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && typeof tg.onEvent === 'function') tg.onEvent('deactivated', pause);
  pauseEl = document.createElement('div');
  pauseEl.className = 'flappy-pause';
  pauseEl.hidden = true;
  pauseEl.innerHTML = '<div class="flappy-pause-title">Пауза</div><div class="flappy-pause-sub">Тапни, чтобы продолжить</div>';
  overlay.appendChild(pauseEl);
}

// Нажатие: в режиме корабля — держим (тяга вверх), иначе — обычный импульс.
function press() {
  // Снятие с паузы — только снятие: импульс вторым нажатием.
  if (paused) { resume(); return; }
  holding = true;
  if (state === 'play' && ship.gd > 0) return;
  onTap();
}
function pause() {
  if (!isOpen() || state !== 'play' || paused) return;
  paused = true;
  holding = false;
  pauseEl.hidden = false;
}
function resume() {
  paused = false;
  pauseEl.hidden = true;
  lastT = 0; acc = 0;
}
function release() { holding = false; }

/* ---------- Комикс «Типа Феном» ---------- */
function updateComicUi() {
  overlay.querySelectorAll('.flappy-comic-count').forEach(el => { el.textContent = `${unlocked}/${COMIC_PAGES}`; });
  const np = overlay.querySelector('.flappy-newpage');
  np.hidden = !newPage;
  if (newPage) np.textContent = `📖 Открыта страница ${newPage} комикса — загляни!`;
  overlay.querySelector('.flappy-comic-btn--panel').classList.toggle('is-new', !!newPage);
}
/* Класс comic-open на слое — для js/navigation.js (v=200): читалка считается
   отдельным уровнем «назад». Без этого «назад» при открытом комиксе съедал
   запись истории (закрывалась читалка, а глубина не менялась), и в браузере
   третий «назад» уводил с сайта. */
function openComic(n) {
  comicOpen = true;
  comicEl.hidden = false;
  overlay.classList.add('comic-open');
  showPage(n);
}
function closeComic() {
  comicOpen = false;
  comicEl.hidden = true;
  overlay.classList.remove('comic-open');
}
function showPage(n) {
  n = clamp(n, 1, COMIC_PAGES);
  comicPage = n;
  const img = comicEl.querySelector('.flappy-comic-img'), lock = comicEl.querySelector('.flappy-comic-lock');
  const open = n <= unlocked;
  img.hidden = !open;
  lock.hidden = open;
  if (open) {
    if (img.dataset.page !== String(n)) { img.src = comicSrc(n); img.dataset.page = n; img.alt = `Страница ${n}`; }
    if (n < unlocked) new Image().src = comicSrc(n + 1);    // следующая — заранее
  } else {
    lock.innerHTML = `<div class="flappy-comic-lock-icon">🔒</div><b>Страница ${n}</b>`
      + `<span>${n === unlocked + 1
        ? `Появится в полёте после ${PAGE_AT[n]} препятствий — подбери светящуюся страницу.`
        : `Сначала открой страницу ${n - 1}.`}</span>`;
  }
  comicEl.querySelector('.flappy-comic-body').scrollTop = 0;
  comicEl.querySelector('.flappy-comic-prev').disabled = n <= 1;
  comicEl.querySelector('.flappy-comic-next').disabled = n >= COMIC_PAGES;
  comicEl.querySelector('.flappy-comic-dots').innerHTML = Array.from({ length: COMIC_PAGES }, (_, i) =>
    `<button type="button" data-page="${i + 1}" class="${i + 1 === n ? 'is-active' : ''}${i + 1 > unlocked ? ' is-locked' : ''}"`
    + ` aria-label="Страница ${i + 1}">${i + 1 > unlocked ? '🔒' : i + 1}</button>`).join('');
  if (n === newPage) { newPage = 0; updateComicUi(); }
}
function unlockPage(n, x, y) {
  if (n <= unlocked) return;
  unlocked = n;
  saveComic(n);
  newPage = n;
  updateComicUi();
  sparkle(x, y, '255,215,106', 18);
  floatText(shipX() + 30, ship.y - 34, `📖 Страница ${n} комикса!`, '#ffd76a', 1.8);
  haptic('success');
}

function isOpen() { return overlay.classList.contains('open'); }

/* ---------- Рисунки кораблей: пути и градиенты один раз ---------- */
function makeArt() {
  const poly = (pts) => { const p = new Path2D(); pts.forEach(([x, y], i) => (i ? p.lineTo(x, y) : p.moveTo(x, y))); p.closePath(); return p; };
  // Феном (по арту): нос — клинок справа, посередине хребет с двумя кольцами, слева корма.
  const hull = new Path2D();
  hull.moveTo(-4, -9);
  hull.bezierCurveTo(4, -18, 22, -18, 34, -12);
  hull.bezierCurveTo(41, -9, 45, -5, 47, -2);
  hull.lineTo(59, -5);
  hull.bezierCurveTo(55, 0, 50, 5, 44, 7);
  hull.bezierCurveTo(34, 11, 10, 12, -2, 10);
  hull.lineTo(-4, 9);
  hull.closePath();
  const stern = poly([[-36, -12], [-39, -21], [-49, -21], [-51, -16], [-57, -16], [-57, -6], [-54, -6], [-54, 6],
    [-57, 6], [-57, 16], [-51, 16], [-48, 21], [-39, 21], [-36, 12]]);
  const neck = poly([[-40, -6], [-2, -7], [-2, 7], [-40, 6]]);
  // Грокс (по Spore): нос слева, сверху фиолетовая кабина и два лезвия, снизу
  // длинный сегментированный «бивень», сзади жёлтый двигатель.
  const gHull = new Path2D();
  gHull.moveTo(-60, -1);
  gHull.bezierCurveTo(-46, -9, -22, -14, 4, -14);
  gHull.bezierCurveTo(26, -14, 46, -12, 56, -6);
  gHull.lineTo(57, 5);
  gHull.bezierCurveTo(40, 8, 0, 8, -30, 5);
  gHull.bezierCurveTo(-44, 4, -54, 2, -60, -1);
  gHull.closePath();
  const gPod = new Path2D();
  gPod.moveTo(30, 5);
  gPod.bezierCurveTo(12, 20, -26, 27, -54, 22);
  gPod.quadraticCurveTo(-68, 19, -63, 9);
  gPod.bezierCurveTo(-46, 14, -12, 13, 24, -1);
  gPod.closePath();
  const gSeg = new Path2D();
  for (let s = 0.12; s < 0.9; s += 0.085) {
    const u = 1 - s;
    const x = u * u * 28 + 2 * u * s * -14 + s * s * -60, y = u * u * 3 + 2 * u * s * 25 + s * s * 15;
    const tx = 2 * u * (-42) + 2 * s * (-46), ty = 2 * u * 22 + 2 * s * (-10);
    const l = Math.hypot(tx, ty), nx = -ty / l * 4.2, ny = tx / l * 4.2;
    gSeg.moveTo(x - nx, y - ny); gSeg.lineTo(x + nx, y + ny);
  }
  const gCan = new Path2D();
  gCan.moveTo(-16, -12.5);
  gCan.bezierCurveTo(-12, -25, 8, -26, 15, -13.5);
  gCan.closePath();
  PATH = {
    hull, stern, neck, gHull, gPod, gSeg, gCan,
    gBlade1: poly([[6, -12], [46, -48], [36, -11]]),
    gBlade2: poly([[24, -11], [60, -37], [50, -8]]),
    gGun: poly([[-28, -4.5], [-68, -3.5], [-68, -0.5], [-28, 0.5]]),
  };
  const lin = (y0, y1, stops) => { const g = ctx.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
  GR = {
    hull: lin(-18, 12, [[0, '#e1e8ee'], [0.5, '#b4c0cb'], [1, '#7c8997']]),
    stern: lin(-21, 21, [[0, '#c8d1da'], [1, '#8794a2']]),
    gHull: lin(-14, 8, [[0, '#8c929b'], [0.55, '#4b5058'], [1, '#2a2e34']]),
    gCan: lin(-26, -12, [[0, '#b48cff'], [0.5, '#5a2d9a'], [1, '#2a1250']]),
  };
}

/* ---------- Спрайты, рисуются один раз ---------- */
let glowBase = null;
const glowCache = new Map();
function glowSprite(col) {
  let c = glowCache.get(col);
  if (c) return c;
  if (!glowBase) {
    glowBase = mk(96, 96);
    const g = glowBase.getContext('2d');
    const gr = g.createRadialGradient(48, 48, 0, 48, 48, 48);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.25, 'rgba(255,255,255,0.55)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.14)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 96, 96);
  }
  c = mk(96, 96);
  const g = c.getContext('2d');
  g.drawImage(glowBase, 0, 0);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = `rgb(${col})`;
  g.fillRect(0, 0, 96, 96);
  glowCache.set(col, c);
  return c;
}
// Аддитивное свечение (size — диаметр); уважает текущую прозрачность (мигание).
function glow(x, y, size, col, a) {
  const pa = ctx.globalAlpha, po = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = pa * a;
  ctx.drawImage(glowSprite(col), x - size / 2, y - size / 2, size, size);
  ctx.globalAlpha = pa;
  ctx.globalCompositeOperation = po;
}

// Фон сектора — облака туманностей низкого разрешения (растягиваются).
const nebCache = [];
function nebulaBg(pi) {
  if (nebCache[pi]) return nebCache[pi];
  const pal = PALETTES[pi];
  const c = mk(512, 256), g = c.getContext('2d');
  // облака целиком внутри спрайта, крайние по X — без обрезки: копии стыкуются без шва
  for (const [x, y, r, ci] of [[70, 90, 66, 0], [200, 160, 82, 1], [330, 84, 72, 0], [440, 168, 64, 2], [268, 120, 40, 2]]) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(${pal[ci]},0.2)`);
    gr.addColorStop(0.5, `rgba(${pal[ci]},0.08)`);
    gr.addColorStop(1, `rgba(${pal[ci]},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 512, 256);
  }
  return (nebCache[pi] = c);
}
// Далёкая спиральная галактика (в центре Галактики — огромное ядро).
const galCache = [];
function galaxySprite(pi) {
  if (galCache[pi]) return galCache[pi];
  const pal = PALETTES[pi];
  const c = mk(256, 256), g = c.getContext('2d');
  const core = g.createRadialGradient(128, 128, 0, 128, 128, 64);
  core.addColorStop(0, 'rgba(255,250,235,0.9)');
  core.addColorStop(0.25, `rgba(${pal[2]},0.45)`);
  core.addColorStop(1, `rgba(${pal[0]},0)`);
  g.fillStyle = core;
  g.fillRect(0, 0, 256, 256);
  for (let arm = 0; arm < 2; arm++) {
    for (let t = 0.4; t < 9.2; t += 0.035) {
      const r = 6 * Math.exp(0.31 * t) + rand(-4, 4), th = t + arm * Math.PI + rand(-0.12, 0.12);
      const x = 128 + r * Math.cos(th), y = 128 + r * Math.sin(th) * 0.5;
      if (x < 2 || x > 254 || y < 2 || y > 254) continue;
      g.fillStyle = Math.random() < 0.3 ? 'rgba(255,255,255,0.7)' : `rgba(${pick(pal)},${rand(0.25, 0.6).toFixed(2)})`;
      const s = rand(1, 2.4);
      g.fillRect(x, y, s, s);
    }
  }
  return (galCache[pi] = c);
}

function resize() {
  const w = overlay.clientWidth, h = overlay.clientHeight;
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  scale = h / H;
  W = w / scale;
  if (!stars) {
    stars = [];
    for (let i = 0; i < 120; i++) {
      const layer = i % 3;
      stars.push({ x: Math.random(), y: Math.random() * H, r: 0.6 + layer * 0.5, k: 0.15 + layer * 0.25,
        col: `rgba(220,235,255,${(0.35 + layer * 0.25).toFixed(2)})` });
    }
  }
}

/* ---------- Состояние забега ---------- */
function shipX() { return Math.min(W * 0.28, 170); }
function shipAngle() { return clamp(ship.vy / 1100, -0.32, 0.55); }
const inGrox = () => sector > JUMPS_TO_GROX;
const speed = () => 170 + Math.min(progress, 40) * 1.6;
const gapSize = () => 240 - Math.min(made, 40) * 1.5;
const spacing = () => 250 - Math.min(made, 40) * 2;

function reset() {
  ship = { y: H * 0.45, vy: 0, boost: 0, alive: true, shield: false, invuln: 0, ring: 0, gd: 0, giga: 0,
    spd: 1, grav: 0, ghost: 0, wpn: null };
  encounters = []; groxes = []; bolts = []; pickups = []; particles = []; texts = []; shots = [];
  lastWpnAt = -4;
  score = 0; made = 0; progress = 0;
  lastGapY = H * 0.45; lastKinds = []; lastWallStyle = ''; lastShieldAt = 0; lastGdAt = -6;
  holding = false; slowmo = 0; pageOfferAt = 0; newPage = 0;
  bgMarks = []; nextMarkAt = bgScroll + 900;
  beam = null;
  syncGiga();
  closeComic();
  updateComicUi();
  sector = 0; route = shuffle(SYSTEMS.slice()); palShift = Math.floor(Math.random() * 4);
  paletteIdx = 0; prevPaletteIdx = 0; paletteFade = 1; warp = 0;
  far = makeFar(0); prevFar = null;
  shake = 0; flash = 0;
  state = 'ready';
  // Маршрут сразу виден на заставке (на широком экране — первые ворота, правее текста).
  cursor = Math.max(shipX() + 430, W * 0.72);
  while (cursor < W + 160) spawnEncounter();
  scoreEl.textContent = '0';
  scoreEl.hidden = true;
  panelEl.hidden = true;
  startEl.hidden = false;
  sectorEl.classList.remove('show');
  bestStartEl.textContent = best > 0 ? `Рекорд: ${best}` : '';
}

function onTap() {
  if (state === 'ready') {
    state = 'play';
    startEl.hidden = true;
    scoreEl.hidden = false;
    showBanner('Курс', GROX_HOME);
    syncGiga();
    flap();
    return;
  }
  if (state === 'play') { flap(); return; }
  if (state === 'dead' && performance.now() - deadAt > 650) { reset(); onTap(); }
}

/* ---------- Гигадетонатор ---------- */
function syncGiga() {
  const b = overlay.querySelector('.flappy-giga');
  b.hidden = !(state === 'play' && ship.giga > 0);
  b.querySelector('.flappy-giga-count').textContent = ship.giga > 1 ? `×${ship.giga}` : '';
}
function giveGiga() {
  ship.giga = Math.min(GIGA_MAX, ship.giga + 1);
  syncGiga();
  // надпись — прямо над появившейся кнопкой (заодно видно, куда жать)
  const r = overlay.querySelector('.flappy-giga').getBoundingClientRect();
  const x = (r.left + r.width / 2) / scale, y = r.top / scale - 10;
  floatText(x, y - 18, 'Гигадетонатор!', '#d9c2ff', 2);
  if (!gigaHintShown) { gigaHintShown = true; floatText(x, y, 'жми сюда (или F)', '#e9dcff', 2.4); }
}
// Выстрел: луч из носа, волна во всю высоту катится вправо и сносит всё, что прошла.
function fireGiga() {
  if (state !== 'play' || ship.giga <= 0 || beam) return;
  ship.giga--;
  syncGiga();
  beam = { t: 0, front: shipX() + 34, y: ship.y };
  flash = Math.max(flash, 0.6);
  if (!reduceMotion) shake = Math.max(shake, 0.9);
  haptic('heavy');
  const nx = shipX() + 34;
  particles.push({ k: 6, x: nx, y: ship.y, vx: 0, vy: 0, t: 0, life: 0.6, r: 12, r2: 90, rot: rand(0, TAU) });
  particles.push({ k: 1, x: nx, y: ship.y, vx: 0, vy: 0, t: 0, life: 0.5, r: 16, c: '230,215,255', grow: 2.5 });
  floatText(shipX() + 40, Math.max(ship.y - 40, 40), 'ГИГАДЕТОНАТОР!', '#ffffff', 1.4);
}
function updateBeam(dt) {
  if (!beam) return;
  beam.t += dt;
  beam.y = ship.y;
  beam.front += BEAM_SPEED * dt;
  const sx = shipX(), f = Math.min(beam.front, W + 60);
  let n = 0;
  for (const e of encounters) {
    if (e.gone || e.kind === 'grox' || e.x > f || e.x + e.w < sx - 10) continue;
    n += smash(e);
  }
  for (const g of groxes) {
    if (g.dead || g.phase === 'warn' || g.phase === 'gone' || g.x > f || g.x < sx - 30) continue;
    g.dead = true;
    explode(g.x, g.y, ['#8c929b', '#4b5058', '#b48cff', '#ffb347', '#ffd27a'], 26);
    n++;
  }
  for (const b of bolts) if (b.x < f && b.x > sx) b.dead = true;
  if (n) addScore(n);
  // искры вдоль луча
  if (Math.random() < 0.7) {
    particles.push({ k: 1, x: rand(sx + 40, f), y: beam.y + rand(-14, 14), vx: rand(200, 500), vy: rand(-30, 30), t: 0, life: 0.3, r: rand(1.5, 3), c: pick(['230,215,255', '180,140,255', '255,255,255']) });
  }
  if (beam.t > BEAM_TIME) beam = null;
}
// Снести встречу лучом; сколько очков за неё (планета даёт +3 сама).
function smash(e) {
  if (e.kind === 'planet' || e.kind === 'nebula') {
    if (e.p.dead) return 0;
    blowPlanet(e, true);
    return 0;
  }
  if (e.kind === 'field') {
    if (!e.rocks.length) return 0;
    for (const k of e.rocks) {
      const x = e.x + k.x, y = k.y;
      for (let i = 0; i < 5; i++) {
        const a = rand(0, TAU), v = rand(60, 220);
        particles.push({ k: 0, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rand(0.5, 1), r: rand(2, 4), c: pick(k.sh), dr: 0.98, wd: true });
      }
      particles.push({ k: 1, x, y, vx: 0, vy: 0, t: 0, life: 0.4, r: k.r * 0.4, c: '255,190,120', grow: 1.5, wd: true });
    }
    e.rocks = [];
    e.shapes = [];
    floatText(clamp(e.x + e.w / 2, 60, W - 60), H / 2, 'Пояс астероидов — в пыль!', '#d9c2ff', 1.4);
    return 2;
  }
  e.gone = true;
  e.shapes = [];
  const cx = e.x + e.w / 2;
  if (e.kind === 'hole') {
    particles.push({ k: 3, x: e.x + e.hx, y: e.hy, vx: 0, vy: 0, t: 0, life: 0.7, r: 120, r2: 4, c: '255,170,90', wd: true });
    explode(e.x + e.hx, e.hy, ['#ffd27a', '#ff9b5e', '#ffffff'], 30, '255,200,140');
    floatText(clamp(e.x + e.hx, 70, W - 70), e.hy - 30, 'Дыра схлопнулась!', '#ffd27a', 1.4);
    return 2;
  }
  // ворота: обе колонны рассыпаются по всей высоте
  const cols = e.style === 'laser' ? ['#ff4d6d', '#ffd0da', '#3a3f55'] : e.style === 'girder' ? ['#5a6380', '#e0b12f', '#343b4c']
    : e.style === 'crystal' ? [e.col.b, e.col.c, e.col.a] : ['#8a7d72', '#94806a', '#3b332e'];
  const dy = eDy(e);
  for (let y = 20; y < H; y += 46) {
    if (y > e.top + dy - 6 && y < e.bot + dy + 6) continue;
    for (let i = 0; i < 4; i++) {
      const a = rand(0, TAU), v = rand(60, 260);
      particles.push({ k: 0, x: cx + rand(-14, 14), y, vx: Math.cos(a) * v + 80, vy: Math.sin(a) * v, t: 0, life: rand(0.5, 1.1), r: rand(2, 4.5), c: pick(cols), dr: 0.98, wd: true });
    }
    particles.push({ k: 2, x: cx, y, vx: rand(40, 160), vy: rand(-80, 80), t: 0, life: rand(0.8, 1.4), r: rand(3, 6), c: pick(cols), rot: rand(0, TAU), vr: rand(-8, 8), dr: 0.99, wd: true });
  }
  return 1;
}

function flap() {
  ship.vy = FLAP_VY;
  ship.boost = 1;
  const a = shipAngle(), x = shipX() + Math.cos(a) * -56 * SHIP_S, y = ship.y + Math.sin(a) * -56 * SHIP_S;
  for (let i = 0; i < 6; i++) {
    particles.push({ k: 1, x, y: y + rand(-3, 3), vx: -rand(90, 170), vy: rand(-45, 45), t: 0, life: rand(0.2, 0.35), r: rand(2, 3.4), c: '170,255,250' });
  }
}

function addScore(n) {
  score += n;
  scoreEl.textContent = score;
  scoreEl.classList.remove('bump');
  void scoreEl.offsetWidth;
  scoreEl.classList.add('bump');
}
function floatText(x, y, s, c, life = 1.1) { texts.push({ x, y, s, c, t: 0, life }); }
function showBanner(kicker, name) {
  sectorEl.querySelector('.flappy-sector-kicker').textContent = kicker;
  sectorEl.querySelector('.flappy-sector-name').textContent = name;
  sectorEl.classList.remove('show');
  void sectorEl.offsetWidth;
  sectorEl.classList.add('show');
}

/* ---------- Маршрут: какие встречи и где ---------- */
function chooseKind(i) {
  if (i === 0) return 'wall';
  if (i === 1) return 'planet';
  const last = lastKinds[lastKinds.length - 1], last2 = lastKinds[lastKinds.length - 2];
  const weights = [
    ['wall', 34],
    ['planet', 20],
    ['nebula', 12],
    ['field', i >= 3 ? 14 : 0],
    ['grox', i >= 3 ? (inGrox() ? 24 : 10) : 0],
    ['hole', i >= 7 ? 7 : 0],
  ];
  const sum = weights.reduce((s, [, w]) => s + w, 0);
  for (let tries = 0; tries < 8; tries++) {
    let r = Math.random() * sum, kind = 'wall';
    for (const [k, w] of weights) { if ((r -= w) < 0) { kind = k; break; } }
    if (kind === last && kind !== 'wall') continue;
    if (kind === 'wall' && last === 'wall' && last2 === 'wall') continue;
    return kind;
  }
  return 'wall';
}

function spawnEncounter() {
  const i = made++;
  const kind = chooseKind(i);
  const x = cursor;
  const e = kind === 'wall' ? makeWall(x, i)
    : kind === 'planet' ? makePlanet(x, i)
    : kind === 'nebula' ? makeNebula(x)
    : kind === 'field' ? makeField(x)
    : kind === 'hole' ? makeHole(x)
    : makeGroxSlot(x);
  e.kind = kind;
  e.x = x;
  e.scored = false;
  e.seed = Math.random() * 100;
  encounters.push(e);
  lastKinds.push(kind);
  if (lastKinds.length > 3) lastKinds.shift();
  cursor = x + e.w + spacing() + (e.extra || 0);
  // Щит — примерно раз в 9 встреч, в безопасном месте (центр прохода).
  let sx = 0;
  if (i >= 4 && i - lastShieldAt >= 9 && !ship.shield && e.safe) {
    addSpecial('s', x + e.safe[0], e.safe[1], e.drift ? e : null);
    lastShieldAt = i;
    sx = 46;
  }
  // Страница комикса — только следующая неоткрытая; не подобрал — снова через 6 встреч.
  const np = unlocked + 1;
  if (np <= COMIC_PAGES && i >= PAGE_AT[np] && i >= pageOfferAt && e.safe && kind !== 'grox' && !pickups.some(p => p.k === 'p')) {
    addSpecial('p', x + e.safe[0] + sx, e.safe[1], e.drift ? e : null).page = np;
    pageOfferAt = i + 6;
  }
  // Портал режима корабля — в свободном месте перед встречей, на высоте её прохода
  // (лучше всего — перед астероидным полем: по коридору так и летают).
  let portal = false;
  if (i >= 6 && i - lastGdAt >= 12 && kind !== 'grox' && e.safe && (kind === 'field' || Math.random() < 0.35)) {
    addSpecial('g', x - spacing() * 0.5, e.entry ?? e.safe[1]);
    lastGdAt = i;
    portal = true;
  }
  // Оружие — редко: не раньше 8-й встречи, не чаще раза в 11, примерно в
  // трети подходящих мест. Перед гроксами тоже можно — как раз пригодится.
  if (!portal && i >= 8 && i - lastWpnAt >= 11 && !ship.wpn && Math.random() < 0.34) {
    const y = kind === 'grox' ? clamp(lastGapY, 120, H - 120) : (e.entry ?? (e.safe ? e.safe[1] : null));
    if (y != null) {
      addSpecial('w', x - spacing() * 0.4, y);
      lastWpnAt = i;
    }
  }
}

function addPickup(k, x, y, e = null) { const p = { k, x, y, e, ph: rand(0, TAU), got: false }; pickups.push(p); return p; }
// Особый бонус встаёт на место — кристалл, если лежал там же, убирается.
function addSpecial(k, x, y, e = null) {
  pickups = pickups.filter(p => p.k !== 'c' || (p.x - x) ** 2 + (p.y - y) ** 2 > 30 * 30);
  return addPickup(k, x, y, e);
}
function eDy(e) { return e.drift ? e.drift.a * Math.sin(time * e.drift.f + e.drift.p) : 0; }

// Ворота: стена с проходом. Фигуры столкновений — относительно e.x, y — абсолютные.
function makeWall(x, i) {
  const G = gapSize();
  let gy = rand(80 + G / 2, H - 80 - G / 2);
  gy = clamp(gy, lastGapY - 200, lastGapY + 200);
  lastGapY = gy;
  const top = gy - G / 2, bot = gy + G / 2;
  let style = i === 0 ? 'laser' : pick(WALLS);
  if (i > 0 && style === lastWallStyle) style = pick(WALLS.filter(s => s !== lastWallStyle));
  lastWallStyle = style;
  const e = { style, top, bot, cause: style === 'rocks' ? 'rock' : style };
  let w;
  if (style === 'laser') {
    w = 34; const c = w / 2;
    e.shapes = [[1, c - 8, -300, c + 8, top - 14], [1, c - 17, top - 16, c + 17, top],
      [1, c - 8, bot + 14, c + 8, H + 300], [1, c - 17, bot, c + 17, bot + 16]];
  } else if (style === 'girder') {
    w = 54; const c = w / 2;
    e.shapes = [[1, c - 21, -300, c + 21, top - 12], [1, c - 27, top - 12, c + 27, top],
      [1, c - 21, bot + 12, c + 21, H + 300], [1, c - 27, bot, c + 27, bot + 12]];
  } else if (style === 'crystal') {
    w = 64; const c = w / 2;
    e.col = pick(CRYSTALS);
    e.shards = makeShards(top, bot);
    e.shapes = [[1, c - 15, -300, c + 15, top - 4], [1, c - 15, bot + 4, c + 15, H + 300]];
  } else {
    e.rocks = stackRocks(top, bot);
    w = 2 * Math.max(...e.rocks.map(k => Math.abs(k.x) + k.r));
    e.shapes = e.rocks.map(k => [0, w / 2 + k.x, k.y, k.r * 0.86]);
  }
  e.w = w;
  if (i >= 12 && Math.random() < 0.35) e.drift = { a: rand(28, 48), f: rand(0.9, 1.5), p: rand(0, TAU) };
  e.safe = [w / 2, gy];
  if (Math.random() < 0.35) addPickup('c', x + w / 2, gy, e.drift ? e : null);
  return e;
}
function makeRock(x, y, r) {
  const pts = [];
  for (let i = 0; i < 9; i++) pts.push(rand(0.78, 1.08));
  return { x, y, r, pts, rot: rand(0, TAU), vr: rand(-0.6, 0.6), sh: pick(ROCKS), grad: null,
    cr: [0, 1].map(() => [rand(-0.4, 0.4), rand(-0.4, 0.4), rand(0.12, 0.22)]) };
}
function stackRocks(top, bot) {
  const rocks = [];
  for (const [edge, dir] of [[top, -1], [bot, 1]]) {
    let y = edge, first = true;
    while (dir < 0 ? y > -140 : y < H + 140) {
      const r = first ? rand(22, 28) : rand(22, 34);
      const cy = y + dir * r;
      rocks.push(makeRock(rand(-9, 9), cy, r));
      y = cy + dir * r * 0.82;      // слегка внахлёст
      first = false;
    }
  }
  return rocks;
}
function makeShards(top, bot) {
  const s = [];
  for (const [edge, dir] of [[top, 1], [bot, -1]]) {    // растут от края экрана к проходу
    const base = dir > 0 ? -130 : H + 130, len = Math.abs(edge - base);
    for (const k of [-1, 1]) {
      const l = len - Math.min(rand(60, 140), (len - 130) * 0.6);   // боковые короче, но видны и у короткой колонны
      if (l > 40) s.push({ base, dx: k * rand(13, 18), len: l, w: rand(15, 21), lean: k * rand(0.03, 0.08), dir });
    }
    s.push({ base, dx: 0, len, w: 30, lean: 0, dir, main: true });
  }
  return s;
}

// Планета: облететь сверху или снизу. Бывает гигантом у края, с лунами, звездой.
function planetBody(r, ring, bands) {
  const [light, dark, atm] = pick(PLANETS);
  return { kind: 'planet', r, light, dark, atm, ring, bands, tilt: rand(-0.22, 0.22), grad: null,
    craters: bands ? null : [0, 1, 2].map(() => [rand(-0.5, 0.45), rand(-0.5, 0.45), rand(0.1, 0.2)]) };
}
function makePlanet(x, i) {
  const roll = Math.random();
  let p, cy, ext;
  if (i >= 4 && roll < 0.16) {
    const r = rand(28, 40);
    p = { kind: 'star', r, ph: rand(0, TAU), grad: null,
      flares: [0, 1, 2].map(() => ({ a: rand(0, TAU), w: rand(-0.4, 0.4), s: rand(16, 26) })) };
    cy = rand(r + 110, H - r - 110);
    ext = r * 1.6;
  } else if (roll < 0.42) {
    const r = rand(110, 150);
    p = planetBody(r, Math.random() < 0.35, true);
    cy = Math.random() < 0.5 ? -r * 0.35 : H + r * 0.35;
    ext = p.ring ? r * 1.6 : r;
  } else {
    const r = rand(40, 66);
    p = planetBody(r, Math.random() < 0.35, Math.random() < 0.5);
    cy = rand(r + 40, H - r - 40);
    ext = p.ring ? r * 1.6 : r;
    if (i >= 5 && Math.random() < 0.55) {
      const n = i >= 14 && Math.random() < 0.4 ? 2 : 1, R = r + rand(34, 44), dir = Math.random() < 0.5 ? -1 : 1;
      p.moons = [];
      for (let k = 0; k < n; k++) {
        p.moons.push({ R: R + k * 26, r: rand(8, 12), w: dir * rand(0.6, 0.9) * (k ? 0.75 : 1), ph: rand(0, TAU), col: pick(MOONS) });
      }
      ext = Math.max(ext, p.moons[n - 1].R + 12);
    }
  }
  const w = ext * 2, pcx = w / 2;
  const e = { p, pcx, pcy: cy, w, cause: p.kind === 'star' ? 'star' : 'planet',
    shapes: [[0, pcx, cy, p.r * (p.kind === 'star' ? 0.9 : 0.95)]] };
  const upper = cy - p.r > H - cy - p.r;     // сверху просторнее?
  const mid = upper ? (cy - p.r) / 2 : (cy + p.r + H) / 2;
  e.safe = [pcx, mid];
  lastGapY = mid;
  if (Math.random() < 0.55) addPickup('c', x + pcx, upper ? cy - p.r - 30 : cy + p.r + 30);   // у самой поверхности — риск
  return e;
}
function makeNebula(x) {
  const w = 480, pal = PALETTES[paletteIdx];
  const puffs = [];
  for (let k = 0; k < 7; k++) puffs.push({ dx: rand(70, w - 70), dy: rand(140, H - 140), s: rand(220, 360), col: pick(pal), a: rand(0.3, 0.46) });
  const r = rand(36, 56), pcx = w / 2 + rand(-60, 60), pcy = rand(r + 80, H - r - 80);
  const p = planetBody(r, Math.random() < 0.4, Math.random() < 0.5);
  const e = { p, pcx, pcy, w, puffs, cause: 'planet', shapes: [[0, pcx, pcy, r * 0.95]], lt: rand(0.6, 2), bolt: null };
  const spots = [];
  for (let t = 0; t < 40 && spots.length < 4; t++) {
    const cx = rand(50, w - 50), cy = rand(90, H - 90);
    if ((cx - pcx) ** 2 + (cy - pcy) ** 2 < (r + 50) ** 2) continue;
    if (spots.some(([sx, sy]) => (sx - cx) ** 2 + (sy - cy) ** 2 < 70 * 70)) continue;
    spots.push([cx, cy]);
    addPickup('c', x + cx, cy);
  }
  const upper = pcy - r > H - pcy - r;
  e.safe = [pcx, upper ? (pcy - r) / 2 : (pcy + r + H) / 2];
  lastGapY = e.safe[1];
  return e;
}
// Астероидное поле: сначала извилистый коридор, потом камни везде, кроме него.
function makeField(x) {
  const L = rand(400, 540), hw = Math.max(66, 84 - made * 0.5);
  const n = Math.max(2, Math.round(L / 150));
  const pts = [clamp(lastGapY + rand(-70, 70), 120, H - 120)];
  for (let k = 1; k <= n; k++) pts.push(clamp(pts[k - 1] + rand(-90, 90), 120, H - 120));
  const center = (px) => {
    const f = clamp(px / L, 0, 1) * n, k = Math.min(n - 1, Math.floor(f)), t = f - k;
    return pts[k] + (pts[k + 1] - pts[k]) * (1 - Math.cos(t * Math.PI)) / 2;
  };
  const rocks = [];
  for (let t = 0; t < 400 && rocks.length < 38; t++) {
    const r = rand(10, 28), rx = rand(r, L - r), ry = rand(-15, H + 15);
    let ok = true;
    for (const sx of [rx - r, rx, rx + r]) if (Math.abs(ry - center(sx)) < hw + r) { ok = false; break; }
    if (ok) for (const o of rocks) if ((o.x - rx) ** 2 + (o.y - ry) ** 2 < (o.r + r + 6) ** 2) { ok = false; break; }
    if (ok) rocks.push(makeRock(rx, ry, r));
  }
  for (const f of [0.22, 0.5, 0.78]) addPickup('c', x + L * f, center(L * f));
  lastGapY = pts[n];
  return { w: L, rocks, entry: pts[0], cause: 'rock', shapes: rocks.map(k => [0, k.x, k.y, k.r * 0.86]), extra: 30, safe: [L * 0.5, center(L * 0.5)] };
}
// Чёрная дыра у верхнего или нижнего края: притягивает (виден пунктир зоны).
function makeHole(x) {
  const w = 260, hx = w / 2, upper = Math.random() < 0.5, hy = upper ? H * 0.22 : H * 0.78, away = upper ? 1 : -1;
  addPickup('c', x + hx - 34, hy + away * 70);
  addPickup('c', x + hx + 34, hy + away * 70);
  lastGapY = hy + away * 200;
  return { hx, hy, w, R: 240, feed: 0, cause: 'hole', shapes: [[0, hx, hy, 15]], safe: [hx, hy + away * 200] };
}
// Окно для гроксов: пустое место, грокс вылетает, когда окно доходит до края.
function makeGroxSlot(x) {
  if (Math.random() < 0.5) { const y = rand(140, H - 140); addPickup('c', x + 250, y); addPickup('c', x + 290, y); }
  return { w: 560, cause: '', shapes: null, fired: false, second: 0, firstG: null, safe: [280, H / 2] };
}

/* ---------- Гроксы ---------- */
function spawnGrox(other) {
  let y = clamp(ship.y + rand(-50, 50), 70, H - 70);
  if (other) {
    y = other.y > H / 2 ? other.y - rand(150, 220) : other.y + rand(150, 220);
    if (y < 70 || y > H - 70) return null;
  }
  const sx = shipX();
  const hoverX = Math.min(clamp(Math.max(W * 0.7, sx + 165), sx + 120, W - 34) + (other ? 36 : 0), W - 26);
  const g = { x: W + 90, y, phase: 'warn', t: GROX_WARN, hoverX, shots: 0, maxShots: made >= 18 || inGrox() ? 2 : 1,
    tilt: 0, ph: rand(0, TAU), dodged: false, dead: false, trail: 0 };
  groxes.push(g);
  haptic('rigid');
  return g;
}
function tickGroxSlot(e, dt) {
  if (!e.fired && e.x < W + 20) {
    e.fired = true;
    e.firstG = spawnGrox(null);
    if (made >= 12 && Math.random() < (inGrox() ? 0.7 : 0.35)) e.second = 1.4;
  }
  if (e.second > 0) {
    e.second -= dt;
    if (e.second <= 0 && e.firstG) spawnGrox(e.firstG);
  }
}
function updateGrox(g, dt, v) {
  g.ph += dt;
  const alive = state === 'play', y0 = g.y;
  if (!alive && g.phase !== 'warn' && g.phase !== 'rush') { g.phase = 'rush'; g.t = 0; }
  switch (g.phase) {
    case 'warn':
      g.t -= dt;
      if (alive) g.y = approach(g.y, ship.y, 50 * dt);
      if (g.t <= 0) g.phase = alive ? 'enter' : 'gone';
      break;
    case 'enter':     // влетает и зависает справа — летит вровень с Феномом
      g.x = Math.max(g.hoverX, g.x - Math.max(90, (g.x - g.hoverX) * 5) * dt);
      g.y = approach(g.y, ship.y, 60 * dt);
      if (g.x <= g.hoverX + 0.5) { g.phase = 'aim'; g.t = 0.4; }
      break;
    case 'aim':
      g.t -= dt;
      g.y = approach(g.y, ship.y, 70 * dt);
      if (g.t <= 0) { g.phase = 'charge'; g.t = GROX_CHARGE; }
      break;
    case 'charge':    // линия прицела; по ней и полетит заряд
      g.t -= dt;
      if (g.t <= 0) fireBolt(g);
      break;
    case 'rush':      // таран по своей линии
      if (g.t > 0) { g.t -= dt; break; }
      g.x -= (v + GROX_REL + 70) * dt;
      break;
  }
  g.y = clamp(g.y, 50, H - 50);
  g.tilt += (clamp((g.y - y0) / dt / 300, -0.18, 0.18) - g.tilt) * Math.min(1, dt * 8);
  if (g.phase !== 'warn' && g.phase !== 'gone') {
    g.trail += dt;
    while (g.trail > 1 / 40) {
      g.trail -= 1 / 40;
      particles.push({ k: 1, x: g.x + 64 * GROX_S, y: g.y - 0.5 * GROX_S, vx: (g.phase === 'rush' && !(g.t > 0) ? -(v + GROX_REL + 70) : 0) + rand(40, 90),
        vy: rand(-10, 10), t: 0, life: rand(0.2, 0.35), r: rand(1.8, 2.6), c: '255,150,60' });
    }
  }
  if (alive && !g.dodged && g.phase === 'rush' && g.x + 70 * GROX_S < shipX() - 40) {
    g.dodged = true;
    addScore(1);
    floatText(shipX() + 20, ship.y - 34, 'Увернулся! +1', '#ffc070');
  }
  if (g.phase === 'gone' || g.x < -160) g.dead = true;
}
function fireBolt(g) {
  const bx = g.x - 66 * GROX_S, by = g.y - 2 * GROX_S;
  bolts.push({ x: bx, y: by, vx: -BOLT_SPEED, dead: false });
  particles.push({ k: 1, x: bx, y: by, vx: 0, vy: 0, t: 0, life: 0.25, r: 9, c: '255,80,110', grow: 1.5 });
  for (let i = 0; i < 6; i++) particles.push({ k: 0, x: bx, y: by, vx: -rand(60, 200), vy: rand(-80, 80), t: 0, life: rand(0.2, 0.4), r: rand(1.5, 2.5), c: '#ff8fa8' });
  g.shots++;
  if (g.shots < g.maxShots) { g.phase = 'aim'; g.t = 0.35; } else { g.phase = 'rush'; g.t = 0.3; }
}

/* ---------- Эффекты ---------- */
function explode(x, y, cols, n = 40, glowCol = '255,170,80') {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(60, 380);
    particles.push({ k: 0, x: x + rand(-12, 12), y: y + rand(-6, 6), vx: Math.cos(a) * v - 40, vy: Math.sin(a) * v,
      t: 0, life: rand(0.6, 1.3), r: rand(1.5, 4.5), c: pick(cols), dr: 0.985 });
  }
  for (let i = 0; i < 12; i++) {
    const a = rand(0, TAU), v = rand(40, 200);
    particles.push({ k: 2, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 60, t: 0, life: rand(0.9, 1.6), r: rand(2.5, 5),
      c: pick(cols), rot: rand(0, TAU), vr: rand(-9, 9), g: 260 });
  }
  particles.push({ k: 1, x, y, vx: 0, vy: 0, t: 0, life: 0.5, r: 18, c: glowCol, grow: 2 });
  particles.push({ k: 3, x, y, vx: 0, vy: 0, t: 0, life: 0.55, r: 8, r2: 90, c: glowCol });
}
function sparkle(x, y, col, n = 10) {
  for (let i = 0; i < n; i++) {
    const a = rand(0, TAU), v = rand(40, 150);
    particles.push({ k: 1, x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t: 0, life: rand(0.3, 0.55), r: rand(1.4, 2.4), c: col, dr: 0.97 });
  }
  particles.push({ k: 3, x, y, vx: 0, vy: 0, t: 0, life: 0.4, r: 4, r2: 30, c: col });
}
function emitTrail(dt, bgV) {
  if (!ship.alive) return;
  // Разгон режима корабля виден по «линиям скорости» навстречу.
  if (ship.spd > 1.04 && !reduceMotion && Math.random() < dt * 40 * (ship.spd - 1)) {
    particles.push({ k: 7, x: W + 10, y: rand(20, H - 20), vx: -bgV * rand(2.2, 3.2), vy: 0, t: 0, life: 0.6, len: rand(40, 90) });
  }
  trailAcc += dt;
  const a = shipAngle(), c = Math.cos(a), s = Math.sin(a), gd = ship.gd > 0;
  const rate = gd ? 1 / 80 : 1 / 50;
  while (trailAcc > rate) {
    trailAcc -= rate;
    const lx = -58 * SHIP_S, ly = rand(-3, 3) * SHIP_S;
    particles.push({ k: 1, x: shipX() + lx * c - ly * s, y: ship.y + lx * s + ly * c, vx: -bgV - rand(20, 50), vy: rand(-8, 8),
      t: 0, life: rand(0.25, 0.45) * (gd ? 1.5 : 1), r: rand(2, 3.2) * (1 + ship.boost * 0.6), c: gd ? pick(['255,90,200', '255,170,235']) : '95,243,238' });
  }
}
function feedHole(e, dt) {
  e.feed -= dt;
  while (e.feed <= 0) {
    e.feed += 0.035;
    particles.push({ k: 4, e, ang: rand(0, TAU), d: rand(70, 150), w: rand(1.6, 2.4), vr: rand(20, 40), t: 0, life: 8,
      r: rand(1.2, 2.4), c: pick(['255,190,110', '255,230,170', '255,140,70']) });
  }
}
function tickNebula(e, dt) {
  if (e.bolt) { e.bolt.t -= dt; if (e.bolt.t <= 0) e.bolt = null; }
  e.lt -= dt;
  if (e.lt > 0) return;
  e.lt = rand(1.1, 2.8);
  const p = pick(e.puffs), pts = [];
  let x = p.dx - 60, y = p.dy - 50;
  for (let s = 0; s < 7; s++) { pts.push([x, y]); x += rand(10, 24); y += rand(4, 22) * (Math.random() < 0.5 ? 1 : -0.4); }
  e.bolt = { pts, t: 0.2 };
}
function updateParticles(dt, v) {
  for (const p of particles) {
    p.t += dt;
    if (p.k === 4) {
      p.ang += dt * p.w * Math.sqrt(80 / Math.max(p.d, 16));
      p.d -= dt * p.vr * (80 / Math.max(p.d, 25));
      continue;
    }
    if (p.wd) p.x -= v * dt;          // обломки взорванного остаются «в мире» и уезжают вместе с ним
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.g) p.vy += p.g * dt;
    if (p.dr) { p.vx *= p.dr; p.vy *= p.dr; }
    if (p.vr && p.k === 2) p.rot += p.vr * dt;
  }
  particles = particles.filter(p => p.t < p.life && !(p.k === 4 && p.d < 15));
  if (particles.length > 600) particles.splice(0, particles.length - 600);
}

/* ---------- Столкновения ---------- */
function shipCircles() {
  const sx = shipX(), a = shipAngle(), c = Math.cos(a), s = Math.sin(a);
  return SHIP_HIT.map(([x, y, r]) => {
    x *= SHIP_S; y *= SHIP_S;
    return [sx + x * c - y * s, ship.y + x * s + y * c, r * SHIP_S];
  });
}
function circleRect(cx, cy, r, x1, y1, x2, y2) {
  const nx = clamp(cx, x1, x2), ny = clamp(cy, y1, y2);
  return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
}
// Номер фигуры, в которую врезались (−1 — мимо): у камней он же номер камня.
function hitShapes(circles, shapes, ox, oy) {
  for (let i = 0; i < shapes.length; i++) {
    const sh = shapes[i];
    if (sh[0] === 0) {
      const cx = ox + sh[1], cy = oy + sh[2];
      for (const [x, y, r] of circles) if ((x - cx) ** 2 + (y - cy) ** 2 < (sh[3] + r) ** 2) return i;
    } else {
      for (const [x, y, r] of circles) if (circleRect(x, y, r, ox + sh[1], oy + sh[2], ox + sh[3], oy + sh[4])) return i;
    }
  }
  return -1;
}
function moonPos(e, m) { const a = m.ph + time * m.w; return [e.x + e.pcx + Math.cos(a) * m.R, e.pcy + Math.sin(a) * m.R]; }
function encounterHit(e, circles) {
  const idx = hitShapes(circles, e.shapes, e.x, eDy(e));
  if (idx >= 0) return { cause: e.cause, e, idx };
  if (e.p && e.p.moons && !e.p.dead) {
    for (const m of e.p.moons) {
      if (m.dead) continue;
      const [mx, my] = moonPos(e, m);
      for (const [x, y, r] of circles) if ((x - mx) ** 2 + (y - my) ** 2 < (m.r * 0.92 + r) ** 2) return { cause: 'moon', e, moon: m };
    }
  }
  return null;
}
function groxHit(g, circles) {
  for (const [hx, hy, hr] of GROX_HIT) {
    const cx = g.x + hx * GROX_S, cy = g.y + hy * GROX_S, rr = hr * GROX_S;
    for (const [x, y, r] of circles) if ((x - cx) ** 2 + (y - cy) ** 2 < (rr + r) ** 2) return true;
  }
  return false;
}

// Щит принял удар: планету/звезду/луну/камень разносит, грокс взрывается,
// заряд гаснет; Феном 1.4 с неуязвим (мигает).
function absorb(hit) {
  ship.shield = false;
  ship.invuln = 1.4;
  flash = Math.max(flash, 0.45);
  if (!reduceMotion) shake = Math.max(shake, 0.45);
  sparkle(shipX(), ship.y, '127,211,255', 16);
  particles.push({ k: 3, x: shipX(), y: ship.y, vx: 0, vy: 0, t: 0, life: 0.5, r: 20, r2: 80, c: '127,211,255' });
  haptic('medium');
  const e = hit?.e;
  if (e?.p && (hit.cause === 'planet' || hit.cause === 'star')) { blowPlanet(e); return; }
  if (hit?.moon) { blowMoon(e, hit.moon, false); return; }
  if (e?.rocks && hit.idx >= 0) shatterRock(e, hit.idx);
  floatText(shipX() + 20, ship.y - 34, 'Щит принял удар!', '#bfeaff');
  if (hit?.g) {
    hit.g.dead = true;
    explode(hit.g.x, hit.g.y, ['#8c929b', '#4b5058', '#b48cff', '#ffb347', '#ffd27a'], 30);
    addScore(1);
    floatText(hit.g.x, hit.g.y - 30, 'Грокс сбит! +1', '#ffc070');
  }
  if (hit?.b) hit.b.dead = true;
}

// Эпичный взрыв планеты (или сверхновая): вспышка, ударные волны, плоское
// кольцо как у взорванной станции в кино, обломки цветов планеты, замедление.
// Щитом — ещё и гигадетонатор; лучом гигадетонатора — без него (иначе цепочка).
function blowPlanet(e, byBeam = false) {
  const p = e.p, cx = e.x + e.pcx, cy = e.pcy, r = p.r, star = p.kind === 'star';
  p.dead = true;
  e.shapes = [];
  if (p.moons) for (const m of p.moons) if (!m.dead) blowMoon(e, m, true);
  const cols = star ? ['#ffffff', '#fff1b8', '#ffb347', '#ff7a2c'] : [p.light, p.dark, '#ffffff', '#ffd27a', '#ff9b5e'];
  const glowC = star ? '255,220,150' : p.atm, k = 0.6 + r / 120;
  for (let i = 0; i < 70; i++) {
    const a = rand(0, TAU), v = rand(80, 520) * k;
    particles.push({ k: 0, x: cx + Math.cos(a) * r * 0.5, y: cy + Math.sin(a) * r * 0.5, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      t: 0, life: rand(0.8, 1.8), r: rand(2, 5), c: pick(cols), dr: 0.985, wd: true });
  }
  for (let i = 0; i < 24; i++) {
    const a = rand(0, TAU), v = rand(50, 280) * k;
    particles.push({ k: 2, x: cx + Math.cos(a) * r * 0.4, y: cy + Math.sin(a) * r * 0.4, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
      t: 0, life: rand(1.4, 2.4), r: rand(3, 6 + r * 0.05), c: pick(cols), rot: rand(0, TAU), vr: rand(-6, 6), dr: 0.99, wd: true });
  }
  particles.push({ k: 1, x: cx, y: cy, vx: 0, vy: 0, t: 0, life: 0.7, r: r * 0.5, c: '255,245,230', grow: 3, wd: true });
  particles.push({ k: 1, x: cx, y: cy, vx: 0, vy: 0, t: 0, life: 1.5, r: r * 0.7, c: glowC, grow: 4, wd: true });
  particles.push({ k: 3, x: cx, y: cy, vx: 0, vy: 0, t: 0, life: 0.9, r, r2: r * 3.6, c: '255,255,255', wd: true });
  particles.push({ k: 3, x: cx, y: cy, vx: 0, vy: 0, t: 0, life: 1.4, r: r * 0.6, r2: r * 2.6, c: glowC, wd: true });
  particles.push({ k: 5, x: cx, y: cy, vx: 0, vy: 0, t: 0, life: 1.7, rx0: r * 0.8, rx1: r * 5.5, tilt: rand(-0.35, 0.35),
    c: star ? '255,230,170' : '255,200,140', wd: true });
  flash = Math.max(flash, byBeam ? 0.5 : 1);
  if (!reduceMotion) { shake = Math.max(shake, 1.3); if (!byBeam) slowmo = SLOWMO; }
  addScore(3);
  // надписи — над планетой и под кораблём, чтобы не наезжали друг на друга
  floatText(cx, clamp(cy - r - 16, 60, H - 60), star ? 'Сверхновая! +3' : 'Планета разнесена! +3', '#ffd27a', 1.8);
  if (byBeam) return;
  floatText(shipX() + 30, Math.min(ship.y + 52, H - 20), 'Феному хоть бы хны', '#bfeaff', 1.6);
  haptic('heavy');
  giveGiga();
}
function blowMoon(e, m, quiet) {
  m.dead = true;
  const [mx, my] = moonPos(e, m);
  explode(mx, my, [m.col[0], m.col[1], '#ffffff', '#ffd27a'], 26, '255,220,180');
  for (const p of particles.slice(-40)) p.wd = true;
  if (quiet) return;
  addScore(1);
  floatText(clamp(mx, 70, W - 70), my - 24, 'Луна разбита! +1', '#ffd27a');
}
function shatterRock(e, idx) {
  const k = e.rocks[idx];
  const x = e.kind === 'wall' ? e.x + e.w / 2 + k.x : e.x + k.x, y = k.y + eDy(e);
  e.rocks.splice(idx, 1);
  e.shapes.splice(idx, 1);
  explode(x, y, [k.sh[0], k.sh[1], '#c9b8a0'], 20, '255,190,120');
  for (const p of particles.slice(-34)) p.wd = true;
}

/* Гравищит принял касание: мелочь разбивает, сквозь крупное пропускает.
   ghost — короткий «хвост» неуязвимости, пока корабль ещё внутри того, сквозь
   что прошёл (иначе щит кончился бы посреди стены — и смерть). */
function gravDeflect(hit, dt) {
  ship.ghost = Math.max(ship.ghost, 0.18);
  const e = hit.e;
  if (hit.b) { hit.b.dead = true; sparkle(hit.b.x, hit.b.y, '190,170,255', 10); return; }
  if (hit.g) {
    hit.g.dead = true;
    explode(hit.g.x, hit.g.y, ['#8c929b', '#4b5058', '#b48cff', '#ffb347', '#ffd27a'], 30);
    addScore(1);
    floatText(hit.g.x, hit.g.y - 30, 'Грокс отброшен! +1', '#c9b8ff');
    haptic('medium');
    return;
  }
  if (hit.moon) { blowMoon(e, hit.moon, false); return; }
  if (e && e.rocks && hit.idx >= 0 && hit.idx < e.rocks.length) { shatterRock(e, hit.idx); return; }
  gravSpark -= dt;
  if (gravSpark <= 0) {
    gravSpark = 0.07;
    const [nx, ny] = shipNose();
    sparkle(nx + 6, ny + rand(-14, 14), pick(['190,170,255', '127,211,255']), 3);
  }
}

function shipNose() {
  const a = shipAngle(), d = 58 * SHIP_S;
  return [shipX() + Math.cos(a) * d, ship.y + Math.sin(a) * d];
}

function giveWeapon(x, y) {
  const r = Math.random();
  const kind = r < 0.35 ? 'spread' : r < 0.65 ? 'burst' : r < 0.85 ? 'shotgun' : 'minigun';
  const W_ = WEAPONS[kind];
  ship.wpn = { kind, t: W_.time, total: W_.time, cd: 0.15, n: 0, left: kind === 'shotgun' ? (Math.random() < 0.5 ? 2 : 3) : 0 };
  if (kind === 'shotgun') ship.wpn.total = ship.wpn.left;
  sparkle(x, y, W_.col, 18);
  particles.push({ k: 3, x, y, vx: 0, vy: 0, t: 0, life: 0.5, r: 10, r2: 64, c: W_.col });
  const extra = kind === 'shotgun' ? ` ×${ship.wpn.left}` : '';
  floatText(shipX() + 30, ship.y - 40, `${W_.name}${extra}!`, `rgb(${W_.col})`, 1.5);
  haptic('medium');
}

function fireShot(da, col, speedK = 1, life = 1.2, len = 18) {
  const [nx, ny] = shipNose();
  const a = shipAngle() * 0.5 + da;
  shots.push({ x: nx, y: ny, vx: Math.cos(a) * SHOT_SPEED * speedK, vy: Math.sin(a) * SHOT_SPEED * speedK, t: 0, life, col, len });
}

function updateWeapon(dt) {
  const w = ship.wpn;
  if (!w || state !== 'play') return;
  const def = WEAPONS[w.kind];
  if (w.kind !== 'shotgun') w.t -= dt;
  w.cd -= dt;
  while (w.cd <= 0) {
    if (w.kind === 'spread') {
      for (const da of [-0.13, 0, 0.13]) fireShot(da, def.col);
      w.cd += 0.32;
    } else if (w.kind === 'burst') {
      fireShot(rand(-0.02, 0.02), def.col);
      w.n++;
      w.cd += w.n % 3 ? 0.07 : 0.42;
    } else if (w.kind === 'minigun') {
      fireShot(rand(-0.06, 0.06), def.col, rand(0.95, 1.1), 1.1, 14);
      w.cd += 1 / 16;
    } else {
      for (let i = 0; i < 8; i++) fireShot(rand(-0.34, 0.34), def.col, rand(0.75, 1), rand(0.4, 0.6), 12);
      sparkle(...shipNose(), def.col, 8);
      if (!reduceMotion) shake = Math.max(shake, 0.25);
      w.left--;
      w.cd += 0.7;
      if (w.left <= 0) { w.t = 0; break; }
    }
  }
  if (w.t <= 0 && (w.kind !== 'shotgun' || w.left <= 0)) {
    ship.wpn = null;
    floatText(shipX() + 30, ship.y - 34, 'Оружие разряжено', '#ffd27a', 1);
  }
}

// Мини-лазеры: летят по экрану, гаснут о первое препятствие.
function updateShots(dt) {
  if (!shots.length) return;
  for (const sh of shots) {
    sh.t += dt;
    sh.x += sh.vx * dt;
    sh.y += sh.vy * dt;
    if (sh.t > sh.life || sh.x > W + 40 || sh.y < -20 || sh.y > H + 20) { sh.dead = true; continue; }
    if (state !== 'play') continue;
    const c = [[sh.x, sh.y, 4]];
    let done = false;
    for (const g of groxes) {
      if (g.dead || g.phase === 'warn' || g.phase === 'gone' || g.x > W + 20) continue;
      if (groxHit(g, c)) {
        g.dead = true;
        explode(g.x, g.y, ['#8c929b', '#4b5058', '#b48cff', '#ffb347', '#ffd27a'], 26);
        addScore(1);
        floatText(g.x, g.y - 30, 'Грокс сбит! +1', '#ffc070');
        done = true; break;
      }
    }
    if (!done) {
      for (const b of bolts) {
        if (!b.dead && circleRect(sh.x, sh.y, 4, b.x - 12, b.y - 3, b.x + 12, b.y + 3)) {
          b.dead = true; sparkle(b.x, b.y, '255,190,120', 8); done = true; break;
        }
      }
    }
    if (!done) {
      for (const e of encounters) {
        if (e.gone || !e.shapes || e.x > sh.x + 10 || e.x + e.w < sh.x - 10) continue;
        const hit = encounterHit(e, c);
        if (!hit) continue;
        if (hit.moon) blowMoon(e, hit.moon, false);
        else if (e.rocks && hit.idx >= 0 && hit.idx < e.rocks.length) shatterRock(e, hit.idx);
        else sparkle(sh.x, sh.y, sh.col, 5);
        done = true; break;
      }
    }
    if (done) sh.dead = true;
  }
  shots = shots.filter(sh => !sh.dead);
  if (shots.length > 120) shots.splice(0, shots.length - 120);
}

function die(cause) {
  if (state !== 'play') return;
  state = 'dead';
  deadAt = performance.now();
  ship.alive = false;
  ship.shield = false;
  beam = null;
  syncGiga();
  if (!reduceMotion) shake = 1;
  flash = 0.7;
  haptic('error');
  explode(shipX(), ship.y, ['#e1e8ee', '#b4c0cb', '#1f3373', '#5ff3ee', '#ffd76a', '#ffffff'], 46, '120,220,255');
  const record = score > best;
  if (record) { best = score; saveBest(best); }
  setTimeout(() => {
    if (state !== 'dead') return;
    const groxDeath = cause === 'grox' || cause === 'bolt';
    const img = overlay.querySelector('.flappy-grox');
    if (groxDeath && !img.src) img.src = 'images/grox.png';
    img.hidden = !groxDeath;
    overlay.querySelector('.flappy-quip').textContent = pick(QUIPS[cause] || QUIPS.planet);
    overlay.querySelector('.flappy-where').textContent = sector === 0 ? '📍 Окрестности Фенома'
      : inGrox() ? `📍 ${GROX_HOME} — территория гроксов` : `📍 Система ${route[sector - 1]}`;
    overlay.querySelector('.flappy-final').textContent = score;
    overlay.querySelector('.flappy-best').textContent = best;
    overlay.querySelector('.flappy-record').hidden = !(record && score > 0);
    if (record && score > 0) haptic('success');
    updateComicUi();
    panelEl.hidden = false;
  }, 650);
}

/* ---------- Маркеры карты на фоне ----------
   Изредка (раз в ~10–20 с) далеко на фоне проплывает маркер с карты — точка
   или персонаж, будто Феном пролетает мимо событий. Список — из world.json и
   characters.json (их же грузит карта, тут — один раз при первом открытии
   игры), картинка маркера (миниатюра) грузится, только когда он появляется.
   Рисуется до препятствий, без подписей и сильно прозрачно (v=198, просьба
   игрока), медленнее мира (параллакс). */
function loadSightings() {
  if (sightings) return;
  sightings = [];
  Promise.all(['world.json', 'characters.json'].map(f => fetch(f).then(r => r.json()).catch(() => []))).then(([world, chars]) => {
    for (const n of world || []) {
      if (n.image && n.id !== 'phenome' && n.onMap !== false) sightings.push({ src: n.image, shape: n.beacon ? 'circle' : 'square' });
    }
    for (const n of chars || []) if (n.image) sightings.push({ src: n.image, shape: 'round' });
  });
}
function spawnMark() {
  if (!sightings?.length) return;
  const s = pick(sightings), img = new Image();
  img.src = s.src;
  const size = rand(34, 52);
  bgMarks.push({ img, shape: s.shape, x: W + size, y: rand(70, H - 80), size, k: rand(0.28, 0.42), a: rand(0.26, 0.38) });
}
function markPath(m) {
  const h = m.size / 2;
  ctx.beginPath();
  if (m.shape === 'circle') ctx.arc(m.x, m.y, h, 0, TAU);
  else if (ctx.roundRect) ctx.roundRect(m.x - h, m.y - h, m.size, m.size, m.shape === 'round' ? m.size * 0.22 : m.size * 0.06);
  else ctx.rect(m.x - h, m.y - h, m.size, m.size);
}
function drawMarks() {
  for (const m of bgMarks) {
    if (!m.img.complete || !m.img.naturalWidth) continue;
    const h = m.size / 2, iw = m.img.naturalWidth, ih = m.img.naturalHeight, s = Math.min(iw, ih);
    glow(m.x, m.y, m.size * 2.2, m.shape === 'circle' ? '255,215,106' : '175,238,238', 0.18 * m.a);
    ctx.save();
    ctx.globalAlpha = m.a;
    markPath(m);
    ctx.clip();
    ctx.drawImage(m.img, (iw - s) / 2, (ih - s) / 2, s, s, m.x - h, m.y - h, m.size, m.size);
    ctx.fillStyle = 'rgba(5,5,11,0.25)';      // приглушить: это фон
    ctx.fillRect(m.x - h, m.y - h, m.size, m.size);
    ctx.restore();
    ctx.globalAlpha = m.a;
    markPath(m);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = m.shape === 'circle' ? 'rgba(255,215,106,0.8)' : 'rgba(175,238,238,0.6)';
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
}

/* ---------- Прыжок в следующую систему ---------- */
function makeFar(s) {
  const home = s > JUMPS_TO_GROX, size = home ? 380 : rand(150, 230);
  return { sp: galaxySprite(s === 0 ? 0 : home ? GROX_PAL : paletteIdx), x0: W * (home ? 0.62 : s === 0 ? 0.68 : rand(0.45, 0.9)),
    y: H * (home ? 0.06 : rand(0.04, 0.4)), w: size, born: bgScroll, a: home ? 0.8 : 0.5, rot: rand(-0.5, 0.5) };
}
function nextSector() {
  if (inGrox()) return;        // в центре Галактики дальше лететь некуда
  sector++;
  const home = inGrox();
  prevPaletteIdx = paletteIdx;
  paletteIdx = home ? GROX_PAL : 1 + ((sector - 1 + palShift) % 4);
  paletteFade = 0;
  warp = 1;
  prevFar = far;
  far = makeFar(sector);
  showBanner(home ? 'Территория гроксов' : 'Прыжок в систему', home ? GROX_HOME : route[sector - 1]);
  haptic('medium');
}

/* ---------- Шаг игры ---------- */
function update(dt) {
  time += dt;
  shake = Math.max(0, shake - dt * 2.5);
  flash = Math.max(0, flash - dt * 2.4);
  if (warp > 0) warp = reduceMotion ? 0 : Math.max(0, warp - dt / 1.4);
  if (paletteFade < 1) paletteFade = Math.min(1, paletteFade + dt / 1.6);
  ship.ring += dt * 1.8;
  // Разгон в режиме корабля — плавно туда и обратно (ship.spd).
  ship.spd += ((ship.gd > 0 ? GD_SPEED : 1) - ship.spd) * Math.min(1, dt * 1.6);
  const v = state === 'play' ? speed() * ship.spd : 0;
  const bgV = state === 'play' ? v : state === 'ready' ? 60 : 18;
  bgScroll += bgV * dt * (1 + warp * 7);
  updateParticles(dt, v);
  for (const m of bgMarks) m.x -= bgV * m.k * dt * (1 + warp * 4);
  bgMarks = bgMarks.filter(m => m.x > -m.size - 40);
  if (state === 'play' && bgScroll > nextMarkAt) { spawnMark(); nextMarkAt = bgScroll + rand(2200, 3800); }
  for (const t of texts) { t.t += dt; t.y -= 26 * dt; }
  texts = texts.filter(t => t.t < t.life);

  if (state === 'ready') {
    ship.y = H * 0.45 + Math.sin(time * 2.4) * 10;
    ship.vy = Math.cos(time * 2.4) * 24;
    emitTrail(dt, bgV);
    return;
  }

  for (const e of encounters) {
    e.x -= v * dt;
    if (e.kind === 'nebula') tickNebula(e, dt);
    else if (e.kind === 'hole' && !e.gone && e.x < W + 60 && e.x + e.w > -60) feedHole(e, dt);
  }
  encounters = encounters.filter(e => e.x + e.w > -220);
  for (const p of pickups) p.x -= v * dt;
  pickups = pickups.filter(p => !p.got && p.x > -60);
  for (const g of groxes) updateGrox(g, dt, v);
  groxes = groxes.filter(g => !g.dead);
  for (const b of bolts) b.x += b.vx * dt;
  bolts = bolts.filter(b => !b.dead && b.x > -60);
  updateShots(dt);
  ship.boost = Math.max(0, ship.boost - dt * 3);
  if (state !== 'play') return;

  emitTrail(dt, bgV);
  cursor -= v * dt;
  while (cursor < W + 160) spawnEncounter();
  for (const e of encounters) if (e.kind === 'grox') tickGroxSlot(e, dt);
  updateBeam(dt);

  // Физика: тяжесть + притяжение чёрных дыр (только по вертикали — Феном держит курс).
  // В режиме корабля вместо импульсов — тяга, пока держишь, и плавный спуск.
  const sx = shipX(), gd = ship.gd > 0;
  let ay = GRAVITY;
  if (gd) {
    ay = holding ? -GD_UP : GD_DOWN;
    ship.boost = holding ? 1 : ship.boost;
    ship.gd = Math.max(0, ship.gd - dt);
    if (ship.gd === 0) {
      floatText(sx + 30, ship.y - 34, 'Снова импульсы', '#ff9be6');
      floatText(sx + 30, ship.y - 16, 'гравищит', '#c9b8ff', 1.2);
      ship.grav = GRAV_TIME;
    }
  }
  if (ship.grav > 0) ship.grav = Math.max(0, ship.grav - dt);
  if (ship.ghost > 0) ship.ghost -= dt;
  updateWeapon(dt);
  for (const e of encounters) {
    if (e.kind !== 'hole' || e.gone) continue;
    const dx = e.x + e.hx - sx, dy = e.hy - ship.y, d = Math.hypot(dx, dy);
    if (d < e.R && d > 1) ay += HOLE_PULL * Math.pow(1 - d / e.R, 1.3) * (dy / d);
  }
  ship.vy += ay * dt;
  ship.vy = gd ? clamp(ship.vy, -GD_MAX_UP, GD_MAX_DOWN) : Math.min(MAX_FALL, ship.vy);
  ship.y += ship.vy * dt;
  if (ship.y < 16) { ship.y = 16; if (ship.vy < 0) ship.vy = 0; }
  if (gd && ship.y > H - 14) { ship.y = H - 14; if (ship.vy > 0) ship.vy = 0; }   // как в GD: по полу корабль скользит
  if (ship.invuln > 0) ship.invuln -= dt;

  for (const e of encounters) {
    if (e.scored || e.x + e.w > sx - 20) continue;
    e.scored = true;
    progress++;
    if (e.kind !== 'grox') addScore(1);
    if (progress % SECTOR_EVERY === 0) nextSector();
  }

  for (const p of pickups) {
    const py = p.y + (p.e ? eDy(p.e) : 0);
    if ((p.x - sx - 6) ** 2 + (py - ship.y) ** 2 > 30 * 30) continue;
    p.got = true;
    if (p.k === 'c') {
      addScore(1);
      sparkle(p.x, py, '95,243,238');
      floatText(p.x, py - 16, '+1', '#9ff8f4', 0.8);
      haptic('light');
    } else if (p.k === 's') {
      ship.shield = true;
      sparkle(p.x, py, '127,211,255', 16);
      floatText(sx + 20, ship.y - 34, 'Щит!', '#bfeaff');
      haptic('medium');
    } else if (p.k === 'g') {
      ship.gd = GD_TIME;
      ship.grav = GRAV_TIME;
      sparkle(p.x, py, '255,90,200', 18);
      particles.push({ k: 3, x: p.x, y: py, vx: 0, vy: 0, t: 0, life: 0.5, r: 10, r2: 70, c: '255,110,220' });
      floatText(sx + 30, ship.y - 46, 'Режим корабля!', '#ff9be6', 1.4);
      floatText(sx + 30, ship.y - 28, 'держи — вверх, отпусти — вниз', '#ffd1f3', 1.8);
      haptic('medium');
    } else if (p.k === 'w') {
      giveWeapon(p.x, py);
    } else if (p.k === 'p') {
      unlockPage(p.page, p.x, py);
    }
  }

  if (ship.y > H - 10 && ship.grav > 0 && !ship.invuln) {
    // гравищит — мягкий отскок от пола, щит 🛡️ не тратится
    ship.y = H - 10;
    ship.vy = FLAP_VY * 0.75;
    sparkle(sx, H - 8, '190,170,255', 8);
  }
  if (ship.y > H - 10) {
    if (ship.shield || ship.invuln > 0) {
      if (ship.shield) absorb(null);
      ship.y = H - 10;
      ship.vy = FLAP_VY * 1.1;
    } else { die('floor'); return; }
  }

  const circles = shipCircles();
  let hit = null;
  for (const e of encounters) {
    if (!e.shapes || e.x > sx + 60 || e.x + e.w < sx - 60) continue;
    const c = encounterHit(e, circles);
    if (c) { hit = c; break; }
  }
  if (!hit) {
    for (const g of groxes) {
      if (g.phase === 'warn' || g.phase === 'gone' || Math.abs(g.x - sx) > 100) continue;
      if (groxHit(g, circles)) { hit = { cause: 'grox', g }; break; }
    }
  }
  if (!hit) {
    for (const b of bolts) {
      if (Math.abs(b.x - sx) > 60) continue;
      if (circles.some(([x, y, r]) => circleRect(x, y, r, b.x - 12, b.y - 3, b.x + 12, b.y + 3))) { hit = { cause: 'bolt', b }; break; }
    }
  }
  if (hit) {
    // После щита — не умираем, пока не вылетели из того, что уже пробили.
    if (ship.invuln > 0) { if (hit.b) hit.b.dead = true; ship.invuln = Math.max(ship.invuln, 0.12); }
    else if (ship.grav > 0 || ship.ghost > 0) gravDeflect(hit, dt);
    else if (ship.shield) absorb(hit);
    else die(hit.cause);
  }
}

/* ---------- Отрисовка ---------- */
function drawRings(front) {
  // Два кольца вокруг хребта, видны под углом: задняя (правая) половина — до
  // корпуса, передняя — после. Спицы и огни вращаются.
  for (const cx of [-27, -17]) {
    const off = cx === -17 ? 0.7 : 0;
    const a0 = front ? Math.PI / 2 : -Math.PI / 2, a1 = a0 + Math.PI;
    if (!front) {
      ctx.strokeStyle = '#6d7d99';
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      for (let k = 0; k < 2; k++) {
        const f = ship.ring + k * Math.PI / 2 + off, ex = 8.5 * Math.cos(f), ey = 18.5 * Math.sin(f);
        ctx.moveTo(cx - ex, -ey);
        ctx.lineTo(cx + ex, ey);
      }
      ctx.stroke();
    }
    ctx.lineWidth = 4.4;
    ctx.strokeStyle = NAVY;
    ctx.beginPath(); ctx.ellipse(cx, 0, 10, 20, 0, a0, a1); ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#a9b6c6';
    ctx.beginPath(); ctx.ellipse(cx, 0, 7.6, 17.5, 0, a0, a1); ctx.stroke();
    ctx.fillStyle = '#e9f6ff';
    for (let j = 0; j < 4; j++) {
      const f = ship.ring * 1.3 + j * Math.PI / 2 + off, c = Math.cos(f);
      if ((c < 0) !== front) continue;
      ctx.fillRect(cx + 10 * c - 0.8, 20 * Math.sin(f) - 0.8, 1.6, 1.6);
    }
  }
}

function drawPhenom(x, y, a, alpha) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  ctx.scale(SHIP_S, SHIP_S);
  ctx.globalAlpha = alpha;
  // пламя: длиннее сразу после импульса; в режиме корабля — розовое, пока держишь
  const gd = ship.gd > 0;
  const fl = 18 + ship.boost * 34 + Math.sin(time * 38) * 3;
  if (gd) glow(0, 0, 150, '255,90,200', 0.18 + 0.06 * Math.sin(time * 6));
  glow(-58, 0, 34 + ship.boost * 18, gd ? '255,110,220' : '95,243,238', 0.85);
  const fg = ctx.createLinearGradient(-56, 0, -56 - fl, 0);
  fg.addColorStop(0, gd ? 'rgba(255,235,250,0.95)' : 'rgba(235,255,255,0.95)');
  fg.addColorStop(0.4, gd ? 'rgba(255,90,200,0.85)' : 'rgba(95,243,238,0.8)');
  fg.addColorStop(1, gd ? 'rgba(160,80,255,0)' : 'rgba(120,140,255,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.moveTo(-56, -7); ctx.quadraticCurveTo(-58 - fl * 1.15, 0, -56, 7); ctx.closePath(); ctx.fill();
  drawRings(false);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = OUT;
  ctx.fillStyle = '#95a2b0';
  ctx.fill(PATH.neck); ctx.stroke(PATH.neck);
  ctx.fillStyle = NAVY;
  ctx.fillRect(-40, -1.7, 38, 3.4);
  // корма
  ctx.fillStyle = GR.stern;
  ctx.fill(PATH.stern);
  ctx.fillStyle = NAVY;
  ctx.fillRect(-53, -14, 9, 5); ctx.fillRect(-53, 9, 9, 5); ctx.fillRect(-45, -19, 4, 7);
  ctx.fillStyle = 'rgba(240,248,255,0.9)';
  ctx.fillRect(-49, -3, 2, 2); ctx.fillRect(-49, 1, 2, 2); ctx.fillRect(-44, -1, 2, 2);
  ctx.stroke(PATH.stern);
  // корпус
  ctx.fillStyle = GR.hull;
  ctx.fill(PATH.hull);
  ctx.save();
  ctx.clip(PATH.hull);
  ctx.fillStyle = NAVY;     // визор на носу и полоса вдоль борта
  ctx.beginPath(); ctx.moveTo(18, -20); ctx.bezierCurveTo(34, -16, 44, -8, 49, -1); ctx.lineTo(45, 1); ctx.bezierCurveTo(40, -6, 31, -11, 17, -13.5); ctx.closePath(); ctx.fill();
  ctx.fillRect(-6, -2.2, 52, 3);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(-6, 3.5, 50, 1.2);
  ctx.strokeStyle = 'rgba(240,248,255,0.9)';    // огни-пунктиры
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 2]);
  ctx.beginPath(); ctx.moveTo(0, -10.5); ctx.bezierCurveTo(9, -14.5, 20, -15, 30, -11); ctx.moveTo(4, 5.6); ctx.lineTo(38, 5.6); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = '#0d1220';                       // ангар
  ctx.fillRect(14, 1.8, 10, 5.2);
  ctx.fillStyle = 'rgba(255,215,106,0.75)';
  ctx.fillRect(15.5, 4.6, 2.2, 1.4); ctx.fillRect(19.5, 4.6, 2.2, 1.4);
  ctx.fillStyle = '#0d1220';
  ctx.beginPath(); ctx.moveTo(38, 2); ctx.lineTo(43, -0.5); ctx.lineTo(43, 3.5); ctx.closePath(); ctx.fill();
  ctx.restore();
  ctx.stroke(PATH.hull);
  drawRings(true);
  ctx.restore();
}

function drawShield(x, y, a) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 4);
  glow(x + 3, y, 120, '127,211,255', 0.16 + 0.08 * pulse);
  ctx.save();
  ctx.translate(x + 3, y);
  ctx.rotate(a);
  ctx.strokeStyle = `rgba(160,225,255,${(0.55 + 0.25 * pulse).toFixed(2)})`;
  ctx.lineWidth = 1.6;
  ctx.setLineDash([7, 4]);
  ctx.lineDashOffset = -time * 18;
  ctx.beginPath(); ctx.ellipse(0, 0, 46, 22, 0, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/* Гравитационный щит — «ударная волна» перед носом: три дуги, рябь бежит
   вперёд, гаснет в последние 0.5 с. */
function drawGravShield(x, y, a) {
  const k = Math.min(1, ship.grav / 0.5, (GRAV_TIME - ship.grav) / 0.15 + 0.2);
  if (k <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(a);
  glow(44, 0, 120, '170,150,255', 0.22 * k);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const ph = (time * 2.2 + i / 3) % 1;
    const r = 30 + ph * 26;
    ctx.globalAlpha = k * (1 - ph) * 0.85;
    ctx.strokeStyle = i === 1 ? '#a8f0ff' : '#c9b8ff';
    ctx.lineWidth = 3 - ph * 2;
    ctx.beginPath(); ctx.arc(14, 0, r, -0.95, 0.95); ctx.stroke();
  }
  ctx.globalAlpha = k * 0.6;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(14, 0, 32, -0.8, 0.8); ctx.stroke();
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawShots() {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  for (const sh of shots) {
    const sp = Math.hypot(sh.vx, sh.vy) || 1, ux = sh.vx / sp, uy = sh.vy / sp;
    ctx.strokeStyle = `rgba(${sh.col},0.55)`;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(sh.x - ux * sh.len, sh.y - uy * sh.len); ctx.lineTo(sh.x, sh.y); ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(sh.x - ux * sh.len * 0.7, sh.y - uy * sh.len * 0.7); ctx.lineTo(sh.x, sh.y); ctx.stroke();
  }
  ctx.restore();
}

function drawGrox(g) {
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(g.tilt);
  ctx.scale(GROX_S, GROX_S);
  ctx.lineJoin = 'round';
  const fl = 16 + Math.sin(time * 33 + g.ph) * 3 + (g.phase === 'rush' ? 14 : 0);
  glow(64, -1, 30, '255,150,60', 0.9);
  const fg = ctx.createLinearGradient(62, 0, 62 + fl, 0);
  fg.addColorStop(0, '#fff3c4');
  fg.addColorStop(0.35, '#ffb347');
  fg.addColorStop(1, 'rgba(255,90,30,0)');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.moveTo(62, -5); ctx.quadraticCurveTo(62 + fl * 1.2, -0.5, 62, 4); ctx.closePath(); ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = GOUT;
  ctx.fillStyle = '#454a52';
  ctx.fill(PATH.gBlade2); ctx.stroke(PATH.gBlade2);
  ctx.fillStyle = '#50565f';
  ctx.fill(PATH.gBlade1); ctx.stroke(PATH.gBlade1);
  ctx.strokeStyle = 'rgba(210,220,230,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(10, -13); ctx.lineTo(44, -45); ctx.moveTo(27, -12); ctx.lineTo(57, -34); ctx.stroke();
  ctx.fillStyle = '#7b8c9b';
  ctx.fill(PATH.gPod);
  ctx.strokeStyle = 'rgba(40,50,60,0.8)';
  ctx.stroke(PATH.gSeg);
  ctx.strokeStyle = GOUT;
  ctx.lineWidth = 1.4;
  ctx.stroke(PATH.gPod);
  ctx.fillStyle = GR.gHull;
  ctx.fill(PATH.gHull); ctx.stroke(PATH.gHull);
  ctx.strokeStyle = 'rgba(15,17,20,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-34, -6); ctx.quadraticCurveTo(-6, -11, 30, -9); ctx.moveTo(-24, 2.5); ctx.lineTo(44, 2); ctx.moveTo(18, -13); ctx.lineTo(16, 6); ctx.stroke();
  ctx.fillStyle = '#5b626b';
  ctx.strokeStyle = GOUT;
  ctx.lineWidth = 1.2;
  ctx.fill(PATH.gGun); ctx.stroke(PATH.gGun);
  ctx.fillStyle = GR.gCan;
  ctx.fill(PATH.gCan); ctx.stroke(PATH.gCan);
  ctx.strokeStyle = 'rgba(235,215,255,0.75)';
  ctx.beginPath(); ctx.moveTo(-9, -17); ctx.quadraticCurveTo(-1, -23, 8, -20); ctx.stroke();
  ctx.fillStyle = '#d8b13c';
  ctx.fillRect(52, -6, 10, 10);
  ctx.fillStyle = '#7a5e1a';
  ctx.fillRect(60, -6, 3, 10);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(52, -5, 8, 2);
  for (const [lx, ly] of GROX_LIGHTS) {
    ctx.fillStyle = '#ffb347';
    ctx.fillRect(lx - 1.6, ly - 0.9, 3.2, 1.8);
    glow(lx, ly, 9, '255,160,60', 0.6);
  }
  if (g.phase === 'charge') { const k = 1 - g.t / GROX_CHARGE; glow(-68, -2, 14 + 46 * k, '255,60,100', 0.5 + 0.5 * k); }
  ctx.restore();
}
function drawGroxLayer(g) {
  if (g.phase === 'gone') return;
  if (g.phase === 'warn') {
    const pulse = 0.5 + 0.5 * Math.sin(time * 14), wx = W - 20, wy = g.y;
    glow(wx - 4, wy, 46, '255,60,70', 0.35 + 0.3 * pulse);
    ctx.fillStyle = `rgba(255,70,80,${(0.65 + 0.3 * pulse).toFixed(2)})`;
    ctx.beginPath(); ctx.moveTo(wx - 16, wy); ctx.lineTo(wx + 4, wy - 13); ctx.lineTo(wx + 4, wy + 13); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = '800 13px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('!', wx - 3, wy + 1);
    ctx.textBaseline = 'alphabetic';
    return;
  }
  if (g.phase === 'charge') {
    const k = 1 - g.t / GROX_CHARGE, bx = g.x - 66 * GROX_S, by = g.y - 2 * GROX_S;
    ctx.strokeStyle = `rgba(255,70,100,${(0.25 + 0.45 * k).toFixed(2)})`;
    ctx.lineWidth = 1 + k;
    ctx.setLineDash([8, 6]);
    ctx.lineDashOffset = time * 80;
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(-10, by); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  }
  drawGrox(g);
}
function drawBolt(b) {
  glow(b.x, b.y, 34, '255,60,100', 0.7);
  ctx.fillStyle = 'rgba(255,70,110,0.9)';
  ctx.fillRect(b.x - 13, b.y - 2.5, 26, 5);
  ctx.fillStyle = '#ffe3ea';
  ctx.fillRect(b.x - 11, b.y - 1, 22, 2);
}

// --- ворота ---
function hazardRect(x, y, w, h) {
  ctx.fillStyle = '#2a2e37';
  ctx.fillRect(x, y, w, h);
  ctx.save();
  ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = '#e0b12f';
  ctx.beginPath();
  for (let sx = x - h; sx < x + w; sx += 12) { ctx.moveTo(sx, y + h); ctx.lineTo(sx + h, y); ctx.lineTo(sx + h + 6, y); ctx.lineTo(sx + 6, y + h); ctx.closePath(); }
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = '#14171d';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
}
function drawLaser(cx, top, bot, seed) {
  const flick = 0.75 + 0.25 * Math.sin(time * 30 + seed);
  for (const [y1, y2, end, dir] of [[-130, top - 14, top, -1], [bot + 14, H + 130, bot, 1]]) {
    ctx.fillStyle = `rgba(255,40,90,${(0.18 * flick).toFixed(3)})`;
    ctx.fillRect(cx - 15, y1, 30, y2 - y1);
    ctx.fillStyle = `rgba(255,70,110,${(0.85 * flick).toFixed(3)})`;
    ctx.fillRect(cx - 4, y1, 8, y2 - y1);
    ctx.fillStyle = 'rgba(255,235,240,0.95)';
    ctx.fillRect(cx - 1, y1, 2, y2 - y1);
    const ey = dir < 0 ? end - 16 : end;     // излучатель у прохода
    ctx.fillStyle = '#3a3f55';
    ctx.fillRect(cx - 17, ey, 34, 16);
    ctx.fillStyle = '#596080';
    ctx.fillRect(cx - 17, dir < 0 ? ey + 13 : ey, 34, 3);
    ctx.fillStyle = Math.sin(time * 6 + seed) > 0 ? '#ff4d6d' : '#7a2236';
    ctx.fillRect(cx - 3, ey + 6, 6, 4);
  }
}
function drawGirder(cx, top, bot, seed) {
  const on = Math.sin(time * 5 + seed) > 0;
  for (const [y1, y2, capY, ly, dir] of [[-130, top - 12, top - 12, top - 3, -1], [bot + 12, H + 130, bot, bot, 1]]) {
    ctx.fillStyle = '#343b4c';
    ctx.fillRect(cx - 21, y1, 5, y2 - y1);
    ctx.fillRect(cx + 16, y1, 5, y2 - y1);
    ctx.strokeStyle = '#5a6380';
    ctx.lineWidth = 2;
    ctx.beginPath();
    let y = dir < 0 ? y2 : y1, side = -1;
    ctx.moveTo(cx + 16 * side, y);
    while (dir < 0 ? y > y1 : y < y2) { y += dir < 0 ? -24 : 24; side = -side; ctx.lineTo(cx + 16 * side, y); }
    ctx.stroke();
    hazardRect(cx - 27, capY, 54, 12);
    ctx.fillStyle = on ? '#ffb02e' : '#5a3a10';
    ctx.fillRect(cx - 27, ly, 4, 3);
    ctx.fillRect(cx + 23, ly, 4, 3);
    if (on) { glow(cx - 25, ly + 1.5, 16, '255,170,60', 0.7); glow(cx + 25, ly + 1.5, 16, '255,170,60', 0.7); }
  }
}
function drawShard(bx, s, col) {
  const by = s.base, L = s.len, w = s.w, d = s.dir, ln = s.lean, sh = L - w * 0.8;
  const gr = ctx.createLinearGradient(bx - w / 2, 0, bx + w / 2, 0);
  gr.addColorStop(0, col.a); gr.addColorStop(0.55, col.b); gr.addColorStop(0.72, col.c); gr.addColorStop(1, col.a);
  ctx.fillStyle = gr;
  ctx.beginPath();
  ctx.moveTo(bx - w / 2, by);
  ctx.lineTo(bx - w / 2 + ln * sh, by + d * sh);
  ctx.lineTo(bx + ln * L, by + d * L);
  ctx.lineTo(bx + w / 2 + ln * sh, by + d * sh);
  ctx.lineTo(bx + w / 2, by);
  ctx.closePath();
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = col.edge;
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(bx + w * 0.14, by); ctx.lineTo(bx + w * 0.14 + ln * sh, by + d * sh); ctx.lineTo(bx + ln * L, by + d * L);
  ctx.stroke();
}
function drawCrystalWall(e, cx) {
  for (const s of e.shards) drawShard(cx + s.dx, s, e.col);
  const pulse = 0.5 + 0.5 * Math.sin(time * 3 + e.seed);
  glow(cx, e.top, 40, e.col.glow, 0.35 + 0.3 * pulse);
  glow(cx, e.bot, 40, e.col.glow, 0.35 + 0.3 * pulse);
}
function drawRock(x, y, k) {
  const ang = k.rot + time * k.vr, n = k.pts.length, r = k.r;
  ctx.save();
  ctx.translate(x, y);
  if (!k.grad) {
    k.grad = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r * 1.1);
    k.grad.addColorStop(0, k.sh[0]);
    k.grad.addColorStop(1, k.sh[1]);
  }
  ctx.beginPath();
  for (let i = 0; i < n; i++) {
    const a = ang + i * TAU / n, rr = r * k.pts[i];
    if (i) ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); else ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fillStyle = k.grad;
  ctx.fill();
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = 'rgba(20,16,14,0.9)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  const c = Math.cos(ang), s = Math.sin(ang);
  for (const [px, py, cr] of k.cr) { ctx.beginPath(); ctx.arc((px * c - py * s) * r, (px * s + py * c) * r, cr * r, 0, TAU); ctx.fill(); }
  ctx.restore();
}
function drawWall(e) {
  const dy = eDy(e), cx = e.x + e.w / 2;
  ctx.save();
  if (dy) ctx.translate(0, dy);
  if (e.style === 'laser') drawLaser(cx, e.top, e.bot, e.seed);
  else if (e.style === 'girder') drawGirder(cx, e.top, e.bot, e.seed);
  else if (e.style === 'crystal') drawCrystalWall(e, cx);
  else for (const k of e.rocks) drawRock(cx + k.x, k.y, k);
  ctx.restore();
}

// --- планеты, звёзды, туманности, чёрные дыры ---
function ringHalf(cx, cy, p, back) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(p.tilt);
  const a0 = back ? Math.PI : 0, a1 = a0 + Math.PI;
  ctx.strokeStyle = back ? 'rgba(232,217,176,0.35)' : 'rgba(232,217,176,0.7)';
  ctx.lineWidth = p.r * 0.07 + 1.5;
  ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.6, p.r * 0.36, 0, a0, a1); ctx.stroke();
  ctx.strokeStyle = back ? 'rgba(200,185,150,0.25)' : 'rgba(200,185,150,0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.ellipse(0, 0, p.r * 1.35, p.r * 0.29, 0, a0, a1); ctx.stroke();
  ctx.restore();
}
function drawStar(cx, cy, p) {
  const pulse = 1 + 0.05 * Math.sin(time * 3 + p.ph);
  glow(cx, cy, p.r * 6.8 * pulse, '255,190,90', 0.55);
  glow(cx, cy, p.r * 3.6, '255,235,180', 0.8);
  for (const f of p.flares) {
    const a = f.a + time * f.w;
    glow(cx + Math.cos(a) * p.r * 1.05, cy + Math.sin(a) * p.r * 1.05, f.s * 2, '255,150,60', 0.6);
  }
  ctx.save();
  ctx.translate(cx, cy);
  if (!p.grad) {
    p.grad = ctx.createRadialGradient(0, 0, 0, 0, 0, p.r);
    p.grad.addColorStop(0, '#ffffff'); p.grad.addColorStop(0.45, '#fff1b8'); p.grad.addColorStop(0.85, '#ffb347'); p.grad.addColorStop(1, '#ff7a2c');
  }
  ctx.fillStyle = p.grad;
  ctx.beginPath(); ctx.arc(0, 0, p.r, 0, TAU); ctx.fill();
  ctx.restore();
}
function drawPlanetBody(cx, cy, p) {
  if (p.kind === 'star') { drawStar(cx, cy, p); return; }
  const r = p.r;
  glow(cx, cy, r * 2.7, p.atm, 0.22);
  if (p.ring) ringHalf(cx, cy, p, true);
  ctx.save();
  ctx.translate(cx, cy);
  if (!p.grad) {
    p.grad = ctx.createRadialGradient(-r * 0.4, -r * 0.45, r * 0.08, 0, 0, r);
    p.grad.addColorStop(0, p.light);
    p.grad.addColorStop(1, p.dark);
  }
  ctx.fillStyle = p.grad;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.save();
  ctx.clip();
  if (p.bands) {
    ctx.fillStyle = 'rgba(255,255,255,0.09)';
    ctx.fillRect(-r, -r * 0.42, r * 2, r * 0.16); ctx.fillRect(-r, r * 0.05, r * 2, r * 0.22);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.fillRect(-r, -r * 0.12, r * 2, r * 0.1);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (const [x, y, s] of p.craters) { ctx.beginPath(); ctx.arc(x * r, y * r, s * r, 0, TAU); ctx.fill(); }
  }
  ctx.restore();
  ctx.strokeStyle = `rgba(${p.atm},0.35)`;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.arc(0, 0, r - 0.6, 3.6, 5.4); ctx.stroke();
  ctx.restore();
  if (p.ring) ringHalf(cx, cy, p, false);
}
function drawPlanetEnc(e) {
  const p = e.p, cx = e.x + e.pcx, cy = e.pcy;
  if (p.dead) return;                            // разнесена щитом
  drawPlanetBody(cx, cy, p);
  if (!p.moons) return;
  ctx.strokeStyle = 'rgba(255,255,255,0.09)';   // орбиты видны — чтобы луна не была сюрпризом
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 7]);
  for (const m of p.moons) { if (!m.dead) { ctx.beginPath(); ctx.arc(cx, cy, m.R, 0, TAU); ctx.stroke(); } }
  ctx.setLineDash([]);
  for (const m of p.moons) {
    if (m.dead) continue;
    const [mx, my] = moonPos(e, m);
    const g = ctx.createRadialGradient(mx - m.r * 0.4, my - m.r * 0.4, m.r * 0.1, mx, my, m.r);
    g.addColorStop(0, m.col[0]);
    g.addColorStop(1, m.col[1]);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(mx, my, m.r, 0, TAU); ctx.fill();
  }
}
function drawNebulaGlow(e) {
  ctx.globalCompositeOperation = 'lighter';
  for (const p of e.puffs) {
    ctx.globalAlpha = p.a;
    ctx.drawImage(glowSprite(p.col), e.x + p.dx - p.s / 2, p.dy - p.s / 2, p.s, p.s);
  }
  ctx.globalAlpha = 1;
  if (e.bolt) {
    const a = e.bolt.t / 0.2;
    ctx.beginPath();
    e.bolt.pts.forEach(([x, y], i) => (i ? ctx.lineTo(e.x + x, y) : ctx.moveTo(e.x + x, y)));
    ctx.strokeStyle = `rgba(200,170,255,${(0.5 * a).toFixed(3)})`;
    ctx.lineWidth = 4;
    ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${(0.9 * a).toFixed(3)})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
  ctx.globalCompositeOperation = 'source-over';
}
function drawHole(e) {
  const cx = e.x + e.hx, cy = e.hy;
  ctx.strokeStyle = 'rgba(255,170,90,0.12)';     // зона притяжения
  ctx.lineWidth = 1.5;
  ctx.setLineDash([4, 8]);
  ctx.lineDashOffset = time * 20;
  ctx.beginPath(); ctx.arc(cx, cy, e.R, 0, TAU); ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  glow(cx, cy, 170, '255,150,70', 0.4);
  const disk = (front) => {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-0.25);
    const a0 = front ? 0 : Math.PI, a1 = a0 + Math.PI;
    ctx.setLineDash([10, 6]);
    ctx.lineDashOffset = -time * 50;
    for (const [rx, ry, lw, col] of [[58, 15, 7, 'rgba(255,140,60,0.35)'], [50, 12, 3.5, 'rgba(255,200,120,0.75)'], [42, 10, 1.6, 'rgba(255,245,220,0.9)']]) {
      ctx.strokeStyle = col;
      ctx.lineWidth = lw;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, ry, 0, a0, a1); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.restore();
  };
  disk(false);
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx, cy, 16, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,220,170,0.9)';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(cx, cy, 17, 0, TAU); ctx.stroke();
  disk(true);
}
function drawEncounter(e) {
  if (e.gone) return;                  // снесено гигадетонатором
  if (e.kind === 'wall') drawWall(e);
  else if (e.kind === 'planet' || e.kind === 'nebula') drawPlanetEnc(e);
  else if (e.kind === 'field') for (const k of e.rocks) drawRock(e.x + k.x, k.y, k);
  else if (e.kind === 'hole') drawHole(e);
}

function drawPickup(p) {
  const y = p.y + (p.e ? eDy(p.e) : 0), x = p.x;
  if (p.k === 'c') {
    const s = Math.cos(time * 3 + p.ph), w = 7 * Math.abs(s) + 1.5;
    glow(x, y, 30, '95,243,238', 0.45 + 0.15 * Math.sin(time * 5 + p.ph));
    ctx.fillStyle = s > 0 ? '#9ff8f4' : '#4fd6d0';
    ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + w, y); ctx.lineTo(x, y + 10); ctx.lineTo(x - w, y); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.moveTo(x, y - 10); ctx.lineTo(x + w * 0.45, y - 1); ctx.lineTo(x, y + 2); ctx.closePath(); ctx.fill();
  } else if (p.k === 'g') {
    // портал режима корабля — розовый овал, как в Geometry Dash, с силуэтом корабля
    const pulse = 0.5 + 0.5 * Math.sin(time * 5 + p.ph);
    glow(x, y, 70, '255,90,200', 0.4 + 0.25 * pulse);
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = '#ff5fd0';
    ctx.beginPath(); ctx.ellipse(x, y, 10, 25, 0, 0, TAU); ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = '#ffd1f3';
    ctx.beginPath(); ctx.ellipse(x, y, 7, 20, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(255,95,208,0.25)';
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x - 5, y - 4); ctx.lineTo(x + 6, y); ctx.lineTo(x - 5, y + 4); ctx.lineTo(x - 2.5, y); ctx.closePath(); ctx.fill();
  } else if (p.k === 'w') {
    // оружие — оранжевое кольцо с тремя лучами вперёд
    const pulse = 0.5 + 0.5 * Math.sin(time * 6 + p.ph);
    glow(x, y, 60, '255,150,70', 0.4 + 0.25 * pulse);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = '#ffb36b';
    ctx.beginPath(); ctx.arc(x, y, 13, 0, TAU); ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#fff2dc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const dy of [-5, 0, 5]) { ctx.moveTo(x - 6, y + dy * 0.6); ctx.lineTo(x + 7, y + dy); }
    ctx.stroke();
    ctx.lineCap = 'butt';
  } else if (p.k === 'p') {
    // страница комикса — светится золотом, покачивается
    const pulse = 0.5 + 0.5 * Math.sin(time * 4 + p.ph);
    glow(x, y, 64, '255,215,106', 0.45 + 0.25 * pulse);
    ctx.save();
    ctx.translate(x, y + Math.sin(time * 2 + p.ph) * 3);
    ctx.rotate(Math.sin(time * 1.5 + p.ph) * 0.15);
    ctx.fillStyle = '#fff3d6';
    ctx.fillRect(-9, -12, 18, 24);
    ctx.strokeStyle = '#6b4a10';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(-9, -12, 18, 24);
    ctx.fillStyle = '#b48cff'; ctx.fillRect(-7, -10, 14, 7);
    ctx.fillStyle = '#5ff3ee'; ctx.fillRect(-7, -1, 6, 9);
    ctx.fillStyle = '#ff8fa0'; ctx.fillRect(1, -1, 6, 9);
    ctx.restore();
  } else {
    const pulse = 0.5 + 0.5 * Math.sin(time * 4 + p.ph);
    glow(x, y, 46, '127,211,255', 0.4 + 0.25 * pulse);
    ctx.beginPath();
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + Math.PI / 6; ctx.lineTo(x + Math.cos(a) * 12, y + Math.sin(a) * 12); }
    ctx.closePath();
    ctx.fillStyle = 'rgba(60,140,220,0.35)';
    ctx.fill();
    ctx.strokeStyle = '#bfeaff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#e6f6ff';
    ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y - 4); ctx.lineTo(x + 4, y + 2); ctx.lineTo(x, y + 6); ctx.lineTo(x - 4, y + 2); ctx.lineTo(x - 5, y - 4); ctx.closePath(); ctx.fill();
  }
}

function drawParticles() {
  for (const p of particles) {
    const f = p.t / p.life, a = 1 - f;
    if (p.k === 0) {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x - p.r / 2, p.y - p.r / 2, p.r, p.r);
    } else if (p.k === 1) {
      glow(p.x, p.y, p.r * 4 * (p.grow ? 1 + f * p.grow : 1), p.c, a * 0.8);
    } else if (p.k === 2) {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillRect(-p.r, -p.r * 0.45, p.r * 2, p.r * 0.9);
      ctx.restore();
    } else if (p.k === 3) {
      ctx.globalAlpha = a * 0.8;
      ctx.strokeStyle = `rgb(${p.c})`;
      ctx.lineWidth = 2.5 * a + 0.5;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r + (p.r2 - p.r) * (1 - a * a), 0, TAU); ctx.stroke();
    } else if (p.k === 5) {
      // плоское кольцо взрыва планеты — разлетается в плоскости, чуть наклонено
      const rx = p.rx0 + (p.rx1 - p.rx0) * (1 - a * a);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.tilt);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgb(${p.c})`;
      ctx.globalAlpha = a * 0.35;
      ctx.lineWidth = 16 * a + 2;
      ctx.beginPath(); ctx.ellipse(0, 0, rx, rx * 0.2, 0, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * 0.9;
      ctx.lineWidth = 5 * a + 1;
      ctx.stroke();
      ctx.restore();
    } else if (p.k === 6) {
      // «ёж» лучей — вспышка гигадетонатора (как его значок в Spore)
      const rr = p.r + (p.r2 - p.r) * (1 - a * a);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.strokeStyle = '#ffffff';
      ctx.lineCap = 'round';
      ctx.lineWidth = 2.2 * a + 0.5;
      ctx.beginPath();
      for (let i = 0; i < 20; i++) {
        const an = i * Math.PI / 10, l = (i % 2 ? 0.62 : 1) * rr, c = Math.cos(an), s = Math.sin(an);
        ctx.moveTo(c * rr * 0.22, s * rr * 0.22);
        ctx.lineTo(c * l, s * l);
      }
      ctx.stroke();
      ctx.restore();
    } else if (p.k === 7) {
      // линия скорости при разгоне
      ctx.globalAlpha = a * 0.35;
      ctx.strokeStyle = '#ffd1f3';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + p.len, p.y); ctx.stroke();
    } else {
      const e = p.e;
      glow(e.x + e.hx + Math.cos(p.ang) * p.d, e.hy + Math.sin(p.ang) * p.d * 0.42, p.r * 4, p.c, Math.min(1, p.t * 3) * 0.7);
    }
    ctx.globalAlpha = 1;
  }
}
function drawTexts() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 15px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.lineJoin = 'round';
  for (const t of texts) {
    if (t.hw == null) t.hw = ctx.measureText(t.s).width / 2 + 6;   // не вылезать за край узкого экрана
    const x = clamp(t.x, t.hw, Math.max(t.hw, W - t.hw));
    ctx.globalAlpha = Math.min(1, (1 - t.t / t.life) * 1.6);
    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(5,5,11,0.85)';
    ctx.strokeText(t.s, x, t.y);
    ctx.fillStyle = t.c;
    ctx.fillText(t.s, x, t.y);
  }
  ctx.globalAlpha = 1;
}

function drawFar(f, a) {
  if (!f || a <= 0) return;
  const x = f.x0 - (bgScroll - f.born) * 0.02;
  if (x + f.w < -10 || x - f.w > W + 10) return;
  ctx.save();
  ctx.globalAlpha = a * f.a;
  ctx.translate(x, f.y + f.w / 2);
  ctx.rotate(f.rot);
  ctx.drawImage(f.sp, -f.w / 2, -f.w / 2, f.w, f.w);
  ctx.restore();
}
function drawBackground() {
  const nw = H * 2, nx = -((bgScroll * 0.06) % nw);
  const layer = (sp, a) => {
    if (a <= 0) return;
    ctx.globalAlpha = a;
    for (let x = nx; x < W; x += nw) ctx.drawImage(sp, x, 0, nw, H);
    ctx.globalAlpha = 1;
  };
  if (paletteFade < 1) layer(nebulaBg(prevPaletteIdx), 1 - paletteFade);
  layer(nebulaBg(paletteIdx), paletteFade);
  if (prevFar && paletteFade < 1) drawFar(prevFar, 1 - paletteFade);
  drawFar(far, prevFar ? paletteFade : 1);
  // звёзды в три слоя; на прыжке вытягиваются в штрихи
  const span = W + 20;
  for (const s of stars) {
    const x = ((s.x * span - bgScroll * s.k) % span + span) % span - 10;
    ctx.fillStyle = s.col;
    ctx.fillRect(x, s.y, s.r + warp * 70 * s.k, s.r);
  }
}

// Луч антиматерии: белое ядро, фиолетовое сияние; фронт — волна во всю высоту
// (по нему и сносится всё впереди, см. updateBeam).
function drawBeam() {
  const a = 1 - beam.t / BEAM_TIME, x0 = shipX() + 34, x1 = Math.min(beam.front, W + 40), y = beam.y;
  const hh = (14 + 22 * Math.min(1, beam.t * 8)) * (0.6 + 0.4 * a) + Math.sin(time * 40) * 2;
  const po = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createLinearGradient(0, y - hh, 0, y + hh);
  g.addColorStop(0, 'rgba(150,90,255,0)');
  g.addColorStop(0.3, 'rgba(160,110,255,0.55)');
  g.addColorStop(0.46, 'rgba(225,215,255,0.95)');
  g.addColorStop(0.5, 'rgba(255,255,255,1)');
  g.addColorStop(0.54, 'rgba(225,215,255,0.95)');
  g.addColorStop(0.7, 'rgba(160,110,255,0.55)');
  g.addColorStop(1, 'rgba(150,90,255,0)');
  ctx.globalAlpha = Math.min(1, a * 1.5);
  ctx.fillStyle = g;
  ctx.fillRect(x0, y - hh, x1 - x0, hh * 2);
  if (beam.front < W + 120) {
    ctx.globalAlpha = 0.85 * a;
    ctx.drawImage(glowSprite('190,150,255'), x1 - 45, -60, 90, H + 120);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x1 - 1.5, 0, 3, H);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = po;
  glow(x0, y, 90 + 40 * a, '200,160,255', a);
}

function render() {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05050b';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const k = scale * dpr, sh = shake > 0 ? shake * 8 : 0;
  ctx.setTransform(k, 0, 0, k, rand(-sh, sh) * k, rand(-sh, sh) * k);
  drawBackground();
  drawMarks();
  const vis = (e) => e.x < W + 150 && e.x + e.w > -150;
  for (const e of encounters) if (e.kind === 'nebula' && vis(e)) drawNebulaGlow(e);
  for (const e of encounters) if (vis(e)) drawEncounter(e);
  for (const p of pickups) if (p.x > -30 && p.x < W + 30) drawPickup(p);
  for (const b of bolts) drawBolt(b);
  for (const g of groxes) drawGroxLayer(g);
  drawParticles();
  if (shots.length) drawShots();
  if (beam) drawBeam();
  if (ship.alive) {
    const blink = ship.invuln > 0 ? (Math.sin(time * 30) > 0 ? 0.35 : 0.9) : 1;
    drawPhenom(shipX(), ship.y, shipAngle(), blink);
    if (ship.shield) drawShield(shipX(), ship.y, shipAngle());
    if (ship.grav > 0) drawGravShield(shipX(), ship.y, shipAngle());
  }
  drawTexts();
  if (ship.alive && ship.gd > 0) drawGdHud();
  if (ship.alive && ship.wpn) drawWpnHud(ship.gd > 0 ? 36 : 0);
  if (flash > 0) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // «Уменьшить движение» — вспышка вчетверо слабее (белый экран на миг).
    ctx.fillStyle = `rgba(255,255,255,${(flash * (reduceMotion ? 0.11 : 0.45)).toFixed(3)})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
}

// Полоска оружия: над полоской режима корабля, если она тоже есть.
function drawWpnHud(up) {
  const w_ = ship.wpn, def = WEAPONS[w_.kind];
  const k = w_.kind === 'shotgun' ? w_.left / w_.total : Math.max(0, w_.t / w_.total);
  const w = Math.min(200, W - 70), x = (W - w) / 2, y = H - 26 - up;
  ctx.fillStyle = 'rgba(24,14,8,0.72)';
  ctx.fillRect(x - 8, y - 19, w + 16, 30);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = `rgb(${def.col})`;
  const left = w_.kind === 'shotgun' ? `залпов: ${w_.left}` : `${Math.ceil(w_.t)} с`;
  ctx.fillText(`⚡ ${def.name} · ${left}`, W / 2, y - 5);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, y + 1, w, 4);
  ctx.fillStyle = `rgb(${def.col})`;
  ctx.fillRect(x, y + 1, w * k, 4);
}

// Полоска режима корабля внизу: сколько осталось; последние 2 с мигает.
function drawGdHud() {
  const k = ship.gd / GD_TIME, w = Math.min(200, W - 70), x = (W - w) / 2, y = H - 26;
  ctx.fillStyle = 'rgba(16,10,24,0.72)';
  ctx.fillRect(x - 8, y - 19, w + 16, 30);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '700 12px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = ship.gd < 2 && Math.sin(time * 16) > 0 ? '#ffffff' : '#ff9be6';
  ctx.fillText(`🚀 держи — вверх · ${Math.ceil(ship.gd)} с`, W / 2, y - 5);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(x, y + 1, w, 4);
  ctx.fillStyle = '#ff5fd0';
  ctx.fillRect(x, y + 1, w * k, 4);
}

function frame(t) {
  raf = requestAnimationFrame(frame);
  // Под читалкой комикса холст не виден — не считаем и не рисуем (v=202).
  if (comicOpen) { lastT = 0; return; }
  if (!lastT) lastT = t;
  const real = Math.min(0.05, (t - lastT) / 1000);  // свернули/вернулись — без рывка
  lastT = t;
  if (paused) { render(); return; }
  let ts = 1;
  if (slowmo > 0) {      // после взрыва планеты время на миг замедляется и разгоняется обратно
    ts = 1 - 0.7 * clamp(slowmo / SLOWMO, 0, 1);
    slowmo = Math.max(0, slowmo - real);
  }
  acc += real * ts;
  /* Равные шаги не длиннее STEP на каждый кадр (v=202, аудит): раньше целые
     шаги 1/120 с с остатком давали на 90 Гц шаблон 1-1-2 шага за кадр — каждый
     третий кадр мир прыгал вдвое дальше (рывки). Теперь кадр делится поровну:
     на 90 Гц — всегда 2 шага по 5.6 мс, на 60 Гц — 2–3 шага, движение ровное. */
  const n = Math.ceil(acc / STEP - 1e-9);
  if (n > 0) {
    const dt = acc / n;
    for (let i = 0; i < n; i++) update(dt);
    acc = 0;
  }
  render();
}

/* ---------- Открыть / закрыть ---------- */
export function openFlappy() {
  if (!built) build();
  // Без localStorage рекорд и страницы живут хотя бы до перезагрузки (v=202).
  best = Math.max(best || 0, loadBest());
  unlocked = Math.max(unlocked || 1, loadComic());
  loadSightings();
  overlay.classList.add('open');
  resize();
  reset();
  paused = false; if (pauseEl) pauseEl.hidden = true;
  downPointers.clear(); keyHeld = false;
  lastT = 0; acc = 0;
  // Фокус в игру (клавиатура/экранный диктор), назад — туда, откуда пришли.
  returnFocus = document.activeElement;
  overlay.querySelector('.flappy-close').focus({preventScroll: true});
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

let returnFocus = null;
function closeFlappy() {
  overlay.classList.remove('open');
  cancelAnimationFrame(raf);
  raf = 0;
  state = 'ready';
  paused = false;
  if (returnFocus && returnFocus.isConnected) returnFocus.focus({preventScroll: true});
  returnFocus = null;
}
