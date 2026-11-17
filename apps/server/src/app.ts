import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { config, repoRoot } from './config.js';
import { placeRoutes } from './routes/places.js';
import { tripRoutes } from './routes/trips.js';
import {
  BUDGET_OPTIONS,
  CONSTRAINTS,
  DISTRICTS,
  MOODS,
} from './domain/constants.js';

export async function buildApp() {
  const app = Fastify({ logger: { level: config.NODE_ENV === 'production' ? 'info' : 'warn' } });

  if (config.CORS_ORIGIN) {
    await app.register(cors, { origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()) });
  }

  // Пустое тело с content-type JSON (например, POST .../suggest без параметров) считаем пустым объектом.
  app.removeContentTypeParser('application/json');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (!body) return done(null, {});
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(Object.assign(new Error('Некорректный JSON'), { statusCode: 400 }), undefined);
    }
  });

  app.get('/api/health',async () => ({ ok: true, bot: config.botEnabled }));

  // Справочники для анкеты — фронтенд берёт подписи отсюда, а не дублирует их.
  app.get('/api/dictionaries', async () => ({
    moods: Object.entries(MOODS).map(([key, label]) => ({ key, label })),
    budgets: [...BUDGET_OPTIONS.map((value) => ({ value, label: value === 0 ? 'бесплатно' : `до ${value} ₽` })), { value: null, label: 'не важно' }],
    districts: Object.entries(DISTRICTS).map(([key, label]) => ({ key, label })),
    constraints: Object.entries(CONSTRAINTS).map(([key, c]) => ({ key, label: c.label })),
  }));

  await app.register(placeRoutes);
  await app.register(tripRoutes);

  // Собранные экраны Mini App отдаёт этот же сервер — всё приложение живёт на одном HTTPS-адресе.
  const webDist = config.WEB_DIST_DIR ? resolve(config.WEB_DIST_DIR) : resolve(repoRoot, 'apps/web/dist');
  if (existsSync(join(webDist, 'index.html'))) {
    await app.register(fastifyStatic, {
      root: webDist,
      cacheControl: false,
      setHeaders(res, filePath) {
        // Файлы из assets/ имеют хэш в имени — их можно кэшировать навсегда, index.html — никогда.
        res.header(
          'cache-control',
          /[\\/]assets[\\/]/.test(filePath) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
    app.log.info(`Экраны отдаются из ${webDist}`);
  }

  app.setErrorHandler((err: { statusCode?: number; message?: string }, _req, reply) => {
    app.log.error(err);
    const status = err.statusCode && err.statusCode < 500 ? err.statusCode : 500;
    void reply.code(status).send({
      error: status === 500 ? 'internal' : 'bad_request',
      message: status === 500 ? 'Что-то пошло не так, попробуйте ещё раз' : (err.message ?? 'Некорректный запрос'),
    });
  });

  return app;
}
