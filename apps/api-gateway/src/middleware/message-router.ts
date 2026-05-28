import type { NexusMessage } from '../server.js';
import { InputGuardrail } from '@nexus/guardrails';

/**
 * Message Router — 协议归一化管线
 * 签名验证 → 消息去重 → 身份映射 → 限流 → 分发
 */
export interface MessageRouterConfig {
  readonly deduplicationTtlMs: number;
  readonly rateLimitPerUser: number;
  readonly rateLimitWindowMs: number;
}

export interface MessageRouterBackend {
  isDuplicate(messageId: string, ttlMs: number): Promise<boolean>;
  checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean>;
}

export type RouteResult =
  | { readonly accepted: true; readonly message: NexusMessage }
  | { readonly accepted: false; readonly reason: string; readonly code: number };

export class MessageRouter {
  private readonly processedIds = new Map<string, number>();
  private readonly rateLimits = new Map<string, { count: number; resetAt: number }>();
  private readonly config: MessageRouterConfig;
  private readonly inputGuardrail = new InputGuardrail();

  constructor(
    config: MessageRouterConfig,
    private readonly backend?: MessageRouterBackend,
  ) {
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
    metadata?: Record<string, unknown>;
  }): Promise<RouteResult> {
    const messageId = raw.id ?? crypto.randomUUID();
    this.evictExpired();

    const scan = this.inputGuardrail.scan(raw.content);
    if (!scan.safe) {
      return { accepted: false, reason: scan.reason, code: 400 };
    }

    if (await this.isDuplicate(messageId)) {
      return { accepted: false, reason: 'Duplicate message', code: 409 };
    }

    if (!raw.tenantId || !raw.userId) {
      return { accepted: false, reason: 'Missing identity', code: 401 };
    }

    if (!(await this.checkRateLimit(`${raw.tenantId}:${raw.userId}`))) {
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

  private async isDuplicate(messageId: string): Promise<boolean> {
    if (this.backend) {
      return this.backend.isDuplicate(messageId, this.config.deduplicationTtlMs);
    }
    if (this.processedIds.has(messageId)) return true;
    this.processedIds.set(messageId, Date.now() + this.config.deduplicationTtlMs);
    return false;
  }

  private async checkRateLimit(key: string): Promise<boolean> {
    if (this.backend) {
      return this.backend.checkRateLimit(key, this.config.rateLimitPerUser, this.config.rateLimitWindowMs);
    }
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
