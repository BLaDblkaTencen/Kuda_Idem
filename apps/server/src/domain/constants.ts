// Справочники продукта. Подписи на русском — для интерфейса и объяснений подбора.

export const MOODS = {
  eat: 'поесть',
  party: 'потусить',
  play: 'поиграть',
  chill: 'спокойно посидеть',
  outdoor: 'на воздухе',
} as const;
export type Mood = keyof typeof MOODS;
export const MOOD_KEYS = Object.keys(MOODS) as Mood[];

// Бюджет на человека, ₽. null в ответе участника = «не важно».
export const BUDGET_OPTIONS = [0, 500, 1000, 2000] as const;

// TODO(автор): районы и соседство — черновик, уточнить с тестерами (открытый вопрос в спецификации).
export const DISTRICTS = {
  center: 'Центр',
  gagarinsky: 'Гагаринский (Омега, Камышовая)',
  korabelnaya: 'Корабельная сторона',
  ostryaki: 'Остряки',
  severnaya: 'Северная сторона',
  balaklava: 'Балаклава',
} as const;
export type District = keyof typeof DISTRICTS;
export const DISTRICT_KEYS = Object.keys(DISTRICTS) as District[];

export const DISTRICT_NEIGHBORS: Record<District, District[]> = {
  center: ['gagarinsky', 'korabelnaya', 'ostryaki', 'severnaya'],
  gagarinsky: ['center'],
  korabelnaya: ['center', 'ostryaki'],
  ostryaki: ['center', 'korabelnaya'],
  severnaya: ['center'],
  balaklava: [],
};

export const PLACE_TYPES = {
  cafe: 'кафе',
  bar: 'бар',
  anticafe: 'антикафе',
  restaurant: 'ресторан',
  club: 'клуб',
  entertainment: 'развлечения',
  park: 'парк',
  beach: 'пляж',
  viewpoint: 'смотровая площадка',
} as const;
export type PlaceType = keyof typeof PLACE_TYPES;

// Особенности места (теги), на которые ссылаются ограничения участников.
export const FEATURES = {
  vegetarian_menu: 'есть вегетарианское меню',
  non_alcoholic_menu: 'есть безалкогольное меню',
  adults_only: 'только 18+',
  hookah: 'кальян',
  board_games: 'настолки',
  karaoke: 'караоке',
  dance_floor: 'танцпол',
  sea_view: 'вид на море',
  big_tables: 'большие столы',
  // Еда не главное (парк, квест, музей): пожелания к меню — «вегетарианец», «не пью» — здесь не важны.
  no_food: 'без еды',
} as const;
export type Feature = keyof typeof FEATURES;

// Ограничения участника: место либо обязано иметь тег, либо не должно его иметь.
// strict — правило не ослабляется никогда, даже если без него не подобрать ни одного места.
export const CONSTRAINTS = {
  vegetarian: { label: 'вегетарианец', requires: 'vegetarian_menu' },
  no_alcohol: { label: 'не пью', requires: 'non_alcoholic_menu' },
  under_18: { label: 'мне нет 18', forbids: 'adults_only', strict: true },
  no_hookah: { label: 'без кальяна', forbids: 'hookah' },
} as const satisfies Record<string, { label: string; requires?: Feature; forbids?: Feature; strict?: boolean }>;
export type Constraint = keyof typeof CONSTRAINTS;
export const CONSTRAINT_KEYS = Object.keys(CONSTRAINTS) as Constraint[];

export const SEASONS = { all_year: 'круглый год', summer: 'только летом' } as const;
export type Season = keyof typeof SEASONS;

// Летний сезон: июнь–сентябрь (месяцы 5..8 в нумерации JS).
export const SUMMER_MONTHS = [5, 6, 7, 8];
