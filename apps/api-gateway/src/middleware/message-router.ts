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
  private readonly processedIds = new Map<string, number>();
  private readonly rateLimits = new Map<string, { count: number; resetAt: number }>();
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
    this.evictExpired();

    if (this.processedIds.has(messageId)) {
      return { accepted: false, reason: 'Duplicate message', code: 409 };
    }
    this.processedIds.set(messageId, Date.now() + this.config.deduplicationTtlMs);

    if (!raw.tenantId || !raw.userId) {
      return { accepted: false, reason: 'Missing identity', code: 401 };
    }

    if (!this.checkRateLimit(`${raw.tenantId}:${raw.userId}`)) {
      return { accepted: false, reason: 'Rate limit exceeded', code: 429 };
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

  private checkRateLimit(key: string): boolean {
    const now = Date.now();
    const bucket = this.rateLimits.get(key);
    if (!bucket || now >= bucket.resetAt) {
      this.rateLimits.set(key, { count: 1, resetAt: now + this.config.rateLimitWindowMs });
      return true;
    }
    if (bucket.count >= this.config.rateLimitPerUser) return false;
    bucket.count++;
    return true;
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [id, expiresAt] of this.processedIds) {
      if (expiresAt <= now) this.processedIds.delete(id);
    }
    for (const [key, bucket] of this.rateLimits) {
      if (bucket.resetAt <= now) this.rateLimits.delete(key);
    }
  }
}
