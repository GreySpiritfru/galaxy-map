/* ============================================================
   Замер кадра на живом устройстве (26.09.2026, v=161): `?fps=1` в адресе.
   Грузится только с этим параметром (динамический import в map.js), у
   игроков его нет вовсе.

   Считает время кадра ТОЛЬКО пока карта движется (класс .panning на <svg>:
   перетаскивание, щипок, перелёт, колёсико) — кадры в покое ничего не
   стоят и замер бы размыли. Показывает медиану и 90-й перцентиль последних
   ~2 секунд движения. Нужен, чтобы сравнивать браузеры и режимы (Firefox и
   Chrome на телефоне, 🏷️ вкл/выкл, «Карта»/«Графика») не на глаз, а числом.
   ============================================================ */
export function startFpsMeter(svg) {
  const box = document.createElement('div');
  box.className = 'fps-meter';
  box.textContent = 'fps: подвигай карту';
  document.body.appendChild(box);

  const WINDOW = 120;       // кадров в окне замера
  const frames = [];
  let last = 0, moving = false, idleSince = 0;
  const tick = (t) => {
    const nowMoving = svg.classList.contains('panning');
    if (nowMoving && last && moving) {
      frames.push(t - last);
      if (frames.length > WINDOW) frames.shift();
    }
    // Новое движение после паузы — окно заново, чтобы не мешать жесты.
    if (nowMoving && !moving && t - idleSince > 1500) frames.length = 0;
    if (!nowMoving && moving) idleSince = t;
    moving = nowMoving;
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  setInterval(() => {
    if (frames.length < 10) return;
    const s = [...frames].sort((a, b) => a - b);
    const med = s[s.length >> 1], p90 = s[Math.floor(s.length * 0.9)];
    const mode = svg.classList.contains('nodes-mode') ? 'ноды'
      : svg.classList.contains('graphics-mode') ? 'графика' : 'карта';
    const labels = svg.classList.contains('labels-minimal') ? ' · 🏷️' : '';
    box.textContent = `${Math.round(1000 / med)} fps · кадр ${med.toFixed(1)} мс · p90 ${p90.toFixed(0)} · ${mode}${labels}`;
  }, 400);
}
