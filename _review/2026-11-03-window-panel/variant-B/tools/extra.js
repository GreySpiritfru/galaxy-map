/* Доп. проверки: вкладка «Карта» Фенома, автоскрытие строки при прокрутке, окно системы. node extra.js */
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  await ctx.addInitScript(() => { localStorage.setItem('galaxyMapTourSeen', '1'); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://localhost:8772/index.html');
  await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => { await window.__mapOpenRecord('phenome', ''); });
  await p.waitForTimeout(1500);
  // прокрутка описания — строка прячется
  await p.evaluate(() => { const c = document.querySelector('#phenomOverlay .story-content'); c.scrollTop = 400; });
  await p.waitForTimeout(600);
  const hid = await p.evaluate(() => document.querySelector('#phenomOverlay .phenom-card').classList.contains('strip-hiding'));
  console.log((hid ? 'OK   ' : 'FAIL ') + 'прокрутка описания Фенома — строка спряталась (strip-hiding)');
  await p.evaluate(() => { const c = document.querySelector('#phenomOverlay .story-content'); c.scrollTop = 0; });
  await p.waitForTimeout(600);
  const back = await p.evaluate(() => !document.querySelector('#phenomOverlay .phenom-card').classList.contains('strip-hiding'));
  console.log((back ? 'OK   ' : 'FAIL ') + 'прокрутка к началу — строка вернулась');
  // вкладка «Карта»
  await p.locator('#phenomOverlay .tabbar-btn').filter({ hasText: 'Карта' }).first().tap();
  await p.waitForTimeout(1500);
  const mapView = await p.evaluate(() => document.querySelector('#phenomOverlay').classList.contains('map-view'));
  console.log((mapView ? 'OK   ' : 'FAIL ') + 'вкладка «Карта» Фенома открыла свою карту');
  await p.locator('#phenomOverlay .tabbar-btn').filter({ hasText: 'Описание' }).first().tap();
  await p.waitForTimeout(800);
  const desc = await p.evaluate(() => !document.querySelector('#phenomOverlay').classList.contains('map-view'));
  console.log((desc ? 'OK   ' : 'FAIL ') + '«Описание» — обратно с карты');
  // окно системы: раскрыть и тапнуть точку (с чистой страницы — окно Фенома лежало бы поверх системы)
  await p.reload();
  await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
  await p.waitForTimeout(2000);
  await p.evaluate(async () => { await window.__mapOpenRecord('system:g-ux71', ''); });
  await p.waitForTimeout(1500);
  await p.locator('.system-dock .node-strip-open').filter({ visible: true }).first().tap();
  await p.waitForTimeout(700);
  const sysOpen = await p.evaluate(() => !!document.querySelector('.system-dock .node-links.is-open'));
  console.log((sysOpen ? 'OK   ' : 'FAIL ') + 'окно системы: панель раскрывается');
  await p.locator('.system-dock .link-chip').filter({ visible: true }).first().tap();
  await p.waitForTimeout(1500);
  const t = await p.evaluate(() => { const d = [...document.querySelectorAll('.node-dock')].filter(x => x.offsetParent && getComputedStyle(x).visibility !== 'hidden').pop(); return d && (d.querySelector('.node-strip-title') || {}).textContent; });
  console.log((t && t !== 'Точки в системе' ? 'OK   ' : 'FAIL ') + 'окно системы: тап по точке открыл её окно (' + t + ')');
  console.log((errs.length ? 'FAIL ' : 'OK   ') + 'ошибок в консоли нет ' + (errs.length ? JSON.stringify(errs.slice(0, 3)) : ''));
  await b.close();
})();
