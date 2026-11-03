/* Проверка касаниями (360, 390) и мышью (1280): раскрыть/свернуть строку, тап по персонажу — его окно,
   тап по родителю — назад, ✕ — закрыть; плюс протяжка вверх и «много персонажей у Фенома» (подмена
   characters.json в браузере, файл на диске не трогается). node taps.js [--base http://localhost:8772] [--out dir] */
const { chromium } = require('playwright');
const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:8772');
const OUT = arg('out', '.');
const log = [];
const ok = (cond, msg) => { log.push((cond ? 'OK   ' : 'FAIL ') + msg); };

async function open(b, W, { manyChars = false, shade = 0 } = {}) {
  const desktop = W >= 1000;
  const ctx = await b.newContext({ viewport: { width: W, height: desktop ? 800 : (W <= 360 ? 740 : 844) }, deviceScaleFactor: 2, hasTouch: !desktop, isMobile: !desktop });
  await ctx.addInitScript((st) => {
    localStorage.setItem('galaxyMapTourSeen', '1');
    localStorage.setItem('galaxyMapLinksShade2', JSON.stringify({ point: st, system: st }));
  }, shade ? 'all' : 0);
  if (manyChars) {
    await ctx.route(/characters\.json/, async (route) => {
      const res = await route.fetch();
      const list = await res.json();
      list.forEach(c => { c.parent = 'phenome'; });
      await route.fulfill({ response: res, body: JSON.stringify(list), headers: { ...res.headers(), 'content-type': 'application/json' } });
    });
  }
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(BASE + '/index.html');
  await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
  await p.waitForTimeout(2000);
  return { ctx, p, errs, desktop };
}
const topDock = (p) => p.evaluate(() => {
  const docks = [...document.querySelectorAll('.node-dock')].filter(d => d.offsetParent !== null && getComputedStyle(d).visibility !== 'hidden');
  const d = docks[docks.length - 1];
  if (!d) return null;
  const links = d.querySelector('.node-links');
  return { id: d.closest('[id]').id, h: d.offsetHeight, open: links.classList.contains('is-open'), title: (d.querySelector('.node-strip-title') || {}).textContent };
});
const visibleOverlays = (p) => p.evaluate(() => [...document.querySelectorAll('.phenom-overlay, .story-overlay, .char-overlay, .system-overlay')]
  .filter(o => o.classList.contains('open') || getComputedStyle(o).display !== 'none' && getComputedStyle(o).visibility !== 'hidden' && o.offsetParent !== null).map(o => o.id));

async function click(p, desktop, sel, nth = 0) {
  const loc = p.locator(sel).filter({ visible: true }).nth(nth);
  if (desktop) await loc.click(); else await loc.tap();
  await p.waitForTimeout(700);
}

