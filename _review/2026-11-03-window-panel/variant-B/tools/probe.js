/* Отладка варианта B: как меняется ширина/высота колонок панели в первые секунды открытия окна.
   node probe.js <ширина> <id записи> */
const { chromium } = require('playwright');
(async () => {
  const W = +process.argv[2] || 360, id = process.argv[3] || 'story-1';
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: W, height: 740 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => {
    localStorage.setItem('galaxyMapTourSeen', '1');
    localStorage.setItem('galaxyMapLinksShade2', JSON.stringify({ point: 'all', system: 'all' }));
  });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() !== 'log') console.log('console', m.type(), m.text()); });
  p.on('pageerror', e => console.log('pageerror', e.message));
  await p.goto('http://localhost:8772/index.html');
  await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
  await p.waitForTimeout(2500);
  await p.evaluate(() => {
    window.__w = [];
    const t0 = performance.now();
    const tick = () => {
      document.querySelectorAll('.node-dock').forEach(d => {
        const c = d.querySelector('.node-links-cols');
        if (c && c.offsetWidth) window.__w.push([Math.round(performance.now() - t0), d.parentElement.parentElement.id, d.offsetWidth, c.offsetWidth, c.offsetHeight, d.querySelector('.node-links-body').style.height]);
      });
      if (performance.now() - t0 < 2500) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  await p.evaluate(async (id) => { await window.__mapOpenRecord(id, ''); }, id);
  await p.waitForTimeout(2600);
  const w = await p.evaluate(() => { const out = []; let last = ''; for (const r of window.__w) { const k = r.slice(1).join(','); if (k !== last) out.push(r); last = k; } return out; });
  console.log(JSON.stringify(w));
  await b.close();
})();
