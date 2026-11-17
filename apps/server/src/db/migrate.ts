import { closeDb } from './client.js';
import { runMigrations } from './setup.js';

await runMigrations();
console.log('Миграции применены');
await closeDb();
