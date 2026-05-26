# Nexus 企业级 Agent 中间件 — 技术落地实施蓝图

> **版本**: v1.0  
> **定位**: 从 0 到 1 的工程实施指南，覆盖工程骨架、代码骨架、数据库设计、基础设施、逐 Sprint 交付计划  
> **前置依赖**: nexus-enterprise-agent-middleware-complete-solution.md（架构方案）+ nexus-deep-innovation-optimization.md（创新优化）  
> **目标读者**: 研发负责人、后端工程师、DevOps 工程师

---

## 一、技术栈确认与版本锁定

### 1.1 运行时与语言

| 组件 | 技术 | 版本 | 选型理由 |
|------|------|------|---------|
| 语言 | TypeScript | 5.5+ | 严格类型 + 丰富的 AI SDK 生态 |
| 运行时 | Node.js | 22 LTS | 原生 fetch、WebSocket、性能优化 |
| 包管理 | pnpm | 9+ | 磁盘效率高、严格依赖提升、workspace 原生支持 |
| 构建编排 | Turborepo | 2+ | 增量构建、任务缓存、拓扑排序、远程缓存 |

### 1.2 核心框架

| 层 | 技术 | 版本 | 选型理由 |
|----|------|------|---------|
| HTTP 框架 | Fastify | 5+ | 高性能、插件体系、Schema 校验原生支持 |
| API 校验 | Zod | 3+ | TypeScript 原生类型推导、与 Fastify 集成良好 |
| ORM | Drizzle ORM | 0.36+ | 类型安全、轻量、原生 SQL 可控、迁移工具成熟 |
| 队列 | BullMQ | 5+ | Redis 原生、延迟任务、重试策略、Dashboard |
| WebSocket | @fastify/websocket | 11+ | 与 Fastify 无缝集成 |

### 1.3 AI / LLM

| 组件 | 技术 | 版本 | 选型理由 |
|------|------|------|---------|
| LLM SDK | Vercel AI SDK | 4+ | 多 Provider 适配、流式支持、tool calling 原生支持 |
| 备选直连 | @anthropic-ai/sdk / openai | latest | 需要 Prompt Cache 等高级特性时直连 |
| 嵌入模型 | OpenAI text-embedding-3-small 或 本地 BGE | - | 向量化用 |

### 1.4 存储与基础设施

| 组件 | 技术 | 版本 | 用途 |
|------|------|------|------|
| 关系数据库 | PostgreSQL | 16+ | AgentRun、审计、审批、配置、用户 |
| 缓存/队列后端 | Redis | 7+ Stack | 缓存、BullMQ 后端、限流计数、Session 存储 |
| 事件总线（MVP） | Redis Streams | 7+ | Phase Bridge 事件（MVP 阶段） |
| 事件总线（规模化） | Apache Kafka | 3.7+ | Phase Bridge 事件（生产规模） |
| 向量数据库 | Qdrant | 1.12+ | RAG 向量检索 |
| 全文检索 | Elasticsearch | 8+ | 日志检索、知识全文搜索 |
| 对象存储 | MinIO | latest | 证据文件、构建产物、媒体资源 |

### 1.5 可观测性

| 组件 | 技术 | 用途 |
|------|------|------|
| Trace | OpenTelemetry SDK + Tempo | 分布式链路追踪 |
| Metrics | Prometheus + Grafana | 指标采集与可视化 |
| Logs | Pino + ELK (Elasticsearch + Logstash + Kibana) | 结构化日志 |

### 1.6 沙箱与安全

| 组件 | 技术 | 用途 |
|------|------|------|
| 容器沙箱 | Docker + dockerode SDK | Phase 2 代码执行隔离 |
| 增强隔离 | gVisor (runsc) | 高风险任务的内核级隔离 |

### 1.7 开发与测试

| 组件 | 技术 | 用途 |
|------|------|------|
| 测试框架 | Vitest | 单元测试 + 集成测试 |
| API 测试 | @fastify/inject | HTTP 端点测试（无需启动服务） |
| Lint | ESLint 9+ (flat config) + Prettier | 代码规范 |
| Git hooks | simple-git-hooks + lint-staged | 提交前检查 |
| CI/CD | GitHub Actions / GitLab CI | 持续集成 |

---

## 二、Monorepo 工程骨架

### 2.1 完整目录结构

