import {C, pickedStories, viewKind} from './common.js?v=9';

export const SECTIONS = [['news','События'],['article','Статьи и лор'],['story','Сюжеты'],['place','Маркеры'],['building','Феном'],['character','Персонажи']];
export const MODES = [['all','Всё'], ...SECTIONS];
export function inChip(r, chip) {
  if (chip === 'all') return true;
  const ids = pickedStories(chip).map(s => s.id), kind = viewKind(r);
  if (kind === 'story') return ids.includes(r.id);
  if (kind === 'news' || kind === 'character') return ids.includes(r.context.storyId);
  return true;
}
export const inMode = (r, mode) => mode === 'all' || (mode === 'place' ? ['place','system'].includes(viewKind(r)) : mode === 'building' ? ['building','zone'].includes(r.kind) : viewKind(r) === mode);
