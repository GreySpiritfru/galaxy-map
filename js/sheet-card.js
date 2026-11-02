/* ============================================================
   Анкета персонажа по шаблону (02.11.2026, перенос планшета, шаг 4.3; вид —
   макет N5, из mock/n6/cards.js characterCard).

   Сверху — имя, прозвища, Раса / Возраст / Роль / Сюжет и арт; дальше пункты
   шаблона 1.4–4.2 (названия из шаблона, длинные — «Читать полностью»);
   «Остальное из анкеты» — преамбула, неизвестные пункты, повторы; «Арты» —
   все картинки анкеты; «Анкета целиком» — исходник как есть. Ничего не
   теряется: разбор (js/sheet-parser.js) — индекс поверх исходника. Не узнан
   ни один пункт — null, окно показывает анкету целиком, как раньше.
   Текст — тем же белым списком, что статьи (js/reader.js build).
   ============================================================ */
import { parseSheet, sheetImages, sheetText, SHEET_TEMPLATE, ZW } from './sheet-parser.js?v=232';
import { build, wireLinks } from './reader.js?v=232';
import { viewImages } from './viewer.js?v=232';

const LONG = 700;   // знаков в пункте — дальше свёрнуто
const hasFigure = b => b && typeof b === 'object' && ['figure', 'img'].includes(b.t);
const fieldText = list => (list || []).flatMap(f => f.blocks.filter(b => !hasFigure(b)).map(sheetText))
  .join(' ').replace(ZW, '').replace(/\s+/g, ' ').trim();

function el(tag, attrs, ...kids) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([k, v]) => {
    if (v == null || v === false) return;
    if (k === 'onclick') node.addEventListener('click', v);
    else if (k === 'text') node.textContent = v;
    else node.setAttribute(k, v);
  });
  kids.flat().forEach(k => { if (k != null && k !== false) node.append(k); });
  return node;
}
function blocks(list) {
  const box = el('div', {class: 'mirror-article pc-text'});
  build(list, box);
  return box;
}
function expandable(content, text) {
  if (text.length <= LONG) return content;
  const box = el('div', {class: 'pc-long'}, content);
  const more = el('button', {type: 'button', class: 'pc-more', 'aria-expanded': 'false', onclick() {
    const on = box.classList.toggle('open');
    more.textContent = on ? 'Свернуть' : 'Читать полностью';
    more.setAttribute('aria-expanded', String(on));
  }}, 'Читать полностью');
  return [box, more];
}

/* doc — копия анкеты (AST), url — её адрес, char — {name, race, role, image},
   parent — {title, story} (сюжет или место). null — по шаблону не разобралась. */
