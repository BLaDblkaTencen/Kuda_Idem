import { describe, expect, it } from 'vitest';
import { computeInitDataHash, validateInitData } from './telegram.js';

// Фиктивный токен только для теста.
const TOKEN = '123456:TEST_TOKEN_FOR_UNIT_TESTS';
const NOW = Date.parse('2026-11-20T16:00:00Z');

function makeInitData(overrides: Record<string, string> = {}, token = TOKEN): string {
  const params = new URLSearchParams({
    auth_date: String(Math.floor(NOW / 1000) - 60),
    query_id: 'AAE-test',
    user: JSON.stringify({ id: 42, first_name: 'Тест', username: 'test_user' }),
    start_param: 'abc123',
    ...overrides,
  });
  params.set('hash', computeInitDataHash(params, token));
  return params.toString();
}

describe('validateInitData', () => {
  it('принимает корректно подписанные данные', () => {
    const res = validateInitData(makeInitData(), TOKEN, { now: NOW });
    expect(res?.user.id).toBe(42);
    expect(res?.startParam).toBe('abc123');
  });

  it('отклоняет данные, подписанные другим токеном', () => {
    expect(validateInitData(makeInitData({}, '999:OTHER'), TOKEN, { now: NOW })).toBeNull();
  });

  it('отклоняет подменённые данные', () => {
    const tampered = makeInitData().replace('%22id%22%3A42', '%22id%22%3A43');
    expect(validateInitData(tampered, TOKEN, { now: NOW })).toBeNull();
  });

  it('отклоняет устаревшие данные', () => {
    const old = makeInitData({ auth_date: String(Math.floor(NOW / 1000) - 3 * 24 * 3600) });
    expect(validateInitData(old, TOKEN, { now: NOW })).toBeNull();
  });

  it('отклоняет пустую строку и данные без hash', () => {
    expect(validateInitData('', TOKEN, { now: NOW })).toBeNull();
    expect(validateInitData('user=%7B%7D', TOKEN, { now: NOW })).toBeNull();
  });
});
