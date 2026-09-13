/* ============================================================
   Единый "шаг назад" — общая точка выхода для трёх независимых триггеров:
   ESC на компьютере, кнопка BackButton в шапке Telegram Mini App (и на
   телефоне, и в Telegram Desktop), History API обычного браузера вне
   Telegram (кнопка/жест "назад", включая мобильный свайп с края экрана) —
   и (13.09.2026) видимой ✕/↩-кнопки в каждом тулбаре, которая теперь тоже
   вызывает эту же функцию, а не свою собственную логику в каждом модуле.

   ⚠️ Жест/аппаратная кнопка "назад" ВНУТРИ самого Telegram (Android — общий
   свайп, iOS — свайп с края) до страницы вообще не долетают и ничего тут не
   триггерят — Telegram резервирует их под сворачивание/закрытие всего
   мини-приложения, это подтверждено официальным issue в репозитории
   Telegram-iOS (открыт с 2023, до сих пор без ответа). Единственный хук
   ВНУТРИ Telegram — именно кнопка BackButton (стрелка в шапке), поэтому она
   показывается/прячется по факту вручную, а не пробрасывается откуда-то
   ещё. Вне Telegram (обычная ссылка в браузере) это не проблема — там
   работает обычный History API, включая мобильный жест.

   Глубина вложенности (13.09.2026) — НЕ фиксированный потолок в 2 уровня, а
   счётчик того, сколько независимых слоёв сейчас реально открыто разом:
   модал (карточка маркера/статья-справочник/окно персонажа — все три через
   один #modalBackdrop), сюжет (.story-overlay) и локация (.phenom-overlay,
   она же "Феном") могут быть открыты ОДНОВРЕМЕННО, если сюжет привязан к
   локации и был открыт вкладкой ИЗ её окна (см. setPhenomChildren в
   js/phenom.js) — тогда это 2 слоя, а персонаж, открытый чипом ИЗ этого
   сюжета, поверх них — уже 3. Система (.system-overlay) — отдельный,
   несвязанный с графом slot (не участвует в этом стекинге, см. isSystemOpen
   ниже и её собственное исключение из общего ✕↔↩-морфинга).

   Раз глубина — не фиксированный масштаб 0..2, а РЕАЛЬНЫЙ подсчёт открытых
   слоёв, "шаг назад" естественно обобщается на произвольную вложенность:
   закрыть самый верхний слой (та же функция, что и у его собственного
   крестика/тапа по фону) — этого достаточно, чтобы закрыть анкету
   персонажа и вернуться в сюжет позади неё, закрыть сюжет и вернуться в
   локацию (Феном) позади него, или закрыть локацию/сюжет и вернуться на
   карту. Полноценного стека КОНКРЕТНЫХ экранов ("вернуться туда же, откуда
   пришёл") всё ещё сознательно нет — см. обсуждение в истории сессии:
   вложенность считается по ТИПАМ слоёв (модал/сюжет/локация/система), а не
   по конкретным id узлов, этого достаточно для всех текущих сценариев.
   ============================================================ */
import { closeModal, isArticleOpen } from './modal.js?v=60';
import { closeSystem, isSystemOpen, showSystemMap } from './system-view.js?v=60';
import { closePhenom, isPhenomOpen } from './phenom.js?v=60';
import { closeStory, isStoryOpen } from './stories.js?v=60';

function depth() {
  let d = 0;
  if (isPhenomOpen()) d++;
  if (isStoryOpen()) d++;
  if (isSystemOpen()) d++;
  if (isArticleOpen()) d++;
  return d;
}

/* Закрывает ровно один верхний слой. Порядок — по фактическому z-index
   (см. грабли №7 и .story-overlay { z-index: 251 } в css/styles.css):
   модал (300) выше сюжета (251), сюжет выше локации/Фенома (250). Система
   (200) — отдельный случай: она не стекуется с сюжетом/локацией (это два
   независимых входа с самой карты галактики), но её ЛОР-статья тоже идёт
   через тот же #modalBackdrop — поэтому проверяем её ПЕРВОЙ и целиком
   делегируем её же собственной логике (showSystemMap/closeSystem), а не
   голому closeModal(): у системы двух вкладок есть свой class-based
   "активный таб", который обновляет только showSystemMap(), и просто
   закрыть модал в обход неё оставило бы "Контролирующую расу" подсвеченной
   поверх уже закрытой статьи. */
