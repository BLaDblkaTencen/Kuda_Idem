import { describe, expect, it } from 'vitest';
import { formatTripDate, yandexMapsLink } from './format.js';

describe('formatTripDate', () => {
  it('показывает время по Севастополю', () => {
    expect(formatTripDate(new Date('2026-11-20T16:00:00Z'))).toBe('пятница, 20 ноября в 19:00');
  });
});

describe('yandexMapsLink', () => {
  it('ищет по названию и адресу, если нет координат', () => {
    const link = yandexMapsLink({ name: 'Кафе', address: 'ул. Ленина, 1', lat: null, lon: null });
    expect(link).toContain('yandex.ru/maps/?text=');
    expect(decodeURIComponent(link)).toContain('Кафе, ул. Ленина, 1, Севастополь');
  });
});
