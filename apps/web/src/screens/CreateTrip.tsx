import { useMemo, useRef, useState } from 'react';
import { api, ApiError, devMode, getDevUser } from '../api';
import { useShare } from '../share';
import { haptic, myFirstName } from '../telegram';
import { BottomBar, navigate, useSingleFlight } from '../ui';

const QUICK_TIMES = ['18:00', '19:00', '20:00', '21:00', '22:00'];
const DAYS_AHEAD = 7;
const MIN_LEAD_MS = 15 * 60_000; // встречу нельзя назначить «через 5 минут»

// Даты и время считаем по Севастополю, где бы ни находился телефон.
const cityDateFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const cityHourFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow', hour: '2-digit', hourCycle: 'h23' });
// Дата дня (без времени) хранится как полночь UTC — так день недели не «съезжает» из-за часового пояса.
const weekdayShort = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'short' });
const dateLong = new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' });

type Day = { iso: string; weekday: string; date: number };

function cityDays(): Day[] {
  const base = Date.parse(`${cityDateFmt.format(new Date())}T00:00:00Z`);
  return Array.from({ length: DAYS_AHEAD }, (_, i) => {
    const d = new Date(base + i * 86_400_000);
    const weekday = weekdayShort.format(d).replace('.', '');
    return { iso: d.toISOString().slice(0, 10), weekday: weekday.charAt(0).toUpperCase() + weekday.slice(1), date: d.getUTCDate() };
  });
}

const toStartsAt = (day: string, time: string) => `${day}T${time}:00+03:00`;
const isPast = (day: string, time: string) => Date.parse(toStartsAt(day, time)) < Date.now() + MIN_LEAD_MS;

/** «пятница, 20 ноября» — как в сообщении-приглашении от бота */
const dayInMessage = (iso: string) => dateLong.format(new Date(`${iso}T00:00:00Z`));

/** «Пятница, 20 ноября» */
function dayLabel(iso: string): string {
  const s = dateLong.format(new Date(`${iso}T00:00:00Z`));
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Время по умолчанию: 19:00, а если уже поздно — ближайший целый час. */
function defaultWhen(days: Day[]): { day: string; time: string } {
  const today = days[0]!.iso;
  if (!isPast(today, '19:00')) return { day: today, time: '19:00' };
  const nextHour = Number(cityHourFmt.format(new Date(Date.now() + MIN_LEAD_MS))) + 1;
  if (nextHour <= 23) return { day: today, time: `${String(nextHour).padStart(2, '0')}:00` };
  return { day: days[1]!.iso, time: '19:00' };
}

/** Только цифры, не больше двух. Если в заполненное поле дописали цифру — начинаем заново с неё. */
const digits = (s: string) => {
  const d = s.replace(/\D/g, '');
  return d.length > 2 ? d.slice(-1) : d;
};
const pad = (v: string) => (v.length === 1 ? `0${v}` : v);

export function CreateTrip() {
  const days = useMemo(cityDays, []);
  const initial = useMemo(() => defaultWhen(days), [days]);
  const [day, setDay] = useState(initial.day);
  const [hh, setHh] = useState(initial.time.slice(0, 2));
  const [mm, setMm] = useState(initial.time.slice(3));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const minutesRef = useRef<HTMLInputElement>(null);
  const share = useShare();
  const once = useSingleFlight();

  const complete = hh.length === 2 && mm.length === 2 && Number(hh) <= 23 && Number(mm) <= 59;
  const time = `${hh}:${mm}`;
  const past = complete && isPast(day, time);

  function onHours(raw: string) {
    let v = digits(raw);
    if (v.length === 1 && Number(v) > 2) v = `0${v}`; // «7» → 07, сразу к минутам
    setHh(v);
    if (v.length === 2) minutesRef.current?.focus();
  }

  function onMinutes(raw: string) {
    let v = digits(raw);
    if (v.length === 1 && Number(v) > 5) v = `0${v}`;
    setMm(v);
  }

  function pickQuick(t: string) {
    haptic.select();
    setHh(t.slice(0, 2));
    setMm(t.slice(3));
  }

  const create = () => once(async () => {
    setBusy(true);
    setError(null);
    try {
      const trip = await api.createTrip(toStartsAt(day, time));
      haptic.success();
      await share(trip, 'invite'); // сразу окно выбора чата; если закрыть — приглашение можно отправить позже
      navigate({ name: 'trip', id: trip.id });
    } catch (e) {
      haptic.error();
      setError(e instanceof ApiError ? e.message : 'Не получилось создать вылазку');
      setBusy(false);
    }
  });

  const filled = hh.length === 2 && mm.length === 2;
  const hint = !filled
    ? 'Впишите время, например 19:30'
    : !complete
      ? 'Такого времени нет — часы от 00 до 23, минуты от 00 до 59'
      : past
        ? 'Это время уже прошло — выберите другое'
        : undefined;
  // Имя в превью — как его увидят друзья в сообщении от бота.
  const name = myFirstName ?? (devMode ? getDevUser().name : 'Организатор');

  return (
    <>
      <header className="stack">
        <h1 className="title">Новая вылазка</h1>
        <p className="subtitle">Так приглашение увидят друзья в чате</p>
      </header>

      {/* Тот же текст, что бот пришлёт в чат (routes/trips.ts → share/invite). */}
      <div className="invite-preview" aria-live="polite">
        <div className="invite-bubble">
          {name} собирает вылазку:{' '}
          <b className="invite-when">
            {dayInMessage(day)} в {complete ? time : '—:—'}
          </b>
          .<br />
          Ответь за 30 секунд — подберём место, которое подойдёт всем.
        </div>
        <div className="invite-button" aria-hidden>
          Участвовать
        </div>
      </div>

      <section>
        <h2 className="section-title">День</h2>
        <div className="day-strip" role="group" aria-label="День">
          {days.map((d) => (
            <button
              key={d.iso}
              type="button"
              className="day-cell"
              aria-pressed={d.iso === day}
              aria-label={dayLabel(d.iso)}
              onClick={() => {
                haptic.select();
                setDay(d.iso);
              }}
            >
              <small>{d.weekday}</small>
              <b>{d.date}</b>
            </button>
          ))}
        </div>
      </section>

      <section>
        <h2 className="section-title">Время</h2>
        <div className="card time-card">
          <div className="time-inputs">
            <input
              className="time-field"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Часы"
              placeholder="чч"
              value={hh}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => onHours(e.currentTarget.value)}
              onBlur={() => setHh(pad)} // функцией: при автопереходе к минутам hh здесь ещё старое
            />
            <span className="time-colon">:</span>
            <input
              ref={minutesRef}
              className="time-field"
              inputMode="numeric"
              autoComplete="off"
              aria-label="Минуты"
              placeholder="мм"
              value={mm}
              onFocus={(e) => e.currentTarget.select()}
              onChange={(e) => onMinutes(e.currentTarget.value)}
              onBlur={() => setMm(pad)}
            />
          </div>
        </div>
        <div className="quick-times" role="group" aria-label="Быстрый выбор времени">
          {QUICK_TIMES.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={complete && t === time} disabled={isPast(day, t)} onClick={() => pickQuick(t)}>
              {t}
            </button>
          ))}
        </div>
      </section>

      {error && <p className="error-box">{error}</p>}

      <BottomBar hint={hint}>
        <button className="btn" disabled={busy || !complete || past} onClick={create}>
          {busy ? 'Создаём…' : 'Отправить приглашение'}
        </button>
      </BottomBar>
    </>
  );
}
