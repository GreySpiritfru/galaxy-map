// Один список на #planshet. CSS подключается отдельно, зависимостей нет.
let current = null;
let serial = 0;

export function isPickerOpen() {
  return current !== null;
}

export function closePicker() {
  if (!current) return false;
  const state = current;
  current = null;
  state.controller.abort();
  state.observer?.disconnect();
  cancelAnimationFrame(state.frame);
  state.layer.remove();
  for (const [name, value] of state.attributes) {
    if (value === null) state.anchor.removeAttribute(name);
    else state.anchor.setAttribute(name, value);
  }
  if (state.anchor.isConnected) state.anchor.focus({ preventScroll: true });
  return true;
}

/**
 * openPicker(anchor, {title, value, options: [{id, label, color?, note?, group?}], onChange})
 * Сохраняет порядок, в том числе порядок последовательных групп. Повторный вызов заменяет список.
 * closePicker возвращает boolean; Telegram BackButton подключает вызывающая сторона.
 */
export function openPicker(anchor, { title = 'Сюжет', value, options = [], onChange } = {}) {
  const root = document.getElementById('planshet');
  if (!root) throw new Error('openPicker: не найден #planshet');
  if (!anchor?.isConnected || typeof anchor.focus !== 'function') {
    throw new TypeError('openPicker: нужен подключённый к странице якорь');
  }
  closePicker();
  const controller = new AbortController();
  const { signal } = controller;
  const prefix = `p-picker-${++serial}`;
  const layer = document.createElement('div');
  layer.className = 'p-picker-layer';
  const panel = document.createElement('div');
  panel.className = 'p-picker';
  const heading = document.createElement('div');
  heading.className = 'p-picker-title';
  heading.id = `${prefix}-title`;
  heading.textContent = title;
  const list = document.createElement('div');
  list.className = 'p-picker-list';
  list.id = prefix;
  list.tabIndex = -1;
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-labelledby', heading.id);
  list.setAttribute('aria-orientation', 'vertical');
  const buttons = [];
  let groupName;
  let group;
  for (const option of options) {
    const name = option.group || '';
    if (!group || name !== groupName) {
      groupName = name;
      group = document.createElement('div');
      group.className = 'p-picker-group';
      group.setAttribute('role', 'group');
      if (name) {
        const caption = document.createElement('div');
        caption.className = 'p-picker-group-title';
        caption.id = `${prefix}-group-${buttons.length}`;
        caption.textContent = name;
        list.append(caption);
        group.setAttribute('aria-labelledby', caption.id);
      }
      list.append(group);
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'p-picker-option';
    button.tabIndex = -1;
    button.setAttribute('role', 'option');
    button.setAttribute('aria-selected', String(option.id === value));
    if (option.color && CSS.supports('color', option.color)) {
      button.style.setProperty('--picker-color', option.color);
      const dot = document.createElement('span');
      dot.className = 'p-picker-dot';
      dot.setAttribute('aria-hidden', 'true');
      button.append(dot);
    }
    const copy = document.createElement('span');
    copy.className = 'p-picker-copy';
    const label = document.createElement('span');
    label.className = 'p-picker-label';
    label.textContent = option.label;
    copy.append(label);
    if (option.note) {
      const note = document.createElement('span');
      note.className = 'p-picker-note';
      if (option.note.trim().toLocaleLowerCase('ru') === 'набор открыт') {
        note.classList.add('p-picker-recruit');
      }
      note.textContent = option.note;
      copy.append(note);
    }
    button.append(copy);
    group.append(button);
    buttons.push(button);
    button.addEventListener('click', event => {
      if (state.suppressClick) {
        event.preventDefault();
        return;
      }
      choose(option.id);
    }, { signal });
  }
  if (!buttons.length) {
    const empty = document.createElement('div');
    empty.className = 'p-picker-empty';
    empty.textContent = 'Нет сюжетов';
    list.append(empty);
  }
  panel.append(heading, list);
  layer.append(panel);
  const attributes = ['aria-haspopup', 'aria-expanded', 'aria-controls']
    .map(name => [name, anchor.getAttribute(name)]);
  const state = { anchor, layer, controller, attributes, frame: 0, suppressClick: false };
  current = state;
  anchor.setAttribute('aria-haspopup', 'listbox');
  anchor.setAttribute('aria-expanded', 'true');
  anchor.setAttribute('aria-controls', prefix);
  root.append(layer);

  function choose(id) {
    if (current !== state) return;
    try {
      onChange?.(id);
    } finally {
      // onChange может открыть другой список или сам закрыть этот.
      if (current === state) closePicker();
    }
  }

  function focusAt(index) {
    const button = buttons[index];
    if (!button) { list.focus({ preventScroll: true }); return; }
    buttons.forEach(item => { item.tabIndex = item === button ? 0 : -1; });
    button.focus({ preventScroll: true });
    // Прокручивается только список: карта и шторка остаются на месте.
    const itemRect = button.getBoundingClientRect();
    const listRect = list.getBoundingClientRect();
    if (itemRect.top < listRect.top) list.scrollTop += itemRect.top - listRect.top;
    else if (itemRect.bottom > listRect.bottom) list.scrollTop += itemRect.bottom - listRect.bottom;
  }

  function position() {
    state.frame = 0;
    if (current !== state) return;
    if (!anchor.isConnected) { closePicker(); return; }
    const viewport = window.visualViewport;
    const left = viewport?.offsetLeft || 0;
    const top = viewport?.offsetTop || 0;
    const width = viewport?.width || window.innerWidth;
    const height = viewport?.height || window.innerHeight;
    const rect = anchor.getBoundingClientRect();
    const mobile = window.innerWidth < 600;
    const gap = 8;
    const above = Math.max(0, rect.top - top - gap - 5);
    const below = Math.max(0, top + height - rect.bottom - gap - 5);
    const up = mobile || above > below;
    const available = up ? above : below;
    // У верхнего края телефона физически нет места над якорем: панель остаётся в экране.
    const maxHeight = Math.min(height * .6, available < 96 ? height - 10 : available);
    panel.style.width = `${mobile ? width - 10 : Math.min(320, width - 10)}px`;
    panel.style.maxHeight = `${Math.max(0, maxHeight)}px`;
    panel.style.left = `${mobile ? left + 5 : Math.max(left + 5, Math.min(rect.left, left + width - panel.offsetWidth - 5))}px`;
    const y = up ? rect.top - gap - panel.offsetHeight : rect.bottom + gap;
    panel.style.top = `${Math.max(top + 5, Math.min(y, top + height - panel.offsetHeight - 5))}px`;
  }
  function schedulePosition() {
    if (!state.frame) state.frame = requestAnimationFrame(position);
  }
  position();
  focusAt(Math.max(0, options.findIndex(option => option.id === value)));

  document.addEventListener('keydown', event => {
    if (current !== state) return;
    const index = buttons.indexOf(document.activeElement);
    let next;
    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        event.stopImmediatePropagation();
        closePicker();
        return;
      case 'ArrowDown': next = (index + 1) % buttons.length; break;
      case 'ArrowUp': next = (index - 1 + buttons.length) % buttons.length; break;
      case 'Home': next = 0; break;
      case 'End': next = buttons.length - 1; break;
      case 'Tab': next = (index + (event.shiftKey ? -1 : 1) + buttons.length) % buttons.length; break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        event.stopImmediatePropagation();
        if (index >= 0 && !event.repeat) choose(options[index].id);
        return;
      default: return;
    }
    event.preventDefault();
    event.stopImmediatePropagation();
    focusAt(next);
  }, { capture: true, signal });
  document.addEventListener('focusin', event => {
    if (!panel.contains(event.target)) {
      focusAt(Math.max(0, buttons.findIndex(button => button.tabIndex === 0)));
    }
  }, { signal });
  document.addEventListener('pointerdown', event => {
    if (!panel.contains(event.target)) {
      event.preventDefault();
      closePicker();
    }
  }, { capture: true, signal });

  let gesture = null;
  panel.addEventListener('pointerdown', event => {
    state.suppressClick = false;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY };
  }, { signal, passive: true });
  document.addEventListener('pointermove', event => {
    if (gesture?.id === event.pointerId && Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) {
      state.suppressClick = true;
    }
  }, { signal, passive: true });
  document.addEventListener('pointerup', event => {
    if (gesture?.id !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 8) state.suppressClick = true;
    gesture = null;
  }, { signal, passive: true });
  document.addEventListener('pointercancel', () => {
    if (gesture) state.suppressClick = true;
    gesture = null;
  }, { signal, passive: true });
  list.addEventListener('scroll', () => {
    if (gesture) state.suppressClick = true;
  }, { signal, passive: true });
  window.addEventListener('resize', schedulePosition, { signal, passive: true });
  window.addEventListener('scroll', event => {
    if (!panel.contains(event.target)) schedulePosition();
  }, { capture: true, signal, passive: true });
  window.visualViewport?.addEventListener('resize', schedulePosition, { signal, passive: true });
  window.visualViewport?.addEventListener('scroll', schedulePosition, { signal, passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    state.observer = new ResizeObserver(schedulePosition);
    state.observer.observe(anchor);
    state.observer.observe(panel);
  }
}
