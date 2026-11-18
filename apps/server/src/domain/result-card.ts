import type { Place } from '../db/schema.js';
import { toCityTime } from '../matching/match.js';
import { DISTRICTS, type District } from './constants.js';
import { formatTripDate } from './format.js';
import { placeGoTo } from './place-name.js';

// Карточка итога вылазки, которую бот присылает каждому участнику в личный чат.
// Текст в разметке HTML (parse_mode: 'HTML'), поэтому всё из базы экранируется.

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Часы работы в день встречи. Ночью (после полуночи) берётся смена предыдущего дня. */
export function hoursOnTripDay(hours: Place['hours'], startsAt: Date): string | null {
  if (hours === null) return 'открыто круглосуточно';
  const { weekday, minutes } = toCityTime(startsAt);
  const yesterday = hours[(weekday + 6) % 7];
  if (yesterday && yesterday.close < yesterday.open) {
    const [h, m] = yesterday.close.split(':').map(Number);
    if (minutes < (h ?? 0) * 60 + (m ?? 0)) return `в этот день работает до ${yesterday.close}`;
  }
  const today = hours[weekday];
  return today ? `в этот день работает ${today.open}–${today.close}` : null;
}

/** Адрес сайта из таблицы («tombee.ru», «пакетеды.рф») → ссылка для кнопки Telegram. */
export function websiteUrl(site: string | null): string | null {
  if (!site) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`);
    return url.href; // кириллический домен превращается в punycode
  } catch {
    return null;
  }
}

export function resultCardText(opts: { place: Place; startsAt: Date; participants: string[] }): string {
  const { place, startsAt, participants } = opts;
  const district = DISTRICTS[place.district as District] ?? place.district;
  const price = place.avgCheck === 0 ? 'бесплатно' : `≈ ${place.avgCheck} ₽ на человека`;
  const hours = hoursOnTripDay(place.hours, startsAt);

  const lines = [
    `🎉 <b>Идём ${escape(placeGoTo(place))}</b>`,
    '',
    `🗓 ${escape(formatTripDate(startsAt))}`,
    `📍 ${escape(place.address)} · ${escape(district)}`,
    `💸 ${price}`,
  ];
  if (hours) lines.push(`🕑 ${hours}`);
  if (place.description) lines.push('', escape(place.description));
  if (participants.length) lines.push('', `👥 Идут: ${participants.map(escape).join(', ')}`);
  return lines.join('\n');
}
