// Снимки и замеры меню схемы корабля: node check.js <before|after>
// Нужен сервер: python3 -m http.server 8775 в корне репозитория.
// cdnjs в среде проверки закрыт — pixi.min.js подставляется из локальной копии (PIXI_PATH).
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const TAG = process.argv[2] || 'after';
const OUT = path.join(__dirname, TAG);
const PIXI = process.env.PIXI_PATH || '/tmp/claude-0/-home-user-galaxy-map/a38fd214-9ea5-5f75-9cec-36b386c9fcf0/scratchpad/pixi/package/dist/pixi.min.js';
const BASE = 'http://localhost:8775';
fs.mkdirSync(OUT, { recursive: true });

const VIEWS = [
  { name: '360', viewport: { width: 360, height: 740 }, touch: true },
  { name: '390', viewport: { width: 390, height: 844 }, touch: true },
  { name: '1280', viewport: { width: 1280, height: 800 }, touch: false },
];
const PARTS = ['all', 'nose', 'city', 'rings', 'stern'];

// Замеры внутри документа схемы (страница или фрейм).
function measure() {
  const r = el => { const b = el.getBoundingClientRect(); return { x: +b.left.toFixed(1), y: +b.top.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) }; };
  const cs = el => getComputedStyle(el);
  const dock = document.getElementById('dock');
  // Фон панели — у того элемента, у которого он задан (#modes до, .dock-bar после).
  const bar = [dock.querySelector('.dock-bar'), document.getElementById('modes')].find(e => e && cs(e).backgroundColor !== 'rgba(0, 0, 0, 0)');
  const bb = r(bar);
  const btns = [...document.querySelectorAll('#modes button[data-f]')].map(b => {
    const svg = b.querySelector('svg'), lab = b.querySelector('.dock-label');
    return { f: b.dataset.f, ...r(b), icon: r(svg).w + '×' + r(svg).h, stroke: cs(svg).strokeWidth, label: cs(lab).fontSize + '/' + cs(lab).lineHeight,
      color: cs(b).color, labelPos: r(lab).x > r(svg).x + r(svg).w - 1 ? 'справа' : 'снизу' };
  });
  const e = document.getElementById('editBtn'), es = e.querySelector('svg');
  return {
    vw: innerWidth, vh: innerHeight,
    bar: { ...bb, radius: cs(bar).borderRadius, bg: cs(bar).backgroundColor, left: bb.x, right: +(innerWidth - bb.x - bb.w).toFixed(1), bottom: +(innerHeight - bb.y - bb.h).toFixed(1) },
    btns,
    edit: { ...r(e), radius: cs(e).borderRadius, icon: r(es).w + '×' + r(es).h, stroke: cs(es).strokeWidth, color: cs(e).color, bg: cs(e).backgroundColor },
    cardBottomCss: cs(document.getElementById('card')).bottom,
  };
}
function lensState() {
  const lens = document.getElementById('lens'), a = document.querySelector('#modes button.active');
  const m = /translateX\(([-\d.]+)px\)/.exec(lens.style.transform);
  return { active: a && a.dataset.f, actives: document.querySelectorAll('#modes button.active').length,
    lensX: m ? +m[1] : null, lensW: lens.offsetWidth, btnX: a.offsetLeft, btnW: a.offsetWidth,
    activeColor: getComputedStyle(a).color, otherColor: getComputedStyle(document.querySelector('#modes button:not(.active)')).color };
}
function overlap(sel) {
  const el = document.querySelector(sel), d = document.querySelector('#dock .dock-bar') || document.getElementById('modes');
  const a = el.getBoundingClientRect(), b = d.getBoundingClientRect();
  return { shown: a.height > 0, top: +a.top.toFixed(1), bottom: +a.bottom.toFixed(1), dockTop: +b.top.toFixed(1), gap: +(b.top - a.bottom).toFixed(1), radius: getComputedStyle(el).borderRadius };
}

