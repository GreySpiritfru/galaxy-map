/* ============================================================
   Окно-вкладыш "Корабль-город Феном" — в отличие от .system-overlay,
   карта галактики под ним не закрывается, только затемняется по краям
   (см. .phenom-overlay). Внутри — карта Феном на тайлах через OpenSeadragon
   (см. ensurePhenomViewer): огромную картинку (21284x9902px) грузить целиком
   нельзя — тот же класс бага, что уже был с 4096px-текстурой в map.svg, тут
   тайлы решают его в принципе, подгружая только видимые кусочки.
   OpenSeadragon грузится отдельным классическим <script> в index.html
   (глобальная UMD-сборка) — этот модуль просто использует window.OpenSeadragon.
   ============================================================ */
import { closeModal, isArticleOpen } from './modal.js?v=23';

const phenomOverlay = document.getElementById('phenomOverlay');
const PHENOM_DZI_PATH = 'phenom-tiles/phenom.dzi';
let phenomViewer = null;

const PHENOM_INITIAL_ZOOM = 2.2; // во сколько раз ближе домашнего (вписанного целиком) вида открывать карту

function ensurePhenomViewer() {
  if (phenomViewer) return;
  phenomViewer = OpenSeadragon({
    id: 'phenomViewer',
    tileSources: PHENOM_DZI_PATH,
    showNavigationControl: false,
    // Тап без перетаскивания не должен зумить — как и на карте галактики,
    // где клик срабатывает только по конкретным точкам/подписям, а не по фону.
    gestureSettingsMouse: { clickToZoom: false },
    gestureSettingsTouch: { clickToZoom: false },
    visibilityRatio: 1,
    constrainDuringPan: true,
  });
  // По умолчанию OSD открывает вид карты целиком (мельче некуда) — сразу
  // приближаем чуть сильнее, чтобы не нужно было каждый раз докручивать
  // колесом/щипком вручную перед тем, как рассмотреть район.
  phenomViewer.addHandler('open', () => {
    const vp = phenomViewer.viewport;
    vp.zoomTo(vp.getHomeZoom() * PHENOM_INITIAL_ZOOM, null, true);
  });
}

let phenomArmed = false;

export function openPhenom() {
  phenomOverlay.classList.add('open');
  ensurePhenomViewer();
  phenomArmed = false;
  setTimeout(() => { phenomArmed = true; }, 300);
}

function closePhenom() {
  closeModal(); // если поверх открыто "Описание Феном" — не оставлять его висеть над картой
  phenomOverlay.classList.remove('open');
}

document.getElementById('phenomClose').addEventListener('click', () => {
  // Кнопка одна и та же и в самом окне Феном, и (пристыкованная) поверх
  // открытой статьи — но "на шаг назад" должно означать разное в двух этих
  // случаях: если сейчас читаем статью, сначала просто закрыть её и
  // вернуться к карте Феном, а не выпрыгивать сразу в карту галактики.
  if (isArticleOpen()) closeModal();
  else closePhenom();
});
phenomOverlay.addEventListener('click', (e) => {
  if (!phenomArmed) return;
  if (e.target === phenomOverlay) closePhenom();
});
