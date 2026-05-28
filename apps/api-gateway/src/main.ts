import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';
import { InMemoryPhaseBridge } from '@nexus/shared';
import { GracefulShutdownController, OERCDEngine, type IEvidencePersister } from '@nexus/kernel';
import {
  FsSkillBackend,
  PgSkillBackend,
  SessionShadow,
  SkillStore,
  type ISessionSummaryPersister,
  type ISkillBackend,
  type RedisLikeSessionStore,
} from '@nexus/memory';
import { bootstrapObservability } from '@nexus/observability';
import { AnthropicProvider, OpenAIProvider, ProviderRouter } from '@nexus/providers';
import {
  AgentRunsRepository,
  ApprovalRequestsRepository,
  AuditLogsRepository,
  CheckpointOutbox,
  CheckpointsRepository,
  EvidenceEntriesRepository,
  InstalledPacksRepository,
  QueueManager,
  RedisClient,
  SessionSummariesRepository,
  SkillsRepository,
  createDatabase,
  loadAgentRuntimeConfigs,
  loadConfig,
  pingDatabase,
  runMigrations,
  type AgentRuntimeConfig,
  type PersistedEvidenceEntry,
  type RedisConfig,
} from '@nexus/infra';
import {
  ConnectorToolBridge,
  GatewayToolExecutor,
  ToolGatewayPipeline,
  registerBuiltInAITools,
  registerPMTools,
} from '@nexus/tool-gateway';
import { PHASE_INTENT_AGENTS, type PhaseIntentAgentOverride } from '@nexus/phase-intent';
import { createNexusApp } from './bootstrap.js';
import { MessageRouter, type MessageRouterBackend } from './middleware/message-router.js';
import { RepositoryCheckpointStore } from './infra/checkpoint-store.js';
import { LLMIntentClassifierImpl } from './intent/llm-classifier.js';

class LocalPhaseOneProvider implements ILLMProvider {
  async *chat(messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    const runState = this.detectState(messages);
    if (runState === 'needs_decompose') {
      yield* this.toolCall('tc-decompose', 'task.decompose', { requirement: this.userContent(messages), projectId: 'default' });
      return;
    }
    if (runState === 'needs_assign') {
      yield* this.toolCall('tc-assign', 'task.assign', { taskId: this.firstTaskId(messages), assignee: 'ai-agent' });
      return;
    }
    if (runState === 'needs_notify') {
      yield* this.toolCall('tc-notify', 'notification.send', { target: 'project-owner', message: '任务已完成拆解并分配给 ai-agent。' });
      return;
    }
    yield { type: 'text_delta', delta: 'Phase 1 PM MVP 已完成需求拆解、任务分配与通知。' };
    yield { type: 'done', usage: { input: 64, output: 32 } };
  }

  private detectState(messages: readonly LLMMessage[]): 'needs_decompose' | 'needs_assign' | 'needs_notify' | 'done' {
    const called = messages.flatMap((message) => message.toolCalls?.map((tool) => tool.name) ?? []);
    if (!called.includes('task.decompose')) return 'needs_decompose';
    if (!called.includes('task.assign')) return 'needs_assign';
    if (!called.includes('notification.send')) return 'needs_notify';
    return 'done';
  }

  private userContent(messages: readonly LLMMessage[]): string {
    return String(messages.find((message) => message.role === 'user')?.content ?? '项目管理需求');
  }

  private firstTaskId(messages: readonly LLMMessage[]): string {
    for (const message of messages) {
      if (message.role !== 'tool' || typeof message.content !== 'string') continue;
      try {
        const parsed = JSON.parse(message.content) as { tasks?: Array<{ id?: string }> };
        const taskId = parsed.tasks?.[0]?.id;
        if (taskId) return taskId;
      } catch {
        // Ignore non-JSON tool output.
      }
    }
    return 'unknown-task';
  }

  private async *toolCall(id: string, name: string, params: Record<string, unknown>): AsyncGenerator<LLMStreamChunk> {
    yield { type: 'tool_call_start', id, name };
    yield { type: 'tool_call_delta', id, argumentsDelta: JSON.stringify(params) };
    yield { type: 'tool_call_end', id };
    yield { type: 'done', usage: { input: 96, output: 24 } };
  }
}

class InMemorySessionStore implements RedisLikeSessionStore {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | null> {
    return (this.values.get(key) as T | undefined) ?? null;
  }

