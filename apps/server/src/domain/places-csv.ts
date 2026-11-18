import type { NewPlace } from '../db/schema.js';
import { DISTRICTS, FEATURES, MOODS, PLACE_TYPES, SEASONS } from './constants.js';
import { parseWeeklyHours } from './hours.js';

// Разбор таблицы мест data/places-sevastopol.csv (разделитель «;», UTF-8, первая строка — заголовки).
// Каждая ошибка сообщается с номером строки, чтобы её было легко найти в Excel.

const COLUMNS = [
  'название', 'тип', 'вид', 'район', 'адрес', 'широта', 'долгота', 'чек_руб', 'настроения', 'атмосфера',
  'особенности', 'макс_компания', 'можно_без_заказа', 'часы', 'сезон', 'описание', 'источник_2гис', 'сайт',
] as const;

/** Минимальный разбор CSV: разделитель «;», поля в кавычках могут содержать «;» и переносы. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ';') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((f) => f.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((f) => f.trim() !== '')) rows.push(row);
  return rows;
}

const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);

function checkKeys(values: string[], allowed: object, what: string, line: number): string[] {
  for (const v of values) {
    if (!(v in allowed)) {
      throw new Error(`Строка ${line}: неизвестное значение «${v}» в колонке «${what}». Допустимо: ${Object.keys(allowed).join(', ')}`);
    }
  }
  return values;
}

export function parsePlacesCsv(text: string, verifiedAt: string): NewPlace[] {
  const [header, ...rows] = parseCsv(text);
  if (!header) throw new Error('Таблица мест пустая');
  const col = Object.fromEntries(COLUMNS.map((name) => {
    const i = header.findIndex((h) => h.trim() === name);
    if (i < 0) throw new Error(`В таблице мест нет колонки «${name}»`);
    return [name, i];
  })) as Record<(typeof COLUMNS)[number], number>;

  const seen = new Set<string>();
  return rows.map((r, idx) => {
    const line = idx + 2; // +1 за заголовок, +1 потому что строки в Excel с единицы
    const get = (name: (typeof COLUMNS)[number]) => (r[col[name]] ?? '').trim();
    const num = (name: (typeof COLUMNS)[number]) => {
      const v = Number(get(name).replace(',', '.'));
      if (!Number.isFinite(v)) throw new Error(`Строка ${line}: в колонке «${name}» должно быть число, а там «${get(name)}»`);
      return v;
    };

    const name = get('название');
    if (!name) throw new Error(`Строка ${line}: пустое название`);
    const externalId = get('источник_2гис');
    if (!externalId) throw new Error(`Строка ${line} («${name}»): нет id из 2ГИС`);
    if (seen.has(externalId)) throw new Error(`Строка ${line} («${name}»): id 2ГИС повторяется`);
    seen.add(externalId);

    let hours;
    try {
      hours = parseWeeklyHours(get('часы'));
    } catch (e) {
      throw new Error(`Строка ${line} («${name}»): ${(e as Error).message}`);
    }

    const kind = get('вид'); // как написано в таблице: «кинотеатр», «VR-арена»
    if (!kind) throw new Error(`Строка ${line} («${name}»): пустой «вид» — например «кинотеатр» или «пиццерия»`);

    const noOrder = get('можно_без_заказа').toLowerCase();
    if (!['да', 'нет'].includes(noOrder)) throw new Error(`Строка ${line}: «можно_без_заказа» — «да» или «нет»`);

    return {
      city: 'sevastopol',
      externalId,
      name,
      type: checkKeys([get('тип')], PLACE_TYPES, 'тип', line)[0]!,
      kind,
      district: checkKeys([get('район')], DISTRICTS, 'район', line)[0]!,
      address: get('адрес'),
      lat: num('широта'),
      lon: num('долгота'),
      avgCheck: num('чек_руб'),
      moods: checkKeys(list(get('настроения')), MOODS, 'настроения', line),
      vibes: list(get('атмосфера')),
      features: checkKeys(list(get('особенности')), FEATURES, 'особенности', line),
      maxGroupSize: num('макс_компания'),
      noOrderOk: noOrder === 'да',
      hours,
      season: checkKeys([get('сезон') || 'all_year'], SEASONS, 'сезон', line)[0]!,
      description: get('описание'),
      website: get('сайт') || null,
      verifiedAt,
      isTestData: false,
      isActive: true,
    } satisfies NewPlace;
  });
}
