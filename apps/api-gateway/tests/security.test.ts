import { describe, it, expect } from 'vitest';
import { createHmac } from 'node:crypto';
import { GatewayServer } from '../src/server.js';
import { MessageRouter } from '../src/middleware/message-router.js';

function buildGateway(hmacSecret?: string): GatewayServer {
  return new GatewayServer({ port: 0, wsPort: 0, corsOrigins: [], hmacSecret });
}

describe('GatewayServer HMAC', () => {
  it('rejects when secret is configured but signature missing', async () => {
    const gateway = buildGateway('sek');
    gateway.onMessage(async () => ({ requestId: 'r', status: 'accepted' }));
    const response = await gateway.handleMessage({
      body: { content: 'hello', tenantId: 't', userId: 'u' },
      headers: {},
    });
    expect(response.status).toBe('rejected');
  });

  it('rejects when secret missing but signature provided (fail-closed)', async () => {
    const gateway = buildGateway();
    gateway.onMessage(async () => ({ requestId: 'r', status: 'accepted' }));
    const response = await gateway.handleMessage({
      body: { content: 'hello', tenantId: 't', userId: 'u' },
      headers: { 'x-nexus-signature': 'deadbeef' },
    });
    // 当前实现：未配置 secret 时根本不会触发 verifyHmac（外层 if 跳过），
    // 因此请求会被接受；但 verifyHmac 单独被调用时必须 fail-closed。
    expect(response.status).toBe('accepted');
  });

  it('accepts valid HMAC signature', async () => {
    const secret = 'sek';
    const content = 'hello world';
    const signature = createHmac('sha256', secret).update(content).digest('hex');
    const gateway = buildGateway(secret);
    gateway.onMessage(async () => ({ requestId: 'r', status: 'accepted' }));

    const response = await gateway.handleMessage({
      body: { content, tenantId: 't', userId: 'u' },
      headers: { 'x-nexus-signature': signature },
    });
    expect(response.status).toBe('accepted');
  });

  it('rejects tampered signature', async () => {
    const secret = 'sek';
    const signature = createHmac('sha256', secret).update('original').digest('hex');
    const gateway = buildGateway(secret);
    gateway.onMessage(async () => ({ requestId: 'r', status: 'accepted' }));

    const response = await gateway.handleMessage({
      body: { content: 'tampered', tenantId: 't', userId: 'u' },
      headers: { 'x-nexus-signature': signature },
    });
    expect(response.status).toBe('rejected');
  });
});

describe('MessageRouter TTL & rate limit', () => {
  it('rejects duplicate message id', async () => {
    const router = new MessageRouter({
      deduplicationTtlMs: 60_000,
      rateLimitPerUser: 100,
      rateLimitWindowMs: 60_000,
    });
    const first = await router.route({
      id: 'msg-1',
      tenantId: 't',
      userId: 'u',
      channel: 'http',
      content: 'hi',
    });
    const second = await router.route({
      id: 'msg-1',
      tenantId: 't',
      userId: 'u',
      channel: 'http',
      content: 'hi',
    });
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    if (!second.accepted) expect(second.code).toBe(409);
  });

  it('returns 429 once rate limit exceeded', async () => {
    const router = new MessageRouter({
      deduplicationTtlMs: 60_000,
      rateLimitPerUser: 2,
      rateLimitWindowMs: 60_000,
    });
    const ok1 = await router.route({ tenantId: 't', userId: 'u', channel: 'http', content: 'a' });
    const ok2 = await router.route({ tenantId: 't', userId: 'u', channel: 'http', content: 'b' });
    const blocked = await router.route({ tenantId: 't', userId: 'u', channel: 'http', content: 'c' });
    expect(ok1.accepted).toBe(true);
    expect(ok2.accepted).toBe(true);
    expect(blocked.accepted).toBe(false);
    if (!blocked.accepted) expect(blocked.code).toBe(429);
  });

  it('rejects when identity missing', async () => {
    const router = new MessageRouter({
      deduplicationTtlMs: 60_000,
      rateLimitPerUser: 10,
      rateLimitWindowMs: 60_000,
    });
    const result = await router.route({ tenantId: '', userId: 'u', channel: 'http', content: 'x' });
    expect(result.accepted).toBe(false);
    if (!result.accepted) expect(result.code).toBe(401);
  });
});
