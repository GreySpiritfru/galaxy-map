// Собирает макеты menu-sync/mock-*.html из настоящей разметки (markup.json, её снимает dump-markup.js)
// и настоящих стилей сайта (../../../css/styles.css, ../../../planshet/planshet.css). Варианты — только
// CSS-правки поверх них плюс две мелкие замены разметки (✕ и 📖 → линейные значки).
// Запуск: node _review/2026-11-03-window-panel/menu-sync/tools/build-mocks.js
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'markup.json'), 'utf8'));
// Окно персонажа открылось с раскрытой строкой (окно помнит раскрытие) — в макете показываем свёрнутой.
const collapse = h => h.replace(/class="node-links is-expanding is-open"/, 'class="node-links"')
  .replace(/style="--p: 1\.0000;"/, 'style="--p: 0;"').replace(/node-links-body" style="height: \d+px;"/, 'node-links-body" style="height: 0px;"')
  .replace(/aria-expanded="true"/, 'aria-expanded="false"');
M.charDock = collapse(M.charDock);

// Картинки маркеров в разметке — относительно index.html; макет лежит на три папки глубже.
const fixSrc = h => h.replace(/src="(?!\.\.\/|https?:|data:)/g, 'src="../../../')
  .replace(/<!--[\s\S]*?-->/g, '')
  // Кольцо-подсказка у «Феном» крутится бесконечно — на снимке выходило бы случайной яркости.
  .replace(/"dock-brand pulse"/g, '"dock-brand"');

const X_SVG = '<svg class="ui-x" viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 6.5l11 11M17.5 6.5l-11 11"/></svg>';
// Та же книга, что у вкладки «Статья».
const BOOK_SVG = '<svg class="ui-book" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.8C10 5.3 7 4.8 4 5.3v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13c-3-.5-6 0-8 1.5z"/><path d="M12 6.8v13"/></svg>';
const iconsFix = h => h.replace(/aria-label="Закрыть">✕<\/button>/g, `aria-label="Закрыть">${X_SVG}</button>`)
  .replace(/>📖<\/span>/g, `>${BOOK_SVG}</span>`);

const TEXT = ['Межпланетным советом Фенома совсем недавно в качестве капитана был избран терран по имени Дэнни Макфарлейн. Несмотря на сомнительное досье, среди слушателей анонимного голосования нашлось большое количество тех, кто поддержал его кандидатуру — всё из-за выделения субсидий на экологическое благополучие нескольких планет.',
  'Капитан Макфарлейн провёл за штурвалом три недели, прежде чем оказалось, что он засланец — спецагент Федерации, который намеренно телепортировал Феном в планетное пространство державы-наёмника, что с превеликим удовольствием приняла корабль в свои владения и при помощи всех имеющихся рычагов управления подделала местный политический режим под свою диктатуру.'];

/* ---------- рамка макета (не часть предложения) ---------- */
const FRAME = `
@font-face{font-family:'Tektur';font-weight:400 900;font-display:block;src:url(../../../fonts/tektur-cyrillic.woff2) format('woff2');unicode-range:U+0301,U+0400-045F,U+0490-0491,U+04B0-04B1,U+2116}
@font-face{font-family:'Tektur';font-weight:400 900;font-display:block;src:url(../../../fonts/tektur-latin.woff2) format('woff2');unicode-range:U+0000-00FF,U+2000-206F}
html,body{height:auto;overflow:auto}
body{background:#0b0b10;color:#e6e6ee;font:15px/1.45 system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
.mock-head{max-width:1232px;margin:0 auto;padding:16px 16px 4px}
.mock-head h1{margin:0 0 4px;font:700 20px/1.2 'Tektur',system-ui,sans-serif}
.mock-head p{margin:0;color:#c8c8d2;font-size:15px}
.stages{display:grid;grid-template-columns:minmax(0,1fr);gap:12px;padding:12px 0 24px}
@media (min-width:1000px){.stages{grid-template-columns:repeat(2,minmax(0,1fr));gap:20px;max-width:1280px;margin:0 auto;padding:16px 24px 32px;box-sizing:border-box}}
.stage{position:relative;height:var(--h);overflow:hidden;background:#06070b}
@media (min-width:1000px){.stage{border-radius:16px}}
.stage-cap{position:absolute;z-index:40;top:8px;left:12px;padding:2px 8px;border-radius:6px;background:#06070bdd;color:#c8c8d2;font:600 13px/1.4 system-ui,sans-serif}
.stage.map{background:#06070b url(до-390-карта.png) center -120px/390px auto no-repeat}
@media (min-width:1000px){.stage.map{background:#06070b url(до-1280-карта.png) center -260px/1280px auto no-repeat}}
.stage.win{background:#06070b url(до-390-карта.png) center -300px/390px auto no-repeat}
@media (min-width:1000px){.stage.win{background:#06070b url(до-1280-карта.png) center -200px/1280px auto no-repeat}}
.stage .phenom-card{position:absolute;inset:0;height:auto}
.mock-text{padding:44px 16px 0;max-width:680px;margin:0 auto;font-size:17px;line-height:1.6;color:#e6e6ee}
.mock-text p{margin:0 0 14px}
/* Шторка в макете: не fixed к экрану, а над панелью своей сцены (место ставит скрипт внизу). */
.stage #planshet{position:absolute;inset:0;z-index:25;padding:0;background:none;pointer-events:none;overflow:visible}
.stage #planshet .p-menu{position:absolute;pointer-events:auto}
`;

/* ---------- общие мелкие правки: во всех трёх вариантах ---------- */
const COMMON = `
/* 1. Подписи вкладок — шрифтом панели (кнопки не наследуют шрифт: сейчас Arial). */
.tabbar-btn,.tabbar .toolbar-close-btn,.link-chip,.node-crumb,.node-strip-open{font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}
/* 2. ✕ — линейный значок 24 px, как остальные. */
.ui-x{display:block;width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round}
/* 3. Статья в «Материалах» — книга линией (сейчас эмодзи 📖). */
.node-marker.kind-article{color:#ececf2}
.node-marker.kind-article .ui-book{width:62%;height:62%;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
/* 4. Значки шторки — 24 px, как во вкладках окон и на панели карты (сейчас 20). */
#planshet .p-mini-icon svg{width:24px;height:24px}
/* 5. Бирюзовый — только выбранное: число у стопки, «Внутри»/«Материалы», кнопка «Схема». */
.node-stack-n{color:#ececf2}
.node-links-cap{color:#9a9aa8;text-transform:none;letter-spacing:0;font-size:11px;font-weight:600}
#planshet .p-menu .p-menu-ship{background-color:rgba(255,255,255,0.07);box-shadow:none}
/* 6. Текст кнопок — одним цветом #ececf2 (вкладки были 65 % белого, подписи маркеров 78 %). */
.tabbar-btn:not(.active),.link-chip{color:#ececf2}
`;

/* ---------- (а) шторка ближе к плашкам окон ---------- */
const VAR_A = COMMON + `
/* Фон и ободок — как у плашки окна: 0.95 и тонкая белая линия 8 %. */
#planshet .p-menu-body{background:rgba(16,16,24,0.95);box-shadow:inset 1px 0 rgba(255,255,255,0.08),inset -1px 0 rgba(255,255,255,0.08),inset 0 1px rgba(255,255,255,0.08)}
.map-dock.menu-open .dock-bar{background:rgba(16,16,24,0.95);box-shadow:0 8px 26px rgba(0,0,0,0.45),inset 1px 0 rgba(255,255,255,0.08),inset -1px 0 rgba(255,255,255,0.08),inset 0 -1px rgba(255,255,255,0.08),inset 0 1px rgba(255,255,255,0.07)}
/* Разделы — без общей подложки с бирюзовой рамкой; плитки — карточки 12. */
#planshet .p-menu-sections{padding:0;background:none;box-shadow:none;gap:4px}
#planshet .p-menu .p-menu-section{border-radius:12px}
/* Выбранное — как вкладка окна: только бирюзовый текст (без рамки 2 px и полосы слева). */
#planshet .p-menu .tile[aria-pressed="true"]{outline:none;box-shadow:none}
/* Нижний ряд — как вкладки окна: кнопки вплотную, без своих подложек; черта сверху. */
#planshet .p-menu-row{gap:0;margin:6px -6px -8px;padding:3px 6px 4px;border-top:1px solid rgba(255,255,255,0.07)}
#planshet .p-menu .p-mini,#planshet .p-menu .p-menu-ship{min-height:56px;padding:4px 2px;gap:2px;border-radius:0;background:none;box-shadow:none;font-size:11px;font-weight:600}
#planshet .p-menu .p-mini[aria-pressed="true"]{box-shadow:none}
/* Подписи вкладок окон — 11 px, как у панели карты и шторки (было 10). */
.tabbar-btn-label{font-size:11px;line-height:14px}
`;

/* ---------- (б) плашки окон ближе к шторке ---------- */
const VAR_B = COMMON + `
/* Вкладки — отдельные кнопки шторки: подложка 7 %, скругление 10, зазор 4. */
.node-dock > .tabbar{gap:4px;padding:4px;border-top:1px solid rgba(255,255,255,0.07)}
.node-dock > .tabbar .tabbar-btn{min-height:56px;padding:4px;gap:3px;border-radius:10px;background:rgba(255,255,255,0.07)}
.tabbar-btn-label{font-size:12px;font-weight:600;line-height:1.2}
/* Выбранная вкладка — как выбранный раздел шторки: бирюзовый текст и бирюзовая подложка 12 %. */
.node-dock > .tabbar .tabbar-btn.active{background:rgba(175,238,238,0.12)}
/* ✕ — такая же кнопка 56 × 56, черта справа больше не нужна: кнопки и так разделены зазором. */
.node-dock > .tabbar .toolbar-close-btn{width:56px;min-height:56px;border-radius:10px;background:rgba(255,255,255,0.07)}
.node-dock > .tabbar .toolbar-close-btn::after{display:none}
.node-dock.single > .tabbar{padding:4px}
/* Раскрытая панель — маркеры на своей подложке, как разделы шторки (4 %, скругление 14). */
.node-links-cols{margin:4px 4px 0;padding:8px;border-radius:14px;background:rgba(255,255,255,0.04);box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)}
.node-strip-open,.node-crumb{border-radius:10px}
/* И сама шторка: рамка подложки разделов — белая, не бирюзовая (бирюзовый — только выбранное). */
#planshet .p-menu-sections{box-shadow:inset 0 0 0 1px rgba(255,255,255,0.08)}
#planshet .p-menu .p-mini{border-radius:10px}
`;

/* ---------- (в) общие токены ---------- */
const VAR_C = COMMON + `
:root{
  --ui-panel-map:rgba(16,16,24,0.86);   /* над картой — как решено в v=238 */
  --ui-panel-text:rgb(12,12,18);        /* над текстом — сплошной: при 0.95 текст просвечивает (+13 уровней яркости) */
  --ui-line:rgba(255,255,255,0.08); --ui-sep:rgba(255,255,255,0.07);
  --ui-text:#ececf2; --ui-muted:#9a9aa8; --ui-act:#AFEEEE;
  --ui-sel-bg:rgba(175,238,238,0.15); --ui-sel-line:rgba(175,238,238,0.3);   /* «линза» панели карты */
  --ui-card:rgba(255,255,255,0.04);
  --r-panel:20px; --r-card:14px; --r-btn:10px;
  --ui-label:12px;
}
/* Фон: окна над текстом — сплошной (было 0.95). */
.node-dock > .node-links,.node-dock > .tabbar,.node-dock.single{background:var(--ui-panel-text)}
/* Ободок 1 px — у всех панелей (сейчас только у окон). */
.map-dock .dock-bar{box-shadow:0 8px 26px rgba(0,0,0,0.45),inset 0 0 0 1px var(--ui-line)}
.map-dock.menu-open .dock-bar{box-shadow:0 8px 26px rgba(0,0,0,0.45),inset 1px 0 var(--ui-line),inset -1px 0 var(--ui-line),inset 0 -1px var(--ui-line),inset 0 1px var(--ui-sep)}
#planshet .p-menu-body{box-shadow:inset 1px 0 var(--ui-line),inset -1px 0 var(--ui-line),inset 0 1px var(--ui-line)}
/* Выбранное везде — «линза» (бирюзовый текст + подложка 15 % + линия 30 %), скругление кнопки 10. */
.view-lens{border-radius:var(--r-btn)}
.node-dock > .tabbar .tabbar-btn.active{color:var(--ui-act);background:var(--ui-sel-bg);box-shadow:inset 0 0 0 1px var(--ui-sel-line);border-radius:var(--r-btn)}
#planshet .p-menu .p-mini[aria-pressed="true"]{color:var(--ui-act);background:var(--ui-sel-bg);box-shadow:inset 0 0 0 1px var(--ui-sel-line)}
/* Раздел с артом: подложку не видно — та же линия, плотнее; без рамки 2 px и полосы слева. */
#planshet .p-menu .tile[aria-pressed="true"]{outline:none;box-shadow:inset 0 0 0 1.5px rgba(175,238,238,0.65)}
/* Группы — карточки: подложка 4 %, белая линия, скругление 14. В шторке их две (разделы и кнопки),
   в раскрытом окне одна (маркеры). */
#planshet .p-menu-sections,#planshet .p-menu-row{border-radius:var(--r-card);background:var(--ui-card);box-shadow:inset 0 0 0 1px var(--ui-line)}
#planshet .p-menu-row{gap:0;padding:4px;margin-top:4px}
#planshet .p-menu .p-menu-section{border-radius:var(--r-btn)}
.node-links-cols{margin:4px 4px 0;padding:6px;border-radius:var(--r-card);background:var(--ui-card);box-shadow:inset 0 0 0 1px var(--ui-line)}
/* Кнопки внутри — без своих подложек (как вкладки и панель карты). */
#planshet .p-menu .p-mini,#planshet .p-menu .p-menu-ship{min-height:52px;padding:4px 2px;gap:3px;border-radius:var(--r-btn);background:none;box-shadow:none}
/* Подписи под значками — одна: 12 px / 600 (было 10 во вкладках, 11 на панели, 12 / 400 в шторке). */
.dock-label,.tabbar-btn-label,#planshet .p-menu .p-mini{font-size:var(--ui-label);font-weight:600;line-height:15px}
.link-chip-caption{font-size:11px;font-family:inherit}
/* Строка окна: название — шрифтом заголовков (Tektur), как «Феном» на панели карты; родитель — приглушённым. */
.node-strip-title{font-family:'Tektur',system-ui,sans-serif;font-size:15px;font-weight:600;letter-spacing:0.01em}
.node-crumb{color:var(--ui-muted);font-size:13px}
.node-strip-open,.node-crumb{border-radius:var(--r-btn)}
/* Компьютер: значок слева, подпись 14 px справа — как уже на панели карты. */
@media (min-width:1000px){
  /* Вкладки — своей ширины, как режимы панели карты на компьютере: «линза» не растягивается на 240 px. */
  .node-dock > .tabbar .tabbar-btn{flex:0 0 auto;flex-direction:row;gap:8px;min-height:48px;padding:0 18px}
  .node-dock > .tabbar .tabbar-btn-label{font-size:14px;line-height:18px}
  .node-dock > .tabbar .toolbar-close-btn{min-height:48px}
  #planshet .p-menu .p-mini,#planshet .p-menu .p-menu-ship{flex-direction:row;gap:8px;min-height:48px;font-size:14px}
}
`;

function stages() {
  const text = `<div class="mock-text">${TEXT.map(t => `<p>${t}</p>`).join('')}</div>`;
  const win = (h, cap, dock) => `<section class="stage win" style="--h:${h}px"><span class="stage-cap">${cap}</span>
    <div class="phenom-card">${text}${dock}</div></section>`;
  return `
  <section class="stage map" style="--h:330px"><span class="stage-cap">Шторка «Феном» над картой</span>
    <div id="planshet">${M.menu}</div>${M.mapDockOpen}</section>
  ${win(420, 'Окно Фенома: строка раскрыта', M.phenomeDockOpen)}
  ${win(190, 'Окно сюжета: строка свёрнута', M.storyDock)}
  ${win(170, 'Окно персонажа: три вкладки', M.charDock)}
  ${win(170, 'Окно системы', M.systemDock)}`;
}

// Место шторки, линза режима, высота раскрытой панели — то, что на сайте ставит JS.
const SCRIPT = `
<script>
addEventListener('load', () => {
  for (const st of document.querySelectorAll('.stage')) {
    const bar = st.querySelector('.dock-bar'), menu = st.querySelector('.p-menu');
    if (bar && menu) {
      const s = st.getBoundingClientRect(), b = bar.getBoundingClientRect();
      Object.assign(menu.style, {left: (b.left - s.left) + 'px', width: b.width + 'px', bottom: (s.bottom - b.top) + 'px'});
    }
    const lens = st.querySelector('.view-lens'), act = st.querySelector('.dock-modes .dock-item.active');
    if (lens && act) { lens.style.width = act.offsetWidth + 'px'; lens.style.transform = 'translateX(' + act.offsetLeft + 'px)'; }
    for (const body of st.querySelectorAll('.node-links.is-open > .node-links-body')) {
      body.style.height = body.firstElementChild.getBoundingClientRect().height + 'px';
    }
  }
  document.body.dataset.ready = '1';
});
</script>`;

function page(file, title, lead, css, fixIcons) {
  let body = stages();
  body = fixSrc(body);
  if (fixIcons) body = iconsFix(body);
  const html = `<!doctype html>
<html lang="ru"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${title}</title>
<link rel="stylesheet" href="../../../css/styles.css">
<link rel="stylesheet" href="../../../planshet/planshet.css">
<style>${FRAME}</style>
<style>${css}</style>
</head><body>
<header class="mock-head"><h1>${title}</h1><p>${lead}</p></header>
<main class="stages">${body}</main>
${SCRIPT}
</body></html>
`;
  fs.writeFileSync(path.join(OUT, file), html);
  console.log('написан', file);
}

page('mock-0-now.html', 'Сейчас', 'Настоящая разметка и стили сайта без правок — для сравнения с вариантами.', '', false);
page('mock-a-shtorka-kak-okna.html', 'Вариант А: шторка как окна',
  'Меняется только шторка: фон и ободок как у плашки окна, нижний ряд — вкладками без подложек, выбранное — только бирюзовым текстом.', VAR_A, true);
page('mock-b-okna-kak-shtorka.html', 'Вариант Б: окна как шторка',
  'Меняются плашки окон: вкладки и ✕ — отдельными кнопками с подложкой, маркеры раскрытой панели — на своей подложке.', VAR_B, true);
page('mock-c-obshie-tokeny.html', 'Вариант В: общие правила',
  'Одни значения для всех панелей: выбранное — «линза» панели карты, группы — карточки, кнопки без своих подложек, подпись 12 px.', VAR_C, true);
