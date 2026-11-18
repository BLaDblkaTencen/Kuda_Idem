import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { haptic, openExternal } from '../telegram';
import { useShare } from '../share';
import type { Trip as TripData } from '../types';
import { Avatar, BottomBar, navigate, plural, priceLabel, Spinner, useSingleFlight, useToast } from '../ui';

// Как часто экран спрашивает сервер о чужих изменениях (ответы, голоса).
// Свои действия обновляют экран сразу, без ожидания.
const POLL_MS = 10_000;

/** Загружает вылазку и обновляет её, пока друзья отвечают и голосуют. */
function useTrip(id: string) {
  const [trip, setTrip] = useState<TripData | null>(null);
  const [error, setError] = useState<{ message: string; notFound: boolean } | null>(null);

  const reload = useCallback(async () => {
    try {
      setTrip(await api.getTrip(id));
      setError(null);
    } catch (e) {
      setError({
        message: e instanceof ApiError ? e.message : 'Не удалось загрузить вылазку',
        notFound: e instanceof ApiError && e.code === 'not_found',
      });
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (trip?.status === 'decided' || error?.notFound) return; // дальше ничего не изменится
    const t = window.setInterval(() => {
      if (document.visibilityState === 'visible') void reload();
    }, POLL_MS);
    return () => window.clearInterval(t);
  }, [reload, trip?.status, error?.notFound]);

  return { trip, setTrip, error, reload };
}

export function Trip({ tripId }: { tripId: string }) {
  const { trip, setTrip, error, reload } = useTrip(tripId);

  if (!trip) {
    if (error?.notFound) {
      // Повтор здесь не поможет: ссылка неверная или вылазку удалили.
      return (
        <div className="card center">
          <h2 className="place-name">Вылазка не найдена</h2>
          <p className="muted">Проверьте ссылку или соберите свою.</p>
          <button className="btn secondary" onClick={() => navigate({ name: 'create' })}>
            Собрать вылазку
          </button>
        </div>
      );
    }
    return error ? (
      <div className="card center">
        <p>{error.message}</p>
        <button className="btn secondary" onClick={() => void reload()}>
          Попробовать ещё раз
        </button>
      </div>
    ) : (
      <Spinner />
    );
  }

  return (
    <>
      <header className="stack">
        <p className="muted">
          {trip.isOrganizer ? 'Вы собираете вылазку' : `${trip.organizer?.firstName ?? 'Друг'} собирает вылазку`}
        </p>
        <h1 className="title">{capitalize(trip.startsAtLabel)}</h1>
      </header>
      {trip.status === 'collecting' && <Collecting trip={trip} setTrip={setTrip} />}
      {trip.status === 'voting' && <Voting trip={trip} setTrip={setTrip} />}
      {trip.status === 'decided' && <Decided trip={trip} />}
    </>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type StepProps = { trip: TripData; setTrip: (t: TripData) => void };

// ---------- 1. Сбор ответов ----------

function Collecting({ trip, setTrip }: StepProps) {
  const share = useShare();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const n = trip.participants.length;

  const once = useSingleFlight();
  const suggest = () => once(async () => {
    setBusy(true);
    try {
      setTrip(await api.suggest(trip.id));
      haptic.success();
    } catch (e) {
      haptic.error();
      toast(e instanceof ApiError ? e.message : 'Не получилось подобрать места');
    } finally {
      setBusy(false);
    }
  });

  return (
    <>
      {trip.isOrganizer && (
        <div className="card accent">
          <h2 className="place-name">Позовите друзей</h2>
          <p className="muted">Отправьте приглашение в общий чат — каждый ответит на 4 вопроса.</p>
          <button className="btn secondary" onClick={() => void share(trip, 'invite')}>
            Отправить в чат
          </button>
        </div>
      )}

      <section>
        <h2 className="section-title">
          Ответили — {n} {plural(n, 'человек', 'человека', 'человек')}
        </h2>
        <div className="card">
          {n === 0 ? (
            <p className="muted">Пока никто. Ответы появятся здесь сами.</p>
          ) : (
            <div className="people">
              {trip.participants.map((p) => (
                <div className="row" key={p.id}>
                  <Avatar person={p} />
                  <span style={{ flex: 1 }}>{p.firstName}</span>
                  {p.id === trip.organizer?.id && <span className="badge">организатор</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <h2 className="section-title">Ваша анкета</h2>
        <div className="card">
          {trip.myAnswer ? (
            <div className="row between">
              <span>Ответ сохранён ✓</span>
              <button className="link-btn" onClick={() => navigate({ name: 'survey', id: trip.id })}>
                Изменить
              </button>
            </div>
          ) : (
            <>
              <p>Ответьте на 4 коротких вопроса.</p>
              <button className="btn secondary" onClick={() => navigate({ name: 'survey', id: trip.id })}>
                Заполнить анкету
              </button>
            </>
          )}
        </div>
      </section>

      {trip.isOrganizer ? (
        <BottomBar hint={n === 0 ? 'Сначала заполните свою анкету' : 'Не обязательно ждать всех — можно начать сейчас'}>
          <button className="btn" disabled={n === 0 || busy} onClick={suggest}>
            {busy ? 'Подбираем…' : 'Подобрать места'}
          </button>
        </BottomBar>
      ) : trip.myAnswer ? (
        <BottomBar>
          <p className="hint">Ждём, пока {trip.organizer?.firstName ?? 'организатор'} запустит подбор</p>
        </BottomBar>
      ) : (
        <BottomBar>
          <button className="btn" onClick={() => navigate({ name: 'survey', id: trip.id })}>
            Заполнить анкету
          </button>
        </BottomBar>
      )}
    </>
  );
}

// ---------- 2. Голосование ----------

function Voting({ trip, setTrip }: StepProps) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [tieLeaders, setTieLeaders] = useState<number[] | null>(null);

  const once = useSingleFlight();
  const run = (key: string, action: () => Promise<TripData>) => once(async () => {
    setBusy(key);
    try {
      setTrip(await action());
      setTieLeaders(null);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'tie') {
        setTieLeaders((e.data.leaders as number[]) ?? []);
        toast('Ничья — выберите место сами');
      } else {
        haptic.error();
        toast(e instanceof ApiError ? e.message : 'Что-то пошло не так');
      }
    } finally {
      setBusy(null);
    }
  });

  const voted = trip.suggestions.reduce((n, s) => n + s.voters.length, 0);
  const people = Math.max(trip.participants.length, voted);

  return (
    <>
      <div className="row between">
        <h2 className="place-name">{tieLeaders ? 'Ничья! Решающий голос за вами' : 'Голосуем'}</h2>
        {!tieLeaders && (
          <span className="hint">
            проголосовали {voted} из {people}
          </span>
        )}
      </div>
      {tieLeaders && <p className="muted">Выберите одно из лидирующих мест.</p>}

      {trip.suggestions.map(({ place, voters }) => {
        const mine = trip.myVote === place.id;
        const isLeaderInTie = tieLeaders?.includes(place.id);
        return (
          <article key={place.id} className={`card vote-card${mine ? ' accent' : ''}`}>
            <div className="vote-head">
              <div className="place-icon" aria-hidden>
                <span>{place.icon}</span>
              </div>
              <div className="vote-title">
                <h3 className="place-name">{place.title}</h3>
                <span className="place-meta">
                  {place.districtLabel}
                  {place.isTestData && ' · тестовое место'}
                </span>
              </div>
              {/* У бесплатных мест цену заменяет метка «бесплатно». */}
              {!place.isFree && <span className="price">{priceLabel(place.avgCheck)}</span>}
            </div>
            {place.description && <p className="vote-desc">{place.description}</p>}
            <PlaceTags tags={place.tags} />
            <div className="row between">
              <div className="voters">
                {voters.length > 0 && (
                  <div className="avatar-stack">
                    {voters.slice(0, 4).map((v) => (
                      <Avatar key={v.id} person={v} />
                    ))}
                  </div>
                )}
                <span className="hint">
                  {voters.length} {plural(voters.length, 'голос', 'голоса', 'голосов')}
                </span>
              </div>
              <div className="row" style={{ gap: 14 }}>
                <button className="link-btn" onClick={() => openExternal(place.mapsUrl)}>
                  Карта
                </button>
                {tieLeaders ? (
                  isLeaderInTie && (
                    <button className="pill on" disabled={!!busy} onClick={() => void run(`pick${place.id}`, () => api.finish(trip.id, place.id))}>
                      Идём сюда
                    </button>
                  )
                ) : (
                  <button
                    className={`pill${mine ? ' on' : ''}`}
                    disabled={!!busy}
                    aria-pressed={mine}
                    onClick={() => {
                      haptic.tap();
                      void run(`vote${place.id}`, () => api.vote(trip.id, place.id));
                    }}
                  >
                    {mine ? '✓ Ваш голос' : 'Голосую'}
                  </button>
                )}
              </div>
            </div>
          </article>
        );
      })}

      {trip.isOrganizer && !tieLeaders && (
        <button className="link-btn center" disabled={!!busy} onClick={() => void run('more', () => api.suggest(trip.id))}>
          {busy === 'more' ? 'Ищем…' : 'Другие варианты'}
        </button>
      )}

      {trip.isOrganizer ? (
        !tieLeaders && (
          <BottomBar hint={voted === 0 ? 'Пока никто не проголосовал — выбор будет за вами' : undefined}>
            <button className="btn" disabled={!!busy} onClick={() => void run('finish', () => api.finish(trip.id))}>
              {busy === 'finish' ? 'Подводим итог…' : 'Завершить голосование'}
            </button>
          </BottomBar>
        )
      ) : (
        <BottomBar>
          <p className="hint">
            {trip.myVote ? 'Голос учтён. ' : ''}
            {trip.organizer?.firstName ?? 'Организатор'} завершит голосование
          </p>
        </BottomBar>
      )}
    </>
  );
}

// ---------- 3. Итог ----------

function Decided({ trip }: { trip: TripData }) {
  const share = useShare();
  const place = trip.chosenPlace;
  if (!place) return null;

  return (
    <>
      <div className="card accent">
        <div className="hero-emoji" aria-hidden>
          🎉
        </div>
        {/* Та же фраза, что в карточке от бота: «Идём на Приморский бульвар», «Идём в кинотеатр «Победа»». */}
        <h2 className="result-title">Идём {place.goTo}</h2>
        <div className="vote-head">
          <div className="place-icon" aria-hidden>
            <span>{place.icon}</span>
          </div>
          <div className="vote-title">
            {/* У парков и бульваров адрес совпадает с названием — тогда не повторяем его. */}
            {place.address.toLowerCase() !== place.name.toLowerCase() && <span>{place.address}</span>}
            <span className="place-meta">
              {place.districtLabel}
              {!place.isFree && ` · ${priceLabel(place.avgCheck)}`}
            </span>
          </div>
        </div>
        {place.description && <p className="muted">{place.description}</p>}
        <PlaceTags tags={place.tags} />
      </div>
      <p className="muted center">Карточка с деталями встречи пришла каждому в чат с ботом</p>

      <button className="btn secondary" onClick={() => void share(trip, 'result')}>
        Отправить итог в чат
      </button>

      <BottomBar>
        <button
          className="btn"
          onClick={() => {
            void api.event(trip.id, 'route_opened').catch(() => {});
            openExternal(place.mapsUrl);
          }}
        >
          Построить маршрут
        </button>
      </BottomBar>
    </>
  );
}

/** Метки места: «бесплатно», «18+», особенности, часы в день встречи. Серые, в цветах темы. */
function PlaceTags({ tags }: { tags: string[] }) {
  if (tags.length === 0) return null;
  return (
    <div className="place-tags">
      {tags.map((t) => (
        <span key={t} className="place-tag">
          {t}
        </span>
      ))}
    </div>
  );
}
