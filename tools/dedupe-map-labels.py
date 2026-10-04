"""Убирает повторы подписей систем из map.svg (экспорт StellarMaps).

python tools/dedupe-map-labels.py [map.svg]

StellarMaps пишет каждую подпись системы ДВАЖДЫ: сначала пары «значок звезды
<use> + <text>», сразу за ними — второй блок тех же <text> без значков
(побайтно одинаковых, 808 штук на экспорте 2026 года). Браузер честно рисует
оба: подписи — главная цена кадра (CLAUDE.md, «Производительность»), у
готовых систем было по две мишени .sys-hit. Блоки стоят вплотную, между ними
ничего нет, поэтому убрать вторые копии можно без изменения порядка слоёв.

Удаляется только ПОВТОР — <text>, побайтно совпадающий с уже встреченным
раньше в файле (вместе с пробелом перед ним). Названия фракций (Impact) и всё
прочее не трогается. Повторный запуск ничего не меняет.

Запускать после каждого нового экспорта карты, вместе с optimize-map-svg.py,
trim-sector-dashes.py и bake-political.py (порядок — в CLAUDE.md, грабли №1).
"""
import re
import sys

path = sys.argv[1] if len(sys.argv) > 1 else 'map.svg'
src = open(path, encoding='utf-8').read()

seen = set()
removed = 0


def drop(m):
    global removed
    el = m.group(2)
    if el in seen:
        removed += 1
        return ''
    seen.add(el)
    return m.group(0)


out = re.sub(r'(\s*)(<text\b[^>]*>.*?</text>)', drop, src, flags=re.S)
if removed:
    with open(path, 'w', encoding='utf-8', newline='') as f:
        f.write(out)
print(f'{path}: убрано повторов подписей {removed}, размер {len(src.encode()) // 1024} -> {len(out.encode()) // 1024} КБ')
