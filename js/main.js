// Точка входа: подключает все модули страницы. Порядок между articles.js/
// onboarding.js/map.js значения не имеет — каждый сам вешает свои обработчики
// на уже существующую в HTML разметку (модули выполняются после её разбора).
import './articles.js?v=146';
import './onboarding.js?v=146';
import './map.js?v=146';
import './navigation.js?v=146';

if (window.Telegram && window.Telegram.WebApp) {
  Telegram.WebApp.ready();
  Telegram.WebApp.expand();
  // Без этого свайп вниз по карте (обычное перетаскивание) распознаётся
  // Telegram'ом как жест "потянул — закрыл приложение". Метод появился
  // не в самых старых версиях Bot API, поэтому проверяем на всякий случай.
  if (typeof Telegram.WebApp.disableVerticalSwipes === 'function') {
    Telegram.WebApp.disableVerticalSwipes();
  }
}
