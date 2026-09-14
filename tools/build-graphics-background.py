#!/usr/bin/env python3
"""
Сборка фона для режима "Графика" из ассетов модпака Stellaris.

Берёт слои карты галактики из мода, складывает их ровно так, как это делает
игра, вырезает кусок под наш viewBox и режет на WebP-тайлы в images/galaxy/.

ЗАЧЕМ ТАК, А НЕ СКРИНШОТЫ (разбор 15.09.2026):
  Скриншотить игру бессмысленно — в файлах мода лежит исходник лучше того,
  что снимается с экрана, и не нужно ни прятать интерфейс, ни подгонять
  камеру, ни сшивать кадры с разной перспективой.

  ⚠️ В ВАНИЛЬНОЙ игре этого нет: там весь фон галактики — две текстуры
  2048x2048 (gfx/map/galaxycolor.dds и nebulacolor.dds) на галактику ЦЕЛИКОМ,
  то есть на наш участок пришлось бы ~1100px — ХУЖЕ нынешнего растра
  StellarMaps (2048x2048). Всё это работает только благодаря модпаку.

⚠️ ГАЛАКТИК В МЕРДЖЕ НЕСКОЛЬКО, И ОНИ КОНКУРИРУЮТ. Четыре файла в
gfx/models/galaxy_map/ объявляют ОДНУ И ТУ ЖЕ сущность
`default_galaxy_center_entity`: _z_quadrant, real_galaxy_map_objects,
stargazer_galaxy_objects и 伞ow_IBS_galaxy. Выигрывает загруженный последним,
а имя последнего начинается с иероглифа 伞 (U+4F1E) — он сортируется после
латиницы, то есть автор мерджа намеренно вывел IBS в конец. Проверить
наверняка можно только в самой игре.

  - "ibs"  — gfx/galaxy/IBS_real_galaxy_*: фон + 4 квадранта по 8192x8192 +
             слой звёзд. Самый подробный: ~15.7 px на единицу карты.
  - "real" — gfx/particles/real_galaxy_*: карта 4700x4700 на всю галактику,
             детальный слой на центральную половину, ядро и 16 тайлов звёзд.
             Мягче: ~4.2 px/ед. у базовой карты (звёзды и центр ~8.4).
  - stargazer как фон не годится в принципе: его галактика собирается из
    сорока с лишним частиц в реальном времени, единой текстуры нет
    (stargazer_spiral.png — спрайт 256x256).

⚠️ ВЕСА СЛОЁВ ВАЖНЫ. Все слои идут шейдером ParticleAdditive со своей
непрозрачностью из мода (alpha=200 у фона IBS, 47.1 у его квадрантов, 97.1 у
звёзд). Первая версия скрипта брала ТОЛЬКО квадранты и на полной
непрозрачности — картинка выходила гладкой, без звёздной крошки и без
правильной основы, игрок сразу опознал "не тот арт". Складывать надо все
слои и с их весами.
"""

import argparse
import glob
import json
import math
import os
import re
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Нужен Pillow:  pip install pillow")
try:
    import numpy as np
except ImportError:
    sys.exit("Нужен numpy:  pip install numpy")

Image.MAX_IMAGE_PIXELS = None

MOD_ROOT = (r"C:\Users\User\Documents\Paradox Interactive\Stellaris"
            r"\mod\(Merge)_phenome_(1)")

# Масштаб сцены галактики к координатам карты.
#
# ⚠️ ГЛАВНАЯ КОНСТАНТА ВЫРАВНИВАНИЯ. Слои в моде заданы в единицах сцены
# (size=70 и т.п.), а наши маркеры — в координатах StellarMaps. Множитель 8
# сходится с данными по обоим наборам: у IBS содержимое квадранта тянется на
# 65.164 ед. сцены от центра, это 521.3 единицы карты, а самая дальняя
# подпись системы в map.svg лежит на радиусе 527 — звёзды заполняют текстуру
# почти точно до края. У real_galaxy базовая карта size=140, то есть ±560
# единиц карты, звёзды занимают 94% — тоже правдоподобно.
#
# Если картинка не сядет — правится в первую очередь это число.
SCENE_TO_MAP = 8.0

