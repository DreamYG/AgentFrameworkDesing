/**
 * System Prompt 六层组装器
 * Layer 1-4 = stable_prefix（AgentRun 内不变，保护缓存命中率）
 * Layer 5-6 = dynamic_suffix（每轮可更新）
 * @stability S1
 */
export interface PromptLayer {
  readonly layer: number;
  readonly name: string;
  readonly content: string;
}

export interface PromptAssemblerConfig {
  /** Layer 1: 身份与角色 */
  identity: string;
  /** Layer 2: 安全约束 */
  safetyConstraints: string;
  /** Layer 3: 技能索引（L0 摘要，~20 token/条） */
  skillIndex: string;
  /** Layer 4: 工具签名（经权限过滤，按名称字母序冻结） */
  toolSignatures: string;
}

export interface DynamicContext {
  /** Layer 5: 环境上下文（工作目录、Git 分支、时间等） */
  environmentContext?: string;
  /** Layer 6: 会话摘要（SessionShadow 产出） */
  sessionSummary?: string;
}

export class PromptAssembler {
  private stablePrefix: string = '';
  private frozen = false;

  /**
   * 冻结 stable_prefix（AgentRun 启动时调用一次）
   * 冻结后生命周期内不可变
   */
  freeze(config: PromptAssemblerConfig): void {
    const layers: PromptLayer[] = [
      { layer: 1, name: 'identity', content: config.identity },
      { layer: 2, name: 'safety', content: config.safetyConstraints },
      { layer: 3, name: 'skills', content: config.skillIndex },
      { layer: 4, name: 'tools', content: config.toolSignatures },
    ];

    this.stablePrefix = layers.map((l) => l.content).join('\n\n');
    this.frozen = true;
  }

  /**
   * 组装完整 System Prompt（每轮调用）
   */
  assemble(dynamic?: DynamicContext): string {
    if (!this.frozen) {
      throw new Error('PromptAssembler must be frozen before assembly');
    }

    const parts = [this.stablePrefix];

    if (dynamic?.environmentContext) {
      parts.push(dynamic.environmentContext);
    }
    if (dynamic?.sessionSummary) {
      parts.push(dynamic.sessionSummary);
    }

    return parts.join('\n\n');
  }

  getStablePrefix(): string {
    return this.stablePrefix;
  }

  isFrozen(): boolean {
    return this.frozen;
  }
}
