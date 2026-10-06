// Точка входа: подключает все модули страницы. Порядок между articles.js/
// onboarding.js/map.js значения не имеет — каждый сам вешает свои обработчики
// на уже существующую в HTML разметку (модули выполняются после её разбора).
import './articles.js?v=205';
import './onboarding.js?v=205';
import './map.js?v=205';
import './navigation.js?v=205';

if (window.Telegram && window.Telegram.WebApp) {
  Telegram.WebApp.ready();
  Telegram.WebApp.expand();
  // Без этого свайп вниз по карте (обычное перетаскивание) распознаётся
  // Telegram'ом как жест "потянул — закрыл приложение". Метод появился
  // не в самых старых версиях Bot API, поэтому проверяем на всякий случай.
  // Метод в скрипте есть всегда, а клиент старше Bot API 7.7 его не знает и
  // пишет предупреждение в консоль — проверяем версию (v=202).
  if (typeof Telegram.WebApp.disableVerticalSwipes === 'function' &&
      Telegram.WebApp.isVersionAtLeast && Telegram.WebApp.isVersionAtLeast('7.7')) {
    Telegram.WebApp.disableVerticalSwipes();
  }
  // Полноэкранный режим (Bot API 8.0): вместо сплошной шапки Telegram —
  // плавающие кнопки «✕ Картограф» и «⌄ ⋮» поверх карты. Только телефон:
  // на компьютере это развернуло бы окно Telegram на весь монитор.
  // Отступы под эти кнопки — --safe-top/--safe-bottom в css (v=168+).
  const tg = Telegram.WebApp;
  if ((tg.platform === 'android' || tg.platform === 'ios') &&
      typeof tg.requestFullscreen === 'function' &&
      tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
    try { tg.requestFullscreen(); } catch (e) { /* старый клиент — остаёмся как есть */ }
  }
}

// Все модули загрузились и выполнились (v=200) — плашка «Карта не загрузилась»
// из index.html больше не нужна (см. __bootFail там).
window.__mapBooted = true;
