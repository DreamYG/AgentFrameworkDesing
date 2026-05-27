import { createHmac } from 'node:crypto';
import type { NexusMessage } from '../server.js';

export interface FeishuWebhookPayload {
  readonly challenge?: string;
  readonly event?: {
    readonly message?: {
      readonly message_id: string;
      readonly content: string;
      readonly chat_id?: string;
    };
    readonly sender?: {
      readonly sender_id?: {
        readonly user_id?: string;
        readonly open_id?: string;
      };
    };
  };
  readonly tenant_key?: string;
}

export class FeishuChannelAdapter {
  constructor(private readonly encryptKey: string) {}

  verify(timestamp: string, nonce: string, body: string, signature: string): boolean {
    const base = `${timestamp}${nonce}${this.encryptKey}${body}`;
    const expected = createHmac('sha256', this.encryptKey).update(base).digest('base64');
    return expected === signature;
  }

  normalize(payload: FeishuWebhookPayload): NexusMessage | null {
    const message = payload.event?.message;
    if (!message) return null;

    const content = this.extractText(message.content);
    const userId = payload.event?.sender?.sender_id?.user_id
      ?? payload.event?.sender?.sender_id?.open_id
      ?? 'unknown';

    return {
      id: message.message_id,
      tenantId: payload.tenant_key ?? 'default',
      userId,
      channel: 'feishu',
      content,
      metadata: { chatId: message.chat_id },
      timestamp: new Date(),
    };
  }

  private extractText(raw: string): string {
    try {
      const parsed = JSON.parse(raw) as { text?: string };
      return parsed.text ?? raw;
    } catch {
      return raw;
    }
  }
}
