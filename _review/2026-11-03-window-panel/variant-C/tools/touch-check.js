/* Проверка касаниями (360, 390) и мышью (1280) — вариант C, только для обзора.
   node touch-check.js <папка для кадров> [--base http://localhost:8773]
   Сценарий: район (одна вкладка) → сюжет в том же слое (перемер после .single), раскрыть тапом
   (кадр посреди полёта лиц), тап по персонажу, назад по родителю, свернуть, протяжка вверх, ✕;
   Феном → тап по месту → назад; Федерация (одна вкладка): центры ✕ и строки; система. */
const { chromium } = require('playwright');
const fs = require('fs');
const OUT = process.argv[2] || 'touch'; fs.mkdirSync(OUT, { recursive: true });
const i = process.argv.indexOf('--base'); const BASE = i > 0 ? process.argv[i + 1] : 'http://localhost:8773';
(async () => {
  const b = await chromium.launch();
  const log = [];
  for (const W of [360, 390, 1280]) {
    const desk = W >= 1000;
    const ctx = await b.newContext({ viewport: { width: W, height: desk ? 800 : (W <= 360 ? 740 : 844) }, deviceScaleFactor: 2, hasTouch: !desk, isMobile: !desk });
    await ctx.addInitScript(() => { try { localStorage.setItem('galaxyMapTourSeen', '1'); localStorage.setItem('galaxyMapLinksShade2', JSON.stringify({ point: 0, system: 0 })); } catch (e) {} });
    const p = await ctx.newPage();
    const errs = [];
    p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    p.on('pageerror', e => errs.push(String(e)));
    const press = async (loc) => { if (desk) await loc.click(); else await loc.tap(); };
    const tap = async (sel) => { await press(p.locator(sel).filter({ visible: true }).last()); await p.waitForTimeout(700); };
    const topDock = () => p.evaluate(() => {
      const ds = [...document.querySelectorAll('.node-dock')].filter(d => d.offsetParent && getComputedStyle(d).visibility !== 'hidden');
      const d = ds[ds.length - 1]; if (!d) return null;
      const L = d.querySelector('.node-links'); const body = d.querySelector('.node-links-body'); const cols = d.querySelector('.node-links-cols');
      return { h: d.offsetHeight, single: d.classList.contains('single'), open: !!(L && L.classList.contains('is-open')),
        bodyH: body ? body.offsetHeight : null, colsH: cols ? cols.offsetHeight : null, title: (d.querySelector('.node-strip-title') || {}).textContent };
    });
    const layers = () => p.evaluate(() => [...document.querySelectorAll('.phenom-overlay.open, .story-overlay.open, .system-overlay.open')].map(e => e.id));
    const singleGeo = () => p.evaluate(() => {
      const ds = [...document.querySelectorAll('.open .node-dock.single')].filter(d => d.offsetParent && getComputedStyle(d).visibility !== 'hidden'); const d = ds[ds.length - 1];
      const cy = el => { const r = el.getBoundingClientRect(); return +(r.y + r.height / 2).toFixed(1); };
      return { h: d.offsetHeight, close: cy(d.querySelector('.toolbar-close-btn')), strip: cy(d.querySelector('.node-strip')), title: cy(d.querySelector('.node-strip-title')) };
    });
    // Каждый сценарий — с чистой страницы и свёрнутой панелью (память раскрытия — сброс).
    const fresh = async () => {
      await p.goto(BASE + '/index.html');
      await p.evaluate(() => localStorage.setItem('galaxyMapLinksShade2', JSON.stringify({ point: 0, system: 0 })));
      await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
      await p.waitForTimeout(2500);
    };
    await fresh();
    const step = async (name, fn) => { try { log.push(`${W} ${name}: ${JSON.stringify(await fn())}`); } catch (e) { log.push(`${W} ${name}: FAIL ${e.message.split('\n')[0]}`); } };

    await step('район (одна вкладка)', async () => { await p.evaluate(() => window.__mapOpenRecord('zone:phenome:central-city', '')); await p.waitForTimeout(1200); return [await layers(), await topDock()]; });
    await step('сюжет после района', async () => { await p.evaluate(() => window.__mapOpenRecord('story-1', '')); await p.waitForTimeout(1500); return await topDock(); });
    await step('раскрыть сюжет тапом', async () => {
      await press(p.locator('#storyOverlay .node-strip-open'));
      await p.waitForTimeout(110);
      await p.screenshot({ path: `${OUT}/${W}-story1-mid.png` });
      await p.waitForTimeout(600);
      await p.screenshot({ path: `${OUT}/${W}-story1-after.png` });
      const d = await topDock(); return { ...d, lishnee: d.bodyH - d.colsH };
    });
    await step('тап по персонажу', async () => { await tap('#storyOverlay .node-links-body .link-chip--char'); return { layers: await layers(), dock: await topDock() }; });
    await step('тап по родителю (назад)', async () => { await tap('#charOverlay .node-crumb'); return { layers: await layers(), dock: await topDock() }; });
    await step('свернуть тапом', async () => { await tap('#storyOverlay .node-strip-open'); return await topDock(); });
    if (!desk) await step('протяжка вверх', async () => {
      const box = await p.locator('#storyOverlay .node-strip-open').boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      const cdp = await ctx.newCDPSession(p);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let k = 1; k <= 10; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - k * 15 }] }); await p.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(700); return { dock: await topDock(), layers: await layers() };
    });
    // ✕/↩ у сюжета, открытого после района в том же слое, — шаг назад (к району), второй — закрыть.
    await step('✕/↩ шаг назад', async () => { await tap('#storyOverlay .toolbar-close-btn'); return { layers: await layers(), dock: await topDock() }; });
    await step('✕ закрывает', async () => { await tap('#storyOverlay .toolbar-close-btn'); return await layers(); });
    await fresh();
    await step('Феном раскрыть', async () => { await p.evaluate(() => window.__mapOpenRecord('phenome', '')); await p.waitForTimeout(1500); await tap('#phenomOverlay .node-strip-open');
      await p.screenshot({ path: `${OUT}/${W}-phenome-after.png` }); return await topDock(); });
    await step('Феном: тап по месту', async () => { await press(p.locator('#phenomOverlay .node-links-body .link-chip--point').first()); await p.waitForTimeout(900); return { layers: await layers(), dock: await topDock() }; });
    await step('назад по родителю', async () => { await tap('#storyOverlay .node-crumb'); return { layers: await layers(), dock: await topDock() }; });
    await fresh();
    await step('Федерация: центры', async () => { await p.evaluate(() => window.__mapOpenRecord('terrane', '')); await p.waitForTimeout(1500); return await singleGeo(); });
    await step('Федерация раскрыта', async () => { await tap('.open .node-dock.single .node-strip-open'); return await singleGeo(); });
    await step('Федерация ✕', async () => { await tap('.open .node-dock.single .toolbar-close-btn'); return await layers(); });
    await fresh();
    await step('система раскрыть', async () => { await p.evaluate(() => window.__mapOpenRecord('system:g-ux71', '')); await p.waitForTimeout(2500); await tap('.system-dock .node-strip-open'); return await topDock(); });
    log.push(`${W} ОШИБКИ: ${JSON.stringify(errs)}`);
    await ctx.close();
  }
  console.log(log.join('\n'));
  fs.writeFileSync(OUT + '/touch-log.txt', log.join('\n') + '\n');
  await b.close();
})();
