// Высоты и размеры в макетах (для таблицы в README): шторка, ряд кнопок, вкладки, раскрытая панель.
// Запуск: сервер на 8774, затем node .../menu-sync/tools/measure-mocks.js
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..');
const BASE = 'http://localhost:8774/_review/2026-11-03-window-panel/menu-sync/';
(async () => {
  const b = await chromium.launch();
  const p = await b.newPage({viewport: {width: 390, height: 844}, hasTouch: true, isMobile: true});
  for (const f of fs.readdirSync(OUT).filter(f => /^mock-.*\.html$/.test(f)).sort()) {
    await p.goto(BASE + f);
    await p.waitForSelector('body[data-ready="1"]');
    const r = await p.evaluate(() => {
      const st = [...document.querySelectorAll('.stage')];
      const h = (root, sel) => { const n = root.querySelector(sel); return n ? Math.round(n.getBoundingClientRect().height) : null; };
      const w = (root, sel) => { const n = root.querySelector(sel); return n ? Math.round(n.getBoundingClientRect().width) : null; };
      return {
        'шторка': h(st[0], '.p-menu-body'), 'ряд кнопок шторки': h(st[0], '.p-menu-row'), 'кнопка ряда (в×ш)': `${h(st[0], '.p-mini')}×${w(st[0], '.p-mini')}`,
        'плашка окна раскрыта': h(st[1], '.node-dock'), 'плашка окна свёрнута': h(st[2], '.node-dock'),
        'вкладки': h(st[2], '.tabbar'), 'вкладка (в×ш)': `${h(st[2], '.tabbar-btn')}×${w(st[2], '.tabbar-btn')}`, '✕ (в×ш)': `${h(st[2], '.toolbar-close-btn')}×${w(st[2], '.toolbar-close-btn')}`,
      };
    });
    console.log(f, JSON.stringify(r));
  }
  await b.close();
})();
