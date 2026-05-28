import { z } from 'zod';

/**
 * 应用配置 — 环境变量 → Zod 校验 → 类型安全 config 对象
 * Fail-fast: 启动时校验不通过直接退出
 */
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),

  DATABASE_URL: z.string().url().default('postgres://nexus:nexus@localhost:5432/nexus'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  LLM_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_BASE_URL: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_BASE_URL: z.string().optional(),

  NEXUS_AGENT_CONFIG_PATH: z.string().optional(),
  NEXUS_DEFAULT_MODEL: z.string().optional(),
  NEXUS_INTENT_MODEL: z.string().optional(),
  NEXUS_INTENT_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),
  NEXUS_INTENT_TIMEOUT_MS: z.coerce.number().int().positive().default(8000),
  NEXUS_INTENT_CACHE_TTL_SEC: z.coerce.number().int().nonnegative().default(60),
  NEXUS_INTENT_CLARIFICATION_THRESHOLD: z.coerce.number().min(0).max(1).default(0.2),
  NEXUS_INTENT_COST_SENSITIVE: z.coerce.boolean().default(false),
  NEXUS_INTENT_EXECUTION_KEYWORDS: z.string().optional(),
  NEXUS_INTENT_CONNECTION_KEYWORDS: z.string().optional(),

  NEXUS_COMPACT_MODEL: z.string().optional(),
  NEXUS_COMPACT_KEEP_RECENT_TURNS: z.coerce.number().int().positive().default(4),
  NEXUS_SKILL_DIR: z.string().default('.nexus/skills'),

  DEFAULT_TENANT_ID: z.string().default('default'),

  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  GRACEFUL_SHUTDOWN_TIMEOUT_MS: z.coerce.number().default(30000),
  CHECKPOINT_PERIODIC_INTERVAL: z.coerce.number().default(5),
});

export type AppConfig = z.infer<typeof configSchema>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const result = configSchema.safeParse(env);
  if (!result.success) {
    const errors = result.error.format();
    throw new Error(`Config validation failed:\n${JSON.stringify(errors, null, 2)}`);
  }
  return result.data;
}
