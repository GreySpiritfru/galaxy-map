/* ============================================================
   Обучение по шагам (25.09.2026, v=155) — этап 3 плана «новичку понятно,
   куда зайти». Запуск — кнопка «🎓 Пройти обучение» в подсказке «?» (она
   пульсирует, пока обучение ни разу не запускали) или ссылка
   ?open=tour / startapp=tour.

   Шаг = что подсветить + текст. Затемнение с вырезом вокруг цели
   (.tour-hole — box-shadow на весь экран), прыгающая стрелка к вырезу,
   карточка с «Назад / Далее» на свободной половине экрана. Каждый шаг САМ
   приводит интерфейс в нужное состояние (prepare): закрывает окна, включает
   ноды по разделам, открывает сюжет — поэтому «Назад» работает с любого
   шага, где бы игрок ни был. Карту под затемнением трогать нельзя: всё
   управление — кнопками карточки.

   Управляет картой через крючки из map.js (registerTourHooks): режимы,
   раскладка, поиск сюжета. Сам тур про граф ничего не знает.

   ⚠️ Тексты — черновик из инфоканала (введение, «Что такое Феном», анкета),
   игрок обещал поправить. Править прямо здесь, в INTRO_TABS и STEPS.
   ============================================================ */
import { closeModal, isArticleOpen } from './modal.js?v=155';
import { closeStory, isStoryOpen } from './stories.js?v=155';
import { closePhenom, isPhenomOpen } from './phenom.js?v=155';
import { closeCharacter, isCharacterOpen } from './characters.js?v=155';
import { closeSystem, isSystemOpen } from './system-view.js?v=155';

const TOUR_SEEN_KEY = 'galaxyMapTourSeen';
const LINKS = {
  intro: 'https://t.me/Phenome_hub/20',
  rules: 'https://t.me/Phenome_hub/19',
  form: 'https://t.me/Phenome_hub/23',
  contacts: 'https://t.me/Phenome_hub/17',
};

const INTRO_TABS = [
  {title: 'О ролевой', html: `
    <p><b>Феном</b> — текстовая ролевая: космическая фантастика, магия и технологии в одной галактике. Первый пост — 2011 год.</p>
    <p>Вместо одной большой кампании — связанные сюжеты, у каждого своя тема и жанр: исследование систем, детективы, магические битвы, выживание, повседневность.</p>
    <p>Персонажи переходят между сюжетами, игроки сами становятся ведущими своих историй, а случившееся со временем становится лором.</p>`},
  {title: 'Феном', html: `
    <p><b>ЦМО «Феном»</b> — Центр Межгалактического Общения: корабль-город около 30 км в длину, таверна и дом для миллионов существ со всей галактики.</p>
    <p>Внутри — Феном-сити с искусственным небом, сменой дня и ночи и дождём. Корабль путешествует по звёздам и то и дело попадает в неприятности.</p>
    <p>Отсюда всё начинается: здесь находят напарников, берут контракты и улетают на другой конец галактики.</p>`},
  {title: 'Как вступить', html: `
    <p>Нужна анкета по шаблону: имя, раса (наша или своя), внешность с артом, краткая биография. Магия и импланты — по желанию. С анкетой помогут.</p>
    <p>Играем в литературном стиле, жёстких требований к размеру постов нет. Персонажа можно адаптировать из любимой вселенной.</p>
    <p>Дальше покажу, как устроена карта: где сюжеты с набором, где персонажи и справочник.</p>`},
];

/* Шаги после введения. target — элемент для выреза (null — без выреза, по
   центру); optional — нет цели, шаг пропускается в сторону движения. */
