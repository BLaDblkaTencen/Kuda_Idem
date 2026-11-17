import { config } from './config.js';
import { buildApp } from './app.js';
import { startBot, stopBot } from './bot.js';
import { closeDb } from './db/client.js';
import { runMigrations, seedTestPlacesIfEmpty } from './db/setup.js';

// Таблицы создаются и обновляются сами при каждом запуске — на хостинге не нужно запускать миграции руками.
await runMigrations();
if (config.SEED_TEST_PLACES) {
  const added = await seedTestPlacesIfEmpty();
  if (added) console.log(`База была пустой — загружено тестовых мест: ${added}`);
}

const app = await buildApp();
await app.listen({ port: config.PORT, host: '0.0.0.0' });
console.log(`API запущен: http://localhost:${config.PORT}/api/health`);
if (config.devAuth) console.log('Включён вход для разработки (X-Dev-User-Id)');

try {
  await startBot();
} catch (err) {
  console.error('Не удалось запустить бота — проверьте BOT_TOKEN. API продолжает работать.', err);
}

const shutdown = async () => {
  await stopBot();
  await app.close();
  await closeDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
