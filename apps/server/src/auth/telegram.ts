import { createHmac, timingSafeEqual } from 'node:crypto';

// Проверка initData, которую Telegram передаёт в Mini App.
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
}

export interface InitData {
  user: TelegramUser;
  startParam?: string;
  authDate: Date;
}

const DEFAULT_MAX_AGE_SEC = 24 * 60 * 60;

export function computeInitDataHash(params: URLSearchParams, botToken: string): string {
  const dataCheckString = [...params.entries()]
    .filter(([key]) => key !== 'hash')
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  return createHmac('sha256', secret).update(dataCheckString).digest('hex');
}

/** Возвращает данные пользователя, если подпись верна и данные не устарели; иначе null. */
export function validateInitData(
  raw: string,
  botToken: string,
  { maxAgeSec = DEFAULT_MAX_AGE_SEC, now = Date.now() } = {},
): InitData | null {
  if (!raw || !botToken) return null;
  const params = new URLSearchParams(raw);
  const hash = params.get('hash');
  if (!hash) return null;

  const expected = Buffer.from(computeInitDataHash(params, botToken), 'hex');
  const actual = Buffer.from(hash, 'hex');
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  const authDateSec = Number(params.get('auth_date'));
  if (!Number.isFinite(authDateSec) || now / 1000 - authDateSec > maxAgeSec) return null;

  const userJson = params.get('user');
  if (!userJson) return null;
  let user: TelegramUser;
  try {
    user = JSON.parse(userJson) as TelegramUser;
  } catch {
    return null;
  }
  if (typeof user.id !== 'number' || typeof user.first_name !== 'string') return null;

  return {
    user,
    startParam: params.get('start_param') ?? undefined,
    authDate: new Date(authDateSec * 1000),
  };
}
