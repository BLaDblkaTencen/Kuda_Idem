import { describe, expect, it } from 'vitest';
import { isOpenAt, matchPlaces, participantScore, type MatchAnswer, type MatchPlace } from './match.js';
import { TEST_PLACES } from '../db/seed-places.js';

const places: MatchPlace[] = TEST_PLACES.map((p, i) => ({
  id: i + 1,
  name: p.name,
  type: p.type,
  district: p.district,
  avgCheck: p.avgCheck,
  moods: p.moods ?? [],
  features: p.features ?? [],
  maxGroupSize: p.maxGroupSize ?? 6,
  hours: p.hours ?? null,
  season: p.season ?? 'all_year',
}));
const byName = (part: string) => places.find((p) => p.name.includes(part))!;
const names = (ids: number[]) => ids.map((id) => places.find((p) => p.id === id)!.name);

// Пятница, 20 ноября 2026, 19:00 по Севастополю (= 16:00 UTC).
const FRIDAY_EVENING = new Date('2026-11-20T16:00:00Z');
const JULY_EVENING = new Date('2026-07-17T16:00:00Z');

const answer = (over: Partial<MatchAnswer> = {}): MatchAnswer => ({
  userId: Math.floor(Math.random() * 1e9),
  budget: null,
  moods: [],
  districts: [],
  constraints: [],
  ...over,
});

describe('isOpenAt', () => {
  const bar = byName('Бар «Демо»').hours; // 18:00–03:00

  it('учитывает работу после полуночи', () => {
    expect(isOpenAt(bar, new Date('2026-11-20T22:00:00Z'))).toBe(true); // сб 01:00
    expect(isOpenAt(bar, new Date('2026-11-20T12:00:00Z'))).toBe(false); // пт 15:00
  });

  it('не предлагает место, которое закроется меньше чем через час', () => {
    const cafe = byName('Тестовый причал').hours; // 08:00–22:00
    expect(isOpenAt(cafe, new Date('2026-11-20T18:30:00Z'))).toBe(false); // 21:30
    expect(isOpenAt(cafe, new Date('2026-11-20T17:30:00Z'))).toBe(true); // 20:30
  });

  it('места без часов работы открыты всегда', () => {
    expect(isOpenAt(null, new Date('2026-11-20T23:59:00Z'))).toBe(true);
  });
});

