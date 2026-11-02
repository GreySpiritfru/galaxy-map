/* Injected into the checker only. No imports or production-page changes. */
(() => {
  const q = s => document.querySelector(s);
  const need = (ok, message) => { if (!ok) throw Error(message); };
  const shown = e => {
    if (!e || !e.getClientRects().length) return false;
    for (let n = e; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (n.hidden || s.display === 'none' || s.visibility !== 'visible' || +s.opacity === 0) return false;
    }
    return true;
  };
  const panels = '#phenomOverlay.open, #storyOverlay.open, #charOverlay.open, #systemOverlay.open';
  const root = () => q('#planshet');
  const state = () => ({
    tablet: document.body.classList.contains('planshet-on') && shown(root()),
    tabletHidden: root()?.hidden === true,
    overMap: shown(root()) && root().classList.contains('over-map'),
    map: !!q('.view-switch-btn.active[data-view="map"]'),
    mapVisible: !document.body.classList.contains('planshet-on') && shown(q('.svg-widget > svg')),
    menu: shown(q('#planshetMenu')), search: shown(q('.p-search')),
    window: !!q(panels), viewer: !!q('.pswp'),
    ship: shown(q('#phenomOverlay.open.map-view')),
    graph: !document.body.classList.contains('planshet-on') && !!q('svg.nodes-mode') && shown(q('#graphLayer')),
    graphics: !document.body.classList.contains('planshet-on') && !!q('svg.graphics-mode'),
    query: q('.p-search input')?.value, scroll: root()?.scrollTop,
    section: shown(q('#planshet .sec-back')),
    ready: !!q('#planshet .p-search input:not(:disabled)'),
    results: !!q('#planshet .results:not([hidden]) button.row'),
  });
  const saved = {};
  window.__uiCheck = {
    state,
    // No scrolling here: a panel outside the viewport must fail the tap.
    point(selector) {
      const e = q(selector);
      need(shown(e) && !e.closest('[inert]') && !e.disabled, 'Недоступна цель: ' + selector);
      // Tap the actual backdrop, away from the menu and dock.
      if (selector === '#planshet') {
        const r = e.getBoundingClientRect();
        for (let y = Math.max(0, r.top) + 8; y < Math.min(innerHeight, r.bottom); y += 24)
          for (let x = Math.max(0, r.left) + 8; x < Math.min(innerWidth, r.right); x += 24)
            if (document.elementFromPoint(x, y) === e) return {x, y};
        throw Error('Нет доступной подложки мимо шторки');
      }
      const r = e.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
      need(x >= 0 && y >= 0 && x < innerWidth && y < innerHeight, 'Центр вне экрана: ' + selector);
      const hit = document.elementFromPoint(x, y);
      need(hit === e || e.contains(hit), 'Цель перекрыта: ' + selector + ' элементом ' + (hit?.id || hit?.className));
      return {x, y};
    },
    assert(expected) {
      const actual = state();
      for (const [key, value] of Object.entries(expected))
        need(actual[key] === value, key + ': ожидалось ' + JSON.stringify(value) + ', получено ' + JSON.stringify(actual[key]));
      return actual;
    },
    scrollSave(name) {
      const e = root();
      need(e && e.scrollHeight > e.clientHeight + 10, 'Нет прокрутки для проверки сохранения позиции');
      e.scrollTop = Math.min(180, e.scrollHeight - e.clientHeight);
      saved[name] = {scroll: e.scrollTop, query: state().query};
      need(saved[name].scroll > 0, 'Не удалось прокрутить планшет');
      return saved[name];
    },
    scrollCheck(name) {
      const old = saved[name], now = state();
      need(old && Math.abs(old.scroll - now.scroll) <= 2, 'Прокрутка потеряна: ' + JSON.stringify({old, now}));
      need(old.query === now.query, 'Запрос изменился при возврате');
      return now;
    },
    async record(id) {
      need(await window.__mapOpenRecord(id) !== false, 'Не открылась запись: ' + id);
    },
    image() {
      const images = [...document.querySelectorAll('.mirror-article figure img')];
      const image = images.find(e => shown(e) && e.closest(panels) && !e.closest('a, button'));
      need(image, 'В статье нет изображения для PhotoSwipe');
      image.scrollIntoView({block: 'center'});
      image.setAttribute('data-ui-check-image', '');
      return '[data-ui-check-image]';
    },
    firstResult() {
      const e = q('#planshet .results:not([hidden]) button.row');
      need(e, 'Поиск не выдал записи');
      saved.title = e.querySelector('.row-title')?.textContent.trim();
      e.scrollIntoView({block: 'center'});
      e.setAttribute('data-ui-check-result', '');
      return '[data-ui-check-result]';
    },
    saveSearch() {
      const e = root();
      e.scrollTop = Math.min(24, e.scrollHeight - e.clientHeight);
      need(e.scrollTop > 0, 'Нет прокрутки результатов для проверки возврата');
      saved.search = {scroll: e.scrollTop, query: state().query};
      return saved.search;
    },
    recent() {
      const groups = [...document.querySelectorAll('#planshet .results:not([hidden]) .group')];
      const group = groups.find(e => e.querySelector('h3')?.textContent.trim() === 'Недавно открытые');
      need(group && [...group.querySelectorAll('.row-title')].some(e => e.textContent.trim() === saved.title),
        'В «Недавно открытые» нет открытой записи: ' + saved.title);
    },
    sectionTarget() {
      const e = q('#planshet .tiles button.tile');
      need(shown(e), 'Не найдена видимая плитка раздела на главной планшета');
      saved.sectionTitle = e.querySelector('.t-title')?.textContent.trim();
      e.scrollIntoView({block: 'center'});
      e.setAttribute('data-ui-check-section', '');
      return '[data-ui-check-section]';
    },
    sectionCheck() {
      need(state().section && !state().menu, 'Раздел не открылся или шторка осталась');
      need(saved.sectionTitle && q('#planshet .sec-bar h2')?.textContent.trim() === saved.sectionTitle,
        'Открылся другой раздел вместо «' + saved.sectionTitle + '»');
    },
    home() {
      need(!state().section && shown(q('#planshet .main .tiles')), 'Не показана главная планшета');
    },
    focusStart() {
      const e = q('#planshetBrand');
      e.focus({preventScroll: true});
      need(document.activeElement === e, 'Не удалось начать обход панели');
    },
    focus() {
      const e = document.activeElement;
      if (!e.closest('#controls')) return {panel: false, id: e.id, element: e.tagName};
      const s = getComputedStyle(e), r = e.getBoundingClientRect();
      need(shown(e) && !e.closest('[inert]'), 'Tab попал на невидимый/inert элемент: ' + e.outerHTML.slice(0, 200));
      need(r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight,
        'Фокус вне экрана: ' + e.outerHTML.slice(0, 200));
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      need(hit === e || e.contains(hit), 'Фокус перекрыт другим элементом');
      const ring = s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0 &&
        s.outlineColor !== 'transparent' && !/rgba\([^)]*,\s*0\)$/.test(s.outlineColor);
      const shadow = s.boxShadow !== 'none';
      need(e.matches(':focus-visible') && (ring || shadow), 'Нет кольца :focus-visible: ' + (e.id || e.className));
      return {id: e.id, view: e.matches('.view-switch-btn') ? e.dataset.view : null,
        panel: !!e.closest('#controls'), element: e.tagName,
        outline: s.outline, shadow: s.boxShadow};
    },
    enlarge() { document.documentElement.style.fontSize = '200%'; },
    overflow() {
      const elements = [q('#controls'), ...document.querySelectorAll('#controls button, #controls a[href]')].filter(shown);
      const bad = elements.filter(e => { const r = e.getBoundingClientRect();
        return r.left < -0.5 || r.top < -0.5 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5;
      }).map(e => e.id || e.className);
      need(elements.length > 1 && !bad.length, 'Панель при 200% выходит за экран: ' + bad.join(', '));
      return {fontSize: getComputedStyle(document.documentElement).fontSize, checked: elements.length};
    },
    async axe(all) {
      need(window.axe, 'axe-core не внедрён');
      /* Сознательное исключение (Claude, 02.11.2026): meta-viewport — масштаб страницы жестом запрещён
         (index.html, user-scalable=no): у карты свой щипок-зум (panzoom.js), зум браузера ломал бы жесты
         карты и панелей; так у Telegram Mini Apps принято. Текст 200% проверяет сценарий text-200. */
      const options = {resultTypes: ['violations', 'incomplete'], rules: {'meta-viewport': {enabled: false}}};
      if (!all) options.runOnly = {type: 'tag', values: ['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22a','wcag22aa']};
      const result = await window.axe.run(document, options);
      const flatten = rules => rules.flatMap(r => r.nodes.map(n => ({
        rule: r.id, impact: n.impact || r.impact, selector: n.target,
        summary: n.failureSummary || [...n.any, ...n.all, ...n.none].map(c => c.message).filter(Boolean).join('; ') || r.help,
        help: r.help, help_url: r.helpUrl,
      })));
      return {version: result.testEngine.version, violations: flatten(result.violations),
        incomplete: flatten(result.incomplete)};
    },
  };
})();
