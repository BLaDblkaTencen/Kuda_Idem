import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MIGRATIONS } from './migrations.generated.js';

// Cloudflare Worker применяет миграции из migrations.generated.ts. Если после `drizzle-kit generate`
// забыть его обновить, опубликованная база отстанет от кода — этот тест не даст этого пропустить.
describe('встроенные миграции', () => {
  it('совпадают с SQL-файлами в apps/server/drizzle', () => {
    const dir = fileURLToPath(new URL('../../drizzle/', import.meta.url));
    const journal = JSON.parse(readFileSync(`${dir}meta/_journal.json`, 'utf8')) as { entries: Array<{ tag: string }> };
    expect(MIGRATIONS.map((m) => m.tag)).toEqual(journal.entries.map((e) => e.tag));
    for (const m of MIGRATIONS) {
      const fromFile = readFileSync(`${dir}${m.tag}.sql`, 'utf8')
        .split('--> statement-breakpoint')
        .map((s) => s.trim())
        .filter(Boolean);
      expect(m.statements, `миграция ${m.tag} устарела — запустите npm run db:generate`).toEqual(fromFile);
    }
  });
});
