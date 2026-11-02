/* Планшет карты (02.11.2026, перенос планшета шаг 5): страница во фрейме над картой в режиме «Ноды»
   (js/planshet-frame.js); основа — макет mock/n6. */
import {makeShell} from './shell.js?v=1';
import {renderMain} from './home.js?v=1';
import {renderCard} from './cards.js?v=1';
import {MODES} from './filters.js?v=1';
export const tablet=makeShell({renderMain,renderCard,filter:true,modes:MODES});
window.n6=tablet;
export const openRecord=tablet.openRecord;
