import {C, el, BASE, firstImage, viewKind, newsFor, newsItem} from './common.js?v=9';

export function artOf(r) {
  if (!r) return '';
  if (viewKind(r) === 'story') return firstImage(C.raw[r.id]) || r.image;
  if (r.kind === 'article') return JSON.stringify(C.docs[r.id]?.c || []).match(/"src":"([^"]+)"/)?.[1] || '';
  return r.image || '';
}
export const bg = src => src ? `background-image:url("${new URL(src, BASE).href}")` : null;
export function elTile(r, open, sub = '', cls = '', onclick = () => open(r.id)) {
  const art = artOf(r);
  return el('button', {class: `el-tile ${cls}`, style: bg(art), onclick},
    art ? null : el('span', {class: 'el-letter', 'aria-hidden': 'true'}, r.title.replace(/^[^\p{L}]+/u, '').charAt(0)),
    el('span', {class: 'el-text'}, el('span', {class: 'el-title'}, r.title), sub ? el('span', {class: 'el-sub'}, sub) : null));
}
export function newsNow(state, open, n = 5) {
  const ns = newsFor(state.chip);
  return el('section', {class: 'now'},
    el('div', {class: 'now-head'}, el('h2', {}, 'Что сейчас происходит'), el('span', {}, 'События мира')),
    ns.length ? el('ol', {class: 'news'}, ns.slice(0, n).map(x => newsItem(x, open))) : el('p', {class: 'empty'}, 'Новостей по этому сюжету пока нет.'),
    ns.length > n ? el('details', {class: 'drop older', 'data-state-key': 'news-older'}, el('summary', {}, `Ещё ${ns.length - n}, раньше`),
      el('ol', {class: 'news'}, ns.slice(n).map(x => newsItem(x, open)))) : null);
}
export function zones() {
  const groups = new Map();
  for (const b of C.records.filter(r => r.kind === 'building')) {
    if (!b.parentId) continue;
    if (!groups.has(b.parentId)) groups.set(b.parentId, []);
    groups.get(b.parentId).push(b);
  }
  return [...groups].map(([id,bs]) => {
    const r=C.byId.get(id);
    return {id,name:r.title,bs,art:bs.find(b=>b.image)?.image || r.image};
  });
}
const PART = {city:'Феном-Сити, жилой цилиндр', front:'Передняя оболочка'};
export const zoneLore = name => {
  const zone = C.records.find(r => r.kind === 'zone' && r.title === name);
  return zone?.text || '';
};
export const zonePart = name => PART[C.records.find(r => r.kind === 'zone' && r.title === name)?.part] || '';
