import type { PhaseId } from '@nexus/shared';
import type { AgentDefinition } from '../agent-registry/index.js';

/** 用户意图类型——用于下游差异化处理（如闲聊跳过审计/budget） */
export type IntentType = 'chat' | 'task' | 'query' | 'unknown';

/** 意图分类结果（路由后） */
export interface IntentClassification {
  readonly phase: PhaseId;
  readonly confidence: number;
  readonly suggestedAgentId?: string;
  readonly fallbackAgentId?: string;
  /**
   * 决策来源细分：
   * - llm                       — LLM 高信心采纳
   * - llm_cache_hit             — 命中意图缓存
   * - llm_low_confidence        — LLM 输出但信心不足，回落关键词
   * - llm_unknown_agent         — LLM 输出 agentId 不在 enabled 列表
   * - llm_no_decision           — LLM 解析失败 / 超时
   * - llm_disabled              — 未注入 LLMIntentClassifier
   * - keyword                   — 关键词命中
   * - fallback                  — 关键词无命中，用 fallbackAgentId
   */
  readonly source:
    | 'llm'
    | 'llm_cache_hit'
    | 'llm_low_confidence'
    | 'llm_unknown_agent'
    | 'llm_no_decision'
    | 'llm_disabled'
    | 'keyword'
    | 'fallback';
  readonly reason?: string;
  /** 意图类型（chat/task/query/unknown），来自 LLM 或 keyword 推断 */
  readonly intentType?: IntentType;
  /** 信心过低、产品建议要求用户澄清时为 true（短路 Run） */
  readonly requiresClarification?: boolean;
  /** 本次 LLM 调用延迟（毫秒），便于性能观测 */
  readonly latencyMs?: number;
}

/** 候选 Agent 描述（送给 LLM 决策的输入） */
export interface LLMIntentCandidate {
  readonly id: string;
  readonly phase: PhaseId;
  readonly description: string;
  readonly capabilities: readonly string[];
  /** 模型成本档（用于成本敏感路由提示） */
  readonly modelTier?: 'low' | 'medium' | 'high';
}

/** LLM 决策输出 */
export interface LLMIntentDecision {
  readonly agentId: string;
  readonly phase?: PhaseId;
  readonly confidence: number;
  readonly reason?: string;
  readonly intentType?: IntentType;
}

/** LLM 意图分类器端口；具体实现由上层（如 api-gateway）注入。 */
export interface LLMIntentClassifier {
  classify(input: {
    readonly text: string;
    readonly candidates: readonly LLMIntentCandidate[];
    readonly tenantId?: string;
  }): Promise<LLMIntentDecision | null>;
}

/** 意图缓存端口；bootstrap 注入 Redis 实现，未注入则不缓存 */
export interface IntentCache {
  get(key: string): Promise<LLMIntentDecision | null>;
  set(key: string, value: LLMIntentDecision, ttlSec: number): Promise<void>;
}

/** 路由观测指标事件 */
export interface IntentRouterMetricEvent {
  readonly source: IntentClassification['source'];
  readonly latencyMs: number;
  readonly confidence: number;
  readonly cacheHit: boolean;
  readonly tenantId?: string;
  readonly agentId?: string;
}

export interface IntentRouterConfig {
  readonly fallbackAgentId: string;
  /** LLM 决策被采纳的最低信心，默认 0.5 */
  readonly confidenceThreshold: number;
  /** 信心低于此值且无关键词命中时，要求用户澄清，默认 0.2 */
  readonly clarificationThreshold?: number;
  readonly llmClassifier?: LLMIntentClassifier;
  /** 意图缓存（按 tenantId+text hash），未提供时不缓存 */
  readonly cache?: IntentCache;
  /** 缓存 TTL（秒），默认 60 */
  readonly cacheTtlSec?: number;
  /** Phase 关键词；未提供时使用内置中英文词表 */
  readonly executionKeywords?: readonly string[];
  readonly connectionKeywords?: readonly string[];
  /** 观测指标回调，bootstrap 注入 logger + metrics */
  readonly onMetric?: (event: IntentRouterMetricEvent) => void;
}