(async () => {
  const b = await chromium.launch();
  for (const W of [360, 390, 1280]) {
    const { ctx, p, errs, desktop } = await open(b, W);
    const how = desktop ? 'мышь' : 'касание';
    await p.evaluate(async () => { await window.__mapOpenRecord('story-1', ''); });
    await p.waitForTimeout(1500);
    let d = await topDock(p);
    ok(d && d.title === 'Переворот' && !d.open, `${W} ${how}: открыт «Переворот», панель свёрнута (h=${d && d.h})`);
    await click(p, desktop, '.node-strip-open');
    d = await topDock(p);
    ok(d.open, `${W} ${how}: тап по строке раскрыл панель (h=${d.h})`);
    // полёт: в раскрытом виде маркеры на своих местах (transform ≈ none при p=1)
    const flight = await p.evaluate(() => [...document.querySelectorAll('.node-links.is-open .link-chip-marker')].filter(m => m.offsetParent).slice(0, 3).map(m => [m.style.getPropertyValue('--dx'), m.style.getPropertyValue('--dy'), m.style.getPropertyValue('--s')]));
    ok(flight.length && flight.every(f => f[0] !== '' && f[2] !== ''), `${W}: у маркеров замерен полёт --dx/--dy/--s ${JSON.stringify(flight[0])}`);
    await click(p, desktop, '.node-strip-open');
    d = await topDock(p);
    ok(!d.open, `${W} ${how}: второй тап свернул панель (h=${d.h})`);
    await click(p, desktop, '.node-strip-open');
    await click(p, desktop, '.node-links.is-open .link-chip--char');
    d = await topDock(p);
    ok(d && d.id === 'charCard' && d.title !== 'Переворот', `${W} ${how}: тап по персонажу открыл его окно (${d && d.id}: ${d && d.title})`);
    await p.screenshot({ path: path.join(OUT, `taps-${W}-char.jpg`), type: 'jpeg', quality: 70 });
    await click(p, desktop, '.node-crumb');
    d = await topDock(p);
    ok(d && d.title === 'Переворот', `${W} ${how}: тап по родителю вернул к «Переворот» (${d && d.title})`);
    await click(p, desktop, '.node-crumb');
    d = await topDock(p);
    ok(d && d.title === 'Феном', `${W} ${how}: ещё раз по родителю — «Феном» (${d && d.title})`);
    // одна вкладка: Федерация; ✕ закрывает
    await p.evaluate(async () => { await window.__mapOpenRecord('terrane', ''); });
    await p.waitForTimeout(1500);
    // Раскрытие запоминается — сначала свернуть.
    if ((await topDock(p)).open) await click(p, desktop, '.node-dock.single .node-strip-open');
    const single = await p.evaluate(() => { const d = [...document.querySelectorAll('.node-dock.single')].find(x => x.offsetParent); if (!d) return null; const s = d.querySelector('.node-strip').getBoundingClientRect(), c = d.querySelector('.toolbar-close-btn').getBoundingClientRect(), r = d.getBoundingClientRect(); return { strip: s.y + s.height / 2 - (r.y + r.height / 2), close: c.y + c.height / 2 - (s.y + s.height / 2) }; });
    ok(single && Math.abs(single.strip) < 0.6 && Math.abs(single.close) < 0.6, `${W}: одна вкладка — строка и ✕ по центру плашки ${JSON.stringify(single)}`);
    await click(p, desktop, '.node-dock.single .node-strip-open');
    const single2 = await p.evaluate(() => { const d = [...document.querySelectorAll('.node-dock.single')].find(x => x.offsetParent); const s = d.querySelector('.node-strip').getBoundingClientRect(), c = d.querySelector('.toolbar-close-btn').getBoundingClientRect(); return { open: !!d.querySelector('.node-links.is-open'), close: c.y + c.height / 2 - (s.y + s.height / 2) }; });
    ok(single2.open && Math.abs(single2.close) < 0.6, `${W}: одна вкладка раскрыта — ✕ в ряду с названием ${JSON.stringify(single2)}`);
    await p.screenshot({ path: path.join(OUT, `taps-${W}-single-open.jpg`), type: 'jpeg', quality: 70 });
    const before = await visibleOverlays(p);
    await click(p, desktop, '.node-dock.single .toolbar-close-btn');
    await p.waitForTimeout(500);
    const after = await topDock(p);
    ok(!after || after.title !== 'Объединённая Федерация', `${W} ${how}: ✕ закрыл окно Федерации (было ${before.join(',')}, сверху теперь ${after ? after.title : 'карта'})`);
    // протяжка вверх (только касание): открыть Феном свёрнутым и потянуть строку
    if (!desktop) {
      await p.evaluate(async () => { await window.__mapOpenRecord('phenome', ''); });
      await p.waitForTimeout(1500);
      let dd = await topDock(p);
      if (dd.open) { await click(p, desktop, '.node-strip-open'); }
      const box = await p.locator('.node-strip-open').filter({ visible: true }).first().boundingBox();
      const cdp = await ctx.newCDPSession(p);
      const x = box.x + box.width / 2, y0 = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
      for (let i = 1; i <= 12; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 - i * 15 }] }); await p.waitForTimeout(16); }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await p.waitForTimeout(700);
      dd = await topDock(p);
      ok(dd.open, `${W}: протяжка строки вверх раскрыла панель Фенома (h=${dd.h})`);
    }
    ok(errs.length === 0, `${W}: ошибок в консоли нет ${errs.length ? JSON.stringify(errs.slice(0, 3)) : ''}`);
    await ctx.close();
  }
  // Много персонажей у Фенома: колонка мест должна остаться узкой (в один столбец), персонажи — плотно.
  for (const W of [360, 390, 1280]) {
    const { ctx, p, errs } = await open(b, W, { manyChars: true, shade: 1 });
    await p.evaluate(async () => { await window.__mapOpenRecord('phenome', ''); });
    await p.waitForTimeout(1800);
    const m = await p.evaluate(() => {
      const d = [...document.querySelectorAll('.node-dock')].find(x => x.offsetParent);
      const pc = d.querySelector('.node-links-col.is-points'), cc = d.querySelector('.node-links-col.is-chars');
      const rows = {}; cc.querySelectorAll('.link-chip').forEach(ch => { const y = Math.round(ch.getBoundingClientRect().top); rows[y] = (rows[y] || 0) + 1; });
      const over = [...cc.querySelectorAll('.link-chip')].some(ch => ch.getBoundingClientRect().right > cc.getBoundingClientRect().right + 1);
      return { pointsW: pc && pc.offsetWidth, pc: pc && pc.style.getPropertyValue('--pc'), charsW: cc.offsetWidth, perRow: Object.keys(rows).sort((a, b) => a - b).map(k => rows[k]), over, dockH: d.offsetHeight };
    });
    ok(!m.over, `${W}: 26 персонажей у Фенома — колонка мест ${m.pointsW}px (--pc ${m.pc}), персонажи ${m.charsW}px, в рядах ${JSON.stringify(m.perRow)}, плашка ${m.dockH}px, за край не вылезают`);
    await p.screenshot({ path: path.join(OUT, `many-${W}.jpg`), type: 'jpeg', quality: 70 });
    ok(errs.length === 0, `${W}: (много персонажей) ошибок в консоли нет ${errs.length ? JSON.stringify(errs.slice(0, 3)) : ''}`);
    await ctx.close();
  }
  await b.close();
  console.log(log.join('\n'));
})();
