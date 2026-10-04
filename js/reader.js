/* ============================================================
   Своя копия статей (01.10.2026) — читалка для articles/ репозитория.

   Статьи справочника, статьи точек и анкеты персонажей раньше открывались
   чужой страницей (iframe с teletype.in / telegra.ph): Teletype падает, свою
   прокрутку не показывает (плашка окна не могла уехать), фон не наш, плашку
   Teletype приходилось прятать под панелью. Теперь копию держит бот
   (server/article_mirror.py): articles/index.json — адрес → файл, в файле
   заголовок и содержимое узлами {"t": тег, ..., "c": [дети]}, строки — текст.
   Нет копии (новая анкета, бот ещё не забрал) — вызывающий показывает iframe,
   как раньше.

   Безопасность: содержимое пишут игроки на чужом сайте, поэтому HTML из него
   НЕ вставляется — DOM строится по белому списку тегов, текст через
   textContent, ссылки только http(s) и #якорь, картинки только наши
   (articles/img/<хеш>.webp).
   ============================================================ */

import { fetchT } from './net.js?v=203';

const INDEX_URL = 'articles/index.json';
const ANCHOR_RE = /^[A-Za-z0-9_-]{1,40}$/;
const IMG_RE = /^articles\/img\/[0-9a-f]{16}\.webp$/;

/* Ключ в index.json: https, хост в нижнем регистре, без #якоря, ?параметров
   и / на конце. То же самое — normalize_url в server/article_mirror.py. */
