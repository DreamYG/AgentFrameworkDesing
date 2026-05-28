import { describe, expect, it } from 'vitest';
import { ConsoleModel, renderConsoleHtml } from '../src/index.js';

describe('Nexus Lab Console', () => {
  it('renders chat layout with framework inspector panels', () => {
    const model = new ConsoleModel();
    model.upsertRun({ runId: 'run-1', agentId: 'agent', status: 'running', tenantId: 'tenant', createdAt: new Date() });

    const html = renderConsoleHtml(model, { gatewayBaseUrl: 'http://localhost:3200' });

    // 关键布局元素
    expect(html).toContain('id="composer"');
    expect(html).toContain('id="messageContent"');
    expect(html).toContain('id="chatScroll"');
    expect(html).toContain('id="sessionList"');

    // 框架可视化 tab
    expect(html).toContain('data-tab="overview"');
    expect(html).toContain('data-tab="tools"');
    expect(html).toContain('data-tab="context"');
    expect(html).toContain('data-tab="checkpoint"');
    expect(html).toContain('data-tab="budget"');
    expect(html).toContain('data-tab="approval"');
    expect(html).toContain('data-tab="raw"');

    // Compact 四级卡片
    expect(html).toContain('data-level="L1_time_gap"');
    expect(html).toContain('data-level="L4_legacy"');

    // 流式接入
    expect(html).toContain('/ws/stream/');
    expect(html).toContain('http://localhost:3200');
  });

  it('keeps ConsoleGatewayClient surface for SDK callers', async () => {
    const { ConsoleGatewayClient } = await import('../src/index.js');
    const client = new ConsoleGatewayClient('http://localhost:3200');
    expect(typeof client.submitMessage).toBe('function');
    expect(typeof client.getRun).toBe('function');
    expect(typeof client.cancel).toBe('function');
    expect(typeof client.resume).toBe('function');
    expect(typeof client.refillBudget).toBe('function');
  });
});
