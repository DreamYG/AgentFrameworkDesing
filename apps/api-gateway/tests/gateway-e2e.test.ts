import { describe, expect, it } from 'vitest';
import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';
import { GatewayToolExecutor, ToolGatewayPipeline, registerPMTools } from '@nexus/tool-gateway';
import { createNexusApp } from '../src/bootstrap.js';

class GatewayE2EProvider implements ILLMProvider {
  async *chat(messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    const called = messages.flatMap((message) => message.toolCalls?.map((tool) => tool.name) ?? []);
    if (!called.includes('task.decompose')) {
      yield { type: 'tool_call_start', id: 'tc-decompose', name: 'task.decompose' };
      yield { type: 'tool_call_delta', id: 'tc-decompose', argumentsDelta: '{"requirement":"登录,权限","projectId":"p1"}' };
      yield { type: 'tool_call_end', id: 'tc-decompose' };
      yield { type: 'done', usage: { input: 50, output: 20 } };
      return;
    }
    yield { type: 'text_delta', delta: 'gateway flow complete' };
    yield { type: 'done', usage: { input: 80, output: 20 } };
  }
}

describe('Gateway deployable E2E surface', () => {
  it('accepts HTTP-style messages and streams tool events', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerPMTools(pipeline);
    const app = createNexusApp({
      gatewayConfig: { port: 0, corsOrigins: [] },
      provider: new GatewayE2EProvider(),
      toolExecutor: new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' }),
      defaultModel: 'mock',
    });

    expect((await app.gateway.handleHealth()).status).toBe('ok');
    const response = await app.gateway.handleMessage({
      body: { content: '请拆解登录和权限需求', tenantId: 'tenant-1', userId: 'user-1' },
    });
    expect(response.status).toBe('accepted');
    expect(response.runId).toBeDefined();

    await new Promise((resolve) => setTimeout(resolve, 100));
    const events = [];
    for await (const event of app.gateway.streamEvents(response.runId!)) {
      events.push(event);
    }

    expect(events.some((event) => event.type === 'tool_use_start' && event.toolName === 'task.decompose')).toBe(true);
    expect(events.some((event) => event.type === 'tool_use_result' && event.toolName === 'task.decompose')).toBe(true);
    expect(app.gateway.handleReady().ready).toBe(true);
  });

  it('normalizes Feishu webhook messages into Gateway messages', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerPMTools(pipeline);
    const app = createNexusApp({
      gatewayConfig: { port: 0, corsOrigins: [], feishuEncryptKey: 'test-key' },
      provider: new GatewayE2EProvider(),
      toolExecutor: new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' }),
      defaultModel: 'mock',
    });

    const response = await app.gateway.handleFeishuWebhook({
      body: {
        tenant_key: 'tenant-feishu',
        event: {
          message: { message_id: 'msg-1', content: '{"text":"请拆解需求"}', chat_id: 'chat-1' },
          sender: { sender_id: { user_id: 'user-feishu' } },
        },
      },
    });

    expect('status' in response ? response.status : 'challenge').toBe('accepted');
  });
});
