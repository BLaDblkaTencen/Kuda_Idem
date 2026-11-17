import { useEffect, useState } from 'react';
import { DEV_USERS, devMode, getDevUser, setDevUser } from './api';
import { CreateTrip } from './screens/CreateTrip';
import { Survey } from './screens/Survey';
import { Trip } from './screens/Trip';
import { startParam } from './telegram';
import { navigate, parseRoute, ToastProvider, type Route } from './ui';

export function App() {
  const [route, setRoute] = useState<Route>(() => {
    // Открыли по ссылке-приглашению t.me/...?startapp=<id> — сразу на вылазку.
    if (startParam && !window.location.hash.startsWith('#/trip/')) {
      navigate({ name: 'trip', id: startParam });
      return { name: 'trip', id: startParam };
    }
    return parseRoute(window.location.hash);
  });
  // Смена тестового пользователя перерисовывает экран с нуля.
  const [devUserId, setDevUserId] = useState(() => getDevUser().id);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const key = `${route.name}:${'id' in route ? route.id : ''}:${devUserId}`;

  return (
    <ToastProvider>
      <main className="app">
        {devMode && (
          <div className="dev-bar">
            <span>Разработка · вы:</span>
            {DEV_USERS.map((u) => (
              <button
                key={u.id}
                className="chip"
                aria-pressed={u.id === devUserId}
                onClick={() => {
                  setDevUser(u.id);
                  setDevUserId(u.id);
                }}
              >
                {u.name}
              </button>
            ))}
            {route.name !== 'create' && (
              <button className="link-btn" onClick={() => navigate({ name: 'create' })}>
                Новая вылазка
              </button>
            )}
          </div>
        )}
        {route.name === 'create' && <CreateTrip key={key} />}
        {route.name === 'trip' && <Trip key={key} tripId={route.id} />}
        {route.name === 'survey' && <Survey key={key} tripId={route.id} />}
      </main>
    </ToastProvider>
  );
}