export function normalizeUrl(url) {
  try {
    const u = new URL(String(url || '').trim());
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return '';
    return `https://${u.host.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch (e) { return ''; }
}

export function anchorOf(url) {
  try {
    const a = decodeURIComponent(new URL(url).hash.slice(1));
    return ANCHOR_RE.test(a) ? a : '';
  } catch (e) { return ''; }
}

// Индекс — один раз за сессию (без кэша браузера: бот обновляет его сам).
// Не скачался — попробуем снова при следующем открытии статьи.
let indexPromise = null;
function loadIndex() {
  if (!indexPromise) {
    indexPromise = fetchT(INDEX_URL, {cache: 'no-cache'}, 10000)
      .then(r => (r.status === 404 ? {} : r.json()))
      .then(d => (d && d.articles) || {})
      .catch(() => { indexPromise = null; return {}; });
  }
  return indexPromise;
}

export async function mirrorOf(url) {
  const key = normalizeUrl(url);
  if (!key) return null;
  const index = await loadIndex();
  return index[key] || null;
}

// Файл статьи с хешем в адресе: изменилась статья — изменился адрес, и
// кэш GitHub Pages (10 минут) не покажет старую.
const docs = new Map();
function loadDoc(entry) {
  // Файл копии — только из articles/ (v=202, укрепление: адрес берётся из
  // index.json, а грузить чужой адрес незачем).
  if (typeof entry.file !== 'string' || !/^articles\/(tt|tg)\/[\w.@\/-]+\.json$/.test(entry.file) || entry.file.includes('..')) {
    return Promise.reject(new Error('bad file'));
  }
  const src = `${entry.file}?h=${encodeURIComponent(entry.hash || '')}`;
  if (!docs.has(src)) {
    docs.set(src, fetchT(src).then(r => {
      if (!r.ok) throw new Error(String(r.status));
      return r.json();
    }).catch(e => { docs.delete(src); throw e; }));
  }
  return docs.get(src);
}

/* ---------- Узлы → DOM, строго по белому списку ---------- */
const INLINE = {strong: 'strong', em: 'em', s: 's', u: 'u', code: 'code'};
const BLOCK = {p: 'p', h2: 'h2', h3: 'h3', h4: 'h4', blockquote: 'blockquote', pre: 'pre', li: 'li'};

function build(nodes, parent) {
  if (!Array.isArray(nodes)) return;
  for (const n of nodes) {
    if (typeof n === 'string') parent.appendChild(document.createTextNode(n));
    else if (n && typeof n === 'object') {
      const el = element(n);
      if (el) parent.appendChild(el);
    }
  }
}

function linkEl(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.dataset.mirrorLink = '1';
  if (text != null) a.textContent = text;
  return a;
}

function safeHref(href) {
  if (typeof href !== 'string') return '';
  if (href.startsWith('#')) return ANCHOR_RE.test(href.slice(1)) ? href : '';
  return /^https?:\/\//i.test(href) ? href : '';
}

function element(n) {
  const t = n.t;
  let el = null;
  if (Object.prototype.hasOwnProperty.call(INLINE, t)) {
    el = document.createElement(INLINE[t]);
    build(n.c, el);
  } else if (t === 'br') {
    return document.createElement('br');
  } else if (t === 'a') {
    const href = safeHref(n.href);
    el = href ? linkEl(href) : document.createElement('span');
    build(n.c, el);
  } else if (Object.prototype.hasOwnProperty.call(BLOCK, t)) {
    el = document.createElement(BLOCK[t]);
    if (n.align === 'center' || n.align === 'right') el.classList.add('is-' + n.align);
    build(n.c, el);
  } else if (t === 'ul' || t === 'ol') {
    el = document.createElement(t);
    build(n.c, el);
  } else if (t === 'hr') {
    el = document.createElement('hr');
  } else if (t === 'figure') {
    if (typeof n.src !== 'string' || !IMG_RE.test(n.src)) return null;
    el = document.createElement('figure');
    const img = document.createElement('img');
    img.alt = '';
    img.loading = 'lazy';
    img.decoding = 'async';
    // Размер заранее — место под картинку есть до загрузки, текст не прыгает
    // (и прокрутка к якорю не промахивается).
    if (n.w > 0 && n.h > 0) { img.width = n.w; img.height = n.h; }
    img.src = n.src;
    el.appendChild(img);
    if (Array.isArray(n.cap)) {
      const cap = document.createElement('figcaption');
      build(n.cap, cap);
      el.appendChild(cap);
    }
  } else if (t === 'section') {
    el = document.createElement('section');
    el.className = 'mirror-box';
    if (Number.isFinite(n.hue)) el.style.setProperty('--box-hue', String(Math.round(n.hue)));
    if (Number.isFinite(n.sat)) el.style.setProperty('--box-sat', Math.round(n.sat) + '%');
    build(n.c, el);
  } else if (t === 'toc') {
    el = document.createElement('nav');
    el.className = 'mirror-toc';
    const ul = document.createElement('ul');
    for (const it of Array.isArray(n.items) ? n.items : []) {
      if (!it || !ANCHOR_RE.test(it.a || '')) continue;
      const li = document.createElement('li');
      li.className = 'lvl-' + Math.min(3, Math.max(1, it.l | 0));
      li.appendChild(linkEl('#' + it.a, String(it.x || '')));
      ul.appendChild(li);
    }
    el.appendChild(ul);
  } else if (t === 'embed') {
    const href = safeHref(n.href);
    if (!href) return null;
    el = document.createElement('p');
    el.appendChild(linkEl(href, 'Встроенное содержимое ↗'));
  } else {
    return null;
  }
  if (typeof n.id === 'string' && ANCHOR_RE.test(n.id)) el.dataset.anchor = n.id;
  return el;
}

// Внешняя ссылка: t.me — внутри Telegram, прочее — его браузером или новой
// вкладкой. Общая с окном точки (кнопки набора, js/node-window.js).
export function openExternal(href) {
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg && tg.platform && tg.platform !== 'unknown') {
    if (/^https:\/\/t\.me\//i.test(href) && tg.openTelegramLink) { tg.openTelegramLink(href); return; }
    if (tg.openLink) { tg.openLink(href); return; }
  }
  window.open(href, '_blank', 'noopener');
}

/* Прокрутить контейнер к блоку с якорем: блок встаёт сразу под верхний
   отступ контейнера (под плашку окна / шторку справочника). Прокрутку ставит
   код — уезжающая плашка не должна принять её за жест (__ignoreScrollUntil,
   см. wireDockAutoHide в node-window.js). */
export function scrollToAnchor(scroller, anchor) {
  if (!scroller || !anchor || !ANCHOR_RE.test(anchor)) return false;
  const el = scroller.querySelector(`[data-anchor="${anchor}"]`);
  if (!el) return false;
  // Якорь на первом блоке статьи (ссылки справочника вели на него, чтобы у
  // Teletype уезжала его шапка) — не прокручиваем: иначе прячется заголовок.
  if (el.previousElementSibling && el.previousElementSibling.tagName === 'H1') return false;
  // Окно или модал в этот момент ещё может проигрывать появление (scale 0.94–
  // 0.96): экранные расстояния сжаты, а scrollTop — в обычных px. Без поправки
  // длинная статья недокручивала на сотни px (раздел рас — на 490).
  const box = scroller.getBoundingClientRect();
  const scale = box.height && scroller.offsetHeight ? box.height / scroller.offsetHeight : 1;
  const top = (el.getBoundingClientRect().top - box.top) / scale + scroller.scrollTop;
  const pad = parseFloat(getComputedStyle(scroller).paddingTop) || 0;
  scroller.__ignoreScrollUntil = performance.now() + 250;
  scroller.scrollTop = Math.max(0, top - pad);
  return true;
}

function dateRu(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${m[3]}.${m[2]}.${m[1]}` : '';
}

/* Статья по адресу — готовый <article> (ещё не вставленный) или null, если
   своей копии нет. scroller — контейнер с прокруткой: в нём ищутся якоря по
   ссылкам «#…» внутри статьи. */
export async function renderMirror(url, scroller) {
  const entry = await mirrorOf(url);
  if (!entry) return null;
  const doc = await loadDoc(entry);
  const art = document.createElement('article');
  art.className = 'mirror-article';
  const h1 = document.createElement('h1');
  h1.textContent = doc.title || entry.title || '';
  art.appendChild(h1);
  build(doc.c, art);
  const foot = document.createElement('p');
  foot.className = 'mirror-source';
  const when = dateRu(doc.updated || entry.updated);
  foot.textContent = when ? `Копия от ${when} · ` : 'Копия · ';
  const src = safeHref(doc.source);
  if (src) {
    // Именно на сайт автора, а не в нашу же копию.
    const orig = linkEl(src, 'оригинал ↗');
    orig.dataset.external = '1';
    foot.appendChild(orig);
  }
  art.appendChild(foot);

  // Ссылки: #якорь — прокрутка здесь же; статья, у которой есть копия, —
  // событие наружу (js/articles.js решает, где её открыть); остальное —
  // во внешнем браузере / браузере Telegram.
  art.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-mirror-link]');
    if (!a || !art.contains(a)) return;
    e.preventDefault();
    const href = a.getAttribute('href') || '';
    if (href.startsWith('#')) { scrollToAnchor(scroller, href.slice(1)); return; }
    if (a.dataset.external) { openExternal(href); return; }
    mirrorOf(href).then(found => {
      if (found) window.dispatchEvent(new CustomEvent('mirror-open', {detail: {url: href}}));
      else openExternal(href);
    });
  });
  return art;
}
