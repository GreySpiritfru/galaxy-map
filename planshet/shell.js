import {C,el,load,fontLink,chipList,searchAll,mentionsOf,row,rows,KIND,viewKind} from './common.js?v=15';
import {inChip} from './filters.js?v=15';
import {createHistory} from './history.js?v=15';
import {sectionMenu,toggleSection,currentSection} from './home.js?v=15';
const FILTER_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16l-6.2 7.4V19l-3.6-1.8v-4.8z"/></svg>';
const HELP_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.5"/><circle class="dot" cx="12" cy="16.8" r=".6"/></svg>';
const LENS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* Планшет в карте (с 02.11.2026, v=219 — без фрейма, прямо в #planshet). Шапки нет (владелец: верх
   занимал пол-экрана под кнопками Telegram): надпись «Феном», поиск и ▦ — в панели карты внизу
   (js/planshet.js). Поиск всплывает сверху по кнопке 🔍; разделы и фильтр по сюжету — шторка «Феном ▴»
   над панелью. «Назад» (Esc, Telegram, браузер) ведёт карта: js/navigation.js зовёт depth()/back().
   onChange — сообщить карте, что поменялось (подсветка кнопок панели, глубина «назад»).
   С v=222 своей карточки записи нет (владелец): всё — окнами карты, новость — в ленте.
   С v=227 шторка и поиск открываются и над картой (js/planshet.js, .over-map): onShip/shipIcon — первый пункт
   шторки «Схема корабля Феном»; onLeave — перейти в «Ноды», когда показать надо ленту (раздел, новость из поиска).
   tools — кнопка вида в ряду сюжетов (v=229: на карте «Меньше подписей», в «Нодах» «Граф связей»; js/planshet.js). */
