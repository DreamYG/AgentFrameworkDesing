import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

export const agentRuntimeConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'local']).default('local'),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export type AgentRuntimeConfig = z.infer<typeof agentRuntimeConfigSchema>;

const agentConfigFileSchema = z.object({
  defaultModel: z.string().optional(),
  agents: z.record(z.string(), agentRuntimeConfigSchema).default({}),
});

export interface AgentRuntimeConfigResolution {
  readonly defaultModel: string;
  readonly agents: Readonly<Record<string, AgentRuntimeConfig>>;
}

/**
 * 加载每个 Agent 的运行时配置，优先级：
 * 1) `NEXUS_AGENT_<ID>_MODEL` / `NEXUS_AGENT_<ID>_PROVIDER` 等环境变量（ID 大写、`.`/`-` 替换为 `_`）
 * 2) `NEXUS_AGENT_CONFIG_PATH` 指向的 YAML/JSON 文件
 * 3) 默认值：与 PHASE_INTENT_AGENTS 内 `model` 字段一致
 * @stability S3
 */
export function loadAgentRuntimeConfigs(options: {
  readonly env?: Record<string, string | undefined>;
  readonly configPath?: string;
  readonly defaults?: Readonly<Record<string, AgentRuntimeConfig>>;
  readonly defaultModel?: string;
}): AgentRuntimeConfigResolution {
  const env = options.env ?? process.env;
  const fromFile = options.configPath ? readAgentConfigFile(options.configPath) : { agents: {} };
  const merged: Record<string, AgentRuntimeConfig> = { ...(options.defaults ?? {}) };

  for (const [agentId, fileConfig] of Object.entries(fromFile.agents)) {
    merged[agentId] = mergeConfig(merged[agentId], fileConfig);
  }

  for (const [agentId, current] of Object.entries(merged)) {
    merged[agentId] = applyEnvOverrides(agentId, current, env);
  }

  const defaultModel = env['NEXUS_DEFAULT_MODEL']
    ?? fromFile.defaultModel
    ?? options.defaultModel
    ?? 'local-phase1-mvp';

  return { defaultModel, agents: merged };
}

function readAgentConfigFile(path: string): { defaultModel?: string; agents: Record<string, AgentRuntimeConfig> } {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = raw.trim().startsWith('{') ? JSON.parse(raw) : parse(raw);
    const validated = agentConfigFileSchema.parse(parsed);
    return { defaultModel: validated.defaultModel, agents: validated.agents };
  } catch (error) {
    throw new Error(`Failed to load agent config from ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function mergeConfig(base: AgentRuntimeConfig | undefined, patch: Partial<AgentRuntimeConfig>): AgentRuntimeConfig {
  return agentRuntimeConfigSchema.parse({
    provider: patch.provider ?? base?.provider ?? 'local',
    model: patch.model ?? base?.model ?? 'local-phase1-mvp',
    temperature: patch.temperature ?? base?.temperature,
    maxTokens: patch.maxTokens ?? base?.maxTokens,
  });
}

function applyEnvOverrides(
  agentId: string,
  base: AgentRuntimeConfig,
  env: Record<string, string | undefined>,
): AgentRuntimeConfig {
  const key = `NEXUS_AGENT_${agentId.toUpperCase().replace(/[.-]/g, '_')}`;
  const provider = env[`${key}_PROVIDER`] as AgentRuntimeConfig['provider'] | undefined;
  const model = env[`${key}_MODEL`];
  const temperature = env[`${key}_TEMPERATURE`];
  const maxTokens = env[`${key}_MAX_TOKENS`];
  return mergeConfig(base, {
    provider: provider ?? base.provider,
    model: model ?? base.model,
    temperature: temperature !== undefined ? Number(temperature) : base.temperature,
    maxTokens: maxTokens !== undefined ? Number(maxTokens) : base.maxTokens,
  });
}
