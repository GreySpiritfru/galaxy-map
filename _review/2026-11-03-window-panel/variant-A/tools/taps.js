// Проверка касаниями (360/390, hasTouch) и мышью (1280): раскрыть/свернуть, протяжка, маркер персонажа,
// родитель, ✕, автоскрытие строки, своя карта Фенома, окно системы. Ошибки консоли — в конце.
const { chromium } = require('playwright');
const BASE = 'http://localhost:8771';
const log = [];
const ok = (w, name, cond, extra) => { log.push(`${cond ? 'OK  ' : 'FAIL'} ${w} ${name}${extra ? ' — ' + extra : ''}`); };

async function run(b, W) {
  const desktop = W >= 1000;
  const ctx = await b.newContext({ viewport: { width: W, height: desktop ? 800 : (W <= 360 ? 740 : 844) }, hasTouch: !desktop, isMobile: !desktop });
  await ctx.addInitScript(() => { localStorage.setItem('galaxyMapTourSeen', '1'); localStorage.setItem('galaxyMapLinksShade2', JSON.stringify({ point: 0, system: 0 })); });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  const tap = async (sel) => { const el = await p.waitForSelector(sel, { state: 'visible', timeout: 5000 }); if (desktop) await el.click(); else await el.tap(); await p.waitForTimeout(600); };
  const isOpen = (id) => p.evaluate((id) => document.getElementById(id).classList.contains('open'), id);
  const linksOpen = (id) => p.evaluate((id) => document.getElementById(id).classList.contains('is-open'), id);
  const bodyH = (id) => p.evaluate((id) => { const b = document.querySelector('#' + id + ' .node-links-body'); return b ? b.offsetHeight : -1; }, id);
  await p.goto(BASE + '/index.html');
  await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
  await p.waitForTimeout(2500);

  const top = () => p.evaluate(() => { const o = ['charOverlay', 'storyOverlay', 'phenomOverlay'].find(id => document.getElementById(id).classList.contains('open')); return o || null; });
  const L = (o) => '#' + o + ' .node-links';
  // 1. Феном (нижний слой) → «Переворот» из колонки → сюжет поверх.
  await p.evaluate(() => window.__mapOpenRecord('phenome', ''));
  await p.waitForTimeout(1500);
  ok(W, 'Феном открыт', (await top()) === 'phenomOverlay');
  await tap('#phenomLinks .node-strip-open');
  ok(W, 'тап по строке раскрывает (Феном)', await linksOpen('phenomLinks'));
  await tap('#phenomLinks .link-chip--point[title*="Переворот"]');
  ok(W, 'тап по сюжету в колонке — окно сюжета поверх', (await top()) === 'storyOverlay');
  await p.waitForTimeout(400);
  const h1 = await bodyH('storyLinks');
  const colsH = await p.evaluate(() => document.querySelector('#storyLinks .node-links-cols').offsetHeight);
  ok(W, 'сюжет раскрыт (запомнено), тело = колонкам', (await linksOpen('storyLinks')) && Math.abs(h1 - colsH) <= 1, `тело ${h1}, колонки ${colsH}`);
  await tap('#storyLinks .node-strip-open');
  ok(W, 'тап сворачивает', !(await linksOpen('storyLinks')) && (await bodyH('storyLinks')) === 0);

  // 2. Протяжка вверх — раскрытие (мышь на 1280, касание через CDP на телефоне).
  const box = await (await p.$('#storyLinks .node-strip-open')).boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  if (desktop) {
    await p.mouse.move(x, y); await p.mouse.down(); for (let i = 1; i <= 10; i++) await p.mouse.move(x, y - i * 15); await p.mouse.up();
  } else {
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - i * 15 }] }); await p.waitForTimeout(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }
  await p.waitForTimeout(700);
  ok(W, 'протяжка вверх раскрывает', await linksOpen('storyLinks'));
  const fl = await p.evaluate(() => [...document.querySelectorAll('#storyLinks .link-chip-marker')].map(m => m.style.getPropertyValue('--s')).filter(Boolean).length);
  ok(W, 'полёт лиц замерен (--s у маркеров)', fl > 0, `${fl} маркеров`);

  // 3. Маркер персонажа → его окно; родитель в строке → назад; ✕ закрывает.
  await tap('#storyLinks .link-chip--char');
  ok(W, 'тап по персонажу открывает его окно', (await top()) === 'charOverlay');
  await tap('#charLinks .node-crumb');
  ok(W, 'тап по родителю ведёт назад к сюжету', (await top()) === 'storyOverlay');
  await tap('#storyClose');
  ok(W, '✕ закрывает сюжет, под ним Феном', (await top()) === 'phenomOverlay');
  await tap('#phenomClose');
  ok(W, '✕ закрывает Феном', (await top()) === null);

  // 5. Окно с одной вкладкой (Федерация): ✕ и строка на одной линии, раскрытие, ✕.
  await p.evaluate(() => localStorage.setItem('galaxyMapLinksShade2', JSON.stringify({ point: 0, system: 0 })));
  await p.evaluate(() => window.__mapOpenRecord('terrane', ''));
  await p.waitForTimeout(1500);
  const sel = await p.evaluate(() => { const d = [...document.querySelectorAll('.node-dock')].find(d => d.offsetParent && d.classList.contains('single') && d.closest('.open')); if (!d) return null;
    const c = d.querySelector('.toolbar-close-btn').getBoundingClientRect(), s = d.querySelector('.node-strip').getBoundingClientRect(), r = d.getBoundingClientRect();
    return { id: d.querySelector('.node-links').id, close: c.y + c.height / 2 - (s.y + s.height / 2), dock: s.y + s.height / 2 - (r.y + r.height / 2), cw: c.width, ch: c.height }; });
  ok(W, 'single: строка и ✕ по центру плашки', sel && Math.abs(sel.close) < 0.6 && Math.abs(sel.dock) < 0.6, JSON.stringify(sel));
  await tap('#' + sel.id + ' .node-strip-open');
  const sel2 = await p.evaluate((id) => { const d = document.getElementById(id).closest('.node-dock');
    const c = d.querySelector('.toolbar-close-btn').getBoundingClientRect(), s = d.querySelector('.node-strip').getBoundingClientRect();
    return { close: +(c.y + c.height / 2 - (s.y + s.height / 2)).toFixed(1), emoji: /\p{Extended_Pictographic}/u.test(d.textContent), svg: d.querySelectorAll('.node-marker > svg').length }; }, sel.id);
  ok(W, 'single раскрыто: ✕ на линии строки', await linksOpen(sel.id) && Math.abs(sel2.close) < 0.6, JSON.stringify(sel2));
  ok(W, 'книга вместо 📖', !sel2.emoji && sel2.svg >= 2);
  const closeId = await p.evaluate((id) => document.getElementById(id).closest('.node-dock').querySelector('.toolbar-close-btn').id, sel.id);
  await tap('#' + closeId);
  ok(W, '✕ закрывает окно с одной вкладкой', !(await p.evaluate((id) => !!document.getElementById(id).closest('.open'), sel.id)));

  // 6. Феном: автоскрытие строки при прокрутке, «Карта» и обратно.
  await p.evaluate(() => window.__mapOpenRecord('phenome', ''));
  await p.waitForTimeout(1500);
  await p.evaluate(() => { const b = document.querySelector('#phenomOverlay .story-content'); b.scrollTop = 300; b.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(500);
  const hiding = await p.evaluate(() => document.querySelector('#phenomOverlay .phenom-card').classList.contains('strip-hiding'));
  ok(W, 'строка прячется при прокрутке', hiding);
  await p.evaluate(() => { const b = document.querySelector('#phenomOverlay .story-content'); b.scrollTop = 0; b.dispatchEvent(new Event('scroll')); });
  await p.waitForTimeout(500);
  const mapBtn = await p.evaluate(() => { const b = [...document.querySelectorAll('#phenomOverlay .tabbar-btn')].find(b => /Карта/.test(b.textContent) && b.offsetParent); return b ? b.id : null; });
  if (mapBtn) {
    await tap('#' + mapBtn);
    ok(W, 'вкладка «Карта» Фенома', await p.evaluate(() => document.getElementById('phenomOverlay').classList.contains('map-view')));
    const desc = await p.evaluate(() => [...document.querySelectorAll('#phenomOverlay .tabbar-btn')].find(b => /Описание/.test(b.textContent) && b.offsetParent).id);
    await tap('#' + desc);
    ok(W, '«Описание» — обратно со своей карты', !(await p.evaluate(() => document.getElementById('phenomOverlay').classList.contains('map-view'))));
  } else ok(W, 'вкладка «Карта» Фенома', false, 'нет кнопки');
  await tap('#phenomClose');
  ok(W, '✕ закрывает Феном', !(await isOpen('phenomOverlay')));

  // 7. Окно системы.
  await p.evaluate(() => window.__mapOpenRecord('system:g-ux71', ''));
  await p.waitForTimeout(1800);
  ok(W, 'окно системы открыто', await p.evaluate(() => document.getElementById('systemOverlay').classList.contains('open')));
  await tap('#systemLinks .node-strip-open');
  ok(W, 'система: раскрытие', await linksOpen('systemLinks'));
  await tap('#systemBack');
  ok(W, 'система: ✕', !(await p.evaluate(() => document.getElementById('systemOverlay').classList.contains('open'))));

  const own = errs.filter(e => !/PIXI is not defined|ERR_TUNNEL_CONNECTION_FAILED/.test(e));
  ok(W, 'ошибок в консоли нет (кроме PIXI с cdnjs — закрыт в песочнице)', own.length === 0, errs.join(' | '));
  await ctx.close();
}

(async () => {
  const b = await chromium.launch();
  for (const W of [360, 390, 1280]) await run(b, W);
  await b.close();
  console.log(log.join('\n'));
})();
