import {C, el} from './common.js?v=1';
import {closeViewer, isViewerOpen} from './viewer.js?v=1';

export function createHistory({state, panel, card, sheet, render, renderDock, setInert, renderInline, onStart, onRoot}) {
  const session = 'n6-' + Date.now(), entries = new Map();
  let serial = 0, browserIndex = 0, pending = null, temporary = null;
  const current = () => state.stack.at(-1);
  const nativeState = () => ({n6:session, index:browserIndex, keys:state.stack.map(s => s.key)});
  history.replaceState(nativeState(), '');
  function capture() {
    const entry = current();
    if (!entry) return;
    if (C.byId.get(entry.recordId)?.kind === 'news') {entry.readingPosition=scrollY;return;}
    if (sheet.hidden) return;
    entry.readingPosition = panel.scrollTop;
    entry.expandedState = {};
    for (const n of card.querySelectorAll('[data-state-key]')) {
      entry.expandedState[n.dataset.stateKey] = n.tagName === 'DETAILS' ? n.open : n.classList.contains('open') || n.getAttribute('aria-expanded') === 'true';
    }
    entry.returnFocus = document.activeElement;
  }
  function revealAnchor(anchor) {
    if (!anchor) return;
    const target = card.querySelector(`[data-anchor="${CSS.escape(anchor)}"]`);
    if (!target) {
      card.prepend(el('p', {class:'broken', role:'status'}, 'Раздел не найден в этом документе: ' + anchor));
      return;
    }
    for (let n = target.parentElement; n && n !== card; n = n.parentElement) {
      if (n.tagName === 'DETAILS') n.open = true;
      if (n.classList.contains('pc-long')) {
        n.classList.add('open');
        const button = card.querySelector(`[data-expand-key="${CSS.escape(n.dataset.stateKey)}"]`);
        if (button) {button.textContent = 'Свернуть'; button.setAttribute('aria-expanded','true');}
      }
    }
    target.scrollIntoView({block:'start'});
  }
  function show(entry, restore = true) {
    if (!entry) {
      sheet.hidden = true; setInert(false); document.body.style.overflow = '';
      onRoot?.();
      state.rootFocus?.isConnected && state.rootFocus.focus({preventScroll:true});
      return;
    }
    const record = C.byId.get(entry.recordId);
    if (record.kind === 'news') {
      sheet.hidden=true;setInert(false);document.body.style.overflow='';
      renderInline(record,entry,restore);return;
    }
    sheet.hidden = false; setInert(true); document.body.style.overflow = 'hidden';
    card.replaceChildren(...[render(record, queuedOpen, entry.anchor)].flat(Infinity).filter(Boolean));
    renderDock(record, entry);
    panel.scrollTop = 0;
    if (restore) {
      for (const n of card.querySelectorAll('[data-state-key]')) {
        const on = entry.expandedState?.[n.dataset.stateKey];
        if (on === undefined) continue;
        if (n.tagName === 'DETAILS') n.open = on;
        else if (n.classList.contains('pc-long')) {
          n.classList.toggle('open',on);
          const button = card.querySelector(`[data-expand-key="${CSS.escape(n.dataset.stateKey)}"]`);
          if (button) {button.textContent = on ? 'Свернуть' : 'Читать полностью'; button.setAttribute('aria-expanded',String(on));}
        } else if ((n.getAttribute('aria-expanded') === 'true') !== on) n.click();
      }
      panel.scrollTop = entry.readingPosition || 0;
    } else revealAnchor(entry.anchor);
    panel.focus({preventScroll:true});
    if (restore && entry.returnFocus?.isConnected && panel.contains(entry.returnFocus)) entry.returnFocus.focus({preventScroll:true});
  }
  function goTo(index) {
    if (index === browserIndex) return Promise.resolve();
    return new Promise(resolve => {pending = resolve; history.go(index - browserIndex);});
  }
  async function openRecord(id, anchor = null, options = {}) {
    if (!C?.byId.has(id)) return false;
    if (pending) throw new Error('N6: переход ещё выполняется');
    closeViewer(); capture();
    if (!state.stack.length) {state.rootFocus = document.activeElement;onStart?.();}
    const prev = current();
    if (prev?.recordId === id) {
      prev.anchor = anchor;
      if (options.tab) prev.tab = options.tab;
      show(prev, true); if(anchor)revealAnchor(anchor); history.replaceState(nativeState(),'');
      return true;
    }
    const ancestor = options.history !== 'replace' ? state.stack.findLast(s => s.recordId === id) : null;
    if (ancestor) {
      await goTo(ancestor.browserIndex);
      if (anchor) {current().anchor = anchor; show(current(),false);}
      if (options.tab) current().tab = options.tab;
      return true;
    }
    const replace = options.history === 'replace' && state.stack.length > 0;
    const entry = {key:++serial, recordId:id, id, anchor, tab:options.tab || 'description',
      readingPosition:0, expandedState:{}, mapState:options.mapState || null,
      browserIndex:replace ? browserIndex : browserIndex + 1};
    entries.set(entry.key,entry);
    if (replace) state.stack.splice(-1,1,entry); else {state.stack.push(entry); browserIndex++;}
    history[replace ? 'replaceState' : 'pushState'](nativeState(),'');
    show(entry,false); return true;
  }
  async function back() {
    if (closeViewer()) return true;
    if (temporary) {temporary.close(); temporary=null; return true;}
    if (!state.stack.length) return false;
    capture(); await goTo(Math.max(0,browserIndex-1)); return true;
  }
  async function close() {
    closeViewer();
    if (temporary) {temporary.close();temporary=null;}
    if (!state.stack.length) return;
    capture(); await goTo(0);
  }
  addEventListener('popstate', event => {
    const target = event.state;
    if (isViewerOpen() || temporary) {
      closeViewer(); temporary?.close();temporary=null;
      history.pushState(nativeState(),'');
    } else if (target?.n6 === session) {
      capture(); browserIndex=target.index;
      state.stack=target.keys.map(k=>entries.get(k)).filter(Boolean);show(current());
    } else {
      state.stack=[];browserIndex=0;show(null);history.replaceState(nativeState(),'');
    }
    const resolve=pending;pending=null;resolve?.();
  });
  const setViewState = patch => {if (current()) Object.assign(current(),patch);};
  const getViewState = () => current() ? {tab:current().tab, mapState:current().mapState} : null;
  let transition=Promise.resolve();
  const serialize=fn=>(...args)=>{
    const task=transition.then(()=>fn(...args));
    transition=task.catch(()=>{});return task;
  };
  const queuedOpen=serialize(openRecord);
  return {openRecord:queuedOpen, back:serialize(back), close:serialize(close), capture, revealAnchor, setViewState, getViewState,
    setTemporary: value => {temporary=value;}, getTemporary: () => temporary};
}
