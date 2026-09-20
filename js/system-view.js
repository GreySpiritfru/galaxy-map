/* ============================================================
   П.3: полноэкранный просмотр системы + переключатель
   ============================================================ */
import { createPanZoom } from './panzoom.js?v=123';
import { openIframeModal, closeModal, isArticleOpen, isDockedWith, escapeHtml } from './modal.js?v=123';

const systemOverlay = document.getElementById('systemOverlay');
const systemContainer = document.getElementById('systemContainer');
const systemMapTab = document.getElementById('systemMapTab');
const systemLoreBtn = document.getElementById('systemLore');
const systemLoreLabel = systemLoreBtn.querySelector('.tabbar-btn-label');
const systemToolbarEl = document.querySelector('.system-toolbar');

// "Карта системы" <-> "Контролирующая раса" — переключение между вкладками
// НИКОГДА не пересоздаёт саму карту: #systemContainer (SVG + пан/зум) не
// трогается вообще, меняется только то, открыта ли поверх статья (модал с
// iframe). Поэтому возврат на "Карту системы" всегда показывает ровно ту же
// карту с тем же положением/масштабом, что была до открытия статьи — это не
// отдельная функциональность, а прямое следствие того, что openIframeModal
// работает поверх системы, а не вместо неё.
// Экспортирована ради js/navigation.js: система — единственный тулбар,
// который НЕ участвует в общем closeTop()/морфинге ✕↔↩ (13.09.2026, по
// замечанию игрока — тут переключение между двумя равноправными вкладками
// в одном ряду, а не drill-down, отдельная стрелка "назад" там не нужна).
// Но ESC/BackButton/history браузера всё равно должны уметь закрыть именно
// открытый лор расы, а не всю систему целиком — и должны сделать это ТЕМИ
// ЖЕ действиями, что и клик по вкладке "Карта системы" (иначе класс .active
// у вкладок не обновится, и "Контролирующая раса" останется подсвеченной
// поверх уже закрытой статьи). Поэтому navigation.js импортирует именно эту
// функцию, а не голый closeModal().
export function showSystemMap() {
  if (isDockedWith(systemToolbarEl)) closeModal();
  systemMapTab.classList.add('active');
  systemLoreBtn.classList.remove('active');
}

// Открыта ли сейчас именно статья системы (а не окно сюжета/персонажа поверх
// неё) — для closeTop в js/navigation.js.
export function isSystemLoreOpen() {
  return isSystemOpen() && isDockedWith(systemToolbarEl);
}
systemMapTab.addEventListener('click', showSystemMap);

document.getElementById('systemBack').addEventListener('click', () => {
  // Та же кнопка используется и в самом виде системы, и (пристыкованная)
  // поверх открытого лора расы — если сейчас читаем статью, "назад" должно
  // просто закрыть её и вернуть к виду системы, а не выкидывать сразу в
  // карту галактики (баг был именно в этом: closeSystem() дёргался всегда).
  if (isArticleOpen()) showSystemMap();
  else closeSystem();
});

// systems/lore.json — соответствие слаг системы -> ссылка на статью (например, Teletype),
// которая откроется по кнопке рядом с "Назад к карте". Формат:
// { "имя_слага": { "label": "Контролирующая раса", "url": "https://teletype.in/..." } }
// Грузится один раз при старте страницы, параллельно со всем остальным.
const LORE_PATH = 'systems/lore.json';
const loreDataPromise = (async () => {
  try {
    const resp = await fetch(LORE_PATH, {cache:'no-cache'});
    const data = await resp.json();
    return (data && typeof data === 'object') ? data : {};
  } catch (e) {
    return {}; // файла нет или он битый — просто не показываем кнопку лора, не ошибка
  }
})();

// Открыт ли вид системы сейчас — нужно снаружи (js/navigation.js), чтобы
// единый "шаг назад" (ESC/Telegram BackButton/history браузера) знал, что
// именно сейчас закрывать. Работает и когда поверх системы открыта статья —
// depth() в navigation.js считает оба слоя отдельно.
export function isSystemOpen() {
  return systemOverlay.classList.contains('open');
}

export function closeSystem() {
  closeModal(); // на случай, если открыт лор поверх системы — не оставлять его висеть над картой
  systemOverlay.classList.remove('open');
  systemContainer.innerHTML = '';
  systemLoreBtn.classList.remove('visible');
  systemLoreBtn.onclick = null;
  current = null;
  setSystemTabs([]);
  // Закрыли посреди выбора места (✕/«назад») — редактор вернётся к форме.
  if (systemPickHandler) {
    const abort = systemPickAbort;
    systemPickHandler = systemPickAbort = null;
    if (abort) abort();
  }
}

