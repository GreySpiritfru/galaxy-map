/* ============================================================
   Броски из rolls.json — общее для вкладки «🎲 Броски» персонажа
   (js/characters.js) и «♟️ Игры» сюжета (js/node-window.js).

   Историю пишет бот (dice_rolls.py на сервере): бросок сразу сохраняется на
   сервере, а в rolls.json репозитория уходит пачкой: через ~2 минуты после
   броска (с 08.10.2026) и раз в 20 минут на всякий случай — поэтому свежий
   бросок видно в чате сразу, а здесь — через несколько минут.
   Формат: {"characters": {id: [бросок, …]}, "plots": {id сюжета: […]}},
   новые первыми. Бросок — {t, d, r, m?, s, dc?, o?, a?, k?}: o — crit /
   critfail / success / fail; k (только у сюжета, броски за НПС с 05.10.2026)
   — foe / neutral / ally. Ссылок на сообщения и того, кто бросал, нет
   сознательно: группа закрытая, а rolls.json публичный.
   ============================================================ */
import { escapeHtml } from './modal.js?v=209';
import { fetchT } from './net.js?v=209';

const ROLLS_URL = 'rolls.json';
let rollsCache = null; // {at, data}

export async function loadRolls() {
  if (rollsCache && Date.now() - rollsCache.at < 60000) return rollsCache.data;
  let data = {characters: {}, plots: {}};
  try {
    const resp = await fetchT(ROLLS_URL, {cache: 'no-cache'});
    // 404 — бот ещё ни разу не выгружал броски; это не ошибка.
    if (resp.status !== 404) data = await resp.json();
  } catch (e) { /* нет сети/битый файл — покажем «бросков нет» */ }
  rollsCache = {at: Date.now(), data};
  return data;
}

// Список бросков id из раздела ("characters" / "plots"); только свои ключи.
export function rollsOf(data, section, id) {
  const box = data && data[section];
  const list = box && Object.prototype.hasOwnProperty.call(box, id) ? box[id] : null;
  return Array.isArray(list) ? list.filter(r => r && typeof r === 'object') : [];
}

const OUTCOME = {
  crit: ['💥', 'критический успех', 'is-crit'],
  critfail: ['💀', 'критический провал', 'is-critfail'],
  success: ['✅', 'успех', 'is-success'],
  fail: ['❌', 'провал', 'is-fail'],
};

// Сторона НПС — те же значки, что в ответе бота.
export const NPC_SIDE = {
  foe: ['👹', 'противник', 'is-foe'],
  neutral: ['🗿', 'нейтрал', 'is-neutral'],
  ally: ['🛡️', 'союзник', 'is-ally'],
};
export const NPC_DEFAULT = ['🎭', 'НПС', 'is-npc'];

function rollDate(t) {
  const d = new Date(t * 1000);
  return d.toLocaleString('ru-RU', {day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'});
}

export function rollRowHtml(r) {
  const dice = Array.isArray(r.r) ? r.r.join(', ') : '';
  const mod = r.m ? ` ${r.m > 0 ? '+' : '−'} ${Math.abs(r.m)}` : '';
  const o = Object.prototype.hasOwnProperty.call(OUTCOME, r.o) ? OUTCOME[r.o] : null;
  const verdict = o ? `<span class="roll-verdict ${o[2]}">${o[0]} ${o[1]}${r.dc ? ` · сл ${escapeHtml(r.dc)}` : ''}</span>`
    : (r.dc ? `<span class="roll-verdict">сл ${escapeHtml(r.dc)}</span>` : '');
  return `<li class="roll${o ? ' ' + o[2] : ''}">
      <div class="roll-total">${escapeHtml(r.s)}</div>
      <div class="roll-body">
        <div class="roll-action">${r.a ? escapeHtml(r.a) : '<span class="roll-muted">без описания</span>'}</div>
        <div class="roll-meta">${escapeHtml(r.d || '')}: [${escapeHtml(dice)}]${escapeHtml(mod)} ${verdict}</div>
      </div>
      <div class="roll-side"><span class="roll-date">${rollDate(r.t)}</span></div>
    </li>`;
}

// Грани одиночных d20 (с добавкой тоже) — для среднего и «весов удачи».
export function d20Faces(list) {
  return list.filter(r => /^d20([+-]\d+)?$/.test(r.d || '') && Array.isArray(r.r))
    .map(r => Number(r.r[0])).filter(Number.isFinite);
}

export const average = (a) => a.reduce((s, x) => s + x, 0) / a.length;