function closeTop() {
  if (isSystemOpen()) {
    if (isArticleOpen()) showSystemMap(); else closeSystem();
    return;
  }
  if (isArticleOpen()) { closeModal(); return; }
  if (isStoryOpen()) { closeStory(); return; }
  if (isPhenomOpen()) { closePhenom(); return; }
}

// --- ESC на компьютере (в т.ч. Telegram Desktop — это обычная веб-страница) ---
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && depth() > 0) closeTop();
});

// --- Telegram Mini App: кнопка BackButton в шапке (Bot API 6.1+) ---
const tg = window.Telegram && window.Telegram.WebApp;
if (tg && tg.BackButton) {
  tg.BackButton.onClick(closeTop);
}

// --- History API: кнопка/жест "назад" обычного браузера ---
// Флаги ниже разводят ДВЕ ситуации, которые иначе перепутались бы: "юзер
// нажал системное 'назад', мы в ответ закрываем слой" — не нужно ЕЩЁ РАЗ
// звать history.back() за этот же шаг; и "мы сами позвали history.back(),
// чтобы убрать лишнюю запись после закрытия крестиком/ESC/кнопкой Telegram" —
// пришедший от этого popstate не должен закрывать ещё один слой поверх.
let respondingToPopstate = false;
let ownBackCall = false;
let lastDepth = 0;

window.addEventListener('popstate', () => {
  if (ownBackCall) { ownBackCall = false; return; }
  if (depth() > 0) {
    respondingToPopstate = true;
    closeTop();
  }
});

/* Кнопки-крестики четырёх тулбаров (не системы, см. её собственное
   исключение выше и в css/styles.css) вешаются СЮДА, а не в своих модулях —
   closeTop() уже знает приоритет между всеми слоями разом, дублировать эту
   логику в articles.js/characters.js/phenom.js/stories.js незачем (было —
   каждый вручную проверял isArticleOpen() перед тем, как закрыть себя). */
['refToolbarClose', 'charToolbarClose', 'phenomClose', 'storyClose'].forEach(id => {
  document.getElementById(id).addEventListener('click', closeTop);
});

/* ✕ превращается в ↩, когда клик по ней реально вернёт к чему-то (глубина
   после клика останется > 0), а не отправит сразу на голую карту — так
   видно разницу между "закрыть совсем" и "подняться на уровень выше" без
   двух отдельных кнопок в ряду (была отдельная .toolbar-back-btn, убрана
   13.09.2026 — с ней ✕ и ↩ ВСЕГДА делали одно и то же, что и подсветил
   игрок: раз показывать ↩ только там, где закрытие не опустошает всё до
   карты, то это ровно то же условие, при котором ✕ и так уже вела бы туда
   же — тождественно морфить одну кнопку вместо второй хуже видимой). */
const morphButtons = ['refToolbarClose', 'charToolbarClose', 'phenomClose', 'storyClose']
  .map(id => document.getElementById(id));

function sync() {
  const d = depth();
  if (tg && tg.BackButton) { d > 0 ? tg.BackButton.show() : tg.BackButton.hide(); }
  const goesBack = d > 1;
  morphButtons.forEach(btn => {
    btn.textContent = goesBack ? '↩' : '✕';
    btn.setAttribute('aria-label', goesBack ? 'Назад' : 'Закрыть');
  });
  if (d > lastDepth) {
    history.pushState({}, '');
  } else if (d < lastDepth) {
    if (respondingToPopstate) {
      respondingToPopstate = false;
    } else {
      // Закрыли не через "назад" браузера (крестик/фон/ESC/кнопка Telegram) —
      // подчищаем за собой лишнюю запись в history, иначе следующий реальный
      // "назад" браузера откатит на состояние, где слой уже и так закрыт
      // (два нажатия вместо одного).
      ownBackCall = true;
      history.back();
    }
  }
  lastDepth = d;
}

// Слои открываются/закрываются из четырёх разных модулей (modal/system-view/
// phenom/stories) — вместо того, чтобы дёргать sync() из каждого из них,
// смотрим на сам DOM: один MutationObserver разом на все четыре оверлея.
// Несколько .observe() на ОДНОМ экземпляре батчатся в один вызов колбэка —
// поэтому "закрыли одно и тут же открыли другое за один синхронный клик"
// даёт один sync(), а не два, и если итоговая глубина не изменилась —
// история вообще не трогается.
const observer = new MutationObserver(sync);
['modalBackdrop', 'systemOverlay', 'phenomOverlay', 'storyOverlay'].forEach(id => {
  observer.observe(document.getElementById(id), { attributes: true, attributeFilter: ['class'] });
});