  async compareAndSwap<T>(key: string, expectedVersion: number, newValue: T): Promise<boolean> {
    const current = this.values.get(key) as { version?: number } | undefined;
    if ((current?.version ?? 0) !== expectedVersion) return false;
    this.values.set(key, newValue);
    return true;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }
}

const config = loadConfig();
const observability = bootstrapObservability('nexus-api-gateway');
const logger = observability.logger;
const infraMode = process.env['NEXUS_INFRA_MODE'] ?? (config.NODE_ENV === 'production' ? 'production' : 'memory');

const anthropicProvider = config.ANTHROPIC_API_KEY
  ? new AnthropicProvider({ apiKey: config.ANTHROPIC_API_KEY, baseUrl: config.ANTHROPIC_BASE_URL })
  : undefined;
const openaiProvider = config.OPENAI_API_KEY
  ? new OpenAIProvider({ apiKey: config.OPENAI_API_KEY, baseUrl: config.OPENAI_BASE_URL })
  : undefined;
const localProvider = new LocalPhaseOneProvider();
const providerRouter = new ProviderRouter(
  [
    ...(anthropicProvider ? [{ prefix: 'claude-', provider: anthropicProvider, label: 'anthropic' }] : []),
    ...(openaiProvider ? [{ prefix: 'gpt-', provider: openaiProvider, label: 'openai' }] : []),
    ...(openaiProvider ? [{ prefix: 'o', provider: openaiProvider, label: 'openai-o' }] : []),
    { prefix: 'local-', provider: localProvider, label: 'local' },
  ],
  anthropicProvider ?? openaiProvider ?? localProvider,
);

const agentDefaults = Object.fromEntries(PHASE_INTENT_AGENTS.map((agent) => [agent.id, {
  provider: providerForModel(agent.model),
  model: agent.model,
} satisfies AgentRuntimeConfig]));
const agentRuntimeResolution = loadAgentRuntimeConfigs({
  configPath: config.NEXUS_AGENT_CONFIG_PATH,
  defaults: agentDefaults,
  defaultModel: config.NEXUS_DEFAULT_MODEL ?? process.env['NEXUS_MODEL'] ?? (anthropicProvider ? 'claude-sonnet-4-5' : openaiProvider ? 'gpt-4o-mini' : 'local-phase1-mvp'),
});
const agentOverrides: Record<string, PhaseIntentAgentOverride> = {};
for (const [agentId, runtimeConfig] of Object.entries(agentRuntimeResolution.agents)) {
  agentOverrides[agentId] = { model: runtimeConfig.model };
  logger.flow({}, 'agent.model.bound', { agentId, provider: runtimeConfig.provider, model: runtimeConfig.model });
}

const pipeline = new ToolGatewayPipeline();
const connectorBridge = new ConnectorToolBridge(pipeline);
const phaseBridge = new InMemoryPhaseBridge();
const redisClient = createRedisClient(infraMode, {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  password: config.REDIS_PASSWORD,
  keyPrefix: 'nexus:',
}, logger);
const database = infraMode === 'memory' ? null : createDatabase(config.DATABASE_URL);
if (database) {
  try {
    await runMigrations(database);
    logger.flow({}, 'infra.db.migrations_applied');
  } catch (error) {
    logger.error({}, 'infra.db.migrations_failed', error);
    throw error;
  }
}
const queueManager = createQueueManager(infraMode, config, logger);
const checkpointStore = createCheckpointStore(database, queueManager, config.DEFAULT_TENANT_ID, logger);

const skillsRepo = database ? new SkillsRepository(database) : undefined;
const evidenceRepo = database ? new EvidenceEntriesRepository(database) : undefined;
const sessionSummariesRepo = database ? new SessionSummariesRepository(database) : undefined;

const skillBackend: ISkillBackend = skillsRepo
  ? new PgSkillBackend(skillsRepo, config.DEFAULT_TENANT_ID)
  : new FsSkillBackend(config.NEXUS_SKILL_DIR);
const skillStore = new SkillStore(skillBackend);
await skillStore.load();
logger.flow({}, 'skill_store.backend.bound', { backend: skillsRepo ? 'pg' : 'fs' });

const sessionPersister: ISessionSummaryPersister | undefined = sessionSummariesRepo
  ? {
      async upsert(input) {
        await sessionSummariesRepo.upsert(input);
      },
      async get(runId) {
        const row = await sessionSummariesRepo.get(runId);
        if (!row) return null;
        return {
          version: row.version,
          turnRange: [row.turnStart, row.turnEnd],
          progressSummary: row.progressSummary,
          confirmedDecisions: row.confirmedDecisions,
          openQuestions: row.openQuestions,
          activeEvidenceIds: row.activeEvidenceIds,
          tokenCount: row.tokenCount,
        };
      },
    }
  : undefined;
