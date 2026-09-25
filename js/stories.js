/* ============================================================
   ВЕРХНИЙ слой окна мировой точки (#storyOverlay).

   Файл называется stories.js по истории — когда-то это было окно конкретно
   сюжета. С 23.09.2026 сюжета как отдельной сущности нет: есть мировая точка
   (world.json), и это окно показывает ЛЮБУЮ из них. Рисует не этот файл, а
   общий js/node-window.js — здесь только хозяйство слоя: показать/скрыть,
   запомнить, что открыто, отдать наружу кнопки таббара.

   ⚠️ Зачем вообще два слоя. Точка, открытая из окна своего родителя (сюжет
   из окна Фенома, корабль из окна системы), должна лечь ПОВЕРХ него, а не
   вместо: тогда её закрытие возвращает ровно туда, откуда пришли. Нижний слой
   — js/phenom.js (он же умеет тайловую карту), верхний — этот. Оба вместе
   дают вложенность локация -> точка -> персонаж, см. CLAUDE.md.
   ============================================================ */
import { renderNodeContent, applyNodeToolbar, renderNodeLinks } from './node-window.js?v=156';

const storyOverlay = document.getElementById('storyOverlay');
const storyContent = document.getElementById('storyContent');
const storyLinks = document.getElementById('storyLinks');
const refs = {
  toolbar: document.getElementById('storyToolbar'),
  article: document.getElementById('storyArticle'),
  archive: document.getElementById('storyArchive'),
  index: document.getElementById('storyTelegram'),
  edit: document.getElementById('storyEdit'),
};
let storyArmed = false;

// Точка, чьё окно открыто сейчас (view из map.js, см. worldView). Нужна
// снаружи: кнопка «Правка» живёт в map.js — там есть и граф, и камера.
let currentNode = null;
export function getOpenStory() { return currentNode; }

// Переход «точка -> персонаж» (обратная сторона кнопки родителя в окне
// персонажа): map.js регистрирует сюда колбэк, который наводит камеру и
// открывает окно. Тут просто дырка для него, чтобы этот файл не знал про
// граф и камеру.
let goToCharacter = null;
export function setCharacterNavigator(fn) { goToCharacter = fn; }

export function openStory(view, handlers) {
  currentNode = view;
  renderNodeContent(storyContent, view);
  applyNodeToolbar(refs, view, handlers || {});
  // Окно персонажа открывается ПОВЕРХ этого (модал выше по z-index), поэтому
  // закрытие анкеты возвращает сюда же, без повторного перехода через карту.
  renderNodeLinks(storyLinks, view, {
    onParent: handlers && handlers.onParent,
    onChild: handlers && handlers.onChild,
    onCharacter: (id) => { if (goToCharacter) goToCharacter(id); },
  });
  storyOverlay.classList.add('open');
  // Та же защита от «хвоста» клика по маркеру, что и у нижнего слоя с модалом:
  // без неё синтетический клик, идущий следом за тапом, тут же закрывал бы
  // только что открывшееся окно.
  storyArmed = false;
  setTimeout(() => { storyArmed = true; }, 300);
}

// Открыт ли верхний слой сейчас — нужно снаружи (js/navigation.js) для
// единого «шага назад» (ESC/Telegram BackButton/history браузера).
export function isStoryOpen() {
  return storyOverlay.classList.contains('open');
}

export function closeStory() {
  storyOverlay.classList.remove('open');
  currentNode = null;
}

// ✕ (#storyClose) тут не вешается — js/navigation.js сам вешает на него
// closeTop() (единая точка входа для всех закрывающих кнопок сразу): если
// сверху открыта анкета персонажа, тот же крестик должен закрыть сначала её.
storyOverlay.addEventListener('click', (e) => {
  if (!storyArmed) return;
  if (e.target === storyOverlay) closeStory();
});
