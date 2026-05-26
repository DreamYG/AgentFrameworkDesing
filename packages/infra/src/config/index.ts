import { z } from 'zod';

/**
 * 应用配置 — 环境变量 → Zod 校验 → 类型安全 config 对象
 * Fail-fast: 启动时校验不通过直接退出
 */
const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  WS_PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string().url().default('postgres://nexus:nexus@localhost:5432/nexus'),

  REDIS_HOST: z.string().default('localhost'),
  REDIS_PORT: z.coerce.number().default(6379),
  REDIS_PASSWORD: z.string().optional(),

  LLM_PROVIDER: z.enum(['anthropic', 'openai']).default('anthropic'),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),

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
