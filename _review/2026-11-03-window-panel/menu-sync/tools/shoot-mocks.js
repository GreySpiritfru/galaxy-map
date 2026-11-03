// Снимки макетов mock-*.html на 390 (телефон, касания) и 1280 px, deviceScaleFactor 2.
// Запуск: сервер `python3 -m http.server 8774` в корне копии, затем
//   node _review/2026-11-03-window-panel/menu-sync/tools/shoot-mocks.js
const {chromium} = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(__dirname, '..');
const BASE = 'http://localhost:8774/_review/2026-11-03-window-panel/menu-sync/';
const files = fs.readdirSync(OUT).filter(f => /^mock-.*\.html$/.test(f)).sort();

const boxes = {};
(async () => {
  const browser = await chromium.launch();
  for (const phone of [true, false]) {
    const ctx = await browser.newContext(phone
      ? {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true}
      : {viewport: {width: 1280, height: 800}, deviceScaleFactor: 2});
    const p = await ctx.newPage();
    for (const f of files) {
      await p.goto(BASE + f, {waitUntil: 'load'});
      await p.waitForSelector('body[data-ready="1"]');
      await p.evaluate(() => document.fonts.ready);
      await p.waitForTimeout(400);
      const name = f.replace(/\.html$/, '') + (phone ? '-390.png' : '-1280.png');
      await p.screenshot({path: path.join(OUT, name), fullPage: true});
      // Где на снимке сцены — для сводки compose.py (сравнение вариантов рядом).
      boxes[name] = await p.evaluate(() => [...document.querySelectorAll('.stage')].map(s => {
        const r = s.getBoundingClientRect();
        return [r.left + scrollX, r.top + scrollY, r.width, r.height];
      }));
      console.log(name);
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(__dirname, "stage-boxes.json"), JSON.stringify(boxes, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
