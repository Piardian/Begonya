import { sendTelegramMessage, sendTelegramPhoto } from './telegramSender';
import { recordRuntimeTrace } from './runtimeTrace';

export interface ChannelDeliveryMeta {
  readonly signalId?: string;
  readonly retryCount?: number;
}

export interface ChannelAdapter {
  readonly channel: 'Telegram';
  sendMessage(message: string, meta?: ChannelDeliveryMeta): Promise<boolean>;
  sendPhoto(photo: Buffer, caption?: string, meta?: ChannelDeliveryMeta): Promise<boolean>;
}

export class TelegramChannelAdapter implements ChannelAdapter {
  readonly channel = 'Telegram' as const;

  async sendMessage(message: string, meta?: ChannelDeliveryMeta): Promise<boolean> {
    recordRuntimeTrace({
      signalId: meta?.signalId ?? 'unknown',
      file: 'server/channelAdapter.ts',
      functionName: 'sendMessage',
      timestamp: new Date().toISOString(),
      input: {
        retryCount: meta?.retryCount ?? 0,
        messageLength: message.length,
      },
      output: {
        transport: 'Telegram',
      },
    });
    return sendTelegramMessage(message, meta);
  }

  async sendPhoto(photo: Buffer, caption?: string, meta?: ChannelDeliveryMeta): Promise<boolean> {
    recordRuntimeTrace({
      signalId: meta?.signalId ?? 'unknown',
      file: 'server/channelAdapter.ts',
      functionName: 'sendPhoto',
      timestamp: new Date().toISOString(),
      input: {
        photoBytes: photo.length,
        caption: caption ?? null,
      },
      output: {
        transport: 'Telegram',
      },
    });
    return sendTelegramPhoto(photo, caption, meta);
  }
}

export const defaultChannelAdapter = new TelegramChannelAdapter();
