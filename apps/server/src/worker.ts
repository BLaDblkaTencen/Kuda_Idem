// Точка входа для Cloudflare Workers.
// Экраны Mini App отдаёт сам Cloudflare (assets в wrangler.jsonc) — сюда доходят только /api/*.
// При первом запросе экземпляр Worker'а: подключает Neon, применяет миграции,
// при необходимости загружает тестовые места и подключает вебхук бота.

import type { ExecutionContext } from 'hono';
import { config, setWebAppUrlIfMissing } from './config.js';
import { createApp } from './app.js';
import { ensureWebhook } from './bot.js';
import { connectWorkerDb, runEmbeddedMigrations } from './db/worker.js';
import { seedTestPlacesIfMissing, syncPlaces } from './db/setup.js';

const app = createApp();
let ready: Promise<void> | null = null;

async function setup(origin: string): Promise<void> {
  setWebAppUrlIfMissing(origin);
  const sql = connectWorkerDb(config.DATABASE_URL);
  const applied = await runEmbeddedMigrations(sql);
  if (applied) console.log(`Применено миграций: ${applied}`);
  if (config.SEED_TEST_PLACES) {
    const added = await seedTestPlacesIfMissing();
    if (added) console.log(`Загружено тестовых мест: ${added}`);
  }
  await syncPlaces({ keepTestPlaces: config.SEED_TEST_PLACES });
  if (config.botEnabled) {
    // Ошибка Telegram не должна ломать API: в худшем случае бот подключится при следующем запуске.
    await ensureWebhook(origin).catch((err) => console.error('Не удалось подключить вебхук бота:', err));
  }
}

export default {
  async fetch(request: Request, env: Record<string, unknown>, ctx: ExecutionContext): Promise<Response> {
    // Переменные и секреты Worker'а → process.env, откуда их читает config.ts.
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && process.env[key] === undefined) process.env[key] = value;
    }
    ready ??= setup(new URL(request.url).origin).catch((err) => {
      ready = null; // следующий запрос попробует снова
      throw err;
    });
    try {
      await ready;
    } catch (err) {
      console.error('Не удалось подготовить приложение:', err);
      return Response.json(
        { error: 'setup_failed', message: 'Сервер не смог подключиться к базе. Проверьте DATABASE_URL.' },
        { status: 503 },
      );
    }
    return app.fetch(request, env, ctx);
  },
};
