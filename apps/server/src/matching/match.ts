// Подбор мест для компании. Чистые функции без базы данных — легко тестировать.
// Логика описана в спецификации, раздел «Алгоритм подбора».

import {
  CONSTRAINTS,
  DISTRICT_NEIGHBORS,
  DISTRICTS,
  FEATURES,
  MOODS,
  SUMMER_MONTHS,
  type Constraint,
  type District,
  type Feature,
  type Mood,
} from '../domain/constants.js';
import type { WeeklyHours } from '../db/schema.js';

export interface MatchPlace {
  id: number;
  name: string;
  type: string;
  district: string;
  avgCheck: number;
  moods: string[];
  features: string[];
  maxGroupSize: number;
  hours: WeeklyHours | null;
  season: string;
}

export interface MatchAnswer {
  userId: number;
  budget: number | null; // ₽ на человека, null = не важно
  moods: string[]; // пусто = «всё равно»
  district: string | null; // null = любой
  constraints: string[];
}

export interface MatchInput {
  places: MatchPlace[];
  answers: MatchAnswer[];
  startsAt: Date;
  excludePlaceIds?: number[];
  count?: number;
}

export interface MatchResult {
  placeId: number;
  total: number;
  minParticipantScore: number;
  explanation: string;
  relaxed: RelaxableFilter[];
}

// Севастополь живёт по московскому времени, без перехода на летнее.
const CITY_UTC_OFFSET_MIN = 3 * 60;
// Место должно работать ещё как минимум столько минут после начала встречи.
const MIN_OPEN_AHEAD_MIN = 60;
// Насколько можно превысить самый маленький бюджет (со штрафом).
const BUDGET_TOLERANCE = 1.2;
const MAX_SAME_TYPE = 2;

type RelaxableFilter = 'budget' | 'group_size' | 'constraints';
// Порядок, в котором ослабляем условия, если подходящих мест нет.
const RELAX_ORDER: RelaxableFilter[] = ['budget', 'group_size', 'constraints'];

const RELAX_NOTES: Record<RelaxableFilter, string> = {
  budget: 'дороже бюджета кого-то из компании',
  group_size: 'может не вместить всю компанию',
  constraints: 'не учтены чьи-то ограничения',
};

// ---------- время работы ----------

export function toCityTime(date: Date): { weekday: number; minutes: number; month: number } {
  const local = new Date(date.getTime() + CITY_UTC_OFFSET_MIN * 60_000);
  return {
    weekday: local.getUTCDay(),
    minutes: local.getUTCHours() * 60 + local.getUTCMinutes(),
    month: local.getUTCMonth(),
  };
}

