import type { AgentRegistry, AgentDefinition } from '@nexus/control-plane';
import { AGENT_PROMPTS } from './agents/prompts.js';
import { PHASE_INTENT_AGENTS } from './agents/index.js';

export interface PhaseIntentAgentOverride {
  readonly model?: string;
  readonly fallbackModel?: string;
}

/** 将 Phase 1 Agent 配置与 Prompt 注册到 AgentRegistry */
export function registerPhaseIntentAgents(
  registry: AgentRegistry,
  overrides?: Readonly<Record<string, PhaseIntentAgentOverride>>,
): readonly AgentDefinition[] {
  const now = new Date();
  const definitions: AgentDefinition[] = PHASE_INTENT_AGENTS.map((agent) => {
    const prompt = AGENT_PROMPTS[agent.id as keyof typeof AGENT_PROMPTS];
    const override = overrides?.[agent.id];
    return {
      id: agent.id,
      name: agent.name,
      description: agent.description,
      version: '0.1.0',
      phase: 'intent',
      modelPreference: override?.model ?? agent.model,
      fallbackModel: override?.fallbackModel,
      allowedTools: agent.tools,
      maxRiskLevel: 'R2',
      promptTemplate: {
        id: `${agent.id}-prompt`,
        version: 1,
        identity: prompt.identity,
        safetyConstraints: prompt.safety,
        skillIndex: prompt.skills,
        toolSignatures: agent.tools.join('\n'),
      },
      enabled: true,
      createdAt: now,
      updatedAt: now,
    };
  });

  for (const definition of definitions) {
    registry.register(definition);
  }

  return definitions;
}