export function renderSheetCard(doc, url, char, parent, scroller) {
  const parsed = parseSheet(doc);
  if (parsed.fallback) return null;
  const {fields} = parsed;
  const title = char.name || '';
  const imgs = sheetImages(doc);
  const srcs = [...new Set([...imgs, ...(imgs.length ? [] : [char.image])].filter(Boolean))];
  const imageSizes = new Map();
  function collectSizes(nodes) {
    for (const n of nodes || []) {
      if (!n || typeof n !== 'object') continue;
      if (n.src && n.w > 0 && n.h > 0) imageSizes.set(n.src, {w: n.w, h: n.h});
      if (Array.isArray(n.c)) collectSizes(n.c);
      if (Array.isArray(n.cap)) collectSizes(n.cap);
    }
  }
  collectSizes(doc.c);
  const galleryImages = srcs.map(src => ({src, ...imageSizes.get(src)}));

  // Прозвища — без самого имени: в анкете апостроф и точка в конце бывают другие («Гил’ви.»).
  const same = n => n.toLowerCase().replace(/[’‘ʼ`]/g, "'").replace(/[.\s]+$/, '');
  const names = (fieldText(fields.name) || title).split(/\s*[/|]\s*|,\s+(?=[«"А-ЯЁ])/).filter(Boolean);
  const alias = names.filter(n => same(n) !== same(title)).join(', ').replace(/\.$/, '');
  const fact = (dt, value) => value ? [el('dt', {}, dt), el('dd', {class: value.length > 70 ? 'clamp' : null,
    onclick(e) { e.currentTarget.classList.remove('clamp'); }}, value)] : null;
  const top = el('div', {class: 'pc-top', 'data-sheet-template': parsed.templateId},
    el('div', {}, el('h1', {class: 'pc-name'}, title), alias ? el('div', {class: 'pc-alias'}, alias) : null,
      el('dl', {class: 'pc-facts'}, fact('Раса', fieldText(fields.race) || char.race), fact('Возраст', fieldText(fields.age)),
        fact('Роль', char.role), parent ? fact(parent.story ? 'Сюжет' : 'Где', parent.title) : null)),
    srcs[0] ? el('button', {type: 'button', class: 'pc-art', style: `background-image:url("${encodeURI(srcs[0])}")`,
      'aria-label': `Арт: ${title}, открыть`, onclick: () => viewImages(galleryImages)})
      : el('div', {class: 'pc-art ph', 'aria-hidden': 'true'}, title.charAt(0)));

  const field = f => {
    const text = fieldText([f]);
    const list = f.blocks.filter(b => !hasFigure(b));
    if (!text && !list.some(b => b && b.t && !['p', 'anchor'].includes(b.t))) return null;
    const content = blocks(list);
    // «Голос» — обычно ссылка на запись: подпись короче адреса.
    if (f.key === 'voice') content.querySelectorAll('a[href]').forEach(a => {
      if (/^https?:/i.test(a.getAttribute('href'))) { a.classList.add('pc-voice'); if (/^https?:/i.test(a.textContent.trim())) a.textContent = 'Послушать →'; }
    });
    return el('section', {class: 'pc-sec', 'data-sheet-field': f.key}, el('h2', {}, f.templateTitle), expandable(content, text));
  };
  const body = SHEET_TEMPLATE.fields.filter(f => !['name', 'race', 'age'].includes(f.key))
    .flatMap(f => (fields[f.key] || []).map(field));

  // Преамбула, неизвестные пункты, подписи к картинкам и повторы имени/расы/возраста — видно, не теряется.
  const rest = [
    ...parsed.preamble,
    ...parsed.rest.flatMap(s => s.blocks),
    ...parsed.segments.filter(s => s.key).flatMap(s => s.blocks.filter(b => hasFigure(b) && b.cap && b.cap.length).map(b => ({t: 'blockquote', c: b.cap}))),
    ...['name', 'race', 'age'].flatMap(key => (fields[key] || []).flatMap((f, i) =>
      i > 0 || f.blocks.some(b => hasFigure(b) && b.cap && b.cap.length) ? [{t: 'h3', c: [f.templateTitle]}, ...f.blocks] : [])),
  ].filter(b => !hasFigure(b));
  const restOn = rest.some(b => sheetText(b).replace(ZW, '').trim());
  const restNode = restOn ? el('details', {class: 'sheet-rest'}, el('summary', {}, 'Остальное из анкеты'), blocks(rest)) : null;

  const gallery = srcs.length > 1 ? el('section', {class: 'pc-arts'}, el('h2', {}, 'Арты'),
    el('div', {class: 'pc-gallery'}, srcs.slice(1).map((src, i) => el('button', {type: 'button',
      'aria-label': `Арт ${i + 2} из ${srcs.length}, открыть`, onclick: () => viewImages(galleryImages, i + 1)},
      el('img', {src, alt: '', loading: 'lazy'}))))) : null;
  const full = el('details', {class: 'sheet-full'}, el('summary', {}, 'Анкета целиком'), blocks(doc.c));
  const src = el('p', {class: 'pc-source'}, 'Анкета: ');
  const orig = el('a', {href: /^https:\/\//i.test(doc.source || '') ? doc.source : url, 'data-mirror-link': '1', 'data-external': '1'}, 'оригинал ↗');
  src.append(orig);

  const card = el('article', {class: 'pc-card'}, top, body, restNode, gallery, full, src);
  wireLinks(card, url, scroller);
  return card;
}
