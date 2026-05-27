import { describe, expect, it } from 'vitest';
import { GatewayToolExecutor, ToolGatewayPipeline, buildTool, registerPMTools } from '../src/index.js';

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
});
