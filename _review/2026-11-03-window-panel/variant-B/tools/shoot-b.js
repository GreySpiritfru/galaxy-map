/* Снимки и замеры плашки окон (Playwright/Chromium). Только для обзора — в main не переносится.
   Копия tools/shoot.js с замерами варианта B: stripOffDock (центр строки от центра плашки), closeOffStrip (✕ от строки),
   markerGaps (видимый промежуток между МАРКЕРАМИ в ряду, а не между чипами), captionW (ширина подписей).
   node shoot.js --base http://localhost:8765 --out <dir> [--widths 360,390,1280] [--scenes a,b] [--dpr 2]
   Сцены — окна карты в свёрнутом (closed) и раскрытом (open) виде плашки. Для каждой — PNG экрана,
   PNG плашки крупно и замеры в metrics.json. */
const { chromium } = require('playwright');
const fs = require('fs'); const path = require('path');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BASE = arg('base', 'http://localhost:8765');
const OUT = arg('out', 'shots'); fs.mkdirSync(OUT, { recursive: true });
const WIDTHS = arg('widths', '360,390,1280').split(',').map(Number);
const DPR = Number(arg('dpr', '2'));
const ALL = [
  ['phenome', 'phenome'],                       // точка Фенома (Внутри / Материалы / персонажи)
  ['story1', 'story-1'],                        // сюжет «Переворот»
  ['terrane', 'terrane'],                       // одна вкладка — альянс «Объединённая Федерация»
  ['char', 'nayto-afetovich'],                  // персонаж
  ['article', 'tt/greyspirit/4tRzyNaVfEQ'],     // статья «Районы Фенома»
  ['zone', 'zone:phenome:central-city'],        // район
  ['building', 'building:phenome:central-tower'], // здание
  ['system', 'system:g-ux71'],                  // система
];
const only = arg('scenes', '');
const SCENES = only ? ALL.filter(s => only.split(',').includes(s[0])) : ALL;
const STATES = arg('states', 'closed,open').split(',');

async function metrics(p) {
  return p.evaluate(() => {
    const vis = el => el && el.offsetParent !== null && getComputedStyle(el).visibility !== 'hidden';
    const R = el => { const r = el.getBoundingClientRect(); return { x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1), cy: +(r.y + r.height / 2).toFixed(1) }; };
    const cards = [...document.querySelectorAll('.phenom-card')].filter(c => vis(c));
    const docks = [...document.querySelectorAll('.node-dock')].filter(vis);
    const dock = docks[docks.length - 1];
    if (!dock) return { error: 'нет плашки' };
    const out = { dock: R(dock), single: dock.classList.contains('single'), classes: dock.className };
    const strip = dock.querySelector('.node-strip');
    if (strip && vis(strip)) {
      out.strip = R(strip);
      out.stripItems = [...strip.querySelectorAll('.node-crumb, .node-strip-title, .node-stack, .node-strip-chev, .node-strip-marker')].filter(vis)
        .map(e => ({ cls: e.className.split(' ')[0], ...R(e), offCenter: +(R(e).cy - R(strip).cy).toFixed(1) }));
    }
    if (out.strip) out.stripOffDock = +(out.strip.cy - R(dock).cy).toFixed(1);
    const bar = dock.querySelector('.tabbar');
    if (bar && vis(bar)) {
      out.tabbar = R(bar);
      out.tabs = [...bar.querySelectorAll('button')].filter(vis).map(b => ({ t: (b.textContent || '').trim().slice(0, 14), ...R(b) }));
      const close = bar.querySelector('.toolbar-close-btn');
      if (close && vis(close)) out.close = { ...R(close), offCenterDock: +(R(close).cy - R(dock).cy).toFixed(1) };
      if (close && vis(close) && out.strip) out.closeOffStrip = +(R(close).cy - out.strip.cy).toFixed(1);
    }
    // Цели касания < 48
    out.smallTargets = [...dock.querySelectorAll('button')].filter(vis).map(b => ({ c: b.className.split(' ')[0], t: (b.textContent || '').trim().slice(0, 12), ...R(b) }))
      .filter(b => b.w > 0 && (b.w < 47.5 || b.h < 47.5));
    const body = dock.querySelector('.node-links-body');
    if (body && dock.querySelector('.node-links.is-open')) {
      out.body = R(body);
      const cols = [...body.querySelectorAll('.node-links-col')].filter(vis);
      out.cols = cols.map(c => {
        const chips = [...c.querySelectorAll('.link-chip')].filter(vis);
        const rows = {};
        chips.forEach(ch => { const y = Math.round(ch.getBoundingClientRect().top); (rows[y] = rows[y] || []).push(ch); });
        const ys = Object.keys(rows).map(Number).sort((a, b) => a - b);
        const gaps = [];
        ys.forEach(y => { const r = rows[y].map(e => e.getBoundingClientRect()).sort((a, b) => a.x - b.x); for (let i = 1; i < r.length; i++) gaps.push(+(r[i].x - r[i - 1].right).toFixed(1)); });
        const mgaps = [];
        ys.forEach(y => { const r = rows[y].map(e => e.querySelector('.link-chip-marker').getBoundingClientRect()).sort((a, b) => a.x - b.x); for (let i = 1; i < r.length; i++) mgaps.push(Math.round(r[i].x - r[i - 1].right)); });
        const first = chips[0];
        return {
          cls: c.className, ...R(c), chips: chips.length, perRow: ys.map(y => rows[y].length), gaps: [...new Set(gaps)],
          chipW: [...new Set(chips.map(e => Math.round(e.getBoundingClientRect().width)))],
          chipH: [...new Set(chips.map(e => Math.round(e.getBoundingClientRect().height)))],
          markerGaps: [...new Set(mgaps)].sort((a, b) => a - b),
          captionW: [...new Set(chips.map(e => { const cp = e.querySelector('.link-chip-caption'); return cp ? Math.round(cp.getBoundingClientRect().width) : 0; }))],
          markers: [...new Set(chips.map(e => { const m = e.querySelector('.link-chip-marker'); return m ? Math.round(m.getBoundingClientRect().width) : 0; }))],
          truncated: chips.filter(e => { const cp = e.querySelector('.link-chip-caption'); return cp && cp.scrollWidth > cp.clientWidth + 1; }).map(e => e.textContent.trim()),
          topGap: first ? +(first.getBoundingClientRect().top - c.getBoundingClientRect().top).toFixed(1) : null,
          emptyAboveChips: first ? +(first.getBoundingClientRect().top - body.getBoundingClientRect().top).toFixed(1) : null,
        };
      });
    }
    // Значок-эмодзи у маркеров
    out.emojiMarkers = [...dock.querySelectorAll('.node-marker')].filter(m => /\p{Extended_Pictographic}/u.test(m.textContent)).length;
    out.cards = cards.length;
    out.errs = window.__errs || [];
    return out;
  });
}

