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
import { closeModal, isArticleOpen } from './modal.js?v=156';
import { closeStory, isStoryOpen } from './stories.js?v=156';
import { closePhenom, isPhenomOpen } from './phenom.js?v=156';
import { closeCharacter, isCharacterOpen } from './characters.js?v=156';
import { closeSystem, isSystemOpen } from './system-view.js?v=156';
import { quoteHtml, initQuotes } from './quotes.js?v=156';

const TOUR_SEEN_KEY = 'galaxyMapTourSeen';
const LINKS = {
  form: 'https://t.me/Phenome_hub/23',
  contacts: 'https://t.me/Phenome_hub/17',
};

/* Тексты введения — от игрока (25.09.2026, v=156), из постов инфоканала.
   Правила — те же, что в посте t.me/Phenome_hub/19, под сворачиваемыми
   цитатами, как там. */
const RULES_HTML = `
  <div class="tour-quote-title">Общие правила</div>
  ${quoteHtml(`Запрещены:<br>
    1. Оскорбления или издевательства, которые затронутый участник просит не повторять.<br>
    2. Агрессивная форма обсуждения расизма, политики; разжигание ненависти, дискриминации.<br>
    3. Угрозы в споре и переход на реальную личность, шантаж; целенаправленная провокация конфликтов и спам.<br>
    4. Призывы к массовым действиям, рекламе и отправке жалоб без предупреждения администрации.<br>
    5. Размещение порнографии и материалов с несовершеннолетними образами.<br>
    6. Экстремизм и иные запреты, установленные законодательством Российской Федерации.<br><br>
    — Сообщество предназначено для участников 18+.<br>
    — Правила распространяются на всю группу и чаты.<br>
    — Конструктивные споры и взаимные подколы не запрещаются.<br>
    — За нарушение администрация выносит предупреждение или исключение при повторных случаях.`)}
  <div class="tour-quote-title">Правила анкет</div>
  ${quoteHtml(`1. Под вопросом богоподобные персонажи без физических или психических слабостей.<br>
    2. Нежелательны прямые отсылки к ЛГБТ и другой социальной агитации.<br>
    3. Все основные игровые персонажи 18+. С трудом рассматриваем персонажей, намеренно создаваемых с образом/лицом ребёнка.`)}
  <div class="tour-quote-title">Правила постов</div>
  ${quoteHtml(`1. Если участник отсутствует более недели, оставив персонажа в активной игре, то предлагается рест — т.е. норма 1 пост в неделю. Нормы во флуде нет. О продолжении игры сообщается.<br><br>
    2. Все имеют право на отдых, поэтому участник может взять рест до любой даты или месяца. Если берётся рест, то другие игроки могут продолжать ролить без персонажа. Кроме этого каких-то других ограничений рест не накладывает.<br>
    2.1. Если участник попросил отыграть конкретные посты за него, то отыгрываются только конкретные посты.<br><br>
    3. Играем литературный стиль. Фактических требований для размера постов нет. Звёздочки в постах не используем, но красивые стили можем рассмотреть.<br>
    3.1. Убийство персонажа запрещено без обсуждения с его создателем, или если нет особенных условий для персонажа.<br>
    3.2. Если вы хотите сделать что-то, что вразрез идёт с предполагаемым сюжетом, то напишите, пожалуйста, об этом в общем чате.<br>
    3.3. Создатель сюжета является ведущим, если нет других условий. Его видение сюжета может учитываться при принятии решений.`)}`;

