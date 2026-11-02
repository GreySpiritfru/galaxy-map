import {C, viewKind, BASE, el, linked, renderBlocks, plain, pointModules, articleModules,
  truth, firstImage, newsFor, newsItem, newsOfBuilding, newsBody, storyState} from './common.js?v=2';
import {elTile, zoneLore, zonePart} from './start.js?v=2';
import {cardHead} from './shell.js?v=2';
import {parseSheet, sheetImages, sheetText, SHEET_TEMPLATE, ZW} from './sheet-parser.js?v=2';
import {viewImages} from '../js/viewer.js?v=219';

const LONG = 700;
const imageUrl = src => /^(https?:|data:|blob:)/i.test(src) ? src : BASE + src;
const context = (r, open, documentId = r.id) => ({self: r.id, seen: new Set(), open, documentId});
const section = (title, ...body) => el('section', {class: 'pc-sec'}, el('h2', {}, title), body);
const hasFigure = b => b && typeof b === 'object' && ['figure', 'img'].includes(b.t);
const fieldText = entries => (entries || []).flatMap(f => f.blocks.filter(b => !hasFigure(b)).map(sheetText)).join(' ').replace(ZW, '').replace(/\s+/g, ' ').trim();
const sentences = (s, n = 2) => String(s || '').match(/[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g)?.slice(0, n).join('').trim() || s;
function prose(text, ctx) {
  return String(text || '').split(/\n+/).filter(t => t.trim()).map(t => el('p', {}, linked(t, ctx.self, ctx.seen, ctx.open)));
}
function expandable(content, text, key) {
  if (text.length <= LONG) return content;
  const box = el('div', {class: 'pc-long', 'data-state-key': key}, content);
  const more = el('button', {class: 'pc-more', 'data-expand-key': key, 'aria-expanded': 'false', onclick() {
    const on = box.classList.toggle('open');
    more.textContent = on ? 'Свернуть' : 'Читать полностью';
    more.setAttribute('aria-expanded', String(on));
  }}, 'Читать полностью');
  return [box, more];
}
function gallery(srcs) {
  return srcs.length > 1 ? el('section', {class: 'pc-arts'}, el('h2', {}, 'Арты'),
    el('div', {class: 'pc-gallery'}, srcs.slice(1).map((src, i) => el('button', {
      'aria-label': `Арт ${i + 2} из ${srcs.length}, открыть`, onclick: () => viewImages(srcs, i + 1)},
    el('img', {src, alt: '', loading: 'lazy'}))))) : null;
}
function sourceLink(p) {
  return p.sheetUrl ? el('p', {class: 'source'}, 'Анкета: ',
    el('a', {href: p.sheetUrl, target: '_blank', rel: 'noopener'}, 'оригинал')) : null;
}

function characterCard(r, open) {
  const doc = r.sheet && C.docs[r.sheet], p = C.raw[r.id] || {};
  const ctx = context(r, open, r.sheet || r.id);
  if (!doc) return [cardHead(r), el('p', {class: 'empty', 'data-sheet-fallback': 'missing'}, 'Анкеты на карте пока нет.'), sourceLink(p)];
  const parsed = parseSheet(doc), {fields} = parsed;
  const srcs = [...new Set([...sheetImages(doc), ...(sheetImages(doc).length ? [] : [r.image])].filter(Boolean))].map(imageUrl);
  const full = () => el('details', {class: 'sheet-full drop', 'data-state-key': 'sheet-full', 'data-document': r.sheet},
    el('summary', {}, 'Анкета целиком'), renderBlocks(doc.c, {...ctx, seen: new Set()}));
  // A failed parse never makes the source disappear behind an empty template.
  if (parsed.fallback) return [cardHead(r), el('div', {class: 'sheet-original', 'data-sheet-fallback': 'full', 'data-document': r.sheet}, renderBlocks(doc.c, ctx)), full(), sourceLink(p)];
  const names = (fieldText(fields.name) || r.title).split(/\s*[/|]\s*|,\s+(?=[«"А-ЯЁ])/).filter(Boolean);
  const alias = names.filter(n => n !== r.title).join(', ');
  const fact = (dt, value) => value ? [el('dt', {}, dt), el('dd', {class: value.length > 70 ? 'clamp' : '', onclick(e) { e.currentTarget.classList.remove('clamp'); }}, value)] : null;
  const parent = C.byId.get(r.parentId || p.parent);
  const top = el('div', {class: 'pc-top', 'data-sheet-template': parsed.templateId, 'data-sheet-hash': parsed.sourceHash},
    el('div', {}, el('h1', {class: 'pc-name'}, r.title), alias ? el('div', {class: 'pc-alias'}, alias) : null,
      el('dl', {class: 'pc-facts'}, fact('Раса', fieldText(fields.race) || p.race), fact('Возраст', fieldText(fields.age)), fact('Роль', p.role),
        parent ? fact(viewKind(parent) === 'story' ? 'Сюжет' : 'Где', parent.title) : null)),
    srcs[0] ? el('button', {class: 'pc-art', style: `background-image:url("${srcs[0]}")`, 'aria-label': `Арт: ${r.title}, открыть`, onclick: () => viewImages(srcs)})
      : el('div', {class: 'pc-art ph', 'aria-hidden': 'true'}, r.title.charAt(0)));
  const renderField = f => {
    const text = fieldText([f]);
    const blocks = f.blocks.filter(b => !hasFigure(b));
    if (!text && !blocks.some(b => b?.t && !['p', 'anchor'].includes(b.t))) return null;
    // Template names are authoritative; the exact author label remains in the parse index and full source.
    const title = f.templateTitle, content = renderBlocks(blocks, ctx);
    if (f.key === 'voice') for (const a of content.querySelectorAll('a[href]')) {
      if (/^https?:/i.test(a.getAttribute('href'))) { a.classList.add('pc-voice'); if (/^https?:/i.test(a.textContent.trim())) a.textContent = 'Послушать →'; }
    }
    return el('section', {class: 'pc-sec', 'data-sheet-field': f.key, 'data-sheet-occurrence': f.occurrence},
      el('h2', {}, title), expandable(content, text, `sheet-${f.key}-${f.occurrence}`));
  };
  const body = SHEET_TEMPLATE.fields.filter(f => !['name', 'race', 'age'].includes(f.key)).flatMap(f => (fields[f.key] || []).map(renderField));
  // Repeated identity fields, author preamble, unknown labels and captions are retained visibly.
  const rest = [
    ...parsed.preamble,
    ...parsed.rest.flatMap(s => s.blocks),
    ...parsed.segments.filter(s => s.key).flatMap(s => s.blocks.filter(b => hasFigure(b) && b.cap?.length).map(b => ({t: 'blockquote', c: b.cap}))),
    ...['name', 'race', 'age'].flatMap(key => (fields[key] || []).flatMap((f, i) => {
      // The first values appear as facts, but rich markup is also available here.
      return i > 0 || f.blocks.some(b => hasFigure(b) && b.cap?.length) ? [{t: 'h3', c: [f.templateTitle]}, ...f.blocks] : [];
    })),
  ];
  const restHasContent = rest.some(b => sheetText(b).trim() || (hasFigure(b) && b.cap?.length));
  const restNode = restHasContent ? el('details', {class: 'sheet-rest drop', 'data-state-key': 'sheet-rest'},
    el('summary', {}, 'Остальное из анкеты'), renderBlocks(rest, ctx)) : null;
  return [top, body, restNode, gallery(srcs), full(), sourceLink(p)];
}

const JOIN = {form: 'https://t.me/Phenome_hub/23', contacts: 'https://t.me/Phenome_hub/17'};
function storyCard(r, open) {
  const p = C.raw[r.id] || {}, ctx = context(r, open), art = firstImage(p), [state] = storyState(r.id);
  const brief = C.news.briefs?.[r.id], ns = newsFor(r.id), where = C.byId.get(r.parentId);
  return [
    art ? el('button', {class: 'st-art', style: `background-image:url("${imageUrl(art)}")`, 'aria-label': `Арт: ${r.title}, открыть`, onclick: () => viewImages([imageUrl(art)])}) : null,
    el('h1', {class: 'bc-name'}, r.title), el('div', {class: 'bc-kind'}, `Сюжет, ${state}${where ? ', ' + where.title : ''}`),
    p.recruit && !truth(p.completed) ? el('section', {class: 'st-recruit'}, el('h2', {}, '📣 Набор открыт'), prose(p.recruit, ctx),
      el('div', {class: 'st-join'}, el('a', {href: JOIN.form, target: '_blank', rel: 'noopener'}, '📝 Шаблон анкеты'),
        el('a', {href: JOIN.contacts, target: '_blank', rel: 'noopener'}, '💬 Написать нам'))) : null,
    p.description ? section('Описание', el('div', {class: 'st-desc'}, prose(p.description, ctx))) : null,
    brief ? [brief.playing?.length ? section('Где идёт игра сейчас', el('ul', {}, brief.playing.map(x => el('li', {}, el('strong', {}, x.place), ' — ', linked(x.text, r.id, ctx.seen, open))))) : null,
      brief.known?.length ? section('Что известно', el('ol', {}, brief.known.map(t => el('li', {}, linked(t, r.id, ctx.seen, open))))) : null,
      brief.dangers?.length ? section('Опасности', el('ol', {}, brief.dangers.map(t => el('li', {}, linked(t, r.id, ctx.seen, open))))) : null] : null,
    ns.length ? section('Новости', el('ol', {class: 'news'}, ns.slice(0, 3).map(n => newsItem(n, open))),
      ns.length > 3 ? el('details', {class: 'drop older', 'data-state-key': 'story-older-news'}, el('summary', {}, `Ещё ${ns.length - 3}, раньше`), el('ol', {class: 'news'}, ns.slice(3).map(n => newsItem(n, open)))) : null) : null,
  ];
}

function buildingCard(r, open) {
  const ctx = context(r, open), srcs = (r.images?.length ? r.images : [r.image]).filter(Boolean).map(imageUrl);
  const zone = C.byId.get(r.parentId), name = zone?.title || r.zone, ns = newsOfBuilding(r.title);
  const text = r.text ? prose(r.text, ctx) : [el('p', {class: 'empty'}, 'Описания здания пока нет.')];
  return [
    srcs[0] ? el('button', {class: 'bc-art', style: `background-image:url("${srcs[0]}")`, 'aria-label': `Арт: ${r.title}, открыть`, onclick: () => viewImages(srcs)}) : null,
    el('h1', {class: 'bc-name'}, r.title), el('div', {class: 'bc-kind'}, 'Здание Фенома'),
    name ? el('section', {class: 'bc-zone'}, el('div', {class: 'bc-zone-head'}, el('b', {}, name), zonePart(name) ? el('span', {}, zonePart(name)) : null),
      zoneLore(name) ? el('p', {}, sentences(zoneLore(name))) : null) : null,
    el('section', {class: 'bc-text'}, expandable(text, r.text || '', 'building-text')),
    ns.length ? section('Что здесь произошло', el('ol', {class: 'news'}, ns.map(n => newsItem(n, open, true)))) : null,
    gallery(srcs), el('p', {class: 'source'}, 'Из лора схемы Фенома'),
  ];
}

const RACE = /^[☸☬☫❃〇]/;
const tocText = text => String(text).replace(/^[\s\-–—*]+/, '').replace(/[\s:.]+$/, '');
export function articleToc(r) {
  const doc = C.docs[r.id], own = (doc?.c || []).find(b => b?.t === 'toc');
  let items = own ? own.items.map(i => ({a: i.a, l: i.l | 0, x: tocText(i.x)}))
    : articleModules(doc).filter(m => m.title !== 'Вступление' && m.anchor).map(m => ({a: m.anchor, l: 1, x: tocText(m.title)}));
  items = items.filter(i => i.a && i.x && !RACE.test(i.x));
  if (items.length < 2) return null;
  const stack = [];
  for (const i of items) { while (stack.length && stack.at(-1) >= i.l) stack.pop(); i.d = Math.min(2, stack.length); stack.push(i.l); }
  return el('nav', {class: 'toc', 'aria-label': 'Содержание статьи'}, el('h2', {}, 'Содержание'),
    el('ol', {}, items.map(i => el('li', {class: `l${i.d}`},
      el('a', {href: '#' + i.a, 'data-anchor-link': i.a, 'data-document': r.id}, i.x)))));
}
function articleCard(r, open) {
  const doc = C.docs[r.id], ctx = context(r, open);
  if (!doc) return [cardHead(r), el('p', {class: 'broken'}, 'Статья не загрузилась. Проверьте связь и откройте планшет заново.')];
  return [cardHead(r), articleToc(r), articleModules(doc).map((m, i) => el('section', {
    class: 'module', id: `sx-${i}`, 'data-document': r.id}, el('h2', {}, m.title), renderBlocks(m.blocks, ctx)))];
}
function placeCard(r, open) {
  const p = C.raw[r.id] || {}, ctx = context(r, open), art = firstImage(p);
  return [art ? el('button', {class: 'bc-art', style: `background-image:url("${imageUrl(art)}")`, 'aria-label': `Арт: ${r.title}, открыть`, onclick: () => viewImages([imageUrl(art)])}) : null,
    cardHead(r),
    p.description ? el('p', {class: 'short'}, linked(p.description, r.id, ctx.seen, open)) : null,
    pointModules(r.id).map((m, i) => el('section', {class: 'module', id: `sx-${i}`, 'data-anchor': `module-${m.moduleId}`, 'data-document': m.art},
      el('h2', {}, m.title), m.blocks ? renderBlocks(m.blocks, {...ctx, documentId: m.art})
        : el('p', {class: 'broken'}, 'Этот кусок статьи не найден: статью могли изменить. Покажем, когда привязку поправят.'),
      el('p', {class: 'source'}, 'Из статьи ', el('a', {href: '#', onclick(e) { e.preventDefault(); open(m.art, m.from); }}, `«${C.byId.get(m.art)?.title || 'статья'}»`)))),
  ];
}
function systemCard(r, open) {
  const m = r.lore?.url?.match(/teletype\.in\/@([^/]+)\/([^#]+)#(.+)$/), art = m && `tt/${m[1]}/${m[2]}`;
  return [cardHead(r), el('p', {class: 'card-meta'}, 'Звёздная система на карте галактики'),
    art && C.byId.has(art) ? el('button', {class: 'sys-lore', onclick: () => open(art, m[3])}, `${r.lore.label} — в «${C.byId.get(art).title}» →`) : null];
}
export function renderCard(r, openRecord, anchor) {
  const kind = viewKind(r);
  if (kind === 'character') return characterCard(r, openRecord);
  if (kind === 'story') return storyCard(r, openRecord);
  if (kind === 'building') return buildingCard(r, openRecord);
  if (kind === 'article') return articleCard(r, openRecord);
  if (kind === 'place') return placeCard(r, openRecord);
  if (kind === 'system') return systemCard(r, openRecord);
  if (kind === 'zone') return [el('h1', {}, r.title), el('p', {class: 'card-meta'}, 'Район Фенома'),
    zoneLore(r.title) ? el('p', {class: 'zc-lore'}, zoneLore(r.title)) : null,
    el('div', {class: 'mini-open', style: 'margin-top:14px'}, C.records.filter(b => b.kind === 'building' && b.parentId === r.id).map(b => elTile(b, openRecord, '', 'mini')))];
  if (kind === 'news') {
    const n = C.news.items.find(n => n.id === r.id);
    return [cardHead(r), n ? section('Событие', newsBody(n, openRecord)) : el('p', {class: 'empty'}, 'Событие не найдено.')];
  }
  return [cardHead(r), el('p', {class: 'empty'}, 'Тело записи пока не подключено.')];
}
