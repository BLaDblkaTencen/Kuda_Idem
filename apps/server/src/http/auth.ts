import type { MiddlewareHandler } from 'hono';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { validateInitData, type TelegramUser } from '../auth/telegram.js';
import { fail, type AppEnv } from './types.js';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

/**
 * Запрос пришёл с этого компьютера, а не через туннель или из интернета.
 * Прокси Vite сохраняет исходный Host, поэтому запрос через *.lhr.life сюда не пройдёт.
 */
function isLocalRequest(headers: { host?: string; forwarded?: string }): boolean {
  const hosts = [headers.host, headers.forwarded].filter((h): h is string => typeof h === 'string');
  return hosts.length > 0 && hosts.every((h) => LOCAL_HOSTS.has(h.replace(/:\d+$/, '').toLowerCase()));
}

/**
 * Определяет пользователя по заголовку `Authorization: tma <initData>`.
 * При разработке (DEV_AUTH=true) можно вместо этого передать `X-Dev-User-Id` и `X-Dev-User-Name` —
 * но только в запросах с localhost: через туннель или из интернета так войти нельзя.
 */
export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  let tgUser: TelegramUser | null = null;

  const auth = c.req.header('authorization');
  const devId = c.req.header('x-dev-user-id');
  if (auth?.startsWith('tma ')) {
    tgUser = validateInitData(auth.slice(4), config.BOT_TOKEN)?.user ?? null;
  } else if (
    config.devAuth &&
    devId &&
    isLocalRequest({ host: c.req.header('host'), forwarded: c.req.header('x-forwarded-host') })
  ) {
    const id = Number(devId);
    const name = c.req.header('x-dev-user-name');
    if (Number.isSafeInteger(id) && id > 0) {
      tgUser = { id, first_name: name ? decodeURIComponent(name) : `Тестер ${id}` };
    }
  }

  if (!tgUser) return fail(c, 401, 'unauthorized', 'Откройте приложение из Telegram');

  // Обновляем имя и фото при каждом входе — пользователь мог их сменить.
  const profile = {
    firstName: tgUser.first_name,
    lastName: tgUser.last_name ?? null,
    username: tgUser.username ?? null,
    photoUrl: tgUser.photo_url ?? null,
  };
  await db
    .insert(users)
    .values({ id: tgUser.id, ...profile })
    .onConflictDoUpdate({ target: users.id, set: profile });

  c.set('user', { id: tgUser.id, firstName: tgUser.first_name });
  await next();
};
