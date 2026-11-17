import { describe, expect, it } from 'vitest';
import type { Place } from '../db/schema.js';
import { hoursOnTripDay, resultCardText, websiteUrl } from './result-card.js';

const week = (open: string, close: string) => Array.from({ length: 7 }, () => ({ open, close }));

const place = {
  name: 'Бар <Маяк>',
  type: 'bar',
  kind: 'пивоварня',
  district: 'center',
  address: 'ул. Ленина, 1',
  avgCheck: 900,
  hours: week('12:00', '23:00'),
  description: 'Настолки & пицца',
} as Place;

// Пятница, 20 ноября, 19:00 по Севастополю.
const friday19 = new Date('2026-11-20T16:00:00Z');

describe('resultCardText', () => {
  it('собирает место, время, чек, часы и участников', () => {
    const text = resultCardText({ place, startsAt: friday19, participants: ['Маша', 'Петя'] });
    expect(text).toContain('<b>Идём в пивоварню «Бар &lt;Маяк&gt;»</b>');
    expect(text).toContain('пятница, 20 ноября в 19:00');
    expect(text).toContain('ул. Ленина, 1 · Центр');
    expect(text).toContain('≈ 900 ₽ на человека');
    expect(text).toContain('в этот день работает 12:00–23:00');
    expect(text).toContain('Настолки &amp; пицца');
    expect(text).toContain('Идут: Маша, Петя');
  });

  it('бесплатное место и без описания', () => {
    const text = resultCardText({ place: { ...place, avgCheck: 0, description: '' }, startsAt: friday19, participants: [] });
    expect(text).toContain('бесплатно');
    expect(text).not.toContain('Идут');
  });
});

describe('websiteUrl', () => {
  it('дописывает https и переводит кириллический домен', () => {
    expect(websiteUrl('tombee.ru')).toBe('https://tombee.ru/');
    expect(websiteUrl('http://a.ru/menu')).toBe('http://a.ru/menu');
    expect(websiteUrl('пакетеды.рф')).toMatch(/^https:\/\/xn--/);
    expect(websiteUrl('')).toBeNull();
  });
});

describe('hoursOnTripDay', () => {
  it('круглосуточно, выходной и ночная смена', () => {
    expect(hoursOnTripDay(null, friday19)).toBe('открыто круглосуточно');
    const closedFriday = week('12:00', '23:00').map((d, i) => (i === 5 ? null : d));
    expect(hoursOnTripDay(closedFriday, friday19)).toBeNull();
    // Суббота 01:00 — ещё идёт пятничная смена до 04:00.
    expect(hoursOnTripDay(week('18:00', '04:00'), new Date('2026-11-20T22:00:00Z'))).toBe('в этот день работает до 04:00');
  });
});
