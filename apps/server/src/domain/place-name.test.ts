import { describe, expect, it } from 'vitest';
import { placeTitle, placeTitleTo, toAccusative } from './place-name.js';

describe('название места с видом заведения', () => {
  it('вид перед названием', () => {
    expect(placeTitle({ name: 'Победа', type: 'entertainment', kind: 'кинотеатр' })).toBe('Кинотеатр «Победа»');
    expect(placeTitle({ name: 'Кафе «Маяк»', type: 'cafe', kind: null })).toBe('Кафе «Маяк»');
    expect(placeTitle({ name: 'Маяк', type: 'cafe', kind: null })).toBe('Кафе «Маяк»');
    expect(placeTitleTo({ name: 'Антикафе «Время»', type: 'anticafe', kind: null })).toBe('антикафе «Время»');
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
    expect(placeTitleTo({ name: 'Челентано', type: 'cafe', kind: 'пиццерия' })).toBe('пиццерию «Челентано»');
  });
});