```text
nexus/
├── package.json                          # 根 workspace 配置
├── pnpm-workspace.yaml                   # pnpm workspace 定义
├── turbo.json                            # Turborepo 任务管道
├── tsconfig.base.json                    # 共享 TS 编译配置
├── .env.example                          # 环境变量模板
├── docker-compose.yml                    # 本地开发基础设施
├── docker-compose.prod.yml               # 生产部署编排
│
├── packages/
│   ├── shared/                           # ① 共享类型、工具函数、错误体系
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts                  # 统一导出
│   │       ├── types/
│   │       │   ├── agent.types.ts        # Agent 核心类型
│   │       │   ├── tool.types.ts         # 工具类型
│   │       │   ├── memory.types.ts       # 记忆类型
│   │       │   ├── event.types.ts        # 事件类型
│   │       │   ├── policy.types.ts       # 策略类型
│   │       │   └── common.types.ts       # 通用基础类型
│   │       ├── errors/
│   │       │   ├── base.error.ts         # NexusError 基类
│   │       │   ├── tool.error.ts         # 工具相关错误
│   │       │   ├── provider.error.ts     # Provider 相关错误
│   │       │   ├── guardrail.error.ts    # 护栏相关错误
│   │       │   └── budget.error.ts       # 预算相关错误
│   │       ├── utils/
│   │       │   ├── id.ts                 # ULID/UUID 生成
│   │       │   ├── retry.ts             # 通用重试函数
│   │       │   ├── token-counter.ts      # Token 估算（tiktoken）
│   │       │   ├── truncate.ts           # 安全截断
│   │       │   └── schema.ts             # Zod Schema 工具函数
│   │       └── constants/
│   │           ├── limits.ts             # 系统级限制常量
│   │           └── defaults.ts           # 默认配置值
│   │
│   ├── kernel/                           # ② 薄内核：Runtime + 推理循环
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── runtime/
│   │       │   ├── agent-runtime.ts      # IAgentRuntime 实现
│   │       │   ├── query-loop.ts         # Query Loop Runtime（核心推理循环）
│   │       │   ├── state-graph.ts        # State Graph Runtime（复杂流程）
│   │       │   └── stream-events.ts      # AgentStreamEvent 类型和工具函数
│   │       ├── compact/
│   │       │   ├── compact-engine.ts     # 四级级联防爆引擎
│   │       │   ├── micro-compact.ts      # L1 时间间隔微清理
│   │       │   ├── evidence-compact.ts   # L2 证据感知压缩
│   │       │   ├── session-compact.ts    # L3 Session Memory 嫁接
│   │       │   └── legacy-compact.ts     # L4 传统压缩
│   │       ├── context/
│   │       │   ├── env-injector.ts       # 冷启动环境注射器
│   │       │   ├── context-backfiller.ts # 运行时状态回填
│   │       │   ├── prompt-assembler.ts   # System Prompt 六层组装器
│   │       │   └── tool-result-budget.ts # 工具结果预算截断
│   │       ├── lifecycle/
│   │       │   ├── hook-registry.ts      # 生命周期钩子注册中心
│   │       │   ├── checkpoint-manager.ts # Checkpoint 管理
│   │       │   └── graceful-shutdown.ts  # 优雅停机与排水
│   │       └── __tests__/
│   │
│   ├── control-plane/                    # ③ 控制面
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── agent-registry/
│   │       │   ├── registry.service.ts   # Agent 注册与版本管理
│   │       │   └── registry.repo.ts      # 数据库访问层
│   │       ├── agent-run/
│   │       │   ├── run-manager.service.ts # AgentRun 生命周期管理
│   │       │   ├── run-state-machine.ts   # 状态机实现
│   │       │   └── run.repo.ts            # 数据库访问层
│   │       ├── policy/
│   │       │   ├── policy-engine.ts       # RBAC/ABAC + AutonomyScore
│   │       │   ├── autonomy-score.ts      # 自主度计算
│   │       │   └── model-router.ts        # 模型路由策略
│   │       ├── approval/
│   │       │   ├── approval-engine.ts     # 审批策略匹配与流转
│   │       │   ├── approval.repo.ts       # 数据库访问层
│   │       │   └── approval-timeout.ts    # 超时升级
│   │       ├── budget/
│   │       │   ├── budget-manager.ts      # 多维预算管理
│   │       │   ├── cost-calculator.ts     # 成本计算（含 Cache 感知）
│   │       │   └── budget.repo.ts         # 数据库访问层
│   │       ├── audit/
│   │       │   ├── audit-engine.ts        # 审计记录引擎
│   │       │   ├── decision-recorder.ts   # 认知决策链记录
│   │       │   └── audit.repo.ts          # 数据库访问层
│   │       ├── trust/
│   │       │   ├── trust-engine.ts        # Trust 评估与调节
│   │       │   └── trust.repo.ts          # 数据库访问层
│   │       ├── scheduler/
│   │       │   ├── scheduler.service.ts   # 定时任务调度
│   │       │   └── jobs/                  # 具体调度任务
│   │       └── __tests__/
│   │
│   ├── tool-gateway/                     # ④ 工具网关
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── gateway.ts                # Tool Gateway 主入口
│   │       ├── router.ts                 # 工具路由
│   │       ├── pipeline/
│   │       │   ├── pre-execution.ts      # 执行前管道（Schema/权限/风险/审批/限流/脱敏）
│   │       │   └── post-execution.ts     # 执行后管道（标准化/审计/证据/脱敏）
│   │       ├── adapters/
│   │       │   ├── adapter.interface.ts  # IToolProtocolAdapter 接口
│   │       │   ├── mcp.adapter.ts        # MCP 协议适配
│   │       │   ├── openapi.adapter.ts    # OpenAPI 适配
│   │       │   ├── grpc.adapter.ts       # gRPC 适配
│   │       │   └── internal-sdk.adapter.ts # 内部 SDK 适配
│   │       ├── registry/
│   │       │   ├── tool-registry.ts      # 工具注册中心
│   │       │   └── tool-registry.repo.ts # 数据库访问层
│   │       ├── security/
│   │       │   ├── risk-assessor.ts      # 风险等级评估
│   │       │   ├── permission-checker.ts # 四维权限检查
│   │       │   └── rate-limiter.ts       # 限流/熔断
│   │       └── __tests__/
│   │
│   ├── memory/                           # ⑤ 记忆与知识系统
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── working/
│   │       │   └── working-memory.ts     # MEM-0 当前上下文
│   │       ├── session/
│   │       │   ├── session-shadow.ts     # SessionShadow 影子代理
│   │       │   ├── session-summary.ts    # Session Summary 模板与反膨胀
│   │       │   └── session.repo.ts       # 数据库访问层
│   │       ├── episodic/
│   │       │   ├── episodic-memory.ts    # MEM-2 情景记忆
│   │       │   └── episodic.repo.ts      # 数据库访问层
│   │       ├── knowledge/
│   │       │   ├── crystallizer.ts       # KnowledgeCrystallizer 影子代理
│   │       │   ├── skill-store.ts        # MEM-3 技能存储
│   │       │   └── knowledge.repo.ts     # 数据库访问层
│   │       ├── rag/
│   │       │   ├── rag-pipeline.ts       # RAG 检索管道
│   │       │   ├── embedder.ts           # 嵌入生成
│   │       │   ├── reranker.ts           # 精排
│   │       │   └── rag.repo.ts           # Qdrant 访问层
│   │       └── __tests__/
│   │
│   ├── guardrails/                       # ⑥ 安全护栏
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── input/
│   │       │   ├── injection-detector.ts # Prompt 注入检测
│   │       │   ├── unicode-scanner.ts    # 隐藏 Unicode 检测
│   │       │   └── data-leak-detector.ts # 数据外泄检测
│   │       ├── output/
│   │       │   ├── pii-redactor.ts       # PII 脱敏
│   │       │   ├── secret-scanner.ts     # 密钥/Token 扫描
│   │       │   └── confidence-tagger.ts  # 低置信度标注
│   │       └── __tests__/
│   │
│   ├── providers/                        # ⑦ LLM Provider 适配
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── provider.interface.ts     # IModelProvider 接口
│   │       ├── anthropic.provider.ts     # Anthropic Claude 适配
│   │       ├── openai.provider.ts        # OpenAI 适配
│   │       ├── local.provider.ts         # 本地模型适配（Ollama）
│   │       ├── provider-router.ts        # 多 Provider 路由
│   │       ├── cache/
│   │       │   └── prompt-cache.ts       # Prompt Cache 管理
│   │       └── __tests__/
│   │
│   ├── phase-bridge/                     # ⑧ 阶段桥接事件总线
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts
│   │       ├── event-bus.ts              # 事件总线抽象
│   │       ├── redis-streams.adapter.ts  # Redis Streams 实现（MVP）
│   │       ├── kafka.adapter.ts          # Kafka 实现（规模化）
│   │       ├── schema-registry.ts        # 事件 Schema 注册与验证
│   │       ├── dead-letter.ts            # 死信队列处理
│   │       └── __tests__/
│   │
│   ├── phase-intent/                     # ⑨ Phase 1 项目管理能力包
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── manifest.json                 # 能力包清单
│   │   └── src/
│   │       ├── index.ts
│   │       ├── agents/
│   │       │   ├── requirement-analyst/
│   │       │   │   ├── agent.ts
│   │       │   │   └── prompts.ts
│   │       │   ├── task-planner/
│   │       │   │   ├── agent.ts
│   │       │   │   └── prompts.ts
│   │       │   ├── project-doctor/
│   │       │   │   ├── agent.ts
│   │       │   │   └── prompts.ts
│   │       │   ├── progress-tracker/
│   │       │   │   ├── agent.ts
│   │       │   │   └── prompts.ts
│   │       │   └── reminder/
│   │       │       ├── agent.ts
│   │       │       └── prompts.ts
│   │       ├── tools/
│   │       │   ├── project.tool.ts
│   │       │   ├── task.tool.ts
│   │       │   ├── milestone.tool.ts
│   │       │   ├── risk.tool.ts
│   │       │   └── notification.tool.ts
│   │       └── __tests__/
│   │
│   └── infra/                            # ⑩ 基础设施胶水层
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           ├── index.ts
│           ├── config/
│           │   ├── config.loader.ts      # 环境变量 → Config 对象
│           │   ├── config.schema.ts       # 配置 Zod Schema
│           │   └── config.types.ts        # 配置类型定义
│           ├── database/
│           │   ├── connection.ts          # PostgreSQL 连接池
│           │   ├── schema/               # Drizzle Schema 定义
│           │   │   ├── agent-registry.schema.ts
│           │   │   ├── agent-run.schema.ts
│           │   │   ├── approval.schema.ts
│           │   │   ├── audit.schema.ts
│           │   │   ├── budget.schema.ts
│           │   │   ├── tool-registry.schema.ts
│           │   │   ├── memory.schema.ts
│           │   │   └── trust.schema.ts
│           │   └── migrations/           # 数据库迁移文件
│           ├── redis/
│           │   └── connection.ts          # Redis 连接管理
│           ├── logger/
│           │   └── logger.ts             # Pino 日志配置
│           ├── tracer/
│           │   └── tracer.ts             # OpenTelemetry 配置
│           └── __tests__/
│
├── apps/
│   ├── api-gateway/                      # API 网关应用
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── Dockerfile
│   │   └── src/
│   │       ├── main.ts                   # Fastify 入口
│   │       ├── plugins/
│   │       │   ├── auth.plugin.ts        # 认证插件
│   │       │   ├── tenant.plugin.ts      # 租户解析
│   │       │   └── rate-limit.plugin.ts  # 限流插件
│   │       ├── routes/
│   │       │   ├── agent-run.routes.ts   # /api/v1/agent-runs
│   │       │   ├── agent.routes.ts       # /api/v1/agents
│   │       │   ├── approval.routes.ts    # /api/v1/approvals
│   │       │   ├── tool.routes.ts        # /api/v1/tools
│   │       │   └── health.routes.ts      # /healthz, /readyz
│   │       ├── ws/
│   │       │   └── stream.handler.ts     # WebSocket 流式推送
│   │       └── middleware/
│   │           ├── idempotency.ts        # 幂等去重
│   │           └── error-handler.ts      # 统一错误处理
│   │
│   └── cli/                              # CLI 工具
│       ├── package.json
│       └── src/
│           └── main.ts
│
├── evals/                                # 评估框架
│   ├── datasets/
│   └── scripts/
│
├── docs/                                 # 文档
│
└── config/
    ├── env/
    │   ├── .env.development
    │   ├── .env.staging
    │   └── .env.production
    └── k8s/                              # Kubernetes 部署配置
        ├── namespace.yaml
        ├── api-gateway.yaml
        └── configmap.yaml
```

