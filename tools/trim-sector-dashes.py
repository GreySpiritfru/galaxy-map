"""
Пунктир секторов в map.svg без clip-path — дешевле на каждом кадре.

Зачем: у 22 пунктирных линий секторов (границы секторов внутри территорий,
`stroke-dasharray="3 3"`) в экспорте StellarMaps стоит clip-path по контуру
территории — чтобы толстый штрих у самой границы не вылезал за неё. Контуры
сложные (до 12 тысяч символов координат), и обрезка по ним пересчитывается
заново на КАЖДОМ кадре перетаскивания. Замер 26.09.2026 (кадр телефона,
отрисовка на процессоре — так рисует SVG Firefox): обрезка — это 23–28%
стоимости кадра на любом приближении.

Как: tools/trim-sector-dashes.html (Edge без окна) раскладывает каждую линию
на штрихи заранее; штрих, целиком лежащий внутри контура, остаётся как есть,
штрих у границы укорачивается с концов, пока вся его ширина не окажется
внутри (до края доходила только полоса границы, которая рисуется поверх).
Здесь результат вписывается в map.svg: у этих путей новый `d`, без
stroke-dasharray/stroke-dashoffset/clip-path, и метка `data-sector="1"` —
по ней js/map.js (classifyPoliticalOverlay) узнаёт линии секторов, раньше
узнавал по пунктиру (их прячет режим «Графика»). Сравнение с оригиналом
попиксельно: 0–12 отличающихся пикселей на кадр 984×2132 на любом зуме
(без обрезки вовсе — 400–600, штрихи вылезают за границу).

Запуск (нужен локальный сервер из корня проекта: python -m http.server 8765):
    python tools/trim-sector-dashes.py [--port 8765] [--svg map.svg]

Перезапускать после каждого нового экспорта map.svg из StellarMaps (после
tools/optimize-map-svg.py). Повторный запуск на уже обработанном файле ничего
не меняет.
"""

import argparse
import html
import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
EDGE_CANDIDATES = [
    Path(r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Microsoft\Edge\Application\msedge.exe"),
    Path(r"C:\Program Files\Google\Chrome\Application\chrome.exe"),
]
PATH_TAG = re.compile(r"<path\b[^>]*>")
DROP_ATTRS = re.compile(r'\s(?:stroke-dasharray|stroke-dashoffset|clip-path)="[^"]*"')
D_ATTR = re.compile(r'\sd="[^"]*"')


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--svg", default=str(ROOT / "map.svg"))
    args = ap.parse_args()

    svg_path = Path(args.svg)
    raw = svg_path.read_bytes().decode("utf-8")
    tags = [m for m in PATH_TAG.finditer(raw) if 'stroke-dasharray="' in m.group(0) and 'clip-path="' in m.group(0)]
    if not tags:
        print("Пунктира с clip-path нет — файл уже обработан.")
        return

    edge = next((p for p in EDGE_CANDIDATES if p.exists()), None)
    if not edge:
        sys.exit("Не найден Edge/Chrome")
    url = f"http://localhost:{args.port}/tools/trim-sector-dashes.html"
    with tempfile.TemporaryDirectory() as tmp:
        res = subprocess.run([
            str(edge), "--headless=new", "--disable-gpu", f"--user-data-dir={Path(tmp) / 'profile'}",
            "--virtual-time-budget=120000", "--dump-dom", url,
        ], capture_output=True, timeout=600)
        shutil.rmtree(Path(tmp) / "profile", ignore_errors=True)
    dom = res.stdout.decode("utf-8", errors="replace")
    m = re.search(r'<pre id="out">(.*?)</pre>', dom, re.S)
    if not m or not m.group(1).strip():
        sys.exit("Страница не вернула результат — сервер запущен? (python -m http.server 8765)")
    data = json.loads(html.unescape(m.group(1)))
    if not data.get("ok"):
        sys.exit("Ошибка на странице:\n" + data.get("error", "?"))
    plans = data["plans"]
    if data["count"] != len(tags):
        sys.exit(f"Путей в файле {len(tags)}, а страница нашла {data['count']} — не совпадает, ничего не пишу.")

    out, pos = [], 0
    done = skipped = kept = trimmed = dropped = 0
    for tag, plan in zip(tags, plans):
        out.append(raw[pos:tag.start()])
        pos = tag.end()
        t = tag.group(0)
        if not plan or not plan.get("d"):
            out.append(t)
            skipped += 1
            continue
        t = DROP_ATTRS.sub("", t)
        t = D_ATTR.sub(lambda _m: f' d="{plan["d"]}"', t, count=1)
        # Пунктира больше нет, а по нему js/map.js (classifyPoliticalOverlay)
        # узнавал линии секторов — теперь по этой метке.
        t = t.replace("<path", '<path data-sector="1"', 1)
        out.append(t)
        done += 1
        kept += plan["kept"]
        trimmed += plan["trimmed"]
        dropped += plan["dropped"]
    out.append(raw[pos:])
    new = "".join(out)
    svg_path.write_bytes(new.encode("utf-8"))
    print(f"Линий: {done} обработано, {skipped} пропущено (не тот случай — оставлены как были)")
    print(f"Штрихов: {kept} целиком внутри, {trimmed} укорочено у границы, {dropped} выброшено")
    print(f"map.svg: {len(raw.encode('utf-8')) / 1024 / 1024:.2f} МБ -> {len(new.encode('utf-8')) / 1024 / 1024:.2f} МБ")


if __name__ == "__main__":
    main()