# Слои: (файл, x, z, size в единицах сцены, вес, вид).
# x — вертикаль сцены (при + уходит ВВЕРХ на экране), z — горизонталь.
# ⚠️ Экранная горизонталь берётся из z, а НЕ из x: разложенные "по x" четыре
# квадранта смотрят ядрами наружу и галактика разваливается.
#
# ⚠️ ВИД СЛОЯ — "plane" или "parallax", и это НЕ косметика (наблюдение
# игрока, 15.09.2026). В игре слои звёзд лежат ОТДЕЛЬНО над плоскостью
# галактики специально ради параллакса: камеру в Stellaris можно наклонить, и
# тогда звёзды уходят относительно фона, давая объём. У нас вид строго сверху
# и наклона не будет никогда — значит эти слои не добавляют ничего, кроме
# мелкой крошки поверх картинки, и ещё раздувают вес (WebP плохо жмёт мелкий
# высокочастотный шум: real_galaxy со звёздами весил 1.76 МБ против 0.56 МБ
# без них). Поэтому по умолчанию берутся ТОЛЬКО plane-слои.
#
# Ровно на этом я и ошибся: первая сборка случайно вышла верной (одни
# квадранты), потом я "исправил" её, добавив звёзды по образцу мода — и
# картинка поехала в мусор.
SETS = {
    "ibs": {
        "dir": os.path.join("gfx", "galaxy"),
        "layers": [
            ("IBS_real_galaxy_map_BG.dds",        0.0,      0.0,     130.3, 2.000, "plane"),
            ("IBS_real_galaxy_map_alpha.dds",    32.5818,  32.5818,   70.0, 0.471, "plane"),
            ("IBS_real_galaxy_map_beta.dds",     32.5818, -32.5818,   70.0, 0.471, "plane"),
            ("IBS_real_galaxy_map_gamma.dds",   -32.5818, -32.5818,   70.0, 0.471, "plane"),
            ("IBS_real_galaxy_map_delte.dds",   -32.5818,  32.5818,   70.0, 0.471, "plane"),
            ("IBS_real_galaxy_stars_alpha.dds",  21.0,     21.0,      42.1, 0.971, "parallax"),
            ("IBS_real_galaxy_stars_beta.dds",   21.0,    -21.0,      42.1, 0.971, "parallax"),
            ("IBS_real_galaxy_stars_gamma.dds", -21.0,    -21.0,      42.1, 0.971, "parallax"),
            ("IBS_real_galaxy_stars_delte.dds", -21.0,     21.0,      42.1, 0.971, "parallax"),
            ("FX_galaxy_core_cloud.dds",          0.0,      0.0,      40.0, 0.600, "parallax"),
        ],
    },
    "real": {
        "dir": os.path.join("gfx", "particles"),
        "layers": [
            ("real_galaxy_map.dds",   0.0, 0.0, 140.0, 0.300, "plane"),
            ("real_galaxy_map_2.dds", 0.0, 0.0,  70.0, 0.300, "plane"),
            ("real_galaxy_core.dds",  0.0, 0.0,  70.0, 0.500, "plane"),
        ] + [
            (f"real_galaxy_stars_{g}_{q}.dds", sx * 35.0, sz * 35.0, 70.0, 0.500, "parallax")
            for g in (1, 2, 3, 4)
            for q, (sx, sz) in enumerate([(1, 1), (1, -1), (-1, -1), (-1, 1)], 1)
        ],
    },
}

# Доля чёрных полей с КАЖДОЙ стороны холста слоя: у квадрантов IBS содержимое
# 8192px внутри 8800px (по 304px полей), см. геометрию в CLAUDE.md. Поля
# отрезаются до масштабирования, иначе на стыке квадрантов шов.
PAD_RATIO = {fn: 304 / 8800 for fn in (
    "IBS_real_galaxy_map_alpha.dds", "IBS_real_galaxy_map_beta.dds",
    "IBS_real_galaxy_map_gamma.dds", "IBS_real_galaxy_map_delte.dds")}

# Радиус приглушения ядра (--core-dim) в единицах карты: примерно размер
# светлого пятна ядра IBS. Дальше картинка не трогается.
CORE_DIM_RADIUS = 108.0

VIEW_BOX = (-524.1176470588235, -370.11764705882354, 588.2352941176471)

# Размер одного тайла. 2048 — осознанный потолок: на 4096 у проекта уже
# ломался рендер на части устройств (грабли №1, лимит текстуры GPU).
TILE = 2048


def read_view_box(svg_path):
    """viewBox читается из map.svg, чтобы константа не разъехалась с файлом
    после нового экспорта из StellarMaps."""
    with open(svg_path, "r", encoding="utf-8", errors="replace") as f:
        head = f.read(4000)
    m = re.search(r'viewBox="(-?[\d.]+)\s+(-?[\d.]+)\s+([\d.]+)\s+([\d.]+)"', head)
    return tuple(float(m.group(i)) for i in (1, 2, 3, 4)) if m else None


# ---------------------------------------------------------------------------
# Туманности (цветные облака поверх галактики)
#
# ⚠️ Их НЕТ в арте галактики — это отдельные объекты конкретной партии, их
# позиции живут только в СЕЙВЕ (блоки `nebula={ coordinate={x y} name radius
# galactic_object=... }` в gamestate). Поэтому для них нужен .sav, а не мод.
#
# Система координат сейва совпадает с map.svg с точностью до знака X:
# x_карты = -x_сейва, y_карты = y_сейва. Сверено по восьми системам
# (подпись в map.svg стоит на ~1.25 ниже звезды, отсюда мелкое расхождение Y).
#
# Как их рисует игра (gfx/Fx/galaxy_nebula.shader мода): каждая туманность —
# несколько квадов-«пылинок», у каждого случайный поворот; пиксель =
# nebula.dds (маска формы, альфа *5) × nebulacolor.dds (бирюзово-зелёное
# облако) по ОДНИМ И ТЕМ ЖЕ UV, смешивание обычное альфа-наложение (не
# аддитивное, в отличие от слоёв галактики). Размер пылинки — из defines мода:
# GALAXY_NEBULA_DUST_SIZE + случайная добавка до GALAXY_NEBULA_DUST_SIZE_EXTRA.
#
# ⚠️ Сколько именно пылинок и где — решает движок, в файлах этого нет. Здесь
# приближение: по пылинке на каждую систему туманности (их список есть в
# сейве) плюс крупная в центре на весь радиус. Случайность засеяна именем
# туманности — пересборка даёт ту же картинку, а не новую каждый раз.
# ---------------------------------------------------------------------------
NEBULA_DUST_SIZE = 20.0        # IBS_defines.txt: GALAXY_NEBULA_DUST_SIZE
NEBULA_DUST_SIZE_EXTRA = 35.0  # IBS_defines.txt: GALAXY_NEBULA_DUST_SIZE_EXTRA