### 2.2 根配置文件

**pnpm-workspace.yaml**:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

**turbo.json**:

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "test": {
      "dependsOn": ["build"]
    },
    "lint": {},
    "typecheck": {
      "dependsOn": ["^build"]
    }
  }
}
```

**tsconfig.base.json**:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "incremental": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": false
  },
  "exclude": ["node_modules", "dist"]
}
```

---

## 三、核心模块代码骨架

### 3.1 @nexus/shared — 类型系统核心

**packages/shared/src/types/agent.types.ts**:

```typescript
import type { JSONSchema7 } from 'json-schema';

/** Agent 注册定义 */
export interface AgentDefinition {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly phase: PhaseId;
  readonly allowedTools: readonly string[];
  readonly maxConcurrentRuns: number;
  readonly defaultModelProfile: ModelProfile;
  readonly promptVersion: string;
}

export type PhaseId = 'phase-intent' | 'phase-execution' | 'phase-connection';

/** AgentRun 状态 */
export type AgentRunStatus =
  | 'created'
  | 'running'
  | 'waiting_approval'
  | 'waiting_external'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'handed_over';

/** AgentRun 实体 */
export interface AgentRun {
  readonly id: string;
  readonly agentId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly status: AgentRunStatus;
  readonly input: AgentRunInput;
  readonly checkpointId: string | null;
  readonly parentRunId: string | null;
  readonly budgetSnapshot: BudgetSnapshot;
  readonly traceId: string;
  readonly promptVersion: string;
  readonly modelProfile: ModelProfile;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
}

export interface AgentRunInput {
  readonly message: string;
  readonly attachments?: readonly ContentPart[];
  readonly context?: Record<string, unknown>;
}

export interface ModelProfile {
  readonly provider: string;
  readonly model: string;
  readonly fallbackModel?: string;
  readonly maxTokens: number;
  readonly temperature: number;
  readonly thinkingBudget?: number;
}

export interface BudgetSnapshot {
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thinkingTokens: number;
  toolCalls: number;
  totalCostUsd: number;
  maxBudgetUsd: number;
}

/** 多模态内容 */
export type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; uri: string; mimeType: string }
  | { type: 'file'; uri: string; mimeType: string; name?: string }
  | { type: 'structured'; schema: string; data: Readonly<Record<string, unknown>> };

/** 流式事件 */
export type AgentStreamEvent =
  | { type: 'text_delta'; delta: string; runId: string }
  | { type: 'thinking_delta'; delta: string; runId: string }
  | { type: 'tool_use_start'; toolName: string; toolCallId: string; input: unknown; runId: string }
  | { type: 'tool_use_result'; toolName: string; toolCallId: string; result: unknown; runId: string }
  | { type: 'approval_required'; requestId: string; toolName: string; reason: string; runId: string }
  | { type: 'checkpoint'; checkpointId: string; runId: string }
  | { type: 'compact'; level: string; tokensFreed: number; runId: string }
  | { type: 'budget_warning'; dimension: string; usage: number; limit: number; runId: string }
  | { type: 'error'; code: string; message: string; recoverable: boolean; runId: string }
  | { type: 'completed'; result: AgentRunResult; runId: string };

export interface AgentRunResult {
  readonly output: string;
  readonly status: 'succeeded' | 'failed' | 'cancelled' | 'handed_over';
  readonly evidenceIds: readonly string[];
  readonly usage: BudgetSnapshot;
  readonly durationMs: number;
}
```

**packages/shared/src/types/tool.types.ts**:

```typescript
import type { JSONSchema7 } from 'json-schema';

export type ToolRiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'RX';

export type Reversibility = 'reversible' | 'partially' | 'irreversible' | 'unknown';

export type EnvironmentDimension =
  | 'working_directory'
  | 'file_system'
  | 'git_state'
  | 'permissions'
  | 'external_system_state'
  | 'none';

export interface ToolSafetyCharacteristics {
  readonly isReadOnly: boolean;
  readonly isDestructive: boolean;
  readonly isConcurrencySafe: boolean;
  readonly isIdempotent: boolean;
  readonly reversibility: Reversibility;
  readonly timeoutMs: number;
  readonly retryable: boolean;
  readonly environmentSideEffects: readonly EnvironmentDimension[];
  readonly maxOutputTokens: number;
}

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: JSONSchema7;
  readonly outputSchema: JSONSchema7;
  readonly riskLevel: ToolRiskLevel;
  readonly characteristics: ToolSafetyCharacteristics;
  readonly searchHint?: string;
}

export interface ToolInvokeRequest {
  readonly toolName: string;
  readonly input: unknown;
  readonly runId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly callId: string;
}

export interface ToolInvokeResult {
  readonly callId: string;
  readonly output: unknown;
  readonly durationMs: number;
  readonly cached: boolean;
  readonly evidenceId?: string;
  readonly contextPatch?: ContextPatch;
}

export interface ContextPatch {
  readonly dimension: EnvironmentDimension;
  readonly before: unknown;
  readonly after: unknown;
  readonly description: string;
}
```

**packages/shared/src/errors/base.error.ts**:

