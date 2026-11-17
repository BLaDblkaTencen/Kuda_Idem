import { api, ApiError } from './api';
import { canShareMessage, haptic, shareMessage, shareTextFallback } from './telegram';
import type { Trip } from './types';
import { useToast } from './ui';

/**
 * Отправка в чат: в Telegram — нативным окном выбора чата (сообщение готовит бот),
 * в браузере или старом Telegram — текстом со ссылкой.
 */
export function useShare() {
  const toast = useToast();
  return async (trip: Trip, kind: 'invite' | 'result'): Promise<void> => {
    try {
      if (canShareMessage()) {
        const { preparedMessageId } = kind === 'invite' ? await api.shareInvite(trip.id) : await api.shareResult(trip.id);
        if (preparedMessageId && (await shareMessage(preparedMessageId))) {
          haptic.success();
          return;
        }
        if (preparedMessageId) return; // пользователь закрыл окно выбора чата
      }
      const tripUrl = trip.link ?? `${window.location.origin}${window.location.pathname}#/trip/${trip.id}`;
      const how =
        kind === 'invite'
          ? await shareTextFallback(`Собираю вылазку: ${trip.startsAtLabel}. Ответь за 30 секунд — подберём место, которое подойдёт всем:`, tripUrl)
          : await shareTextFallback(
              `Идём: ${trip.chosenPlace?.title}, ${trip.startsAtLabel}, ${trip.chosenPlace?.address}. Маршрут:`,
              trip.chosenPlace?.mapsUrl ?? tripUrl,
            );
      if (how === 'copied') toast('Текст скопирован — вставьте его в чат с друзьями');
    } catch (e) {
      toast(e instanceof ApiError ? e.message : 'Не получилось поделиться');
    }
  };
}