const STEPS = [
  {kind: 'intro'},
  {
    prepare: async h => { closeWindows(); await h.showSections(); },
    target: h => h.sectionFrame('recruit') || h.sectionFrame(),
    title: 'Все точки — по разделам',
    text: 'Это режим «Ноды», кнопка ▦ раскладывает точки по разделам. Сверху — <b>сюжеты, куда сейчас набирают игроков</b>, ниже — идущие сюжеты, локации, фракции, системы и архив.',
  },
  {
    prepare: async h => { closeWindows(); await h.showSections(); },
    target: h => h.plotEl(),
    optional: true,
    title: 'Сюжет',
    text: 'Круг с золотым кольцом — сюжет. Рядом — персонажи, которые в нём играют, пунктир — союзники. Скобка слева показывает, что к чему привязано.',
  },
  {
    prepare: async h => { await h.showSections(); await h.openPlot(); },
    target: () => topCard('.node-recruit') || topCard('.story-title'),
    optional: true,
    title: 'Окно сюжета',
    text: 'Тап по точке открывает её окно. Плашка <b>«Набор открыт»</b> — кого сейчас ищут. Ниже — описание, в архиве — все посты сюжета.',
  },
  {
    prepare: async h => { await h.showSections(); await h.openPlot(); },
    target: () => topCard('.node-head'),
    optional: true,
    title: 'Кнопки и переходы',
    text: 'Сверху — действия окна. Под ними — маркеры: ↑ то, к чему точка привязана, дальше персонажи. Язычок снизу открывает их списком. ✕ или «назад» — закрыть.',
  },
  {
    prepare: async () => { closeWindows(); },
    target: () => document.getElementById('openHandbook'),
    title: 'Справочник',
    text: 'Статьи о мире: расы, магия, техника, описание галактики и Фенома.',
  },
  {
    prepare: async () => { closeWindows(); },
    target: () => document.getElementById('viewSwitch'),
    title: 'Ноды, карта, графика',
    text: '<b>Карта</b> — галактика с границами фракций: бирюзовые названия систем открывают карту системы. <b>Графика</b> — та же карта без границ. <b>Ноды</b> — все точки и связи.',
  },
  {kind: 'finish'},
];

let hooks = null;
let hooksWaiters = [];
// map.js отдаёт крючки, когда граф построен. До этого тур ждёт.
export function registerTourHooks(h) {
  hooks = h;
  hooksWaiters.forEach(fn => fn());
  hooksWaiters = [];
}
const hooksReady = () => hooks ? Promise.resolve() : new Promise(res => hooksWaiters.push(res));

const sleep = (ms) => new Promise(res => setTimeout(res, ms));

// Закрываем только открытое: у closeSystem/closePhenom есть побочные действия
// (сброс карты системы, отмена выбора места в редакторе).
function closeWindows() {
  if (isArticleOpen()) closeModal();
  if (isCharacterOpen()) closeCharacter();
  if (isStoryOpen()) closeStory();
  if (isPhenomOpen()) closePhenom();
  if (isSystemOpen()) closeSystem();
}

// Элемент в самом верхнем открытом окне точки (персонаж → сюжет → локация).
function topCard(sel) {
  for (const id of ['charOverlay', 'storyOverlay', 'phenomOverlay']) {
    const layer = document.getElementById(id);
    if (layer && layer.classList.contains('open')) return layer.querySelector(sel);
  }
  return null;
}

function openLink(url) {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.platform !== 'unknown' && /^https:\/\/t\.me\//.test(url) && tg.openTelegramLink) tg.openTelegramLink(url);
  else window.open(url, '_blank', 'noopener');
}

/* ---------- Разметка оверлея (одна на всё обучение) ---------- */
const overlay = document.createElement('div');
overlay.id = 'tourOverlay';
overlay.className = 'tour-overlay';
overlay.innerHTML = `
  <div class="tour-hole"></div>
  <div class="tour-arrow" aria-hidden="true"></div>
  <div class="tour-card" role="dialog" aria-live="polite"></div>`;
document.body.appendChild(overlay);
const hole = overlay.querySelector('.tour-hole');
const arrow = overlay.querySelector('.tour-arrow');
const card = overlay.querySelector('.tour-card');

let index = 0;
let token = 0;          // перебивает недоделанный переход при быстром «Далее»
let introTab = 0;

export function isTourOpen() { return overlay.classList.contains('open'); }

export function closeTour() {
  token++;
  overlay.classList.remove('open');
}

export function tourSeen() {
  try { return !!localStorage.getItem(TOUR_SEEN_KEY); } catch (e) { return true; }
}

export async function startTour() {
  try { localStorage.setItem(TOUR_SEEN_KEY, '1'); } catch (e) {}
  closeWindows();
  introTab = 0;
  overlay.classList.add('open');
  await go(0, 1);
}

async function go(i, dir) {
  const my = ++token;
  index = i;
  const step = STEPS[i];
  if (step.kind === 'intro' || step.kind === 'finish') {
    placeHole(null);
    renderCard(step, null);
    return;
  }
  // Пока интерфейс перестраивается — карточку прячем, затемнение сплошное.
  card.classList.add('is-busy');
  arrow.classList.remove('show');
  await hooksReady();
  if (step.prepare) await step.prepare(hooks);
  // Окно доезжает анимацией (0.24 с), раскладка нод — перелётом: мерим после.
  await sleep(320);
  if (my !== token) return;
  const el = step.target ? step.target(hooks) : null;
  if (!el && step.optional) { go(i + dir, dir); return; }
  const rect = el ? el.getBoundingClientRect() : null;
  placeHole(rect && rect.width ? rect : null);
  renderCard(step, rect);
  card.classList.remove('is-busy');
}

