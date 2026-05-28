import type { ILLMProvider, LLMMessage, PhaseId } from '@nexus/shared';
import type { IntentType, LLMIntentCandidate, LLMIntentClassifier, LLMIntentDecision } from '@nexus/control-plane';

export interface LLMIntentFewShot {
  readonly text: string;
  readonly decision: LLMIntentDecision;
}

export interface LLMIntentClassifierOptions {
  readonly model: string;
  readonly maxTokens?: number;
  readonly temperature?: number;
  readonly timeoutMs?: number;
  /** Few-shot 校准示例，可显著提升小模型 confidence 的稳定性 */
  readonly fewShotExamples?: readonly LLMIntentFewShot[];
  /** 是否给 LLM 加入"成本敏感"提示（优先 low-tier Agent） */
  readonly costSensitive?: boolean;
}

/**
 * 真实的 LLM 意图分类器实现。
 * 输入用户文本与候选 Agent 描述，要求小模型输出严格 JSON：
 *   {"agentId":"<候选 id>","phase":"intent|execution|connection","intentType":"chat|task|query|unknown","confidence":0-1,"reason":"..."}
 * 解析失败、模型超时或返回未知 agentId 时返回 null，由 IntentRouter 走关键词 fallback。
 * @stability S3
 */
export class LLMIntentClassifierImpl implements LLMIntentClassifier {
  constructor(
    private readonly provider: ILLMProvider,
    private readonly options: LLMIntentClassifierOptions,
  ) {}

  async classify(input: {
    text: string;
    candidates: readonly LLMIntentCandidate[];
    tenantId?: string;
  }): Promise<LLMIntentDecision | null> {
    if (input.candidates.length === 0) return null;

    const messages: LLMMessage[] = [
      { role: 'system', content: buildSystemPrompt(this.options) },
      { role: 'user', content: buildUserPrompt(input.text, input.candidates, input.tenantId) },
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 8000);
    let raw = '';
    try {
      for await (const chunk of this.provider.chat(messages, {
        model: this.options.model,
        maxTokens: this.options.maxTokens ?? 256,
        temperature: this.options.temperature ?? 0,
        abortSignal: controller.signal,
      })) {
        if (chunk.type === 'text_delta') raw += chunk.delta;
      }
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }

    return parseDecision(raw, input.candidates);
  }
}

function buildSystemPrompt(options: LLMIntentClassifierOptions): string {
  const base = [
    '你是 Nexus 平台的意图分类器。',
    '阅读用户消息和候选 Agent 描述，挑选最匹配的 Agent，并返回 0-1 的信心分。',
    '同时判断意图类型：chat（闲聊）/ task（明确任务）/ query（信息查询）/ unknown。',
    options.costSensitive
      ? '当多个候选效果相近时，优先选择 modelTier=low 的 Agent 以节省成本。'
      : '',
    '只输出一个 JSON 对象，不要额外解释、不要 Markdown 代码块。',
  ];

  if (options.fewShotExamples && options.fewShotExamples.length > 0) {
    base.push('', '示例：');
    for (const example of options.fewShotExamples) {
      base.push(`- "${example.text}" → ${JSON.stringify(example.decision)}`);
    }
  }

  return base.filter(Boolean).join('\n');
}

function buildUserPrompt(text: string, candidates: readonly LLMIntentCandidate[], tenantId?: string): string {
  const candidateLines = candidates.map((candidate) => (
    `- id=${candidate.id}; phase=${candidate.phase}; modelTier=${candidate.modelTier ?? 'medium'}; 描述=${candidate.description}; 能力=${candidate.capabilities.join(', ') || '无'}`
  ));
  return [
    '候选 Agent：',
    ...candidateLines,
    '',
    tenantId ? `租户：${tenantId}` : '',
    `用户消息：${text}`,
    '',
    '严格按以下 JSON 输出（不要其他内容）：',
    '{"agentId":"<候选 id 之一>","phase":"intent|execution|connection","intentType":"chat|task|query|unknown","confidence":<0-1>,"reason":"<一句话>"}',
  ].filter(Boolean).join('\n');
}

function parseDecision(raw: string, candidates: readonly LLMIntentCandidate[]): LLMIntentDecision | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const decision = parsed as {
    agentId?: unknown;
    phase?: unknown;
    confidence?: unknown;
    reason?: unknown;
    intentType?: unknown;
  };
  if (typeof decision.agentId !== 'string') return null;
  if (!candidates.some((c) => c.id === decision.agentId)) return null;
  const confidence = typeof decision.confidence === 'number' ? decision.confidence : 0;
  return {
    agentId: decision.agentId,
    phase: typeof decision.phase === 'string' ? (decision.phase as PhaseId) : undefined,
    confidence,
    reason: typeof decision.reason === 'string' ? decision.reason : undefined,
    intentType: typeof decision.intentType === 'string' && isIntentType(decision.intentType)
      ? decision.intentType
      : undefined,
  };
}

function isIntentType(value: string): value is IntentType {
  return value === 'chat' || value === 'task' || value === 'query' || value === 'unknown';
}
