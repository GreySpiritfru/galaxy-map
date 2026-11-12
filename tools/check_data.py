"""Проверка данных записей карты (02.11.2026, перенос планшета, шаг 2).

    python tools/check_data.py        — из корня репозитория; код выхода 1 при ошибках

Что сверяет:
  world.json        — признаки story/location/alliance только true (false = поля нет);
  ship/records.json — id районов/зданий уникальны и постоянного вида, sourceKey есть в
                      schema.json / bld/buildings.json, район здания существует и совпадает со схемой;
  modules.json      — статья модуля есть в копиях (articles/), границы from/to находятся
                      (та же логика, что в боте: article_mirror.resolve_module);
  relations.json    — from — точка карты, to — статья модуля, moduleId существует, связи уникальны.
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
errors: list = []


def load(path: str):
    return json.loads((ROOT / path).read_text("utf-8"))


def err(msg: str) -> None:
    errors.append(msg)


def normalize_url(url: str) -> str:
    return url.split("#")[0].split("?")[0].rstrip("/")


def article_url(art_id: str, sources: dict) -> str:
    src = sources.get(art_id) or {}
    if src.get("url"):
        return normalize_url(src["url"])
    m = re.match(r"^tt/([\w.-]+)/([\w-]+)$", art_id or "")
    return f"https://teletype.in/@{m.group(1)}/{m.group(2)}" if m else ""


def resolve(doc: dict, selector: dict) -> str:
    seen: dict = {}

    def walk(nodes):
        if not isinstance(nodes, list):
            return
        for i, n in enumerate(nodes):
            if isinstance(n, dict):
                if n.get("id"):
                    seen.setdefault(n["id"], []).append((id(nodes), i))
                walk(n.get("c"))

    walk(doc.get("c"))
    if not isinstance(selector, dict) or selector.get("type") not in ("sibling-range", "node"):
        return "неизвестный селектор"
    a = seen.get(selector.get("from"), [])
    if len(a) != 1:
        return "повтор начальной границы" if a else "нет начальной границы"
    if selector["type"] == "node":
        return ""
    b = seen.get(selector.get("to"), [])
    if len(b) != 1:
        return "повтор конечной границы" if b else "нет конечной границы"
    if a[0][0] != b[0][0]:
        return "границы в разных контейнерах"
    return "обратный порядок границ" if a[0][1] > b[0][1] else ""


world = load("world.json")
characters = load("characters.json")
point_ids = {x["id"] for x in world} | {x["id"] for x in characters}
for w in world:
    for k in ("story", "location", "alliance"):
        if k in w and w[k] is not True:
            err(f"world {w['id']}: {k} = {w[k]!r} (false — поля нет)")

rec = load("ship/records.json")
schema = load("ship/schema.json")
art = {i["name"]: i for i in load("ship/bld/buildings.json")["items"]}
schema_zones = {z["id"]: z for z in schema["zones"]}
zones = {}
for z in rec["zones"]:
    if not re.match(r"^zone:phenome:[a-z0-9-]+$", z["id"]) or z["id"] in zones:
        err(f"район {z['id']}: id не того вида или повтор")
    if z["sourceKey"] not in schema_zones:
        err(f"район {z['id']}: «{z['sourceKey']}» нет в schema.json")
    zones[z["id"]] = z
if set(schema_zones) != {z["sourceKey"] for z in rec["zones"]}:
    err("районы records.json и schema.json не совпадают")
seen_b = set()
for b in rec["buildings"]:
    if not re.match(r"^building:phenome:[a-z0-9-]+$", b["id"]) or b["id"] in seen_b:
        err(f"здание {b['id']}: id не того вида или повтор")
    seen_b.add(b["id"])
    if b["sourceKey"] not in art:
        err(f"здание {b['id']}: «{b['sourceKey']}» нет в bld/buildings.json")
    z = zones.get(b.get("zone"))
    if not z:
        err(f"здание {b['id']}: нет района {b.get('zone')!r}")
        continue
    owners = [k for k, sz in schema_zones.items() if b["sourceKey"] in sz.get("buildings", [])]
    explicit = (art.get(b["sourceKey"]) or {}).get("zone")
    if owners and owners != [z["sourceKey"]] or explicit and explicit != z["sourceKey"]:
        err(f"здание {b['id']}: район {z['sourceKey']} не совпадает со схемой ({owners or explicit})")
if {b["sourceKey"] for b in rec["buildings"]} != set(art):
    err("здания records.json и bld/buildings.json не совпадают")

mods = load("modules.json")
index = load("articles/index.json")["articles"]
docs = {}
for mid, m in mods["modules"].items():
    url = article_url(m.get("articleId"), mods.get("sources", {}))
    entry = index.get(url)
    if not entry:
        err(f"модуль {mid}: нет копии статьи {m.get('articleId')}")
        continue
    if url not in docs:
        docs[url] = load(entry["file"])
    reason = resolve(docs[url], m.get("selector"))
    if reason:
        err(f"модуль {mid}: {reason}")

# Свои статьи (articles/own/, own: true): файл и картинки на месте, статья записана в sources (или в справочнике js/articles.js) —
# иначе команда бота «убрать лишние статьи» сочтёт её копией без источника и удалит.
source_urls = {normalize_url(s.get("url", "")) for s in mods.get("sources", {}).values()}
source_urls |= {normalize_url(u) for u in re.findall(r"https://teletype\.in/@[\w.-]+/[\w-]+", (ROOT / "js/articles.js").read_text("utf-8"))}
for url, entry in index.items():
    if not entry.get("own"):
        continue
    if not (ROOT / entry["file"]).is_file():
        err(f"своя статья {url}: нет файла {entry['file']}")
    if url not in source_urls:
        err(f"своя статья {url}: нет ни в modules.json sources, ни в js/articles.js — бот может её убрать")
    for img in entry.get("images", []):
        if not (ROOT / img).is_file():
            err(f"своя статья {url}: нет картинки {img}")

rel = load("relations.json")
ids = set()
for r in rel["items"]:
    if r["id"] in ids:
        err(f"связь {r['id']}: повтор id")
    ids.add(r["id"])
    if r.get("from") not in point_ids:
        err(f"связь {r['id']}: from {r.get('from')!r} — не точка карты")
    if r.get("type") == "material":
        if r.get("mode") not in ("embed", "link"):
            err(f"связь {r['id']}: mode {r.get('mode')!r}")
        mod = mods["modules"].get(r.get("moduleId"))
        if r.get("mode") == "embed" and not mod:
            err(f"связь {r['id']}: embed без модуля {r.get('moduleId')!r}")
        if mod and mod.get("articleId") != r.get("to"):
            err(f"связь {r['id']}: модуль {r['moduleId']} из другой статьи")
        if r.get("from") in {c["id"] for c in characters} and r.get("mode") == "embed":
            err(f"связь {r['id']}: персонажу embed нельзя")
    elif r.get("type") == "related":
        if r.get("to") not in point_ids:
            err(f"связь {r['id']}: to {r.get('to')!r} — не точка карты")
    else:
        err(f"связь {r['id']}: тип {r.get('type')!r}")

if errors:
    print("ОШИБКИ:\n" + "\n".join("  " + e for e in errors))
    sys.exit(1)
print(f"OK: world {len(world)} (сюжетов {sum(1 for w in world if w.get('story'))}, "
      f"альянсов {sum(1 for w in world if w.get('alliance'))}); районов {len(zones)}, зданий {len(seen_b)}; "
      f"модулей {len(mods['modules'])}; связей {len(ids)}")
