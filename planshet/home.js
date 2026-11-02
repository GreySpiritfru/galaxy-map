import {C,el,BASE,viewKind,articles,buildings,places,stories,pickedStories,newsFor,storyState,mapLink,truth,articleModules,plain,EPOCHS,ARCHIVE,img,shortOf,chipList,plural,rows,placeSub,cardSections} from './common.js?v=15';
import {inChip} from './filters.js?v=15';
import {newsNow,elTile,zones,artOf,bg} from './start.js?v=15';
const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = 'cubic-bezier(.2,.7,.2,1)';
// Выдвинуть/задвинуть: высота коробки плавно идёт от старого содержимого к новому.
// Обрезка (overflow) — только на время анимации и снимается стилем по окончании: с
// постоянным overflow: clip Chrome после анимации не обновлял карту нажатий —
// плитки были видны, но не нажимались (владелец 01.11, «первый клик работает»).
let run = new WeakMap();
function slide(box, kids) {
  kids = [kids].flat(Infinity).filter(Boolean);
  run.get(box)?.forEach(a => a.cancel());
  const from = box.offsetHeight;
  const done = () => { box.style.overflow = ''; run.delete(box); };
  if (!kids.length) {
    if (still || !from) { box.replaceChildren(); return done(); }
    box.style.overflow = 'hidden';
    const a = box.animate([{height: from + 'px'}, {height: '0px'}], {duration: 220, easing: EASE});
    run.set(box, [a]);
    a.onfinish = () => { box.replaceChildren(); done(); };
    return;
  }
  box.replaceChildren(...kids);
  if (still) return done();
  box.style.overflow = 'hidden';
  const to = box.offsetHeight;
  const as = [box.animate([{height: from + 'px'}, {height: to + 'px'}], {duration: 300, easing: EASE}),
    box.firstElementChild?.animate([{opacity: 0, transform: 'translateY(-14px)'}, {opacity: 1, transform: 'none'}], {duration: 300, easing: EASE})].filter(Boolean);
  run.set(box, as);
  Promise.all(as.map(a => a.finished)).then(done, () => {});
}

const factions = () => places().filter(p => p.flags.alliance);
const otherPlaces = () => places().filter(p => !factions().includes(p));
const people = chip => C.records.filter(r => viewKind(r) === 'character' && inChip(r, chip));
const storiesOf = chip => chip === 'all' ? stories() : pickedStories(chip);
// «Эпохи Фенома» — история, а не справка: живут в «Событиях» (владелец, 01.11).
// «Архив анкет» не нужен: у каждого персонажа своя карточка (владелец 01.11) — в N5 его нет нигде.
const lore = () => articles().filter(r => r && r.id !== EPOCHS && r.id !== ARCHIVE);
// Главы «Эпох» (1…6): номер, название, первая фраза; новая эпоха — первой.
function epochs() {
  return articleModules(C.docs[EPOCHS]).filter(m => /^\d+\./.test(m.title)).map(m => {
    const [, n, rest] = m.title.match(/^(\d+)\.\s*(.*)$/);
    const now = /текущ/i.test(rest);
    const text = m.blocks.map(plain).join(' ').replace(/\s+/g, ' ').trim();
    return {n: +n, now, title: rest.replace(/\s*\(текущ[^)]*\)/i, ''), lede: text.split(/(?<=[.!?])\s/)[0], anchor: m.anchor};
  }).reverse();
}
function epochLine(open) {
  const es = epochs();
  if (!es.length) return null;
  return el('section', {class: 'epochs-sec'},
    el('div', {class: 'now-head'}, el('h2', {}, 'Эпохи Фенома'), el('span', {}, 'что было раньше')),
    el('ol', {class: 'epochs'}, es.map(e => el('li', {class: `epoch${e.now ? ' now' : ''}`},
      el('button', {onclick: () => open(EPOCHS, e.anchor)},
        el('span', {class: 'ep-n'}, e.now ? `${e.n}-я эпоха — сейчас, её события выше` : `${e.n}-я эпоха`),
        el('span', {class: 'ep-title'}, e.title), el('span', {class: 'ep-lede'}, e.lede))))));
}

