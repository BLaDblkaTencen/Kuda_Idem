import { eq } from 'drizzle-orm';
import { closeDb, db } from './client.js';
import { connectNodeDb } from './node.js';
import { places } from './schema.js';
import { TEST_PLACES } from './seed-places.js';

// Пересоздаёт только тестовые места; реальные (is_test_data = false) не трогает.
await connectNodeDb();
await db.delete(places).where(eq(places.isTestData, true));
await db.insert(places).values(TEST_PLACES.map((p) => ({ ...p, isTestData: true })));
console.log(`Загружено тестовых мест: ${TEST_PLACES.length}`);
await closeDb();