```typescript
/**
 * Nexus 领域错误基类。
 * @property code - 机器可读错误码（格式 NEXUS_XXX_YYY）。
 * @property retryable - 是否可安全重试。
 * @property context - 结构化上下文，用于审计、排障和告警。
 */
export class NexusError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean = false,
    readonly context?: Readonly<Record<string, unknown>>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class ToolExecutionError extends NexusError {
  constructor(message: string, context?: Record<string, unknown>, options?: ErrorOptions) {
    super(message, 'NEXUS_TOOL_EXEC', false, context, options);
  }
}

export class ProviderError extends NexusError {
  constructor(message: string, retryable: boolean, context?: Record<string, unknown>) {
    super(message, 'NEXUS_PROVIDER', retryable, context);
  }
}

export class GuardrailViolation extends NexusError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'NEXUS_GUARDRAIL', false, context);
  }
}

export class BudgetExhaustedError extends NexusError {
  constructor(dimension: string, usage: number, limit: number) {
    super(
      `Budget exhausted: ${dimension} used ${usage}/${limit}`,
      'NEXUS_BUDGET_EXHAUSTED',
      false,
      { dimension, usage, limit },
    );
  }
}
```

### 3.2 @nexus/kernel — 推理循环核心实现

**packages/kernel/src/runtime/query-loop.ts**:

```typescript
import type {
  AgentStreamEvent,
  AgentRunInput,
  AgentRunResult,
  BudgetSnapshot,
  ModelProfile,
} from '@nexus/shared';
import type { IModelProvider } from '@nexus/providers';
import type { IToolGateway } from '@nexus/tool-gateway';
import type { ICompactEngine } from '../compact/compact-engine.js';
import type { IPromptAssembler } from '../context/prompt-assembler.js';
import type { IContextBackfiller } from '../context/context-backfiller.js';
import type { ICheckpointManager } from '../lifecycle/checkpoint-manager.js';
import type { IHookRegistry } from '../lifecycle/hook-registry.js';

/** 消息格式（与 LLM API 对齐） */
interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | ContentBlock[];
  tool_call_id?: string;
  name?: string;
}

type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; thinking: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string };

interface QueryLoopDeps {
  readonly provider: IModelProvider;
  readonly toolGateway: IToolGateway;
  readonly compactEngine: ICompactEngine;
  readonly promptAssembler: IPromptAssembler;
  readonly backfiller: IContextBackfiller;
  readonly checkpointManager: ICheckpointManager;
  readonly hookRegistry: IHookRegistry;
  readonly budget: BudgetSnapshot;
  readonly modelProfile: ModelProfile;
  readonly abortSignal: AbortSignal;
}

interface QueryLoopInput {
  readonly runId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly input: AgentRunInput;
  readonly resumeMessages?: readonly LLMMessage[];
}

/**
 * 核心推理循环。
 * 基于 AsyncGenerator 实现流式输出，支持自愈降级和断点续接。
 */
export async function* queryLoop(
  deps: QueryLoopDeps,
  loopInput: QueryLoopInput,
): AsyncGenerator<AgentStreamEvent, AgentRunResult> {
  const { runId } = loopInput;
  const messages: LLMMessage[] = loopInput.resumeMessages
    ? [...loopInput.resumeMessages]
    : [];

  if (!loopInput.resumeMessages) {
    messages.push({ role: 'user', content: loopInput.input.message });
  }

  let turnCount = 0;
  const MAX_TURNS = 50;

  while (turnCount < MAX_TURNS) {
    turnCount++;

    // ── Phase A：上下文防爆预处理 ──
    const compactResult = await deps.compactEngine.compact(
      messages,
      deps.budget,
    );
    if (compactResult.tokensFreed > 0) {
      messages.length = 0;
      messages.push(...compactResult.messages);
      yield { type: 'compact', level: compactResult.level, tokensFreed: compactResult.tokensFreed, runId };
    }

    // 组装 System Prompt
    const systemPrompt = await deps.promptAssembler.assemble({
      runId,
      tenantId: loopInput.tenantId,
      agentId: loopInput.input.context?.agentId as string,
      turnCount,
    });

    // ── Phase B：模型调用 ──
    await deps.hookRegistry.execute('pre_plan', { runId, messages });

    let assistantMessage: LLMMessage | null = null;
    let modelUsed = deps.modelProfile.model;

    try {
      const stream = deps.provider.stream({
        model: modelUsed,
        systemPrompt,
        messages,
        maxTokens: deps.modelProfile.maxTokens,
        temperature: deps.modelProfile.temperature,
        thinkingBudget: deps.modelProfile.thinkingBudget,
        abortSignal: deps.abortSignal,
      });

      const contentBlocks: ContentBlock[] = [];

      for await (const chunk of stream) {
        if (deps.abortSignal.aborted) break;

        switch (chunk.type) {
          case 'text_delta':
            yield { type: 'text_delta', delta: chunk.delta, runId };
            break;
          case 'thinking_delta':
            yield { type: 'thinking_delta', delta: chunk.delta, runId };
            break;
          case 'content_block':
            contentBlocks.push(chunk.block);
            break;
          case 'usage':
            deps.budget.inputTokens += chunk.inputTokens;
            deps.budget.outputTokens += chunk.outputTokens;
            deps.budget.cachedTokens += chunk.cachedTokens ?? 0;
            break;
        }
      }

      assistantMessage = { role: 'assistant', content: contentBlocks };

    } catch (error) {
      // 模型降级：主模型失败时尝试 fallbackModel
      if (deps.modelProfile.fallbackModel && modelUsed !== deps.modelProfile.fallbackModel) {
        modelUsed = deps.modelProfile.fallbackModel;
        yield { type: 'error', code: 'MODEL_FALLBACK', message: `Falling back to ${modelUsed}`, recoverable: true, runId };
        continue; // 回到循环顶部重试
      }
      yield { type: 'error', code: 'MODEL_ERROR', message: String(error), recoverable: false, runId };
      return {
        output: '', status: 'failed', evidenceIds: [], usage: deps.budget,
        durationMs: 0,
      };
    }

    if (!assistantMessage) break;
    messages.push(assistantMessage);
    await deps.hookRegistry.execute('post_plan', { runId, messages });

    // Checkpoint：模型输出完成后落盘
    deps.checkpointManager.fireAndForget(runId, { messages, budget: deps.budget, turnCount });

    // ── Phase C：工具执行 ──
    const toolUseBlocks = (assistantMessage.content as ContentBlock[])
      .filter((b): b is Extract<ContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');

    if (toolUseBlocks.length === 0) {
      // 无工具调用 → 推理完成
      const textOutput = (assistantMessage.content as ContentBlock[])
        .filter((b): b is Extract<ContentBlock, { type: 'text' }> => b.type === 'text')
        .map(b => b.text)
        .join('');

      await deps.hookRegistry.execute('post_sampling', { runId, messages });
      await deps.hookRegistry.execute('post_complete', { runId, messages });

      const result: AgentRunResult = {
        output: textOutput,
        status: 'succeeded',
        evidenceIds: [],
        usage: deps.budget,
        durationMs: 0,
      };
      yield { type: 'completed', result, runId };
      return result;
    }

    // 执行工具（支持并发）
    await deps.hookRegistry.execute('pre_tool', { runId, toolCalls: toolUseBlocks });

    const toolResults = await Promise.all(
      toolUseBlocks.map(async (toolBlock) => {
        yield { type: 'tool_use_start', toolName: toolBlock.name, toolCallId: toolBlock.id, input: toolBlock.input, runId };

        const result = await deps.toolGateway.invoke({
          toolName: toolBlock.name,
          input: toolBlock.input,
          runId,
          tenantId: loopInput.tenantId,
          userId: loopInput.userId,
          callId: toolBlock.id,
        });

        yield { type: 'tool_use_result', toolName: toolBlock.name, toolCallId: toolBlock.id, result: result.output, runId };

        // 环境状态回填
        if (result.contextPatch) {
          deps.backfiller.apply(result.contextPatch);
        }

        return {
          type: 'tool_result' as const,
          tool_use_id: toolBlock.id,
          content: typeof result.output === 'string' ? result.output : JSON.stringify(result.output),
        };
      }),
    );

    messages.push({ role: 'tool', content: toolResults as any });
    await deps.hookRegistry.execute('post_tool', { runId, toolResults });

    // Checkpoint：工具执行完成后落盘
    deps.checkpointManager.fireAndForget(runId, { messages, budget: deps.budget, turnCount });

    // 预算检查
    const costUsd = deps.budget.totalCostUsd;
    if (costUsd >= deps.budget.maxBudgetUsd * 0.9) {
      yield { type: 'budget_warning', dimension: 'total_cost', usage: costUsd, limit: deps.budget.maxBudgetUsd, runId };
    }
    if (costUsd >= deps.budget.maxBudgetUsd) {
      return {
        output: 'Budget exhausted', status: 'failed', evidenceIds: [],
        usage: deps.budget, durationMs: 0,
      };
    }

    // ── Phase D：继续下一轮循环 ──
    await deps.hookRegistry.execute('post_sampling', { runId, messages });
  }

  // 超过 MAX_TURNS
  return {
    output: 'Max turns exceeded', status: 'failed', evidenceIds: [],
    usage: deps.budget, durationMs: 0,
  };
}
```

