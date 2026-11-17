import { useMemo, useState } from 'react';
import { api, ApiError } from '../api';
import { haptic } from '../telegram';
import { BottomBar, Chip, navigate } from '../ui';

const TIMES = ['12:00', '15:00', '18:00', '19:00', '20:00', '21:00', '22:00'];
const DAYS_AHEAD = 7;

// Даты и время считаем по Севастополю, где бы ни находился телефон.
const cityDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const weekdayFmt = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short', day: 'numeric' });

function cityDays(): Array<{ iso: string; label: string }> {
  const today = cityDateFmt.format(new Date()); // 2026-11-20
  const base = Date.parse(`${today}T00:00:00Z`);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date(base + i * 86_400_000);
    const iso = d.toISOString().slice(0, 10);
    const label = i === 0 ? 'Сегодня' : i === 1 ? 'Завтра' : weekdayFmt.format(d).replace(/^./, (c) => c.toUpperCase());
    return { iso, label };
  });
}

const toStartsAt = (day: string, time: string) => `${day}T${time}:00+03:00`;
const isPast = (day: string, time: string) => Date.parse(toStartsAt(day, time)) < Date.now() + 15 * 60_000;

export function CreateTrip() {
  const days = useMemo(cityDays, []);
  const [day, setDay] = useState(() => (TIMES.some((t) => !isPast(days[0]!.iso, t)) ? days[0]!.iso : days[1]!.iso));
  const [time, setTime] = useState(() => TIMES.find((t) => t >= '19:00' && !isPast(day, t)) ?? TIMES.find((t) => !isPast(day, t)) ?? '19:00');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const timeInvalid = isPast(day, time);

  async function create() {
    setBusy(true);
    setError(null);
    try {
      const trip = await api.createTrip(toStartsAt(day, time));
      haptic.success();
      navigate({ name: 'trip', id: trip.id });
    } catch (e) {
      haptic.error();
      setError(e instanceof ApiError ? e.message : 'Не получилось создать вылазку');
      setBusy(false);
    }
  }

  return (
    <>
      <header className="stack">
        <div className="hero-emoji" aria-hidden>
          🗺️
        </div>
        <h1 className="title">Куда идём?</h1>
        <p className="subtitle">
          Соберите друзей: каждый за 30 секунд отметит бюджет и настроение, а мы предложим 3 места, которые подойдут всем.
        </p>
      </header>

      <section>
        <h2 className="section-title">Когда</h2>
        <div className="card">
          <div className="chips" role="group" aria-label="День">
            {days.map((d) => (
              <Chip key={d.iso} selected={d.iso === day} onClick={() => setDay(d.iso)}>
                {d.label}
              </Chip>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Время">
            {TIMES.map((t) => (
              <Chip key={t} selected={t === time} disabled={isPast(day, t)} onClick={() => setTime(t)}>
                {t}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="error-box">{error}</p>}

      <BottomBar hint={timeInvalid ? 'Это время уже прошло — выберите другое' : 'Дальше позовёте друзей в чат'}>
        <button className="btn" disabled={busy || timeInvalid} onClick={create}>
          {busy ? 'Создаём…' : 'Собрать вылазку'}
        </button>
      </BottomBar>
    </>
  );
}
