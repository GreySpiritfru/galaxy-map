/* Ширина подписей маркеров (10 px, 600, sans-serif — как .link-chip-caption): у каких имён персонажей
   и названий точек подпись не влезет в ячейку данной ширины. node textw.js */
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const chars = JSON.parse(fs.readFileSync('characters.json', 'utf8'));
  const cap = (text) => { const w = text.trim().split(/\s+/); if (w.length > 1 && (w[0].length <= 2 || w[0].endsWith('.'))) return w.slice(0, 2).join(' '); return w[0] || text; };
  const b = await chromium.launch();
  const p = await b.newPage();
  await p.setContent('<div></div>');
  const res = await p.evaluate((names) => {
    const c = document.createElement('canvas').getContext('2d');
    c.font = '600 10px sans-serif';
    const up = document.createElement('canvas').getContext('2d');
    up.font = '400 10px sans-serif';
    return {
      chars: names.map(n => [n, +c.measureText(n).width.toFixed(1)]).sort((a, b) => b[1] - a[1]),
      words: ['Крейсер', 'Горизонт', 'Переворот', 'Районы', 'Фенома', 'Описание', 'галактики', 'Расовая', 'энциклопедия', 'Центральный', 'Центральная', 'башня', 'город']
        .map(n => [n, +c.measureText(n).width.toFixed(1)]),
      caps: ['ВНУТРИ', 'МАТЕРИАЛЫ', 'ИСПОЛЬЗУЕТСЯ В'].map(n => [n, +up.measureText(n).width.toFixed(1)]),
    };
  }, chars.map(ch => cap(ch.name)));
  console.log(JSON.stringify(res));
  await b.close();
})();
