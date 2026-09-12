/* ============================================================
   П.3: полноэкранный просмотр системы + переключатель
   ============================================================ */
import { createPanZoom } from './panzoom.js?v=36';
import { openIframeModal, closeModal, isArticleOpen, isDockedWith } from './modal.js?v=36';

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
function showSystemMap() {
  if (isDockedWith(systemToolbarEl)) closeModal();
  systemMapTab.classList.add('active');
  systemLoreBtn.classList.remove('active');
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

function closeSystem() {
  closeModal(); // на случай, если открыт лор поверх системы — не оставлять его висеть над картой
  systemOverlay.classList.remove('open');
  systemContainer.innerHTML = '';
  systemLoreBtn.classList.remove('visible');
  systemLoreBtn.onclick = null;
}

// slug из названия системы -> ожидаемое имя файла systems/<slug>.svg
// (нужен и map.js — для подсветки уже готовых систем по списку из manifest.json)
export function slugify(name) {
  return name.trim().toLowerCase()
    .replace(/['"«»]/g, '')
    .replace(/\s+/g, '_');
}

const systemCache = {};

export async function openSystem(name) {
  systemOverlay.classList.add('open');
  systemContainer.innerHTML = '';
  // Свежий вход в систему — всегда с активной вкладки "Карта системы",
  // независимо от того, в каком состоянии остался тулбар от предыдущей
  // открытой системы.
  systemMapTab.classList.add('active');
  systemLoreBtn.classList.remove('active');

  const slug = slugify(name);

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
      systemContainer.innerHTML = `
        <div class="system-placeholder">
          <div>
            <div style="font-size:18px;font-weight:700;margin-bottom:8px;">${name}</div>
            <div>Карта этой системы не исследована игроками, либо ещё не готова.</div>
          </div>
        </div>`;
      return;
    }
  }

  systemContainer.insertAdjacentHTML('afterbegin', svgText);
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
    createPanZoom(innerSvg, { zoomOutLimit: 1, boundsPad: 0 });
  }
}
