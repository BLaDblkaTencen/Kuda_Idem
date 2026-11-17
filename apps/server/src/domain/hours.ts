import type { WeeklyHours } from '../db/schema.js';

// Разбор часов работы из таблицы мест.
// Формат: «Пн-Пт 08:00-21:00 / Сб-Вс 09:00-21:00», «Пн-Вс 10:00-22:00», «Вс-Чт 11:00-02:00 / Пт-Сб 11:00-04:00»,
// «Пн выходной / Вт-Вс 12:00-23:00», «круглосуточно». Дни, которые не упомянуты, — выходные.

// Порядок с понедельника, как пишут люди. В приложении индекс 0 = воскресенье (как Date.getDay()).
const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
const toJsDay = (mondayFirst: number) => (mondayFirst + 1) % 7;
const TIME = /^([01]\d|2[0-4]):([0-5]\d)$/;

function dayIndex(name: string, source: string): number {
  const i = DAYS.indexOf(name.trim());
  if (i < 0) throw new Error(`Неизвестный день «${name}» в часах «${source}»`);
  return i;
}

/** Дни из «Пн-Пт», «Вс-Чт» (через воскресенье) или «Сб» → индексы JS (0 = воскресенье). */
function expandDays(spec: string, source: string): number[] {
  const [from, to] = spec.split('-');
  const a = dayIndex(from!, source);
  const b = to === undefined ? a : dayIndex(to, source);
  const result: number[] = [];
  for (let i = a; ; i = (i + 1) % 7) {
    result.push(toJsDay(i));
    if (i === b) break;
  }
  return result;
}

export function parseWeeklyHours(text: string): WeeklyHours | null {
  const source = text.trim();
  if (/^круглосуточно$/i.test(source)) return null; // null = открыто всегда

  const week: WeeklyHours = [null, null, null, null, null, null, null];
  for (const part of source.split('/')) {
    const m = part.trim().match(/^([А-Яа-я]{2}(?:-[А-Яа-я]{2})?)\s+(.+)$/);
    if (!m) throw new Error(`Не понял часы «${part.trim()}» в «${source}». Пример: «Пн-Пт 08:00-21:00»`);
    const days = expandDays(m[1]!, source);
    const time = m[2]!.trim();
    if (/^выходной$/i.test(time)) {
      for (const d of days) week[d] = null;
      continue;
    }
    const [open, close] = time.split('-').map((s) => s.trim());
    if (!open || !close || !TIME.test(open) || !TIME.test(close)) {
      throw new Error(`Не понял время «${time}» в «${source}». Пример: «10:00-22:00»`);
    }
    for (const d of days) week[d] = { open, close };
  }
  return week;
}
