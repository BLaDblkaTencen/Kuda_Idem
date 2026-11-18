// Формы ответов API (см. apps/server/src/routes/trips.ts и places.ts).

export interface PlaceCard {
  id: number;
  name: string;
  /** «Кинотеатр «Победа»» — вид заведения и название */
  title: string;
  /** «в кинотеатр «Победа»», «на Приморский бульвар» — после «Идём» */
  goTo: string;
  kind: string;
  icon: string;
  /** Метки на день встречи: «бесплатно», «18+», «🕑 до 23:00»… */
  tags: string[];
  type: string;
  district: string;
  districtLabel: string;
  address: string;
  avgCheck: number;
  isFree: boolean;
  features: string[];
  description: string;
  photos: string[];
  mapsUrl: string;
  isTestData: boolean;
}

export interface Person {
  id: number;
  firstName: string;
  photoUrl: string | null;
}

export interface Answer {
  budget: number | null;
  moods: string[];
  districts: string[]; // пусто = любой район
  constraints: string[];
}

export type TripStatus = 'collecting' | 'voting' | 'decided';

export interface Trip {
  id: string;
  status: TripStatus;
  round: number;
  startsAt: string;
  startsAtLabel: string;
  isOrganizer: boolean;
  organizer: Person | undefined;
  participants: Person[];
  myAnswer: Answer | null;
  suggestions: Array<{ place: PlaceCard; voters: Person[] }>;
  myVote: number | null;
  chosenPlace: PlaceCard | null;
  link: string | null;
}

export interface Dictionaries {
  moods: Array<{ key: string; label: string }>;
  budgets: Array<{ value: number | null; label: string }>;
  districts: Array<{ key: string; label: string }>;
  constraints: Array<{ key: string; label: string }>;
}
