"""
Запекание дорогой части политического слоя карты в картинки.

Зачем: в map.svg у каждой из 29 территорий есть полупрозрачная заливка
(fill-opacity 0.05) и широкое размытое свечение границы (filter url(#fade)).
Вместе это ~0.4 МБ координат контуров, которые браузер растеризует заново на
КАЖДОМ кадре перетаскивания карты. Замер (15.09.2026, режим «Карта», жест с
.panning): кадр 15–17 мс со слоем против 7.5 мс без него. Замена одной
картинкой-слоем — те же 7.5–8 мс при том же виде. Замена размытия обводками без
фильтра НЕ помогла (14.8 мс): дорого не размытие, а сами контуры.

Как: tools/bake-political.html рисует только эти пути (остальная карта
спрятана), Edge без окна снимает скриншот кадра каждого тайла на прозрачном
фоне. Движок — тот же Chromium, так что картинка совпадает с векторной.

Запуск (нужен локальный сервер из корня проекта: python -m http.server 8765):
    python tools/bake-political.py [--grid 2] [--px 2048] [--port 8765]

После пересборки поднять POLITICAL_VER в js/map.js (имена файлов те же).
Перезапускать после каждого нового экспорта map.svg из StellarMaps.
"""

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "images" / "political"
EDGE_CANDIDATES = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
]
# Кадр всего слоя = исходный viewBox map.svg (он же initialViewBox в js/map.js).
# Территории за его краями всё равно под маской карты.
BOX = (-524.1176470588235, -370.11764705882354, 588.2352941176471, 588.2352941176471)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--grid", type=int, default=2, help="тайлов по стороне (должно совпадать с POLITICAL_GRID в js/map.js)")
    ap.add_argument("--px", type=int, default=2048, help="сторона одного тайла в пикселях (не больше 2048, грабли №1)")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--quality", type=int, default=88)
    args = ap.parse_args()

    edge = next((p for p in EDGE_CANDIDATES if p.exists()), None)
    if not edge:
        sys.exit("Не найден Edge/Chrome")
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    x0, y0, w, h = BOX
    tw, th = w / args.grid, h / args.grid

    with tempfile.TemporaryDirectory() as tmp:
        total = 0
        for r in range(args.grid):
            for c in range(args.grid):
                box = f"{x0 + c * tw},{y0 + r * th},{tw},{th}"
                url = f"http://localhost:{args.port}/tools/bake-political.html?px={args.px}&box={box}"
                png = Path(tmp) / f"{r}_{c}.png"
                subprocess.run([
                    str(edge), "--headless=new", "--disable-gpu", "--hide-scrollbars",
                    "--force-device-scale-factor=1", "--default-background-color=00000000",
                    f"--user-data-dir={Path(tmp) / 'profile'}", "--virtual-time-budget=20000",
                    f"--window-size={args.px},{args.px}", f"--screenshot={png}", url,
                ], check=True, timeout=180)
                img = Image.open(png).convert("RGBA")
                if img.size != (args.px, args.px):
                    sys.exit(f"Тайл {r},{c}: размер {img.size}, ожидался {args.px}")
                if img.getextrema()[3][1] == 0:
                    print(f"⚠️ тайл {r},{c} полностью прозрачный — страница не успела нарисоваться?")
                out = OUT_DIR / f"p_{r}_{c}.webp"
                img.save(out, "WEBP", quality=args.quality, method=6)
                total += out.stat().st_size
                print(f"{out.relative_to(ROOT)}: {out.stat().st_size // 1024} КБ")
        shutil.rmtree(Path(tmp) / "profile", ignore_errors=True)
    print(f"Итого {total // 1024} КБ, сетка {args.grid}×{args.grid} по {args.px}px")


if __name__ == "__main__":
    main()
