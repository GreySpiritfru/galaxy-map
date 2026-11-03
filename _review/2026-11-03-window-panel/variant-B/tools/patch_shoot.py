"""Дописывает в копию shoot.js (shoot-b.js) замеры варианта B. Запуск из корня репозитория."""
p = '_review/2026-11-03-window-panel/variant-B/tools/shoot-b.js'
s = open(p, encoding='utf-8').read()
def rep(a, b):
    global s
    assert a in s, a
    s = s.replace(a, b, 1)
rep("/* Снимки и замеры плашки окон (Playwright/Chromium). Только для обзора — в main не переносится.",
    "/* Снимки и замеры плашки окон (Playwright/Chromium). Только для обзора — в main не переносится.\n"
    "   Копия tools/shoot.js с замерами варианта B: stripOffDock (центр строки от центра плашки), closeOffStrip (✕ от строки),\n"
    "   markerGaps (видимый промежуток между МАРКЕРАМИ в ряду, а не между чипами), captionW (ширина подписей).")
rep("    const bar = dock.querySelector('.tabbar');",
    "    if (out.strip) out.stripOffDock = +(out.strip.cy - R(dock).cy).toFixed(1);\n    const bar = dock.querySelector('.tabbar');")
rep("      if (close && vis(close)) out.close = { ...R(close), offCenterDock: +(R(close).cy - R(dock).cy).toFixed(1) };",
    "      if (close && vis(close)) out.close = { ...R(close), offCenterDock: +(R(close).cy - R(dock).cy).toFixed(1) };\n"
    "      if (close && vis(close) && out.strip) out.closeOffStrip = +(R(close).cy - out.strip.cy).toFixed(1);")
rep("        const first = chips[0];",
    "        const mgaps = [];\n"
    "        ys.forEach(y => { const r = rows[y].map(e => e.querySelector('.link-chip-marker').getBoundingClientRect()).sort((a, b) => a.x - b.x); for (let i = 1; i < r.length; i++) mgaps.push(Math.round(r[i].x - r[i - 1].right)); });\n"
    "        const first = chips[0];")
rep("          chipH: [...new Set(chips.map(e => Math.round(e.getBoundingClientRect().height)))],",
    "          chipH: [...new Set(chips.map(e => Math.round(e.getBoundingClientRect().height)))],\n"
    "          markerGaps: [...new Set(mgaps)].sort((a, b) => a - b),\n"
    "          captionW: [...new Set(chips.map(e => { const cp = e.querySelector('.link-chip-caption'); return cp ? Math.round(cp.getBoundingClientRect().width) : 0; }))],")
open(p, 'w', encoding='utf-8').write(s)
print('ok')
