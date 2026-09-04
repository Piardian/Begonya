import { recordTelegramTelemetry, telemetryTimer, elapsedMs } from './telemetry';
import { recordRuntimeTrace } from './runtimeTrace';

export interface TelegramHealthSnapshot {
  readonly status: 'unknown' | 'ok' | 'failed';
  readonly lastCheckedAt: string | null;
  readonly lastSuccessAt: string | null;
  readonly lastError: string | null;
}

let telegramHealth: TelegramHealthSnapshot = Object.freeze({
  status: 'unknown',
  lastCheckedAt: null,
  lastSuccessAt: null,
  lastError: null,
});

export function getTelegramHealthSnapshot(): TelegramHealthSnapshot {
  return telegramHealth;
}

export async function probeTelegramConnection(): Promise<TelegramHealthSnapshot> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    return updateTelegramHealth(false, 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
  }

  try {
    const me = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      signal: telegramTimeoutSignal(),
    });
    if (!me.ok || !await telegramResponseOk(me)) {
      return updateTelegramHealth(false, `Telegram getMe failed with HTTP ${me.status}`);
    }

    const chat = await fetch(`https://api.telegram.org/bot${token}/getChat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId }),
      signal: telegramTimeoutSignal(),
    });
    if (!chat.ok || !await telegramResponseOk(chat)) {
      return updateTelegramHealth(false, `Telegram getChat failed with HTTP ${chat.status}`);
    }
    return updateTelegramHealth(true, null);
  } catch (error) {
    return updateTelegramHealth(false, error instanceof Error ? error.message : String(error));
  }
}

export async function sendTelegramMessage(text: string, telemetry?: { readonly signalId?: string; readonly retryCount?: number }): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const timer = telemetryTimer();
  const signalId = telemetry?.signalId ?? 'unknown';
  recordRuntimeTrace({
    signalId,
    file: 'server/telegramSender.ts',
    functionName: 'sendTelegramMessage',
    timestamp: new Date().toISOString(),
    input: {
      formatterName: 'server/telegramFormatter.ts#formatNotificationMessage',
      messageLength: text.length,
      retryCount: telemetry?.retryCount ?? 0,
      rawTelegramMessage: text,
    },
    output: {
      requestPrepared: true,
      hasToken: Boolean(token),
      hasChatId: Boolean(chatId),
    },
  });

  if (!token || !chatId) {
    console.error('Telegram sender: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment.');
    updateTelegramHealth(false, 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    recordTelegramTelemetry({
      type: 'telegram',
      signalId,
      requestTimestamp: timer.startedAtIso,
      responseTimeMs: elapsedMs(timer),
      success: false,
      retryCount: telemetry?.retryCount ?? 0,
      failureReason: 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID',
    });
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendMessage`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
      signal: telegramTimeoutSignal(),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Telegram API error (status ${response.status}): ${errText}`);
      updateTelegramHealth(false, `HTTP ${response.status}: ${errText}`);
      recordTelegramTelemetry({
        type: 'telegram',
        signalId,
        requestTimestamp: timer.startedAtIso,
        responseTimeMs: elapsedMs(timer),
        success: false,
        retryCount: telemetry?.retryCount ?? 0,
        failureReason: `HTTP ${response.status}: ${errText}`,
      });
      return false;
    }

    const data: any = await response.json();
    const success = data.ok === true;
    updateTelegramHealth(success, success ? null : 'Telegram API returned ok=false');
    recordTelegramTelemetry({
      type: 'telegram',
      signalId,
      requestTimestamp: timer.startedAtIso,
      responseTimeMs: elapsedMs(timer),
      success,
      retryCount: telemetry?.retryCount ?? 0,
      failureReason: success ? null : 'Telegram API returned ok=false',
    });
    return success;
  } catch (error) {
    console.error('Telegram sender network error:', error);
    updateTelegramHealth(false, error instanceof Error ? error.message : String(error));
    recordTelegramTelemetry({
      type: 'telegram',
      signalId,
      requestTimestamp: timer.startedAtIso,
      responseTimeMs: elapsedMs(timer),
      success: false,
      retryCount: telemetry?.retryCount ?? 0,
      failureReason: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function sendTelegramPhoto(
  imageBuffer: Buffer,
  caption?: string,
  telemetry?: { readonly signalId?: string; readonly retryCount?: number }
): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    console.error('Telegram sender: missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID in environment.');
    updateTelegramHealth(false, 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID');
    return false;
  }

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;
  recordRuntimeTrace({
    signalId: telemetry?.signalId ?? 'unknown',
    file: 'server/telegramSender.ts',
    functionName: 'sendTelegramPhoto',
    timestamp: new Date().toISOString(),
    input: {
      imageBytes: imageBuffer.length,
      caption: caption ?? null,
      retryCount: telemetry?.retryCount ?? 0,
    },
    output: {
      requestPrepared: true,
      hasToken: Boolean(token),
      hasChatId: Boolean(chatId),
    },
  });

  try {
    const formData = new FormData();
    formData.append('chat_id', chatId);

    // Convert Buffer to Blob
    const blob = new Blob([imageBuffer], { type: 'image/png' });
    formData.append('photo', blob, 'chart.png');

    if (caption) {
      formData.append('caption', caption);
    }

    const response = await fetch(url, {
      method: 'POST',
      body: formData,
      signal: telegramTimeoutSignal(),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error(`Telegram API sendPhoto error (status ${response.status}): ${errText}`);
      updateTelegramHealth(false, `HTTP ${response.status}: ${errText}`);
      return false;
    }

    const data: any = await response.json();
    const success = data.ok === true;
    updateTelegramHealth(success, success ? null : 'Telegram API returned ok=false for sendPhoto');
    return success;
  } catch (error) {
    console.error('Telegram sendPhoto network error:', error);
    updateTelegramHealth(false, error instanceof Error ? error.message : String(error));
    return false;
  }
}

function telegramTimeoutSignal(): AbortSignal {
  const configured = Number(process.env.TELEGRAM_REQUEST_TIMEOUT_MS ?? 10_000);
  const timeoutMs = Number.isFinite(configured) && configured > 0 ? configured : 10_000;
  return AbortSignal.timeout(timeoutMs);
}

async function telegramResponseOk(response: Response): Promise<boolean> {
  try {
    const payload = await response.json() as { readonly ok?: unknown };
    return payload.ok === true;
  } catch {
    return false;
  }
}

function updateTelegramHealth(success: boolean, error: string | null): TelegramHealthSnapshot {
  const checkedAt = new Date().toISOString();
  telegramHealth = Object.freeze({
    status: success ? 'ok' : 'failed',
    lastCheckedAt: checkedAt,
    lastSuccessAt: success ? checkedAt : telegramHealth.lastSuccessAt,
    lastError: success ? null : error,
  });
  return telegramHealth;
}
