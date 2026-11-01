// Проверка реестра записей и кодека адресов (02.11.2026, перенос планшета, шаг 3).
//   node tools/check-records.mjs        — из корня репозитория; код выхода 1 при ошибках
// Реестр строится из файлов репозитория так же, как в карте (js/records.js), без DOM.
import {readFileSync, existsSync} from 'node:fs';
import {buildRecords, resolveAddress, resolveModule} from '../js/records.js';
import {encodeAddress, decodeAddress, ADDRESS_MAX} from '../js/address.js';

const root = new URL('../', import.meta.url);
const json = path => existsSync(new URL(path, root)) ? JSON.parse(readFileSync(new URL(path, root), 'utf8')) : null;
let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.log('FAIL: ' + msg); } };

// Справочник — из js/articles.js текстом (модуль трогает DOM при импорте).
const refSrc = readFileSync(new URL('js/articles.js', root), 'utf8');
const refArticles = Object.fromEntries([...refSrc.matchAll(/^\s+(\w+):\s+'(https:[^']+)'/gm)].map(m => [m[1], m[2]]));

const reg = buildRecords({
  world: json('world.json'), characters: json('characters.json'), articlesIndex: json('articles/index.json'),
  systems: {manifest: json('systems/manifest.json'), lore: json('systems/lore.json')},
  shipRecords: json('ship/records.json'), modules: json('modules.json'), relations: json('relations.json'), refArticles,
});
const count = {};
reg.records.forEach(r => { count[r.kind] = (count[r.kind] || 0) + 1; });
console.log('записей', reg.records.length, JSON.stringify(count));
ok(reg.diagnostics.length === 0, 'диагностика: ' + JSON.stringify(reg.diagnostics));
ok(count.zone === 15 && count.building === 23, 'районов 15, зданий 23');
ok(reg.migrated, 'world.json с признаком story');
const stories = reg.records.filter(r => r.flags && r.flags.story).map(r => r.id).sort();
ok(JSON.stringify(stories) === JSON.stringify(['kreyser-gorizont', 'story-1', 'story-2', 'story-k3']), 'сюжеты: ' + stories);
ok(reg.records.filter(r => r.flags && r.flags.alliance).length === 5, 'альянсов 5');
ok(reg.byId.get('building:phenome:maglev-station')?.parentId === 'zone:phenome:modules', 'Станция маглева — в Районе модулей');
ok((reg.children.get('phenome') || []).filter(id => id.startsWith('zone:')).length === 15, 'районы — дети Фенома');
ok(reg.records.filter(r => r.kind === 'character' && r.content.ownDocument).length > 0, 'анкеты — документы персонажей');
ok(!reg.records.some(r => r.kind === 'article' && /mii5PisF9M3|xbugnhuaVbR/.test(r.id)), 'старые анкеты без ссылки — не записи');

// Модули: все включения разрешаются по копиям статей.
const modules = json('modules.json').modules;
for (const r of reg.records) for (const ref of r.content.moduleRefs) {
  const m = modules[ref.moduleId];
  const doc = json('articles/' + m.articleId + '.json');
  const res = resolveModule(doc, m.selector);
  ok(res.status === 'ok' && res.blocks.length > 0, `модуль ${ref.moduleId} у ${r.id}: ${res.reason}`);
}
ok(reg.byId.get('phenome').content.moduleRefs.length === 3, 'у Фенома 3 модуля');

// Старые адреса.
ok(resolveAddress(reg, 'story-1')?.id === 'story-1', 'id');
const ph = resolveAddress(reg, 'phenom');
ok(ph && ph.id === 'tt/greyspirit/4tRzyNaVfEQ' && ph.anchor === 'fvQz', 'ключ справочника phenom: ' + JSON.stringify(ph));
ok(resolveAddress(reg, 'https://teletype.in/@greyspirit/SEOWfJxAewY#e5M4')?.anchor === 'e5M4', 'адрес статьи с якорем');
ok(resolveAddress(reg, 'нет-такого') === null, 'неизвестное — null');

// Кодек.
const cases = [
  [{id: 'story-1'}, 'story-1'],
  [{id: 'gilvi', tab: 'rolls'}, 'gilvi--rolls'],
  [{id: 'gilvi', tab: 'notes'}, 'gilvi--notes'],
];
for (const [addr, want] of cases) ok(encodeAddress(addr) === want, `encode ${JSON.stringify(addr)} → ${encodeAddress(addr)}`);
for (const addr of [{id: 'zone:phenome:night'}, {id: 'tt/greyspirit/SEOWfJxAewY', anchor: 'e5M4'},
  {id: 'story-1', tab: 'game'}, {id: 'Гил\'ви'}, {id: 'tour'}]) {
  const s = encodeAddress(addr);
  const d = decodeAddress(s);
  ok(/^[A-Za-z0-9_-]+$/.test(s) && s.length <= ADDRESS_MAX, 'символы startapp: ' + s);
  ok(d && d.id === addr.id && d.tab === (addr.tab || '') && d.anchor === (addr.anchor || ''), `round-trip ${JSON.stringify(addr)} → ${JSON.stringify(d)}`);
}
for (const [s, want] of [['tour', {special: 'tour'}], ['welcome', {special: 'welcome'}], ['sections', {special: 'sections'}],
  ['story-1', {id: 'story-1', tab: '', anchor: ''}], ['rayden-amateru--notes', {id: 'rayden-amateru', tab: 'notes', anchor: ''}]]) {
  ok(JSON.stringify(decodeAddress(s)) === JSON.stringify(want), `decode ${s} → ${JSON.stringify(decodeAddress(s))}`);
}
for (const bad of ['', 'r1_@@@', 'r1_' + 'A'.repeat(600), '<script>', 'a b']) ok(decodeAddress(bad) === null, 'мусор: ' + bad.slice(0, 20));
let threw = false;
try { encodeAddress({id: 'x', anchor: 'y'.repeat(600)}); } catch (e) { threw = true; }
ok(threw, 'длинный адрес — ошибка, не обрезка');

console.log(failed ? `ОШИБОК: ${failed}` : 'OK: реестр и адреса');
process.exit(failed ? 1 : 0);
