/* ============================================================
   Найденное в тексте (02.11.2026, v=241; владелец). Запись из поиска «В тексте» открывается окном карты, а это
   ищет в открытом окне то же слово (те же правила, что у отрывка в результатах — planshet/shell.js snippet),
   прокручивает к совпадению и коротко подсвечивает его (гаснет через ~2 с). Сверху — строка как в Telegram:
   ▲ ▼ «2 из 7» ✕; на последнем совпадении ▼ ведёт к следующей записи из результатов, на первом ▲ — к предыдущей
   (nav.next / nav.prev от планшета). Строка уходит вместе с окном.
   ============================================================ */
import { closeTopLayer } from './navigation.js?v=245';

const LAYERS = ['modalBackdrop', 'charOverlay', 'storyOverlay', 'phenomOverlay', 'systemOverlay'];
const SKIP = 'script, style, button, .node-dock, .tabbar, .lore-toolbar, .find-bar';
const norm = t => String(t || '').toLowerCase().replace(/ё/g, 'е');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Основы слов запроса — как в отрывке результатов: от 2 букв, у длинных без окончания.
function pattern(q) {
  const stems = norm(q).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2).map(w => w.length > 4 ? w.slice(0, -2) : w);
  if (!stems.length) return null;
  return new RegExp(stems.map(w => esc(w).replace(/е/g, '[её]') + '[\\p{L}\\p{N}]*').join('|'), 'giu');
}

// Верхнее открытое окно — по z-index.
function topLayer() {
  const open = LAYERS.map(id => document.getElementById(id)).filter(n => n?.classList.contains('open'));
  return open.sort((a, b) => (+getComputedStyle(b).zIndex || 0) - (+getComputedStyle(a).zIndex || 0))[0] || null;
}

// Обернуть совпадения в <mark>; только видимый текст (скрытая вкладка не прокрутится).
function markAll(root, re) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      if (!p || !n.nodeValue.trim() || p.closest(SKIP) || p.closest('mark.find-hit')) return NodeFilter.FILTER_REJECT;
      return p.getClientRects().length ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  const marks = [];
  for (const node of nodes) {
    const text = node.nodeValue, found = [...text.matchAll(re)];
    if (!found.length) continue;
    const frag = document.createDocumentFragment();
    let at = 0;
    for (const m of found) {
      frag.append(text.slice(at, m.index));
      const mark = document.createElement('mark');
      mark.className = 'find-hit';
      mark.textContent = m[0];
      frag.append(mark);
      marks.push(mark);
      at = m.index + m[0].length;
    }
    frag.append(text.slice(at));
    node.replaceWith(frag);
  }
  return marks;
}

let current = null;   // {root, marks, bar, observer, i}

function cleanup() {
  if (!current) return;
  const {marks, bar, observer} = current;
  current = null;
  observer.disconnect();
  bar.remove();
  for (const m of marks) {
    if (!m.isConnected) continue;
    const parent = m.parentNode;
    m.replaceWith(document.createTextNode(m.textContent));
    parent.normalize();
  }
}

function button(cls, label, text, onclick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = cls;
  b.setAttribute('aria-label', label);
  b.textContent = text;
  b.onclick = onclick;
  return b;
}

function show(i) {
  const c = current;
  if (!c) return;
  c.i = i;
  c.marks.forEach(m => m.classList.remove('find-cur'));
  const m = c.marks[i];
  for (let d = m.parentElement.closest('details:not([open])'); d; d = d.parentElement?.closest('details:not([open])')) d.open = true;
  // Длинный пункт анкеты свёрнут («Читать полностью», js/sheet-card.js) — развернуть его же кнопкой.
  const long = m.closest('.pc-long:not(.open)');
  if (long) { const more = long.nextElementSibling; if (more?.classList.contains('pc-more')) more.click(); else long.classList.add('open'); }
  void m.offsetWidth;          // перезапуск вспышки на том же месте
  m.classList.add('find-cur');
  m.scrollIntoView({block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
  c.count.textContent = `${i + 1} из ${c.marks.length}`;
  const more = i === c.marks.length - 1 ? c.nav.next : i === 0 ? c.nav.prev : null;
  c.more.textContent = more ? (more === c.nav.next ? 'дальше: ' : 'назад: ') + more.title : '';
  c.more.hidden = !more;
  c.prev.disabled = i === 0 && !c.nav.prev;
  c.next.disabled = i === c.marks.length - 1 && !c.nav.next;
}

function step(d) {
  const c = current;
  if (!c) return;
  const j = c.i + d;
  if (j >= 0 && j < c.marks.length) return show(j);
  const go = d > 0 ? c.nav.next : c.nav.prev;
  // Соседняя запись — вместо текущей, а не поверх: «назад» потом ведёт к результатам поиска.
  if (go) { cleanup(); closeTopLayer(); go.go(); }
}

/* q — запрос; nav = {next?: {title, go}, prev?: {title, go}, last?: true — начать с последнего совпадения}.
   Ждёт, пока окно отрисует текст (статья качается отдельно), до 4 с. */
export async function findInRecord(q, nav = {}) {
  cleanup();
  const re = pattern(q);
  if (!re) return false;
  let root = null, marks = [];
  for (let t = 0; t < 4000 && !marks.length; t += 120) {
    await new Promise(r => setTimeout(r, t ? 120 : 60));
    root = topLayer();
    if (root) marks = markAll(root, re);
  }
  if (!marks.length) return false;
  const bar = document.createElement('div');
  bar.className = 'find-bar';
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Найдено в тексте');
  const prev = button('find-prev', 'Предыдущее', '▲', () => step(-1));
  const next = button('find-next', 'Следующее', '▼', () => step(1));
  const count = document.createElement('span');
  count.className = 'find-count';
  const more = document.createElement('span');
  more.className = 'find-more';
  bar.append(prev, next, count, more, button('find-close', 'Закрыть поиск по тексту', '✕', cleanup));
  document.body.append(bar);
  // Окно закрыли или в нём открылась другая запись (совпадения пропали со страницы) — строка уходит.
  const observer = new MutationObserver(() => {
    if (!root.classList.contains('open') || !marks[0].isConnected) cleanup();
  });
  observer.observe(root, {attributes: true, attributeFilter: ['class'], childList: true, subtree: true});
  current = {root, marks, bar, observer, nav, prev, next, count, more, i: 0};
  show(nav.last ? marks.length - 1 : 0);
  return true;
}
