"""Проверка стиля news.json по notes/news-style.md: печатает подозрительные места.

Запуск: python tools/news_lint.py [news.json]. Код выхода 1, если есть замечания.
Ловит: реальные даты в тексте, двоеточия, больше одного длинного тире, канцелярит неопределённости,
рубрики старого формата (happened/why/now), длинные абзацы и новости.
"""
import json, re, sys, pathlib

sys.stdout.reconfigure(encoding='utf-8')
path = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else pathlib.Path(__file__).parent.parent / 'news.json')
data = json.loads(path.read_text(encoding='utf-8'))

MONTHS = r'январ|феврал|март[ае]?\b|апрел|ма[йея]\b|июн|июл|август|сентябр|октябр|ноябр|декабр'
# сцены в настоящем времени («он стоит над Ричардом») — новость устаревает, когда посты идут дальше
PRESENT = re.compile(r'(?:теперь\s+\w+(?:ет|ит|ут|ют|ат|ят)|уже стоит|стоит над|несёт его|несут|ждёт их|сейчас \w+(?:ет|ит))', re.I)
BANNED = ['показан', 'не установлен', 'доказ', 'основани', 'остаётся его', 'остаётся её', 'в постах',
          'последнее, что', 'свидетельство, а не', 'не подтвержд', 'независим', 'следует']
problems = []

def check(where, text, story_text=True):
    t = text or ''
    if re.search(r'\b20\d\d\b', t): problems.append((where, 'реальный год'))
    if story_text and re.search(MONTHS, t, re.I): problems.append((where, 'название месяца (реальная дата?)'))
    # двоеточия и тире можно, но редко (владелец 07.11): больше двух на текст — подозрительно
    if t.count(':') > 2: problems.append((where, f'двоеточий: {t.count(":")}'))
    if t.count('—') > 2: problems.append((where, f'длинных тире: {t.count("—")}'))
    for m in (PRESENT.finditer(t) if story_text == 'news' else ()): problems.append((where, f'настоящее время? «{m.group(0)}»'))
    low = t.lower()
    for b in BANNED:
        if b in low: problems.append((where, f'«{b}…»'))

for it in data.get('items', []):
    w = it['id']
    for k in ('happened', 'why', 'now', 'nowLabel'):
        if k in it: problems.append((w, f'старое поле {k}'))
    text = it.get('text', '')
    check(w, text, 'news')
    check(w + ' [title]', it.get('title', ''))
    paras = [p for p in text.split('\n\n') if p.strip()]
    if not 1 <= len(paras) <= 5: problems.append((w, f'абзацев: {len(paras)}'))
    for i, p in enumerate(paras):
        if len(p.split()) > 90: problems.append((w, f'абзац {i + 1}: {len(p.split())} слов'))
    if len(text.split()) > (200 if it.get("voice") == "said" else 230): problems.append((w, f'новость: {len(text.split())} слов'))

for sid, b in data.get('briefs', {}).items():
    for k in ('summary',):
        check(f'brief {sid}.{k}', b.get(k, ''))
    for k in ('known', 'dangers'):
        for i, s in enumerate(b.get(k, [])): check(f'brief {sid}.{k}[{i}]', s)
    for i, s in enumerate(b.get('playing', [])): check(f'brief {sid}.playing[{i}]', s.get('text', ''))

for w, msg in problems: print(f'{w}: {msg}')
print(f'— замечаний: {len(problems)} (записей {len(data.get("items", []))})')
sys.exit(1 if problems else 0)
