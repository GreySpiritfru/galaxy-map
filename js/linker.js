// Чистые данные: нет DOM, fetch и работы при импорте. Индексы строит вызывающий.
// collectRecords → buildAliases → linkText / mentions; поиск — отдельный индекс.
const normalize = s => String(s ?? '').normalize('NFC').toLowerCase().replace(/ё/g, 'е')
  .replace(/[’‘ʼ]/g, "'");
const unique = a => [...new Set(a.filter(Boolean))];
const list = a => Array.isArray(a) ? a : [];
const words = s => [...String(s ?? '').matchAll(/[\p{L}\p{M}\p{N}_]+(?:['’‘ʼ-][\p{L}\p{M}\p{N}_]+)*/gu)]
  .map(m => ({text: m[0], key: normalize(m[0]), start: m.index, end: m.index + m[0].length}));

// Прозвище Шел неотличимо от «шёл» в начале предложения даже с учётом ё.
// Феном слишком частотен. «Мина» (персонаж) и «Бездна» (сюжет) в настоящих
// текстах также обычные существительные: предпочитаем пропуск ложной ссылке.
// Стоп-лист действует только на целый псевдоним, поиск его не использует.
const STOP = new Set(['феном', 'шел', 'мина', 'бездна']);
const INDECLINABLE = new Set(['кэт']);
const FEMALE = new Set(['кэт', 'шелди', 'лира', 'мина', 'фефилия', 'изида', 'текила']);

// Небольшая таблица окончаний, не морфологический словарь. Не угадываем
// прозвища и нерегулярные основы (Павел → Павла); их задают в news.aliases.
function forms(word, fixed = false) {
  const w = normalize(word);
  if (fixed || w.length < 3 || INDECLINABLE.has(w)) return [w];
  let stem = w, tails = [];
  if (/(ский|цкий)$/.test(w)) { stem = w.slice(0, -2); tails = ['ий', 'ого', 'ому', 'им', 'ом']; }
  else if (/(ый|ой)$/.test(w)) { stem = w.slice(0, -2); tails = ['ый', 'ой', 'ого', 'ому', 'ым', 'ом']; }
  else if (/ая$/.test(w)) { stem = w.slice(0, -2); tails = ['ая', 'ой', 'ую', 'ою']; }
  else if (/яя$/.test(w)) { stem = w.slice(0, -2); tails = ['яя', 'ей', 'юю', 'ею']; }
  else if (/а$/.test(w)) { stem = w.slice(0, -1); tails = ['а', /[гкхжчшщ]$/.test(stem) ? 'и' : 'ы', 'е', 'у', 'ой', 'ою']; }
  else if (/ия$/.test(w)) { stem = w.slice(0, -1); tails = ['я', 'и', 'ю', 'ей']; }
  else if (/я$/.test(w)) { stem = w.slice(0, -1); tails = ['я', 'и', 'е', 'ю', 'ей', 'ею']; }
  else if (/[йь]$/.test(w)) { stem = w.slice(0, -1); tails = [w.at(-1), 'я', 'ю', 'ем', 'е']; }
  else if (/[бвгджзклмнпрстфхцчшщ]$/.test(w)) tails = ['', 'а', 'у', 'ом', 'е'];
  return unique([w, ...tails.map(t => stem + t)]);
}

// Текстовые inline-узлы склеиваются без пробела: «Рай<strong>ден</strong>».
// Между блоками — перенос, подписи картинок учитываются, оглавление не дублируем.
export function articleText(doc) {
  function read(n) {
    if (typeof n === 'string') return n;
    if (Array.isArray(n)) return n.map(read).join('');
    if (!n || typeof n !== 'object' || n.t === 'toc' || n.t === 'embed') return '';
    if (n.t === 'br' || n.t === 'hr') return '\n';
    if (n.t === 'figure') return read(n.cap) + '\n';
    const text = read(n.c);
    return /^(p|h[1-6]|blockquote|pre|li|ul|ol|section)$/.test(n.t) ? text + '\n' : text;
  }
  return read(doc?.c).trim();
}

export function collectRecords({world = [], characters = [], articlesIndex = {}, articleTexts = {}, news = {}} = {}) {
  const records = [];
  const truth = v => v === true || /^(true|1)$/i.test(String(v));
  function add(source, kind, title, text = '', extra = {}) {
    const brief = news.briefs?.[source.id] || {};
    const aliases = unique([title, source.shortTitle, ...list(source.aliases), ...list(news.aliases?.[source.id])]);
    records.push({id: source.id, kind, title: title || '', aliases,
      summary: brief.summary || source.summary || source.description || '', text,
      image: source.image || '', places: [...list(source.places)], people: [...list(source.people)],
      updated: brief.updated || source.updated || '', ...extra});
  }
  for (const p of world) {
    const kind = truth(p.beacon) || p.code ? 'story' : 'place';
    const brief = news.briefs?.[p.id] || {};
    const text = [p.description, p.recruit, ...list(brief.known), ...list(brief.dangers),
      ...list(brief.playing).map(x => [x.place, x.text].filter(Boolean).join(': '))].filter(Boolean).join('\n');
    add(p, kind, p.title, text, p.parent ? {story: p.parent} : {});
  }
  for (const p of characters) {
    const title = p.name || p.title || '';
    const noInitials = title.replace(/^(?:\p{L}\.\s*)+/u, '');
    add(p, 'character', title, [p.race, p.role, p.description].filter(Boolean).join('\n'),
      p.parent ? {story: p.parent} : {});
    records.at(-1).aliases = unique([...records.at(-1).aliases, noInitials, noInitials.split(/\s+/)[0]]);
  }
  // Анкета персонажа (sheetUrl) — часть его записи, а не отдельная запись с тем
  // же именем: иначе псевдонимы конфликтуют и автоссылки гаснут как раз у тех,
  // у кого есть анкета (Claude, 01.11). Вторая копия чужой анкеты (у Персео
  // их две) ищется по названию, но по тексту не ссылается.
  const bareUrl = u => String(u ?? '').split('#')[0].replace(/\/+$/, '');
  const sheetOwner = new Map(characters.filter(p => p.sheetUrl).map(p => [bareUrl(p.sheetUrl), p.id]));
  const taken = new Set(records.flatMap(r => r.aliases.map(normalize)));
  const entries = articlesIndex.articles || articlesIndex;
  for (const [url, entry] of Object.entries(entries)) {
    if (!entry?.file) continue;
    const id = entry.file.replace(/^articles\//, '').replace(/\.json$/, '');
    const owner = records.find(r => r.kind === 'character' && r.id === sheetOwner.get(bareUrl(url)));
    if (owner) {
      owner.sheet = id;
      owner.text = [owner.text, articleTexts[id]].filter(Boolean).join('\n');
      continue;
    }
    add({...entry, id}, 'article', entry.title, articleTexts[id] || '');
    const rec = records.at(-1);
    if (rec.aliases.some(a => taken.has(normalize(a)))) rec.noLink = true;
  }
  for (const p of list(news.items)) {
    add(p, 'news', p.title, [p.text, p.happened, p.why, p.now].filter(Boolean).join('\n'),
      p.story ? {story: p.story} : {});
  }
  // Системы не входят в аргументы этого API: вызывающий может добавить записи
  // kind: 'system' из manifest/lore самостоятельно до построения таблиц.
  return records;
}

// Возвращает {first: Map<форма первого слова, кандидаты[]>, conflicts}.
// conflicts: [{alias, ids[]}]. Коллизии склонённых форм тоже запрещены.
export function buildAliases(records) {
  const entries = [], owners = new Map(), first = new Map();
  for (const r of records) {
    if (r.noLink) continue;  // ищется, но по тексту не ссылается (см. collectRecords)
    const female = r.kind === 'character' && FEMALE.has(words(r.title)[0]?.key);
    for (const alias of unique([r.title, r.shortTitle, ...list(r.aliases)])) {
      const key = normalize(alias).trim();
      if (!key || STOP.has(key)) continue;
      const tokens = words(alias);
      if (!tokens.length) continue;
      const parts = tokens.map((t, i) => new Set(forms(t.key, female && i > 0 && /[бвгджзклмнпрстфхцчшщ]$/.test(t.key))));
      const entry = {id: r.id, alias, key, parts};
      if (entries.some(e => e.id === r.id && e.key === key)) continue;
      entries.push(entry);
      if (!owners.has(key)) owners.set(key, new Set());
      owners.get(key).add(r.id);
    }
  }
  const conflicts = [...owners].filter(([, ids]) => ids.size > 1)
    .map(([alias, ids]) => ({alias, ids: [...ids]}));
  for (const e of entries) {
    // Оставляем конфликтующие варианты в таблице как блокирующие кандидаты:
    // нельзя подменять неоднозначное полное имя его коротким префиксом.
    for (const f of e.parts[0]) {
      if (!first.has(f)) first.set(f, []);
      first.get(f).push(e);
    }
  }
  // Для отладки показываем и пересечения окончаний при одинаковой длине фразы.
  for (let i = 0; i < entries.length; i++) for (let j = i + 1; j < entries.length; j++) {
    const a = entries[i], b = entries[j];
    if (a.id === b.id || a.parts.length !== b.parts.length || a.key === b.key) continue;
    if (a.parts.every((p, k) => [...p].some(x => b.parts[k].has(x)))) {
      conflicts.push({alias: `${a.alias} / ${b.alias}`, ids: [a.id, b.id]});
    }
  }
  return {first, conflicts};
}

export function linkText(text, table, selfId) {
  text = String(text ?? '');
  const tokens = words(text), chunks = [], seen = new Set();
  let offset = 0;
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    if (!/^\p{Lu}/u.test(token.text)) continue;
    const matches = (table.first.get(token.key) || []).filter(e => e.parts.every((p, k) => {
      const t = tokens[i + k];
      return t && p.has(t.key) && (!k || /^[\s.]+$/u.test(text.slice(tokens[i + k - 1].end, t.start)));
    }));
    if (!matches.length) continue;
    const length = Math.max(...matches.map(e => e.parts.length));
    const ids = unique(matches.filter(e => e.parts.length === length).map(e => e.id));
    const end = tokens[i + length - 1].end;
    i += length - 1;
    if (ids.length !== 1 || ids[0] === selfId || seen.has(ids[0])) continue;
    if (token.start > offset) chunks.push({text: text.slice(offset, token.start)});
    chunks.push({text: text.slice(token.start, end), id: ids[0]});
    seen.add(ids[0]);
    offset = end;
  }
  if (offset < text.length || !chunks.length) chunks.push({text: text.slice(offset)});
  return chunks;
}

// По договору обратные ссылки — только между разными видами записей.
// Учитываем и явные метки, даже когда имя в тексте не встречается.
export function mentions(records, table) {
  const byId = new Map(records.map(r => [r.id, r])), result = Object.fromEntries(records.map(r => [r.id, []]));
  for (const r of records) {
    const ids = unique([r.story, ...list(r.places), ...list(r.people),
      ...linkText([r.summary, r.text].filter(Boolean).join('\n'), table, r.id).map(c => c.id)]);
    for (const id of ids) if (id !== r.id && byId.has(id) && byId.get(id).kind !== r.kind) result[id].push(r.id);
  }
  return result;
}

// Поиск: ограниченное снятие окончания + префикс, а не полнотекстовая
// лемматизация. Минимум 3 буквы основы уменьшает совпадения служебных слов.
function stem(w) {
  if (INDECLINABLE.has(w)) return w;
  const s = w.replace(/(иями|ами|ями|ого|ому|ыми|ими|ией|иям|иях|ий|ый|ая|яя|ую|юю|ой|ей|ом|ем|ам|ям|ах|ях|а|я|у|ю|е|ы|и|ь|й)$/u, '');
  return s.length >= 3 ? s : w;
}

// Явный вызов при первом поиске. Возвращает {records, vocabulary, postings}.
// postings хранит максимальный вес поля для каждого слова и записи.
export function buildSearchIndex(records) {
  const postings = new Map();
  records.forEach((r, i) => {
    for (const [where, value, weight] of [['title', r.title, 100],
      ['alias', list(r.aliases).join(' '), 30], ['text', [r.summary, r.text].filter(Boolean).join('\n'), 5]]) {
      for (const t of words(value)) for (const key of unique([t.key, stem(t.key)])) {
        if (!postings.has(key)) postings.set(key, new Map());
        const row = postings.get(key);
        if (!row.has(i) || row.get(i).weight < weight) row.set(i, {where, weight});
      }
    }
  });
  return {records: records.map(({id, kind, title}) => ({id, kind, title})),
    vocabulary: [...postings.keys()].sort(), postings};
}

export function search(index, query, limit = 20) {
  const terms = unique(words(query).map(t => stem(t.key)));
  if (!terms.length || !(limit > 0)) return [];
  let found;
  for (const term of terms) {
    const hits = new Map();
    let lo = 0, hi = index.vocabulary.length;
    while (lo < hi) { const mid = (lo + hi) >>> 1; if (index.vocabulary[mid] < term) lo = mid + 1; else hi = mid; }
    for (let j = lo; j < index.vocabulary.length && index.vocabulary[j].startsWith(term); j++) {
      for (const [i, h] of index.postings.get(index.vocabulary[j])) {
        if (!hits.has(i) || hits.get(i).weight < h.weight) hits.set(i, h);
      }
    }
    if (!found) found = new Map([...hits].map(([i, h]) => [i, {score: h.weight, where: h.where, weight: h.weight}]));
    else for (const [i, h] of found) {
      if (!hits.has(i)) found.delete(i);
      else {
        const next = hits.get(i);
        h.score += next.weight;
        if (next.weight > h.weight) { h.where = next.where; h.weight = next.weight; }
      }
    }
    if (!found.size) return [];
  }
  return [...found].map(([i, h]) => ({...index.records[i], where: h.where, score: h.score}))
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ru') || a.id.localeCompare(b.id))
    .slice(0, Math.floor(limit));
}
