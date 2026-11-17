import { PLACE_TYPES, type PlaceType } from './constants.js';

// Как называть место людям: вид заведения перед названием — «Кинотеатр «Победа»», «Идём в пиццерию «Челентано»».

type Named = { name: string; type: string; kind?: string | null };

/** Вид заведения в нижнем регистре: из таблицы, а у старых тестовых мест — по общей категории. */
export function placeKind(p: Named): string {
  return p.kind || (PLACE_TYPES[p.type as PlaceType] ?? p.type);
}

const quote = (name: string) => (name.includes('«') ? name : `«${name}»`);
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Название уже содержит вид («Кафе «Маяк»» у тестовых мест) — тогда вид не добавляем. */
const hasKindInName = (p: Named) => !p.kind && p.name.includes('«');

/** «Кинотеатр «Победа»» — для заголовков. */
export function placeTitle(p: Named): string {
  return hasKindInName(p) ? p.name : `${capitalize(placeKind(p))} ${quote(p.name)}`;
}

/**
 * Вид заведения в винительном падеже («куда?»): пиццерия → пиццерию, столовая → столовую,
 * пляжное кафе и бильярдный клуб не меняются. Слова мужского и среднего рода остаются как есть.
 */
export function toAccusative(phrase: string): string {
  return phrase.replace(/[а-яё]+/gi, (w) => {
    if (/[ая]я$/i.test(w)) return w.slice(0, -2) + (w.endsWith('яя') ? 'юю' : 'ую');
    if (/а$/i.test(w)) return w.slice(0, -1) + 'у';
    if (/я$/i.test(w)) return w.slice(0, -1) + 'ю';
    return w;
  });
}

/** «кинотеатр «Победа»», «пиццерию «Челентано»» — после «Идём в …». */
export function placeTitleTo(p: Named): string {
  if (hasKindInName(p)) {
    const i = p.name.indexOf('«');
    return toAccusative(p.name.slice(0, i).toLowerCase()) + p.name.slice(i);
  }
  return `${toAccusative(placeKind(p))} ${quote(p.name)}`;
}
