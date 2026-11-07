import {C, el, BASE, firstImage, viewKind, newsFor, newsItem, plural, FILTER_SVG, storyFilterButton, filterName} from './common.js?v=40';

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
  // v=258 (владелец): фильтр — тот же список, что в шторке (storyOptions), и внутри полосы «Ещё N событий ранее» справа.
  const icon = el('span', {class: 'p-mini-icon', 'aria-hidden': 'true'});
  icon.innerHTML = FILTER_SVG;
  const filter = storyFilterButton(`news-filter${state.chip === 'all' ? '' : ' selected'}`, state.chip, v => {
    state.setFilter(v, state.kind);
    document.querySelector('#planshet .news-filter')?.focus({preventScroll: true});
  }, [icon, filterName(state.chip, 'Все', 'news-filter-name')], 'Фильтр событий по сюжету');
  return el('section', {class: 'now'},
    el('div', {class: 'now-head'}, el('h2', {}, 'Что сейчас происходит'), el('span', {}, 'События мира')),
    ns.length ? el('ol', {class: 'news'}, ns.slice(0, n).map(x => newsItem(x, open))) : el('p', {class: 'empty'}, 'Новостей по этому сюжету пока нет.'),
    el('div', {class: `news-controls${ns.length > n ? '' : ' solo'}`},
      ns.length > n ? el('details', {class: 'drop older', 'data-state-key': 'news-older'}, el('summary', {}, el('span', {class: 'more'}, `Ещё ${ns.length - n} ${plural(ns.length - n, 'событие', 'события', 'событий')} ранее`), el('span', {class: 'less'}, 'Свернуть')),
        el('ol', {class: 'news'}, ns.slice(n).map(x => newsItem(x, open)))) : null, filter));
}
// Все районы схемы (v=250: раньше — только те, где есть здания; 4 района пропадали), в порядке ship/records.json.
export function zones() {
  const groups = new Map(C.records.filter(r => r.kind === 'zone').map(z => [z.id, []]));
  for (const b of C.records.filter(r => r.kind === 'building')) {
    if (!b.parentId) continue;
    if (!groups.has(b.parentId)) groups.set(b.parentId, []);
    groups.get(b.parentId).push(b);
  }
  return [...groups].map(([id,bs]) => {
    const r=C.byId.get(id);
    return {id,name:r?.title||id,bs,art:bs.find(b=>b.image)?.image || r?.image};
  });
}
