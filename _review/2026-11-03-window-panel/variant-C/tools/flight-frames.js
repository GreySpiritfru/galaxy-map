/* Кадры полёта лиц «стопка → маркер» при p = 0.15 / 0.4 / 0.7 (вариант C, только для обзора).
   node flight-frames.js <папка> [--base http://localhost:8773]
   p ставится вручную (--p и высота тела, как делает apply в js/node-window.js) — анимация
   на 300 мс слишком быстрая для снимка. */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || 'flight'; fs.mkdirSync(OUT, { recursive: true });
const i = process.argv.indexOf('--base'); const BASE = i > 0 ? process.argv[i + 1] : 'http://localhost:8773';
(async () => {
  const b = await chromium.launch();
  for (const [W, id, name] of [[390, 'story-1', 'story1'], [390, 'phenome', 'phenome'], [390, 'terrane', 'terrane']]) {
    const ctx = await b.newContext({ viewport: { width: W, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    await ctx.addInitScript(() => { try { localStorage.setItem('galaxyMapTourSeen', '1'); localStorage.setItem('galaxyMapLinksShade2', JSON.stringify({ point: 'all' })); } catch (e) {} });
    const p = await ctx.newPage();
    await p.goto(BASE + '/index.html');
    await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
    await p.waitForTimeout(2500);
    await p.evaluate((rid) => window.__mapOpenRecord(rid, ''), id);
    await p.waitForTimeout(1800);
    for (const v of [0.15, 0.4, 0.7]) {
      const clip = await p.evaluate((pv) => {
        if (!window.__flightEl) { const ls = [...document.querySelectorAll('.open .node-links.is-open')]; window.__flightEl = ls[ls.length - 1]; }
        const el = window.__flightEl;
        const body = el.querySelector('.node-links-body');
        el.__full = el.__full || body.offsetHeight;
        el.classList.remove('is-open');
        el.classList.add('is-expanding');
        el.style.setProperty('--p', String(pv));
        body.style.height = (pv * el.__full) + 'px';
        const r = el.closest('.node-dock').getBoundingClientRect();
        return { x: r.x - 8, y: r.y - 140, width: r.width + 16, height: r.height + 148 };
      }, v);
      await p.waitForTimeout(80);
      await p.screenshot({ path: `${OUT}/${W}-${name}-p${v}.png`, clip: { ...clip, y: Math.max(0, clip.y) } });
    }
    await ctx.close();
  }
  await b.close();
})();