### 3.3 @nexus/providers — LLM Provider 适配

**packages/providers/src/provider.interface.ts**:

```typescript
/** LLM Provider 统一接口 */
export interface IModelProvider {
  readonly name: string;

  /**
   * 流式调用 LLM。
   * 返回 AsyncGenerator 逐块输出。
   */
  stream(request: ModelRequest): AsyncGenerator<ModelStreamChunk>;

  /** 健康检查 */
  healthCheck(): Promise<boolean>;
}

export interface ModelRequest {
  readonly model: string;
  readonly systemPrompt: string;
  readonly messages: readonly LLMMessage[];
  readonly maxTokens: number;
  readonly temperature: number;
  readonly thinkingBudget?: number;
  readonly tools?: readonly ToolSchema[];
  readonly abortSignal?: AbortSignal;
}

export type ModelStreamChunk =
  | { type: 'text_delta'; delta: string }
  | { type: 'thinking_delta'; delta: string }
  | { type: 'content_block'; block: ContentBlock }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cachedTokens?: number }
  | { type: 'stop'; reason: string };
```

**packages/providers/src/anthropic.provider.ts**（核心 Provider 示意）:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { IModelProvider, ModelRequest, ModelStreamChunk } from './provider.interface.js';

export class AnthropicProvider implements IModelProvider {
  readonly name = 'anthropic';
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async *stream(request: ModelRequest): AsyncGenerator<ModelStreamChunk> {
    const stream = this.client.messages.stream({
      model: request.model,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      system: request.systemPrompt,
      messages: this.convertMessages(request.messages),
      tools: request.tools?.map(t => this.convertTool(t)),
      ...(request.thinkingBudget
        ? { thinking: { type: 'enabled', budget_tokens: request.thinkingBudget } }
        : {}),
    });

    for await (const event of stream) {
      switch (event.type) {
        case 'content_block_delta':
          if (event.delta.type === 'text_delta') {
            yield { type: 'text_delta', delta: event.delta.text };
          } else if (event.delta.type === 'thinking_delta') {
            yield { type: 'thinking_delta', delta: event.delta.thinking };
          }
          break;
        case 'content_block_stop':
          yield { type: 'content_block', block: this.convertBlock(event) };
          break;
        case 'message_delta':
          yield {
            type: 'usage',
            inputTokens: 0,
            outputTokens: event.usage?.output_tokens ?? 0,
            cachedTokens: 0,
          };
          break;
        case 'message_stop':
          yield { type: 'stop', reason: 'end_turn' };
          break;
      }
    }

    const finalMessage = await stream.finalMessage();
    yield {
      type: 'usage',
      inputTokens: finalMessage.usage.input_tokens,
      outputTokens: finalMessage.usage.output_tokens,
      cachedTokens: (finalMessage.usage as any).cache_read_input_tokens ?? 0,
    };
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1,
        messages: [{ role: 'user', content: 'ping' }],
      });
      return true;
    } catch {
      return false;
    }
  }

  private convertMessages(messages: readonly any[]): Anthropic.MessageParam[] {
    // 转换内部消息格式为 Anthropic API 格式
    return messages.map(m => ({
      role: m.role === 'tool' ? 'user' : m.role,
      content: m.content,
    })) as Anthropic.MessageParam[];
  }

  private convertTool(tool: any): Anthropic.Tool {
    return {
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
    };
  }

  private convertBlock(event: any): any {
    return event.content_block;
  }
}
```

---

## 四、数据库 Schema 设计

### 4.1 核心表结构（Drizzle ORM）

**packages/infra/src/database/schema/agent-registry.schema.ts**:

```typescript
import { pgTable, text, timestamp, jsonb, integer, boolean, uniqueIndex } from 'drizzle-orm/pg-core';

export const agentDefinitions = pgTable('agent_definitions', {
  id: text('id').primaryKey(),                         // ULID
  name: text('name').notNull(),
  version: text('version').notNull(),
  description: text('description').notNull(),
  phase: text('phase').notNull(),                       // phase-intent | phase-execution | phase-connection
  allowedTools: jsonb('allowed_tools').$type<string[]>().notNull().default([]),
  maxConcurrentRuns: integer('max_concurrent_runs').notNull().default(5),
  defaultModelProfile: jsonb('default_model_profile').$type<Record<string, unknown>>().notNull(),
  promptVersion: text('prompt_version').notNull(),
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uq_agent_name_version').on(table.name, table.version),
]);
```

**packages/infra/src/database/schema/agent-run.schema.ts**:

```typescript
import { pgTable, text, timestamp, jsonb, integer, numeric, index } from 'drizzle-orm/pg-core';

export const agentRuns = pgTable('agent_runs', {
  id: text('id').primaryKey(),                          // ULID
  agentId: text('agent_id').notNull().references(() => agentDefinitions.id),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  status: text('status').notNull().default('created'),  // AgentRunStatus
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  output: text('output'),
  checkpointId: text('checkpoint_id'),
  parentRunId: text('parent_run_id'),
  traceId: text('trace_id').notNull(),
  promptVersion: text('prompt_version').notNull(),
  modelProfile: jsonb('model_profile').$type<Record<string, unknown>>().notNull(),

  // 预算追踪
  inputTokens: integer('input_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull().default(0),
  cachedTokens: integer('cached_tokens').notNull().default(0),
  toolCalls: integer('tool_calls').notNull().default(0),
  totalCostUsd: numeric('total_cost_usd', { precision: 10, scale: 6 }).notNull().default('0'),

  // 时间戳
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
}, (table) => [
  index('idx_agent_runs_tenant').on(table.tenantId),
  index('idx_agent_runs_status').on(table.status),
  index('idx_agent_runs_agent').on(table.agentId),
  index('idx_agent_runs_created').on(table.createdAt),
]);

export const agentRunCheckpoints = pgTable('agent_run_checkpoints', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull().references(() => agentRuns.id),
  turnCount: integer('turn_count').notNull(),
  messages: jsonb('messages').$type<unknown[]>().notNull(),
  budgetSnapshot: jsonb('budget_snapshot').$type<Record<string, unknown>>().notNull(),
  environmentState: jsonb('environment_state').$type<Record<string, unknown>>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_checkpoints_run').on(table.runId),
]);
```

**packages/infra/src/database/schema/audit.schema.ts**:

```typescript
import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  tenantId: text('tenant_id').notNull(),
  userId: text('user_id').notNull(),
  action: text('action').notNull(),             // tool_call | decision | approval | plan | error
  target: text('target').notNull(),              // 操作对象
  detail: jsonb('detail').$type<Record<string, unknown>>().notNull(),
  traceId: text('trace_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_audit_run').on(table.runId),
  index('idx_audit_tenant_time').on(table.tenantId, table.createdAt),
]);

