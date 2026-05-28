import { describe, expect, it } from 'vitest';
import { ConsoleModel, renderConsoleHtml } from '../src/index.js';

describe('Console MVP', () => {
  it('renders runs, approvals, packs and debug controls', () => {
    const model = new ConsoleModel();
    model.upsertRun({ runId: 'run-1', agentId: 'agent', status: 'running', tenantId: 'tenant', createdAt: new Date() });
    model.upsertApproval({ requestId: 'approval-1', runId: 'run-1', toolName: 'task.assign', riskLevel: 'R2', status: 'pending' });
    model.upsertPack({ packId: 'pack-1', name: 'Pack', version: '1.0.0', status: 'enabled' });

    const html = renderConsoleHtml(model, { gatewayBaseUrl: 'http://localhost:3000' });
    expect(html).toContain('run-1');
    expect(html).toContain('approval-1');
    expect(html).toContain('pack-1');
    expect(html).toContain('id="messageForm"');
    expect(html).toContain('id="logList"');
    expect(html).toContain('/ws/stream/');
    expect(html).toContain('http://localhost:3000');
  });
});
