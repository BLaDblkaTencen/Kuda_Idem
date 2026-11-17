// Точка входа для Node.js: разработка на компьютере (npm run dev / npm run telegram) и Docker.

import { existsSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { config } from './config.js';
import { createApp } from './app.js';
import { startPolling, stopBot } from './bot.js';
import { closeDb } from './db/client.js';
import { connectNodeDb, repoRoot, runNodeMigrations } from './db/node.js';
import { seedTestPlacesIfEmpty } from './db/setup.js';

await connectNodeDb();
// Таблицы создаются и обновляются сами при каждом запуске.
await runNodeMigrations();
if (config.SEED_TEST_PLACES) {
  const added = await seedTestPlacesIfEmpty();
  if (added) console.log(`База была пустой — загружено тестовых мест: ${added}`);
}

const app = createApp();

// Собранные экраны (apps/web/dist) отдаёт этот же сервер, если они есть.
const webDist = config.WEB_DIST_DIR ? resolve(config.WEB_DIST_DIR) : resolve(repoRoot, 'apps/web/dist');
if (existsSync(join(webDist, 'index.html'))) {
  app.use(
    '/*',
    serveStatic({
      root: relative(process.cwd(), webDist),
      // Файлы из assets/ имеют хэш в имени — их можно кэшировать навсегда, index.html — никогда.
      onFound: (path, c) => {
        c.header('cache-control', /[\\/]assets[\\/]/.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
      },
    }),
  );
}

const server = serve({ fetch: app.fetch, port: config.PORT, hostname: '0.0.0.0' });
console.log(`API запущен: http://localhost:${config.PORT}/api/health`);
if (config.devAuth) console.log('Включён вход для разработки (X-Dev-User-Id)');

if (config.BOT_MODE === 'polling') {
  try {
    await startPolling();
  } catch (err) {
    console.error('Не удалось запустить бота — проверьте BOT_TOKEN. API продолжает работать.', err);
  }
}

const shutdown = async () => {
  await stopBot();
  server.close();
  await closeDb();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
