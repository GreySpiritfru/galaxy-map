// Промежуточная ширина (601–999 px, планшет): панель по центру, части по 72 px, ничего не вылезает.
// node check-mid.js <before|after>
const { chromium } = require('playwright');
const path = require('path');
const PIXI = process.env.PIXI_PATH || '/tmp/claude-0/-home-user-galaxy-map/a38fd214-9ea5-5f75-9cec-36b386c9fcf0/scratchpad/pixi/package/dist/pixi.min.js';
const TAG = process.argv[2] || 'after';
(async () => {
  const browser = await chromium.launch();
  for (const w of [601, 768, 999]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 900 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
    await ctx.route('**/pixi.min.js', rt => rt.fulfill({ path: PIXI, contentType: 'application/javascript' }));
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto('http://localhost:8775/ship/index.html');
    await page.waitForFunction(() => window.__ship && !document.getElementById('loading'), null, { timeout: 30000 });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const bar = document.querySelector('#dock .dock-bar') || document.getElementById('modes');
      const b = bar.getBoundingClientRect(), e = document.getElementById('editBtn').getBoundingClientRect();
      const btns = [...document.querySelectorAll('#modes button')].map(x => Math.round(x.getBoundingClientRect().width) + '×' + Math.round(x.getBoundingClientRect().height));
      return { barX: Math.round(b.left), barR: Math.round(innerWidth - b.right), barW: Math.round(b.width), barH: Math.round(b.height),
        editInside: e.left >= b.left && e.right <= b.right, edit: Math.round(e.width) + '×' + Math.round(e.height), btns };
    });
    console.log(TAG, w, JSON.stringify(m), 'errors', errors.length);
    await page.screenshot({ path: path.join(__dirname, TAG, `ship-${w}-mid.png`) });
    await ctx.close();
  }
  await browser.close();
})();
