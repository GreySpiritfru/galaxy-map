"""
Пережимает растровую подложку внутри SVG-карты из PNG в WebP.

Зачем: StellarMaps вшивает фон в SVG как base64-PNG, и именно он даёт ~90%
веса файла (вектор — всего ~1 МБ из 9.4). WebP с альфой жмёт тот же кадр
примерно в 5 раз лучше PNG при неотличимой на глаз разнице.

Почему НЕ JPEG: в растре реально используется альфа-канал (проверено, есть
полностью прозрачные пиксели). JPEG её выбрасывает и подставляет белый — это
тот самый "белёсый шов", из-за которого JPEG забраковали раньше. Если очень
нужен JPEG, сначала подложи под картинку #0b0b10 (фон виджета), тогда шва не
будет, но альфа потеряется безвозвратно.

Запуск:
    python tools/optimize-map-svg.py map.svg
    python tools/optimize-map-svg.py map.svg -o map-new.svg -q 85

Требует Pillow (pip install pillow).
"""
import argparse
import base64
import io
import os
import re
import sys

DATA_URI = re.compile(r'data:image/(?P<fmt>\w+);base64,(?P<payload>[A-Za-z0-9+/=]+)')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("svg", help="исходный SVG (например map.svg)")
    ap.add_argument("-o", "--out", help="куда писать; по умолчанию перезаписывает исходник")
    ap.add_argument("-q", "--quality", type=int, default=85, help="качество WebP, 0-100 (по умолчанию 85)")
    args = ap.parse_args()

    try:
        from PIL import Image
    except ImportError:
        sys.exit("Нужен Pillow:  pip install pillow")

    src = args.svg
    dst = args.out or src
    raw = open(src, "r", encoding="utf-8").read()
    before = len(raw.encode("utf-8"))

    m = DATA_URI.search(raw)
    if not m:
        sys.exit("В SVG не нашёлся встроенный растр (data:image/...;base64,)")
    if m.group("fmt") == "webp":
        sys.exit("Растр уже в WebP — пережимать нечего.")

    img = Image.open(io.BytesIO(base64.b64decode(m.group("payload"))))
    print(f"растр внутри: {img.format} {img.mode} {img.size[0]}x{img.size[1]}")

    buf = io.BytesIO()
    # method=6 — самый медленный и самый плотный режим; файл готовится один раз,
    # так что лишние секунды тут ничего не стоят.
    img.save(buf, "WEBP", quality=args.quality, method=6)
    webp_b64 = base64.b64encode(buf.getvalue()).decode("ascii")

    # Заменяем ровно одно вхождение — то, что нашли, чтобы случайно не задеть
    # другие data-URI, если они когда-нибудь появятся в файле.
    out = raw[:m.start()] + f"data:image/webp;base64,{webp_b64}" + raw[m.end():]
    open(dst, "w", encoding="utf-8", newline="\n").write(out)

    after = len(out.encode("utf-8"))
    print(f"растр:  {len(m.group('payload'))/1024/1024:.2f} MB -> {len(webp_b64)/1024/1024:.2f} MB base64")
    print(f"файл:   {before/1024/1024:.2f} MB -> {after/1024/1024:.2f} MB  ({after/before*100:.0f}% от исходного)")
    print(f"записан: {dst}")


if __name__ == "__main__":
    main()
