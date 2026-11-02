import {C,el,load,img,fontLink,fontBar,chipList,searchAll,mentionsOf,row,rows,KIND,KIND_MANY,WHERE,wireAnchors,cardMeta,viewKind} from './common.js?v=1';
import {MODES,inChip,inMode} from './filters.js?v=1';
import {relationGroups} from './model.js?v=1';
import {createHistory} from './history.js?v=1';
import {viewImages,isViewerOpen} from './viewer.js?v=1';
const FUNNEL = '<svg viewBox="0 0 24 24" width="18" height="18"><path d="M4 5h16l-6 7.5V19l-4 1.5v-8z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
const LENS = '<svg viewBox="0 0 24 24" width="18" height="18"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M15.5 15.5 21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';

export function makeShell({renderMain, renderCard, strip = true, filter = false, modes = MODES, title = 'Феном'}) {
  const state = {chip: 'all', stack: [], kind: 'all', q: ''};
  const input = el('input', {type: 'search', placeholder: 'Поиск', 'aria-label': 'Поиск', autocomplete: 'off'});
  const search = el('label', {class: 'tg-search'});
  search.innerHTML = LENS;
  const clear = el('button', {class: 'clear', 'aria-label': 'Очистить', onclick: e => { e.preventDefault(); input.value = ''; onInput(); }}, '✕');
  search.append(input, clear);
  const chips = el('nav', {class: 'strip', 'aria-label': 'Сюжеты'});
  // Фильтр (N4): вместо полоски сюжетов — кнопка справа от поиска, выпадающий выбор
  // «сюжет + раздел»; влияет и на главную, и на поиск.
  const fbtn = el('button', {class: 'filter-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-label': 'Фильтр'});
  fbtn.innerHTML = FUNNEL;
  const fmenu = el('div', {class: 'filter-menu', role: 'dialog', 'aria-label': 'Фильтр', hidden: true});
  const fbox = el('div', {class: 'filter-box'}, fbtn, fmenu);
  const top = el('header', {class: 'top'}, el('div', {class: 'wrap'},
    el('div', {class: 'brand'}, el('span', {class: 'brand-name'}, title), search, filter ? fbox : null), strip && !filter ? chips : null));
  const main = el('main', {class: 'wrap main'});
  const results = el('main', {class: 'wrap results', hidden: true});
  function close(){return closeAll();}
  const card = el('div', {class: 'card'});
  const back = el('button', {}, '‹ Назад');
  const dock=el('nav',{class:'record-dock','aria-label':'Связи записи'});
  const panel = el('div', {class: 'sheet-panel', role: 'dialog', 'aria-modal': 'true', tabindex: '-1'},
    el('div', {class: 'sheet-bar'}, back, el('button', {'aria-label': 'Закрыть', onclick: close}, '✕')), card,dock);
  const sheet = el('div', {class: 'sheet', hidden: true, onclick: e => { if (e.target === sheet) close(); }}, panel);
  document.body.append(top, main, results, sheet);
  fontLink();
  fontBar();

  const setInert = on => [top,main,results,document.querySelector('.mock-tools')].filter(Boolean).forEach(n=>{n.inert=on;});
  let rootSnapshot=null;
  const keyedState=()=>Object.fromEntries([...main.querySelectorAll('[data-state-key]')].map(n=>[n.dataset.stateKey,n.tagName==='DETAILS'?n.open:n.getAttribute('aria-expanded')==='true']));
  const controller=createHistory({state,panel,card,sheet,render:renderCard,renderDock,setInert,
    onStart(){rootSnapshot={chip:state.chip,kind:state.kind,q:state.q,scroll:scrollY,opened:keyedState()};},
    onRoot(){
      if(!rootSnapshot)return;
      const saved=rootSnapshot;rootSnapshot=null;
      state.chip=saved.chip;state.kind=saved.kind;state.q=saved.q;input.value=saved.q;
      renderFilter();renderMain(main,state,open);onInput();
      for(const n of main.querySelectorAll('[data-state-key]')) {
        const on=saved.opened[n.dataset.stateKey];
        if(on===undefined)continue;
        if(n.tagName==='DETAILS')n.open=on;
        else if((n.getAttribute('aria-expanded')==='true')!==on)n.click();
      }
      scrollTo(0,saved.scroll);
    },
    renderInline(r,entry,restore){
      input.value='';state.q='';state.chip='all';state.kind='news';
      search.classList.remove('has-text');main.hidden=false;results.hidden=true;
      renderFilter();renderMain(main,state,open);
      main.prepend(el('button',{class:'inline-back',onclick:()=>goBack()},'‹ Назад'));
      const head=main.querySelector(`[data-state-key="${CSS.escape('news:'+r.id)}"]`);
      if(head){if(head.getAttribute('aria-expanded')!=='true')head.click();head.scrollIntoView({block:'center'});}
      if(restore)scrollTo(0,entry.readingPosition||0);
    }
  });
  const {openRecord:ownOpen,back:goBack,close:closeAll}=controller;
  /* Планшет внутри карты (02.11.2026): запись открывается окном карты (openRecord карты,
     «назад» — сюда же); чего карта не знает (новость) — здесь, как в макете. */
  const host=window.parent!==window?window.parent:null;
  const open=(id,anchor,opts)=>{
    const map=host&&host.__mapOpenRecord;
    if(!map)return ownOpen(id,anchor,opts);
    Promise.resolve(map(id,anchor||'')).then(ok=>{if(!ok)ownOpen(id,anchor,opts);});
  };
  back.onclick=goBack;
  addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(!fmenu.hidden){e.preventDefault();e.stopImmediatePropagation();showMenu(false);fbtn.focus();return;}
    if(controller.getTemporary() || isViewerOpen() || state.stack.length) {e.preventDefault(); e.stopImmediatePropagation();goBack();}
  });
  wireAnchors(card,(doc,anchor)=>{
    const id=C.byId.has(doc)?doc:C.records.find(r=>r.content.ownDocument===doc)?.id;
    if(id)open(id,anchor,{history:state.stack.at(-1)?.recordId===id?'replace':'push'});
  });
  card.addEventListener('click',e=>{
    const image=e.target.closest('figure img');
    if(!image)return;
    const list=[...card.querySelectorAll('figure img')];viewImages(list.map(n=>n.src),list.indexOf(image));
  });
  function showStub(label) {
    const root=el('div',{class:'stub-dialog',role:'dialog','aria-modal':'true','aria-label':label},el('div',{},el('h2',{},label),
      el('p',{},'Заглушка N6. Права, сохранение, sendData и управление картами пока не подключены. Правки не отправляются.'),
      el('button',{onclick:()=>goBack()},'Закрыть')));
    const focus=document.activeElement;
    document.body.append(root);panel.inert=true;root.querySelector('button').focus();
    controller.setTemporary({close(){root.remove();panel.inert=false;focus?.isConnected&&focus.focus({preventScroll:true});}});
  }
  function renderDock(r) {
    back.style.visibility=state.stack.length>1?'visible':'hidden';
    const parent=C.byId.get(r.parentId),groups=relationGroups(r.id);
    const holder=el('div',{class:'dock-groups',hidden:true},groups.map(g=>el('section',{class:'dock-group','data-relation':g.key},
      el('h3',{},g.label),g.items.map(item=>{const target=C.byId.get(item.id);return target?el('button',{class:'dock-link','data-record-id':item.id,
        onclick:()=>open(item.id,item.anchor)},img(target.image,target.title),el('span',{},target.title)):null;}))));
    const total=groups.reduce((n,g)=>n+g.items.length,0);
    const title=el('button',{class:'dock-current','aria-expanded':'false',onclick(){const on=holder.hidden;holder.hidden=!on;title.setAttribute('aria-expanded',String(on));}},
      el('span',{},r.title),el('span',{class:'dock-stacks'},groups.map(g=>el('span',{'data-stack':g.key,title:g.label},({inside:'▤',allies:'♧',materials:'▱','used-in':'↗'}[g.key]||'▤')+' '+g.items.length)),total?'⌃':null));
    dock.replaceChildren(el('div',{class:'dock-head'},parent?el('button',{class:'dock-parent',onclick:()=>open(parent.id)},parent.shortTitle||parent.title,' ›'):null,title),holder,
      el('div',{class:'dock-actions'},r.mapTargets.length?el('button',{onclick:()=>showStub('Показать на карте')},'На карте'):null,
        el('button',{onclick:()=>showStub('Правка · заглушка')},'Правка · заглушка'),el('span',{class:'stub'},'Сохранение и sendData не подключены')));
  }

  const showMenu = on => { fmenu.hidden = !on; fbtn.setAttribute('aria-expanded', String(on)); };
  fbtn.onclick = () => showMenu(fmenu.hidden);
  addEventListener('click', e => { if (!fmenu.hidden && !fbox.contains(e.target)) showMenu(false); });
  addEventListener('keydown', e => { if (e.key === 'Escape' && !fmenu.hidden) { showMenu(false); fbtn.focus(); } });
  // Выбор применяется сразу; меню остаётся открытым — можно поменять обе части.
  function setFilter(chip, kind) {
    state.chip = chip; state.kind = kind;
    renderFilter();
    if (state.q.trim().length >= 2) renderResults(); else renderMain(main, state, open);
  }
  function renderFilter() {
    const group = (name, list, cur, pick) => el('div', {class: 'f-group'}, el('h3', {}, name),
      el('div', {class: 'f-opts'}, list.map(([id, label]) => el('button', {'aria-pressed': String(cur === id), onclick: () => pick(id)}, label))));
    const on = state.chip !== 'all' || state.kind !== 'all';
    fbtn.classList.toggle('on', on);
    fmenu.replaceChildren(
      group('Сюжет', chipList(), state.chip, id => setFilter(id, state.kind)),
      group('Раздел', modes, state.kind, id => setFilter(state.chip, id)),
      on ? el('button', {class: 'f-reset', onclick: () => setFilter('all', 'all')}, 'Сбросить фильтр') : null);
  }
  state.setFilter = setFilter;
  function renderChips() {
    chips.replaceChildren(...chipList().map(([id, label]) => el('button', {class: 'seg-item', 'aria-pressed': String(state.chip === id),
      onclick() { state.chip = id; renderChips(); renderMain(main, state, open); }}, label)));
  }
  function onInput() {
    state.q = input.value;
    search.classList.toggle('has-text', !!state.q);
    const busy = state.q.trim().length >= 2;
    main.hidden = busy; results.hidden = !busy;
    if (busy) renderResults();
  }
  function renderResults() {
    if (filter) return renderFiltered();
    const {counts, hits} = searchAll(state.q, state.kind);
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    const kinds = ['story', 'news', 'place', 'building', 'character', 'article'].filter(k => counts[k]);
    const filters = el('div', {class: 'filters'}, [['all', `Всё ${total}`], ...kinds.map(k => [k, `${KIND_MANY[k]} ${counts[k]}`])]
      .map(([k, label]) => el('button', {'aria-pressed': String(state.kind === k), onclick() { state.kind = k; renderResults(); }}, label)));
    const out = [filters];
    if (!hits.length) out.push(el('p', {class: 'empty'}, 'Ничего не нашлось. Попробуйте имя персонажа, название места или слово из события.'));
    else {
      const topHit = hits[0];
      const ment = topHit.where !== 'text' ? mentionsOf(topHit.id) : [];
      // Сначала лучший результат, под ним — где он упоминается, потом остальное (Codex, 01.11).
      const hitRow = h => row(C.byId.get(h.id), `${KIND[viewKind(h)]}, ${WHERE[h.where]}`, open);
      out.push(el('div', {class: 'group'}, el('h3', {}, 'Найдено'), el('div', {class: 'rows'}, hitRow(topHit))));
      if (ment.length && state.kind === 'all') out.push(el('div', {class: 'group mentions'}, el('h3', {}, `«${topHit.title}» упоминается в: ${ment.length}`),
        rows(ment.slice(0, 6), r => KIND[viewKind(r)], open),
        ment.length > 6 ? el('details', {class: 'drop'}, el('summary', {}, `Ещё ${ment.length - 6}`), rows(ment.slice(6), r => KIND[viewKind(r)], open)) : null));
      if (hits.length > 1) out.push(el('div', {class: 'group'}, el('h3', {}, 'Ещё совпадения'), el('div', {class: 'rows'}, hits.slice(1).map(hitRow))));
    }
    results.replaceChildren(...out);
    scrollTo(0, 0);
  }
  // Поиск с кнопкой-фильтром: без полоски фильтров над результатами — строка
  // «что отфильтровано» и «показать всё», если фильтр что-то спрятал.
  function renderFiltered() {
    const all = searchAll(state.q, 'all', 200).hits.map(h => ({...h, r: C.byId.get(h.id)}));
    const hits = all.filter(h => inMode(h.r,state.kind) && inChip(h.r, state.chip));
    const label = [state.chip !== 'all' && chipList().find(c => c[0] === state.chip)?.[1], state.kind !== 'all' && modes.find(m => m[0] === state.kind)?.[1]].filter(Boolean).join(', ');
    const out = [];
    if (label) out.push(el('p', {class: 'f-note'}, `Фильтр: ${label}. Найдено ${hits.length} из ${all.length}. `,
      all.length > hits.length ? el('button', {onclick: () => setFilter('all', 'all')}, 'Показать всё') : null));
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
    scrollTo(0, 0);
  }
  input.addEventListener('input', () => { if (!filter) state.kind = 'all'; onInput(); });

  // До загрузки данных поиск недоступен; набранное до этого — пересчитать.
  input.disabled = true;
  input.placeholder = 'Загрузка…';
  const ready=load().then(() => {
    input.disabled = false;
    input.placeholder = 'Поиск';
    renderChips(); if (filter) renderFilter(); renderMain(main, state, open);
    new ResizeObserver(()=>document.documentElement.style.setProperty('--top-h',top.offsetHeight+'px')).observe(top);
    if (input.value) onInput();
  }).catch(err => {
    console.error(err);
    main.replaceChildren(el('p', {class: 'empty'}, `Не загрузилось: ${err.message}. Откройте через локальный сервер в корне карты.`));
  });
  return {state,...controller,ready,get C(){return C;}};
}
export const cardHead = r => el('div',{class:'card-head'},['news','article'].includes(viewKind(r))?null:img(r.image,r.title),
 el('div',{},el('h1',{},r.title),el('div',{class:'card-meta'},cardMeta(r))));
