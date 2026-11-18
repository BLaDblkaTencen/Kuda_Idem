import { describe, expect, it } from 'vitest';
import { PLACES } from '../db/places.generated.js';
import { openUntil, placeIcon, placeTags } from './place-badges.js';

const week = (open: string, close: string) => Array.from({ length: 7 }, () => ({ open, close }));
const FRIDAY_19 = new Date('2026-11-20T16:00:00Z'); // пятница 19:00 по Севастополю

describe('значок места', () => {
  it('по виду, а если вида нет — по категории', () => {
    expect(placeIcon({ kind: 'кинотеатр', type: 'entertainment' })).toBe('🎬');
    expect(placeIcon({ kind: 'антикинотеатр', type: 'anticafe' })).toBe('🍿');
    expect(placeIcon({ kind: 'VR-арена', type: 'entertainment' })).toBe('🥽');
    expect(placeIcon({ kind: 'пивоварня', type: 'bar' })).toBe('🍺');
    expect(placeIcon({ kind: 'лаундж-кафе', type: 'cafe' })).toBe('🍴');
    expect(placeIcon({ kind: 'что-то новое', type: 'park' })).toBe('🌳');
    expect(placeIcon({ kind: null, type: 'unknown' })).toBe('📍');
  });

  it('у всех мест из таблицы значок не по умолчанию', () => {
    for (const p of PLACES) expect(placeIcon({ kind: p.kind, type: p.type }), p.name).not.toBe('📍');
  });
});

describe('метки места', () => {
  it('бесплатно, 18+, особенности и часы', () => {
    expect(
      placeTags({ avgCheck: 0, features: ['no_food', 'sea_view'], moods: ['outdoor'], hours: null }, FRIDAY_19),
    ).toEqual(['бесплатно', '🌊 вид на море', '🕑 круглосуточно']);
    expect(
      placeTags({ avgCheck: 1000, features: ['hookah', 'adults_only'], moods: ['chill'], hours: week('12:00', '02:00') }, FRIDAY_19),
    ).toEqual(['18+', '💨 кальян', '🕑 до 02:00']);
    expect(placeTags({ avgCheck: 0, features: ['no_food'], moods: ['outdoor'], hours: null }, FRIDAY_19)).toContain('🌳 на воздухе');
  });

  it('часы в день встречи', () => {
    expect(openUntil(week('10:00', '24:00'), FRIDAY_19)).toBe('до 00:00');
    expect(openUntil(week('00:00', '24:00'), FRIDAY_19)).toBe('круглосуточно');
    // суббота 01:00 — ещё идёт пятничная смена до 04:00
    expect(openUntil(week('18:00', '04:00'), new Date('2026-11-20T22:00:00Z'))).toBe('до 04:00');
  });
});
