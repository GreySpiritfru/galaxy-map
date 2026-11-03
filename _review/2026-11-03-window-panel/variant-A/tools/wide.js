// Колонка мест с 4+ точками (.is-wide): ширина и персонажей в ряду на 360/390/1280.
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  for (const W of [360, 390, 1280]) {
    const ctx = await b.newContext({ viewport: { width: W, height: 800 } });
    await ctx.addInitScript(() => { localStorage.setItem('galaxyMapTourSeen', '1'); localStorage.setItem('galaxyMapLinksShade2', JSON.stringify({ point: 'all' })); });
    const p = await ctx.newPage();
    await p.goto('http://localhost:8771/index.html');
    await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
    await p.waitForTimeout(2500);
    await p.evaluate(() => window.__mapOpenRecord('phenome', ''));
    await p.waitForTimeout(1500);
    const r = await p.evaluate(() => {
      const pc = document.querySelector('#phenomLinks .is-points');
      const cc = document.querySelector('#phenomLinks .is-chars');
      pc.classList.add('is-wide');
      // 9 персонажей-одиночек — как у плотного сюжета.
      const chip = cc.querySelector('.link-chip');
      for (let i = 0; i < 9; i++) cc.appendChild(chip.cloneNode(true));
      const tops = {}; [...cc.querySelectorAll('.link-chip')].forEach(c => { const y = Math.round(c.getBoundingClientRect().top); tops[y] = (tops[y] || 0) + 1; });
      return { pointsW: pc.offsetWidth, charsW: cc.offsetWidth, perRow: Object.values(tops) };
    });
    console.log(W, JSON.stringify(r));
    await ctx.close();
  }
  await b.close();
})();