const INTRO_TABS = [
  {title: '1. О ролевой', html: `
    <div class="tour-badge">🚀 Основан в 2011 году — нам уже 15 лет</div>
    <p><b>ЦМО «Феном»</b> — текстовая ролевая, объединяющая космос, фантастику, магию и технологии в одной галактике.</p>
    <p>Вместо единой компании планируются связанные сюжеты, посвящённые своей теме и жанру: исследованию систем, запутанным детективам, магическим баталиям, выживанию в пустыне или даже повседневности на курорте. Со временем случившееся превращается в лор.</p>
    <p>Мы предлагаем идеи друг другу, становимся ведущими собственных историй, играем обычные будни, если хотим отдохнуть от сложных сюжетов, либо присоединяемся к уже идущим приключениям. Наши персонажи могут путешествовать между сюжетами, постепенно развиваться, менять взгляды на мир, общаться за чашечкой кофе, либо сражаться за свою жизнь, если так складывается их судьба.</p>`},
  {title: '2. Про Феном', html: `
    <p><b>ЦМО «Феном»</b> — идея социальной площадки и точки интереса. Сокращение появилось из названия: «Центр Межгалактического Общения», чем является огромный космический корабль Феном, совмещающий в себе эпичную таверну и город для миллионов существ. Это чудо путешествует по звёздам, попадая в самые разные миры и проблемные ситуации. Вы можете исследовать его бесконечные улочки, либо попробовать в местном баре фирменный напиток «Жижа», разливаемый только на Феноме.</p>
    <p>Корабль-город удобен для сюжетов, но не обязан быть в центре внимания. Скорее он стал символом и местом, откуда всё началось.</p>
    <p>Внутри корабля процветает <b>«Феном-сити»</b> — настоящий космический город! Он занимает около 20 километров центрального пространства корабля, когда сам Феном по размерам порядка 30 км в длину и более 10 км в ширину. В городе воссоздали искусственное небо, имитацию поверхности планеты, смену дня и ночи, симуляцию дождя, снегопада… Здесь расположены поддерживающие опоры до небес, толпы туристов в отелях, фермы, леса, реки, заводы и множество других районов, что делают его оригинальным местом для жизни.</p>`},
  {title: '3. Как вступить', html: `
    <p>Для вступления необходима только анкета по нашему шаблону: имя, раса, внешность с артом, голос, краткая биография и снаряжение. Магия, импланты, средство передвижения и язык — по желанию.</p>
    <p>Помогаем составить анкету и предлагаем совместно разбирать, какая раса, магия или имплант вам подходит, но не запрещаем решать самостоятельно. Определим вашу расу, либо предложим создать свою. Рассматриваем персонажей из других фандомов, но с интеграцией в наш лор.</p>
    <div class="tour-links">
      <button type="button" class="tour-link" data-link="contacts">✉️ Связаться с нами</button>
      <button type="button" class="tour-link" data-link="form">📝 Шаблон анкеты</button>
    </div>`},
  {title: '4. Правила', html: RULES_HTML},
];

/* Шаги после введения. target — элемент для выреза (null — без выреза, по
   центру); optional — нет цели, шаг пропускается в сторону движения.
   Тексты — с правками игрока (v=156): «маркеры», а не «точки». */
