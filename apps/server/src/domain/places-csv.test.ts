import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseCsv, parsePlacesCsv } from './places-csv.js';
import { createHash } from 'node:crypto';
import { PLACES, PLACES_VERSION } from '../db/places.generated.js';

const csvPath = fileURLToPath(new URL('../../../../data/places-sevastopol.csv', import.meta.url));

describe('таблица мест', () => {
  it('сгенерированный код совпадает с data/places-sevastopol.csv', () => {
    const fromCsv = parsePlacesCsv(readFileSync(csvPath, 'utf8'), 'any');
    const strip = (p: object) => ({ ...p, verifiedAt: undefined });
    expect(PLACES.map(strip), 'таблица изменилась — запустите npm run places:build').toEqual(fromCsv.map(strip));
  });

  it('отпечаток таблицы соответствует местам (иначе сервер не заметит изменений)', () => {
    const version = createHash('sha256').update(JSON.stringify(PLACES)).digest('hex').slice(0, 16);
    expect(PLACES_VERSION, 'запустите npm run places:build').toBe(version);
  });

  it('у каждого места есть часы и координаты в пределах Севастополя', () => {
    for (const p of PLACES) {
      expect(p.lat, p.name).toBeGreaterThan(44.3);
      expect(p.lat, p.name).toBeLessThan(44.8);
      expect(p.lon, p.name).toBeGreaterThan(33.3);
      expect(p.lon, p.name).toBeLessThan(33.9);
      expect(p.avgCheck, p.name).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('parsePlacesCsv', () => {
  const header =
    'название;тип;вид;район;адрес;широта;долгота;чек_руб;настроения;особенности;макс_компания;часы;сезон;описание;источник_2гис;сайт';
  const row = (over: Partial<Record<string, string>> = {}) => {
    const v = {
      name: 'Кафе', type: 'cafe', district: 'center', moods: 'eat', features: 'karaoke', hours: 'Пн-Вс 10:00-22:00', id: '1',
      ...over,
    };
    return `${v.name};${v.type};кафе;${v.district};ул. Тест, 1;44.6;33.5;500;${v.moods};${v.features};10;${v.hours};all_year;Описание;${v.id};`;
  };

  it('разбирает строку в место', () => {
    const [p] = parsePlacesCsv(`${header}\n${row()}`, '2026-11-17');
    expect(p).toMatchObject({ name: 'Кафе', district: 'center', avgCheck: 500, moods: ['eat'], features: ['karaoke'] });
  });

  it('называет строку и колонку с ошибкой', () => {
    expect(() => parsePlacesCsv(`${header}\n${row({ district: 'luna' })}`, 'x')).toThrow(/Строка 2.*район/);
    expect(() => parsePlacesCsv(`${header}\n${row({ moods: 'eat, dance' })}`, 'x')).toThrow(/«dance».*настроения/);
    expect(() => parsePlacesCsv(`${header}\n${row({ hours: 'всегда' })}`, 'x')).toThrow(/Строка 2.*часы/);
    expect(() => parsePlacesCsv(`${header}\n${row()}\n${row({ name: 'Другое' })}`, 'x')).toThrow(/Строка 3.*повторяется/);
  });

  it('понимает поля в кавычках с «;» внутри', () => {
    expect(parseCsv('a;"b;c";d\n')).toEqual([['a', 'b;c', 'd']]);
  });
});
