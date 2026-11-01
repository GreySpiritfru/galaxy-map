/* ============================================================
   Реестр записей (02.11.2026, перенос планшета, шаг 3; план — notes/merge-plan.md).

   Все записи карты под одним id, рядом с графом (graph.js остаётся раскладкой
   маркеров). Чистый модуль: ни DOM, ни fetch — данные передаёт вызывающий
   (map.js, проверка tools/check-records.mjs). Основа — mock/n6/model.js без
   новостей, эпох и черновых подписей.

   kind: world | character | system | article | zone | building.
   Сюжет / локация / альянс — признаки world (flags), не виды.
   id: world и character — как в файлах; system:<slug>; статья — путь копии без
   «articles/» и «.json» (tt/greyspirit/4tRzyNaVfEQ); районы и здания — из
   ship/records.json (zone:phenome:…, building:phenome:…).
   Все записи регистрируются до индексов (дети, союзы, модули) — поздних add нет.
   ============================================================ */

const list = v => Array.isArray(v) ? v : [];
const finite = (x, y) => Number.isFinite(x) && Number.isFinite(y);
export const bareUrl = url => String(url || '').trim().split('#')[0].split('?')[0].replace(/\/+$/, '');
const docIdOf = entry => String(entry.file || '').replace(/^articles\//, '').replace(/\.json$/, '');

/* Границы модуля в копии статьи: from/to включительно, одни соседи, from не
   позже to; type node — один блок. Та же проверка в боте (article_mirror.py
   resolve_module) и в tools/check_data.py. */
export function resolveModule(doc, selector) {
  if (!doc) return {status: 'unavailable', reason: 'Документ недоступен', blocks: null};
  const seen = new Map();
  (function walk(nodes) {
    if (!Array.isArray(nodes)) return;
    nodes.forEach((node, index) => {
      if (!node || typeof node !== 'object') return;
      if (node.id) {
        if (!seen.has(node.id)) seen.set(node.id, []);
        seen.get(node.id).push({node, parent: nodes, index});
      }
      walk(node.c);
    });
  })(doc.c);
  const failed = reason => ({status: 'invalid', reason, blocks: null});
  if (!selector || !['sibling-range', 'node'].includes(selector.type)) return failed('Неизвестный селектор');
  const from = seen.get(selector.from) || [];
  if (from.length !== 1) return failed(from.length ? 'Повтор начальной границы' : 'Начальная граница отсутствует');
  if (selector.type === 'node') return {status: 'ok', reason: '', blocks: [from[0].node]};
  const to = seen.get(selector.to) || [];
  if (to.length !== 1) return failed(to.length ? 'Повтор конечной границы' : 'Конечная граница отсутствует');
  if (from[0].parent !== to[0].parent) return failed('Границы находятся в разных контейнерах');
  if (from[0].index > to[0].index) return failed('Обратный порядок границ');
  return {status: 'ok', reason: '', blocks: from[0].parent.slice(from[0].index, to[0].index + 1)};
}

/* Признаки world. Нет ни у одной точки story (данные до 02.11.2026 или откат) —
   сюжет по маяку, как раньше (так же решает бот: map_editor.is_story). */
export function worldFlags(item, migrated = true) {
  return {
    story: migrated ? item.story === true : item.beacon === true,
    location: item.location === true,
    alliance: item.alliance === true,
    beacon: item.beacon === true,
    completed: item.completed === true,
  };
}

/* data: {world, characters, articlesIndex, systems: {manifest, titles, lore},
   shipRecords, modules, relations, refArticles}. Нет файла — пустое значение,
   реестр строится из того, что есть (сбой одного файла не роняет карту). */
export function buildRecords(data) {
  const world = list(data.world), characters = list(data.characters);
  const articles = Object.entries((data.articlesIndex && data.articlesIndex.articles) || {});
  const systems = data.systems || {};
  const ship = data.shipRecords || {};
  const modules = (data.modules && data.modules.modules) || {};
  const relations = list(data.relations && data.relations.items);
  const refArticles = data.refArticles || {};

  const records = [], byId = new Map(), diagnostics = [];
  function add(value) {
    if (!value.id || byId.has(value.id)) { diagnostics.push({type: 'duplicate', id: value.id}); return null; }
    const r = {title: '', shortTitle: '', aliases: [], parentId: null, links: [], flags: null, image: '',
      content: {intro: '', ownDocument: null, moduleRefs: []}, mapTargets: [], ...value};
    r.aliases = [...new Set([r.title, r.shortTitle, ...list(r.aliases)].filter(Boolean))];
    records.push(r); byId.set(r.id, r);
    return r;
  }
  const targets = p => {
    const out = [];
    if (finite(p.x, p.y)) out.push({type: 'galaxy', x: p.x, y: p.y});
    if (finite(p.systemX, p.systemY) && String(p.parent || '').startsWith('system:')) out.push({type: 'system', systemId: p.parent, x: p.systemX, y: p.systemY});
    if (finite(p.submapX, p.submapY)) out.push({type: 'ship', recordId: 'phenome', x: p.submapX, y: p.submapY});
    return out;
  };

  // Копии статей: адрес без якоря → запись индекса.
  const entryByUrl = new Map(articles.map(([url, e]) => [bareUrl(url), e]));
  const docOfUrl = url => { const e = entryByUrl.get(bareUrl(url)); return e && e.file ? docIdOf(e) : null; };

  const migrated = world.some(p => p && 'story' in p);
  for (const p of world) {
    if (!p || typeof p.id !== 'string') continue;
    add({id: p.id, kind: 'world', title: p.title || p.id, shortTitle: p.shortTitle || '', image: p.image || '',
      source: {type: 'world', key: p.id}, flags: worldFlags(p, migrated), parentId: p.parent || null,
      links: list(p.links), content: {intro: p.description || '', ownDocument: null, moduleRefs: []},
      mapTargets: targets(p)});
  }
  for (const p of characters) {
    if (!p || typeof p.id !== 'string') continue;
    const title = p.name || p.title || p.id;
    const plain = title.replace(/^(?:\p{L}\.\s*)+/u, '');
    add({id: p.id, kind: 'character', title, shortTitle: p.shortTitle || '', image: p.image || '',
      aliases: [plain, plain.split(/\s+/)[0]], source: {type: 'characters', key: p.id},
      parentId: p.parent || null, links: list(p.links),
      content: {intro: p.description || '', ownDocument: p.sheetUrl ? docOfUrl(p.sheetUrl) : null, moduleRefs: []},
      mapTargets: targets(p)});
  }

  // Статьи — только те, на которые ссылается карта: справочник, статьи точек,
  // лор систем, модули и материалы. Копии без ссылки (старые анкеты) записями
  // не становятся — бот их уберёт («убрать лишние статьи»).
  const wanted = new Map(); // id копии → адрес
  const want = url => { const id = docOfUrl(url); if (id && !wanted.has(id)) wanted.set(id, bareUrl(url)); };
  Object.values(refArticles).forEach(want);
  world.forEach(p => { if (p && p.article && p.article.url) want(p.article.url); });
  Object.values(systems.lore || {}).forEach(l => { if (l && l.url) want(l.url); });
  const moduleSources = (data.modules && data.modules.sources) || {};
  Object.values(moduleSources).forEach(s => { if (s && s.url) want(s.url); });
  const sheets = new Set(records.filter(r => r.kind === 'character').map(r => r.content.ownDocument).filter(Boolean));
  for (const [id, url] of wanted) {
    if (sheets.has(id)) continue;
    const entry = entryByUrl.get(url);
    add({id, kind: 'article', title: entry.title || id, source: {type: 'article', key: url, file: entry.file},
      url, content: {intro: '', ownDocument: id, moduleRefs: []}});
  }

  // Системы — весь manifest, не только с якорем на карте галактики.
  for (const slug of list(systems.manifest)) {
    const titles = systems.titles || {};
    const title = titles[slug] || (/^[a-z]/i.test(slug) ? slug.toUpperCase()
      : slug.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '));
    add({id: 'system:' + slug, kind: 'system', title, slug, source: {type: 'system', key: slug},
      lore: (systems.lore || {})[slug] || null, mapTargets: [{type: 'system', systemId: 'system:' + slug}]});
  }

  // Районы и здания схемы Фенома — постоянные id из ship/records.json.
  for (const z of list(ship.zones)) {
    add({id: z.id, kind: 'zone', title: z.name, source: {type: 'ship-zone', key: z.sourceKey},
      parentId: 'phenome', mapTargets: [{type: 'ship', recordId: 'phenome', key: z.sourceKey}]});
  }
  for (const b of list(ship.buildings)) {
    if (!b.zone) diagnostics.push({type: 'building-zone', id: b.id});
    add({id: b.id, kind: 'building', title: b.name, source: {type: 'ship-building', key: b.sourceKey},
      parentId: b.zone || null, mapTargets: [{type: 'ship', recordId: 'phenome', key: b.sourceKey}]});
  }

  // Модули и материалы (relations.json). Тексты модулей карта соберёт, когда
  // будет показывать (шаг 4); здесь — только кто что включает.
  for (const rel of relations) {
    const from = byId.get(rel.from);
    if (!from) { diagnostics.push({type: 'relation', id: rel.id, reason: 'нет записи ' + rel.from}); continue; }
    if (rel.type === 'material') {
      if (rel.mode === 'embed' && from.kind === 'character') { diagnostics.push({type: 'relation', id: rel.id, reason: 'персонажу embed нельзя'}); continue; }
      if (rel.moduleId && !modules[rel.moduleId]) { diagnostics.push({type: 'relation', id: rel.id, reason: 'нет модуля ' + rel.moduleId}); continue; }
      from.content.moduleRefs.push({relationId: rel.id, recordId: rel.to, moduleId: rel.moduleId || null,
        mode: rel.mode === 'embed' ? 'embed' : 'link', order: rel.order || 0});
    }
  }
  records.forEach(r => r.content.moduleRefs.sort((a, b) => a.order - b.order));

  // Индексы: дети (обратный parent) и союзы (links симметричны, как в graph.js).
  const children = new Map(), allies = new Map();
  for (const r of records) {
    if (r.parentId) { if (!children.has(r.parentId)) children.set(r.parentId, []); children.get(r.parentId).push(r.id); }
    for (const id of r.links) {
      if (!byId.has(id) || id === r.id) continue;
      if (!allies.has(r.id)) allies.set(r.id, new Set());
      if (!allies.has(id)) allies.set(id, new Set());
      allies.get(r.id).add(id); allies.get(id).add(r.id);
    }
  }
  for (const r of records) if (r.parentId && !byId.has(r.parentId)) diagnostics.push({type: 'parent', id: r.id, reason: 'нет родителя ' + r.parentId});

  // Старые адреса: ключ справочника (phenom, magic…) и адрес статьи → id + якорь.
  const refAlias = {};
  for (const [key, url] of Object.entries(refArticles)) {
    const id = docOfUrl(url);
    if (id && byId.has(id)) refAlias[key] = {id, anchor: String(url).split('#')[1] || ''};
  }

  return {records, byId, children, allies, diagnostics, refAlias, entryByUrl, migrated};
}

/* Адрес → {id, anchor}. Понимает id записи, ключ справочника (phenom) и адрес
   статьи (https://teletype.in/@…#якорь). Неизвестное — null. */
export function resolveAddress(reg, addr, anchor = '') {
  if (!reg || typeof addr !== 'string' || !addr) return null;
  if (reg.byId.has(addr)) return {id: addr, anchor};
  if (Object.prototype.hasOwnProperty.call(reg.refAlias, addr)) {
    const a = reg.refAlias[addr];
    return {id: a.id, anchor: anchor || a.anchor};
  }
  if (/^https?:\/\//i.test(addr)) {
    const e = reg.entryByUrl.get(bareUrl(addr));
    const id = e && e.file ? docIdOf(e) : null;
    if (id && reg.byId.has(id)) return {id, anchor: anchor || addr.split('#')[1] || ''};
  }
  return null;
}
