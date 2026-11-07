import {pickedStories, viewKind} from './common.js?v=40';

export const SECTIONS = [['news','События'],['article','Статьи и лор'],['story','Сюжеты'],['place','Маркеры'],['building','Районы и здания'],['character','Персонажи']];
export function inChip(r, chip) {
  if (chip === 'all') return true;
  const ids = pickedStories(chip).map(s => s.id), kind = viewKind(r);
  if (kind === 'story') return ids.includes(r.id);
  if (kind === 'news' && chip === 'archive' && r.archived) return true;
  if (kind === 'news' || kind === 'character') return ids.includes(r.context.storyId);
  return true;
}