/* ============================================================
   Что внутри системы (17.09.2026): сюжеты/локации с "parent": "system:<слаг>"
   и systemX/systemY — координатами в единицах SVG системы. Сам этот модуль про
   граф ничего не знает: map.js регистрирует декоратор, который рисует маркеры
   в SVG открытой системы и отдаёт вкладки для таб-бара.
   ============================================================ */
let systemDecorator = null;
// decorate({slug, svg, pz, focusId}) — вызывается после вставки SVG системы.
export function setSystemDecorator(fn) { systemDecorator = fn; }

// Открытая система: слаг, её SVG и пан/зум — повторный вход в ту же систему
// (кнопка «Система» из окна сюжета) не пересоздаёт карту, только наводит камеру.
let current = null;
export function getOpenSystem() { return current; }

// Вкладки того, что внутри системы: [{id, icon, label}] → onSelect(id).
export function setSystemTabs(items, onSelect) {
  systemToolbarEl.querySelectorAll('.system-child-tab').forEach(el => el.remove());
  items.forEach(item => {
    const btn = document.createElement('button');
    btn.className = 'tabbar-btn system-child-tab';
    btn.innerHTML = '<span class="tabbar-btn-icon" aria-hidden="true"></span><span class="tabbar-btn-label"></span>';
    btn.querySelector('.tabbar-btn-icon').textContent = item.icon;
    btn.querySelector('.tabbar-btn-label').textContent = item.label;
    btn.title = item.label;
    btn.addEventListener('click', () => {
      // Статья расы пристыкована к этому же ряду — сначала закрыть её, иначе
      // окно сюжета откроется ПОД ней (модал выше по z-index).
      showSystemMap();
      onSelect(item.id);
    });
    systemToolbarEl.appendChild(btn);
  });
}

// Выбор места тапом внутри системы — для редактора (map.js, pickInSystem).
let systemPickHandler = null;
let systemPickAbort = null;
export function setSystemPickHandler(fn, onAbort) {
  systemPickHandler = fn;
  systemPickAbort = fn ? (onAbort || null) : null;
}
// Идёт ли сейчас выбор места (долгое нажатие по маркеру в это время — не
// «перейти в ноды», а обычный тап, то есть выбор точки).
export function isSystemPicking() { return !!systemPickHandler; }
// Тап по маркеру во время выбора места — тоже место, а не открытие окна.
export function trySystemPick(p) {
  if (!systemPickHandler) return false;
  const handler = systemPickHandler;
  systemPickHandler = systemPickAbort = null;
  handler(p);
  return true;
}

