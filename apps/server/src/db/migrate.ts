import { closeDb } from './client.js';
import { connectNodeDb, runNodeMigrations } from './node.js';

await connectNodeDb();
await runNodeMigrations();
console.log('Миграции применены');
await closeDb();
