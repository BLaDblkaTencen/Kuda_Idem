import { describe, expect, it } from 'vitest';
import { parseWeeklyHours } from './hours.js';

describe('parseWeeklyHours', () => {
  it('будни и выходные', () => {
    const w = parseWeeklyHours('Пн-Пт 08:00-21:00 / Сб-Вс 09:00-21:00')!;
    expect(w[1]).toEqual({ open: '08:00', close: '21:00' }); // понедельник
    expect(w[5]).toEqual({ open: '08:00', close: '21:00' }); // пятница
    expect(w[6]).toEqual({ open: '09:00', close: '21:00' }); // суббота
    expect(w[0]).toEqual({ open: '09:00', close: '21:00' }); // воскресенье
  });

  it('диапазон через воскресенье и работа после полуночи', () => {
    const w = parseWeeklyHours('Вс-Чт 11:00-02:00 / Пт-Сб 11:00-04:00')!;
    expect(w[0]).toEqual({ open: '11:00', close: '02:00' });
    expect(w[4]).toEqual({ open: '11:00', close: '02:00' }); // четверг
    expect(w[5]).toEqual({ open: '11:00', close: '04:00' }); // пятница
  });

  it('одиночные дни, выходной и неупомянутые дни', () => {
    const w = parseWeeklyHours('Пн выходной / Вт-Сб 12:00-23:00')!;
    expect(w[1]).toBeNull();
    expect(w[2]).toEqual({ open: '12:00', close: '23:00' });
    expect(w[0]).toBeNull(); // воскресенье не упомянуто — выходной
  });

  it('круглосуточно и полночь как 24:00', () => {
    expect(parseWeeklyHours('круглосуточно')).toBeNull();
    expect(parseWeeklyHours('Пн-Вс 12:00-24:00')![3]).toEqual({ open: '12:00', close: '24:00' });
  });

  it('понятно ругается на ошибки', () => {
    expect(() => parseWeeklyHours('Пн-Пт 8-21')).toThrow(/Не понял время/);
    expect(() => parseWeeklyHours('Понедельник 10:00-20:00')).toThrow(/Не понял часы/);
    expect(() => parseWeeklyHours('Пн-Хх 10:00-20:00')).toThrow(/Неизвестный день/);
  });
});
