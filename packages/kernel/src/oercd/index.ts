/**
 * OERCD 学习心跳 — 五阶段接口定义
 * Phase 1 冻结全部接口（@stability S1），仅实现 Observe/Execute/Reflect MVP
 * @stability S1
 */

export interface OERCDContext {
  readonly runId: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly taskDescription: string;
  readonly toolCallCount: number;
}

/** Phase O: 观察 — 任务开始时检索相关技能 */
export interface IObservePhase {
  observe(ctx: OERCDContext): Promise<ObserveResult>;
}

export interface ObserveResult {
  readonly matchedSkills: readonly string[];
  readonly episodicMemories: readonly string[];
  readonly confidence: number;
}

/** Phase E: 执行 — 记录执行轨迹 */
export interface IExecutePhase {
  recordTrace(ctx: OERCDContext, trace: ExecutionTrace): Promise<void>;
}

export interface ExecutionTrace {
  readonly runId: string;
  readonly steps: readonly TraceStep[];
  readonly totalDurationMs: number;
  readonly tokensUsed: number;
}

export interface TraceStep {
  readonly turnIndex: number;
  readonly action: string;
  readonly toolName?: string;
  readonly durationMs: number;
  readonly success: boolean;
}

/** Phase R: 反思 — 效率分析 + 最优路径提取 */
export interface IReflectPhase {
  reflect(ctx: OERCDContext, trace: ExecutionTrace): Promise<ReflectResult>;
}

export interface ReflectResult {
  readonly efficiencyScore: number;
  readonly optimalPath: readonly string[];
  readonly improvements: readonly string[];
  readonly shouldCrystallize: boolean;
}

/** Phase C: 结晶 — 技能文件结构化生成（Phase 2 填充实现） */
export interface ICrystallizePhase {
  crystallize(ctx: OERCDContext, reflection: ReflectResult): Promise<CrystallizeResult>;
}

export interface CrystallizeResult {
  readonly skillId: string;
  readonly content: string;
  readonly evidenceIds: readonly string[];
  readonly status: 'pending_review' | 'approved';
}

/** Phase D: 分发 — 知识分发 + 审核流程（Phase 3 填充实现） */
export interface IDistributePhase {
  distribute(skill: CrystallizeResult, scope: DistributeScope): Promise<DistributeResult>;
}

export type DistributeScope = 'self' | 'peer' | 'cross_phase' | 'organization';

export interface DistributeResult {
  readonly distributionId: string;
  readonly targetAgents: readonly string[];
  readonly requiresReview: boolean;
}

/**
 * OERCD MVP 实现 — Observe + Execute + Reflect
 */
export class OERCDEngine {
  private readonly traces = new Map<string, ExecutionTrace>();

  /** O: 观察（MVP: 返回空匹配） */
  async observe(_ctx: OERCDContext): Promise<ObserveResult> {
    return { matchedSkills: [], episodicMemories: [], confidence: 0 };
  }

  /** E: 记录执行轨迹 */
  async recordTrace(ctx: OERCDContext, trace: ExecutionTrace): Promise<void> {
    this.traces.set(ctx.runId, trace);
  }

  /** R: 反思（MVP: 工具调用>=5 才触发） */
  async reflect(ctx: OERCDContext): Promise<ReflectResult | null> {
    if (ctx.toolCallCount < 5) return null;
    const trace = this.traces.get(ctx.runId);
    if (!trace) return null;

    const successRate = trace.steps.filter((s) => s.success).length / trace.steps.length;
    return {
      efficiencyScore: successRate,
      optimalPath: trace.steps.filter((s) => s.success).map((s) => s.action),
      improvements: [],
      shouldCrystallize: successRate > 0.8,
    };
  }

  getTrace(runId: string): ExecutionTrace | undefined {
    return this.traces.get(runId);
  }
}

/** Phase C 的 Phase 1 Noop 实现，后续阶段只填充生成逻辑。 */
export class NoopCrystallizePhase implements ICrystallizePhase {
  async crystallize(ctx: OERCDContext, reflection: ReflectResult): Promise<CrystallizeResult> {
    return {
      skillId: `noop-skill-${ctx.runId}`,
      content: JSON.stringify({ reflection }),
      evidenceIds: [],
      status: 'pending_review',
    };
  }
}

/** Phase D 的 Phase 1 Noop 实现，保持接口可注入。 */
export class NoopDistributePhase implements IDistributePhase {
  async distribute(skill: CrystallizeResult, scope: DistributeScope): Promise<DistributeResult> {
    return {
      distributionId: `noop-distribution-${skill.skillId}-${scope}`,
      targetAgents: [],
      requiresReview: true,
    };
  }
}
