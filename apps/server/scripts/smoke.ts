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
await call(masha, 'PUT', `/api/trips/${trip.id}/answer`, { budget: 1000, moods: ['eat', 'play'], districts: ['center', 'ostryaki'], constraints: [] });
await call(petya, 'PUT', `/api/trips/${trip.id}/answer`, { budget: 500, moods: ['play'], district: 'korabelnaya', constraints: ['no_alcohol'] } /* старый формат */);
trip = await call(dima, 'PUT', `/api/trips/${trip.id}/answer`, { budget: null, moods: [], districts: [], constraints: ['under_18'] });
console.log(`   ответили: ${trip.participants.map((p: any) => p.firstName).join(', ')}`);

step('4–5. Маша запускает подбор');
trip = await call(masha, 'POST', `/api/trips/${trip.id}/suggest`);
for (const s of trip.suggestions) console.log(`   • ${s.place.title} — ${s.explanation}`);

step('5. «Другие варианты» двойным нажатием — оба запроса без ошибки');
const [r1, r2] = await Promise.all([
  call(masha, 'POST', `/api/trips/${trip.id}/suggest`),
  call(masha, 'POST', `/api/trips/${trip.id}/suggest`),
]);
trip = r2.round >= r1.round ? r2 : r1;
console.log(`   раунды ответов: ${r1.round} и ${r2.round}`);
for (const s of trip.suggestions) console.log(`   • ${s.place.title} — ${s.explanation}`);

step('6. Голосование');
const [a, b = a] = trip.suggestions.map((s: any) => s.place.id); // в последнем раунде может остаться одно место
await call(masha, 'POST', `/api/trips/${trip.id}/vote`, { placeId: a });
await call(petya, 'POST', `/api/trips/${trip.id}/vote`, { placeId: a });
trip = await call(dima, 'POST', `/api/trips/${trip.id}/vote`, { placeId: b });
for (const s of trip.suggestions) console.log(`   ${s.votes} гол. — ${s.place.title}`);

step('Проверка прав: Петя не может завершить голосование');
const refused = await call(petya, 'POST', `/api/trips/${trip.id}/finish`).then(
  () => false,
  (e: Error) => e.message.includes('→ 403'),
);
if (!refused) throw new Error('Петя смог завершить голосование или ошибка не 403 — права не работают');
console.log('   ок: отказано (403)');

step('7. Маша завершает голосование (двойным нажатием)');
const [f1, f2] = await Promise.all([
  call(masha, 'POST', `/api/trips/${trip.id}/finish`),
  call(masha, 'POST', `/api/trips/${trip.id}/finish`),
]);
if (f1.chosenPlace?.id !== f2.chosenPlace?.id) throw new Error('двойное завершение дало разные итоги');
trip = f1;
console.log(`   Идём: ${trip.chosenPlace.title}, ${trip.startsAtLabel}`);
console.log(`   Маршрут: ${trip.chosenPlace.mapsUrl}`);

console.log('\nСценарий пройден целиком.');
