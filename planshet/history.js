import {C} from './common.js?v=42';

/* «Назад» внутри планшета. С 02.11.2026 (v=219) браузерную историю, Esc и кнопку «назад» Telegram ведёт карта
   (js/navigation.js зовёт back()), здесь — стопка в памяти. С v=222 своей карточки у планшета нет (владелец):
   все записи — окнами карты, «Эпохи Фенома» — статья карты (lore/epochs). Здесь осталась только новость —
   раскрывается в ленте (renderInline), «назад» возвращает ленту как была (onStart/onRoot). */
export function createHistory({state, scroller, renderInline, onStart, onRoot, onChange}) {
  const current = () => state.stack.at(-1);
  function capture() {
    const entry = current();
    if (entry) entry.readingPosition = scroller.scrollTop;
  }
  function show(entry, restore = true) {
    queueMicrotask(() => onChange?.());
    if (!entry) { onRoot?.(); return; }
    renderInline(C.byId.get(entry.recordId), entry, restore);
  }
  function openRecord(id) {
    if (C.byId.get(id)?.kind !== 'news') return false;
    capture();
    if (!state.stack.length) onStart?.();
    if (current()?.recordId === id) { show(current(), true); return true; }
    const at = state.stack.findLastIndex(s => s.recordId === id);
    if (at >= 0) state.stack.length = at + 1;
    else state.stack.push({recordId: id, readingPosition: 0});
    show(current(), false);
    return true;
  }
  function back() {
    if (!state.stack.length) return false;
    state.stack.pop();
    show(current());
    return true;
  }
  return {openRecord: (...args) => Promise.resolve(openRecord(...args)), back};
}
