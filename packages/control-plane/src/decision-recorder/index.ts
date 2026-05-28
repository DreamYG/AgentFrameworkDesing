/**
 * Decision Recorder — 认知决策链记录。
 *
 * 设计依据：nexus-enterprise-agent-middleware-complete-solution.md §16.3
 * 用途：
 * - 记录每个关键决策（工具选择、计划步骤、风险判断）的输入/推理/备选/置信度/证据
 * - 形成可审计、可回溯的"决策链"，对应认知热力图
 * - 是 ExplainabilityAPI 的数据底座
 *
 * Phase 1：内存 MVP；后续接入 packages/infra `decision_chains` 表持久化。
 * @stability S2
 */

export type DecisionType =
  | 'tool_selection'    // 选择哪个工具
  | 'plan_step'         // 规划下一步
  | 'risk_assessment'   // 风险等级判断
  | 'approval_request'  // 是否触发审批
  | 'compact_strategy'  // 选择哪一级 Compact
  | 'agent_delegation'; // 是否委派子 Agent

export interface DecisionRecord {
  readonly id: string;
  readonly runId: string;
  readonly tenantId: string;
  readonly agentId: string;
  readonly turnCount: number;
  readonly decisionType: DecisionType;
  /** 决策的输入（结构化上下文） */
  readonly input: Readonly<Record<string, unknown>>;
  /** 自然语言推理（来自 LLM thinking 或显式 reasoning 字段） */
  readonly reasoning?: string;
  /** 备选方案 + 各自分数 */
  readonly alternatives?: readonly { option: string; score?: number; reason?: string }[];
  /** 信心 0-1 */
  readonly confidence?: number;
  /** 证据 ID 列表（来自 EvidenceRegistry） */
  readonly evidenceBasis?: readonly string[];
  /** 最终选择 */
  readonly output: Readonly<Record<string, unknown>>;
  readonly recordedAt: Date;
}

export interface IDecisionPersister {
  save(record: DecisionRecord): Promise<void>;
  listByRun(runId: string): Promise<readonly DecisionRecord[]>;
}

/**
 * 决策链记录器 MVP：内存累计 + 可选持久化端口。
 * 调用方在做关键决策的当下 record()，后续 ExplainabilityAPI 按 runId 拉链。
 */
export class DecisionRecorder {
  private readonly records: DecisionRecord[] = [];

  constructor(private readonly persister?: IDecisionPersister) {}

  record(record: Omit<DecisionRecord, 'id' | 'recordedAt'>): DecisionRecord {
    const full: DecisionRecord = {
      ...record,
      id: crypto.randomUUID(),
      recordedAt: new Date(),
    };
    this.records.push(full);
    if (this.persister) void this.persister.save(full);
    return full;
  }

  /** 内存查询（用于单测 / 实时调试），生产读历史决策走 persister */
  listByRun(runId: string): readonly DecisionRecord[] {
    return this.records.filter((r) => r.runId === runId);
  }

  /** 内存查询：按决策类型聚合（用于认知热力图） */
  countByType(runId: string): Readonly<Record<DecisionType, number>> {
    const counts: Record<DecisionType, number> = {
      tool_selection: 0,
      plan_step: 0,
      risk_assessment: 0,
      approval_request: 0,
      compact_strategy: 0,
      agent_delegation: 0,
    };
    for (const record of this.records.filter((r) => r.runId === runId)) {
      counts[record.decisionType]++;
    }
    return counts;
  }
}