// Режимы: число и арт плитки, содержимое под строкой.
function modeInfo(state) {
  const ns = newsFor(state.chip), sts = storiesOf(state.chip), ps = people(state.chip);
  const firstArt = rs => artOf(rs.find(r => artOf(r)));
  return {
    all: {count: '', art: artOf(C.byId.get('phenome'))},
    news: {count: ns.length, art: artOf(C.byId.get(ns[0]?.story)) || firstArt(sts)},
    article: {count: lore().length, art: artOf(C.byId.get('tt/greyspirit/toTVpow7sb1'))},
    building: {count: buildings().length, art: zones()[0]?.art, items: buildings()},
    story: {count: sts.length, art: firstArt(sts.slice(1)) || firstArt(sts), items: sts},
    place: {count: places().length + systems().length, art: firstArt(factions()), items: factions()},
    character: {count: ps.length, art: firstArt(ps), items: ps},
  };
}

const systems = () => C.records.filter(r => r.kind === 'system');
const own = id => C.byId.get(id)?.links || [];
// Союз — в обе стороны: и кого назвал персонаж, и кто назвал его.
const alliesOf = id => [...new Set([...own(id), ...C.records.filter(x => own(x.id).includes(id)).map(x => x.id)])].filter(x => x !== id && C.byId.has(x));
const kidsOf = id => C.records.filter(x => x.parentId === id && ['world','character'].includes(x.kind));
const chunk = (a, n) => a.reduce((o, x, i) => (i % n ? o[o.length - 1].push(x) : o.push([x]), o), []);
// Союзы внутри списка: связные группы; у тройки «центр» (больше союзов) — посередине.
function clusters(rs) {
  const ids = new Set(rs.map(r => r.id)), seen = new Set(), out = [];
  for (const r of rs) {
    if (seen.has(r.id)) continue;
    const comp = [], todo = [r.id];
    while (todo.length) { const id = todo.pop(); if (seen.has(id)) continue; seen.add(id); comp.push(id); todo.push(...alliesOf(id).filter(x => ids.has(x))); }
    const deg = id => alliesOf(id).filter(x => comp.includes(x)).length;
    const sorted = [...comp].sort((a, b) => deg(b) - deg(a));
    out.push((sorted.length === 3 ? [sorted[1], sorted[0], sorted[2]] : sorted).map(id => C.byId.get(id)));
  }
  return out;
}

/* ---------- проба 1: скобки в режимах ---------- */
function allyRow(group, open, home) {
  const linked = (a, b) => alliesOf(a.id).includes(b.id);
  const sub = r => C.raw[r.id]?.parent && C.raw[r.id].parent !== home ? `из «${shortOf(C.raw[r.id].parent)}»` : '';
  const row = el('div', {class: 'ally-row'});
  group.forEach((r, i) => { if (i) row.append(el('span', {class: `ally-gap${linked(group[i - 1], r) ? ' on' : ''}`})); row.append(elTile(r, open, sub(r), 'mini')); });
  if (group.length === 3 && linked(group[0], group[2])) row.classList.add('arc');
  return row;
}
// Семья: родитель (заголовок с ● или плитка) и строки детей под скобкой.
function fam(head, rows, cls = '') {
  return el('div', {class: 'fam'}, head, el('div', {class: 'fam-kids'}, rows.map(r => el('div', {class: `fam-row ${cls}`}, r))));
}
const famHead = (r, open, note) => el('button', {class: 'fam-head', onclick: () => open(r.id)}, el('b', {}, r.title), note ? el('small', {}, note) : null);
// Персонажи одной семьи: сначала союзы (строкой с пунктиром), потом остальные по три.
function peopleRows(rs, open, home) {
  const cs = clusters(rs), pairs = cs.filter(c => c.length > 1), solo = cs.filter(c => c.length === 1).flat();
  return [...pairs.map(c => allyRow(c, open, home)), ...chunk(solo, 3).map(c => el('div', {class: 'grid3'}, c.map(r => elTile(r, open, '', 'mini'))))];
}

