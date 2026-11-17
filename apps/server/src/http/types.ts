import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Что middleware входа кладёт в контекст запроса. */
export type AppEnv = {
  Variables: { user: { id: number; firstName: string } };
};

/** Единый формат ошибки API: { error: код, message: текст для пользователя }. */
export function fail(c: Context, status: ContentfulStatusCode, error: string, message: string, extra: object = {}) {
  return c.json({ error, message, ...extra }, status);
}

export const INVALID_JSON = Symbol('invalid-json');

/**
 * Тело запроса как JSON. Пустое тело — пустой объект (например, POST .../suggest без параметров),
 * испорченный JSON — INVALID_JSON.
 */
export async function readJson(c: Context): Promise<unknown> {
  const text = await c.req.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return INVALID_JSON;
  }
}
