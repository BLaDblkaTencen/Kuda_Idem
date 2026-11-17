import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.js';
import { db } from '../db/client.js';
import { users } from '../db/schema.js';
import { validateInitData, type TelegramUser } from '../auth/telegram.js';

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: number; firstName: string };
  }
}

/**
 * Определяет пользователя по заголовку `Authorization: tma <initData>`.
 * При разработке (DEV_AUTH=true) можно вместо этого передать `X-Dev-User-Id` и `X-Dev-User-Name`.
 */
export async function requireUser(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  let tgUser: TelegramUser | null = null;

  const auth = req.headers.authorization;
  if (auth?.startsWith('tma ')) {
    tgUser = validateInitData(auth.slice(4), config.BOT_TOKEN)?.user ?? null;
  } else if (config.devAuth && req.headers['x-dev-user-id']) {
    const id = Number(req.headers['x-dev-user-id']);
    const name = req.headers['x-dev-user-name'];
    if (Number.isSafeInteger(id) && id > 0) {
      tgUser = { id, first_name: typeof name === 'string' && name ? decodeURIComponent(name) : `Тестер ${id}` };
    }
  }

  if (!tgUser) {
    await reply.code(401).send({ error: 'unauthorized', message: 'Откройте приложение из Telegram' });
    return;
  }

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

  req.user = { id: tgUser.id, firstName: tgUser.first_name };
}
