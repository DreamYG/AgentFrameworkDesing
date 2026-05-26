/**
 * Environment Injector — 冷启动环境快照收集
 * @stability S2
 */
export interface EnvironmentSnapshot {
  readonly workingDirectory: string;
  readonly gitState: GitStateSnapshot | null;
  readonly permissionContext: { readonly allowedTools: readonly string[]; readonly maxRiskLevel: string };
  readonly externalSystemState: Record<string, unknown>;
  readonly collectedAt: Date;
}

export interface GitStateSnapshot {
  readonly branch: string;
  readonly isDirty: boolean;
  readonly lastCommitHash: string;
}

export interface IEnvironmentInjector {
  collect(agentId: string, tenantId: string): Promise<EnvironmentSnapshot>;
}

/**
 * Context Backfiller — 工具执行后环境变更差量回填
 * @stability S2
 */
export interface ContextPatch {
  readonly dimension: string;
  readonly before: string;
  readonly after: string;
  readonly toolName: string;
  readonly timestamp: Date;
}

export interface IContextBackfiller {
  apply(patch: ContextPatch): void;
  getSnapshot(): Readonly<EnvironmentSnapshot>;
  renderForPrompt(): string;
}

export class DefaultEnvironmentInjector implements IEnvironmentInjector {
  async collect(_agentId: string, _tenantId: string): Promise<EnvironmentSnapshot> {
    return {
      workingDirectory: process.cwd(),
      gitState: null,
      permissionContext: { allowedTools: [], maxRiskLevel: 'R1' },
      externalSystemState: {},
      collectedAt: new Date(),
    };
  }
}

export class DefaultContextBackfiller implements IContextBackfiller {
  private snapshot: EnvironmentSnapshot = {
    workingDirectory: '',
    gitState: null,
    permissionContext: { allowedTools: [], maxRiskLevel: 'R1' },
    externalSystemState: {},
    collectedAt: new Date(),
  };

  apply(patch: ContextPatch): void {
    this.snapshot = { ...this.snapshot, collectedAt: patch.timestamp };
  }

  getSnapshot(): Readonly<EnvironmentSnapshot> {
    return this.snapshot;
  }

  renderForPrompt(): string {
    return `[Environment] cwd=${this.snapshot.workingDirectory} at=${this.snapshot.collectedAt.toISOString()}`;
  }
}
