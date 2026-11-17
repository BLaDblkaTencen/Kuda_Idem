import { z } from 'zod';

// Настройки читаются лениво — при первом обращении, а не при загрузке модуля.
// Так код работает и в Node.js, и в Cloudflare Workers, где переменные окружения
// доступны только во время обработки запроса.

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL не задан — скопируйте .env.example в .env'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BOT_TOKEN: z.string().default(''),
  // polling — бот сам опрашивает Telegram (локально); webhook — Telegram присылает обновления (Cloudflare).
  BOT_MODE: z.enum(['polling', 'webhook']).default('polling'),
  WEB_APP_URL: z.string().default(''),
  MINI_APP_SHORT_NAME: z.string().default(''),
  CORS_ORIGIN: z.string().default(''),
  DEV_AUTH: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  // Папка собранных экранов (apps/web/dist) для Node.js. Пусто — путь по умолчанию внутри репозитория.
  WEB_DIST_DIR: z.string().default(''),
  // Загрузить 18 тестовых мест при запуске, если в базе ещё нет ни одного места.
  SEED_TEST_PLACES: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

type Config = z.infer<typeof schema> & { devAuth: boolean; botEnabled: boolean };

let cached: Config | null = null;

function load(): Config {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `${i.path.join('.')} — ${i.message}`).join('; ');
    throw new Error(`Ошибка в настройках окружения: ${problems}`);
  }
  cached = {
    ...parsed.data,
    // Вход без Telegram разрешён только при разработке.
    devAuth: parsed.data.DEV_AUTH && parsed.data.NODE_ENV !== 'production',
    botEnabled: parsed.data.BOT_TOKEN.length > 0,
  };
  return cached;
}

/** Обращение `config.X` читает настройки при первом использовании. */
export const config = new Proxy({} as Config, {
  get: (_target, key) => load()[key as keyof Config],
});

/** Для Workers: подставить адрес приложения, если он не задан явно (берётся из первого запроса). */
export function setWebAppUrlIfMissing(origin: string): void {
  const c = load();
  if (!c.WEB_APP_URL) c.WEB_APP_URL = origin;
}
