import { Redis } from 'ioredis';

/**
 * Redis 客户端配置
 * 用途：Session 缓存、消息去重、限流令牌桶、BullMQ 后端
 */
export interface RedisConfig {
  readonly host: string;
  readonly port: number;
  readonly password?: string;
  readonly db?: number;
  readonly keyPrefix?: string;
}

/** ioredis 真实客户端 */
export class RedisClient {
  private readonly client: Redis;

  constructor(config: RedisConfig) {
    this.client = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      db: config.db,
      keyPrefix: config.keyPrefix,
    });
  }

  /** 消息去重：SETNX 语义，已存在则为重复 */
  async isDuplicate(messageId: string, ttlSeconds: number = 3600): Promise<boolean> {
    const result = await this.client.set(`dedup:${messageId}`, '1', 'EX', ttlSeconds, 'NX');
    return result !== 'OK';
  }

  /** 令牌桶限流：窗口内请求数限制 */
  async checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
    const redisKey = `ratelimit:${key}`;
    const count = await this.client.incr(redisKey);
    if (count === 1) {
      await this.client.pexpire(redisKey, windowMs);
    }
    return count <= maxRequests;
  }

  async getSession<T>(sessionId: string): Promise<T | null> {
    const raw = await this.client.get(`session:${sessionId}`);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async setSession<T>(sessionId: string, data: T, ttlMs: number): Promise<void> {
    await this.client.set(`session:${sessionId}`, JSON.stringify(data), 'PX', ttlMs);
  }

  async get<T>(key: string): Promise<T | null> {
    const raw = await this.client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  }

  async set<T>(key: string, value: T, ttlMs?: number): Promise<void> {
    if (ttlMs) {
      await this.client.set(key, JSON.stringify(value), 'PX', ttlMs);
      return;
    }
    await this.client.set(key, JSON.stringify(value));
  }

  async delete(key: string): Promise<boolean> {
    return (await this.client.del(key)) > 0;
  }

  async close(): Promise<void> {
    this.client.disconnect();
  }
}