export function makeShell({root, renderMain, onChange = () => {}, onHelp, onTour, onShip, shipIcon, onLeave = () => {}, tools, onMenuOpen}) {
  const state = {chip: 'all', stack: [], kind: 'all', q: ''};
  // Обычное текстовое поле: у type="search" Android рисует свой ✕ рядом с нашим (было два крестика).
  const input = el('input', {type: 'text', inputmode: 'search', enterkeyhint: 'search', placeholder: 'Поиск по Феному', 'aria-label': 'Поиск', autocomplete: 'off'});
  const field = el('label', {class: 'p-search-field'});
  field.innerHTML = LENS;
  /* v=223 (разбор Codex): «Очистить» (✕ в поле, только когда набрано) и «Готово» (убрать клавиатуру,
     результаты остаются; пустой запрос — закрыть поиск) — раздельно. Закрыть поиск — ещё и 🔍 в панели. */
  const clear = el('button', {class: 'p-search-clear', type: 'button', 'aria-label': 'Очистить', hidden: true,
    onclick: e => { e.preventDefault(); input.value = ''; onInput(); input.focus(); }}, '✕');
  field.append(input, clear);
  const searchBar = el('div', {class: 'p-search', role: 'search', hidden: true}, field,
    el('button', {class: 'p-search-done', type: 'button', onclick: () => { input.blur(); if (!input.value.trim()) closeSearch(); }}, 'Готово'));
  const main = el('main', {class: 'wrap main'});
  const results = el('main', {class: 'wrap results', hidden: true});
  const menu = el('div', {class: 'p-menu', id: 'planshetMenu', role: 'dialog', 'aria-label': 'Разделы планшета', tabindex: '-1', hidden: true});
  root.append(searchBar, main, results, menu);
  fontLink();

  let rootSnapshot=null;
  const keyedState=()=>Object.fromEntries([...main.querySelectorAll('[data-state-key]')].map(n=>[n.dataset.stateKey,n.tagName==='DETAILS'?n.open:n.getAttribute('aria-expanded')==='true']));
  const controller=createHistory({state,scroller:root,onChange:()=>onChange(),
    onStart(){rootSnapshot={chip:state.chip,kind:state.kind,q:state.q,search:isSearchOpen(),scroll:root.scrollTop,opened:keyedState()};},
    onRoot(){
      if(!rootSnapshot)return;
      const saved=rootSnapshot;rootSnapshot=null;
      state.chip=saved.chip;state.kind=saved.kind;state.q=saved.q;input.value=saved.q;
      renderMain(main,state,open);
      if(saved.search)showSearchBar();
      onInput();
      for(const n of main.querySelectorAll('[data-state-key]')) {
        const on=saved.opened[n.dataset.stateKey];
        if(on===undefined)continue;
        if(n.tagName==='DETAILS')n.open=on;
        else if((n.getAttribute('aria-expanded')==='true')!==on)n.click();
      }
      root.scrollTo(0,saved.scroll);
    },
    renderInline(r,entry,restore){
      hideSearch();
      input.value='';state.q='';state.chip='all';state.kind='news';
      main.hidden=false;results.hidden=true;
      renderMain(main,state,open);
      main.prepend(el('button',{class:'inline-back',onclick:()=>goBack()},'‹ Назад'));
      const head=main.querySelector(`[data-state-key="${CSS.escape('news:'+r.id)}"]`);
      if(head){if(head.getAttribute('aria-expanded')!=='true')head.click();head.scrollIntoView({block:'center'});}
      if(restore)root.scrollTo(0,entry.readingPosition||0);
    }
  });
  const {openRecord:ownOpen,back:goBack}=controller;
  /* Запись открывается окном карты (window.__mapOpenRecord, js/map.js; «назад» — сюда же); чего карта
     не знает (новость) — раскрывается в ленте. */
  const open=(id,anchor)=>{
    closeMenu();
    remember(id);
    Promise.resolve(window.__mapOpenRecord?.(id,anchor||'')).then(ok=>{if(!ok)return Promise.resolve(onLeave()).then(()=>ownOpen(id));});
  };
  /* ---------- шторка «Феном ▴» (v=231, владелец): своей плашкой «На главную» и разделы (3 × 2), под ней четыре
     кнопки в ряд — схема корабля, вид («Граф связей» / «Меньше подписей»), сюжет ▾, «Как пользоваться картой». ---------- */
  function renderMenu() {
    const pick = k => {
      closeMenu();
      if (currentSection() !== k) { toggleSection(k); root.scrollTo(0, 0); }
      onLeave();
    };
    // ⚠️ replaceChildren (DOM), не el(): null он вывел бы текстом «null» — поэтому filter(Boolean).
    menu.replaceChildren(...[
      sectionMenu(state, pick),
      el('div', {class: 'p-menu-row'}, onShip ? shipButton() : null, tools ? tools() : null, storySelect(),
        onHelp ? el('button', {class: 'p-mini', 'aria-label': 'Как пользоваться картой', onclick() { closeMenu(); onHelp(); }}, icon(HELP_SVG), el('span', {}, 'Обучение')) : null),
    ].filter(Boolean));
  }
  const icon = svg => { const n = el('span', {class: 'p-mini-icon', 'aria-hidden': 'true'}); n.innerHTML = svg; return n; };
  // Фильтр по сюжету — выпадающий список (v=230). Видна подпись выбранного, сам <select> — прозрачный поверх кнопки.
  function storySelect() {
    const list = chipList();
    const sel = el('select', {'aria-label': 'Сюжет', onchange() { setFilter(sel.value, state.kind); renderMenu(); }},
      list.map(([id, label]) => el('option', {value: id}, id === 'all' ? 'Все сюжеты' : label)));
    sel.value = state.chip;
    // Подпись — одно слово (v=232, владелец): «Фильтры», а выбран сюжет — его название (не влезло — «…»).
    const label = state.chip === 'all' ? 'Фильтры' : list.find(c => c[0] === state.chip)?.[1] || 'Фильтры';
    return el('label', {class: 'p-mini p-select'}, icon(FILTER_SVG), el('span', {}, label), sel);
  }
  // Схема корабля (до v=227 — своя кнопка на панели, теперь путь к ней через шторку).
  function shipButton() {
    const pic = el('span', {class: 'p-mini-icon p-ship-icon', 'aria-hidden': 'true'}, '🚀');
    shipIcon?.().then(m => { if (m && pic.isConnected) { m.setAttribute('aria-hidden', 'true'); pic.replaceChildren(m); } });
    return el('button', {class: 'p-mini p-menu-ship', 'aria-label': 'Схема корабля Феном', onclick() { closeMenu(); onShip(); }}, pic, el('span', {}, 'Схема'));
  }
  const isMenuOpen = () => !menu.hidden;
  /* Фокус (v=225, разбор Codex): открылась шторка — фокус на неё (клавиатура, TalkBack/VoiceOver), закрылась —
     обратно на кнопку, которой открывали («Феном ▴»), если фокус был внутри шторки. На касаниях не видно. */
  let menuOpener = null;
  function openMenu() {
    if (!C.records) return;
    hideSearch();
    renderMenu();
    menuOpener = document.activeElement;
    menu.hidden = false;
    menu.focus({preventScroll: true});
    if (onMenuOpen) onMenuOpen(menu);
    else if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      menu.animate([{opacity: 0, transform: 'translateY(16px)'}, {opacity: 1, transform: 'none'}], {duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)'});
    onChange();
  }
  function closeMenu() {
    if (menu.hidden) return;
    const inside = menu.contains(document.activeElement);
    menu.hidden = true;
    if (inside && menuOpener?.isConnected) menuOpener.focus({preventScroll: true});
    onChange();
  }
  const toggleMenu = () => isMenuOpen() ? closeMenu() : openMenu();
  // Тап мимо шторки (по ленте) — закрыть; по самой панели карты — её кнопки решают сами.
  root.addEventListener('pointerdown', e => { if (isMenuOpen() && !menu.contains(e.target)) closeMenu(); });

  /* ---------- поиск сверху ---------- */
  /* v=223 (замечания владельца + разбор Codex, notes/ui-plan.md): поиск открыт — вместо ленты его экран:
     до 2 букв — где ищем, подсказка и недавно открытое; дальше — совпадения в названии/именах, потом в тексте
     с отрывком, «где упоминается» — свёрнуто в конце. Панель карты при наборе не прячется (v=222). */
  const isSearchOpen = () => !searchBar.hidden;
  function showSearchBar() {
    if (isSearchOpen()) return;
    searchBar.hidden = false;
    root.classList.add('searching');
    onChange();
  }
  function openSearch() {
    closeMenu();
    showSearchBar();
    onInput();
    input.focus();
  }
  // Спрятать поле, набранное не трогая (новость из результатов раскрылась в ленте).
  function hideSearch() {
    if (!isSearchOpen()) return;
    searchBar.hidden = true;
    root.classList.remove('searching');
    input.blur();
    main.hidden = false; results.hidden = true;
    onChange();
  }
  function closeSearch() {
    if (input.value) { input.value = ''; state.q = ''; }
    hideSearch();
  }
  const toggleSearch = () => isSearchOpen() ? closeSearch() : openSearch();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });

  // Недавно открытые из планшета — у этого браузера (localStorage), до 8.
  const RECENT_KEY = 'planshetRecent';
  const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter(id => C.byId?.has(id)); } catch { return []; } };
  function remember(id) {
    if (!C.byId?.has(id)) return;
    try { localStorage.setItem(RECENT_KEY, JSON.stringify([id, ...recent().filter(x => x !== id)].slice(0, 8))); } catch {}
  }

  // Фильтр по сюжету (шторка) и раздел (плитки): влияет и на ленту, и на поиск.
  function setFilter(chip, kind) {
    state.chip = chip; state.kind = kind;
    if (isSearchOpen()) renderResults(); else renderMain(main, state, open);
    onChange();
  }
  state.setFilter = setFilter;
  let lastQuery = null;
  function onInput() {
    state.q = input.value;
    clear.hidden = !state.q;
    const on = isSearchOpen();
    main.hidden = on; results.hidden = !on;
    if (on) renderResults();
  }
  // Где ищем: везде или в сюжете из шторки (и как вернуть «везде»).
  function scopeLine(found, total) {
    const story = state.chip !== 'all' ? chipList().find(c => c[0] === state.chip)?.[1] : '';
    const count = found == null ? '' : `: найдено ${found}${story && total > found ? ` из ${total}` : ''}`;
    return el('p', {class: 'p-scope'}, story ? `Ищу в сюжете «${story}»${count}. ` : `Ищу везде${count}`,
      story ? el('button', {onclick: () => setFilter('all', state.kind)}, 'Искать везде') : null);
  }
  // Отрывок текста вокруг первого совпадения, совпадение выделено.
  const norm = t => String(t || '').toLowerCase().replace(/ё/g, 'е');
  function snippet(r, q) {
    const text = [r.summary, r.text].filter(Boolean).join(' ').replace(/\s+/g, ' ');
    const low = norm(text);
    const stems = norm(q).split(/[^\p{L}\p{N}]+/u).filter(w => w.length >= 2).map(w => w.length > 4 ? w.slice(0, -2) : w);
    let at = -1, len = 0;
    for (const t of stems) { const i = low.indexOf(t); if (i >= 0 && (at < 0 || i < at)) { at = i; len = t.length; } }
    if (at < 0) return null;
    let end = at + len;
    while (end < text.length && /[\p{L}\p{N}]/u.test(text[end])) end++;
    const from = Math.max(0, at - 40), to = Math.min(text.length, end + 70);
    return el('span', {class: 'p-snip'}, from ? '…' : '', text.slice(from, at), el('mark', {}, text.slice(at, end)), text.slice(end, to), to < text.length ? '…' : '');
  }
  const group = (title, kids) => el('section', {class: 'group'}, el('h3', {}, title), kids);
  // Первые n строк, остальное — по кнопке «Показать ещё N» (v=225: раньше лишнее просто не показывалось).
  function listMore(list, n, make) {
    const box = el('div', {class: 'rows'}, list.slice(0, n).map(make));
    if (list.length > n) {
      const more = el('button', {class: 'p-more', onclick() { more.replaceWith(...list.slice(n).map(make)); }}, `Показать ещё ${list.length - n}`);
      box.append(more);
    }
    return box;
  }
  function renderResults() {
    const q = state.q.trim();
    const out = [];
    if (q.length < 2) {
      out.push(scopeLine(), el('p', {class: 'p-hint'}, 'Наберите хотя бы 2 буквы: имя персонажа, место, слово из события.'));
      const last = recent().map(id => C.byId.get(id));
      if (last.length) out.push(group('Недавно открытые', rows(last, r => KIND[viewKind(r)], open)));
      else {
        const popular = C.records.filter(r => ['story', 'place', 'character'].includes(viewKind(r)))
          .sort((a, b) => (C.pop[b.id] || 0) - (C.pop[a.id] || 0)).slice(0, 6);
        out.push(group('Чаще всего упоминаются', rows(popular, r => KIND[viewKind(r)], open)));
      }
    } else {
      const all = searchAll(q, 'all', 200).hits.map(h => ({...h, r: C.byId.get(h.id)}));
      const hits = all.filter(h => inChip(h.r, state.chip));
      out.push(scopeLine(hits.length, all.length));
      /* Порядок внутри групп (владелец 02.11): статьи → сюжеты → маркеры и системы → Феном (районы, здания) →
         события → персонажи последними; точное совпадение названия — всё равно первым. */
      const RANK = {article: 0, story: 1, place: 2, system: 2, zone: 3, building: 3, news: 4, character: 5};
      // Точное совпадение названия или имени (псевдонима: «Гил», «Спирит») — первым.
      const exact = h => [h.r.title, ...(h.r.aliases || [])].some(t => norm(t) === norm(q));
      const rank = h => (exact(h) ? -1 : RANK[viewKind(h.r)] ?? 4);
      const ordered = [...hits].sort((a, b) => rank(a) - rank(b) || b.score - a.score);
      const named = ordered.filter(h => h.where !== 'text'), inText = ordered.filter(h => h.where === 'text');
      if (!hits.length) out.push(el('p', {class: 'empty'}, 'Ничего не нашлось. Попробуйте имя персонажа, название места или слово из события.'));
      if (named.length) out.push(group('В названии и именах', listMore(named, 20, h => row(h.r, KIND[viewKind(h)], open))));
      if (inText.length) out.push(group('В тексте', listMore(inText, 10, h => {
        const snip = snippet(h.r, q);
        return row(h.r, [KIND[viewKind(h)], snip ? [': ', snip] : null], open);
      })));
      // «Где упоминается» лучшее совпадение по названию — свёрнуто, после основного.
      const top = named[0], ment = top ? mentionsOf(top.id) : [];
      if (ment.length) out.push(el('details', {class: 'drop p-mentions'},
        el('summary', {}, el('span', {}, `Где упоминается «${top.r.title}»`), el('span', {class: 'count'}, String(ment.length))),
        rows(ment, r => KIND[viewKind(r)], open)));
    }
    results.replaceChildren(...out);
    // Наверх — только когда запрос сменился (не при возврате из окна и не при смене сюжета).
    if (q !== lastQuery) root.scrollTo(0, 0);
    lastQuery = q;
  }
  input.addEventListener('input', onInput);

  // До загрузки данных поиск недоступен; набранное до этого — пересчитать.
  input.disabled = true;
  input.placeholder = 'Загрузка…';
  const ready=load().then(() => {
    input.disabled = false;
    input.placeholder = 'Поиск по Феному';
    renderMain(main, state, open);
    if (input.value) onInput();
    onChange();
  }).catch(err => {
    console.error(err);
    main.replaceChildren(el('p', {class: 'empty'}, `Планшет не загрузился: ${err.message}`));
  });

  /* «Назад» карты: сначала шторка, потом новость, последним — поиск. */
  const depth = () => (isMenuOpen() ? 1 : 0) + state.stack.length + (isSearchOpen() ? 1 : 0);
  function backStep() {
    if (isMenuOpen()) { closeMenu(); return true; }
    if (state.stack.length) return goBack();
    if (isSearchOpen()) { closeSearch(); return true; }
    return false;
  }
  return {state,ready,get C(){return C;},
    openSearch, closeSearch, toggleSearch, isSearchOpen, openMenu, closeMenu, toggleMenu, isMenuOpen,
    filtered: () => state.chip !== 'all', depth, backStep};
}
