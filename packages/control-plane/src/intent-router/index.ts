import type { PhaseId } from '@nexus/shared';
import type { AgentDefinition } from '../agent-registry/index.js';

export interface IntentClassification {
  readonly phase: PhaseId;
  readonly confidence: number;
  readonly suggestedAgentId?: string;
  readonly fallbackAgentId?: string;
}

export interface IntentRouterConfig {
  readonly fallbackAgentId: string;
  readonly confidenceThreshold: number;
}

/**
 * Intent Router — 意图分类与 Agent 路由
 * 将用户输入分类到正确的 Phase 和 Agent
 * @stability S2
 */
export class IntentRouter {
  private readonly agents: AgentDefinition[] = [];

  constructor(private readonly config: IntentRouterConfig) {}

  registerAgents(agents: readonly AgentDefinition[]): void {
    this.agents.length = 0;
    this.agents.push(...agents);
  }

  /**
   * 基于规则的意图路由（MVP）
   * 生产版本应使用 LLM 意图分类替代
   */
  route(input: string, context?: { phase?: PhaseId }): IntentClassification {
    if (context?.phase) {
      const agent = this.findBestAgent(context.phase, input);
      return {
        phase: context.phase,
        confidence: 0.9,
        suggestedAgentId: agent?.id,
        fallbackAgentId: this.config.fallbackAgentId,
      };
    }

    const phase = this.classifyPhase(input);
    const agent = this.findBestAgent(phase, input);

    return {
      phase,
      confidence: 0.7,
      suggestedAgentId: agent?.id,
      fallbackAgentId: this.config.fallbackAgentId,
    };
  }

  private classifyPhase(input: string): PhaseId {
    const lower = input.toLowerCase();

    const executionKeywords = ['代码', '实现', '开发', '测试', '部署', 'code', 'implement', 'deploy', 'test'];
    if (executionKeywords.some((k) => lower.includes(k))) return 'execution';

    const connectionKeywords = ['通知', '文档', '会议', '审批', '日历', 'notify', 'document', 'meeting'];
    if (connectionKeywords.some((k) => lower.includes(k))) return 'connection';

    return 'intent';
  }

  private findBestAgent(phase: PhaseId, _input: string): AgentDefinition | undefined {
    const candidates = this.agents.filter((a) => a.phase === phase && a.enabled);
    return candidates[0];
  }
}
