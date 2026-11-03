// Снимает настоящую разметку шторки «Феном ▴», панели карты и плашек окон (outerHTML) в markup.json —
// из неё build-mocks.js собирает макеты. Пути картинок — относительно макетов (../../../).
// Запуск: сервер `python3 -m http.server 8774` в корне копии, затем node .../tools/dump-markup.js
const {chromium} = require('playwright');
const fs = require('fs');
const path = require('path');
const URL = 'http://localhost:8774/';
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({viewport: {width: 390, height: 844}, deviceScaleFactor: 1, hasTouch: true, isMobile: true});
  await ctx.addInitScript(() => { try { localStorage.setItem('galaxyMapTourSeen', '1'); } catch {} });
  const p = await ctx.newPage();
  await p.goto(URL + 'index.html', {waitUntil: 'load'});
  await p.waitForFunction(() => typeof window.__mapOpenRecord === 'function', null, {timeout: 30000});
  await wait(2500);
  const out = {};
  const grab = sel => p.evaluate(sel => [...document.querySelectorAll(sel)].find(n => n.getClientRects().length)?.outerHTML || '', sel);
  out.mapDock = await grab('.map-dock');
  await p.click('.dock-brand'); await wait(1200);
  out.menu = await grab('#planshetMenu');
  out.mapDockOpen = await grab('.map-dock');
  await p.keyboard.press('Escape'); await wait(600);
  // Окно сюжета: строка свёрнута (родитель › название, стопка, число).
  await p.evaluate(() => window.__mapOpenRecord('story-1', '')); await wait(1800);
  out.storyDock = await grab('#phenomOverlay .node-dock');
  out.storyText = await p.evaluate(() => [...document.querySelectorAll('#phenomOverlay .story-accordion-body p, #phenomOverlay .node-desc p')]
    .map(n => n.textContent.trim()).filter(Boolean).slice(0, 3).join('\n\n'));
  await p.keyboard.press('Escape'); await wait(800);
  // Окно Фенома: строка раскрыта (колонки маркеров).
  await p.evaluate(() => window.__mapOpenRecord('phenome', '')); await wait(1800);
  for (const h of await p.$$('.node-strip-open:not(.is-static)')) { if (await h.isVisible()) { await h.tap(); break; } }
  await wait(1400);
  out.phenomeDockOpen = await grab('#phenomOverlay .node-dock');
  await p.keyboard.press('Escape'); await wait(400);
  await p.keyboard.press('Escape'); await wait(800);
  // Окно персонажа (три вкладки) и окно системы.
  await p.evaluate(() => window.__mapOpenRecord('nayto-afetovich', '')); await wait(1800);
  out.charDock = await grab('#charOverlay .node-dock');
  await p.keyboard.press('Escape'); await wait(800);
  await p.evaluate(() => window.__mapOpenRecord('system:g-ux71', '')); await wait(2200);
  out.systemDock = await grab('.node-dock.system-dock');
  // Абсолютные адреса картинок → относительно макетов.
  for (const k of Object.keys(out)) out[k] = out[k].split(URL).join('../../../');
  fs.writeFileSync(path.join(__dirname, 'markup.json'), JSON.stringify(out, null, 1));
  for (const [k, v] of Object.entries(out)) console.log(k, v.length);
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
