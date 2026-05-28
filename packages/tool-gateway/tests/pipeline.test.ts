import { describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { GatewayToolExecutor, MCPAdapter, ToolGatewayPipeline, buildTool, registerPMTools } from '../src/index.js';

describe('Tool Gateway Phase 1 MVP', () => {
  it('keeps buildTool fail-closed defaults for undeclared safety features', () => {
    const tool = buildTool({
      name: 'demo.write',
      description: 'demo',
      execute: async () => ({ success: true, durationMs: 0 }),
    });

    expect(tool.riskLevel).toBe('R2');
    expect(tool.characteristics.isDestructive).toBe(true);
  });

  it('executes registered PM tools through GatewayToolExecutor', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerPMTools(pipeline);
    const executor = new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });

    const result = await executor.execute('task.decompose', '{"requirement":"登录,权限"}', 'run-1');

    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).toContain('tasks');
  });

  it('discovers and executes HTTP MCP tools', async () => {
    const server = createServer((req, res) => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && req.url === '/health') return res.end(JSON.stringify({ healthy: true }));
      if (req.method === 'GET' && req.url === '/tools') {
        return res.end(JSON.stringify([{ name: 'demo.echo', description: 'Echo', inputSchema: { type: 'object' }, riskLevel: 'R0' }]));
      }
      if (req.method === 'POST' && req.url === '/tools/demo.echo/call') {
        return res.end(JSON.stringify({ success: true, data: { echoed: true }, durationMs: 0 }));
      }
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'not found' }));
    });
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    try {
      const adapter = new MCPAdapter(`http://127.0.0.1:${port}`);
      expect(await adapter.ping()).toBe(true);
      const tools = await adapter.discover();
      expect(tools[0]?.name).toBe('demo.echo');
      const result = await adapter.execute('demo.echo', {}, {
        runId: 'run',
        tenantId: 'tenant',
        agentId: 'agent',
        turnIndex: 0,
        abortSignal: new AbortController().signal,
      });
      expect(result.success).toBe(true);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
