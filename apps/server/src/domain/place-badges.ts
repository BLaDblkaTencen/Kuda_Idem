import type { WeeklyHours } from '../db/schema.js';
import { toCityTime } from '../matching/match.js';

// Значок и метки места для карточки голосования: по ним места различаются с первого взгляда.
// Значок выбирается по виду места («кинотеатр» → 🎬), а если вида нет в списке — по общей категории.

// Порядок важен: проверяется сверху вниз («антикинотеатр» раньше «кинотеатра», «кофе-бар» раньше «бара»).
const KIND_ICONS: Array<[RegExp, string]> = [
  [/антикинотеатр/, '🍿'],
  [/кинотеатр/, '🎬'],
  [/караоке/, '🎤'],
  [/бильярд/, '🎱'],
  [/квест/, '🔐'],
  [/vr|виртуальн/, '🥽'],
  [/картинг|симрейсинг/, '🏎️'],
  [/аттракцион/, '🎡'],
  [/музей/, '🏛️'],
  [/антикафе/, '🎲'],
  [/кальян/, '💨'],
  [/крепость/, '🏰'],
  [/набережн/, '🌊'],
  [/бульвар|парк/, '🌳'],
  [/кофе/, '☕'],
  [/пицц/, '🍕'],
  [/пив/, '🍺'],
  [/чебуреч|домашн/, '🥟'],
  [/быстрого питания/, '🌯'],
  [/гриль/, '🍖'],
  [/столов/, '🍲'],
  [/рок-бар/, '🎸'],
  [/гастробар|ресторан|рестобар/, '🍽️'],
  [/бар/, '🍸'],
  [/кафе/, '🍴'],
];

const TYPE_ICONS: Record<string, string> = {
  cafe: '🍴',
  bar: '🍸',
  restaurant: '🍽️',
  anticafe: '🎲',
  club: '🪩',
  entertainment: '🎉',
  park: '🌳',
  beach: '🏖️',
  viewpoint: '🌄',
};

export function placeIcon(p: { kind?: string | null; type: string }): string {
  const kind = (p.kind ?? '').toLowerCase();
  for (const [re, icon] of KIND_ICONS) if (re.test(kind)) return icon;
  return TYPE_ICONS[p.type] ?? '📍';
}

// Особенности, которые стоит показать метками (остальные — служебные для подбора).
const FEATURE_TAGS: Array<[string, string]> = [
  ['sea_view', '🌊 вид на море'],
  ['hookah', '💨 кальян'],
  ['karaoke', '🎤 караоке'],
  ['board_games', '🎲 настолки'],
  ['dance_floor', '💃 танцпол'],
];

/** «до 23:00», «круглосуточно» или null, если в этот день выходной. Ночью — смена предыдущего дня. */
export function openUntil(hours: WeeklyHours | null, startsAt: Date): string | null {
  if (hours === null) return 'круглосуточно';
  const { weekday, minutes } = toCityTime(startsAt);
  const yesterday = hours[(weekday + 6) % 7];
  if (yesterday && yesterday.close < yesterday.open) {
    const [h, m] = yesterday.close.split(':').map(Number);
    if (minutes < (h ?? 0) * 60 + (m ?? 0)) return `до ${yesterday.close}`;
  }
  const today = hours[weekday];
  if (!today) return null;
  if (today.open === '00:00' && today.close === '24:00') return 'круглосуточно';
  return `до ${today.close === '24:00' ? '00:00' : today.close}`;
}

/** Метки карточки: «бесплатно», «18+», особенности (не больше трёх), часы в день встречи. */
export function placeTags(
  p: { avgCheck: number; features: string[]; moods: string[]; hours: WeeklyHours | null },
  startsAt: Date,
): string[] {
  const tags: string[] = [];
  if (p.avgCheck === 0) tags.push('бесплатно');
  if (p.features.includes('adults_only')) tags.push('18+');
  const extra = FEATURE_TAGS.filter(([f]) => p.features.includes(f)).map(([, label]) => label);
  if (p.moods.includes('outdoor') && !extra.length) extra.push('🌳 на воздухе');
  tags.push(...extra.slice(0, 3));
  const until = openUntil(p.hours, startsAt);
  if (until) tags.push(`🕑 ${until}`);
  return tags;
}