const sessionShadow = new SessionShadow(redisClient ?? new InMemorySessionStore(), {
  persister: sessionPersister,
  tenantId: config.DEFAULT_TENANT_ID,
});

const evidencePersister: IEvidencePersister | undefined = evidenceRepo
  ? {
      async upsert(entry) {
        await evidenceRepo.upsert(entry as PersistedEvidenceEntry);
      },
      async delete(id) {
        await evidenceRepo.delete(id);
      },
      async listByRun(runId) {
        const rows = await evidenceRepo.listByRun(runId);
        return rows.map((row) => ({
          id: row.id,
          sourceToolCall: row.sourceToolCall,
          messageIndex: row.messageIndex,
          type: row.type as 'file_path' | 'url' | 'code_snippet' | 'error_trace',
          content: row.content,
          turnCreated: row.turnCreated,
          accessCount: row.accessCount,
          tokenCount: row.tokenCount,
          wasReferenced: row.wasReferenced,
        }));
      },
    }
  : undefined;

const oercd = new OERCDEngine(skillStore);
pipeline.setAuditHandler((entry: { toolName: string; runId: string; success: boolean; durationMs: number }) => {
  logger.flow(
    { runId: entry.runId },
    'tool_gateway.audit',
    { toolName: entry.toolName, success: entry.success, durationMs: entry.durationMs },
  );
});
registerPMTools(pipeline, { tenantId: config.DEFAULT_TENANT_ID, agentId: 'phase-intent', phaseBridge });

const intentModel = config.NEXUS_INTENT_MODEL
  ?? (openaiProvider ? 'gpt-4o-mini' : anthropicProvider ? 'claude-haiku-4-5' : agentRuntimeResolution.defaultModel);
const hasRealProvider = Boolean(anthropicProvider ?? openaiProvider);
const defaultIntentFewShots = [
  { text: '帮我把需求 X 拆成 WBS', decision: { agentId: 'task-planner', phase: 'intent' as const, intentType: 'task' as const, confidence: 0.9, reason: 'WBS 是 task-planner 强项' } },
  { text: '你好', decision: { agentId: 'general-assistant', phase: 'intent' as const, intentType: 'chat' as const, confidence: 0.95, reason: '闲聊由通用助手承接' } },
  { text: '帮我搜下 Drizzle ORM 最新版本', decision: { agentId: 'general-assistant', phase: 'intent' as const, intentType: 'query' as const, confidence: 0.85, reason: '联网搜索属于通用工具' } },
  { text: '当前项目健康度', decision: { agentId: 'project-doctor', phase: 'intent' as const, intentType: 'query' as const, confidence: 0.88, reason: '健康诊断由 project-doctor 处理' } },
];
const intentClassifier = hasRealProvider
  ? new LLMIntentClassifierImpl(providerRouter, {
      model: intentModel,
      timeoutMs: config.NEXUS_INTENT_TIMEOUT_MS,
      fewShotExamples: defaultIntentFewShots,
      costSensitive: config.NEXUS_INTENT_COST_SENSITIVE,
    })
  : undefined;
if (intentClassifier) {
  logger.flow({}, 'intent.classifier.enabled', {
    model: intentModel,
    threshold: config.NEXUS_INTENT_CONFIDENCE_THRESHOLD,
    clarification: config.NEXUS_INTENT_CLARIFICATION_THRESHOLD,
    costSensitive: config.NEXUS_INTENT_COST_SENSITIVE,
    fewShots: defaultIntentFewShots.length,
  });
} else {
  logger.warn({}, 'intent.classifier.disabled', { reason: 'no real LLM provider configured; using keyword fallback' });
}

const intentCache: import('@nexus/control-plane').IntentCache | undefined = redisClient
  ? {
      async get(key) {
        return redisClient.get<import('@nexus/control-plane').LLMIntentDecision>(key);
      },
      async set(key, value, ttlSec) {
        await redisClient.set(key, value, ttlSec * 1000);
      },
    }
  : undefined;
if (intentCache) {
  logger.flow({}, 'intent.cache.enabled', { ttlSec: config.NEXUS_INTENT_CACHE_TTL_SEC });
}

const parseKeywordList = (raw: string | undefined): readonly string[] | undefined =>
  raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

