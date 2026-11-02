import { articleText, linkText, search } from '../js/linker.js?v=243';
import { C, load, viewKind, pointModules, alsoIn } from './model.js?v=24';
export { C, load, viewKind, pointModules, alsoIn };
export const BASE = new URL('../', import.meta.url).href;
export const truth = v => v === true || /^(true|1)$/i.test(String(v ?? ''));
export const KIND = {world: 'Маркер', system: 'Система', zone: 'Район', story: 'Сюжет', place: 'Маркер', building: 'Здание', character: 'Персонаж', article: 'Статья', news: 'Новость'};
export const KIND_MANY = {world: 'Маркеры', system: 'Системы', zone: 'Районы', story: 'Сюжеты', place: 'Маркеры', building: 'Здания', character: 'Персонажи', article: 'Статьи', news: 'Новости'};
const SHORT = {'kreyser-gorizont': 'Горизонт'};
const ORDER = ['story-1', 'kreyser-gorizont', 'story-2'];
export const ARCHIVE = 'arch-characters';
export const EPOCHS = 'lore/epochs';
export function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'style') n.style.cssText = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) n.append(k);
  return n;
}
// Без картинки — первая буква названия.
export const img = (src, title = '') => src ? el('img', {src: new URL(src, BASE).href, alt: '', loading: 'lazy'})
  : el('div', {class: 'ph', 'aria-hidden': 'true'}, String(title).replace(/^[^\p{L}]+/u, '').charAt(0));
