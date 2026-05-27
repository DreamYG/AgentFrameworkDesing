export interface CompensationSpec {
  readonly id: string;
  readonly name: string;
  readonly compensatesFor: string;
  readonly sunsetConditions: readonly SunsetCondition[];
  readonly maxVersionsAlive: number;
}

export type SunsetCondition =
  | { readonly type: 'interface_available'; readonly interfaceId: string; readonly minVersion: string }
  | { readonly type: 'metric_threshold'; readonly metric: string; readonly operator: '>=' | '<='; readonly value: number }
  | { readonly type: 'version_reached'; readonly version: string }
  | { readonly type: 'manual_approval'; readonly approver: string };

export interface SunsetEvaluation {
  readonly compensationId: string;
  readonly ready: boolean;
  readonly unmetConditions: readonly SunsetCondition[];
}

export type SunsetAction = 'observe' | 'soft_sunset' | 'hard_sunset';

export class SunsetEngine {
  private readonly specs = new Map<string, CompensationSpec>();

  register(spec: CompensationSpec): void {
    this.specs.set(spec.id, spec);
  }

  async evaluate(context?: { currentVersion?: string; metrics?: Record<string, number>; interfaces?: readonly string[] }): Promise<readonly SunsetEvaluation[]> {
    return [...this.specs.values()].map((spec) => {
      const unmet = spec.sunsetConditions.filter((condition) => !this.isMet(condition, context));
      return {
        compensationId: spec.id,
        ready: unmet.length === 0,
        unmetConditions: unmet,
      };
    });
  }

  async executeSunset(compensationId: string, action: SunsetAction): Promise<void> {
    if (!this.specs.has(compensationId)) throw new Error(`Unknown compensation: ${compensationId}`);
    void action;
  }

  private isMet(condition: SunsetCondition, context?: { currentVersion?: string; metrics?: Record<string, number>; interfaces?: readonly string[] }): boolean {
    switch (condition.type) {
      case 'version_reached':
        return (context?.currentVersion ?? '') >= condition.version;
      case 'metric_threshold': {
        const value = context?.metrics?.[condition.metric];
        if (value === undefined) return false;
        return condition.operator === '>=' ? value >= condition.value : value <= condition.value;
      }
      case 'interface_available':
        return context?.interfaces?.includes(condition.interfaceId) ?? false;
      case 'manual_approval':
        return false;
    }
  }
}

export type ISunsetEngine = SunsetEngine;