(async () => {
  const b = await chromium.launch();
  const all = {};
  for (const W of WIDTHS) {
    const desktop = W >= 1000;
    const H = desktop ? 800 : (W <= 360 ? 740 : 844);
    for (const [name, id] of SCENES) for (const state of STATES) {
      const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, hasTouch: !desktop, isMobile: !desktop });
      await ctx.addInitScript((st) => {
        try { localStorage.setItem('galaxyMapTourSeen', '1');
          localStorage.setItem('galaxyMapLinksShade2', JSON.stringify({ point: st === 'open' ? 'all' : 0, system: st === 'open' ? 'all' : 0 })); } catch (e) {}
        window.__errs = []; addEventListener('error', e => window.__errs.push(String(e.message)));
      }, state);
      const p = await ctx.newPage();
      await p.goto(BASE + '/index.html');
      await p.waitForFunction(() => !!window.__mapOpenRecord, null, { timeout: 30000 });
      await p.waitForTimeout(2500);
      await p.evaluate(async (id) => { await window.__mapOpenRecord(id, ''); }, id);
      await p.waitForTimeout(1800);
      // Фокус после открытия без касания рисует рамку :focus-visible у ✕ — у игрока её нет (он нажимал).
      await p.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
      await p.waitForTimeout(100);
      const key = `${W}-${name}-${state}`;
      const m = await metrics(p);
      all[key] = m;
      await p.screenshot({ path: path.join(OUT, key + '.jpg'), type: 'jpeg', quality: 80 });
      if (m.dock) {
        const pad = 8, top = Math.max(0, m.dock.y - pad);
        await p.screenshot({ path: path.join(OUT, key + '-dock.png'), clip: { x: Math.max(0, m.dock.x - pad), y: top, width: Math.min(W, m.dock.w + 2 * pad), height: Math.min(H - top, m.dock.h + 2 * pad) } });
      }
      console.log(key, m.error || `dock ${m.dock.w}x${m.dock.h} single=${m.single} small=${m.smallTargets.length} emoji=${m.emojiMarkers}` + (m.cols ? ' cols=' + m.cols.map(c => c.perRow.join('/') + ' gaps' + c.gaps.join('|')).join(' ; ') : ''));
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(all, null, 1));
  await b.close();
})();
