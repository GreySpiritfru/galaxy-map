/* Заставка загрузки (v=188): разметка в index.html (видна сразу, до
   модулей), стили — .splash в css/styles.css. Здесь — только уход: map.js
   зовёт hideSplash(), когда карта и точки готовы (или загрузка сорвалась).

   SPLASH_MIN_MS — от открытия страницы, а не от вызова: из кэша карта
   готова за ~0.4 с, и заставка мелькнула бы, не успев проявить логотип. */
const SPLASH_MIN_MS = 1000;
const SPLASH_FADE_MS = 600; // = transition .splash в css (+ запас)

let hiding = false;
export function hideSplash() {
  const el = document.getElementById('splash');
  if (!el || hiding) return;
  hiding = true;
  const wait = Math.max(0, SPLASH_MIN_MS - performance.now());
  setTimeout(() => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      el.classList.add('is-done');
      setTimeout(() => el.remove(), SPLASH_FADE_MS + 100);
    };
    // Кадр на отрисовку карты под заставкой — иначе уход открыл бы пустоту.
    // Кадров может не быть (страница скрыта — Telegram свёрнут): тогда по
    // таймеру, чтобы заставка не висела до возвращения.
    requestAnimationFrame(() => requestAnimationFrame(go));
    setTimeout(go, 300);
  }, wait);
}