def read_save(save_path):
    import zipfile
    with zipfile.ZipFile(save_path) as z:
        g = z.read("gamestate").decode("utf-8", "replace")
    systems = {}
    # ⚠️ Только внутри секции galactic_object: у ПЛАНЕТ та же разметка
    # `N={ coordinate={x y} }`, но координаты относительно своей звезды (около
    # нуля) и id пересекаются с id систем — без этого ограничения все
    # пылинки съезжали кучей к центру галактики.
    start = g.find("\ngalactic_object=\n{")
    end = re.compile(r"\n[a-z_]+=").search(g, start + 20)
    section = g[start:end.start() if end else len(g)]
    heads = list(re.finditer(r'\n\t(\d+)=\n\t\{\n\t\tcoordinate=\n\t\t\{\n\t\t\tx=([-\d.]+)'
                             r'\n\t\t\ty=([-\d.]+)', section))
    for i, m in enumerate(heads):
        block_end = heads[i + 1].start() if i + 1 < len(heads) else len(section)
        block = section[m.end():block_end]
        name = re.search(r'\n\t\tname=\n\t\t\{\n\t\t\tkey="([^"]*)"', block)
        star = re.search(r'\n\t\tstar_class="([^"]+)"', block)
        systems[m.group(1)] = {"x": -float(m.group(2)), "y": float(m.group(3)),
                               "name": name.group(1) if name else "",
                               "star_class": star.group(1) if star else ""}
    nebulae = []
    for m in re.finditer(r'\nnebula=\n\{(.*?)\n\}', g, re.S):
        body = m.group(1)
        c = re.search(r'x=([-\d.]+)\s+y=([-\d.]+)', body)
        name = re.search(r'key="([^"]*)"', body)
        rad = re.search(r'\n\tradius=([\d.]+)', body)
        members = [systems[s] for s in re.findall(r'galactic_object=(\d+)', body) if s in systems]
        nebulae.append({"name": name.group(1) if name else "?",
                        "x": -float(c.group(1)), "y": float(c.group(2)),
                        "radius": float(rad.group(1)) if rad else 30.0,
                        "members": members})
    return nebulae, list(systems.values())


# ---------------------------------------------------------------------------
# Кастомные туманности — tools/nebulae.json (запрос игрока, 15.09.2026).
#
# Вместо стандартного бирюзового облака туманность рисуется выбранными
# спрайтами из gfx/particles мода. Туманность ищется по названию СИСТЕМЫ,
# которая в неё входит (или по ключу самой туманности из сейва), позиция и
# радиус — из сейва, так что правки сейва (перенос туманности) подхватятся
# пересборкой без правки конфига.
#
# Формат записи:
#   "system":  название системы ("Туманность-Гнездо") или "nebula": ключ из сейва
#   "at_system": название системы, в центр которой ПЕРЕНЕСТИ рисунок (радиус
#              остаётся от туманности). Запись только с "at_system" (без
#              "system"/"nebula") — самостоятельная туманность, которой нет в
#              сейве; её радиус — "radius" (по умолчанию 30).
#   Названия систем сравниваются без учёта регистра.
#   "replace": true — стандартное облако этой туманности не рисовать
#   "layers": [ { "texture": имя .dds в gfx/particles (без расширения), либо
#                   путь от корня мода "gfx/models/effects/…", либо
#                   "game:gfx/…" — из папки самой игры,
#                 "at": "center" | "ring" | "members",
#                 "size": размер спрайта в радиусах туманности (1 = диаметр),
#                 "count": сколько спрайтов на кольце (для "ring"),
#                 "distance": радиус кольца в радиусах туманности (для "ring"),
#                 "alpha": непрозрачность 0..1, "rotation": градусы или "random",
#                 "blend": "additive" (как ParticleAdditive в моде, по умолчанию)
#                          | "alpha" } ]
# ---------------------------------------------------------------------------
GAME_ROOT = r"E:\SteamLibrary\steamapps\common\Stellaris"
CUSTOM_NEBULAE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "nebulae.json")


