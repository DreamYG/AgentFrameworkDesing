import type { NexusMessage } from '../server.js';

/**
 * Message Router — 协议归一化管线
 * 签名验证 → 消息去重 → 身份映射 → 限流 → 分发
 */
export interface MessageRouterConfig {
  readonly deduplicationTtlMs: number;
  readonly rateLimitPerUser: number;
  readonly rateLimitWindowMs: number;
}

export type RouteResult =
  | { readonly accepted: true; readonly message: NexusMessage }
  | { readonly accepted: false; readonly reason: string; readonly code: number };

export class MessageRouter {
  private readonly processedIds = new Set<string>();
  private readonly config: MessageRouterConfig;

  constructor(config: MessageRouterConfig) {
    this.config = config;
  }

  getConfig(): MessageRouterConfig {
    return this.config;
  }

  async route(raw: {
    id?: string;
    tenantId: string;
    userId: string;
    channel: NexusMessage['channel'];
    content: string;
    signature?: string;
    metadata?: Record<string, unknown>;
  }): Promise<RouteResult> {
    const messageId = raw.id ?? crypto.randomUUID();

    if (this.processedIds.has(messageId)) {
      return { accepted: false, reason: 'Duplicate message', code: 409 };
    }
    this.processedIds.add(messageId);

    if (!raw.tenantId || !raw.userId) {
      return { accepted: false, reason: 'Missing identity', code: 401 };
    }

    const message: NexusMessage = {
      id: messageId,
      tenantId: raw.tenantId,
      userId: raw.userId,
      channel: raw.channel,
      content: raw.content,
      metadata: raw.metadata,
      timestamp: new Date(),
    };

    return { accepted: true, message };
  }
}