// slug из названия системы -> ожидаемое имя файла systems/<slug>.svg
// (нужен и map.js — для подсветки уже готовых систем по списку из manifest.json)
// Знаки, запрещённые в именах файлов Windows (\ / : * ? < > |), заменяются на
// «_»: у части систем в экспорте StellarMaps вместо буквы «?» («?-UX71»), и
// файл с таким именем на Windows не создать — теперь это «_-ux71.svg».
// Проще — переименовать подпись в systems/names.json (см. map.js).
export function slugify(name) {
  return name.trim().toLowerCase()
    .replace(/['"«»]/g, '')
    .replace(/[\\/:*?<>|]/g, '_')
    .replace(/\s+/g, '_');
}

const systemCache = {};

/* Карту системы с 17.09.2026 может залить и бот («загрузить систему», файл
   проверяет map_systems.py на сервере). Вторая линия защиты — здесь: SVG
   разбирается в инертном <template> (скрипты не выполняются, картинки не
   грузятся), всё исполняемое и внешние ссылки выкидываются до вставки. */
const UNSAFE_SVG_TAGS = new Set(['script', 'foreignobject', 'iframe', 'object', 'embed', 'audio', 'video']);
function sanitizeSvg(svgText) {
  const tpl = document.createElement('template');
  tpl.innerHTML = svgText;
  tpl.content.querySelectorAll('*').forEach(el => {
    if (UNSAFE_SVG_TAGS.has(el.localName.toLowerCase())) { el.remove(); return; }
    [...el.attributes].forEach(attr => {
      const name = attr.name.toLowerCase();
      const value = attr.value.replace(/\s+/g, '').toLowerCase();
      const isHref = name === 'href' || name === 'xlink:href';
      if (name.startsWith('on') || value.includes('javascript:') ||
          (isHref && !value.startsWith('#') && !value.startsWith('data:image/'))) {
        el.removeAttribute(attr.name);
      }
    });
  });
  return tpl.content;
}

/* opts.focusId — навести камеру на маркер этой точки внутри системы (переход
   из окна сюжета «🪐 Система», значок у подписи на карте галактики). */
export async function openSystem(name, opts = {}) {
  const slug = slugify(name);
  // Та же система уже открыта (например, под окном сюжета) — не пересоздаём
  // карту и не сбрасываем зум, только наводим камеру.
  if (isSystemOpen() && current && current.slug === slug) {
    if (systemDecorator) systemDecorator({slug, svg: current.svg, pz: current.pz, focusId: opts.focusId});
    return;
  }
  systemOverlay.classList.add('open');
  systemContainer.innerHTML = '';
  current = {slug, svg: null, pz: null};
  const opened = current;
  // Свежий вход в систему — всегда с активной вкладки "Карта системы",
  // независимо от того, в каком состоянии остался тулбар от предыдущей
  // открытой системы.
  systemMapTab.classList.add('active');
  systemLoreBtn.classList.remove('active');

  // Кнопка "Контролирующая раса" (или как её назовут в lore.json) — показываем,
  // только если для этой системы есть запись. Настраиваем её независимо от того,
  // готова ли сама карта системы (пусть работает даже пока карта в разработке).
  const loreData = await loreDataPromise;
  const lore = loreData[slug];
  if (lore && lore.url) {
    systemLoreLabel.textContent = lore.label || 'Контролирующая раса';
    systemLoreBtn.classList.add('visible');
    systemLoreBtn.onclick = () => {
      // Повторный клик, когда статья уже открыта именно с этой панелью —
      // не переоткрывать: openIframeModal() заново "пристыковывает" панель,
      // считая её текущее (уже пристыкованное) место точкой возврата — из-за
      // этого при закрытии панель возвращалась не в системный вид, а внутрь
      // уже скрытого модала, и пропадала вместе с ним (баг, найденный на
      // сценарии "открыть лор -> открыть лор ещё раз -> закрыть").
      if (isDockedWith(systemToolbarEl)) return;
      systemMapTab.classList.remove('active');
      openIframeModal(lore.url, systemToolbarEl, systemLoreBtn);
    };
  } else {
    systemLoreBtn.classList.remove('visible');
    systemLoreBtn.onclick = null;
  }

  let svgText = systemCache[slug];

  if (!svgText) {
    try {
      const resp = await fetch(`systems/${encodeURIComponent(slug)}.svg`, {cache:'no-cache'});
      // Проверяем именно 404, а не resp.ok — resp.ok ложно считается false и на статусе
      // 304 (Not Modified из кэша), из-за чего реально загрузившийся файл принимался
      // бы за отсутствующий.
      if (resp.status === 404) throw new Error('not found');
      svgText = await resp.text();
      systemCache[slug] = svgText;
    } catch (err) {
      if (current !== opened) return;
      systemContainer.innerHTML = `
        <div class="system-placeholder">
          <div>
            <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${escapeHtml(name)}</div>
            <div>Карта этой системы не исследована игроками, либо ещё не готова.</div>
          </div>
        </div>`;
      // Вкладки того, что внутри, — даже без карты.
      if (systemDecorator) systemDecorator({slug, svg: null, pz: null, focusId: null});
      return;
    }
  }
  // Пока качался файл, окно закрыли или открыли другую систему.
  if (current !== opened) return;

  systemContainer.appendChild(sanitizeSvg(svgText));
  const innerSvg = systemContainer.querySelector('svg');
  if (innerSvg) {
    innerSvg.style.width = '100%';
    innerSvg.style.height = '100%';
    innerSvg.style.display = 'block';
    // Той же защиты, что стоит у главной карты (.svg-widget svg), тут не было —
    // отсюда выделение текста и рывки при перетаскивании внутри системы.
    innerSvg.style.touchAction = 'none';
    innerSvg.style.userSelect = 'none';
    innerSvg.style.webkitUserSelect = 'none';
    const pz = createPanZoom(innerSvg, {
      zoomOutLimit: 1,
      boundsPad: 0,
      onClick: (p) => { trySystemPick(p); },
    });
    current.svg = innerSvg;
    current.pz = pz;
  }
  if (systemDecorator) systemDecorator({slug, svg: current.svg, pz: current.pz, focusId: opts.focusId});
}
