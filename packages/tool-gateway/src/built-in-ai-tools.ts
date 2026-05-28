import type { ILLMProvider, LLMMessage } from '@nexus/shared';
import { buildTool } from './build-tool.js';
import type { ToolGatewayPipeline } from './pipeline.js';

export interface WebSearchResult {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

export interface SkillSearchResult {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly tags: readonly string[];
}

export interface BuiltInAIToolsOptions {
  /** Chat 工具使用的 Provider，可为 ProviderRouter */
  readonly chatProvider: ILLMProvider;
  /** 默认对话模型 */
  readonly defaultChatModel: string;
  /** 默认文档摘要模型 */
  readonly defaultSummaryModel?: string;
  /** OpenAI 图像生成回调，未配置时工具返回错误 */
  readonly generateImage?: (params: {
    prompt: string;
    size?: string;
    n?: number;
    model?: string;
  }) => Promise<{ urls: readonly string[]; model: string }>;
  /** 联网搜索回调（Tavily / Brave / SerpAPI 等），未配置时 ai.web.search 返回错误 */
  readonly webSearch?: (params: { query: string; maxResults?: number }) => Promise<readonly WebSearchResult[]>;
  /** 本地技能检索回调（默认走 SkillStore） */
  readonly searchSkills?: (params: { query: string; limit?: number }) => Promise<readonly SkillSearchResult[]>;
}

/**
 * 通用 AI 工具集（无需第三方业务系统即可使用）：
 * - ai.chat                — 与所选模型对话
 * - ai.image.generate      — 图像生成（DALL-E 兼容）
 * - ai.web.search          — 联网搜索（需配置 Tavily/Brave API Key）
 * - ai.document.summarize  — 文档摘要
 * - ai.document.extract    — 从文档抽取结构化信息
 * - ai.document.qa         — 基于文档回答问题
 * - ai.data.transform      — 数据格式/结构转换（JSON / CSV / Markdown 等）
 * - ai.skill.search        — 本地技能/经验检索（基于 SkillStore）
 * @stability S3
 */
export function registerBuiltInAITools(pipeline: ToolGatewayPipeline, options: BuiltInAIToolsOptions): readonly string[] {
  const registered: string[] = [];

  pipeline.registerTool(buildTool<{ prompt: string; model?: string; temperature?: number }, { reply: string; model: string }>({
    name: 'ai.chat',
    description: '向所选 LLM 发送对话提示，返回纯文本结果。',
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        model: { type: 'string' },
        temperature: { type: 'number' },
      },
      required: ['prompt'],
    },
    riskLevel: 'R0',
    characteristics: {
      isReadOnly: true,
      isDestructive: false,
      isConcurrencySafe: true,
      isIdempotent: false,
      reversibility: 'reversible',
      environmentSideEffects: ['none'],
      maxOutputTokens: 4096,
    },
    timeout: 60_000,
    execute: async (params, ctx) => {
      const started = Date.now();
      const model = params.model ?? options.defaultChatModel;
      const messages: LLMMessage[] = [{ role: 'user', content: params.prompt }];
      let reply = '';
      try {
        for await (const chunk of options.chatProvider.chat(messages, {
          model,
          temperature: params.temperature,
          abortSignal: ctx.abortSignal,
        })) {
          if (chunk.type === 'text_delta') reply += chunk.delta;
        }
        return { success: true, data: { reply, model }, durationMs: Date.now() - started };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
          durationMs: Date.now() - started,
        };
      }
    },
  }));
  registered.push('ai.chat');

  pipeline.registerTool(buildTool<{ prompt: string; size?: string; n?: number; model?: string }, { urls: readonly string[]; model: string }>({
    name: 'ai.image.generate',
    description: '根据自然语言提示生成图片，返回图片 URL 列表（DALL-E 兼容）。',
    schema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        size: { type: 'string', enum: ['256x256', '512x512', '1024x1024', '1024x1792', '1792x1024'] },
        n: { type: 'integer', minimum: 1, maximum: 4 },
        model: { type: 'string' },
      },
      required: ['prompt'],
    },
    riskLevel: 'R1',
    characteristics: {
      isReadOnly: false,
      isDestructive: false,
      isConcurrencySafe: true,
      isIdempotent: false,
      reversibility: 'reversible',
      environmentSideEffects: ['external_system_state'],
      maxOutputTokens: 2048,
    },
    timeout: 120_000,
    execute: async (params) => {
      const started = Date.now();
      if (!options.generateImage) {
        return { success: false, error: 'Image generation provider is not configured (set OPENAI_API_KEY).', durationMs: Date.now() - started };
      }
      try {
        const result = await options.generateImage({ prompt: params.prompt, size: params.size, n: params.n, model: params.model });
        return { success: true, data: result, durationMs: Date.now() - started };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
      }
    },
  }));
  registered.push('ai.image.generate');

  pipeline.registerTool(buildTool<{ query: string; maxResults?: number }, { results: readonly WebSearchResult[] }>({
    name: 'ai.web.search',
    description: '联网搜索，根据自然语言 query 返回若干网页摘要。',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        maxResults: { type: 'integer', minimum: 1, maximum: 20 },
      },
      required: ['query'],
    },
    riskLevel: 'R0',
    characteristics: {
      isReadOnly: true,
      isDestructive: false,
      isConcurrencySafe: true,
      isIdempotent: false,
      reversibility: 'reversible',
      environmentSideEffects: ['external_system_state'],
      maxOutputTokens: 4096,
    },
    timeout: 30_000,
    execute: async (params) => {
      const started = Date.now();
      if (!options.webSearch) {
        return {
          success: false,
          error: 'Web search provider is not configured (set TAVILY_API_KEY or BRAVE_API_KEY).',
          durationMs: Date.now() - started,
        };
      }
      try {
        const results = await options.webSearch({ query: params.query, maxResults: params.maxResults });
        return { success: true, data: { results }, durationMs: Date.now() - started };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
      }
    },
  }));
  registered.push('ai.web.search');

  pipeline.registerTool(buildTool<{ content: string; instructions?: string; model?: string }, { summary: string; model: string }>({
    name: 'ai.document.summarize',
    description: '对给定文档文本生成结构化摘要，可附加自定义指令。',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        instructions: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['content'],
    },
    riskLevel: 'R0',
    characteristics: {
      isReadOnly: true,
      isDestructive: false,
      isConcurrencySafe: true,
      isIdempotent: false,
      reversibility: 'reversible',
      environmentSideEffects: ['none'],
      maxOutputTokens: 4096,
    },
    timeout: 90_000,
    execute: (params, ctx) => callLLMText(
      options.chatProvider,
      params.model ?? options.defaultSummaryModel ?? options.defaultChatModel,
      params.instructions ?? '请将以下文档总结为 5-7 条要点，并标注关键决策。',
      params.content,
      ctx.abortSignal,
      'summary',
    ),
  }));
  registered.push('ai.document.summarize');

  pipeline.registerTool(buildTool<{ content: string; schema?: string; instructions?: string; model?: string }, { extracted: string; model: string }>({
    name: 'ai.document.extract',
    description: '从文档中抽取结构化信息，可指定目标 schema 文本说明。',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        schema: { type: 'string', description: '期望的输出结构说明（JSON schema 文本或自然语言）' },
        instructions: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['content'],
    },
    riskLevel: 'R0',
    characteristics: {
      isReadOnly: true,
      isDestructive: false,
      isConcurrencySafe: true,
      isIdempotent: false,
      reversibility: 'reversible',
      environmentSideEffects: ['none'],
      maxOutputTokens: 4096,
    },
    timeout: 90_000,
    execute: (params, ctx) => {
      const baseInstructions = params.instructions
        ?? '请从下面的文档中抽取关键事实、实体与字段，输出 JSON。仅输出 JSON，不要 Markdown 代码块。';
      const fullInstructions = params.schema
        ? `${baseInstructions}\n输出 schema：${params.schema}`
        : baseInstructions;
      return callLLMText(
        options.chatProvider,
        params.model ?? options.defaultSummaryModel ?? options.defaultChatModel,
        fullInstructions,
        params.content,
        ctx.abortSignal,
        'extracted',
      );
    },
  }));
  registered.push('ai.document.extract');

  pipeline.registerTool(buildTool<{ content: string; question: string; model?: string }, { answer: string; model: string }>({
    name: 'ai.document.qa',
    description: '基于给定文档回答问题（限定在文档范围内）。',
    schema: {
      type: 'object',
      properties: {
        content: { type: 'string' },
        question: { type: 'string' },
        model: { type: 'string' },
      },
      required: ['content', 'question'],
    },
    riskLevel: 'R0',
    characteristics: {
      isReadOnly: true,
      isDestructive: false,
      isConcurrencySafe: true,
      isIdempotent: false,
      reversibility: 'reversible',
      environmentSideEffects: ['none'],
      maxOutputTokens: 2048,
    },
    timeout: 90_000,
    execute: async (params, ctx) => {
      const started = Date.now();
      const model = params.model ?? options.defaultSummaryModel ?? options.defaultChatModel;
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: '你是文档问答助手。只根据给定文档回答问题；如果文档没有相关信息，回答“文档中未提及”。',
        },
        { role: 'user', content: `文档：\n${params.content}\n\n问题：${params.question}` },
      ];
      let answer = '';
      try {
        for await (const chunk of options.chatProvider.chat(messages, { model, abortSignal: ctx.abortSignal })) {
          if (chunk.type === 'text_delta') answer += chunk.delta;
        }
        return { success: true, data: { answer, model }, durationMs: Date.now() - started };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
      }
    },
  }));
  registered.push('ai.document.qa');

  pipeline.registerTool(buildTool<{ data: string; instructions: string; format?: string; model?: string }, { result: string; model: string }>({
    name: 'ai.data.transform',
    description: '把结构化或半结构化数据按指令转换为目标格式（如 JSON ↔ CSV、字段重命名、过滤聚合）。',
    schema: {
      type: 'object',
      properties: {
        data: { type: 'string', description: '原始数据文本（JSON / CSV / TSV / Markdown 等）' },
        instructions: { type: 'string', description: '转换说明' },
        format: { type: 'string', description: '目标格式提示（json / csv / markdown / text）' },
        model: { type: 'string' },
      },
      required: ['data', 'instructions'],
    },
    riskLevel: 'R0',
    characteristics: {
      isReadOnly: true,
      isDestructive: false,
      isConcurrencySafe: true,
      isIdempotent: false,
      reversibility: 'reversible',
      environmentSideEffects: ['none'],
      maxOutputTokens: 4096,
    },
    timeout: 90_000,
    execute: async (params, ctx) => {
      const started = Date.now();
      const model = params.model ?? options.defaultSummaryModel ?? options.defaultChatModel;
      const target = params.format ? `目标格式：${params.format}\n` : '';
      const messages: LLMMessage[] = [
        {
          role: 'system',
          content: `你是数据转换助手。根据指令转换给定数据。${target}严格只输出转换结果本身，不要解释、不要 Markdown 代码块。`,
        },
        { role: 'user', content: `指令：${params.instructions}\n\n数据：\n${params.data}` },
      ];
      let result = '';
      try {
        for await (const chunk of options.chatProvider.chat(messages, { model, abortSignal: ctx.abortSignal })) {
          if (chunk.type === 'text_delta') result += chunk.delta;
        }
        return { success: true, data: { result, model }, durationMs: Date.now() - started };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
      }
    },
  }));
  registered.push('ai.data.transform');

  pipeline.registerTool(buildTool<{ query: string; limit?: number }, { results: readonly SkillSearchResult[] }>({
    name: 'ai.skill.search',
    description: '在本地 SkillStore 中检索经验、SOP、技能片段。',
    schema: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        limit: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['query'],
    },
    riskLevel: 'R0',
    characteristics: {
      isReadOnly: true,
      isDestructive: false,
      isConcurrencySafe: true,
      isIdempotent: true,
      reversibility: 'reversible',
      environmentSideEffects: ['none'],
      maxOutputTokens: 4096,
    },
    timeout: 10_000,
    execute: async (params) => {
      const started = Date.now();
      if (!options.searchSkills) {
        return {
          success: false,
          error: 'Skill search is not configured (SkillStore not injected).',
          durationMs: Date.now() - started,
        };
      }
      try {
        const results = await options.searchSkills({ query: params.query, limit: params.limit });
        return { success: true, data: { results }, durationMs: Date.now() - started };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
      }
    },
  }));
  registered.push('ai.skill.search');

  return registered;
}

async function callLLMText<TKey extends string>(
  provider: ILLMProvider,
  model: string,
  systemPrompt: string,
  userContent: string,
  abortSignal: AbortSignal,
  field: TKey,
): Promise<{ success: boolean; data?: Record<TKey | 'model', string>; error?: string; durationMs: number }> {
  const started = Date.now();
  const messages: LLMMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent },
  ];
  let text = '';
  try {
    for await (const chunk of provider.chat(messages, { model, abortSignal })) {
      if (chunk.type === 'text_delta') text += chunk.delta;
    }
    return {
      success: true,
      data: { [field]: text, model } as Record<TKey | 'model', string>,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - started,
    };
  }
}