const shutdownController = new GracefulShutdownController({
  gracePeriodMs: config.GRACEFUL_SHUTDOWN_TIMEOUT_MS,
});

const webSearch = createWebSearchProvider(process.env, logger);
const builtInAITools = registerBuiltInAITools(pipeline, {
  chatProvider: providerRouter,
  defaultChatModel: agentRuntimeResolution.defaultModel,
  defaultSummaryModel: agentRuntimeResolution.defaultModel,
  generateImage: openaiProvider
    ? (params) => openaiProvider.generateImage({
        prompt: params.prompt,
        model: params.model ?? 'dall-e-3',
        size: params.size as '1024x1024' | undefined,
        n: params.n,
      })
    : undefined,
  webSearch,
  searchSkills: async ({ query, limit }) =>
    skillStore.search(query).slice(0, limit ?? 10).map((skill) => ({
      id: skill.id,
      title: skill.title,
      summary: skill.l0Summary,
      tags: skill.tags,
    })),
});
logger.flow({}, 'builtin.ai.tools.registered', { tools: builtInAITools });

class RedisMessageRouterBackend implements MessageRouterBackend {
  constructor(private readonly redis: RedisClient) {}

  isDuplicate(messageId: string, ttlMs: number): Promise<boolean> {
    return this.redis.isDuplicate(messageId, Math.ceil(ttlMs / 1000));
  }

  checkRateLimit(key: string, maxRequests: number, windowMs: number): Promise<boolean> {
    return this.redis.checkRateLimit(key, maxRequests, windowMs);
  }
}

const app = createNexusApp({
  gatewayConfig: {
    port: config.PORT,
    corsOrigins: (process.env['CORS_ORIGINS'] ?? '*').split(','),
    hmacSecret: process.env['NEXUS_HMAC_SECRET'],
    feishuEncryptKey: process.env['FEISHU_ENCRYPT_KEY'],
  },
  provider: providerRouter,
  toolExecutor: new GatewayToolExecutor(pipeline, {
    tenantId: config.DEFAULT_TENANT_ID,
    agentId: 'phase-intent',
    approvalPolicy: process.env['NEXUS_APPROVAL_POLICY'] === 'auto' ? 'auto' : 'standard',
    maxRiskLevel: 'R2',
  }),
  defaultModel: agentRuntimeResolution.defaultModel,
  agentOverrides,
  phaseBridge,
  logger,
  messageRouter: new MessageRouter({
    deduplicationTtlMs: 60 * 60 * 1000,
    rateLimitPerUser: Number(process.env['NEXUS_RATE_LIMIT_PER_USER'] ?? 120),
    rateLimitWindowMs: 60 * 1000,
  }, redisClient ? new RedisMessageRouterBackend(redisClient) : undefined),
  checkpointStore,
  sessionShadow,
  oercd,
  connectorBridge,
  shutdownController,
  toolPipeline: pipeline,
  intentClassifier,
  intentConfidenceThreshold: config.NEXUS_INTENT_CONFIDENCE_THRESHOLD,
  intentClarificationThreshold: config.NEXUS_INTENT_CLARIFICATION_THRESHOLD,
  intentCache,
  intentCacheTtlSec: config.NEXUS_INTENT_CACHE_TTL_SEC,
  intentExecutionKeywords: parseKeywordList(config.NEXUS_INTENT_EXECUTION_KEYWORDS),
  intentConnectionKeywords: parseKeywordList(config.NEXUS_INTENT_CONNECTION_KEYWORDS),
  compactOptions: {
    compactModel: config.NEXUS_COMPACT_MODEL
      ?? (anthropicProvider ? 'claude-haiku-4-5' : openaiProvider ? 'gpt-4o-mini' : agentRuntimeResolution.defaultModel),
    keepRecentTurns: config.NEXUS_COMPACT_KEEP_RECENT_TURNS,
    evidencePersister,
  },
  persistence: database ? {
    tenantId: config.DEFAULT_TENANT_ID,
    agentRuns: new AgentRunsRepository(database),
    auditLogs: new AuditLogsRepository(database),
    approvals: new ApprovalRequestsRepository(database),
    packs: new InstalledPacksRepository(database),
  } : undefined,
});

const healthChecks: Array<{ name: string; check: () => Promise<void> }> = [];
if (database) {
  healthChecks.push({ name: 'database', check: () => pingDatabase(database) });
}
if (redisClient) {
  healthChecks.push({
    name: 'redis',
    check: async () => {
      const pong = await redisClient.ping();
      if (pong !== 'PONG') throw new Error(`redis ping returned ${pong}`);
    },
  });
}
app.gateway.setHealthChecks(healthChecks);

