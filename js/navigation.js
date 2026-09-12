/* ============================================================
   Единый "шаг назад" — общая точка выхода для трёх независимых триггеров:
   ESC на компьютере, кнопка BackButton в шапке Telegram Mini App (и на
   телефоне, и в Telegram Desktop), и History API обычного браузера вне
   Telegram (кнопка/жест "назад", включая мобильный свайп с края экрана).

   ⚠️ Жест/аппаратная кнопка "назад" ВНУТРИ самого Telegram (Android — общий
   свайп, iOS — свайп с края) до страницы вообще не долетают и ничего тут не
   триггерят — Telegram резервирует их под сворачивание/закрытие всего
   мини-приложения, это подтверждено официальным issue в репозитории
   Telegram-iOS (открыт с 2023, до сих пор без ответа). Единственный хук
   ВНУТРИ Telegram — именно кнопка BackButton (стрелка в шапке), поэтому она
   показывается/прячется по факту вручную, а не пробрасывается откуда-то
   ещё. Вне Telegram (обычная ссылка в браузере) это не проблема — там
   работает обычный History API, включая мобильный жест.

   Навигация в проекте — не произвольный стек экранов, а фиксированная
   вложенность максимум в 2 уровня: "модал" (карточка маркера, статья-
   справочник, окно персонажа — все три через один и тот же #modalBackdrop,
   см. modal.js) поверх ЛИБО системы/Феном/сюжета, ЛИБО голой карты. Поэтому
   "шаг назад" — не история конкретных экранов, а просто "закрыть самый
   верхний уровень" — ТА ЖЕ функция, что и у его собственного крестика/тапа
   по фону. Этого достаточно, чтобы закрыть анкету персонажа и вернуться в
   сюжет позади неё, закрыть статью и вернуться в систему/Феном, или закрыть
   систему/Феном/сюжет и вернуться на карту.
   ============================================================ */
import { closeModal, isArticleOpen } from './modal.js?v=50';
import { closeSystem, isSystemOpen } from './system-view.js?v=50';
import { closePhenom, isPhenomOpen } from './phenom.js?v=50';
import { closeStory, isStoryOpen } from './stories.js?v=50';

// 0 — голая карта галактики, 1 — один слой поверх (система/Феном/сюжет ИЛИ
// модал сам по себе), 2 — модал поверх системы/Феном/сюжета разом.
function depth() {
  return (isArticleOpen() ? 1 : 0) + ((isSystemOpen() || isPhenomOpen() || isStoryOpen()) ? 1 : 0);
}

// Закрывает ровно один верхний уровень — приоритет совпадает с z-index
// слоёв (модал выше всего, см. грабли №7), поэтому если он открыт —
// закрываем именно его, а не то, что может быть под ним.
function closeTop() {
  if (isArticleOpen()) { closeModal(); return; }
  if (isSystemOpen()) { closeSystem(); return; }
  if (isPhenomOpen()) { closePhenom(); return; }
  if (isStoryOpen()) { closeStory(); return; }
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

// Слои открываются/закрываются из четырёх разных модулей (modal/system-view/
// phenom/stories) — вместо того, чтобы дёргать sync() из каждого из них,
// смотрим на сам DOM: один MutationObserver разом на все четыре оверлея.
// Несколько .observe() на ОДНОМ экземпляре батчатся в один вызов колбэка —
// поэтому "закрыли одно и тут же открыли другое за один синхронный клик"
// (например, закрыть Феном и тут же открыть его сюжет по вкладке) даёт один
// sync(), а не два, и если итоговая глубина не изменилась — история вообще
// не трогается.
function sync() {
  const d = depth();
  if (tg && tg.BackButton) { d > 0 ? tg.BackButton.show() : tg.BackButton.hide(); }
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

const observer = new MutationObserver(sync);
['modalBackdrop', 'systemOverlay', 'phenomOverlay', 'storyOverlay'].forEach(id => {
  observer.observe(document.getElementById(id), { attributes: true, attributeFilter: ['class'] });
});
