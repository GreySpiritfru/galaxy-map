import {C,el,load,img,fontLink,chipList,searchAll,mentionsOf,row,rows,KIND,WHERE,wireAnchors,cardMeta,viewKind,mapLink} from './common.js?v=2';
import {inChip} from './filters.js?v=2';
import {relationGroups} from './model.js?v=2';
import {createHistory} from './history.js?v=2';
import {sectionTiles,toggleSection,currentSection} from './home.js?v=2';
import {viewImages} from '../js/viewer.js?v=219';
const LENS = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

/* Планшет в карте (с 02.11.2026, v=219 — без фрейма, прямо в #planshet). Шапки нет (владелец: верх
   занимал пол-экрана под кнопками Telegram): надпись «Феном», поиск и ▦ — в панели карты внизу
   (js/planshet.js). Поиск всплывает сверху по кнопке 🔍; разделы и фильтр по сюжету — шторка «Феном ▴»
   над панелью. «Назад» (Esc, Telegram, браузер) ведёт карта: js/navigation.js зовёт depth()/back().
   onChange — сообщить карте, что поменялось (подсветка кнопок панели, глубина «назад»). */
export function makeShell({root, renderMain, renderCard, onChange = () => {}, onHelp, onTour}) {
  const state = {chip: 'all', stack: [], kind: 'all', q: ''};
  // Обычное текстовое поле: у type="search" Android рисует свой ✕ рядом с нашим (было два крестика).
  const input = el('input', {type: 'text', inputmode: 'search', enterkeyhint: 'search', placeholder: 'Поиск по Феному', 'aria-label': 'Поиск', autocomplete: 'off'});
  const field = el('label', {class: 'p-search-field'});
  field.innerHTML = LENS;
  field.append(input);
  const searchBar = el('div', {class: 'p-search', role: 'search', hidden: true}, field,
    el('button', {class: 'p-search-x', 'aria-label': 'Закрыть поиск', onclick: () => closeSearch()}, '✕'));
  const main = el('main', {class: 'wrap main'});
  const results = el('main', {class: 'wrap results', hidden: true});
  const menu = el('div', {class: 'p-menu', role: 'dialog', 'aria-label': 'Разделы планшета', hidden: true});
  const card = el('div', {class: 'card'});
  const back = el('button', {}, '‹ Назад');
  const dock=el('nav',{class:'record-dock','aria-label':'Связи записи'});
  const panel = el('div', {class: 'sheet-panel', role: 'dialog', 'aria-modal': 'true', tabindex: '-1'},
    el('div', {class: 'sheet-bar'}, back, el('button', {'aria-label': 'Закрыть', onclick: () => closeAll()}, '✕')), card,dock);
  const sheet = el('div', {class: 'sheet', hidden: true, onclick: e => { if (e.target === sheet) closeAll(); }}, panel);
  root.append(searchBar, main, results, menu, sheet);
  fontLink();

  const setInert = on => [searchBar,main,results,menu].forEach(n=>{n.inert=on;});
  let rootSnapshot=null;
  const keyedState=()=>Object.fromEntries([...main.querySelectorAll('[data-state-key]')].map(n=>[n.dataset.stateKey,n.tagName==='DETAILS'?n.open:n.getAttribute('aria-expanded')==='true']));
  const controller=createHistory({state,panel,card,sheet,scroller:root,render:renderCard,renderDock,setInert,onChange:()=>onChange(),
    onStart(){rootSnapshot={chip:state.chip,kind:state.kind,q:state.q,scroll:root.scrollTop,opened:keyedState()};},
    onRoot(){
      if(!rootSnapshot)return;
      const saved=rootSnapshot;rootSnapshot=null;
      state.chip=saved.chip;state.kind=saved.kind;state.q=saved.q;input.value=saved.q;
      renderMain(main,state,open);onInput();
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
  const {openRecord:ownOpen,back:goBack,close:closeAll}=controller;
  /* Запись открывается окном карты (window.__mapOpenRecord, js/map.js; «назад» — сюда же); чего карта
     не знает (новость, «Эпохи Фенома») — здесь, как в макете. */
  const open=(id,anchor,opts)=>{
    closeMenu();
    const map=window.__mapOpenRecord;
    if(!map)return ownOpen(id,anchor,opts);
    Promise.resolve(map(id,anchor||'')).then(ok=>{if(!ok)ownOpen(id,anchor,opts);});
  };
  back.onclick=goBack;
  wireAnchors(card,(doc,anchor)=>{
    const id=C.byId.has(doc)?doc:C.records.find(r=>r.content.ownDocument===doc)?.id;
    if(id)open(id,anchor,{history:state.stack.at(-1)?.recordId===id?'replace':'push'});
  });
  card.addEventListener('click',e=>{
    const image=e.target.closest('figure img');
    if(!image)return;
    const list=[...card.querySelectorAll('figure img')];viewImages(list.map(n=>n.src),list.indexOf(image));
  });
  function renderDock(r) {
    back.style.visibility=state.stack.length>1?'visible':'hidden';
    const parent=C.byId.get(r.parentId),groups=relationGroups(r.id);
    const holder=el('div',{class:'dock-groups',hidden:true},groups.map(g=>el('section',{class:'dock-group','data-relation':g.key},
      el('h3',{},g.label),g.items.map(item=>{const target=C.byId.get(item.id);return target?el('button',{class:'dock-link','data-record-id':item.id,
        onclick:()=>open(item.id,item.anchor)},img(target.image,target.title),el('span',{},target.title)):null;}))));
    const total=groups.reduce((n,g)=>n+g.items.length,0);
    const title=el('button',{class:'dock-current','aria-expanded':'false',onclick(){const on=holder.hidden;holder.hidden=!on;title.setAttribute('aria-expanded',String(on));}},
      el('span',{},r.title),el('span',{class:'dock-stacks'},groups.map(g=>el('span',{'data-stack':g.key,title:g.label},({inside:'▤',allies:'♧',materials:'▱','used-in':'↗'}[g.key]||'▤')+' '+g.items.length)),total?'⌃':null));
    const onMap=mapLink(r);
    dock.replaceChildren(el('div',{class:'dock-head'},parent?el('button',{class:'dock-parent',onclick:()=>open(parent.id)},parent.shortTitle||parent.title,' ›'):null,title),holder,
      ...(onMap?[el('div',{class:'dock-actions'},onMap)]:[]));
  }

  /* ---------- шторка «Феном ▴»: разделы, сюжет, помощь ---------- */
  function renderMenu() {
    const pick = k => { closeMenu(); toggleSection(currentSection() === k ? 'all' : k); root.scrollTo(0, 0); };
    const chip = (id, label) => el('button', {'aria-pressed': String(state.chip === id), onclick() { setFilter(id, state.kind); renderMenu(); }}, label);
    menu.replaceChildren(
      el('div', {class: 'p-menu-head'}, el('h2', {}, 'Разделы'),
        el('button', {class: 'p-menu-home', 'aria-pressed': String(currentSection() === 'all'), onclick: () => pick('all')}, 'Всё — главная')),
      sectionTiles(state, pick),
      el('div', {class: 'f-group'}, el('h3', {}, 'Сюжет'), el('div', {class: 'f-opts'}, chipList().map(([id, label]) => chip(id, label)))),
      el('div', {class: 'p-menu-links'},
        onHelp ? el('button', {onclick() { closeMenu(); onHelp(); }}, '? Как пользоваться картой') : null,
        onTour ? el('button', {onclick() { closeMenu(); onTour(); }}, 'Короткая экскурсия') : null));
  }
  const isMenuOpen = () => !menu.hidden;
  function openMenu() {
    if (!C.records) return;
    hideSearch();
    renderMenu();
    menu.hidden = false;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches)
      menu.animate([{opacity: 0, transform: 'translateY(16px)'}, {opacity: 1, transform: 'none'}], {duration: 200, easing: 'cubic-bezier(.2,.7,.2,1)'});
    onChange();
  }
  function closeMenu() { if (menu.hidden) return; menu.hidden = true; onChange(); }
  const toggleMenu = () => isMenuOpen() ? closeMenu() : openMenu();
  // Тап мимо шторки (по ленте) — закрыть; по самой панели карты — её кнопки решают сами.
  root.addEventListener('pointerdown', e => { if (isMenuOpen() && !menu.contains(e.target)) closeMenu(); });

  /* ---------- поиск сверху ---------- */
  const isSearchOpen = () => !searchBar.hidden;
  function openSearch() {
    closeMenu();
    if (!isSearchOpen()) {
      searchBar.hidden = false;
      root.classList.add('searching');
      onChange();
    }
    input.focus();
  }
  // Спрятать поле, набранное не трогая (запись из результатов открылась окном поверх).
  function hideSearch() {
    if (!isSearchOpen()) return;
    searchBar.hidden = true;
    root.classList.remove('searching');
    input.blur();
    onChange();
  }
  function closeSearch() {
    if (input.value) { input.value = ''; onInput(); }
    hideSearch();
  }
  input.addEventListener('focus', () => document.body.classList.add('planshet-typing'));
  input.addEventListener('blur', () => document.body.classList.remove('planshet-typing'));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });

  // Фильтр по сюжету (шторка) и раздел (плитки): влияет и на ленту, и на поиск.
  function setFilter(chip, kind) {
    state.chip = chip; state.kind = kind;
    if (state.q.trim().length >= 2) renderResults(); else renderMain(main, state, open);
    onChange();
  }
  state.setFilter = setFilter;
  function onInput() {
    state.q = input.value;
    const busy = state.q.trim().length >= 2;
    main.hidden = busy; results.hidden = !busy;
    if (busy) renderResults();
  }
  /* Поиск — по всему планшету, раздел на него не влияет (🔍 в панели ищет везде); сюжет из шторки —
     влияет. Без полоски фильтров над результатами — строка «что отфильтровано» и «показать всё». */
  function renderResults() {
    const all = searchAll(state.q, 'all', 200).hits.map(h => ({...h, r: C.byId.get(h.id)}));
    const hits = all.filter(h => inChip(h.r, state.chip));
    const label = state.chip !== 'all' ? chipList().find(c => c[0] === state.chip)?.[1] : '';
    const out = [];
    if (label) out.push(el('p', {class: 'f-note'}, `Фильтр: ${label}. Найдено ${hits.length} из ${all.length}. `,
      all.length > hits.length ? el('button', {onclick: () => setFilter('all', state.kind)}, 'Показать всё') : null));
    if (!hits.length) out.push(el('p', {class: 'empty'}, 'Ничего не нашлось. Попробуйте имя персонажа, название места или слово из события.'));
    else {
      const hitRow = h => row(h.r, `${KIND[viewKind(h)]}, ${WHERE[h.where]}`, open);
      const topHit = hits[0], ment = topHit.where !== 'text' ? mentionsOf(topHit.id) : [];
      out.push(el('div', {class: 'group'}, el('h3', {}, 'Найдено'), el('div', {class: 'rows'}, hitRow(topHit))));
      if (ment.length && !label) out.push(el('div', {class: 'group mentions'}, el('h3', {}, `«${topHit.title}» упоминается в: ${ment.length}`),
        rows(ment.slice(0, 6), r => KIND[viewKind(r)], open),
        ment.length > 6 ? el('details', {class: 'drop'}, el('summary', {}, `Ещё ${ment.length - 6}`), rows(ment.slice(6), r => KIND[viewKind(r)], open)) : null));
      if (hits.length > 1) out.push(el('div', {class: 'group'}, el('h3', {}, 'Ещё совпадения'), el('div', {class: 'rows'}, hits.slice(1, 40).map(hitRow))));
    }
    results.replaceChildren(...out);
    root.scrollTo(0, 0);
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

  /* «Назад» карты: сначала шторка, потом своя карточка / новость, последним — поиск. */
  const depth = () => (isMenuOpen() ? 1 : 0) + (controller.getTemporary() ? 1 : 0) + state.stack.length + (isSearchOpen() ? 1 : 0);
  function backStep() {
    if (isMenuOpen()) { closeMenu(); return true; }
    if (controller.getTemporary() || state.stack.length) return goBack();
    if (isSearchOpen()) { closeSearch(); return true; }
    return false;
  }
  return {state,...controller,ready,get C(){return C;},
    openSearch, closeSearch, isSearchOpen, openMenu, closeMenu, toggleMenu, isMenuOpen,
    isSheetOpen: () => !sheet.hidden, filtered: () => state.chip !== 'all', depth, backStep};
}
export const cardHead = r => el('div',{class:'card-head'},['news','article'].includes(viewKind(r))?null:img(r.image,r.title),
 el('div',{},el('h1',{},r.title),el('div',{class:'card-meta'},cardMeta(r))));
