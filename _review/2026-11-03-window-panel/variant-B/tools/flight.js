/* Полёт лиц: при --p = 0 маркер колонки должен лечь ровно на своё лицо в стопке (расхождение в px),
   и кадры середины раскрытия. node flight.js [--out dir] */
const { chromium } = require('playwright');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', '.');
(async () => {
  const b = await chromium.launch();
  for (const W of [360, 390, 1280]) for (const id of ['story-1', 'phenome', 'terrane']) {
    const desktop = W >= 1000;
    const ctx = await b.newContext({ viewport: { width: W, height: desktop ? 800 : 740 }, deviceScaleFactor: 2, hasTouch: !desktop, isMobile: !desktop });
    await ctx.addInitScript(() => { localStorage.setItem('galaxyMapTourSeen', '1'); localStorage.setItem('galaxyMapLinksShade2', '{"point":0}'); });
    const p = await ctx.newPage();
    await p.goto(arg('base', 'http://localhost:8772') + '/index.html');
    await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
    await p.waitForTimeout(2000);
    await p.evaluate(async (id) => { await window.__mapOpenRecord(id, ''); }, id);
    await p.waitForTimeout(1500);
    const loc = p.locator('.node-strip-open').filter({ visible: true }).first();
    if (desktop) await loc.click(); else await loc.tap();
    await p.waitForTimeout(110);
    await p.screenshot({ path: path.join(OUT, `flight-${W}-${id.replace(/\W/g, '')}-mid.jpg`), type: 'jpeg', quality: 70 });
    await p.waitForTimeout(800);
    const r = await p.evaluate(() => {
      const d = [...document.querySelectorAll('.node-dock')].filter(x => x.offsetParent && getComputedStyle(x).visibility !== 'hidden').pop();
      const links = d.querySelector('.node-links');
      const faces = [...d.querySelectorAll('.node-stack')].map(s => [...s.querySelectorAll('.node-stack-face')]);
      links.style.setProperty('--p', '0');
      const out = [];
      const cols = [...d.querySelectorAll('.node-links-col')];
      const pts = d.querySelectorAll('.node-links-col.is-points .link-chip-marker');
      const chs = d.querySelectorAll('.node-links-col.is-chars .link-chip-marker');
      const check = (markers, fs) => { [...markers].slice(0, fs.length).forEach((m, i) => { const a = m.getBoundingClientRect(), f = fs[i].getBoundingClientRect(); out.push(`x${(a.x - f.x).toFixed(1)} y${(a.y - f.y).toFixed(1)} w${(a.width - f.width).toFixed(1)}`); }); };
      let k = 0;
      if (pts.length) check(pts, faces[k++]);
      if (chs.length) check(chs, faces[k]);
      links.style.setProperty('--p', '1');
      return out;
    });
    console.log(`${W} ${id}: расхождение маркер↔лицо при p=0, px: ${JSON.stringify(r)}`);
    await ctx.close();
  }
  await b.close();
})();
