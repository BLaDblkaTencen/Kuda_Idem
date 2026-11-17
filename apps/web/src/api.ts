import { initData, inTelegram } from './telegram';
import type { Answer, Dictionaries, Trip } from './types';

const BASE = import.meta.env.VITE_API_URL ?? '';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

// ---------- тестовые пользователи для разработки в браузере ----------

export const DEV_USERS = [
  { id: 1001, name: 'Маша' },
  { id: 1002, name: 'Петя' },
  { id: 1003, name: 'Дима' },
] as const;

/** Переключатель «от чьего имени» работает только в браузере при разработке. */
export const devMode =
  !inTelegram && import.meta.env.DEV && ['localhost', '127.0.0.1'].includes(window.location.hostname);

export function getDevUser(): (typeof DEV_USERS)[number] {
  let id: number | null = null;
  try {
    id = Number(localStorage.getItem('devUserId'));
  } catch {
    /* localStorage может быть недоступен */
  }
  return DEV_USERS.find((u) => u.id === id) ?? DEV_USERS[0];
}

export function setDevUser(id: number): void {
  try {
    localStorage.setItem('devUserId', String(id));
  } catch {
    /* не страшно */
  }
}

// ---------- запросы ----------

function authHeaders(): Record<string, string> {
  if (inTelegram) return { authorization: `tma ${initData}` };
  if (devMode) {
    const u = getDevUser();
    return { 'x-dev-user-id': String(u.id), 'x-dev-user-name': encodeURIComponent(u.name) };
  }
  return {};
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers: { ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...authHeaders() },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'network', 'Нет связи с сервером. Проверьте интернет.');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiError(res.status, data.error ?? 'unknown', data.message ?? 'Что-то пошло не так', data);
  }
  return data as T;
}

export const api = {
  dictionaries: () => request<Dictionaries>('GET', '/api/dictionaries'),
  createTrip: (startsAt: string) => request<Trip>('POST', '/api/trips', { startsAt }),
  getTrip: (id: string) => request<Trip>('GET', `/api/trips/${id}`),
  answer: (id: string, answer: Answer) => request<Trip>('PUT', `/api/trips/${id}/answer`, answer),
  suggest: (id: string) => request<Trip>('POST', `/api/trips/${id}/suggest`),
  vote: (id: string, placeId: number) => request<Trip>('POST', `/api/trips/${id}/vote`, { placeId }),
  finish: (id: string, placeId?: number) =>
    request<Trip>('POST', `/api/trips/${id}/finish`, placeId === undefined ? {} : { placeId }),
  shareInvite: (id: string) => request<{ preparedMessageId: string | null }>('POST', `/api/trips/${id}/share/invite`),
  shareResult: (id: string) => request<{ preparedMessageId: string | null }>('POST', `/api/trips/${id}/share/result`),
  event: (id: string, name: 'route_opened') => request<void>('POST', `/api/trips/${id}/events`, { name }),
};
