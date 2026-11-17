import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { config } from './config.js';
import { placeRoutes } from './routes/places.js';
import { tripRoutes } from './routes/trips.js';
import { handleWebhook, WEBHOOK_PATH } from './bot.js';
import { fail } from './http/types.js';
import { BUDGET_OPTIONS, CONSTRAINTS, DISTRICTS, MOODS } from './domain/constants.js';

/**
 * Приложение API — общее для Node.js (index.ts) и Cloudflare Workers (worker.ts).
 * Экраны Mini App сюда не входят: их отдаёт точка входа (Node — serveStatic, Workers — assets).
 */
export function createApp() {
  const app = new Hono();

  // CORS нужен, только если экраны открыты с другого адреса (настройка читается при запросе).
  app.use('/api/*', async (c, next) => {
    if (!config.CORS_ORIGIN) return next();
    return cors({ origin: config.CORS_ORIGIN.split(',').map((s) => s.trim()) })(c, next);
  });

  app.get('/api/health', (c) => c.json({ ok: true, bot: config.botEnabled, botMode: config.BOT_MODE }));

  // Справочники для анкеты — фронтенд берёт подписи отсюда, а не дублирует их.
  app.get('/api/dictionaries', (c) =>
    c.json({
      moods: Object.entries(MOODS).map(([key, label]) => ({ key, label })),
      budgets: [
        ...BUDGET_OPTIONS.map((value) => ({ value, label: value === 0 ? 'бесплатно' : `до ${value} ₽` })),
        { value: null, label: 'не важно' },
      ],
      districts: Object.entries(DISTRICTS).map(([key, label]) => ({ key, label })),
      constraints: Object.entries(CONSTRAINTS).map(([key, c]) => ({ key, label: c.label })),
    }),
  );

  app.route('/api/places', placeRoutes);
  app.route('/api/trips', tripRoutes);
  app.post(WEBHOOK_PATH, (c) => handleWebhook(c.req.raw));

  app.notFound((c) => fail(c, 404, 'not_found', 'Не найдено'));
  app.onError((err, c) => {
    if (err instanceof HTTPException && err.status < 500) {
      return fail(c, err.status as 400, 'bad_request', err.message || 'Некорректный запрос');
    }
    console.error(err);
    return fail(c, 500, 'internal', 'Что-то пошло не так, попробуйте ещё раз');
  });

  return app;
}
