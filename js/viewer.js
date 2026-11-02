/* ============================================================
   Просмотр картинок «как в Telegram» (02.11.2026, v=223; шаг 4 notes/ui-plan.md, писал Codex по брифу
   notes/briefs/2026-11-02-photoswipe.md): ядро PhotoSwipe 5.4.4 (MIT, своя копия js/vendor/photoswipe/),
   грузится вместе с css при первом открытии. Листание пальцем, свайп вниз и тап по фону — закрыть, щипок и
   двойной тап — приближение, кнопка закрытия внизу. Esc и «назад» (BackButton Telegram, браузер) ведёт
   js/navigation.js через isViewerOpen/closeViewer и событие viewer-change; своей истории у просмотра нет.
   До v=223 — свой просмотр из макета N6 (сменял картинку без анимации, ✕ справа вверху).
   ============================================================ */
let active = null;
let assets = null;
const sizes = new Map();
const galleries = new WeakSet();
export const isViewerOpen = () => Boolean(active);
export function closeViewer() {
  if (!active) return false;
  const session = active;
  session.afterClose = null;
  session.closeRequested = true;
  if (session.pswp) session.pswp.close();
  else finish(session);
  return true;
}

function finish(session) {
  if (active !== session) return;
  active = null;
  for (const [node, inert] of session.background) node.inert = inert;
  if (session.focus?.isConnected) session.focus.focus({preventScroll: true});
  document.dispatchEvent(new Event('viewer-change'));
  session.afterClose?.();
}

function loadAssets() {
  if (!assets) {
    const css = new Promise((resolve, reject) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('./vendor/photoswipe/photoswipe.css', import.meta.url).href;
      link.onload = resolve;
      link.onerror = () => { link.remove(); reject(new Error('PhotoSwipe CSS failed to load')); };
      document.head.append(link);
    });
    assets = Promise.all([import('./vendor/photoswipe/photoswipe.esm.min.js'), css])
      .then(([module]) => module.default)
      .catch(error => { assets = null; throw error; });
  }
  return assets;
}

function dimensions(src) {
  if (!sizes.has(src)) {
    const pending = new Promise((resolve, reject) => {
      const img = new Image();
      const done = ok => {
        clearTimeout(timer);
        img.onload = img.onerror = null;
        if (ok && img.naturalWidth && img.naturalHeight) {
          resolve({width: img.naturalWidth, height: img.naturalHeight});
        } else reject(new Error('Image dimensions unavailable'));
      };
      const timer = setTimeout(() => done(false), 15000);
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = src;
    });
    sizes.set(src, pending);
    pending.catch(() => { if (sizes.get(src) === pending) sizes.delete(src); });
  }
  return sizes.get(src);
}

async function slideData(item) {
  const data = typeof item === 'string' ? {src: item} : {...item};
  const width = Number(data.width || data.w), height = Number(data.height || data.h);
  if (width > 0 && height > 0 && Number.isFinite(width) && Number.isFinite(height)) {
    return {...data, width, height};
  }
  try { return {...data, ...await dimensions(data.src)}; }
  catch {
    // Keep a failed slide in order, without inventing its aspect ratio.
    return {html: '<div class="pswp__error-msg-container"><p class="pswp__error-msg">Картинка не загрузилась</p></div>'};
  }
}