export const shortOf = id => SHORT[id] || C.raw[id]?.shortTitle || C.byId.get(id)?.title || id;
export const plural = (n, a, b, c) => n % 10 === 1 && n % 100 !== 11 ? a : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? b : c;
const list = s => { try { return Array.isArray(s) ? s : JSON.parse(String(s || '[]').replace(/'/g, '"')); } catch { return []; } };
export const firstImage = p => list(p?.images)[0] || '';

/* ---------- текст со ссылками ---------- */
// onOpen(id) — что делать по ссылке; seen — только первое упоминание на карточку.
export function linked(text, selfId, seen, onOpen) {
  const frag = document.createDocumentFragment();
  for (const c of linkText(text, C.table, selfId)) {
    if (c.id && !seen?.has(c.id) && C.byId.has(c.id)) {
      seen?.add(c.id);
      frag.append(el('a', {class: 'xref', href: '#', onclick: e => { e.preventDefault(); onOpen(c.id); }}, c.text));
    } else frag.append(c.text);
  }
  return frag;
}
export const para = (text, ctx, lbl) => el('p', {}, lbl ? el('span', {class: 'lbl'}, lbl + '. ') : null, linked(text, ctx.self, ctx.seen, ctx.open));

/* ---------- блоки статей — как js/reader.js (белый список, якоря) ---------- */
const INLINE = {strong: 'strong', em: 'em', s: 's', u: 'u', code: 'code'};
const BLOCK = {p: 'p', h2: 'h2', h3: 'h3', h4: 'h4', blockquote: 'blockquote', pre: 'pre', li: 'li'};
function build(nodes, parent, ctx) {
  for (const n of Array.isArray(nodes) ? nodes : [nodes]) {
    if (typeof n === 'string') parent.append(ctx.seen ? linked(n, ctx.self, ctx.seen, ctx.open) : n);
    else if (n && typeof n === 'object') { const e = element(n, ctx); if (e) parent.append(e); }
  }
}
function element(n, ctx) {
  const t = n.t;
  let e;
  if (INLINE[t]) { e = document.createElement(INLINE[t]); build(n.c, e, ctx); }
  else if (t === 'br') return document.createElement('br');
  else if (t === 'a') {
    const h = typeof n.href === 'string' ? n.href : '';
    if (h.startsWith('#')) e = el('a', {href: h, 'data-anchor-link': h.slice(1), 'data-document':ctx.documentId || C.byId.get(ctx.self)?.sheet || ctx.self});
    else if (/^https?:\/\//i.test(h)) e = el('a', {href: h, target: '_blank', rel: 'noopener'});
    else e = document.createElement('span');
    build(n.c, e, {...ctx, seen: null});
  } else if (BLOCK[t]) {
    e = document.createElement(BLOCK[t]);
    if (n.align === 'center' || n.align === 'right') e.classList.add('is-' + n.align);
    build(n.c, e, ctx);
  } else if (t === 'ul' || t === 'ol') { e = document.createElement(t); build(n.c, e, ctx); }
  else if (t === 'hr') e = document.createElement('hr');
  else if (t === 'figure') {
    if (typeof n.src !== 'string') return null;
    const src = /^https?:\/\//i.test(n.src) ? n.src : BASE + n.src;
    e = el('figure', {}, el('img', {src, alt: '', loading: 'lazy', width: n.w || null, height: n.h || null}));
    if (Array.isArray(n.cap)) { const cap = document.createElement('figcaption'); build(n.cap, cap, ctx); e.append(cap); }
  } else if (t === 'section') {
    e = el('section', {class: 'mirror-box'});
    if (Number.isFinite(n.hue)) e.style.setProperty('--box-hue', String(Math.round(n.hue)));
    if (Number.isFinite(n.sat)) e.style.setProperty('--box-sat', Math.round(n.sat) + '%');
    build(n.c, e, ctx);
  } else if (t === 'toc') {
    e = el('nav', {class: 'mirror-toc'}, el('ul', {}, (n.items || []).map(it =>
      el('li', {class: 'lvl-' + Math.min(3, Math.max(1, it.l | 0))}, el('a', {href: '#' + it.a, 'data-anchor-link': it.a, 'data-document': ctx.documentId || C.byId.get(ctx.self)?.sheet || ctx.self}, String(it.x || ''))))));
  } else if (t === 'anchor') e = el('span', {class: 'anchor'});
  else return null;
  if (typeof n.id === 'string') e.dataset.anchor = n.id;
  return e;
}
export function renderBlocks(blocks, ctx) {
  const box = el('div', {class: 'mirror-article'});
  build(blocks, box, ctx);
  return box;
}
// Якоря внутри карточки: есть на экране — прокрутка; нет — missing(id).
export function wireAnchors(container, open) {
  container.addEventListener('click', e => {
    const a = e.target.closest('a[data-anchor-link]');
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.document;
    if (!id) return;
    open?.(id, a.dataset.anchorLink, {history: 'replace'});
  });
}

/* ---------- модули ---------- */
export const plain = b => articleText({c: [b]});
const headingOf = b => plain(b).split('\n').map(s => s.trim()).find(s => /\p{L}/u.test(s)) || '';
function locate(nodes, id) {
  if (!Array.isArray(nodes)) return null;
  for (let i = 0; i < nodes.length; i++) {
    const b = nodes[i];
    if (b && typeof b === 'object') {
      if (b.id === id) return {arr: nodes, idx: i};
      const deep = locate(b.c, id);
      if (deep) return deep;
    }
  }
  return null;
}
export function idsIn(nodes, out = new Set()) {
  for (const b of Array.isArray(nodes) ? nodes : [nodes]) if (b && typeof b === 'object') { if (b.id) out.add(b.id); idsIn(b.c, out); }
  return out;
}
// Модуль из привязки: диапазон соседних блоков from…to (без to — один блок).
function rangeBlocks(doc, from, to) {
  const loc = doc && locate(doc.c, from);
  if (!loc) return null;
  if (!to) return [loc.arr[loc.idx]];
  const end = loc.arr.findIndex((b, i) => i >= loc.idx && b?.id === to);
  return end < 0 ? null : loc.arr.slice(loc.idx, end + 1);
}
// Деление статьи: новый модуль на заголовке h2–h4 и на секции. Заголовок
// уходит в название модуля (не дублируется в тексте); у секции её первая
// строка-заголовок тоже. Крошечное «вступление» (*** и картинка) — к следующему.
export function articleModules(doc) {
  const mods = [];
  let cur = null;
  for (const b of doc?.c || []) {
    if (!b || b.t === 'toc') continue;
    const head = typeof b === 'object' && /^h[2-4]$/.test(b.t);
    const sec = typeof b === 'object' && b.t === 'section';
    if (head || sec || !cur) {
      if (cur) mods.push(cur);
      cur = {title: head || sec ? headingOf(b).replace(/[:.]\s*$/, '') : '', blocks: [], anchor: b.id || ''};
      // Заголовок уходит в название модуля, но якорь остаётся — на него ведёт оглавление.
      if (head) { if (b.id) cur.blocks.push({t: 'anchor', id: b.id}); continue; }
      if (sec) {
        const first = b.c?.[0];
        const dup = first && headingOf(first) && headingOf(first) === headingOf(b);
        // Строку-заголовок убираем, но её якорь оставляем — на неё ведут ссылки «Поисковика по типу».
        cur.blocks.push(dup ? {...b, c: [{t: 'anchor', id: first.id}, ...b.c.slice(1)]} : b);
        continue;
      }
    }
    cur.blocks.push(b);
  }
  if (cur) mods.push(cur);
  for (let i = 0; i < mods.length - 1; i++) {
    if (!mods[i].title && articleText({c: mods[i].blocks}).replace(/[*\s]/g, '').length < 10) {
      mods[i + 1].blocks.unshift(...mods[i].blocks);
      mods.splice(i--, 1);
    }
  }
  return mods.map(m => ({...m, title: m.title || 'Вступление', ids: idsIn(m.blocks)}));
}
export const stories = () => C.records.filter(r => viewKind(r) === 'story').sort((a, b) => ((ORDER.indexOf(a.id) + 1) || 99) - ((ORDER.indexOf(b.id) + 1) || 99));
export function storyState(id) {
  const p = C.raw[id] || {};
  if (truth(p.completed)) return ['завершён', 'done'];
  if (p.recruit) return ['набор открыт', 'recruit'];
  return ['идёт', ''];
}
export function pickedStories(chip) {
  const all = stories();
  if (chip === 'all') return all.filter(s => !truth(C.raw[s.id]?.completed));
  if (chip === 'archive') return all.filter(s => truth(C.raw[s.id]?.completed));
  return all.filter(s => s.id === chip);
}
export const chipList = () => [['all', 'Всё'], ...stories().filter(s => !truth(C.raw[s.id]?.completed)).map(s => [s.id, shortOf(s.id)]), ['archive', 'Архив']];
export function newsFor(chip) {
  const items = C.news.items || [];
  if (chip === 'all') return items;
  if (chip === 'archive') return items.filter(n => truth(C.raw[n.story]?.completed));
  return items.filter(n => n.story === chip);
}
export const newsMeta = n => n.voice === 'said' ? `Говорят в мире: ${(n.source || 'слух').toLowerCase()}` : `${shortOf(n.story)}, посты: ${n.posts}`;
export const lede = n => n.happened.split(/(?<=[.!?])\s/)[0];
// Тело новости (что было / зачем / что теперь / пометки / лица).
export function newsBody(n, open) {
  const ctx = {self: n.id, seen: new Set(), open};
  return [
    para(n.happened, ctx),
    n.why ? para(n.why, ctx, 'Зачем') : null,
    n.now ? para(n.now, ctx, n.nowLabel || 'Что теперь') : null,
    n.place ? el('p', {class: 'news-where'}, `Где: ${n.place}`) : null,
    n.world ? el('p', {class: 'news-where'}, `Когда в мире: ${n.world}`) : null,
    n.status === 'claim' ? el('p', {class: 'status-note'}, 'Это слова персонажей, а не установленный факт.') : null,
    n.status === 'last-seen' ? el('p', {class: 'status-note'}, 'Так было в последний раз, когда это место появлялось в постах. Сейчас может быть иначе.') : null,
    faces((n.people || []).map(id => C.byId.get(id)).filter(Boolean), open, 'cast'),
  ];
}
// Новость, раскрывающаяся на месте.
export function newsItem(n, open, expanded = false) {
  const body = el('div', {class: 'news-body', hidden: !expanded}, newsBody(n, open));
  const head = el('button', {class: 'news-head', 'data-state-key': 'news:' + n.id, 'aria-expanded': String(expanded), onclick() {
    const o = head.getAttribute('aria-expanded') !== 'true';
    head.setAttribute('aria-expanded', String(o)); body.hidden = !o;
  }}, el('span', {class: 'news-title'}, n.title), el('span', {class: 'news-meta'}, newsMeta(n)), el('span', {class: 'news-lede'}, lede(n)));
  return el('li', {class: `news-item ${n.voice}`}, head, body);
}
export const newsOfBuilding = idOrTitle => {
 const b=C.byId.get(idOrTitle) || C.records.find(r=>viewKind(r)==='building' && r.title===idOrTitle);
 return b ? C.news.items.filter(n=>C.byId.get(n.id)?.context.placeIds.includes(b.id)) : [];
};

/* ---------- списки ---------- */
export const charsOf = id => C.records.filter(r => viewKind(r) === 'character' && C.raw[r.id]?.parent === id);
export const places = () => C.records.filter(r => viewKind(r) === 'place');
export const buildings = () => C.records.filter(r => viewKind(r) === 'building');
export const articles = () => C.records.filter(r => viewKind(r) === 'article');
export function face(r, open) {
  return el('button', {class: 'face', onclick: () => open(r.id)}, img(r.image, r.title), el('span', {}, r.title.split(/\s+/)[0]));
}
export const faces = (rs, open, cls = 'faces') => rs.length ? el('div', {class: cls}, rs.map(r => face(r, open))) : null;
export function row(r, sub, open) {
  return el('button', {class: 'row', onclick: () => open(r.id)}, img(r.image, r.title),
    el('span', {}, el('span', {class: 'row-title'}, r.title), sub ? el('span', {class: 'row-sub'}, sub) : null));
}
export const rows = (rs, sub, open) => el('div', {class: 'rows'}, rs.map(r => row(r, sub ? sub(r) : '', open)));
export function placeSub(r) {
  const p = C.raw[r.id] || {};
  const parent = p.parent && C.byId.get(p.parent)?.title;
  return parent ? `в ${parent}` : (p.description || '').split(/(?<=[.!?])\s/)[0].slice(0, 70);
}
// Здания по районам — выпадающие списки (как на фандом-вики).
export function buildingsByZone(open, openFirst = false) {
  const groups = new Map();
  for (const b of buildings()) { const z = b.zone || 'Без района'; if (!groups.has(z)) groups.set(z, []); groups.get(z).push(b); }
  return [...groups].map(([z, bs], i) => el('details', {class: 'drop', open: openFirst && i === 0},
    el('summary', {}, el('span', {}, z), el('span', {class: 'count'}, String(bs.length))), rows(bs, null, open)));
}

/* ---------- поиск: фильтры по виду, популярное выше ---------- */
const norm = s => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[«»"']/g, '').trim();
export function searchAll(q, kind = 'all', limit = 40) {
  const hits = search(C.searchIndex, q, 200).filter(h => C.byId.has(h.id))
    // Точное название — всегда первым; дальше популярное (чаще упоминается) выше.
    .map(h => ({...h, kind: viewKind(C.byId.get(h.id)), score: h.score + Math.min(40, 3 * (C.pop[h.id] || 0))
      + (norm(C.byId.get(h.id).title) === norm(q) ? 1000 : 0)}))
    .sort((a, b) => b.score - a.score);
  const counts = {};
  for (const h of hits) counts[h.kind] = (counts[h.kind] || 0) + 1;
  return {counts, hits: (kind === 'all' ? hits : hits.filter(h => h.kind === kind)).slice(0, limit)};
}
export const WHERE = {title: 'в названии', alias: 'по имени', text: 'в тексте'};
export const mentionsOf = id => (C.refs[id] || []).map(x => C.byId.get(x)).filter(Boolean)
  .sort((a, b) => (C.pop[b.id] || 0) - (C.pop[a.id] || 0));

/* ---------- шрифт ---------- */
// Tektur своим файлом (fonts/, OFL), без Google Fonts (владелец 02.11.2026): заголовки планшета и надпись
// «Феном» в панели «Нод». Ставится один раз, при первом показе планшета.
export function fontLink() {
  if (document.getElementById('tekturFace')) return;
  const style = el('style', {id: 'tekturFace'});
  style.textContent = ['cyrillic', 'latin'].map((part, i) => `@font-face{font-family:'Tektur';font-style:normal;font-weight:400 900;font-display:swap;src:url(${new URL('fonts/tektur-' + part + '.woff2', BASE).href}) format('woff2');unicode-range:${i ? 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD' : 'U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116'}}`).join('');
  document.head.append(style);
  return;
}


// Сама карта переходит из «Нод» на карту и летит к маркеру (window.__mapShowOnMap, js/map.js).
export const mapLink = r => r.mapTargets?.length ? el('a',{class:'onmap',href:BASE+'index.html?open='+encodeURIComponent(r.id),
  onclick(e){if(window.__mapShowOnMap){e.preventDefault();window.__mapShowOnMap(r.id);}}},'Показать на карте') : null;
export function cardSections(r,open) {
 const p=C.raw[r.id]||{}, b=C.news.briefs?.[r.id], ctx={self:r.id,seen:new Set(),open}, out=[];
 if(b) {out.push({title:'Коротко',body:para(b.summary,ctx)});
  out.push({title:'Где идёт игра сейчас',body:el('ul',{},(b.playing||[]).map(x=>el('li',{},el('strong',{},x.place),' — ',linked(x.text,r.id,ctx.seen,open))))});
  out.push({title:'Что известно',body:el('ol',{},(b.known||[]).map(t=>el('li',{},linked(t,r.id,ctx.seen,open))))});
  out.push({title:'Опасности',body:el('ol',{},(b.dangers||[]).map(t=>el('li',{},linked(t,r.id,ctx.seen,open))))});
 }else if(p.description)out.push({title:'Коротко',body:p.description.split(/\n+/).map(t=>para(t,ctx))});
 if(p.recruit&&!truth(p.completed))out.push({title:'Набор',body:para(p.recruit,ctx)});
 return out;
}
export function cardMeta(r) {
 const k=viewKind(r),p=C.raw[r.id]||{};
 if(k==='character')return [p.race,p.role?.toLowerCase()].filter(Boolean).join(', ');
 if(k==='story')return 'Сюжет, '+storyState(r.id)[0];
 if(k==='place')return [r.flags.alliance&&'Альянс',r.flags.location&&'Локация'].filter(Boolean).join(' · ')||'Маркер';
 return KIND[k]||'';
}