// Шаги с вырезом — для счётчика «2 из 6» (введение и финал не в счёт).
const COUNTED = STEPS.filter(s => !s.kind);

function renderCard(step, rect) {
  const last = index === STEPS.length - 1;
  let body;
  if (step.kind === 'intro') {
    body = `
      <div class="tour-title">Добро пожаловать на Феном</div>
      <div class="tour-tabs" role="tablist">${INTRO_TABS.map((t, i) =>
        `<button type="button" class="tour-tab${i === introTab ? ' active' : ''}" data-tab="${i}">${t.title}</button>`).join('')}</div>
      <div class="tour-text tour-intro">${INTRO_TABS[introTab].html}</div>
      <div class="tour-links">
        <button type="button" class="tour-link" data-link="intro">📄 Введение в канале</button>
        <button type="button" class="tour-link" data-link="rules">📜 Правила</button>
      </div>`;
  } else if (step.kind === 'finish') {
    body = `
      <div class="tour-title">Хочешь играть?</div>
      <div class="tour-text">
        <p>Выбери сюжет с плашкой <b>«Набор открыт»</b> или приходи со своей идеей персонажа. Шаблон анкеты — в канале, с ней помогут.</p>
        <p>Обучение можно пройти ещё раз из «?» в углу карты.</p>
      </div>
      <div class="tour-links">
        <button type="button" class="tour-link" data-link="form">📝 Анкета</button>
        <button type="button" class="tour-link" data-link="contacts">✉️ Написать нам</button>
      </div>`;
  } else {
    const n = COUNTED.indexOf(step) + 1;
    body = `
      <div class="tour-count">${n} из ${COUNTED.length}</div>
      <div class="tour-title">${step.title}</div>
      <div class="tour-text"><p>${step.text}</p></div>`;
  }
  card.innerHTML = `${body}
    <div class="tour-actions">
      ${last ? '' : '<button type="button" class="tour-btn tour-btn--ghost" data-act="skip">Пропустить</button>'}
      <span class="tour-spacer"></span>
      ${index > 0 ? '<button type="button" class="tour-btn tour-btn--ghost" data-act="back">Назад</button>' : ''}
      <button type="button" class="tour-btn tour-btn--primary" data-act="${last ? 'done' : 'next'}">${last ? 'Готово' : 'Далее'}</button>
    </div>`;

  // Карточка — на свободной от выреза половине экрана.
  const vh = window.innerHeight;
  const holeMid = rect ? rect.top + rect.height / 2 : vh / 2;
  card.classList.toggle('at-top', !!rect && holeMid > vh * 0.55);
  card.classList.toggle('at-bottom', !!rect && holeMid <= vh * 0.55);
  card.classList.toggle('at-center', !rect);
}

// Вырез с запасом 6 px, не шире экрана. null — сплошное затемнение.
function placeHole(rect) {
  if (!rect) {
    hole.classList.add('is-empty');
    arrow.classList.remove('show');
    return;
  }
  const pad = 6, vw = window.innerWidth, vh = window.innerHeight;
  const x = Math.max(4, rect.left - pad), y = Math.max(4, rect.top - pad);
  const w = Math.min(vw - 4, rect.right + pad) - x;
  const h = Math.min(vh - 4, rect.bottom + pad) - y;
  hole.classList.remove('is-empty');
  Object.assign(hole.style, {left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px'});
  // Стрелка — со стороны карточки: вырез в верхней половине — стрелка под
  // ним, смотрит вверх; в нижней — над ним, смотрит вниз.
  const below = y + h / 2 <= vh * 0.55;
  const ax = Math.min(vw - 30, Math.max(30, x + w / 2));
  arrow.classList.toggle('up', below);
  arrow.style.left = ax + 'px';
  arrow.style.top = (below ? y + h + 8 : y - 36) + 'px';
  arrow.classList.add('show');
}

card.addEventListener('click', (e) => {
  const tab = e.target.closest('[data-tab]');
  if (tab) { introTab = +tab.dataset.tab; renderCard(STEPS[index], null); return; }
  const link = e.target.closest('[data-link]');
  if (link) { openLink(LINKS[link.dataset.link]); return; }
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (act === 'next') go(Math.min(index + 1, STEPS.length - 1), 1);
  else if (act === 'back') go(Math.max(index - 1, 0), -1);
  else if (act === 'skip' || act === 'done') closeTour();
});

// Поворот экрана / смена размера — перемерить цель текущего шага.
let resizeTimer = 0;
window.addEventListener('resize', () => {
  if (!isTourOpen()) return;
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => go(index, 1), 200);
});
