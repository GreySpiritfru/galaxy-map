/* ============================================================
   Адрес записи в ссылке (02.11.2026, перенос планшета, шаг 3).

   startapp у Telegram — до 512 знаков, только A-Za-z0-9_- (браузерное ?open= —
   то же самое, чтобы ссылки были одинаковые). Поэтому:
   - простой id без якоря — как раньше, сам id: «story-1», «gilvi--rolls»;
   - всё остальное (id с «:» — zone:phenome:…, якорь, другая вкладка) —
     «r1_» + base64url(JSON {i, t?, a?}). Не влезло в 512 — ошибка, не обрезка.
   Старые адреса работают: <id>, <id>--rolls, <id>--notes, tour, welcome, sections.
   Чистый модуль: проверка — tools/check-records.mjs.
   ============================================================ */

export const ADDRESS_MAX = 512;
const LEGACY_ID = /^[A-Za-z0-9_-]{1,64}$/;
const SPECIAL = new Set(['tour', 'welcome', 'sections']);
// Вкладки, у которых есть старый суффикс: <id>--rolls, <id>--notes.
const LEGACY_TABS = new Set(['rolls', 'notes']);

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder('utf-8', {fatal: true}).decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}

/* {id, tab?, anchor?} → строка для startapp / ?open=. */
export function encodeAddress({id, tab = '', anchor = ''} = {}) {
  if (typeof id !== 'string' || !id) throw new Error('адрес: нет id');
  if (!anchor && LEGACY_ID.test(id) && !SPECIAL.has(id) && !id.includes('--')) {
    if (!tab) return id;
    if (LEGACY_TABS.has(tab)) return `${id}--${tab}`;
  }
  const payload = {i: id};
  if (tab) payload.t = tab;
  if (anchor) payload.a = anchor;
  const out = 'r1_' + toBase64Url(JSON.stringify(payload));
  if (out.length > ADDRESS_MAX) throw new Error(`адрес длиннее ${ADDRESS_MAX}`);
  return out;
}

/* Строка → {special} | {id, tab, anchor} | null (мусор и чужое). */
export function decodeAddress(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > ADDRESS_MAX) return null;
  if (SPECIAL.has(s)) return {special: s};
  if (s.startsWith('r1_')) {
    try {
      const p = JSON.parse(fromBase64Url(s.slice(3)));
      if (!p || typeof p.i !== 'string' || !p.i) return null;
      return {id: p.i, tab: typeof p.t === 'string' ? p.t : '', anchor: typeof p.a === 'string' ? p.a : ''};
    } catch (e) { return null; }
  }
  const m = /^(.+?)--(rolls|notes)$/.exec(s);
  const id = m ? m[1] : s;
  if (!LEGACY_ID.test(id)) return null;
  return {id, tab: m ? m[2] : '', anchor: ''};
}
