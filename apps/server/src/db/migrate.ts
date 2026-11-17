import { closeDb, db, migrationsFolder, usingPglite } from './client.js';

if (usingPglite) {
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  await migrate(db as never, { migrationsFolder });
} else {
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  await migrate(db, { migrationsFolder });
}
console.log('Миграции применены');
await closeDb();