(async () => {
  const browser = await chromium.launch();
  const report = { tag: TAG, runs: [] };
  for (const mode of ['ship', 'map']) for (const v of VIEWS) {
    const ctx = await browser.newContext({ viewport: v.viewport, deviceScaleFactor: 2, hasTouch: v.touch, isMobile: v.touch });
    await ctx.route('**/pixi.min.js', rt => rt.fulfill({ path: PIXI, contentType: 'application/javascript' }));
    await ctx.addInitScript(() => { try { localStorage.setItem('galaxyMapTourSeen', '1'); } catch (e) {} });
    const page = await ctx.newPage();
    const errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('requestfailed', q => errors.push('requestfailed: ' + q.url() + ' ' + (q.failure() || {}).errorText));
    let doc = page;
    if (mode === 'ship') {
      await page.goto(BASE + '/ship/index.html');
    } else {
      await page.goto(BASE + '/index.html');
      await page.waitForFunction(() => typeof window.__mapOpenShip === 'function', null, { timeout: 30000 });
      await page.waitForTimeout(1500);
      await page.evaluate(() => window.__mapOpenShip());
      await page.waitForSelector('#phenomShip iframe', { timeout: 20000 });
      const fh = await page.$('#phenomShip iframe');
      doc = await fh.contentFrame();
    }
    await doc.waitForFunction(() => window.__ship && !document.getElementById('loading'), null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    const run = { mode, view: v.name, m: await doc.evaluate(measure), parts: [], errors };
    if (mode === 'map') {
      run.frame = await page.evaluate(() => {
        const f = document.querySelector('#phenomShip iframe').getBoundingClientRect();
        const d = document.querySelector('.phenom-overlay.open .node-dock').getBoundingClientRect();
        return { frameBottom: +f.bottom.toFixed(1), windowDockTop: +d.top.toFixed(1) };
      });
    }
    // Касание/щелчок по центру элемента схемы — координатами страницы (и во фрейме тоже).
    const press = async sel => {
      const box = await (await doc.$(sel)).boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      if (v.touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y);
    };
    const shot = n => page.screenshot({ path: path.join(OUT, `${mode}-${v.name}-${n}.png`) });
    await shot('1-all');
    // Касанием (или мышью) по каждой части — выбранное и линза.
    for (const f of [...PARTS.slice(1), 'all']) {
      const sel = `#modes button[data-f="${f}"]`;
      await press(sel);
      // Переезд линзы и цвет — переходы CSS; на 1280×800 программная отрисовка медленная, поэтому ждём,
      // пока линза встанет под кнопку (до 8 с), а не фиксированное время.
      await doc.waitForFunction(f => { const l = document.getElementById('lens'), a = document.querySelector(`#modes [data-f="${f}"]`);
        return a.classList.contains('active') && Math.abs(l.offsetWidth - a.offsetWidth) < 0.6 && getComputedStyle(a).color === 'rgb(175, 238, 238)'; }, f, { timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(300);
      const st = await doc.evaluate(lensState);
      st.ok = st.active === f && st.actives === 1 && Math.abs(st.lensX - st.btnX) < 0.6 && Math.abs(st.lensW - st.btnW) < 0.6;
      run.parts.push(st);
      if (f === 'city') await shot('2-city');
    }
    // Карточка района: на схеме отдельно — настоящим касанием по району (сначала «Город»);
    // внутри карты касание района открывает окно записи, поэтому карточку — через API.
    await press('#modes button[data-f="city"]');
    await page.waitForTimeout(900);
    if (mode === 'ship') {
      const pt = await doc.evaluate(() => {
        const S = window.__ship, i = S.zones.findIndex(z => !z.free && z.part !== 'front');
        const p = S.zones[i].poly, cx = p.reduce((a, q) => a + q[0], 0) / p.length, cy = p.reduce((a, q) => a + q[1], 0) / p.length;
        const [sx, sy] = S.toScreen(cx, cy); return { x: sx, y: sy, name: S.zones[i].name };
      });
      if (v.touch) await page.touchscreen.tap(pt.x, pt.y); else await page.mouse.click(pt.x, pt.y);
      run.tapZone = pt.name;
    } else {
      await doc.evaluate(() => { const S = window.__ship; S.showCard({ kind: 'zone', i: S.zones.findIndex(z => !z.free) }); });
    }
    await page.waitForTimeout(500);
    run.card = await doc.evaluate(overlap, '#card');
    run.cardClose = await doc.evaluate(() => { const x = document.getElementById('cardClose'), c = document.getElementById('card');
      const a = x.getBoundingClientRect(), b = c.getBoundingClientRect();
      return { w: x.offsetWidth, h: x.offsetHeight, right: +(b.right - a.right).toFixed(1), top: +(a.top - b.top).toFixed(1) }; });
    await shot('3-card');
    await press('#cardClose');
    await page.waitForTimeout(200);
    run.cardClosed = await doc.evaluate(() => !document.getElementById('card').classList.contains('open'));
    // Правка разметки: кнопка ✎ и полоса над панелью.
    await press('#editBtn');
    await page.waitForTimeout(300);
    run.editBar = await doc.evaluate(overlap, '#editBar');
    run.editBarBtns = await doc.evaluate(() => [...document.querySelectorAll('#editBar button')].map(b => { const s = getComputedStyle(b); return { w: b.offsetWidth, h: b.offsetHeight, radius: s.borderRadius, border: s.borderStyle + ' ' + s.borderWidth, color: s.color }; }));
    run.editActive = await doc.evaluate(() => { const e = document.getElementById('editBtn'); return { cls: e.classList.contains('active'), color: getComputedStyle(e).color }; });
    await shot('4-edit');
    await press('#editBtn');
    await page.waitForTimeout(200);
    report.runs.push(run);
    console.log(mode, v.name, 'parts ok:', run.parts.every(p => p.ok), 'card gap', run.card.gap, 'closed', run.cardClosed, 'editBar gap', run.editBar.gap, 'errors', errors.length);
    await ctx.close();
  }
  fs.writeFileSync(path.join(OUT, 'measure.json'), JSON.stringify(report, null, 1));
  await browser.close();
})();