export const decisionChains = pgTable('decision_chains', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  turnCount: integer('turn_count').notNull(),
  decisionType: text('decision_type').notNull(), // tool_selection | plan_step | risk_assessment
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  reasoning: text('reasoning'),
  alternatives: jsonb('alternatives').$type<unknown[]>(),
  confidence: numeric('confidence', { precision: 3, scale: 2 }),
  evidenceBasis: jsonb('evidence_basis').$type<string[]>(),
  output: jsonb('output').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_decision_run').on(table.runId),
]);
```

**packages/infra/src/database/schema/approval.schema.ts**:

```typescript
import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';

export const approvalRequests = pgTable('approval_requests', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  tenantId: text('tenant_id').notNull(),
  requesterId: text('requester_id').notNull(),
  toolName: text('tool_name').notNull(),
  toolInput: jsonb('tool_input').$type<Record<string, unknown>>().notNull(),
  riskLevel: text('risk_level').notNull(),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('pending'), // pending | approved | rejected | expired
  decidedBy: text('decided_by'),
  decidedAt: timestamp('decided_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_approval_run').on(table.runId),
  index('idx_approval_status').on(table.status),
]);
```

**packages/infra/src/database/schema/tool-registry.schema.ts**:

```typescript
import { pgTable, text, timestamp, jsonb, boolean, index } from 'drizzle-orm/pg-core';

export const toolDefinitions = pgTable('tool_definitions', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  description: text('description').notNull(),
  protocol: text('protocol').notNull(),            // mcp | openapi | grpc | internal-sdk
  inputSchema: jsonb('input_schema').$type<Record<string, unknown>>().notNull(),
  outputSchema: jsonb('output_schema').$type<Record<string, unknown>>().notNull(),
  riskLevel: text('risk_level').notNull(),
  characteristics: jsonb('characteristics').$type<Record<string, unknown>>().notNull(),
  endpoint: text('endpoint'),                       // 外部工具的连接端点
  isEnabled: boolean('is_enabled').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_tool_protocol').on(table.protocol),
]);

export const toolInvocations = pgTable('tool_invocations', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  toolName: text('tool_name').notNull(),
  input: jsonb('input').$type<Record<string, unknown>>().notNull(),
  output: jsonb('output').$type<Record<string, unknown>>(),
  status: text('status').notNull(),                 // success | error | timeout | rejected
  durationMs: integer('duration_ms'),
  costUsd: numeric('cost_usd', { precision: 10, scale: 6 }),
  evidenceId: text('evidence_id'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_invocation_run').on(table.runId),
  index('idx_invocation_tool').on(table.toolName),
]);
```

### 4.2 完整 ER 关系图

```text
agent_definitions 1 ──── N agent_runs
                              │
                              ├── N agent_run_checkpoints
                              ├── N audit_logs
                              ├── N decision_chains
                              ├── N approval_requests
                              ├── N tool_invocations
                              └── N phase_bridge_events

tool_definitions 1 ──── N tool_invocations
```

---

## 五、基础设施配置

### 5.1 本地开发 docker-compose.yml

```yaml
version: "3.9"
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nexus
      POSTGRES_USER: nexus
      POSTGRES_PASSWORD: nexus_dev_123
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --appendonly yes

  qdrant:
    image: qdrant/qdrant:v1.12.5
    ports:
      - "6333:6333"   # HTTP API
      - "6334:6334"   # gRPC API
    volumes:
      - qdrantdata:/qdrant/storage

  elasticsearch:
    image: docker.elastic.co/elasticsearch/elasticsearch:8.15.0
    environment:
      - discovery.type=single-node
      - xpack.security.enabled=false
      - "ES_JAVA_OPTS=-Xms512m -Xmx512m"
    ports:
      - "9200:9200"
    volumes:
      - esdata:/usr/share/elasticsearch/data

  minio:
    image: minio/minio:latest
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: nexus
      MINIO_ROOT_PASSWORD: nexus_dev_123
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - miniodata:/data

volumes:
  pgdata:
  qdrantdata:
  esdata:
  miniodata:
```

### 5.2 环境变量模板 (.env.example)

```bash
# ── 应用 ──
NODE_ENV=development
PORT=3000
LOG_LEVEL=debug

# ── 数据库 ──
DATABASE_URL=postgresql://nexus:nexus_dev_123@localhost:5432/nexus

# ── Redis ──
REDIS_URL=redis://localhost:6379

# ── LLM Providers ──
ANTHROPIC_API_KEY=sk-ant-xxx
OPENAI_API_KEY=sk-xxx

# ── 默认模型 ──
DEFAULT_MODEL_PROVIDER=anthropic
DEFAULT_MODEL=claude-sonnet-4-20250514
FALLBACK_MODEL=claude-haiku-4-20250514

# ── 预算 ──
DEFAULT_MAX_BUDGET_USD=5.00
DEFAULT_MAX_TOKENS=8192
DEFAULT_THINKING_BUDGET=4096

# ── 向量库 ──
QDRANT_URL=http://localhost:6333

# ── Elasticsearch ──
ELASTICSEARCH_URL=http://localhost:9200

# ── MinIO ──
MINIO_ENDPOINT=localhost
MINIO_PORT=9000
MINIO_ACCESS_KEY=nexus
MINIO_SECRET_KEY=nexus_dev_123

# ── 可观测 ──
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4318
OTEL_SERVICE_NAME=nexus-api

# ── 限制常量 ──
COMPACT_AUTOCOMPACT_BUFFER_TOKENS=13000
COMPACT_GAP_THRESHOLD_MINUTES=30
COMPACT_MAX_TOOL_RESULT_TOKENS=4000
QUERY_LOOP_MAX_TURNS=50
```

### 5.3 配置加载器

**packages/infra/src/config/config.schema.ts**:

```typescript
import { z } from 'zod';