function storyAcc(r, open) {
  const slot = el('div', {class: 'acc-slot'});
  const [st] = storyState(r.id);
  const head = elTile(r, open, st, 'wide', () => {
    const on = head.getAttribute('aria-expanded') !== 'true';
    // Открыт один сюжет: соседний задвигается.
    if (on) head.closest('.issue')?.querySelectorAll('.acc > [aria-expanded="true"]').forEach(h => h !== head && h.click());
    head.setAttribute('aria-expanded', String(on));
    const parts = cardSections(r, open).filter(s => s.title !== 'Новости сюжета').map(s => [el('h4', {}, s.title), s.body]);
    slide(slot, on ? el('div', {class: 'acc-body'}, parts,
      el('div', {class: 'acc-actions'}, el('button', {onclick: () => open(r.id)}, 'Открыть целиком'), mapLink(r))) : []);
  });
  head.setAttribute('aria-expanded', 'false');
  if (C.raw[r.id]?.recruit && !truth(C.raw[r.id]?.completed)) head.append(el('span', {class: 'tile-tag'}, 'Идёт набор'));
  const d = descOf(r);
  return el('div', {class: 'acc'}, head, d ? el('p', {class: 'acc-desc'}, d) : null, slot);
}

/* ---------- выпуск раздела ---------- */
// Подписи статей — ВРЕМЕННЫЕ, только чтобы увидеть выпуск (черновик, notes/annotations-draft.md);
// статьи сейчас не правим.
const G = 'tt/greyspirit/', GALAXY = G + 'toTVpow7sb1', RACES = G + 'y7G2E4B490h', MAGIC = G + 'SEOWfJxAewY',
  TECH = G + 'gf7sBYkW_di', DISTRICTS = G + '4tRzyNaVfEQ';
const annotations = () => C.presentation?.annotations || {};
// Описание у части маркеров начинается со строчной («огромная древняя империя…») — первая буква заглавной.
const sentences = (t, n = 2) => String(t || '').replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s/).slice(0, n).join(' ')
  .replace(/^\p{Ll}/u, c => c.toUpperCase());
// Короткое описание записи — только из того, что уже есть в данных.
function descOf(r) {
  if (annotations()[r.id]) return annotations()[r.id];
  if (viewKind(r) === 'story') return sentences(C.news.briefs?.[r.id]?.summary || C.raw[r.id]?.description, 2);
  if (viewKind(r) === 'place') return sentences(C.raw[r.id]?.description, 2);
  if (viewKind(r) === 'building') return sentences(r.text, 1);
  return '';
}
const head = (title, note) => el('div', {class: 'now-head issue-head'}, el('h2', {}, title), note ? el('span', {}, note) : null);
function entry(r, open, meta = '') {
  const art = artOf(r) || r.image, d = descOf(r);
  return el('button', {class: 'entry', onclick: () => open(r.id)},
    el('span', {class: 'entry-pic', style: bg(art), 'aria-hidden': 'true'}, art ? null : r.title.replace(/^[^\p{L}]+/u, '').charAt(0)),
    el('span', {class: 'entry-text'}, el('span', {class: 'entry-title'}, r.title),
      meta ? el('span', {class: 'entry-meta'}, meta) : null, d ? el('span', {class: 'entry-desc'}, d) : null));
}
// Статья в библиотеке — выпадающий список её разделов (модулей); раздел открывает статью сразу на нём.
function libArticle(r, open) {
  const mods = articleModules(C.docs[r.id]).filter(m => m.title && m.title !== 'Вступление');
  return el('details', {'data-state-key':'library:'+r.id}, el('summary', {}, el('b', {}, r.title), el('span', {}, sentences(annotations()[r.id], 1))),
    el('div', {class: 'lib-mods'}, el('button', {class: 'lib-whole', onclick: () => open(r.id)}, 'Открыть целиком'),
      mods.map(m => el('button', {onclick: () => open(r.id, m.anchor || null)}, m.title))));
}
function library(ids, open, title = 'Библиотека раздела', note = 'первоисточники', finished = []) {
  const rs = ids.map(id => C.byId.get(id)).filter(Boolean);
  if (!rs.length && !finished.length) return null;
  return el('section', {class: 'library'}, head(title, note), el('div', {class: 'lib-list'}, rs.map(r => libArticle(r, open)),
    finished.length ? [el('div', {class: 'lib-sub'}, 'Завершённые сюжеты'),
      finished.map(r => el('button', {onclick: () => open(r.id)}, el('b', {}, r.title), el('span', {}, sentences(descOf(r), 1))))] : null));
}
const sectionsMeta = r => {
  const n = articleModules(C.docs[r.id]).length;
  return n ? `${n} ${plural(n, 'раздел', 'раздела', 'разделов')}` : '';
};
const done = r => truth(C.raw[r.id]?.completed);

