import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { haptic } from './telegram';
import type { Person } from './types';

/**
 * Защита от двойного нажатия: пока действие выполняется, повторный вызов ничего не делает.
 * Кнопка выключается через состояние busy, но второй тап может успеть раньше перерисовки.
 */
export function useSingleFlight() {
  const running = useRef(false);
  return useCallback(async (action: () => Promise<void>): Promise<void> => {
    if (running.current) return;
    running.current = true;
    try {
      await action();
    } finally {
      running.current = false;
    }
  }, []);
}

// ---------- навигация (hash-роутер на три экрана) ----------

export type Route = { name: 'create' } | { name: 'trip'; id: string } | { name: 'survey'; id: string };

export function parseRoute(hash: string): Route {
  const m = hash.match(/^#\/trip\/([\w-]+)(\/answer)?$/);
  if (m) return m[2] ? { name: 'survey', id: m[1]! } : { name: 'trip', id: m[1]! };
  return { name: 'create' };
}

export function navigate(route: Route): void {
  window.location.hash = route.name === 'create' ? '#/' : route.name === 'trip' ? `#/trip/${route.id}` : `#/trip/${route.id}/answer`;
}

// ---------- всплывающие подсказки ----------

const ToastContext = createContext<(text: string) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [text, setText] = useState<string | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const show = useCallback((t: string) => {
    setText(t);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setText(null), 2600);
  }, []);
  return (
    <ToastContext.Provider value={show}>
      {children}
      {text && (
        <div className="toast" role="status">
          {text}
        </div>
      )}
    </ToastContext.Provider>
  );
}

// ---------- элементы ----------

export function Chip(props: { selected: boolean; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      className="chip"
      aria-pressed={props.selected}
      disabled={props.disabled}
      onClick={() => {
        haptic.select();
        props.onClick();
      }}
    >
      {props.children}
    </button>
  );
}

export function BottomBar({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="bottom-bar">
      <div className="bottom-bar-inner">
        {hint && <div className="hint">{hint}</div>}
        {children}
      </div>
    </div>
  );
}

const AVATAR_COLORS = ['#e17076', '#7bc862', '#65aadd', '#a695e7', '#ee7aae', '#6ec9cb', '#faa774'];

export function Avatar({ person }: { person: Person }) {
  if (person.photoUrl) return <img className="avatar" src={person.photoUrl} alt="" />;
  const color = AVATAR_COLORS[Math.abs(person.id) % AVATAR_COLORS.length];
  return (
    <div className="avatar" style={{ background: color }} aria-hidden>
      {person.firstName.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function Spinner() {
  return <div className="spinner" aria-label="Загрузка" />;
}

export function priceLabel(avgCheck: number): string {
  return avgCheck === 0 ? 'бесплатно' : `~${avgCheck} ₽`;
}

/** «1 человек», «2 человека», «5 человек» */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}
