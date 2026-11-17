import { useEffect, useState } from 'react';
import { api, ApiError } from '../api';
import { askWriteAccess, haptic, showBackButton } from '../telegram';
import type { Answer, Dictionaries } from '../types';
import { BottomBar, Chip, navigate, Spinner, useSingleFlight } from '../ui';

let dictCache: Dictionaries | null = null;

export function Survey({ tripId }: { tripId: string }) {
  const [dict, setDict] = useState<Dictionaries | null>(dictCache);
  const [answer, setAnswer] = useState<Answer>({ budget: null, moods: [], district: null, constraints: [] });
  const [budgetChosen, setBudgetChosen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const back = () => navigate({ name: 'trip', id: tripId });
  useEffect(() => showBackButton(back), [tripId]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([dictCache ?? api.dictionaries(), api.getTrip(tripId)])
      .then(([d, trip]) => {
        if (cancelled) return;
        dictCache = d;
        setDict(d);
        if (trip.status !== 'collecting') return back(); // подбор уже запущен — анкета закрыта
        if (trip.myAnswer) {
          setAnswer(trip.myAnswer);
          setBudgetChosen(true);
        }
        setLoaded(true);
      })
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Не удалось загрузить анкету'));
    return () => {
      cancelled = true;
    };
  }, [tripId]);

  const toggle = (list: string[], key: string) => (list.includes(key) ? list.filter((k) => k !== key) : [...list, key]);

  const once = useSingleFlight();
  const submit = () => once(async () => {
    setBusy(true);
    setError(null);
    try {
      await api.answer(tripId, answer);
      haptic.success();
      await askWriteAccess(); // чтобы бот прислал карточку с итогом
      back();
    } catch (e) {
      haptic.error();
      setError(e instanceof ApiError ? e.message : 'Не удалось сохранить ответ');
      setBusy(false);
    }
  });

  if (error && !loaded) return <p className="error-box center">{error}</p>;
  if (!dict || !loaded) return <Spinner />;

  return (
    <>
      <header className="stack">
        <h1 className="title">Ваши пожелания</h1>
        <p className="subtitle">4 коротких вопроса. Остальные не увидят ваши ответы — только общий подбор.</p>
      </header>

      <section>
        <h2 className="section-title">Бюджет на человека</h2>
        <div className="card">
          <div className="chips" role="group" aria-label="Бюджет">
            {dict.budgets.map((b) => (
              <Chip
                key={String(b.value)}
                selected={budgetChosen && answer.budget === b.value}
                onClick={() => {
                  setBudgetChosen(true);
                  setAnswer({ ...answer, budget: b.value });
                }}
              >
                {b.label}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="section-title">Настроение · можно несколько</h2>
        <div className="card">
          <div className="chips" role="group" aria-label="Настроение">
            {dict.moods.map((m) => (
              <Chip key={m.key} selected={answer.moods.includes(m.key)} onClick={() => setAnswer({ ...answer, moods: toggle(answer.moods, m.key) })}>
                {m.label}
              </Chip>
            ))}
          </div>
          {answer.moods.length === 0 && <p className="hint">Ничего не выбрано — значит, всё равно</p>}
        </div>
      </section>

      <section>
        <h2 className="section-title">Откуда удобнее добираться</h2>
        <div className="card">
          <div className="chips" role="group" aria-label="Район">
            <Chip selected={answer.district === null} onClick={() => setAnswer({ ...answer, district: null })}>
              любой район
            </Chip>
            {dict.districts.map((d) => (
              <Chip key={d.key} selected={answer.district === d.key} onClick={() => setAnswer({ ...answer, district: d.key })}>
                {d.label}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      <section>
        <h2 className="section-title">Важно учесть · если есть</h2>
        <div className="card">
          <div className="chips" role="group" aria-label="Ограничения">
            {dict.constraints.map((c) => (
              <Chip
                key={c.key}
                selected={answer.constraints.includes(c.key)}
                onClick={() => setAnswer({ ...answer, constraints: toggle(answer.constraints, c.key) })}
              >
                {c.label}
              </Chip>
            ))}
          </div>
        </div>
      </section>

      {error && <p className="error-box">{error}</p>}

      <BottomBar hint={budgetChosen ? undefined : 'Выберите бюджет — это единственный обязательный вопрос'}>
        <button className="btn" disabled={!budgetChosen || busy} onClick={submit}>
          {busy ? 'Сохраняем…' : 'Готово'}
        </button>
      </BottomBar>
    </>
  );
}
