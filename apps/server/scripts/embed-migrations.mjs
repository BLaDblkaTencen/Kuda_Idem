// Встраивает SQL-миграции из apps/server/drizzle в код (src/db/migrations.generated.ts),
// чтобы Cloudflare Worker мог применить их сам: у Workers нет доступа к файлам.
// Запускается автоматически после `npm run db:generate`.

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('../drizzle/', import.meta.url));
const out = fileURLToPath(new URL('../src/db/migrations.generated.ts', import.meta.url));

const journal = JSON.parse(readFileSync(`${dir}meta/_journal.json`, 'utf8'));
const migrations = journal.entries.map((e) => ({
  tag: e.tag,
  statements: readFileSync(`${dir}${e.tag}.sql`, 'utf8')
    .split('--> statement-breakpoint')
    .map((s) => s.trim())
    .filter(Boolean),
}));

writeFileSync(
  out,
  `// Сгенерировано scripts/embed-migrations.mjs — не редактируйте вручную.\n` +
    `export const MIGRATIONS: ReadonlyArray<{ tag: string; statements: readonly string[] }> = ${JSON.stringify(migrations, null, 2)};\n`,
);
console.log(`Встроено миграций: ${migrations.length} → src/db/migrations.generated.ts`);
