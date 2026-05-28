import { describe, it, expect } from 'vitest';
import { GatewayServer } from '../src/server.js';

function buildGateway(): GatewayServer {
  return new GatewayServer({ port: 0, corsOrigins: [] });
}

describe('GatewayServer /health', () => {
  it('returns ok when no checks are registered', async () => {
    const gateway = buildGateway();
    const result = await gateway.handleHealth();
    expect(result.status).toBe('ok');
    expect(result.checks).toEqual({});
  });

  it('returns ok when all checks pass', async () => {
    const gateway = buildGateway();
    gateway.setHealthChecks([
      { name: 'database', check: async () => undefined },
      { name: 'redis', check: async () => undefined },
    ]);
    const result = await gateway.handleHealth();
    expect(result.status).toBe('ok');
    expect(result.checks['database']).toEqual({ healthy: true });
    expect(result.checks['redis']).toEqual({ healthy: true });
  });

  it('returns degraded with error detail when a dependency check throws', async () => {
    const gateway = buildGateway();
    gateway.setHealthChecks([
      { name: 'database', check: async () => undefined },
      { name: 'redis', check: async () => { throw new Error('connection refused'); } },
    ]);
    const result = await gateway.handleHealth();
    expect(result.status).toBe('degraded');
    expect(result.checks['database']?.healthy).toBe(true);
    expect(result.checks['redis']?.healthy).toBe(false);
    expect(result.checks['redis']?.error).toContain('connection refused');
  });
});