const STEPS = [
  {kind: 'intro'},
  {
    prepare: async h => { closeWindows(); await h.showSections(); },
    target: h => h.sectionFrame('recruit') || h.sectionFrame(),
    title: 'Все маркеры — по каталогу',
    text: 'Это режим «Ноды», кнопка ▦ справа вверху раскладывает маркеры по разделам. Сверху — <b>сюжеты, куда сейчас набирают игроков</b>, ниже — идущие сюжеты, локации, базовые маркеры, системы и архив.',
  },
  {
    prepare: async h => { closeWindows(); await h.showSections(); },
    target: h => h.plotEl(),
    optional: true,
    title: 'Сюжет',
    text: 'Круг с золотым кольцом — сюжет. Рядом — персонажи, которые в нём играют, пунктир — союзники. Линия слева связывает маркеры, которые зависят друг от друга или находятся рядом: например, сюжет, идущий на Феноме, и сам Феном.',
  },
  {
    prepare: async h => { await h.showSections(); await h.openPlot(); },
    target: () => topCard('.node-recruit') || topCard('.story-title'),
    optional: true,
    title: 'Окно сюжета',
    text: 'Тап по маркеру открывает его описание. Плашка <b>«Набор открыт»</b> — кого сейчас ищут. В архиве хранятся все посты сюжета.',
  },
  {
    prepare: async h => { await h.showSections(); await h.openPlot(); },
    target: () => topCard('.node-head'),
    optional: true,
    title: 'Панель окна',
    text: 'На верхней панели — маркеры: ↑ то, к чему маркер привязан, и персонажи, которые находятся в этом сюжете или локации. Язычок снизу открывает их списком. ✕ или «назад» — закрыть.',
  },
  {
    // Про 🏷️ — поэтому на карту: в нодах на её месте ▦.
    prepare: async h => { closeWindows(); await h.showMap(); },
    target: () => document.getElementById('controls'),
    title: 'Переходы',
    text: '<b>Справочник</b> — статьи о мире: расы, магия, техника, описание галактики и Фенома. Под ним — переключатель карт и каталога нод.<br>🏷️ — меньше несгенерированных систем, если карта тормозит: останутся только бирюзовые, на которые можно нажать и перейти в саму систему.',
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
  /* Карточка: шапка (заголовок, вкладки) и кнопки стоят на месте, текст
     между ними прокручивается — длинная вкладка «Про Феном» или раскрытые
     правила не уносят кнопки за край экрана. */
  let head, text;
  if (step.kind === 'intro') {
    // Вкладки — одной сегментированной полосой, как «Ноды | Карта | Графика»:
    // номер сверху, подпись снизу (игрок: «кнопки объединить в одну линию»).
    head = `
      <div class="tour-title">Добро пожаловать на Феном!</div>
      <div class="tour-tabs" role="tablist">${INTRO_TABS.map((t, i) => {
        const [num, label] = t.title.split('. ');
        return `<button type="button" class="tour-tab${i === introTab ? ' active' : ''}" data-tab="${i}" role="tab">
          <span class="tour-tab-num">${num}</span><span class="tour-tab-label">${label}</span></button>`;
      }).join('')}</div>`;
    text = INTRO_TABS[introTab].html;
  } else if (step.kind === 'finish') {
    head = '<div class="tour-title">Хочешь играть?</div>';
    text = `
      <p>Выбери сюжет с плашкой <b>«Набор открыт»</b> или приходи со своей идеей персонажа — с анкетой поможем.</p>
      <p>Обучение можно пройти ещё раз из «?» в углу карты.</p>
      <div class="tour-links">
        <button type="button" class="tour-link" data-link="contacts">✉️ Связаться с нами</button>
        <button type="button" class="tour-link" data-link="form">📝 Шаблон анкеты</button>
      </div>`;
  } else {
    const n = COUNTED.indexOf(step) + 1;
    head = `
      <div class="tour-count">${COUNTED.map((_, i) => `<span class="tour-dot${i < n ? ' on' : ''}"></span>`).join('')}<span>${n} из ${COUNTED.length}</span></div>
      <div class="tour-title">${step.title}</div>`;
    text = `<p>${step.text}</p>`;
  }
  const nextLabel = last ? 'Готово' : (step.kind === 'intro' ? 'К карте и сюжетам →' : 'Далее');
  card.innerHTML = `
    <div class="tour-head">${head}</div>
    <div class="tour-text">${text}</div>
    <div class="tour-actions">
      ${last ? '' : '<button type="button" class="tour-btn tour-btn--ghost" data-act="skip">Пропустить</button>'}
      <span class="tour-spacer"></span>
      ${index > 0 ? '<button type="button" class="tour-btn tour-btn--ghost" data-act="back">Назад</button>' : ''}
      <button type="button" class="tour-btn tour-btn--primary" data-act="${last ? 'done' : 'next'}">${nextLabel}</button>
    </div>`;
  initQuotes(card);

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