function parseHm(hm: string): number {
  const [h, m] = hm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function isOpenAtLocal(hours: WeeklyHours | null, weekday: number, minutes: number): boolean {
  if (hours === null) return true; // парки, набережные — открыто всегда
  const today = hours[weekday];
  if (today) {
    const open = parseHm(today.open);
    const close = parseHm(today.close);
    if (open <= close ? minutes >= open && minutes < close : minutes >= open) return true;
  }
  // Ночная смена вчерашнего дня (например, вчера 22:00–05:00, сейчас 01:00).
  const yesterday = hours[(weekday + 6) % 7];
  if (yesterday) {
    const open = parseHm(yesterday.open);
    const close = parseHm(yesterday.close);
    if (close < open && minutes < close) return true;
  }
  return false;
}

export function isOpenAt(hours: WeeklyHours | null, at: Date): boolean {
  const start = toCityTime(at);
  const later = toCityTime(new Date(at.getTime() + MIN_OPEN_AHEAD_MIN * 60_000));
  return (
    isOpenAtLocal(hours, start.weekday, start.minutes) &&
    isOpenAtLocal(hours, later.weekday, later.minutes)
  );
}

function inSeason(season: string, at: Date): boolean {
  return season !== 'summer' || SUMMER_MONTHS.includes(toCityTime(at).month);
}

// ---------- фильтры и баллы ----------

export function groupBudgetCap(answers: MatchAnswer[]): number | null {
  const budgets = answers.map((a) => a.budget).filter((b): b is number => b !== null);
  return budgets.length ? Math.min(...budgets) : null;
}

/** onlyStrict — проверить только строгие ограничения (например, «мне нет 18»). */
function violatesConstraints(place: MatchPlace, answers: MatchAnswer[], onlyStrict = false): boolean {
  return answers.some((a) =>
    a.constraints.some((c) => {
      const rule = CONSTRAINTS[c as Constraint] as { requires?: Feature; forbids?: Feature; strict?: boolean } | undefined;
      if (!rule) return false;
      if (onlyStrict && !rule.strict) return false;
      if (rule.requires && !place.features.includes(rule.requires)) return true;
      if (rule.forbids && place.features.includes(rule.forbids)) return true;
      return false;
    }),
  );
}

function districtFits(answerDistrict: string | null, placeDistrict: string): boolean {
  if (answerDistrict === null) return true;
  if (answerDistrict === placeDistrict) return true;
  return (DISTRICT_NEIGHBORS[answerDistrict as District] ?? []).includes(placeDistrict as District);
}

export function participantScore(place: MatchPlace, answer: MatchAnswer): number {
  const moodScore = answer.moods.length === 0 ? 1 : answer.moods.filter((m) => place.moods.includes(m)).length;
  const districtScore = districtFits(answer.district, place.district) ? 1 : 0;
  return moodScore + districtScore;
}

function passesFilters(
  place: MatchPlace,
  answers: MatchAnswer[],
  startsAt: Date,
  relaxed: Set<RelaxableFilter>,
): boolean {
  if (!isOpenAt(place.hours, startsAt)) return false;
  if (!inSeason(place.season, startsAt)) return false;
  const cap = groupBudgetCap(answers);
  if (!relaxed.has('budget') && cap !== null && place.avgCheck > cap * BUDGET_TOLERANCE) return false;
  if (!relaxed.has('group_size') && place.maxGroupSize < Math.max(1, answers.length)) return false;
  // Строгие ограничения («мне нет 18») действуют всегда, остальные можно ослабить.
  if (violatesConstraints(place, answers, relaxed.has('constraints'))) return false;
  return true;
}

// ---------- объяснение ----------

function explain(place: MatchPlace, answers: MatchAnswer[], relaxed: RelaxableFilter[]): string {
  const parts: string[] = [];
  const cap = groupBudgetCap(answers);

  if (place.avgCheck === 0) parts.push('бесплатно');
  else if (cap !== null && place.avgCheck <= cap) parts.push(`~${place.avgCheck} ₽ — в бюджете у всех`);
  else parts.push(`~${place.avgCheck} ₽ на человека`);

  const wanted = new Set(answers.flatMap((a) => a.moods));
  const matchedMoods = place.moods.filter((m) => wanted.has(m)).map((m) => MOODS[m as Mood]);
  if (matchedMoods.length) parts.push(matchedMoods.join(', '));

  const features = place.features
    .filter((f) => ['board_games', 'karaoke', 'sea_view', 'dance_floor'].includes(f))
    .slice(0, 2)
    .map((f) => FEATURES[f as Feature]);
  parts.push(...features);

  const districtLabel = DISTRICTS[place.district as District] ?? place.district;
  const allFit = answers.every((a) => districtFits(a.district, place.district));
  parts.push(allFit && answers.some((a) => a.district !== null) ? `${districtLabel}, удобно всем` : districtLabel);

  for (const r of relaxed) parts.push(`не совпало: ${RELAX_NOTES[r]}`);
  return parts.join(' · ');
}

// ---------- главный вход ----------

export function matchPlaces(input: MatchInput): MatchResult[] {
  const { places, answers, startsAt } = input;
  const count = input.count ?? 3;
  const exclude = new Set(input.excludePlaceIds ?? []);
  const pool = places.filter((p) => !exclude.has(p.id));
  const cap = groupBudgetCap(answers);

  // Ослабляем условия по одному, пока не наберётся хоть одно место.
  const relaxed = new Set<RelaxableFilter>();
  let candidates = pool.filter((p) => passesFilters(p, answers, startsAt, relaxed));
  for (const filter of RELAX_ORDER) {
    if (candidates.length > 0) break;
    relaxed.add(filter);
    candidates = pool.filter((p) => passesFilters(p, answers, startsAt, relaxed));
  }

  const scored = candidates.map((place) => {
    const perUser = answers.map((a) => participantScore(place, a));
    const overBudget = cap !== null && place.avgCheck > cap ? 1 : 0;
    const total = perUser.reduce((s, x) => s + x, 0) - overBudget;
    const minParticipantScore = perUser.length ? Math.min(...perUser) : 0;
    return { place, total, minParticipantScore };
  });

  // Справедливость: место, где кому-то совсем не подходит, опускается вниз.
  scored.sort(
    (a, b) =>
      Number(a.minParticipantScore === 0) - Number(b.minParticipantScore === 0) ||
      b.total - a.total ||
      a.place.avgCheck - b.place.avgCheck ||
      a.place.id - b.place.id,
  );

  // Разнообразие: не больше двух мест одного типа в выдаче.
  const picked: typeof scored = [];
  const perType = new Map<string, number>();
  for (const s of scored) {
    if (picked.length >= count) break;
    const n = perType.get(s.place.type) ?? 0;
    if (n >= MAX_SAME_TYPE) continue;
    perType.set(s.place.type, n + 1);
    picked.push(s);
  }

  const relaxedList = [...relaxed];
  return picked.map((s) => ({
    placeId: s.place.id,
    total: s.total,
    minParticipantScore: s.minParticipantScore,
    explanation: explain(s.place, answers, relaxedList),
    relaxed: relaxedList,
  }));
}
