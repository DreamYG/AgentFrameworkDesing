import type { ToolRiskLevel } from '@nexus/shared';

export type PolicyDecision = 'allow' | 'deny' | 'require_approval';

export interface PolicyContext {
  readonly userId: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly toolName: string;
  readonly toolRiskLevel: ToolRiskLevel;
  readonly dataScope?: string;
}

export interface PolicyRule {
  readonly id: string;
  readonly name: string;
  evaluate(ctx: PolicyContext): PolicyDecision | null;
}

/**
 * Policy Engine — 四维权限判定
 * 维度：用户身份 × Agent 身份 × 工具身份 × 数据范围
 * @stability S2
 */
export class PolicyEngine {
  private readonly rules: PolicyRule[] = [];
  private readonly agentAllowedTools = new Map<string, readonly string[]>();
  private readonly userRoles = new Map<string, readonly string[]>();

  addRule(rule: PolicyRule): void {
    this.rules.push(rule);
  }

  registerAgentTools(agentId: string, tools: readonly string[]): void {
    this.agentAllowedTools.set(agentId, tools);
  }

  registerUserRoles(userId: string, roles: readonly string[]): void {
    this.userRoles.set(userId, roles);
  }

  evaluate(ctx: PolicyContext): PolicyDecision {
    if (!this.isToolAllowedForAgent(ctx.agentId, ctx.toolName)) {
      return 'deny';
    }

    for (const rule of this.rules) {
      const decision = rule.evaluate(ctx);
      if (decision === 'deny') return 'deny';
      if (decision === 'require_approval') return 'require_approval';
    }

    return this.defaultDecisionByRisk(ctx.toolRiskLevel);
  }

  private isToolAllowedForAgent(agentId: string, toolName: string): boolean {
    const allowed = this.agentAllowedTools.get(agentId);
    if (!allowed) return false;
    return allowed.includes(toolName);
  }

  private defaultDecisionByRisk(riskLevel: ToolRiskLevel): PolicyDecision {
    switch (riskLevel) {
      case 'R0':
      case 'R1':
        return 'allow';
      case 'R2':
      case 'R3':
      case 'R4':
        return 'require_approval';
      case 'RX':
        return 'deny';
    }
  }
}
