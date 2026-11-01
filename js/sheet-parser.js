/* Разбор анкеты по шаблону 1.1–4.2 (02.11.2026, перенос планшета, шаг 4.3; из
   mock/n6/sheet-parser.js без изменений логики). Исходник (AST копии статьи)
   не переписывается — это дополнительный индекс без потерь: преамбула,
   повторы пунктов, неизвестные пункты (rest) остаются; не узнан ни один
   пункт — fallback, анкета показывается целиком. Названия пунктов — из
   шаблона, не переименовывать. Чистый модуль. */
export const SHEET_TEMPLATE = Object.freeze({
  id: 'phenome-character-v1',
  fields: [
    ['1.1', 'name', 'Имя/Прозвище', /Имя\s*\/\s*Прозвище/i],
    ['1.2', 'race', 'Раса', /Раса/i], ['1.3', 'age', 'Возраст', /Возраст/i],
    ['1.4', 'look', 'Внешность', /Внешность/i], ['1.5', 'voice', 'Голос', /Голос/i],
    ['1.6', 'bio', 'Краткая биография', /(?:Краткая\s+)?биография/i],
    ['2.1', 'phys', 'Физические параметры', /Физические\s+параметры/i],
    ['2.2', 'magic', 'Магические параметры', /Магические\s+параметры/i],
    ['3.1', 'gear', 'Снаряжение', /Снаряжение/i], ['4.1', 'lang', 'Язык', /Язык/i],
    ['4.2', 'ride', 'Средство передвижения', /Средств[оа]\s+передвижения/i],
  ].map(([number, key, title, pattern]) => Object.freeze({number, key, title, pattern})),
});
export const ZW = /[\u200b-\u200d\ufeff]/g;
export function sheetText(n) {
  if (typeof n === 'string') return n;
  if (Array.isArray(n)) return n.map(sheetText).join('');
  if (!n) return '';
  if (n.t === 'br') return '\n';
  return sheetText(n.c || []);
}
const hashOf = text => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16).padStart(8, '0');
};
const numbered = /^\s*(\d+)\s*\.\s*(\d+)\s*\.?\s*/;
function labelOf(text) {
  const clean = text.replace(ZW, ''), number = clean.match(numbered);
  if (!number) return null;
  const code = `${number[1]}.${number[2]}`, rest = clean.slice(number[0].length);
  const field = SHEET_TEMPLATE.fields.find(f => f.number === code);
  const match = field && rest.match(new RegExp(`^(?:${field.pattern.source})(?=\\s|[:.]|$)\\s*[:.]?\\s*`, 'i'));
  if (match) return {number: code, field, title: match[0].trim().replace(/[:.]$/, ''), length: number[0].length + match[0].length};
  return {number: code, field: null, title: rest.split(/[:\n]/)[0].trim(), length: 0};
}
// Split recursively: line breaks inside strong/a/em and explicit br work identically.
function inlineLines(nodes) {
  const lines = [[]];
  for (const n of nodes || []) {
    if (typeof n === 'string') n.split('\n').forEach((s, i) => { if (i) lines.push([]); if (s) lines.at(-1).push(s); });
    else if (n?.t === 'br') lines.push([]);
    else if (Array.isArray(n?.c)) inlineLines(n.c).forEach((children, i) => {
      if (i) lines.push([]);
      if (children.length) lines.at(-1).push({...n, c: children});
    });
    else lines.at(-1).push(n);
  }
  return lines;
}
function removePrefix(nodes, count) {
  const out = [];
  for (const n of nodes || []) {
    const size = sheetText(n).replace(ZW, '').length;
    if (count >= size && size) { count -= size; continue; }
    if (count > 0 && typeof n === 'string') {
      let end = 0, remaining = count;
      for (; end < n.length && remaining; end++) if (!/[\u200b-\u200d\ufeff]/.test(n[end])) remaining--;
      out.push(n.slice(end)); count = 0;
    } else if (count > 0 && Array.isArray(n?.c)) { out.push({...n, c: removePrefix(n.c, count)}); count = 0; }
    else out.push(n);
  }
  return out;
}
function unitsOf(nodes, path = [], out = []) {
  for (let i = 0; i < (nodes || []).length; i++) {
    const b = nodes[i], source = [...path, i];
    if (b?.t === 'section') { unitsOf(b.c, [...source, 'c'], out); continue; }
    if (b && ['p', 'h2', 'h3', 'h4', 'blockquote'].includes(b.t)) {
      const lines = inlineLines(b.c), hasLabel = lines.some(line => numbered.test(sheetText(line).replace(ZW, '')));
      if (hasLabel) {
        for (let line = 0; line < lines.length; line++) {
          let c = lines[line], text = sheetText(c), label = labelOf(text), endLine = line;
          // Wrapped labels can have a break inside the name: join only if a known exact label results.
          if (label && !label.field) for (let n = 1; n <= 2 && line + n < lines.length; n++) {
            const candidate = [...c, ' ', ...lines[line + n]], found = labelOf(sheetText(candidate));
            c = candidate;
            if (found?.field) { label = found; endLine = line + n; text = sheetText(c); break; }
          }
          if (endLine === line) c = lines[line];
          out.push({block: {...b, c}, source: {path: source, line, endLine}, label, text}); line = endLine;
        }
        continue;
      }
    }
    out.push({block: b, source: {path: source}, label: null, text: sheetText(b)});
  }
  return out;
}
export function parseSheet(doc) {
  const original = doc || {c: []}, sourceHash = hashOf(JSON.stringify(original));
  const segments = [], fields = Object.create(null), diagnostics = [], preamble = [];
  let current = null;
  for (const unit of unitsOf(original.c)) {
    const label = unit.label;
    if (label) {
      const key = label.field?.key || null, occurrence = key ? (fields[key]?.length || 0) + 1 : 1;
      current = {key, number: label.number, title: label.title, templateTitle: label.field?.title || null,
        occurrence, sourceHeading: unit.text, blocks: [], ranges: [], unknown: !key};
      segments.push(current);
      if (key) { (fields[key] ||= []).push(current); if (occurrence > 1) diagnostics.push({type: 'repeat', key, occurrence}); }
      else diagnostics.push({type: 'unknown', number: label.number, heading: unit.text});
      current.blocks.push(key ? {...unit.block, c: removePrefix(unit.block.c, label.length)} : unit.block);
      current.ranges.push(unit.source);
    } else if (current) { current.blocks.push(unit.block); current.ranges.push(unit.source); }
    else { preamble.push(unit.block); }
  }
  const matched = Object.values(fields).reduce((sum, list) => sum + list.length, 0);
  if (!matched) diagnostics.push({type: 'no-template-match'});
  return {sourceHash, templateId: SHEET_TEMPLATE.id, original, segments, fields, preamble,
    rest: segments.filter(s => s.unknown), diagnostics, matched, fallback: matched === 0};
}
export function sheetImages(doc) {
  const out = [];
  function walk(n) {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!n || typeof n !== 'object') return;
    if (typeof n.src === 'string' && ['figure', 'img'].includes(n.t) && !out.includes(n.src)) out.push(n.src);
    walk(n.c); walk(n.cap);
  }
  walk(doc?.c);
  return out;
}