describe('matchPlaces', () => {
  it('возвращает 5 мест без повторов', () => {
    const res = matchPlaces({ places, answers: [answer(), answer()], startsAt: FRIDAY_EVENING });
    expect(res).toHaveLength(5);
    expect(new Set(res.map((r) => r.placeId)).size).toBe(5);
  });

  it('при бюджете 0 ₽ предлагает только бесплатные места', () => {
    const res = matchPlaces({
      places,
      answers: [answer({ budget: 0 }), answer({ budget: 1000 })],
      startsAt: FRIDAY_EVENING,
    });
    expect(res.length).toBeGreaterThan(0);
    for (const r of res) expect(places.find((p) => p.id === r.placeId)!.avgCheck).toBe(0);
    expect(res[0]!.explanation).toContain('бесплатно');
  });

  it('летние места не предлагаются в ноябре, но предлагаются в июле', () => {
    const beach = byName('Пляж').id;
    const answers = [answer({ budget: 0, moods: ['outdoor'], districts: ['gagarinsky'] })];
    const nov = matchPlaces({ places, answers, startsAt: FRIDAY_EVENING, count: 10 });
    const jul = matchPlaces({ places, answers, startsAt: JULY_EVENING, count: 10 });
    expect(nov.map((r) => r.placeId)).not.toContain(beach);
    expect(jul.map((r) => r.placeId)).toContain(beach);
  });

  it('учитывает жёсткие ограничения участника', () => {
    const res = matchPlaces({
      places,
      answers: [answer({ moods: ['party'] }), answer({ moods: ['party'], constraints: ['under_18'] })],
      startsAt: FRIDAY_EVENING,
      count: 10,
    });
    for (const r of res) {
      expect(places.find((p) => p.id === r.placeId)!.features).not.toContain('adults_only');
    }
  });

  it('не больше трёх мест одного типа', () => {
    const res = matchPlaces({ places, answers: [answer({ moods: ['eat'] })], startsAt: FRIDAY_EVENING });
    const types = res.map((r) => places.find((p) => p.id === r.placeId)!.type);
    for (const t of new Set(types)) expect(types.filter((x) => x === t).length).toBeLessThanOrEqual(3);
  });

  it('опускает вниз место, которое совсем не подходит одному из участников', () => {
    // Один хочет поиграть в центре, второй — потусить в центре.
    // Квест подходит первому, но второму даёт 1 балл (только район) — не ноль.
    // Балаклава (без соседей) для участника из центра без совпадений = 0.
    const res = matchPlaces({
      places,
      answers: [
        answer({ moods: ['play'], districts: ['center'] }),
        answer({ moods: ['party'], districts: ['center'] }),
      ],
      startsAt: FRIDAY_EVENING,
      count: 10,
    });
    const firstZero = res.findIndex((r) => r.minParticipantScore === 0);
    if (firstZero !== -1) {
      expect(res.slice(firstZero).every((r) => r.minParticipantScore === 0)).toBe(true);
    }
    expect(res[0]!.minParticipantScore).toBeGreaterThan(0);
  });

  it('«другие варианты» не повторяют уже показанные места', () => {
    const answers = [answer(), answer()];
    const first = matchPlaces({ places, answers, startsAt: FRIDAY_EVENING });
    const second = matchPlaces({
      places,
      answers,
      startsAt: FRIDAY_EVENING,
      excludePlaceIds: first.map((r) => r.placeId),
    });
    const overlap = second.filter((r) => first.some((f) => f.placeId === r.placeId));
    expect(overlap).toHaveLength(0);
  });

  it('если ничего не подходит, ослабляет условие и честно пишет об этом', () => {
    const tiny: MatchPlace[] = [byName('Бар «Демо»')];
    const res = matchPlaces({
      places: tiny,
      answers: [answer({ budget: 500 })],
      startsAt: FRIDAY_EVENING,
    });
    expect(names(res.map((r) => r.placeId))).toEqual(['Бар «Демо»']);
    expect(res[0]!.relaxed).toEqual(['budget']);
    expect(res[0]!.explanation).toContain('не совпало');
  });

  it('правило «мне нет 18» не ослабляется, даже если иначе мест нет', () => {
    const adultsOnly = places.filter((p) => p.features.includes('adults_only'));
    expect(adultsOnly.length).toBeGreaterThan(0);
    const res = matchPlaces({ places: adultsOnly, answers: [answer({ constraints: ['under_18'] })], startsAt: FRIDAY_EVENING });
    expect(res).toEqual([]);
    // а нестрогое ограничение ослабляется, если без этого ничего не подобрать
    const noVeg = places.filter((p) => !p.features.includes('vegetarian_menu') && !p.features.includes('adults_only'));
    const relaxed = matchPlaces({ places: noVeg, answers: [answer({ constraints: ['vegetarian'] })], startsAt: FRIDAY_EVENING });
    expect(relaxed.length).toBeGreaterThan(0);
    expect(relaxed[0]!.relaxed).toContain('constraints');
  });

  it('предпочитает район участников', () => {
    const res = matchPlaces({
      places,
      answers: [
        answer({ moods: ['eat'], districts: ['korabelnaya'] }),
        answer({ moods: ['eat'], districts: ['korabelnaya'] }),
      ],
      startsAt: FRIDAY_EVENING,
    });
    const top = places.find((p) => p.id === res[0]!.placeId)!;
    expect(['korabelnaya', 'center']).toContain(top.district);
  });

  it('несколько районов: подходит место в любом из выбранных или рядом с ними', () => {
    const balaklava = places.find((p) => p.district === 'balaklava')!;
    const moods = { moods: [] as string[] };
    // 1 балл за «настроение всё равно» + 1 за район, если подходит
    expect(participantScore(balaklava, answer({ ...moods, districts: ['center'] }))).toBe(1);
    expect(participantScore(balaklava, answer({ ...moods, districts: ['center', 'balaklava'] }))).toBe(2);
    expect(participantScore(balaklava, answer({ ...moods, districts: [] }))).toBe(2); // любой район
    const korabelnaya = places.find((p) => p.district === 'korabelnaya')!;
    expect(participantScore(korabelnaya, answer({ ...moods, districts: ['balaklava', 'center'] }))).toBe(2); // сосед Центра
  });
});
