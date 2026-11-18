// Превращает таблицу data/places-sevastopol.csv в код (src/db/places.generated.ts).
// Сервер при запуске приводит базу в соответствие с этим списком (см. db/setup.ts).
// Запуск: npm run places:build — после каждой правки таблицы.

import { createHash } from 'node:crypto';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePlacesCsv } from '../src/domain/places-csv.js';

const csvPath = fileURLToPath(new URL('../../../data/places-sevastopol.csv', import.meta.url));
const outPath = fileURLToPath(new URL('../src/db/places.generated.ts', import.meta.url));

// Дата проверки = дата последнего изменения таблицы.
const verifiedAt = statSync(csvPath).mtime.toISOString().slice(0, 10);
const places = parsePlacesCsv(readFileSync(csvPath, 'utf8'), verifiedAt);
// Отпечаток таблицы: сервер синхронизирует места с базой, только когда он изменился (db/setup.ts).
const version = createHash('sha256').update(JSON.stringify(places)).digest('hex').slice(0, 16);

writeFileSync(
  outPath,
  `// Сгенерировано из data/places-sevastopol.csv командой npm run places:build — не редактируйте вручную.\n` +
    `import type { NewPlace } from './schema.js';\n\n` +
    `export const PLACES: NewPlace[] = ${JSON.stringify(places, null, 2)};\n\n` +
    `// Отпечаток таблицы: сервер синхронизирует места с базой, только когда он изменился.\n` +
    `export const PLACES_VERSION = '${version}';\n`,
);
console.log(`Мест в таблице: ${places.length} → src/db/places.generated.ts (версия ${version})`);
