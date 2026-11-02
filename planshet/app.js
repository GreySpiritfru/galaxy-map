/* Планшет карты (02.11.2026, перенос планшета): режим «Ноды». С v=219 — не страница во фрейме, а модули,
   которые карта грузит при первом показе и ставит в #planshet (js/planshet.js). Основа — макет mock/n6. */
import {makeShell} from './shell.js?v=5';
import {renderMain} from './home.js?v=5';
export const mount = (root, opts) => makeShell({root, renderMain, ...opts});
