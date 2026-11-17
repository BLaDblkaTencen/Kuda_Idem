// Прогон всего сценария вылазки через API от лица трёх тестовых пользователей.
// Нужен запущенный сервер (`npm run dev`) с DEV_AUTH=true. Запуск: `npm run smoke`.

const BASE = process.env.API_URL ?? 'http://localhost:3000';

type User = { id: number; name: string };
const masha: User = { id: 1001, name: 'Маша' };
const petya: User = { id: 1002, name: 'Петя' };
const dima: User = { id: 1003, name: 'Дима' };

async function call<T = any>(user: User, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      'x-dev-user-id': String(user.id),
      'x-dev-user-name': encodeURIComponent(user.name),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  return data as T;
}

function step(title: string) {
  console.log(`\n— ${title}`);
}

// Ближайшая пятница, 19:00 по Севастополю (16:00 UTC).
const friday = new Date();
friday.setUTCDate(friday.getUTCDate() + ((5 - friday.getUTCDay() + 7) % 7 || 7));
friday.setUTCHours(16, 0, 0, 0);

step('1. Маша создаёт вылазку');
let trip = await call(masha, 'POST', '/api/trips', { startsAt: friday.toISOString() });
console.log(`   id=${trip.id}, ${trip.startsAtLabel}`);

step('3. Все отвечают на анкету');
await call(masha, 'PUT', `/api/trips/${trip.id}/answer`, { budget: 1000, moods: ['eat', 'play'], district: 'center', constraints: [] });
await call(petya, 'PUT', `/api/trips/${trip.id}/answer`, { budget: 500, moods: ['play'], district: 'korabelnaya', constraints: ['no_alcohol'] });
trip = await call(dima, 'PUT', `/api/trips/${trip.id}/answer`, { budget: null, moods: [], district: null, constraints: ['under_18'] });
console.log(`   ответили: ${trip.participants.map((p: any) => p.firstName).join(', ')}`);

step('4–5. Маша запускает подбор');
trip = await call(masha, 'POST', `/api/trips/${trip.id}/suggest`);
for (const s of trip.suggestions) console.log(`   • ${s.place.name} — ${s.explanation}`);

step('5. «Другие варианты»');
trip = await call(masha, 'POST', `/api/trips/${trip.id}/suggest`);
for (const s of trip.suggestions) console.log(`   • ${s.place.name} — ${s.explanation}`);

step('6. Голосование');
const [a, b] = trip.suggestions.map((s: any) => s.place.id);
await call(masha, 'POST', `/api/trips/${trip.id}/vote`, { placeId: a });
await call(petya, 'POST', `/api/trips/${trip.id}/vote`, { placeId: a });
trip = await call(dima, 'POST', `/api/trips/${trip.id}/vote`, { placeId: b });
for (const s of trip.suggestions) console.log(`   ${s.votes} гол. — ${s.place.name}`);

step('Проверка прав: Петя не может завершить голосование');
try {
  await call(petya, 'POST', `/api/trips/${trip.id}/finish`);
  throw new Error('ожидали отказ 403');
} catch (e) {
  console.log(`   ок: ${(e as Error).message.includes('403') ? 'отказано (403)' : (e as Error).message}`);
}

step('7. Маша завершает голосование');
trip = await call(masha, 'POST', `/api/trips/${trip.id}/finish`);
console.log(`   Идём: ${trip.chosenPlace.name}, ${trip.startsAtLabel}`);
console.log(`   Маршрут: ${trip.chosenPlace.mapsUrl}`);

console.log('\nСценарий пройден целиком.');
