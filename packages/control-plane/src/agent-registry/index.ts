import type { PhaseId, ToolRiskLevel } from '@nexus/shared';

/** Agent 定义 — 注册中心管理的核心实体 */
export interface AgentDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;
  readonly phase: PhaseId;
  readonly modelPreference: string;
  readonly fallbackModel?: string;
  readonly allowedTools: readonly string[];
  readonly maxRiskLevel: ToolRiskLevel;
  readonly promptTemplate: PromptTemplate;
  readonly config?: Readonly<Record<string, unknown>>;
  readonly enabled: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface PromptTemplate {
  readonly id: string;
  readonly version: number;
  readonly identity: string;
  readonly safetyConstraints: string;
  readonly skillIndex: string;
  readonly toolSignatures: string;
}

/** Agent 注册中心 */
export class AgentRegistry {
  private readonly agents = new Map<string, AgentDefinition>();
  private readonly promptVersions = new Map<string, PromptTemplate[]>();

  register(definition: AgentDefinition): void {
    this.agents.set(definition.id, definition);
    const versions = this.promptVersions.get(definition.id) ?? [];
    versions.push(definition.promptTemplate);
    this.promptVersions.set(definition.id, versions);
  }

  unregister(agentId: string): void {
    this.agents.delete(agentId);
  }

  get(agentId: string): AgentDefinition | undefined {
    return this.agents.get(agentId);
  }

  getByPhase(phase: PhaseId): readonly AgentDefinition[] {
    return [...this.agents.values()].filter((a) => a.phase === phase && a.enabled);
  }

  getAll(): readonly AgentDefinition[] {
    return [...this.agents.values()];
  }

  getEnabled(): readonly AgentDefinition[] {
    return [...this.agents.values()].filter((a) => a.enabled);
  }

  getPromptVersions(agentId: string): readonly PromptTemplate[] {
    return this.promptVersions.get(agentId) ?? [];
  }

  findByCapability(toolName: string): readonly AgentDefinition[] {
    return [...this.agents.values()].filter(
      (a) => a.enabled && a.allowedTools.includes(toolName),
    );
  }
}
