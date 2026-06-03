import { readFileSync } from 'node:fs';
import { parse } from 'yaml';
import { z } from 'zod';

export const agentRuntimeConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'deepseek', 'local']).default('local'),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

export type AgentRuntimeConfig = z.infer<typeof agentRuntimeConfigSchema>;

const agentFileConfigSchema = z.object({
  provider: z.enum(['anthropic', 'openai', 'deepseek', 'local']).optional(),
  model: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
});

type AgentFileConfig = z.infer<typeof agentFileConfigSchema>;

const agentConfigFileSchema = z.object({
  defaultModel: z.string().optional(),
  agents: z.record(z.string(), agentFileConfigSchema).default({}),
});

export interface AgentRuntimeConfigResolution {
  readonly defaultModel: string;
  readonly agents: Readonly<Record<string, AgentRuntimeConfig>>;
}

/**
 * 加载每个 Agent 的运行时模型配置。
 *
 * 模型与 provider 的解析优先级（从高到低）：
 * 1. 环境变量 `NEXUS_AGENT_<ID>_MODEL` / `NEXUS_AGENT_<ID>_PROVIDER`（ID 大写、`.`/`-` 替换为 `_`）
 * 2. `NEXUS_AGENT_CONFIG_PATH` 指向的 YAML/JSON 文件中对应 Agent 的字段
 * 3. 全局默认模型 `NEXUS_DEFAULT_MODEL`（再回落到文件 `defaultModel`、`options.defaultModel`、`local-phase1-mvp`）
 *
 * 代码中不再保留任何硬编码的模型默认值；未显式配置的 Agent 一律使用全局默认模型。
 * provider 未显式指定时，根据最终 model 前缀推断（deepseek- 走 deepseek，claude- 走 anthropic，gpt- 或 o 前缀走 openai，其余走 local）。
 *
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

  const defaultModel = env['NEXUS_DEFAULT_MODEL']
    ?? fromFile.defaultModel
    ?? options.defaultModel
    ?? 'local-phase1-mvp';

  const agentIds = new Set<string>([
    ...Object.keys(options.defaults ?? {}),
    ...Object.keys(fromFile.agents),
  ]);

  const agents: Record<string, AgentRuntimeConfig> = {};
  for (const agentId of agentIds) {
    agents[agentId] = resolveAgentConfig(agentId, {
      fromFile: fromFile.agents[agentId],
      env,
      defaultModel,
    });
  }

  return { defaultModel, agents };
}

/** 推断 provider：deepseek- 走 deepseek，claude- 走 anthropic，gpt- 或 o 前缀走 openai，其余走 local */
export function inferProviderFromModel(model: string): AgentRuntimeConfig['provider'] {
  if (model.startsWith('deepseek-')) {
    return 'deepseek';
  }
  if (model.startsWith('claude-')) {
    return 'anthropic';
  }
  if (model.startsWith('gpt-') || model.startsWith('o')) {
    return 'openai';
  }
  return 'local';
}

function resolveAgentConfig(
  agentId: string,
  context: {
    readonly fromFile?: AgentFileConfig;
    readonly env: Record<string, string | undefined>;
    readonly defaultModel: string;
  },
): AgentRuntimeConfig {
  const key = `NEXUS_AGENT_${agentId.toUpperCase().replace(/[.-]/g, '_')}`;
  const envProvider = context.env[`${key}_PROVIDER`] as AgentRuntimeConfig['provider'] | undefined;
  const envModel = context.env[`${key}_MODEL`];
  const envTemperature = context.env[`${key}_TEMPERATURE`];
  const envMaxTokens = context.env[`${key}_MAX_TOKENS`];

  const model = envModel ?? context.fromFile?.model ?? context.defaultModel;
  const provider = envProvider ?? context.fromFile?.provider ?? inferProviderFromModel(model);
  const temperature = envTemperature !== undefined ? Number(envTemperature) : context.fromFile?.temperature;
  const maxTokens = envMaxTokens !== undefined ? Number(envMaxTokens) : context.fromFile?.maxTokens;

  return agentRuntimeConfigSchema.parse({ provider, model, temperature, maxTokens });
}

function readAgentConfigFile(path: string): { defaultModel?: string; agents: Record<string, AgentFileConfig> } {
  try {
    const raw = readFileSync(path, 'utf8');
    const parsed = raw.trim().startsWith('{') ? JSON.parse(raw) : parse(raw);
    const validated = agentConfigFileSchema.parse(parsed);
    return { defaultModel: validated.defaultModel, agents: validated.agents };
  } catch (error) {
    throw new Error(`Failed to load agent config from ${path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
