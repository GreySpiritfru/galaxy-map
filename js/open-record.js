/* ============================================================
   Единый вход открытия записи (02.11.2026, перенос планшета, шаг 3).

   openRecord(id, anchor?, options?) — для всех: ссылки ?open= / startapp,
   дальше (шаги 4–5) — граф, планшет, поиск, автоссылки, схема корабля.
   id — запись реестра (js/records.js) или старый адрес: ключ справочника
   (phenom), адрес статьи. Как открыть каждый вид — решает map.js
   (setRecordOpener): точки, персонажи и системы — прежними окнами, статья —
   в модале, район/здание — Феном на вкладке схемы.
   options: {tab, instant} — вкладка (rolls, notes) и без перелёта камеры.
   ============================================================ */
import { resolveAddress } from './records.js?v=256';

let registry = null;
let markReady;
const ready = new Promise(resolve => { markReady = resolve; });
const openers = {};

export function setRegistry(reg) {
  registry = reg;
  markReady(reg);
}
export function getRegistry() { return registry; }
export function setRecordOpener(kind, fn) { openers[kind] = fn; }

/* true — открыто; false — нет такой записи или её не умеем открыть. */
export async function openRecord(id, anchor = '', options = {}) {
  const reg = await ready;
  const hit = resolveAddress(reg, id, anchor);
  const rec = hit && reg.byId.get(hit.id);
  const open = rec && openers[rec.kind];
  if (!open) return false;
  return open(rec, hit.anchor || '', options || {}) !== false;
}