// Strings remain supported for planshet/. New callers may pass {src, w, h, alt}.
export function viewImages(srcs, i = 0) {
  const items = srcs.filter(item => typeof item === 'string' ? item : item?.src);
  if (!items.length) return;
  if (active) {
    const previous = active;
    closeViewer();
    if (active === previous) {
      previous.afterClose = () => viewImages(srcs, i);
      return;
    }
  }
  const session = {pswp: null, focus: document.activeElement, background: []};
  active = session;
  document.dispatchEvent(new Event('viewer-change'));
  /* v=225 (владелец: «выбранная ждёт остальных — нехорошо»): ждём только библиотеку и размер ВЫБРАННОЙ картинки.
     У остальных, чей размер не известен из данных (w/h статьи), — временный размер экрана, а настоящий
     подставляется по загрузке (refreshSlideContent). Раньше Promise.all ждал загрузки всей галереи. */
  const index = Math.max(0, Math.min(items.length - 1, Math.trunc(i) || 0));
  const known = item => {
    const d = typeof item === 'string' ? {src: item} : {...item};
    const w = Number(d.width || d.w), h = Number(d.height || d.h);
    return w > 0 && h > 0 && Number.isFinite(w) && Number.isFinite(h) ? {...d, width: w, height: h} : null;
  };
  const dataSource = items.map(known);
  const later = dataSource.map((d, k) => !d && k !== index);
  Promise.all([loadAssets(), dataSource[index] || slideData(items[index])]).then(([PhotoSwipe, first]) => {
    if (active !== session) return; // Back or a newer request cancelled loading.
    dataSource[index] = first;
    later.forEach((wait, k) => {
      if (wait) dataSource[k] = {src: typeof items[k] === 'string' ? items[k] : items[k].src, width: innerWidth, height: innerHeight};
    });
    // Resolve calc()/max() safe-area variables as actual lengths.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;padding-top:var(--safe-top,0px);padding-bottom:var(--safe-bottom,0px)';
    document.body.append(probe);
    const padding = () => {
      const style = getComputedStyle(probe);
      return {top: (parseFloat(style.paddingTop) || 0) + 60,
        bottom: (parseFloat(style.paddingBottom) || 0) + 76, left: 8, right: 8};
    };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pswp = new PhotoSwipe({
      dataSource, index,
      // Фон сплошной, как в Telegram (при свайпе вниз светлеет сам); Esc и фокус ведёт navigation.js / finish().
      mainClass: 'map-pswp', bgOpacity: 1, escKey: false, returnFocus: false,
      closeOnVerticalDrag: true, pinchToClose: true, wheelToZoom: true,
      bgClickAction: 'close', imageClickAction: 'zoom', doubleTapAction: 'zoom',
      tapAction: (_point, event) => {
        if (!event.target.closest('.pswp__img')) pswp.close();
      },
      close: false, zoom: false, paddingFn: padding,
      showHideAnimationType: 'fade',
      showAnimationDuration: reduced ? 0 : 200, hideAnimationDuration: reduced ? 0 : 200,
      closeTitle: 'Закрыть', arrowPrevTitle: 'Предыдущая', arrowNextTitle: 'Следующая',
      errorMsg: 'Картинка не загрузилась'
    });
    session.pswp = pswp;
    // Core ignores close() until its opening transition has finished.
    pswp.on('openingAnimationEnd', () => { if (session.closeRequested) pswp.close(); });
    pswp.on('afterInit', () => {
      pswp.element.setAttribute('aria-label', 'Просмотр картинок');
      pswp.element.setAttribute('aria-modal', 'true');
    });
    pswp.on('uiRegister', () => pswp.ui.registerElement({
      name: 'bottom-close', isButton: true, appendTo: 'root', title: 'Закрыть просмотр',
      html: '✕', onClick: 'close'
    }));
    pswp.on('destroy', () => { probe.remove(); finish(session); });
    session.background = [...document.body.children]
      .filter(node => node instanceof HTMLElement && node !== probe)
      .map(node => [node, node.inert]);
    for (const [node] of session.background) node.inert = true;
    try { pswp.init(); }
    catch (error) { pswp.destroy(); throw error; }
    // Размеры остальных — по мере загрузки, не задерживая открытие.
    later.forEach((wait, k) => {
      if (!wait) return;
      slideData(items[k]).then(real => {
        if (active !== session || pswp.isDestroying) return;
        dataSource[k] = real;
        pswp.refreshSlideContent(k);
      });
    });
  }).catch(error => {
    finish(session);
    console.warn('Не удалось открыть просмотр картинок', error);
  });
}

export function imageData(img) {
  return {src: img.currentSrc || img.src, alt: img.alt || '',
    width: Number(img.getAttribute('width')) || img.naturalWidth,
    height: Number(img.getAttribute('height')) || img.naturalHeight};
}

// Delegation also covers images inserted asynchronously, once per container.
export function wireImageGallery(root, selector = 'figure img, .story-banner-img') {
  if (galleries.has(root)) return;
  galleries.add(root);
  root.addEventListener('click', event => {
    const img = event.target.closest(selector);
    if (event.defaultPrevented || !img || !root.contains(img) || img.closest('a, button')) return;
    const images = [...root.querySelectorAll(selector)].filter(node => !node.closest('a, button'));
    event.preventDefault();
    viewImages(images.map(imageData), images.indexOf(img));
  });
}
