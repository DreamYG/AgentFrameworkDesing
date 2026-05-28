/**
 * Trust Engine — 信任度评估与调节。
 *
 * 设计依据：nexus-enterprise-agent-middleware-complete-solution.md §16
 * 用途：
 * - 评估 Agent 在某个任务域上的可信度（基于历史成功率、审批通过率、用户反馈）
 * - 调节 AutonomyScore（信任高的 Agent 可执行更高风险工具）
 * - 触发降级（信任骤降时强制人工审批）
 *
 * Phase 1：仅冻结接口 + 内存 MVP；持久化与多维度评估留待 Phase 2/3。
 * @stability S2
 */

export type TrustDimension =
  | 'tool_success_rate'      // 工具调用成功率
  | 'approval_pass_rate'     // 审批通过率
  | 'user_feedback'          // 用户显式反馈
  | 'guardrail_compliance';  // 安全护栏遵从

export interface TrustSnapshot {
  readonly agentId: string;
  readonly tenantId: string;
  /** 综合信任分 0-1 */
  readonly overallScore: number;
  /** 各维度分项 */
  readonly dimensions: Readonly<Record<TrustDimension, number>>;
  /** 样本数（少于阈值则使用 fallback 默认值） */
  readonly sampleSize: number;
  /** 计算时间 */
  readonly evaluatedAt: Date;
}

export interface TrustAdjustment {
  readonly agentId: string;
  /** 自主度调节：-1（强制审批）~ +1（升级权限） */
  readonly autonomyDelta: number;
  /** 触发原因 */
  readonly reason: string;
}

export interface TrustEvent {
  readonly agentId: string;
  readonly tenantId: string;
  readonly dimension: TrustDimension;
  /** 单次评估值 0-1 */
  readonly value: number;
  readonly weight?: number;
  readonly evidenceId?: string;
}

const DEFAULT_DIMENSION_VALUES: Readonly<Record<TrustDimension, number>> = {
  tool_success_rate: 0.5,
  approval_pass_rate: 0.5,
  user_feedback: 0.5,
  guardrail_compliance: 1.0,
};
const DIMENSION_WEIGHTS: Readonly<Record<TrustDimension, number>> = {
  tool_success_rate: 0.35,
  approval_pass_rate: 0.25,
  user_feedback: 0.25,
  guardrail_compliance: 0.15,
};
const DEGRADATION_THRESHOLD = 0.4;
const ELEVATION_THRESHOLD = 0.85;
const MIN_SAMPLE_FOR_ADJUSTMENT = 10;

/**
 * 信任引擎 MVP：滑动窗口累计 + 加权综合分。
 * 生产实现应换成时间衰减 + 持久化 + 多租户隔离。
 */
export class TrustEngine {
  private readonly samples = new Map<string, TrustEvent[]>();
  private readonly windowSize: number;

  constructor(options?: { windowSize?: number }) {
    this.windowSize = options?.windowSize ?? 100;
  }

  /** 记录单次信任事件（来自工具调用、审批结果等） */
  record(event: TrustEvent): void {
    const key = this.key(event.agentId, event.tenantId);
    const list = this.samples.get(key) ?? [];
    list.push(event);
    while (list.length > this.windowSize) list.shift();
    this.samples.set(key, list);
  }

  /** 查询当前信任快照 */
  snapshot(agentId: string, tenantId: string): TrustSnapshot {
    const events = this.samples.get(this.key(agentId, tenantId)) ?? [];
    const dimensions = { ...DEFAULT_DIMENSION_VALUES } as Record<TrustDimension, number>;

    for (const dim of Object.keys(DEFAULT_DIMENSION_VALUES) as TrustDimension[]) {
      const dimEvents = events.filter((e) => e.dimension === dim);
      if (dimEvents.length === 0) continue;
      const totalWeight = dimEvents.reduce((s, e) => s + (e.weight ?? 1), 0);
      const weighted = dimEvents.reduce((s, e) => s + e.value * (e.weight ?? 1), 0);
      dimensions[dim] = totalWeight > 0 ? weighted / totalWeight : DEFAULT_DIMENSION_VALUES[dim];
    }

    const overallScore = (Object.keys(dimensions) as TrustDimension[])
      .reduce((sum, dim) => sum + dimensions[dim] * DIMENSION_WEIGHTS[dim], 0);

    return {
      agentId,
      tenantId,
      overallScore,
      dimensions,
      sampleSize: events.length,
      evaluatedAt: new Date(),
    };
  }

  /**
   * 评估自主度调节建议。
   * 信任骤降 → 强制审批；信任稳定高 → 可放宽。
   */
  evaluateAdjustment(agentId: string, tenantId: string): TrustAdjustment | null {
    const snapshot = this.snapshot(agentId, tenantId);
    if (snapshot.sampleSize < MIN_SAMPLE_FOR_ADJUSTMENT) return null;

    if (snapshot.overallScore < DEGRADATION_THRESHOLD) {
      return {
        agentId,
        autonomyDelta: -1,
        reason: `trust_score=${snapshot.overallScore.toFixed(2)} below degradation threshold`,
      };
    }
    if (snapshot.overallScore > ELEVATION_THRESHOLD) {
      return {
        agentId,
        autonomyDelta: +0.5,
        reason: `trust_score=${snapshot.overallScore.toFixed(2)} above elevation threshold`,
      };
    }
    return null;
  }

  private key(agentId: string, tenantId: string): string {
    return `${tenantId}:${agentId}`;
  }
}
