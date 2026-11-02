import {el} from './common.js?v=1';
let activeClose = null;
export const isViewerOpen = () => Boolean(activeClose);
export const closeViewer = () => { if (!activeClose) return false; activeClose(); return true; };
export function viewImages(srcs, i = 0) {
  closeViewer();
  srcs = srcs.filter(Boolean);
  if (!srcs.length) return;
  i = Math.max(0, Math.min(srcs.length - 1, i));
  const im = el('img', {src: srcs[i], alt: '', draggable: 'false'});
  const stage = el('div', {class: 'lb-stage'}, im);
  const count = el('div', {class: 'lb-count'});
  const many = srcs.length > 1;
  const box = el('div', {class: 'lb', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Просмотр картинки', tabindex: '-1'}, stage,
    el('button', {class: 'lb-x', 'aria-label': 'Закрыть', onclick: close}, '✕'),
    many ? [el('button', {class: 'lb-prev', 'aria-label': 'Предыдущая', onclick: () => go(-1)}, '‹'),
      el('button', {class: 'lb-next', 'aria-label': 'Следующая', onclick: () => go(1)}, '›'), count] : null);
  let s = 1, x = 0, y = 0, start = null, lastTap = 0;
  const pts = new Map();
  const apply = () => { im.style.transform = `translate(${x}px, ${y}px) scale(${s})`; };
  const clamp = v => Math.min(5, Math.max(1, v));
  function go(d) { i = (i + d + srcs.length) % srcs.length; im.src = srcs[i]; s = 1; x = y = 0; apply(); count.textContent = `${i + 1} / ${srcs.length}`; }
  const zoomAt = (ns, cx, cy) => {   // приближение к точке (cx, cy) экрана
    const r = stage.getBoundingClientRect(), ox = cx - r.left - r.width / 2, oy = cy - r.top - r.height / 2;
    x = ox - (ox - x) * ns / s; y = oy - (oy - y) * ns / s; s = ns;
    if (s === 1) x = y = 0;
    apply();
  };
  const pair = () => { const [a, b] = [...pts.values()]; return {d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2}; };
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    start = pts.size === 2 ? {...pair(), s} : {px: e.clientX, py: e.clientY, x, y};
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !start) return;
    pts.set(e.pointerId, {x: e.clientX, y: e.clientY});
    if (pts.size === 2) { const q = pair(); zoomAt(clamp(start.s * q.d / start.d), q.cx, q.cy); }
    else if (s > 1) { x = start.x + e.clientX - start.px; y = start.y + e.clientY - start.py; apply(); }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return;
    const one = pts.size === 1 && start && 'px' in start;
    pts.delete(e.pointerId);
    if (one) {
      const dx = e.clientX - start.px, dy = e.clientY - start.py;
      if (s === 1 && many && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        const now = Date.now();
        if (now - lastTap < 300) { zoomAt(s > 1 ? 1 : 2.5, e.clientX, e.clientY); lastTap = 0; } else lastTap = now;
      }
    }
    const rest = [...pts.values()][0];
    start = rest ? {px: rest.x, py: rest.y, x, y} : null;
  };
  stage.addEventListener('pointerup', up);
  stage.addEventListener('pointercancel', up);
  stage.addEventListener('wheel', e => { e.preventDefault(); zoomAt(clamp(s * (e.deltaY < 0 ? 1.15 : 1 / 1.15)), e.clientX, e.clientY); }, {passive: false});
  // Свои клавиши раньше общих (Esc иначе закрыл бы и карточку под просмотром).
  const keys = e => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
    else if (many && e.key === 'ArrowRight') { e.preventDefault(); go(1); }
    else if (many && e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
    else if (e.key === 'Tab') {
      const buttons = [...box.querySelectorAll('button')], first = buttons[0], last = buttons.at(-1);
      if (e.shiftKey && (document.activeElement === first || document.activeElement === box)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || document.activeElement === box)) { e.preventDefault(); first.focus(); }
    }
  };
  const back = document.activeElement;
  const background = [...document.body.children].filter(n => n instanceof HTMLElement).map(n => [n, n.inert]);
  function close() {
    activeClose = null; removeEventListener('keydown', keys, true); box.remove();
    for (const [n, inert] of background) n.inert = inert;
    if (back?.isConnected) back.focus?.();
  }
  addEventListener('keydown', keys, true);
  count.textContent = `${i + 1} / ${srcs.length}`;
  activeClose = close;
  for (const [n] of background) n.inert = true;
  document.body.append(box);
  box.focus();
}

