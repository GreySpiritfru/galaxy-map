import {C, el} from './common.js?v=4';
import {closeViewer} from '../js/viewer.js?v=221';

/* История записей планшета. С 02.11.2026 (v=219) планшет живёт прямо в карте, а браузерную историю,
   Esc и кнопку «назад» Telegram ведёт карта (js/navigation.js) — здесь стопка только в памяти, «назад»
   карта зовёт через back() (js/planshet.js). Своей карточкой планшет показывает только то, чего карта
   не знает: новость (в ленте) и «Эпохи Фенома». */
export function createHistory({state, panel, card, sheet, scroller, render, renderDock, setInert, renderInline, onStart, onRoot, onChange}) {
  let serial = 0, temporary = null;
  const current = () => state.stack.at(-1);
  function capture() {
    const entry = current();
    if (!entry) return;
    if (C.byId.get(entry.recordId)?.kind === 'news') {entry.readingPosition=scroller.scrollTop;return;}
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
    queueMicrotask(() => onChange?.());   // после показа: карта смотрит, открыта ли карточка
    if (!entry) {
      sheet.hidden = true; setInert(false);
      onRoot?.();
      state.rootFocus?.isConnected && state.rootFocus.focus({preventScroll:true});
      return;
    }
    const record = C.byId.get(entry.recordId);
    if (record.kind === 'news') {
      sheet.hidden=true;setInert(false);
      renderInline(record,entry,restore);return;
    }
    sheet.hidden = false; setInert(true);
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
  // Стопка обрезается до length записей и показывается верхняя.
  function goTo(length) {
    state.stack.length = Math.max(0, length);
    show(current());
  }
  function openRecord(id, anchor = null, options = {}) {
    if (!C?.byId.has(id)) return false;
    closeViewer(); capture();
    if (!state.stack.length) {state.rootFocus = document.activeElement;onStart?.();}
    const prev = current();
    if (prev?.recordId === id) {
      prev.anchor = anchor;
      if (options.tab) prev.tab = options.tab;
      show(prev, true); if(anchor)revealAnchor(anchor);
      return true;
    }
    const at = options.history !== 'replace' ? state.stack.findLastIndex(s => s.recordId === id) : -1;
    if (at >= 0) {
      goTo(at + 1);
      if (anchor) {current().anchor = anchor; show(current(),false);}
      if (options.tab) current().tab = options.tab;
      return true;
    }
    const entry = {key:++serial, recordId:id, id, anchor, tab:options.tab || 'description',
      readingPosition:0, expandedState:{}, mapState:options.mapState || null};
    if (options.history === 'replace' && state.stack.length) state.stack.splice(-1,1,entry); else state.stack.push(entry);
    show(entry,false); return true;
  }
  function back() {
    if (closeViewer()) return true;
    if (temporary) {temporary.close(); temporary=null; return true;}
    if (!state.stack.length) return false;
    capture(); goTo(state.stack.length - 1); return true;
  }
  function close() {
    closeViewer();
    if (temporary) {temporary.close();temporary=null;}
    if (!state.stack.length) return;
    capture(); goTo(0);
  }
  const setViewState = patch => {if (current()) Object.assign(current(),patch);};
  const getViewState = () => current() ? {tab:current().tab, mapState:current().mapState} : null;
  const queuedOpen = (...args) => Promise.resolve(openRecord(...args));
  return {openRecord:queuedOpen, back, close, capture, revealAnchor, setViewState, getViewState,
    setTemporary: value => {temporary=value;}, getTemporary: () => temporary};
}
