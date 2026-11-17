import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Корень репозитория: src/config.ts (или dist/config.js) → apps/server → корень.
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL не задан — скопируйте .env.example в .env'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BOT_TOKEN: z.string().default(''),
  WEB_APP_URL: z.string().default(''),
  MINI_APP_SHORT_NAME: z.string().default(''),
  CORS_ORIGIN: z.string().default(''),
  DEV_AUTH: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  // Папка собранных экранов (apps/web/dist). Пусто — путь по умолчанию внутри репозитория.
  WEB_DIST_DIR: z.string().default(''),
  // Загрузить 18 тестовых мест при запуске, если в базе ещё нет ни одного места.
  SEED_TEST_PLACES: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  for (const issue of parsed.error.issues) {
    console.error(`Ошибка в настройках окружения: ${issue.path.join('.')} — ${issue.message}`);
  }
  process.exit(1);
}

export const config = {
  ...parsed.data,
  // Вход без Telegram разрешён только при разработке.
  devAuth: parsed.data.DEV_AUTH && parsed.data.NODE_ENV !== 'production',
  botEnabled: parsed.data.BOT_TOKEN.length > 0,
};