def paste_sprite(acc, sprite_rgba, x, y, size, rotation, alpha, blend, vb, s, out_px):
    """Кладёт RGBA-спрайт центром в точку (x, y) карты. False — вне кадра."""
    side = int(round(size * s))
    x0 = int(round((x - vb[0]) * s - side / 2))
    y0 = int(round((y - vb[1]) * s - side / 2))
    if side < 2 or x0 + side <= 0 or y0 + side <= 0 or x0 >= out_px or y0 >= out_px:
        return False
    sp = sprite_rgba
    if rotation:
        sp = sp.rotate(rotation, resample=Image.BICUBIC)
    a = np.asarray(sp.resize((side, side), Image.LANCZOS), np.float32) / 255.0
    sx0, sy0 = max(0, -x0), max(0, -y0)
    dx0, dy0 = max(0, x0), max(0, y0)
    dx1, dy1 = min(out_px, x0 + side), min(out_px, y0 + side)
    part = a[sy0:sy0 + (dy1 - dy0), sx0:sx0 + (dx1 - dx0)]
    region = acc[dy0:dy1, dx0:dx1]
    k = np.clip(part[..., 3:4] * alpha, 0, 1)
    if blend == "additive":
        region += part[..., :3] * k
    elif blend == "screen":
        # 1-(1-фон)(1-спрайт): чёрное не меняет ничего, светлое светится, но
        # не выбивает в белое, как additive на светлом ядре галактики.
        region[:] = 1 - (1 - np.clip(region, 0, 1)) * (1 - part[..., :3] * k)
    else:
        region *= 1 - k
        region += part[..., :3] * k
    return True


def load_custom_nebulae():
    if not os.path.exists(CUSTOM_NEBULAE):
        return []
    with open(CUSTOM_NEBULAE, encoding="utf-8") as f:
        return json.load(f).get("nebulae", [])


def find_custom(neb, custom):
    names = {m["name"].lower() for m in neb["members"]}
    for entry in custom:
        if entry.get("nebula") == neb["name"] or (entry.get("system") or "").lower() in names:
            return entry
    return None


def resolve_targets(nebulae, systems, custom):
    """Пары (туманность, запись конфига или None) с учётом at_system."""
    by_name = {sy["name"].lower(): sy for sy in systems}
    targets, missing = [], []
    for neb in nebulae:
        entry = find_custom(neb, custom)
        if entry and entry.get("at_system"):
            sy = by_name.get(entry["at_system"].lower())
            if sy is None:
                missing.append(entry["at_system"])
            else:
                neb = dict(neb, x=sy["x"], y=sy["y"])
        targets.append((neb, entry))
    for entry in custom:
        if entry.get("nebula") or entry.get("system"):
            if not any(find_custom(n, [entry]) for n in nebulae):
                missing.append(entry.get("system") or entry.get("nebula"))
            continue
        sy = by_name.get((entry.get("at_system") or "").lower())
        if sy is None:
            missing.append(entry.get("at_system") or "?")
            continue
        targets.append(({"name": sy["name"], "x": sy["x"], "y": sy["y"],
                         "radius": float(entry.get("radius", 30.0)), "members": []}, entry))
    return targets, missing


# ---------------------------------------------------------------------------
# Значки звёзд (запрос игрока, 15.09.2026) — вместо одинаковых белых точек
# StellarMaps у каждой системы свой значок, как на карте галактики в игре.
#
# Запечены в фон, а не отдельными <image> в SVG: ~800 элементов перерисовывались
# бы на каждом кадре панорамирования (грабли №15), а в арте они бесплатны.
# Точки StellarMaps при этом не убраны, а только притушены CSS-ом в «Графике».
#
# Цепочка: star_class системы из сейва (sc_binary_g_k) -> описание класса в
# common/star_classes (мод поверх игры) -> поле `icon`, если нет — `class`
# (g_k_binary_star) -> gfx/map/star_classes/<icon>.dds. Так же выбирает и сама
# игра: в описании классов `class` назван «ID for GFX and code», а у двойных
# и гигантов отдельный `icon`. Размер умножается на `icon_scale` класса.
#
# ⚠️ В мердже есть 0000_giga_placeholder_star_classes.txt с однострочными
# заглушками `sc_x = { class = sc_empty_space }` — файлы читаются по алфавиту
# и последнее определение побеждает, поэтому настоящие 00_star_classes.txt
# их перекрывают. Нет значка — рисуется g_star (обычная звезда).
# ---------------------------------------------------------------------------
STAR_ICON_FALLBACK = "g_star"
STAR_ICON_MAX_SCALE = 3.0   # потолок icon_scale: «Центр Галактики» был ×10


def read_star_classes(mod_root):
    defs = {}
    for root in (GAME_ROOT, mod_root):
        for f in sorted(glob.glob(os.path.join(root, "common", "star_classes", "*.txt"))):
            t = re.sub(r"#[^\n]*", "", open(f, encoding="utf-8-sig", errors="replace").read())
            for m in re.finditer(r"(?m)^\s*(sc_\w+)\s*=\s*\{", t):
                depth, i = 1, m.end()
                while depth and i < len(t):
                    depth += {"{": 1, "}": -1}.get(t[i], 0)
                    i += 1
                body = t[m.end():i]
                top = re.sub(r"\{[^{}]*\}", "", body)   # поля верхнего уровня
                cls = re.search(r"\bclass\s*=\s*(\w+)", top)
                icon = re.search(r"\bicon\s*=\s*(\w+)", top)
                scale = re.search(r"\bicon_scale\s*=\s*([\d.]+)", top)
                defs[m.group(1)] = {
                    "icon": (icon or cls).group(1) if (icon or cls) else None,
                    "scale": float(scale.group(1)) if scale else 1.0}
    return defs


