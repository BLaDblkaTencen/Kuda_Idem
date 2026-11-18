// Тонкая обёртка над window.Telegram.WebApp. Вне Telegram (в обычном браузере) всё работает,
// просто без нативных возможностей: кнопка «назад», вибрация, отправка сообщения в чат.

interface TgWebApp {
  initData: string;
  initDataUnsafe: { start_param?: string; user?: { id: number; first_name: string; allows_write_to_pm?: boolean } };
  colorScheme: 'light' | 'dark';
  ready(): void;
  expand(): void;
  isVersionAtLeast(version: string): boolean;
  openLink(url: string): void;
  openTelegramLink(url: string): void;
  showAlert(message: string): void;
  shareMessage?(preparedMessageId: string, callback?: (sent: boolean) => void): void;
  requestWriteAccess?(callback?: (allowed: boolean) => void): void;
  BackButton: { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
  HapticFeedback: {
    selectionChanged(): void;
    impactOccurred(style: 'light' | 'medium' | 'heavy'): void;
    notificationOccurred(type: 'success' | 'error' | 'warning'): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

const tg: TgWebApp | undefined = window.Telegram?.WebApp;

/** true, если приложение открыто внутри Telegram (есть подписанные данные пользователя). */
export const inTelegram = Boolean(tg?.initData);
export const initData = tg?.initData ?? '';
export const startParam = tg?.initDataUnsafe.start_param;

export function initTelegram(): void {
  if (!inTelegram || !tg) return;
  tg.ready();
  tg.expand();
  document.documentElement.classList.add('tg');
}

export const haptic = {
  select: () => inTelegram && tg?.HapticFeedback.selectionChanged(),
  tap: () => inTelegram && tg?.HapticFeedback.impactOccurred('light'),
  success: () => inTelegram && tg?.HapticFeedback.notificationOccurred('success'),
  error: () => inTelegram && tg?.HapticFeedback.notificationOccurred('error'),
};

export function openExternal(url: string): void {
  if (inTelegram && tg) tg.openLink(url);
  else window.open(url, '_blank', 'noopener');
}

/**
 * Поделиться текстом и ссылкой без бота. Возвращает, как именно поделились:
 * в Telegram — окно выбора чата (t.me/share), в браузере — системное «Поделиться»,
 * затем буфер обмена, а если и он недоступен — t.me/share в новой вкладке.
 */
export async function shareTextFallback(text: string, url: string): Promise<'telegram' | 'native' | 'copied' | 'link'> {
  const tgShare = `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`;
  if (inTelegram && tg) {
    tg.openTelegramLink(tgShare);
    return 'telegram';
  }
  if (navigator.share) {
    try {
      await navigator.share({ text, url });
      return 'native';
    } catch (e) {
      if ((e as DOMException).name === 'AbortError') return 'native'; // пользователь передумал
    }
  }
  try {
    await navigator.clipboard.writeText(`${text} ${url}`);
    return 'copied';
  } catch {
    window.open(tgShare, '_blank', 'noopener');
    return 'link';
  }
}

/** Отправка подготовленного ботом сообщения в чат. false — если не поддерживается (не Telegram или старая версия). */
export function canShareMessage(): boolean {
  return inTelegram && !!tg?.shareMessage && tg.isVersionAtLeast('8.0');
}

export function shareMessage(id: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (!tg?.shareMessage) return resolve(false);
    tg.shareMessage(id, (sent) => resolve(sent));
  });
}

/** Нативная кнопка «назад» в шапке Telegram. Возвращает функцию для отписки. */
export function showBackButton(onBack: () => void): () => void {
  if (!inTelegram || !tg) return () => {};
  tg.BackButton.onClick(onBack);
  tg.BackButton.show();
  return () => {
    tg.BackButton.offClick(onBack);
    tg.BackButton.hide();
  };
}

let writeAccess: boolean | null = tg?.initDataUnsafe.user?.allows_write_to_pm ? true : null;

/**
 * Просит разрешить боту писать в личный чат — туда придёт карточка с итогом вылазки.
 * Спрашивает не больше одного раза за запуск; если разрешение уже есть, окно не показывается.
 */
export function askWriteAccess(): Promise<boolean> {
  if (writeAccess !== null) return Promise.resolve(writeAccess);
  if (!inTelegram || !tg?.requestWriteAccess || !tg.isVersionAtLeast('6.9')) return Promise.resolve(false);
  return new Promise((resolve) => {
    tg.requestWriteAccess!((allowed) => {
      writeAccess = allowed;
      resolve(allowed);
    });
  });
}
