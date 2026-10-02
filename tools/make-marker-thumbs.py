"""
Миниатюры маркеров: поле `image` в world.json / characters.json → маленькая
WebP-копия в images/markers/.

Зачем (v=187, замер на телефоне игрока): `image` рисуется только мелко —
маркер на карте и в нодах (до ~45 px), ряд переходов и стопки в окне (до
64 px), списки. А лежали там исходники до 1809×2560 (постер «Переворота»):
34 картинки — 2.3 МБ трафика при каждом холодном запуске и ~64 МБ памяти
после раскодирования. Первый показ нод после запуска давал кадр в 171 мс —
телефон раскодировал их разом. Баннеры в окне берутся из `images` — их
этот инструмент не трогает.

Как: картинка, у которой короткая сторона больше MIN_SIDE (или файл больше
MAX_KB), уменьшается так, чтобы короткая сторона стала MIN_SIDE (маркер
обрезается по форме, «cover» — короткая сторона и решает чёткость; 256 px =
64 px на экране с DPR 3 + запас), WebP q82 с альфой (у PNG-логотипов она
есть). Путь в JSON меняется ТОЛЬКО заменой строки в тексте файла: формат,
который бот сохраняет байт-в-байт, не трогается. Исходники остаются на
месте (могут быть баннерами в `images`).

Новые картинки бот и так кладёт маленькими (точка — `<id>-marker.jpg`
256 px, аватар персонажа — 320 px), они под порог не попадают. Запускать,
если кто-то вписал в `image` большой файл руками:
    python tools/make-marker-thumbs.py [--dry]
⚠️ Бот коммитит world.json / characters.json — перед запуском pull.
"""
import json, os, sys
from urllib.parse import unquote
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT_DIR = 'images/markers'
MIN_SIDE = 256
MAX_KB = 60
FILES = ('world.json', 'characters.json')


def thumb_name(rel):
    stem = os.path.splitext(os.path.basename(rel))[0]
    safe = ''.join(ch if ch.isalnum() or ch in '-_' else '-' for ch in stem).strip('-').lower()
    return f'{OUT_DIR}/{safe or "marker"}.webp'


def make_thumb(src, dst):
    im = Image.open(src)
    has_alpha = im.mode in ('RGBA', 'LA', 'P') and ('transparency' in im.info or im.mode != 'P')
    im = im.convert('RGBA' if has_alpha else 'RGB')
    w, h = im.size
    k = MIN_SIDE / min(w, h)
    if k < 1:
        im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    im.save(dst, 'WEBP', quality=82, method=6)
    return im.size


def main():
    dry = '--dry' in sys.argv
    os.makedirs(os.path.join(ROOT, OUT_DIR), exist_ok=True)
    done = {}
    total_before = total_after = 0
    for fname in FILES:
        path = os.path.join(ROOT, fname)
        with open(path, encoding='utf-8', newline='') as f:
            text = f.read()
        new_text = text
        for item in json.loads(text):
            value = item.get('image')
            if not value or value.startswith(OUT_DIR + '/'):
                continue
            rel = unquote(value.split('?')[0])
            src = os.path.join(ROOT, rel)
            if not os.path.isfile(src):
                print('нет файла:', value); continue
            kb = os.path.getsize(src) / 1024
            with Image.open(src) as im:
                short = min(im.size)
            if short <= MIN_SIDE * 1.25 and kb <= MAX_KB:
                continue
            if rel not in done:
                dst_rel = thumb_name(rel)
                if any(d == dst_rel for d in done.values()):
                    dst_rel = dst_rel[:-5] + '-' + str(len(done)) + '.webp'
                size = (0, 0)
                if not dry:
                    size = make_thumb(src, os.path.join(ROOT, dst_rel))
                after = os.path.getsize(os.path.join(ROOT, dst_rel)) / 1024 if not dry else 0
                total_before += kb; total_after += after
                print(f'{rel}: {kb:.0f} КБ, {short}px → {dst_rel} {size[0]}×{size[1]} {after:.0f} КБ')
                done[rel] = dst_rel
            # Замена строки целиком, в кавычках: формат файла не меняется.
            old = json.dumps(value, ensure_ascii=False)
            assert old in new_text, value
            new_text = new_text.replace('"image": ' + old, '"image": ' + json.dumps(done[rel], ensure_ascii=False))
        if new_text != text and not dry:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(new_text)
    print(f'итого {len(done)} картинок: {total_before:.0f} КБ → {total_after:.0f} КБ')


if __name__ == '__main__':
    main()
