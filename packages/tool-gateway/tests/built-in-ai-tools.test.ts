import { describe, expect, it } from 'vitest';
import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';
import {
  GatewayToolExecutor,
  ToolGatewayPipeline,
  registerBuiltInAITools,
} from '../src/index.js';

class EchoProvider implements ILLMProvider {
  async *chat(messages: readonly LLMMessage[], options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    const user = messages.find((message) => message.role === 'user');
    yield { type: 'text_delta', delta: `${options.model}:${String(user?.content ?? '')}` };
    yield { type: 'done', usage: { input: 1, output: 1 } };
  }
}

describe('Built-in AI tools', () => {
  it('exposes ai.chat / ai.image.generate / ai.document.summarize via the tool gateway', async () => {
    const pipeline = new ToolGatewayPipeline();
    const generated: Array<{ prompt: string }> = [];
    registerBuiltInAITools(pipeline, {
      chatProvider: new EchoProvider(),
      defaultChatModel: 'local-test',
      generateImage: async ({ prompt }) => {
        generated.push({ prompt });
        return { urls: ['https://example.com/image.png'], model: 'dall-e-test' };
      },
    });

    const executor = new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });

    const chat = await executor.execute('ai.chat', '{"prompt":"hello"}', 'run-1');
    expect(chat.success).toBe(true);
    expect(JSON.stringify(chat.data)).toContain('local-test:hello');

    const summary = await executor.execute('ai.document.summarize', '{"content":"项目背景与目标"}', 'run-2');
    expect(summary.success).toBe(true);
    expect(JSON.stringify(summary.data)).toContain('local-test:项目背景与目标');

    const image = await executor.execute('ai.image.generate', '{"prompt":"红色机器人"}', 'run-3');
    expect(image.success).toBe(true);
    expect(generated[0]?.prompt).toBe('红色机器人');
  });

  it('runs document extract / qa and data transform through the LLM', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerBuiltInAITools(pipeline, {
      chatProvider: new EchoProvider(),
      defaultChatModel: 'local-test',
    });
    const executor = new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });

    const extract = await executor.execute(
      'ai.document.extract',
      '{"content":"合同金额 1 万元","schema":"{amount:number}"}',
      'run-extract',
    );
    expect(extract.success).toBe(true);
    expect(JSON.stringify(extract.data)).toContain('合同金额 1 万元');

    const qa = await executor.execute(
      'ai.document.qa',
      '{"content":"项目截止日 2026-12-31","question":"截止日是?"}',
      'run-qa',
    );
    expect(qa.success).toBe(true);
    expect(JSON.stringify(qa.data)).toContain('截止日');

    const transform = await executor.execute(
      'ai.data.transform',
      '{"data":"a,b\\n1,2","instructions":"to json","format":"json"}',
      'run-transform',
    );
    expect(transform.success).toBe(true);
    expect(JSON.stringify(transform.data)).toContain('to json');
  });

  it('runs ai.web.search via injected provider and reports error otherwise', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerBuiltInAITools(pipeline, {
      chatProvider: new EchoProvider(),
      defaultChatModel: 'local-test',
      webSearch: async ({ query, maxResults }) => [
        { title: query, url: `https://example.com/${query}`, snippet: `top-${maxResults ?? 5}` },
      ],
    });
    const executor = new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });

    const ok = await executor.execute('ai.web.search', '{"query":"nexus"}', 'run-search');
    expect(ok.success).toBe(true);
    expect(JSON.stringify(ok.data)).toContain('https://example.com/nexus');

    const pipeline2 = new ToolGatewayPipeline();
    registerBuiltInAITools(pipeline2, { chatProvider: new EchoProvider(), defaultChatModel: 'local-test' });
    const executor2 = new GatewayToolExecutor(pipeline2, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });
    const fail = await executor2.execute('ai.web.search', '{"query":"x"}', 'run-no-search');
    expect(fail.success).toBe(false);
    expect(fail.error).toContain('Web search provider');
  });

  it('runs ai.skill.search via injected SkillStore callback', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerBuiltInAITools(pipeline, {
      chatProvider: new EchoProvider(),
      defaultChatModel: 'local-test',
      searchSkills: async ({ query, limit }) => [
        { id: `skill-${query}`, title: query, summary: `summary-${query}`, tags: [] },
      ].slice(0, limit ?? 10),
    });
    const executor = new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });

    const result = await executor.execute('ai.skill.search', '{"query":"wbs"}', 'run-skill');
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).toContain('skill-wbs');
  });

  it('reports failure when image generation is not configured', async () => {
    const pipeline = new ToolGatewayPipeline();
    registerBuiltInAITools(pipeline, {
      chatProvider: new EchoProvider(),
      defaultChatModel: 'local-test',
    });
    const executor = new GatewayToolExecutor(pipeline, { approvalPolicy: 'auto', maxRiskLevel: 'R2' });
    const result = await executor.execute('ai.image.generate', '{"prompt":"x"}', 'run-x');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Image generation provider');
  });
});