function issue(kind, state, open, opts = {}) {
  const out = [];
  const chipName = chipList().find(c => c[0] === state.chip)?.[1];
  if (state.chip !== 'all' && ['article', 'place', 'building'].includes(kind))
    out.push(el('p', {class: 'f-note'}, `Сюжет «${chipName}» здесь не действует — показано всё. `,
      el('button', {onclick: () => state.setFilter('all', kind)}, 'Сбросить')));
  if (kind === 'news') {
    // Все события сразу (без «Ещё»), под ними — эпохи.
    out.push(newsNow(state, open, Infinity), epochLine(open));
  } else if (kind === 'article') {
    out.push(head('Статьи и лор'), el('div', {class: 'entries'}, lore().map(r => entry(r, open, sectionsMeta(r)))));
  } else if (kind === 'story') {
    const sts = storiesOf(state.chip), cur = sts.filter(r => !done(r)), fin = sts.filter(done);
    // Набор — первым, но в своей семье: скобка «Феном → Горизонт, Переворот» сохраняется (владелец 01.11).
    const rest = [...cur].sort((a, b) => !!C.raw[b.id]?.recruit - !!C.raw[a.id]?.recruit);
    // Сюжеты с родителем-точкой или системой — под её скобкой (Феном → Горизонт, Переворот; G-UX71 → Гигаструктура).
    const families = (list, note) => {
      const byParent = new Map();
      for (const r of list) { const p = C.byId.has(C.raw[r.id]?.parent) ? C.raw[r.id].parent : ''; if (!byParent.has(p)) byParent.set(p, []); byParent.get(p).push(r); }
      return [...byParent].map(([p, rs]) => p ? fam(famHead(C.byId.get(p), open, note), rs.map(r => storyAcc(r, open)), 'is-acc') : rs.map(r => storyAcc(r, open)));
    };
    if (rest.length) out.push(head('Сюжеты', 'нажмите — раскроется'), families(rest, 'здесь идут'));
    // На «Всё» завершённые — в библиотеке («Архив»), не в списке.
    if (fin.length && !opts.home) out.push(head('Завершённые'), families(fin, 'здесь шёл'));
  } else if (kind === 'place') {
    const withKids = otherPlaces().filter(r => kidsOf(r.id).length);
    const kidTiles = r => chunk(kidsOf(r.id), 3).map(c => el('div', {class: 'grid3'}, c.map(k => elTile(k, open, viewKind(k) === 'story' ? storyState(k.id)[0] : '', 'mini'))));
    const sysFull = systems().filter(r => kidsOf(r.id).length), sysRest = systems().filter(r => !sysFull.includes(r));
    out.push(head('Альянсы'), el('div', {class: 'entries'}, factions().map(r => entry(r, open))),
      head('Локации'),
      withKids.map(r => fam(elTile(r, open, '', 'wide'), kidTiles(r))),
      el('div', {class: 'entries'}, otherPlaces().filter(r => !withKids.includes(r)).map(r => entry(r, open))),
      // Системы: где что-то есть (G-UX71 → Гигаструктура, завершён) — скобкой; остальные — списком.
      head('Системы', 'звёздные системы карты'),
      sysFull.map(r => fam(famHead(r, open, 'система'), kidTiles(r))),
      rows(sysRest, r => r.lore?.label || '', open),
      library([GALAXY, RACES, TECH, MAGIC], open));
  } else if (kind === 'building') {
    out.push(head('Феном'), el('div', {class: 'entries'}, entry(C.byId.get('phenome'), open, 'корабль-город')),
      head('Районы и здания'),
      zones().map(z => el('section', {class: 'zone'},
        el('button', {class: 'zone-head', onclick: () => open(z.id)}, el('b', {}, z.name),
          el('span', {}, `${z.bs.length} ${plural(z.bs.length, 'здание', 'здания', 'зданий')}`)),
        el('div', {class: 'shelf-row'}, z.bs.map(b => elTile(b, open, '', 'mini'))))),
      library([DISTRICTS], open));
  } else if (kind === 'character') {
    const recruit = storiesOf(state.chip).filter(r => C.raw[r.id]?.recruit && !done(r));
    out.push(el('p', {class: 'issue-intro'}, 'Кто играет — по сюжетам; золотой пунктир — союзники.',
      recruit.length ? [' Набор открыт: ', recruit.map((r, i) => [i ? ', ' : '', el('button', {onclick: () => open(r.id)}, `«${r.title}»`)]), '.'] : null));
    // Семья — сюжет или точка-родитель; союзник из другой семьи встаёт к своей паре (подпись «из …»).
    const ps = people(state.chip), placed = new Set(), homes = new Map();
    for (const c of clusters(ps)) {
      const home = C.byId.has(C.raw[c[0].id]?.parent) ? C.raw[c[0].id].parent : '';
      if (!homes.has(home)) homes.set(home, []);
      homes.get(home).push(...c);
    }
    const order = [...storiesOf(state.chip).map(s => s.id), ...[...homes.keys()].filter(k => k && viewKind(C.byId.get(k)) !== 'story'), ''];
    for (const h of order) {
      const rs = homes.get(h);
      if (!rs?.length || placed.has(h)) continue;
      placed.add(h);
      out.push(h ? fam(famHead(C.byId.get(h), open, `${rs.length}`), peopleRows(rs, open, h))
        : [el('h3', {}, 'Без точки'), peopleRows(rs, open, '')]);
    }
    if (!ps.length) out.push(el('p', {class: 'empty'}, 'В этом сюжете пока нет персонажей на карте.'));
    out.push(library([RACES], open));
  }
  return out;
}
// Плитки разделов на главной. Арт — у событий, статей и Фенома; у остальных — лица записей (как в V3).
const plur = (n, a, b, c) => `${n} ${plural(n, a, b, c)}`;
export function sectionTiles(state, onPick) {
  const info = modeInfo(state);
  const pics = rs => el('span', {class: 't-pics'}, rs.slice(0, 4).map(r => img(r.image, r.title)));
  const sub = {news: n => plur(n, 'событие', 'события', 'событий'), article: n => plur(n, 'статья', 'статьи', 'статей'),
    story: n => plur(n, 'сюжет', 'сюжета', 'сюжетов'), place: n => plur(n, 'маркер', 'маркера', 'маркеров'),
    building: n => plur(n, 'здание', 'здания', 'зданий'), character: n => plur(n, 'персонаж', 'персонажа', 'персонажей')};
  const tile = ([k, label]) => {
    const art = ['news', 'article', 'building'].includes(k) && info[k].art;
    // «Статьи и лор» — на всю ширину (v=231: плитки «События» нет, ряд из одной плитки).
    return el('button', {class: `tile${art ? ' bg' : ''}${k === 'article' ? ' wide' : ''}`, style: art ? bg(art) : null, 'aria-pressed': String(picked.has(k)), onclick: () => onPick(k)},
      art ? null : pics(info[k].items || []), el('span', {class: 't-title'}, label), el('span', {class: 't-sub'}, sub[k](info[k].count)));
  };
  return el('nav', {class: 'tiles', 'aria-label': 'Разделы'}, NAV.map(tile));
}
/* В шторке — «На главную» и разделы сеткой 3 × 2 (v=231, владелец); название и число, счётчики — как у плиток главной.
   Фон плитки — арт раздела (v=232): MENU_ART — заготовка под свои арты разделов (путь от корня сайта; владелец: для
   сюжетов, маркеров, персонажей и «На главную» их ещё нет, районам нужен другой); пусто — арт, как у плитки главной
   (статьи, районы), иначе без арта. */
