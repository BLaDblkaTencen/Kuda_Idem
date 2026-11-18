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
/** Вид — часть самого названия: «Парк Победы», «Приморский бульвар», «Набережная Балаклавы». */
const nameContainsKind = (p: Named) => !!p.kind && p.name.toLowerCase().includes(p.kind.toLowerCase());

/** «Кинотеатр «Победа»», «Парк Победы» — для заголовков. */
export function placeTitle(p: Named): string {
  if (hasKindInName(p)) return p.name;
  if (nameContainsKind(p)) return capitalize(p.name);
  return `${capitalize(placeKind(p))} ${quote(p.name)}`;
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

// Куда говорят «на», а не «в»: на бульвар, на набережную, на Малахов курган.
const NA_KINDS = ['бульвар', 'набережная', 'площадь', 'пляж', 'курган', 'смотровая площадка'];

/** «в кинотеатр «Победа»», «в пиццерию «Челентано»», «на Приморский бульвар», «на Набережную Балаклавы». */
export function placeGoTo(p: Named): string {
  const kind = placeKind(p);
  const prep = NA_KINDS.some((k) => kind.toLowerCase().endsWith(k)) ? 'на' : 'в';
  if (hasKindInName(p)) {
    const i = p.name.indexOf('«');
    return `${prep} ${toAccusative(p.name.slice(0, i).toLowerCase())}${p.name.slice(i)}`;
  }
  if (nameContainsKind(p)) {
    // Склоняем только сам вид, если название с него начинается: «Набережная Балаклавы» → «Набережную Балаклавы».
    const starts = p.name.toLowerCase().startsWith(kind.toLowerCase());
    const name = starts ? toAccusative(p.name.slice(0, kind.length)) + p.name.slice(kind.length) : p.name;
    return `${prep} ${name}`;
  }
  return `${prep} ${toAccusative(kind)} ${quote(p.name)}`;
}
