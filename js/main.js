// Точка входа: подключает все модули страницы. Порядок между articles.js/
// onboarding.js/map.js значения не имеет — каждый сам вешает свои обработчики
// на уже существующую в HTML разметку (модули выполняются после её разбора).
import './articles.js?v=170';
import './onboarding.js?v=170';
import './map.js?v=170';
import './navigation.js?v=170';

if (window.Telegram && window.Telegram.WebApp) {
  Telegram.WebApp.ready();
  Telegram.WebApp.expand();
  // Без этого свайп вниз по карте (обычное перетаскивание) распознаётся
  // Telegram'ом как жест "потянул — закрыл приложение". Метод появился
  // не в самых старых версиях Bot API, поэтому проверяем на всякий случай.
  if (typeof Telegram.WebApp.disableVerticalSwipes === 'function') {
    Telegram.WebApp.disableVerticalSwipes();
  }
  // Полноэкранный режим (Bot API 8.0): вместо сплошной шапки Telegram —
  // плавающие кнопки «✕ Картограф» и «⌄ ⋮» поверх карты. Только телефон:
  // на компьютере это развернуло бы окно Telegram на весь монитор.
  // Эксперимент v=167 — отступов под эти кнопки у нашего интерфейса пока нет.
  const tg = Telegram.WebApp;
  if ((tg.platform === 'android' || tg.platform === 'ios') &&
      typeof tg.requestFullscreen === 'function' &&
      tg.isVersionAtLeast && tg.isVersionAtLeast('8.0')) {
    try { tg.requestFullscreen(); } catch (e) { /* старый клиент — остаёмся как есть */ }
  }
}