const MENU_ART = {all: '', article: '', story: '', place: '', building: '', character: ''};
const menuArt = (k, info) => MENU_ART[k] || (['article', 'building'].includes(k) ? info[k]?.art : '') || '';
export function sectionMenu(state, onPick) {
  const info = modeInfo(state);
  const tile = (k, label, count) => {
    const art = menuArt(k, info);
    return el('button', {class: `tile p-menu-section${art ? ' has-art' : ''}`, 'aria-pressed': String(currentSection() === k),
      style: art ? `--art:url("${new URL(art, BASE).href}")` : null, onclick: () => onPick(k)},
      el('span', {class: 't-title p-menu-title'}, label), count == null ? null : el('span', {class: 'p-menu-count'}, String(count)));
  };
  return el('nav', {class: 'tiles p-menu-sections', 'aria-label': 'Разделы'},
    tile('all', 'На главную'), NAV.map(([k, label]) => tile(k, label, info[k].count)));
}
// «Всё» — вся информация на одной странице.
function home(state, open, toggle) {
  return [
    sectionTiles(state, toggle),
    newsNow(state, open), epochLine(open),
    issue('story', state, open, {home: true}),
    homeLibrary(state, open),
  ];
}
// Библиотека «Всё» (владелец 01.11, вместо «Кто и где»): статьи лора (раскрываются разделами) → маркеры →
// локации и системы → персонажи → здания Фенома → архив (завершённые сюжеты).
function homeLibrary(state, open) {
  const group = (title, n, body, on = false) => n ? el('details', {class: 'lib-group', open: on, 'data-state-key':'group:'+title}, el('summary', {}, title, el('span', {}, String(n))), body) : null;
  const marks = places().filter(p => p.flags.alliance), locs = places().filter(p => p.flags.location);
  const ps = C.records.filter(r => viewKind(r) === 'character'), arch = stories().filter(done);
  const inside = r => kidsOf(r.id).filter(k => viewKind(k) === 'story').map(k => `«${shortOf(k.id)}»`).join(', ');
  return el('section', {class: 'library'}, head('Библиотека'),
    group('Статьи лора', lore().length, el('div', {class: 'lib-list', style: 'border:0;border-top:1px solid var(--line);border-radius:0'}, lore().map(r => libArticle(r, open))), true),
    group('Альянсы', marks.length, rows(marks, r => sentences(descOf(r), 1).slice(0, 80), open)),
    group('Локации', locs.length + systems().length, [rows(locs, placeSub, open),
      el('div', {class: 'lib-sub'}, 'Системы'), rows(systems(), r => inside(r) ? `здесь ${inside(r)}` : r.lore?.label || '', open)]),
    group('Персонажи', ps.length, rows(ps, r => [C.raw[r.id]?.race, C.raw[r.id]?.parent && shortOf(C.raw[r.id].parent)].filter(Boolean).join(', '), open)),
    group('Здания Фенома', buildings().length, rows(buildings(), r => r.zone || 'Без района', open)),
    group('Архив', arch.length, rows(arch, r => {
      const p = C.byId.get(C.raw[r.id]?.parent);
      return p ? `завершён, ${viewKind(p) === 'system' ? 'система ' : ''}${p.title}` : 'завершённый сюжет';
    }, open)));
}