const DEFAULT_EXECUTION_KEYWORDS = ['代码', '实现', '开发', '测试', '部署', 'code', 'implement', 'deploy', 'test'];
const DEFAULT_CONNECTION_KEYWORDS = ['通知', '文档', '会议', '审批', '日历', 'notify', 'document', 'meeting'];
const DEFAULT_CHAT_KEYWORDS = ['你好', 'hello', 'hi', '在吗', '谢谢', 'thanks'];

/**
 * Intent Router — 意图分类与 Agent 路由。
 * 决策优先级：缓存 → LLM → 关键词 → fallback；任意一步失败自动降级。
 * @stability S2
 */
export class IntentRouter {
  private readonly agents: AgentDefinition[] = [];
  private readonly executionKeywords: readonly string[];
  private readonly connectionKeywords: readonly string[];

  constructor(private readonly config: IntentRouterConfig) {
    this.executionKeywords = config.executionKeywords ?? DEFAULT_EXECUTION_KEYWORDS;
    this.connectionKeywords = config.connectionKeywords ?? DEFAULT_CONNECTION_KEYWORDS;
  }

  registerAgents(agents: readonly AgentDefinition[]): void {
    this.agents.length = 0;
    this.agents.push(...agents);
  }

  async route(input: string, context?: { phase?: PhaseId; tenantId?: string }): Promise<IntentClassification> {
    const startedAt = Date.now();
    const tenantId = context?.tenantId;
    const targetPhase = context?.phase ?? this.classifyPhase(input);

    if (!this.config.llmClassifier) {
      return this.finalizeKeyword(input, targetPhase, startedAt, false, 'llm_disabled');
    }

    const candidates = this.candidatesFor(targetPhase);
    if (candidates.length === 0) {
      return this.finalizeKeyword(input, targetPhase, startedAt, false, 'llm_disabled');
    }

    const cacheKey = `intent:${tenantId ?? 'default'}:${hash(input)}`;
    const cached = this.config.cache ? await this.config.cache.get(cacheKey).catch(() => null) : null;
    if (cached) {
      const result = this.buildLLMResult(cached, targetPhase, startedAt, 'llm_cache_hit', tenantId);
      if (result) {
        this.emitMetric(result, startedAt, true, tenantId);
        return result;
      }
    }

    let decision: LLMIntentDecision | null;
    try {
      decision = await this.config.llmClassifier.classify({ text: input, candidates, tenantId });
    } catch {
      const fallback = this.finalizeKeyword(input, targetPhase, startedAt, false, 'llm_no_decision');
      return fallback;
    }

    if (!decision) {
      return this.finalizeKeyword(input, targetPhase, startedAt, false, 'llm_no_decision');
    }

    if (decision.confidence < this.config.confidenceThreshold) {
      return this.finalizeKeyword(input, targetPhase, startedAt, false, 'llm_low_confidence');
    }

    const agent = this.agents.find((item) => item.id === decision!.agentId && item.enabled);
    if (!agent) {
      return this.finalizeKeyword(input, targetPhase, startedAt, false, 'llm_unknown_agent');
    }

    if (this.config.cache) {
      void this.config.cache
        .set(cacheKey, decision, this.config.cacheTtlSec ?? 60)
        .catch(() => undefined);
    }

    const result = this.buildLLMResult(decision, targetPhase, startedAt, 'llm', tenantId);
    if (!result) return this.finalizeKeyword(input, targetPhase, startedAt, false, 'llm_unknown_agent');
    this.emitMetric(result, startedAt, false, tenantId);
    return result;
  }

  private buildLLMResult(
    decision: LLMIntentDecision,
    targetPhase: PhaseId,
    _startedAt: number,
    source: IntentClassification['source'],
    _tenantId: string | undefined,
  ): IntentClassification | null {
    const agent = this.agents.find((item) => item.id === decision.agentId && item.enabled);
    if (!agent) return null;
    return {
      phase: decision.phase ?? targetPhase ?? agent.phase,
      confidence: clamp01(decision.confidence),
      suggestedAgentId: agent.id,
      fallbackAgentId: this.config.fallbackAgentId,
      source,
      reason: decision.reason,
      intentType: decision.intentType ?? this.inferIntentType(agent.id),
      requiresClarification: false,
    };
  }