def draw_star_icons(acc, save_path, mod_root, vb, s, out_px, size, alpha, glow=1.0):
    _, systems = read_save(save_path)
    defs = read_star_classes(mod_root)
    cache, stats, fallback = {}, {}, 0

    def icon_image(name):
        if name not in cache:
            cache[name] = None
            for root in (mod_root, GAME_ROOT):
                p = os.path.join(root, "gfx", "map", "star_classes", f"{name}.dds")
                if name and os.path.exists(p):
                    im = Image.open(p).convert("RGBA")
                    # Звезда в текстуре — белая точка в центре и тусклые лучи с
                    # ореолом вокруг. При ужатии 128 px до ~40 лучи усредняются с
                    # чёрным фоном, и звезда выглядит блеклой (игрок, 15.09.2026).
                    # Гамма < 1 поднимает именно тусклое, центр и так белый.
                    if glow != 1.0:
                        a = np.asarray(im, np.float32) / 255.0
                        a[..., :3] = np.power(a[..., :3], glow)
                        im = Image.fromarray((a * 255).astype(np.uint8), "RGBA")
                    cache[name] = im
                    break
        return cache[name]

    for sy in systems:
        d = defs.get(sy["star_class"], {"icon": None, "scale": 1.0})
        im = icon_image(d["icon"])
        if im is None:
            im = icon_image(STAR_ICON_FALLBACK)
            fallback += 1
        # ⚠️ "screen", а не "alpha": у текстур star_classes альфы нет, фон
        # сплошной чёрный — альфа-наложение давало чёрные квадраты.
        # icon_scale у особых классов огромный (центр галактики sc_birch ×10 —
        # на карте это кольцо в 70 единиц), поэтому множитель ограничен.
        scale = min(d["scale"], STAR_ICON_MAX_SCALE)
        if paste_sprite(acc, im, sy["x"], sy["y"], size * scale, 0, alpha, "screen", vb, s, out_px):
            stats[d["icon"]] = stats.get(d["icon"], 0) + 1
            if d["scale"] > 2:
                print(f"    крупный значок: {sy['name']} {sy['star_class']} -> {d['icon']} ×{d['scale']}")
    top = ", ".join(f"{k}×{v}" for k, v in sorted(stats.items(), key=lambda kv: -kv[1])[:8])
    print(f"  значки звёзд: в кадре {sum(stats.values())} (без своего значка {fallback}); {top}")


def draw_nebulae(acc, save_path, mod_root, vb, s, out_px, strength):
    import random
    nebulae, systems = read_save(save_path)
    custom = load_custom_nebulae()
    targets, missing = resolve_targets(nebulae, systems, custom)
    tex_dir = os.path.join(mod_root, "gfx", "map")
    mask = Image.open(os.path.join(tex_dir, "nebula.dds")).convert("RGBA")
    color = Image.open(os.path.join(tex_dir, "nebulacolor.dds")).convert("RGBA").resize(mask.size, Image.LANCZOS)
    m = np.asarray(mask, np.float32) / 255.0
    c = np.asarray(color, np.float32) / 255.0
    rgb = m[..., :3] * c[..., :3]
    alpha = np.clip(m[..., 3] * 5.0, 0, 1) * c[..., 3]
    sprite = Image.fromarray((np.dstack([np.clip(rgb, 0, 1), alpha]) * 255).astype(np.uint8), "RGBA")
    textures = {}

    def particle(name):
        # "имя" -> gfx/particles мода; "gfx/models/effects/имя" -> путь от
        # корня мода; "game:gfx/..." -> путь от папки самой игры (GAME_ROOT).
        if name not in textures:
            # Расширение можно не писать (тогда .dds), но png/jpg/tga тоже годятся.
            rel = name if os.path.splitext(name)[1].lower() in (".dds", ".png", ".jpg", ".tga") else name + ".dds"
            if rel.startswith("game:"):
                p = os.path.join(GAME_ROOT, rel[5:])
            elif "/" in rel:
                p = os.path.join(mod_root, rel)
            else:
                p = os.path.join(mod_root, "gfx", "particles", rel)
            if not os.path.exists(p):
                print(f"    ⚠️ нет текстуры {p} — слой пропущен")
                textures[name] = None
            else:
                textures[name] = Image.open(p).convert("RGBA")
        return textures[name]

    drawn = 0
    for neb, entry in targets:
        rnd = random.Random(neb["name"])
        visible = False
        if not (entry and entry.get("replace", True)):
            dusts = [(neb["x"], neb["y"], neb["radius"] * 2)]
            dusts += [(mm["x"], mm["y"], NEBULA_DUST_SIZE + rnd.random() * NEBULA_DUST_SIZE_EXTRA)
                      for mm in neb["members"]]
            for x, y, size in dusts:
                visible |= paste_sprite(acc, sprite, x, y, size, rnd.random() * 360,
                                        strength, "alpha", vb, s, out_px)
        if entry:
            R = neb["radius"]
            for layer in entry.get("layers", []):
                tex = particle(layer["texture"])
                if tex is None:
                    continue
                at = layer.get("at", "center")
                if at == "center":
                    points = [(neb["x"], neb["y"], 0.0)]
                elif at == "ring":
                    n = int(layer.get("count", 4))
                    dist = layer.get("distance", 1.0) * R
                    phase = rnd.random() * 360
                    points = []
                    for i in range(n):
                        ang = math.radians(phase + 360 * i / n)
                        points.append((neb["x"] + math.cos(ang) * dist,
                                       neb["y"] + math.sin(ang) * dist,
                                       -math.degrees(ang)))
                else:  # members
                    points = [(mm["x"], mm["y"], 0.0) for mm in neb["members"]]
                for x, y, face in points:
                    rot = layer.get("rotation", "random")
                    rot = rnd.random() * 360 if rot == "random" else float(rot) + face
                    visible |= paste_sprite(acc, tex, x, y, layer.get("size", 1.0) * 2 * R, rot,
                                            layer.get("alpha", 1.0), layer.get("blend", "additive"),
                                            vb, s, out_px)
        if visible:
            drawn += 1
            tag = ""
            if entry:
                tag = f" [кастом: {entry.get('system') or entry.get('nebula') or 'своя'}"
                tag += f" -> {entry['at_system']}]" if entry.get("at_system") else "]"
            print(f"    туманность {neb['name']}: ({neb['x']:.0f}, {neb['y']:.0f}), "
                  f"систем {len(neb['members'])}{tag}")
    if missing:
        print(f"  ⚠️ в nebulae.json не нашлись в сейве: {', '.join(missing)}")
    print(f"  туманностей в сейве {len(nebulae)}, всего с кастомными {len(targets)}, "
          f"попало в кадр {drawn}")