// Разделы N5. «Всё» — это когда ни один не включён. С 02.11.2026 (v=219) строки мини-плиток над лентой нет:
// разделы — плитками на «Всё» и в шторке «Феном ▴» панели «Нод»; в разделе сверху — «‹ Всё» и его название.
/* v=231 (владелец): отдельного перехода к событиям нет — они только на главной («Что сейчас происходит», эпохи).
   Раздел 'news' остаётся в SECTIONS: в нём раскрывается новость из поиска (planshet/shell.js renderInline). */
export const SECTIONS = [['news', 'События'], ['article', 'Статьи и лор'], ['story', 'Сюжеты'], ['place', 'Маркеры'], ['building', 'Районы и здания'], ['character', 'Персонажи']];
const NAV = SECTIONS.filter(([k]) => k !== 'news');   // плитки главной и шторки
let built = null, picked = new Set(), lastKind = 'all', ctx = null;
// Плитка — единый переключатель: открывает только свой раздел; повторное нажатие открытой — назад на «Всё».
// Накопление нескольких разделов пробовали — «очень много тыкать» (владелец 01.11).
export function toggleSection(k) {
  picked = new Set(picked.has(k) || k === 'all' ? [] : [k]);
  lastKind = picked.size === 1 ? [...picked][0] : 'all';
  if (ctx.state.kind !== lastKind) ctx.state.setFilter(ctx.state.chip, lastKind);
  else renderMain(ctx.main, ctx.state, ctx.open);
}
export const currentSection = () => picked.size === 1 ? [...picked][0] : 'all';
const scroller = () => ctx.main.closest('#planshet') || document.scrollingElement;
export function renderMain(main, state, open) {
  ctx = {main, state, open};
  // Раздел выбран в фильтре — включён ровно он.
  if (state.kind !== lastKind) { picked = new Set(state.kind === 'all' ? [] : [state.kind]); lastKind = state.kind; }
  const isHome = !picked.size;
  const on = SECTIONS.filter(([k]) => picked.has(k));
  const label = on.map(([, l]) => l).join(', ');
  // Первый заголовок выпуска, повторяющий название раздела («Сюжеты», «Статьи и лор»), — в строку «‹ Всё».
  const parts = isHome ? [] : on.flatMap(([k]) => [issue(k, state, open)].flat(Infinity).filter(Boolean));
  if (parts[0]?.classList?.contains('issue-head') && parts[0].querySelector('h2')?.textContent === label) parts.shift();
  const body = el('div', {class: 'issue'}, isHome ? home(state, open, toggleSection)
    : [el('div', {class: 'sec-bar'}, el('button', {class: 'sec-back', onclick: () => toggleSection('all')}, '‹ Всё'), el('h2', {}, label)), parts]);
  const key = [...picked].sort().join();
  const changed = built && built.key !== key;
  built = {chip: state.chip, key, body};
  main.replaceChildren(body,
    el('p', {class: 'row-sub', style: 'margin:18px 0 8px'}, 'Впервые здесь? ', el('a', {href: BASE + 'index.html?open=tour',
      onclick(e) { if (window.__mapStartTour) { e.preventDefault(); window.__mapStartTour(); } }}, 'Короткая экскурсия по карте')));
  if (changed) {
    scroller().scrollTo(0, 0);
    if (!still) body.animate([{opacity: 0, transform: 'translateY(8px)'}, {opacity: 1, transform: 'none'}], {duration: 220, easing: EASE});
  }
}