export const appConfigSchema = z.object({
  nodeEnv: z.enum(['development', 'staging', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  database: z.object({
    url: z.string().url(),
    maxConnections: z.coerce.number().default(20),
  }),

  redis: z.object({
    url: z.string().url(),
  }),

  llm: z.object({
    anthropicApiKey: z.string().optional(),
    openaiApiKey: z.string().optional(),
    defaultProvider: z.enum(['anthropic', 'openai', 'local']).default('anthropic'),
    defaultModel: z.string().default('claude-sonnet-4-20250514'),
    fallbackModel: z.string().optional(),
  }),

  budget: z.object({
    defaultMaxBudgetUsd: z.coerce.number().default(5.0),
    defaultMaxTokens: z.coerce.number().default(8192),
    defaultThinkingBudget: z.coerce.number().default(4096),
  }),

  compact: z.object({
    autoCompactBufferTokens: z.coerce.number().default(13000),
    gapThresholdMinutes: z.coerce.number().default(30),
    maxToolResultTokens: z.coerce.number().default(4000),
  }),

  queryLoop: z.object({
    maxTurns: z.coerce.number().default(50),
  }),

  qdrant: z.object({
    url: z.string().url().default('http://localhost:6333'),
  }),

  elasticsearch: z.object({
    url: z.string().url().default('http://localhost:9200'),
  }),

  minio: z.object({
    endpoint: z.string().default('localhost'),
    port: z.coerce.number().default(9000),
    accessKey: z.string(),
    secretKey: z.string(),
  }),

  otel: z.object({
    endpoint: z.string().url().optional(),
    serviceName: z.string().default('nexus-api'),
  }),
});

export type AppConfig = z.infer<typeof appConfigSchema>;
```

**packages/infra/src/config/config.loader.ts**:

```typescript
import { appConfigSchema, type AppConfig } from './config.schema.js';

let _config: AppConfig | null = null;

/**
 * 从环境变量加载配置并校验。
 * 缺少必填项立即 fail-fast。
 */
export function loadConfig(): AppConfig {
  if (_config) return _config;

  const raw = {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    logLevel: process.env.LOG_LEVEL,
    database: {
      url: process.env.DATABASE_URL,
      maxConnections: process.env.DB_MAX_CONNECTIONS,
    },
    redis: {
      url: process.env.REDIS_URL,
    },
    llm: {
      anthropicApiKey: process.env.ANTHROPIC_API_KEY,
      openaiApiKey: process.env.OPENAI_API_KEY,
      defaultProvider: process.env.DEFAULT_MODEL_PROVIDER,
      defaultModel: process.env.DEFAULT_MODEL,
      fallbackModel: process.env.FALLBACK_MODEL,
    },
    budget: {
      defaultMaxBudgetUsd: process.env.DEFAULT_MAX_BUDGET_USD,
      defaultMaxTokens: process.env.DEFAULT_MAX_TOKENS,
      defaultThinkingBudget: process.env.DEFAULT_THINKING_BUDGET,
    },
    compact: {
      autoCompactBufferTokens: process.env.COMPACT_AUTOCOMPACT_BUFFER_TOKENS,
      gapThresholdMinutes: process.env.COMPACT_GAP_THRESHOLD_MINUTES,
      maxToolResultTokens: process.env.COMPACT_MAX_TOOL_RESULT_TOKENS,
    },
    queryLoop: {
      maxTurns: process.env.QUERY_LOOP_MAX_TURNS,
    },
    qdrant: {
      url: process.env.QDRANT_URL,
    },
    elasticsearch: {
      url: process.env.ELASTICSEARCH_URL,
    },
    minio: {
      endpoint: process.env.MINIO_ENDPOINT,
      port: process.env.MINIO_PORT,
      accessKey: process.env.MINIO_ACCESS_KEY,
      secretKey: process.env.MINIO_SECRET_KEY,
    },
    otel: {
      endpoint: process.env.OTEL_EXPORTER_OTLP_ENDPOINT,
      serviceName: process.env.OTEL_SERVICE_NAME,
    },
  };

  const result = appConfigSchema.safeParse(raw);
  if (!result.success) {
    console.error('Configuration validation failed:');
    console.error(result.error.format());
    process.exit(1);
  }

  _config = result.data;
  return _config;
}
```

---

## 六、API Gateway 入口实现

**apps/api-gateway/src/main.ts**:

```typescript
import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import { loadConfig } from '@nexus/infra';
import { initTracer } from '@nexus/infra/tracer';
import { createLogger } from '@nexus/infra/logger';
import { registerAgentRunRoutes } from './routes/agent-run.routes.js';
import { registerHealthRoutes } from './routes/health.routes.js';
import { errorHandler } from './middleware/error-handler.js';

async function bootstrap() {
  const config = loadConfig();
  initTracer(config);
  const logger = createLogger(config);

  const app = Fastify({
    logger: logger as any,
    requestIdHeader: 'x-request-id',
    genReqId: () => crypto.randomUUID(),
  });

  // 插件
  await app.register(fastifyWebsocket);

  // 中间件
  app.setErrorHandler(errorHandler);

  // 路由
  await app.register(registerHealthRoutes, { prefix: '/' });
  await app.register(registerAgentRunRoutes, { prefix: '/api/v1' });

  // 优雅停机
  const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT'];
  for (const signal of signals) {
    process.on(signal, async () => {
      app.log.info(`Received ${signal}, shutting down gracefully...`);
      await app.close();
      process.exit(0);
    });
  }

  await app.listen({ port: config.port, host: '0.0.0.0' });
  app.log.info(`Nexus API Gateway listening on port ${config.port}`);
}

bootstrap().catch((err) => {
  console.error('Failed to start:', err);
  process.exit(1);
});
```

**apps/api-gateway/src/routes/agent-run.routes.ts**:

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';

const createRunSchema = z.object({
  agentId: z.string(),
  message: z.string(),
  context: z.record(z.unknown()).optional(),
  budget: z.object({
    maxBudgetUsd: z.number().positive().optional(),
    maxTokens: z.number().positive().optional(),
  }).optional(),
});

export const registerAgentRunRoutes: FastifyPluginAsync = async (app) => {

  /** 创建 AgentRun（流式响应） */
  app.post('/agent-runs', async (request, reply) => {
    const body = createRunSchema.parse(request.body);

    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // 创建 AgentRun 并启动推理循环
    // const runtime = container.resolve(IAgentRuntime);
    // const stream = runtime.start({ ... });
    // for await (const event of stream) {
    //   reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
    // }
    // reply.raw.end();

    reply.raw.write(`data: ${JSON.stringify({ type: 'completed', runId: 'placeholder' })}\n\n`);
    reply.raw.end();
  });

  /** 查询 AgentRun 状态 */
  app.get('/agent-runs/:id', async (request) => {
    const { id } = request.params as { id: string };
    // const run = await runManager.getById(id);
    return { id, status: 'created' };
  });

  /** 取消 AgentRun */
  app.post('/agent-runs/:id/cancel', async (request) => {
    const { id } = request.params as { id: string };
    // await runtime.cancel(id, 'user_requested');
    return { id, status: 'cancelled' };
  });

  /** 恢复 AgentRun（从 Checkpoint） */
  app.post('/agent-runs/:id/resume', async (request, reply) => {
    const { id } = request.params as { id: string };
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
    });
    // const stream = runtime.resume(id, { type: 'user_resume' });
    // for await (const event of stream) { ... }
    reply.raw.end();
  });

  /** 审批回调 */
  app.post('/approvals/:id/decide', async (request) => {
    const { id } = request.params as { id: string };
    const { decision } = request.body as { decision: 'approved' | 'rejected' };
    // await approvalEngine.decide(id, decision, request.user);
    return { id, decision };
  });
};
```

---

## 七、Phase 0 逐 Sprint 实施计划

### Sprint 1（Week 1-2）：工程骨架 + Runtime 核心

**目标**：Monorepo 跑通 + query-loop 能完成一次对话

| 天 | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| D1 | pnpm init + workspace + turbo 配置 | 根配置文件 | `pnpm install` + `turbo build` 通过 |
| D2 | 创建 @nexus/shared 包 + 全部类型定义 | types/ + errors/ | TypeScript 编译通过 |
| D3 | 创建 @nexus/infra 包 + config loader + DB 连接 | config + database | `loadConfig()` 启动校验通过 |
| D4 | docker-compose + DB 迁移工具 | 基础设施本地运行 | `docker-compose up` + `drizzle-kit push` |
| D5 | 创建 @nexus/providers + Anthropic Provider | 流式 LLM 调用 | 单独跑通一次流式对话 |
| D6-7 | 创建 @nexus/kernel + query-loop 核心 | 推理循环实现 | 单测：单轮对话 + 多轮工具调用 |
| D8 | 流式事件协议 + AgentStreamEvent | stream-events.ts | 事件流可序列化 |
| D9-10 | api-gateway 骨架 + SSE 流式端点 | POST /agent-runs | curl 调用返回 SSE 流 |

**Sprint 1 交付物**：
- [x] Monorepo 编译构建通过
- [x] 本地基础设施一键启动
- [x] 通过 API 提交任务，获得 LLM 流式响应
- [x] 单轮对话 E2E 通路打通

---

### Sprint 2（Week 3-4）：Control Plane + Tool Gateway

**目标**：AgentRun 全生命周期管理 + 工具调用链路

| 天 | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| D1-2 | agent-registry 数据库表 + CRUD | 注册 Agent 定义 | API 注册/查询 Agent |
| D3-4 | agent-run 状态机 + run-manager | 状态流转 + DB 持久化 | 状态流转单测全部通过 |
| D5-6 | tool-gateway 骨架 + pre/post pipeline | 权限检查 + 审计记录 | 工具调用被正确拦截/放行 |
| D7 | tool-registry + internal-sdk 适配器 | 内部工具注册 | 注册 3 个示例工具并成功调用 |
| D8 | approval-engine 基础版 | R3+ 工具触发审批 | 高风险工具调用被暂停等待审批 |
| D9 | budget-manager 基础版 | Token 追踪 + 成本计算 | 预算耗尽时 AgentRun 停止 |
| D10 | audit-engine + 审计日志写入 | 全量审计记录 | 每次工具调用产生审计日志 |

**Sprint 2 交付物**：
- [x] Agent 注册和版本管理
- [x] AgentRun 创建/运行/完成/失败全生命周期
- [x] 工具调用通过 Gateway 执行（含权限检查和审计）
- [x] 高风险操作触发审批等待

---

### Sprint 3（Week 5-6）：上下文引擎 + Phase Bridge + 可观测

**目标**：四级 Compact + 事件总线 + 链路追踪

| 天 | 任务 | 产出 | 验收标准 |
|---|------|------|---------|
| D1-2 | prompt-assembler 六层组装 | System Prompt 分层组装 | Prompt 输出包含全部 6 层 |
| D3 | env-injector 冷启动注射 | 环境快照注入 | 启动时并发收集 < 500ms |
| D4-5 | compact-engine 四级级联 | L1 + L2 + L4 实现 | 各级按阈值正确触发 |
| D6 | tool-result-budget 截断器 | 超长结果安全截断 | > 4000 token 结果被截断 |
| D7-8 | phase-bridge + Redis Streams | 事件发布/订阅 + 幂等 | 跨 Phase 事件可靠投递 |
| D9 | OpenTelemetry + Pino 集成 | 分布式链路 + 结构化日志 | Trace 串联完整 AgentRun 链路 |
| D10 | checkpoint-manager + 多卡点落盘 | Checkpoint 持久化 | 中断后可从 Checkpoint 恢复 |

**Sprint 3 交付物**：
- [x] System Prompt 按六层结构组装
- [x] 上下文防爆四级级联引擎生效
- [x] Phase Bridge 事件总线打通
- [x] OpenTelemetry 链路追踪串联完整调用链
- [x] Checkpoint 持久化和恢复

---

## 八、关键依赖安装命令

```bash
# 初始化 monorepo
mkdir nexus && cd nexus
pnpm init
mkdir -p packages/{shared,kernel,control-plane,tool-gateway,memory,guardrails,providers,phase-bridge,phase-intent,infra}
mkdir -p apps/{api-gateway,cli}

# 根依赖
pnpm add -Dw typescript turbo @types/node vitest eslint prettier

# @nexus/shared
cd packages/shared
pnpm add zod json-schema ulid
pnpm add -D typescript

# @nexus/infra
cd ../infra
pnpm add drizzle-orm postgres pino ioredis @opentelemetry/api @opentelemetry/sdk-node zod dotenv
pnpm add -D drizzle-kit typescript

# @nexus/providers
cd ../providers
pnpm add @anthropic-ai/sdk openai
pnpm add -D typescript

# @nexus/kernel
cd ../kernel
pnpm add @nexus/shared @nexus/providers @nexus/infra
pnpm add -D typescript vitest

# @nexus/tool-gateway
cd ../tool-gateway
pnpm add @nexus/shared @nexus/infra zod
pnpm add -D typescript vitest

# @nexus/control-plane
cd ../control-plane
pnpm add @nexus/shared @nexus/infra bullmq
pnpm add -D typescript vitest

# @nexus/memory
cd ../memory
pnpm add @nexus/shared @nexus/infra @qdrant/js-client-rest
pnpm add -D typescript vitest

# @nexus/phase-bridge
cd ../phase-bridge
pnpm add @nexus/shared @nexus/infra ioredis
pnpm add -D typescript vitest

# apps/api-gateway
cd ../../apps/api-gateway
pnpm add fastify @fastify/websocket @fastify/cors @fastify/rate-limit zod
pnpm add @nexus/shared @nexus/kernel @nexus/control-plane @nexus/tool-gateway @nexus/infra
pnpm add -D typescript
```

---

## 九、验证检查清单

### Phase 0 完成后必须通过的验证项

```text
■ 工程基础
  □ pnpm install 零错误
  □ turbo build 全包编译通过
  □ turbo test 全部单测通过
  □ turbo lint 零 error
  □ docker-compose up 一键启动全部基础设施
  □ drizzle-kit push 数据库迁移成功

■ 核心链路
  □ POST /api/v1/agent-runs → SSE 流返回 text_delta 事件
  □ 工具调用触发 tool_use_start → tool_use_result 事件
  □ R3 风险工具触发 approval_required 事件
  □ 审批通过后 AgentRun 恢复执行
  □ 预算耗尽时 AgentRun 正确停止

■ 韧性
  □ 主模型不可用时自动降级到 fallbackModel
  □ 工具执行超时后错误信息回填模型自修复
  □ AgentRun 中断后可从 Checkpoint 恢复
  □ Compact 按级联顺序正确触发

■ 可观测
  □ Trace 串联：API 请求 → AgentRun → 工具调用 → LLM 调用
  □ 审计日志记录每次工具调用和决策
  □ Prometheus 指标可在 Grafana 查看
```

---

## 十、文档体系总览

```text
本文档（技术落地蓝图）
  │
  ├── 依赖 → nexus-enterprise-agent-middleware-complete-solution.md（架构方案）
  │         提供：业务场景、三阶段目标、Agent 定义、事件契约、验收指标
  │
  ├── 依赖 → nexus-deep-innovation-optimization.md（创新优化）
  │         提供：七大创新机制的设计理念和接口契约
  │
  └── 本文档提供：
      ├── 技术栈版本锁定
      ├── 完整工程目录结构（每个文件的用途）
      ├── 核心模块 TypeScript 代码骨架
      ├── 数据库表结构（Drizzle Schema）
      ├── 基础设施配置（docker-compose / env）
      ├── API 路由与流式输出实现
      ├── Phase 0 逐天实施计划
      ├── 依赖安装命令
      └── 验证检查清单
```

三份文档构成完整的实施链：**为什么做（架构方案）→ 怎么做得更好（创新优化）→ 怎么一步步写代码（本文档）**。
