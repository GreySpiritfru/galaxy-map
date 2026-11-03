"""Сводка «все варианты рядом» (сравнение-390.png): из снимков mock-*-390.png вырезает сцены
«шторка», «окно раскрыто», «окно сюжета» и ставит столбцами: сейчас | А | Б | В.
Запуск после shoot-mocks.js:  python3 -I .../menu-sync/tools/compose.py  (нужен Pillow)."""
import json
import os
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
boxes = json.load(open(os.path.join(HERE, 'stage-boxes.json'), encoding='utf-8'))
cols = [('Сейчас', 'mock-0-now-390.png'), ('А: шторка как окна', 'mock-a-shtorka-kak-okna-390.png'),
        ('Б: окна как шторка', 'mock-b-okna-kak-shtorka-390.png'), ('В: общие правила', 'mock-c-obshie-tokeny-390.png')]
STAGES = [0, 2, 1]          # шторка, окно сюжета (свёрнуто), окно Фенома (раскрыто)
S = 2                       # deviceScaleFactor снимков
GAP, HEAD = 24, 72
font_path = os.path.join(OUT, '..', '..', '..', 'fonts', 'tektur-cyrillic.woff2')
# В подмножестве Tektur нет двоеточия — подписи столбцов системным шрифтом, если он есть.
font = None
for fp in ('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', font_path):
    try:
        font = ImageFont.truetype(fp, 32)
        break
    except Exception:
        pass
font = font or ImageFont.load_default()

pieces = []
for title, f in cols:
    im = Image.open(os.path.join(OUT, f)).convert('RGB')
    parts = [im.crop((int(x * S), int(y * S), int((x + w) * S), int((y + h) * S))) for x, y, w, h in (boxes[f][i] for i in STAGES)]
    pieces.append((title, parts))
col_w = max(p.width for _, parts in pieces for p in parts)
col_h = HEAD + sum(p.height for p in pieces[0][1]) + GAP * (len(STAGES) - 1)
sheet = Image.new('RGB', (len(pieces) * col_w + (len(pieces) - 1) * GAP, col_h), (11, 11, 16))
draw = ImageDraw.Draw(sheet)
for i, (title, parts) in enumerate(pieces):
    x = i * (col_w + GAP)
    draw.text((x + 16, 16), title, fill=(236, 236, 242), font=font)
    y = HEAD
    for p in parts:
        sheet.paste(p, (x, y))
        y += p.height + GAP
sheet.save(os.path.join(OUT, 'сравнение-390.png'))
print('сравнение-390.png', sheet.size)

# «до.png» — низ пяти снимков телефона «как сейчас» (после shoot-before.js) в один ряд.
names = ['до-390-шторка-карта.png', 'до-390-шторка-ноды.png', 'до-390-окно-story-1.png',
         'до-390-окно-phenome-раскрыто.png', 'до-390-окно-system-g-ux71.png']
ims = [Image.open(os.path.join(OUT, n)).convert('RGB') for n in names]
crops = [im.crop((0, im.height - 820, im.width, im.height)) for im in ims]
row = Image.new('RGB', (sum(c.width for c in crops) + 16 * (len(crops) - 1), 820), (30, 30, 36))
x = 0
for c in crops:
    row.paste(c, (x, 0))
    x += c.width + 16
row.save(os.path.join(OUT, 'до.png'))
print('до.png', row.size)
