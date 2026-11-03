// Снимки «как сейчас»: шторка «Феном ▴» (карта и «Ноды») и нижние плашки окон.
// Запуск: в корне копии `python3 -m http.server 8774`, затем
//   node _review/2026-11-03-window-panel/menu-sync/tools/shoot-before.js
// Пишет до-*.png и metrics-before.json рядом с README.
const {chromium} = require('playwright');
const path = require('path');
const fs = require('fs');
const OUT = path.resolve(__dirname, '..');
const URL = 'http://localhost:8774/index.html';
const wait = ms => new Promise(r => setTimeout(r, ms));

async function page(browser, phone) {
  const ctx = await browser.newContext(phone
    ? {viewport: {width: 390, height: 844}, deviceScaleFactor: 2, hasTouch: true, isMobile: true}
    : {viewport: {width: 1280, height: 800}, deviceScaleFactor: 2});
  await ctx.addInitScript(() => { try { localStorage.setItem('galaxyMapTourSeen', '1'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(URL, {waitUntil: 'load'});
  await p.waitForFunction(() => typeof window.__mapOpenRecord === 'function', null, {timeout: 30000});
  await wait(2500);
  return p;
}
const tap = async (p, sel) => { await p.click(sel); await wait(900); };
async function closeAll(p) {
  for (let i = 0; i < 4; i++) { await p.keyboard.press('Escape'); await wait(300); }
}
async function openRec(p, id) {
  await p.evaluate(id => window.__mapOpenRecord(id, ''), id);
  await wait(1500);
}
async function expandStrip(p, phone) {
  const vis = await p.$$('.node-strip-open:not(.is-static)');
  for (const h of vis) { if (await h.isVisible()) { await (phone ? h.tap() : h.click()); await wait(1200); return; } }
}
// Снимок без рамки фокуса (её рисует Esc, которым закрывали прошлое окно; на касаниях её нет).
async function shot(p, file) {
  await p.evaluate(() => document.activeElement?.blur?.());
  await wait(150);
  await p.screenshot({path: file});
}
// Числа для README: размеры, скругления, кегли, фоны.
async function metrics(p) {
  return p.evaluate(() => {
    const pick = sel => [...document.querySelectorAll(sel)].find(n => n.offsetParent !== null || getComputedStyle(n).position === 'fixed');
    const m = sel => {
      const n = pick(sel); if (!n) return null;
      const s = getComputedStyle(n), r = n.getBoundingClientRect();
      return {w: Math.round(r.width), h: Math.round(r.height), radius: s.borderRadius, bg: s.backgroundColor, color: s.color,
        font: `${s.fontSize} ${s.fontWeight} ${s.fontFamily.split(',')[0]}`, shadow: s.boxShadow.slice(0, 80), pad: s.padding};
    };
    const out = {};
    for (const sel of ['.dock-bar', '.dock-brand', '.dock-modes .dock-item', '.dock-label', '.view-lens', '.p-menu-body', '.p-menu-sections',
      '.p-menu-section', '.p-menu-title', '.p-menu-count', '.p-mini', '.p-mini > span:last-of-type', '.p-mini-icon svg', '.p-menu-ship',
      '.node-dock', '.node-dock > .node-links', '.node-dock > .tabbar', '.node-strip', '.node-strip-open', '.node-crumb', '.tabbar-btn',
      '.tabbar-btn.active', '.tabbar-btn-label', '.tabbar-btn-icon svg', '.tabbar .toolbar-close-btn', '.link-chip', '.link-chip-caption',
      '.node-links-cap', '.link-chip--point .link-chip-marker', '.link-chip--char .link-chip-marker'])
      out[sel] = m(sel);
    return out;
  });
}

(async () => {
  const browser = await chromium.launch();
  const all = {};
  for (const phone of [true, false]) {
    const tag = phone ? '390' : '1280';
    const p = await page(browser, phone);
    await shot(p, `${OUT}/до-${tag}-карта.png`);
    await tap(p, '.dock-brand');
    await shot(p, `${OUT}/до-${tag}-шторка-карта.png`);
    all[`${tag}-шторка`] = await metrics(p);
    await closeAll(p);
    // «Ноды» (только телефон — на компьютере шторка та же, меняется одна кнопка).
    if (phone) {
      await tap(p, '.dock-item[data-view="nodes"]');
      await wait(1500);
      await tap(p, '.dock-brand');
      await shot(p, `${OUT}/до-${tag}-шторка-ноды.png`);
      await closeAll(p);
      await tap(p, '.dock-item[data-view="map"]');
      await wait(1200);
    }
    // Фенома — последним и раскрытым: окна помнят раскрытие строки, после него и сюжет открылся бы раскрытым.
    const ids = phone ? ['story-1', 'nayto-afetovich', 'system:g-ux71', 'phenome'] : ['nayto-afetovich', 'phenome'];
    for (const id of ids) {
      await openRec(p, id);
      const name = id.replace(/[:]/g, '-');
      if (id === 'phenome') {
        await expandStrip(p, phone);
        await shot(p, `${OUT}/до-${tag}-окно-${name}-раскрыто.png`);
      } else await shot(p, `${OUT}/до-${tag}-окно-${name}.png`);
      all[`${tag}-окно-${name}`] = await metrics(p);
      await closeAll(p);
      await wait(600);
    }
    await p.context().close();
  }
  fs.writeFileSync(`${OUT}/tools/metrics-before.json`, JSON.stringify(all, null, 1));
  await browser.close();
  console.log('ok');
})().catch(e => { console.error(e); process.exit(1); });
