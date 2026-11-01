// Запуск из любой папки: node tools/test-linker.mjs. Только диск, без сети.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {performance} from 'node:perf_hooks';
import {fileURLToPath} from 'node:url';
import {resolve, dirname} from 'node:path';
import {articleText, collectRecords, buildAliases, linkText, mentions, buildSearchIndex, search} from '../js/linker.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFile(resolve(root, path), 'utf8');
const json = async path => JSON.parse(await read(path));
const links = (text, table, selfId) => linkText(text, table, selfId).filter(c => c.id);
let checks = 0;
function check(name, fn) {
  fn();
  checks++;
  console.log(`OK: ${name}`);
}

try {
  const [world, characters, articlesIndex, manifest, feed] = await Promise.all([
    json('world.json'), json('characters.json'), json('articles/index.json'), json('systems/manifest.json'),
    readFile(resolve(dirname(root.replace(/[\\/]$/, '')), 'lore/news/perevorot-feed-v2.md'), 'utf8')
  ]);
  assert(Array.isArray(manifest) && manifest.length, 'manifest систем прочитан');
  const docs = await Promise.all(Object.values(articlesIndex.articles).map(async e => ({
    id: e.file.replace(/^articles\//, '').replace(/\.json$/, ''), doc: await json(e.file)
  })));
  const articleTexts = Object.fromEntries(docs.map(({id, doc}) => [id, articleText(doc)]));
  // Лента ещё не news.json. В индекс кладём её одним документом без выдуманных
  // меток. Ручные псевдонимы ниже — отдельная проверка договорённого API.
  const news = {items: [{id: 'n-test-feed', title: 'Лента Переворота', text: feed, story: 'story-1'}]};
  const records = collectRecords({world, characters, articlesIndex, articleTexts, news});
  const table = buildAliases(records);
  console.log(`Данные: ${world.length} точек, ${characters.length} персонажей, ${docs.length} статей, лента; ${manifest.length} систем (не аргумент collectRecords).`);
  console.log('Конфликты псевдонимов:', JSON.stringify(table.conflicts, null, 2));

  const selected = ['tt/greyspirit/LwUEi4D1U3B', 'tt/fox_rogue/TJwWhdVyo1Quuqu', 'tt/denjik12/wDDB1AvyJBV'];
  for (const [id, text] of [['n-test-feed', feed], ...selected.map(id => [id, articleTexts[id]])]) {
    assert(text, `Есть настоящий текст ${id}`);
    const found = links(text, table, id);
    console.log(`\n${id}: ${found.map(c => `${c.text} → ${c.id}`).join('; ') || '(нет однозначных ссылок)'}`);
    check(`сохранён исходный текст ${id}`, () => assert.equal(linkText(text, table, id).map(c => c.text).join(''), text));
    check(`реальные упоминания персонажей ${id}`, () => assert(found.some(c => characters.some(p => p.id === c.id))));
  }

  // В полном хранилище имена статей совпадают с именами персонажей. По брифу
  // эти псевдонимы запрещены. Проверяем падежи отдельно на тех же НАСТОЯЩИХ
  // текстах с таблицей персонажей, не ослабляя запрет в полной таблице.
  const characterTable = buildAliases(records.filter(r => r.kind === 'character'));
  const cases = [
    [feed, 'Райдена', 'rayden-amateru'],
    [articleTexts[selected[0]], 'Райдену', 'rayden-amateru'],
    [articleTexts[selected[1]], 'Сорэна', 'soren-russkiy']
  ];
  // Третья статья: выбираем реальную склонённую форму из тела, не заголовка.
  const fox = articleTexts[selected[2]];
  const declined = fox.match(/(?<![\p{L}\p{N}_])(Фокса|Фоксу|Фоксом|Фоксе)(?![\p{L}\p{N}_])/u);
  assert(declined, 'В третьей статье есть склонённый Фокс');
  cases.push([fox, declined[0], 'foks']);
  for (const [text, form, id] of cases) check(`падеж в настоящем тексте: ${form} → ${id}`, () => {
    assert(text.includes(form));
    // Проверяем сам фрагмент: linkText намеренно связывает только ПЕРВОЕ имя.
    assert.equal(links(form, characterTable)[0]?.id, id);
  });

  check('анкета — часть персонажа: нет конфликта персонаж/статья, ссылки идут на персонажа', () => {
    assert(!table.conflicts.some(c => c.ids.includes('rayden-amateru')));
    assert.equal(links('Райдена', table)[0]?.id, 'rayden-amateru');
    assert.equal(records.find(r => r.id === 'rayden-amateru').sheet, 'tt/greyspirit/LwUEi4D1U3B');
    assert(!records.some(r => r.id === 'tt/greyspirit/LwUEi4D1U3B'));
  });
  check('падежи, несклоняемые имена, инициалы, апострофы', () => {
    for (const name of ['Райден', 'Райдена', 'Райдену', 'Райденом', 'Райдене']) {
      assert.equal(links(name, characterTable)[0]?.id, 'rayden-amateru');
    }
    for (const [name, id] of [['Кэт', 'ket-uollen'], ['Найто', 'nayto-afetovich'],
      ['Фокса', 'foks'], ['Сорэну', 'soren-russkiy'], ["Гил’ви", 'gilvi'],
      ['Лире', 'lira-vetrogran'], ['Паулем', 'paul-langergans'], ['Сорэну Расскому', 'soren-russkiy']]) {
      assert.equal(links(name, characterTable)[0]?.id, id, name);
    }
  });
  check('каверзные слова: ноль ложных ссылок', () => {
    const extra = collectRecords({news: {aliases: {'sheldi-uoker': ['Шел']}}, characters});
    const trickyTable = buildAliases([...extra, ...records.filter(r => r.kind === 'place' || r.kind === 'story')]);
    const tricky = ['шел', 'Шел домой', 'Шёл домой', 'ШЕЛ домой', 'Феном Фенома Феномом Феноме',
      'Кэтрин', 'СуперКэт', 'Кэта', 'Кэтовая', 'Фокстрот', 'Фоксация', 'МегаФокс', 'Фокс-терьер',
      'Фокс_тест', 'Фокс2', 'райден сорэн кэт', 'Мина взорвалась', 'Бездна космоса'];
    for (const text of tricky) assert.deepEqual(links(text, trickyTable), [], text);
    console.log(`  ${tricky.length} строк проверено`);
  });
  check('первое упоминание, selfId, длинное имя, пробелы', () => {
    const text = 'Райдену\nАматеру, Райденом и Кэт. Фокса Фокс';
    const result = links(text, characterTable, 'ket-uollen');
    assert.deepEqual(result, [{text: 'Райдену\nАматеру', id: 'rayden-amateru'}, {text: 'Фокса', id: 'foks'}]);
    assert.equal(linkText(text, characterTable).map(c => c.text).join(''), text);
    assert.deepEqual(linkText('', characterTable), [{text: ''}]);
  });
  check('конфликт окончаний и запрет короткого префикса', () => {
    const t = buildAliases([{id: 'a', title: 'Лира'}, {id: 'b', title: 'Лир'},
      {id: 'c', title: 'Кэт Уоллен'}, {id: 'd', title: 'Кэт Уоллен'}, {id: 'e', title: 'Кэт'}]);
    assert.deepEqual(links('Лира Кэт Уоллен', t), []);
    assert(t.conflicts.some(c => c.ids.includes('a') && c.ids.includes('b')));
  });
  check('сбор записей, briefs, ручные aliases, строковые флаги', () => {
    const r = collectRecords({world: [{id: 's', title: 'Сюжет', shortTitle: 'Коротко', beacon: 'True'},
      {id: 'p', title: 'Место', beacon: 'False'}],
    characters: [{id: 'c', name: "О. Гил'ви", parent: 's', links: "['p']"}],
    news: {aliases: {c: ['Гил']}, briefs: {s: {summary: 'Сводка', known: ['Известно'], updated: '2026-11-01'}},
      items: [{id: 'n', title: 'Новость', happened: 'Случилось', why: 'Зачем', now: 'Теперь', places: ['p'], people: ['c']}]}});
    assert.equal(r[0].kind, 'story'); assert.equal(r[1].kind, 'place');
    assert.equal(r[0].summary, 'Сводка'); assert(r[0].text.includes('Известно'));
    assert(r[0].aliases.includes('Коротко')); assert(r[2].aliases.includes("Гил'ви"));
    assert(r[2].aliases.includes('Гил')); assert.equal(r[2].story, 's');
    assert.equal(r[3].text, 'Случилось\nЗачем\nТеперь');
    assert.deepEqual(r[3].people, ['c']);
    assert.deepEqual(collectRecords(), []);
  });
  check('articleText: inline, блоки, подписи, без URL/оглавления', () => {
    assert.equal(articleText({c: [{t: 'p', c: ['Рай', {t: 'strong', c: ['ден']}, 'у']},
      {t: 'p', c: [{t: 'a', href: 'https://ignored', c: ['Кэт']}]},
      {t: 'figure', src: 'ignored', cap: ['Подпись']}, {t: 'toc', items: [{x: 'Дубль'}]}]}),
    'Райдену\nКэт\nПодпись');
    assert.equal(articleText({}), '');
  });
  check('mentions: текст + метки, разные виды, без дублей и self', () => {
    const r = [{id: 'a', kind: 'character', title: 'Райден'},
      {id: 'b', kind: 'character', title: 'Фокс', text: 'Райдену'},
      {id: 'n', kind: 'news', title: 'Лента', text: 'Райдену Райден', people: ['a'], story: 's'},
      {id: 's', kind: 'story', title: 'Переворот', text: 'Переворот', people: ['missing']}];
    assert.deepEqual(mentions(r, buildAliases(r)), {a: ['n'], b: [], n: [], s: ['n']});
  });

  const started = performance.now();
  const index = buildSearchIndex(records);
  const elapsed = performance.now() - started;
  check(`индекс ${records.length} записей: ${elapsed.toFixed(1)} мс < 300 мс`, () => assert(elapsed < 300));
  for (const q of ['Райдену', 'больница', 'ретранслятор', 'федерация', 'бар Шел']) {
    const result = search(index, q, 3);
    console.log(`Поиск «${q}»: ${result.map(r => `${r.title} [${r.id}, ${r.where}, ${r.score}]`).join('; ')}`);
    check(`поиск «${q}» находит запись`, () => assert(result.length));
  }
  check('поиск: все слова, ранжирование, ё/е, падежи, префикс, limit', () => {
    const idx = buildSearchIndex([{id: 't', title: 'Райден', kind: 'character'},
      {id: 'a', title: 'Анкета', aliases: ['Райден'], kind: 'article'},
      {id: 'x', title: 'Лента', text: 'Райдену принесли ретранслятор', kind: 'news'},
      {id: 'e', title: 'Объединённая Федерация', kind: 'place'}]);
    assert.deepEqual(search(idx, 'Райдену').map(r => r.id), ['t', 'a', 'x']);
    assert.deepEqual(search(idx, 'Райден ретранс').map(r => r.id), ['x']);
    assert.equal(search(idx, 'объединенная')[0]?.id, 'e');
    assert.equal(search(idx, 'Федерацией')[0]?.id, 'e');
    assert.equal(search(idx, 'райд', 1).length, 1);
    assert.deepEqual(search(idx, 'несуществующее'), []);
    assert.deepEqual(search(idx, ''), []); assert.deepEqual(search(idx, 'Райден', 0), []);
  });
  console.log(`\nPASS: ${checks} проверок. Модуль импортируется без DOM/сети; индекс создаётся явным вызовом.`);
} catch (error) {
  console.error('FAIL:', error);
  process.exitCode = 1;
}