def build(set_name, mod_root, out_dir, grid, quality, svg_path, with_parallax, overrides,
          core_dim=1.0, save_path=None, nebula_strength=1.0,
          star_icon_size=0.0, star_icon_alpha=1.0, star_icon_glow=1.0, sharpen=None):
    cfg = SETS[set_name]
    src_dir = os.path.join(mod_root, cfg["dir"])
    if not os.path.isdir(src_dir):
        sys.exit(f"Нет папки с ассетами: {src_dir}")

    vb = VIEW_BOX
    real_vb = read_view_box(svg_path) if os.path.exists(svg_path) else None
    if real_vb is None:
        print(f"  ⚠️ не нашёл {svg_path}, беру viewBox из константы")
    elif abs(real_vb[0] - vb[0]) > 0.01 or abs(real_vb[2] - vb[2]) > 0.01:
        print(f"  ⚠️ viewBox в map.svg = {real_vb[:3]}, в скрипте {vb} — беру из файла")
        vb = real_vb[:3]

    out_px = grid * TILE
    # Складываем сразу в РАЗРЕШЕНИИ ВЫВОДА, а не собираем галактику целиком:
    # у IBS она была бы 17500x17500 и не влезла бы в память. Каждый слой
    # масштабируется один раз сразу в свой итоговый размер — качество от
    # этого только выигрывает (одна интерполяция вместо двух).
    acc = np.zeros((out_px, out_px, 3), np.float32)
    px_per_map_unit = out_px / vb[2]

    layers = [l for l in cfg["layers"] if with_parallax or l[5] == "plane"]
    # Подкрутка весов из командной строки: --weight BG=0 выключит базовый слой,
    # --weight core_cloud=0.3 притушит свечение ядра. Совпадение по подстроке
    # имени файла. Нужно потому, что "как в моде" и "как лучше смотрится у нас"
    # — не одно и то же: у мода поверх ещё анимация и эффекты, которых в
    # плоской картинке нет, и точные веса мода дают слишком плоское ядро.
    if overrides:
        tuned = []
        for fn, lx, lz, size_units, weight, kind in layers:
            for frag, val in overrides.items():
                if frag.lower() in fn.lower():
                    if weight != val:
                        print(f"    вес {fn}: {weight} -> {val}")
                    weight = val
            if weight > 0:
                tuned.append((fn, lx, lz, size_units, weight, kind))
        layers = tuned
    skipped = len(cfg["layers"]) - len(layers)
    print(f"  набор «{set_name}», слоёв {len(layers)}"
          f"{f' (+{skipped} parallax пропущено)' if skipped else ''}, "
          f"вывод {out_px}x{out_px}px")
    used = 0
    for fn, lx, lz, size_units, weight, _kind in layers:
        p = os.path.join(src_dir, fn)
        if not os.path.exists(p):
            print(f"    пропуск (нет файла): {fn}")
            continue
        # Центр слоя в координатах карты: z -> горизонталь, x -> вертикаль
        # вверх (значит по экранной оси Y знак меняется).
        cxm = lz * SCENE_TO_MAP
        cym = -lx * SCENE_TO_MAP
        side_m = size_units * SCENE_TO_MAP

        src = Image.open(p)
        # ⚠️ ШОВ-КРЕСТ ЧЕРЕЗ ЦЕНТР (нашёл игрок, 15.09.2026: "штрихи из центра,
        # части арта налезают друг на друга"). Холст квадранта 8800px, из них
        # по краям 304px ЧЁРНЫХ полей. Раньше слой масштабировался целиком, с
        # полями, и каждый угол округлялся отдельно — в итоге на одной оси
        # квадранты перекрывались на 2px (двойная яркость, белая черта), на
        # другой расходились на 1px (тёмная черта), а Lanczos на резком краю
        # "контент -> чёрное поле" добавлял звон с обеих сторон.
        # Поэтому: сначала отрезаем поля, и масштабируем ТОЛЬКО содержимое;
        # края считаются в дробных пикселях и округляются по одному правилу —
        # соседние квадранты делят в центре одно и то же число, и их края
        # совпадают до пикселя, без нахлёста и без щели.
        pad = int(src.width * PAD_RATIO.get(fn, 0.0))
        if pad:
            src = src.crop((pad, pad, src.width - pad, src.height - pad))
            side_m *= 1 - 2 * PAD_RATIO[fn]
        left = (cxm - side_m / 2 - vb[0]) * px_per_map_unit
        top = (cym - side_m / 2 - vb[1]) * px_per_map_unit
        x0, y0 = int(round(left)), int(round(top))
        x1 = int(round(left + side_m * px_per_map_unit))
        y1 = int(round(top + side_m * px_per_map_unit))

        # Целиком за кадром — даже не открываем.
        if x1 <= 0 or y1 <= 0 or x0 >= out_px or y0 >= out_px:
            src.close()
            continue

        im = src.convert("RGBA").resize((x1 - x0, y1 - y0), Image.LANCZOS)
        src.close()
        a = np.asarray(im, np.float32) / 255.0
        im.close()
        # Слой ParticleAdditive: rgb, помноженный на свою альфу и на вес.
        # Отрицательные значения — звон Lanczos, в аддитивном сложении их нет.
        contrib = np.clip(a[..., :3], 0, 1) * a[..., 3:4] * weight

        sx0, sy0 = max(0, -x0), max(0, -y0)
        dx0, dy0 = max(0, x0), max(0, y0)
        dx1, dy1 = min(out_px, x1), min(out_px, y1)
        acc[dy0:dy1, dx0:dx1] += contrib[sy0:sy0 + (dy1 - dy0), sx0:sx0 + (dx1 - dx0)]
        used += 1

    if not used:
        sys.exit("Ни один слой не попал в кадр — проверьте SCENE_TO_MAP и пути.")

    if save_path:
        draw_nebulae(acc, save_path, mod_root, vb, px_per_map_unit, out_px, nebula_strength)

    # Приглушение ядра (игрок, 15.09.2026: "ядро слишком яркое, урезать в
    # полтора раза"). В игре поверх ядра лежат тени и эффекты, в плоской
    # картинке их нет, и центр выходит засвеченным.
    #
    # Что пробовали и НЕ взяли (сравнение кропов ядра бок о бок):
    #  - общий вес слоёв — темнеют заодно и без того тёмные рукава;
    #  - сжатие ярких мест по кривой яркости — ядро и белые рукава вокруг него
    #    сплющиваются в ОДНО ровное пятно, пропадает само свечение;
    #  - равное умножение rgb — бледно-жёлтый центр (240,241,204) при
    #    затемнении становится грязно-оливковым.
    # Взято: плавное затемнение по РАДИУСУ от центра галактики (косинусный
    # спад до нуля на CORE_DIM_RADIUS), рисунок внутри ядра не меняется, только
    # его яркость. Каналы делятся не поровну — синий сильнее, красный слабее
    # (h^1.15 / h / h^0.6), иначе и тут выходит олива, а так ядро остаётся
    # тёплым, в тон бежевому кольцу вокруг.
    if core_dim > 1:
        s = px_per_map_unit
        cx, cy = -vb[0] * s, -vb[1] * s     # центр галактики = (0,0) карты
        R = CORE_DIM_RADIUS * s
        y_lo, y_hi = max(0, int(cy - R)), min(out_px, int(cy + R) + 1)
        x_lo, x_hi = max(0, int(cx - R)), min(out_px, int(cx + R) + 1)
        yy, xx = np.mgrid[y_lo:y_hi, x_lo:x_hi].astype(np.float32)
        t = np.clip(np.hypot(xx - cx, yy - cy) / R, 0, 1)
        w = 0.5 * (1 + np.cos(np.pi * t))
        for ch, p in enumerate((0.6, 1.0, 1.15)):
            acc[y_lo:y_hi, x_lo:x_hi, ch] *= 1 - (1 - core_dim ** -p) * w
        print(f"  ядро приглушено в {core_dim} раза (радиус {CORE_DIM_RADIUS} ед. карты)")
    # Значки — ПОСЛЕ приглушения ядра, иначе звёзды в центре галактики тоже потемнели бы.
    if save_path and star_icon_size > 0:
        draw_star_icons(acc, save_path, mod_root, vb, px_per_map_unit, out_px,
                        star_icon_size, star_icon_alpha, star_icon_glow)
    canvas = Image.fromarray(np.clip(acc * 255.0, 0, 255).astype(np.uint8))
    # Резкость (игрок, 15.09.2026): разрешение упёрлось в исходник мода — сетка
    # 4×4 и уровень 15–24 px/ед на глаз почти не отличались. Нерезкая маска
    # ДО сжатия в WebP (после сжатия она раздувала бы артефакты) подчёркивает
    # края пыли и лучи звёзд, ничего не стоя ни по памяти, ни по отрисовке.
    # Радиус в пикселях ВЫВОДА: при смене --grid его стоит пересмотреть.
    if sharpen:
        from PIL import ImageFilter
        radius, percent = sharpen
        canvas = canvas.filter(ImageFilter.UnsharpMask(radius=radius, percent=int(percent), threshold=2))
        print(f"  резкость: радиус {radius}px, сила {percent:.0f}%")
    del acc

    os.makedirs(out_dir, exist_ok=True)
    total = 0
    for r in range(grid):
        for c in range(grid):
            t = canvas.crop((c * TILE, r * TILE, (c + 1) * TILE, (r + 1) * TILE))
            p = os.path.join(out_dir, f"tile-{r}-{c}.webp")
            t.save(p, "WEBP", quality=quality, method=6)
            total += os.path.getsize(p)
            t.close()

    # Мелкое превью всего участка: показывается мгновенно при входе в режим,
    # пока не догрузятся тайлы, чтобы не мигало пустотой.
    prev = canvas.resize((1024, 1024), Image.LANCZOS)
    pp = os.path.join(out_dir, "preview.webp")
    prev.save(pp, "WEBP", quality=quality, method=6)
    prev_size = os.path.getsize(pp)
    canvas.close()

    with open(os.path.join(out_dir, "meta.json"), "w", encoding="utf-8") as f:
        json.dump({"set": set_name, "grid": grid, "tile": TILE,
                   "parallaxLayers": with_parallax,
                   "sceneToMap": SCENE_TO_MAP, "viewBox": list(vb),
                   "note": "Собрано tools/build-graphics-background.py"},
                  f, ensure_ascii=False, indent=2)

    print(f"\n  готово: {grid}x{grid} тайлов по {TILE}px = {out_px}px по стороне")
    print(f"  тайлы: {total/1024/1024:.2f} МБ, превью: {prev_size/1024:.0f} КБ")
    print(f"  итого: {(total+prev_size)/1024/1024:.2f} МБ "
          f"(грузится только при входе в «Графику»)")


