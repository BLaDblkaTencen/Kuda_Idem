import { describe, expect, it } from 'vitest';
import { placeGoTo, placeTitle, toAccusative } from './place-name.js';

describe('название места с видом заведения', () => {
  it('вид перед названием', () => {
    expect(placeTitle({ name: 'Победа', type: 'entertainment', kind: 'кинотеатр' })).toBe('Кинотеатр «Победа»');
    expect(placeTitle({ name: 'Кафе «Маяк»', type: 'cafe', kind: null })).toBe('Кафе «Маяк»');
    expect(placeTitle({ name: 'Маяк', type: 'cafe', kind: null })).toBe('Кафе «Маяк»');
    expect(placeGoTo({ name: 'Антикафе «Время»', type: 'anticafe', kind: null })).toBe('в антикафе «Время»');
  });

  it('винительный падеж после «Идём в»', () => {
    const cases: Record<string, string> = {
      кинотеатр: 'кинотеатр',
      пиццерия: 'пиццерию',
      столовая: 'столовую',
      кофейня: 'кофейню',
      пивоварня: 'пивоварню',
      'бильярдный клуб': 'бильярдный клуб',
      'караоке-клуб': 'караоке-клуб',
      'пляжное кафе': 'пляжное кафе',
      'кафе-бар': 'кафе-бар',
      'ночная пекарня': 'ночную пекарню',
    };
    for (const [from, to] of Object.entries(cases)) expect(toAccusative(from), from).toBe(to);
    expect(placeGoTo({ name: 'Челентано', type: 'cafe', kind: 'пиццерия' })).toBe('в пиццерию «Челентано»');
  });

  it('вид уже в названии и предлог «на»', () => {
    const park = { name: 'Парк Победы', type: 'park', kind: 'парк' };
    expect(placeTitle(park)).toBe('Парк Победы');
    expect(placeGoTo(park)).toBe('в Парк Победы');
    const blvd = { name: 'Приморский бульвар', type: 'park', kind: 'бульвар' };
    expect(placeTitle(blvd)).toBe('Приморский бульвар');
    expect(placeGoTo(blvd)).toBe('на Приморский бульвар');
    expect(placeGoTo({ name: 'Набережная Балаклавы', type: 'viewpoint', kind: 'набережная' })).toBe('на Набережную Балаклавы');
    expect(placeGoTo({ name: 'Чембало', type: 'viewpoint', kind: 'крепость' })).toBe('в крепость «Чембало»');
    expect(placeTitle({ name: 'Warpoint', type: 'entertainment', kind: 'VR-арена' })).toBe('VR-арена «Warpoint»');
    expect(placeGoTo({ name: 'Warpoint', type: 'entertainment', kind: 'VR-арена' })).toBe('в VR-арену «Warpoint»');
  });
});