const installSignal = (signal: 'SIGTERM' | 'SIGINT') => {
  process.once(signal, () => {
    void (async () => {
      logger.flow({}, 'shutdown.signal.received', { signal, activeRuns: shutdownController.getActiveRunCount() });
      try {
        const result = await shutdownController.drain(signal);
        logger.flow({}, 'shutdown.drain.completed', { ...result });
      } catch (error) {
        logger.error({}, 'shutdown.drain.failed', error);
      }
      try {
        await shutdown();
      } catch (error) {
        logger.error({}, 'shutdown.cleanup.failed', error);
      }
      process.exit(0);
    })();
  });
};
installSignal('SIGTERM');
installSignal('SIGINT');

await app.start();

function providerForModel(model: string): AgentRuntimeConfig['provider'] {
  if (model.startsWith('claude-')) return 'anthropic';
  if (model.startsWith('gpt-') || model.startsWith('o')) return 'openai';
  return 'local';
}

function createWebSearchProvider(
  env: NodeJS.ProcessEnv,
  log: typeof logger,
): ((params: { query: string; maxResults?: number }) => Promise<readonly { title: string; url: string; snippet: string }[]>) | undefined {
  const tavily = env['TAVILY_API_KEY'];
  if (tavily) {
    log.flow({}, 'web_search.provider.enabled', { provider: 'tavily' });
    return async ({ query, maxResults }) => {
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ api_key: tavily, query, max_results: maxResults ?? 5 }),
      });
      if (!res.ok) throw new Error(`Tavily error ${res.status} ${await res.text().catch(() => '')}`);
      const json = await res.json() as { results?: Array<{ title?: string; url?: string; content?: string }> };
      return (json.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.content ?? '',
      }));
    };
  }

  const brave = env['BRAVE_API_KEY'];
  if (brave) {
    log.flow({}, 'web_search.provider.enabled', { provider: 'brave' });
    return async ({ query, maxResults }) => {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(maxResults ?? 5));
      const res = await fetch(url, { headers: { 'X-Subscription-Token': brave, Accept: 'application/json' } });
      if (!res.ok) throw new Error(`Brave error ${res.status} ${await res.text().catch(() => '')}`);
      const json = await res.json() as { web?: { results?: Array<{ title?: string; url?: string; description?: string }> } };
      return (json.web?.results ?? []).map((r) => ({
        title: r.title ?? '',
        url: r.url ?? '',
        snippet: r.description ?? '',
      }));
    };
  }

  log.warn({}, 'web_search.provider.disabled', { reason: 'set TAVILY_API_KEY or BRAVE_API_KEY to enable ai.web.search' });
  return undefined;
}

function createRedisClient(mode: string, cfg: RedisConfig, log: typeof logger): RedisClient | null {
  if (mode === 'memory') {
    log.warn({}, 'infra.redis.memory_mode');
    return null;
  }
  log.flow({}, 'infra.redis.enabled', { host: cfg.host, port: cfg.port });
  return new RedisClient(cfg);
}

function createQueueManager(mode: string, cfg: ReturnType<typeof loadConfig>, log: typeof logger): QueueManager | null {
  if (mode === 'memory') {
    return null;
  }
  log.flow({}, 'infra.queue.enabled', { host: cfg.REDIS_HOST, port: cfg.REDIS_PORT });
  return new QueueManager({
    redisHost: cfg.REDIS_HOST,
    redisPort: cfg.REDIS_PORT,
    redisPassword: cfg.REDIS_PASSWORD,
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: 1000,
      removeOnFail: 5000,
    },
  });
}

function createCheckpointStore(
  database: ReturnType<typeof createDatabase> | null,
  queue: QueueManager | null,
  tenantId: string,
  log: typeof logger,
): RepositoryCheckpointStore | undefined {
  if (!database) {
    log.warn({}, 'infra.checkpoint.memory_mode');
    return undefined;
  }
  log.flow({}, 'infra.checkpoint.postgres_enabled');
  const repository = new CheckpointsRepository(database);
  const outbox = queue ? new CheckpointOutbox(queue, repository) : undefined;
  outbox?.registerWorker();
  return new RepositoryCheckpointStore(repository, tenantId, outbox);
}

async function shutdown(): Promise<void> {
  await app.stop();
  await queueManager?.close();
  await redisClient?.close();
  await observability.shutdown();
}