def main():
    ap = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--set", default="ibs", choices=sorted(SETS),
                    help="какую галактику мода собирать")
    ap.add_argument("--mod", default=MOD_ROOT, help="корень модпака")
    ap.add_argument("--out", default=os.path.join("images", "galaxy"))
    ap.add_argument("--grid", type=int, default=2,
                    help="2 = 4096px (безопасно), 3 = 6144px, 4 = 8192px. "
                         "Больше сетка — кратно больше памяти под текстуры на "
                         "телефоне, см. CLAUDE.md")
    ap.add_argument("--quality", type=int, default=80)
    ap.add_argument("--svg", default="map.svg", help="откуда сверить viewBox")
    ap.add_argument("--with-parallax", action="store_true",
                    help="добавить слои звёзд, которые в игре нужны только "
                         "для параллакса при наклоне камеры. У нас вид строго "
                         "сверху — они дают лишь крошку поверх картинки и "
                         "утяжеляют её втрое. По умолчанию выключено.")
    ap.add_argument("--weight", action="append", metavar="ИМЯ=ЧИСЛО",
                    help="переопределить вес слоя (совпадение по подстроке "
                         "имени файла), 0 выключает слой совсем. Например "
                         "--weight BG=0 даёт вариант из одних квадрантов, "
                         "--weight core_cloud=0.3 притушит свечение ядра.")
    ap.add_argument("--core-dim", type=float, default=1.0, metavar="РАЗ",
                    help="во сколько раз притушить ядро галактики (плавно по "
                         "радиусу, рукава не трогаются). 1.5 = в полтора раза "
                         "темнее. По умолчанию 1 (без изменений).")
    ap.add_argument("--save", metavar="ФАЙЛ.sav",
                    help="сейв партии — из него берутся туманности (их позиций "
                         "нет в моде, только в сейве). Без параметра туманностей нет.")
    ap.add_argument("--star-icons", type=float, default=0.0, metavar="РАЗМЕР",
                    help="запечь значки звёзд из gfx/map/star_classes (нужен --save): "
                         "размер значка в единицах карты до icon_scale класса. "
                         "0 — без значков (по умолчанию). Точка системы — 1 ед.")
    ap.add_argument("--star-icon-alpha", type=float, default=1.0, metavar="Ч",
                    help="непрозрачность значков звёзд")
    ap.add_argument("--sharpen", type=float, nargs=2, metavar=("РАДИУС", "СИЛА"),
                    help="нерезкая маска перед нарезкой: радиус в px и сила в %%, "
                         "например --sharpen 2 120. По умолчанию выключено.")
    ap.add_argument("--star-icon-glow", type=float, default=1.0, metavar="ГАММА",
                    help="усиление лучей и ореола звёзд: 1 — как в игре, 0.6 — ярче "
                         "(гамма к текстуре до ужатия)")
    ap.add_argument("--nebula-strength", type=float, default=1.0, metavar="Ч",
                    help="непрозрачность туманностей, 1 = как в шейдере игры")
    a = ap.parse_args()
    overrides = {}
    for w in (a.weight or []):
        if "=" not in w:
            sys.exit(f"--weight ждёт вид ИМЯ=ЧИСЛО, получено: {w}")
        k, v = w.split("=", 1)
        overrides[k.strip()] = float(v)
    print("Сборка фона режима «Графика»")
    build(a.set, a.mod, a.out, a.grid, a.quality, a.svg, a.with_parallax, overrides,
          a.core_dim, a.save, a.nebula_strength, a.star_icons, a.star_icon_alpha,
          a.star_icon_glow, a.sharpen)


if __name__ == "__main__":
    main()