  private finalizeKeyword(
    input: string,
    targetPhase: PhaseId,
    startedAt: number,
    _cacheHit: boolean,
    upstreamReason: IntentClassification['source'],
  ): IntentClassification {
    const phase = targetPhase ?? this.classifyPhase(input);
    const agent = this.findBestAgent(phase, input);
    const reasonNote = `upstream=${upstreamReason}`;

    if (!agent) {
      const clarifyAt = this.config.clarificationThreshold ?? 0.2;
      const result: IntentClassification = {
        phase,
        confidence: 0.1,
        suggestedAgentId: this.config.fallbackAgentId,
        fallbackAgentId: this.config.fallbackAgentId,
        source: 'fallback',
        reason: reasonNote,
        intentType: this.classifyChatType(input),
        requiresClarification: clarifyAt > 0 && 0.1 < clarifyAt,
      };
      this.emitMetric(result, startedAt, false, undefined);
      return result;
    }

    const result: IntentClassification = {
      phase,
      confidence: 0.7,
      suggestedAgentId: agent.id,
      fallbackAgentId: this.config.fallbackAgentId,
      source: 'keyword',
      reason: reasonNote,
      intentType: this.inferIntentType(agent.id),
      requiresClarification: false,
    };
    this.emitMetric(result, startedAt, false, undefined);
    return result;
  }

  private candidatesFor(phase?: PhaseId): readonly LLMIntentCandidate[] {
    return this.agents
      .filter((agent) => agent.enabled && (!phase || agent.phase === phase))
      .map((agent) => ({
        id: agent.id,
        phase: agent.phase,
        description: agent.description,
        capabilities: [...agent.allowedTools],
        modelTier: inferModelTier(agent.modelPreference),
      }));
  }

  private classifyPhase(input: string): PhaseId {
    const lower = input.toLowerCase();
    if (this.executionKeywords.some((k) => lower.includes(k))) return 'execution';
    if (this.connectionKeywords.some((k) => lower.includes(k))) return 'connection';
    return 'intent';
  }

  private classifyChatType(input: string): IntentType {
    const lower = input.toLowerCase().trim();
    if (DEFAULT_CHAT_KEYWORDS.some((k) => lower.includes(k))) return 'chat';
    if (lower.length < 4) return 'chat';
    return 'unknown';
  }

  private inferIntentType(agentId: string): IntentType {
    if (agentId === 'general-assistant') return 'chat';
    return 'task';
  }

  private findBestAgent(phase: PhaseId, input: string): AgentDefinition | undefined {
    const candidates = this.agents.filter((a) => a.phase === phase && a.enabled);
    const lower = input.toLowerCase();
    const scored = candidates
      .map((agent) => ({ agent, score: this.scoreAgent(agent, lower) }))
      .sort((a, b) => b.score - a.score);
    return scored[0]?.agent;
  }

  private scoreAgent(agent: AgentDefinition, input: string): number {
    const haystack = [
      agent.id,
      agent.name,
      agent.description,
      ...agent.allowedTools,
    ].join(' ').toLowerCase();
    const tokens = input.split(/\s+|，|。|、|,|;|；/).filter(Boolean);
    return tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
  }

  private emitMetric(
    result: IntentClassification,
    startedAt: number,
    cacheHit: boolean,
    tenantId: string | undefined,
  ): void {
    if (!this.config.onMetric) return;
    const event: IntentRouterMetricEvent = {
      source: result.source,
      latencyMs: Date.now() - startedAt,
      confidence: result.confidence,
      cacheHit,
      ...(tenantId !== undefined ? { tenantId } : {}),
      ...(result.suggestedAgentId ? { agentId: result.suggestedAgentId } : {}),
    };
    try {
      this.config.onMetric(event);
    } catch {
      // metrics 不应该影响主流程
    }
  }
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function inferModelTier(model: string): LLMIntentCandidate['modelTier'] {
  const lower = model.toLowerCase();
  if (lower.includes('haiku') || lower.includes('mini') || lower.includes('local')) return 'low';
  if (lower.includes('opus') || lower.includes('o1') || lower.includes('gpt-4')) return 'high';
  return 'medium';
}

/** 简单哈希；不需要密码学强度，仅用作 cache key */
function hash(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}
