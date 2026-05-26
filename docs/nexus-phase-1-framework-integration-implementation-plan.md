# Nexus Phase 1 实现计划：框架主体与企业系统接入

> **来源蓝图**: `docs/nexus-enterprise-agent-middleware-complete-solution.md`  
> **阶段定位**: Phase 1 先构建 Nexus 主体框架，再以项目管理系统作为首个业务接入验证场景。  
> **交付原则**: 框架先行、业务填充、能力包化、MCP/Skill CLI 优先、Phase 独立运行。

---

## 阶段目标

Phase 1 不是单纯实现"项目管理 Agent"，而是交付 Nexus 的第一版可运行主体框架，使后续任意企业成熟系统和第三方系统都能通过统一接入模型进入 Nexus。

本阶段完成后，Nexus 应具备：

- 统一 Gateway：HTTP、WebSocket、CLI、Bot Webhook 的协议归一、签名、去重、身份映射、限流。
- Agent Harness：Query Loop、Resilient Loop、State Graph Engine、Delegate Engine、Lifecycle Hooks、Checkpoint、Compact L1-L3、Environment Injector、SessionShadow。
- Control Plane：Agent Registry、Run Manager、Approval、Policy、Budget、Audit、Scheduler、IContextPolicy、IModelRouter、IRetryPolicy。
- Tool Gateway：`buildTool`、MCP/REST Adapter、工具风险治理、工具结果预算、环境回填。
- 能力包体系：CapabilityPackManifest、Pack 生命周期、灰度、启停、日落补偿能力。
- 流式协议：AgentStreamEvent 联合类型、IAgentStreamBroker 端口、WebSocket 流式推送。
- 通用接入底座：MCP Server 脚手架、Connector Pack、Skill CLI、第三方系统凭据与健康检查。
- Phase 1 业务验证：项目管理系统作为首个业务能力包，而不是架构边界本身。

---

## 独立运行边界

| 边界 | 规则 |
|------|------|
| Phase 1 对外能力 | 可独立接收用户对话、企业系统事件、Bot 消息，并完成意图理解、任务拆解、系统调用、通知 |
| Phase 1 对 Phase 2/3 依赖 | 不依赖 Phase 2/3 存在 |
| 跨 Phase 协作 | 仅发布事件，不直接调用其他 Phase 函数或写入其他 Phase 数据 |
| 数据边界 | 使用 `packages/phase-intent` 独立业务 Schema，公共运行态数据由 Control Plane 管理 |
| 工具接入 | 第三方系统优先通过 MCP Server 接入，轻量技能与操作模式通过 Skill CLI 管理 |
| 多租户预埋 | 事件信封、数据表、审计记录从 W5 起必须包含 `tenantId`，Phase 1 以单租户模式运行 |

---

## 总体里程碑

| 周期 | 里程碑 | 关键交付 |
|------|--------|---------|
| W1-W2 | Monorepo + Kernel MVP | 包结构、共享契约、Query Loop、Provider、Compact L1、Lifecycle |
| W3-W4 | Control Plane MVP | Agent Registry、Run Manager、Approval、Budget、Policy、Audit、IContextPolicy |
| W5-W6 | Gateway + Infra + Phase Bridge + 流式协议 | API Gateway、PostgreSQL、Redis/BullMQ、Durable Checkpoint、OTel、AgentStreamEvent、tenantId 预埋 |
| W7-W8 | Tool Gateway + Kernel 增强 + Pack 体系 | `buildTool`、MCP/REST Adapter、State Graph、Delegate Engine、Compact L2-L3、SessionShadow、Pack 生命周期 |
| W9-W10 | 通用企业接入框架 | MCP Server 脚手架、Connector Pack、Skill CLI、环境回填 |
| W11-W12 | Phase 1 首个业务包 | PM Connector、需求分析、任务拆解、进度追踪、催办 |
| W13-W14 | 集成验证与灰度 | OERCD 全接口冻结 + MVP 实现、评估套件、控制台 MVP、灰度内测 |

---

## W1-W2：Monorepo 与 Kernel MVP

目标：先实现薄内核，使单个 Agent 可以完成"输入 → 模型推理 → 工具调用 → 结果回填 → 继续推理 → 终止"。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 1.1 | 建立 Monorepo 工程骨架 | `pnpm-workspace.yaml`、`turbo.json`、`tsconfig.base.json`、ESLint flat config | 根目录 |
| 1.2 | 建立 `packages/shared` | `NexusError`、S0 事件信封（含 `tenantId`）、`PhaseId`、错误码、`AgentStreamEvent` 联合类型、公共类型 | `packages/shared` |
| 1.3 | 实现 `IAgentRuntime` 契约 | `start`、`resume`、`cancel`、`invoke`、`stream` | `packages/kernel/query-engine` |
| 1.4 | 实现 Query Loop | 单 Run 内 while 推理环、工具分发、终止判定 | `packages/kernel/query-engine` |
| 1.5 | 实现 Resilient Loop Phase A-D | Pre-Flight、模型降级、工具错误分级、Post-Turn 记账 | `packages/kernel/query-engine` |
| 1.6 | 实现 Lifecycle Hooks | `pre_plan`、`pre_tool`、`post_tool`、`post_sampling`、`on_error`、`on_compact`、`on_checkpoint`、`on_shutdown` 钩子注册与调度 | `packages/kernel/lifecycle` |
| 1.7 | 实现 Compact L1 | Time-Gap Micro Compact，零 LLM 清理旧工具结果 | `packages/kernel/compact` |
| 1.8 | 实现 Checkpoint Snapshot | `post_model_output`、`post_tool_execution`、`periodic_interval` 卡点模型 | `packages/kernel/checkpoint` |
| 1.9 | 实现单 Provider 适配 | Anthropic 或 OpenAI 单 Provider 流式调用和 Tool Calling | `packages/providers` |
| 1.10 | 实现 Prompt Assembler 骨架 | 六层 System Prompt，区分 `stable_prefix` 与 `dynamic_suffix` | `packages/providers` |

验收标准：

- CLI 可触发一次完整 AgentRun。
- Query Loop 不直接修改 AgentRun 状态机，只通过事件或回调通知 Run Manager。
- Compact L1 可在时间间隔场景下生效。
- Provider 失败能进入 Resilient Loop 降级路径。
- `AgentStreamEvent` 联合类型已定义并可在 Query Loop 中 yield。

---

## W3-W4：Control Plane MVP

目标：建立强控制面，集中管理注册、状态、审批、策略、预算和审计。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 2.1 | Agent Registry | Agent 定义注册、Prompt 版本、工具权限声明 | `packages/control-plane/agent-registry` |
| 2.2 | Run Manager | `created → running → waiting_* → succeeded/failed` 状态机 | `packages/control-plane/run-manager` |
| 2.3 | Approval Engine | R2+ 工具审批、审批请求、审批回调、Resume | `packages/control-plane/approval-engine` |
| 2.4 | Policy Engine 基础 | RBAC、Agent 身份、工具权限、数据范围判定 | `packages/control-plane/policy-engine` |
| 2.5 | Budget Manager | Token、成本、时间、步数四维预算与熔断 | `packages/control-plane/budget-manager` |
| 2.6 | Audit Engine | AgentRun、工具调用、审批、预算、错误的结构化审计 | `packages/control-plane/audit-engine` |
| 2.7 | Scheduler | FIFO、Priority、租户并发上限 | `packages/control-plane/scheduler` |
| 2.8 | Intent Router | 意图分类、Phase 路由、Agent 匹配、Fallback Agent | `packages/control-plane/intent-router` |
| 2.9 | Retry Policy | timeout、rate_limit、tool_error、permission_denied 等失败策略 | `packages/control-plane/retry-policy` |
| 2.10 | Model Router | 任务类型、预算、延迟、质量要求驱动模型选择 | `packages/control-plane/model-router` |
| 2.11 | IContextPolicy 端口 + 默认实现 | `full_context`、`sliding_window`、`summary_prefix` 三种策略 | `packages/control-plane/context-policy` |

验收标准：

- Agent 可通过定义文件注册并被 Intent Router 选中。
- R2+ 工具调用必须进入审批流程。
- 预算耗尽进入 `waiting_budget`，预算补充后可从 Checkpoint 恢复。
- 审计链路覆盖每次工具调用和状态转移。
- IContextPolicy 可根据上下文占比自动选择策略。

---

## W5-W6：Gateway、基础设施、Phase Bridge 与流式协议

目标：完成运行所需基础设施和统一入口，建立流式事件推送协议，使 Nexus 可以作为服务运行。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 3.1 | PostgreSQL + Drizzle Schema | AgentRun、Checkpoint、AuditLog、AgentDefinition、ApprovalRequest（所有表含 `tenantId`） | `packages/infra` |
| 3.2 | Redis 集成 | 去重、限流、Session 缓存、BullMQ 后端 | `packages/infra` |
| 3.3 | Durable Checkpoint Outbox | `enqueue`、`forceFlush`、重试、恢复校验 | `packages/kernel/checkpoint` |
| 3.4 | BullMQ 队列 | Scheduler 队列、OERCD 队列、异步审计、SessionShadow | `packages/infra` |
| 3.5 | Phase Bridge MVP | `PhaseBridgeEvent`（含 `tenantId`、`idempotencyKey`、`causationId`）、topic 广播、幂等键 | `packages/shared/events` |
| 3.6 | API Gateway | Fastify HTTP、WebSocket、统一响应、超时和异步任务 ID | `apps/api-gateway` |
| 3.7 | Message Router | 协议归一、签名验证、消息去重、身份映射、限流 | `apps/api-gateway` |
| 3.8 | IAgentStreamBroker 端口 + MVP 实现 | `publish`、`subscribe`、`ack`、`replay`；WebSocket 向客户端推送流式事件；基础 `sequence` 递增 | `packages/observability` + `apps/api-gateway` |
| 3.9 | CLI MVP | 发起 AgentRun、查看状态、审批、取消、恢复 | `apps/cli` |
| 3.10 | Observability MVP | OpenTelemetry Trace、基础 Metrics、结构化日志 | `packages/observability` |
| 3.11 | 本地开发环境 | Docker Compose：PostgreSQL、Redis、Qdrant 可选 | `docker/` |

验收标准：

- HTTP/WS/CLI 都能创建 AgentRun。
- Phase Bridge 可发布和消费 `task.created`、`task.assigned_to_ai`、`notification.requested`。
- 已 `enqueue` 或 `forceFlush` 的 Checkpoint 在进程重启后可恢复。
- WebSocket 客户端可实时接收 `AgentStreamEvent`（text_delta、tool_use_start/result、checkpoint 等）。
- 所有数据表和事件信封包含 `tenantId`。

---

## W7-W8：Tool Gateway、Kernel 增强与能力包体系

目标：交付可插拔能力包与统一工具接入；同时完成 Kernel 的 State Graph、Delegate Engine、Compact L2-L3 和 SessionShadow，使后续业务只需注册 Pack 与工具。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 4.1 | CapabilityPackManifest | Pack ID、版本、Phase、依赖、能力声明、生命周期、健康检查 | `packages/control-plane/agent-registry` |
| 4.2 | Pack 生命周期 | `published → installed → enabled → disabled → uninstalled` | `packages/control-plane/agent-registry` |
| 4.3 | Pack 依赖解析 | `requirements`、`provisions`、`kernelCompatibility` 校验 | `packages/control-plane/agent-registry` |
| 4.4 | `buildTool` 工厂 | Fail-Closed 默认值、风险等级、工具安全特征 | `packages/tool-gateway` |
| 4.5 | Tool Gateway Pipeline | Schema、权限、风险、审批、脱敏、执行、审计、截断 | `packages/tool-gateway` |
| 4.6 | MCP Adapter | MCP 工具发现、连接、调用、健康检查、连接池 | `packages/tool-gateway/protocol-adapters` |
| 4.7 | REST/OpenAPI Adapter | OpenAPI 转工具定义，REST 调用标准化 | `packages/tool-gateway/protocol-adapters` |
| 4.8 | Tool Result Budget | 结构化数据分页、文本首尾保留、截断提示 | `packages/tool-gateway` |
| 4.9 | 工具自愈矩阵 | 超时、Schema 错误、权限拒绝、不可恢复错误分级处理 | `packages/tool-gateway` |
| 4.10 | Sunset Engine MVP | L4 补偿能力注册、版本条件日落 | `packages/control-plane/sunset-engine` |
| 4.11 | State Graph Engine | `IGraphNode`、`IGraphEdge`、图执行引擎、中断/恢复、幂等键、补偿声明 | `packages/kernel/state-graph` |
| 4.12 | Delegate Engine 端口 | 子 Agent 派生接口、权限继承锁死、预算分割、结果收集 | `packages/kernel/delegate` |
| 4.13 | Compact L2 (Evidence-Aware) | 证据标记启发式规则、EvidenceRegistry、证据 TTL/容量治理 | `packages/kernel/compact` |
| 4.14 | Compact L3 (Session Graft) | 读取 SessionShadow 摘要、嫁接替换、证据保留 | `packages/kernel/compact` |
| 4.15 | SessionShadow | PostSampling 异步摘要、Redis CAS 幂等写入、反膨胀机制 | `packages/memory/session-shadow.ts` |

验收标准：

- 任意 MCP Server 可被 Tool Gateway 发现、注册和调用。
- 未声明安全特征的工具按最严格策略处理。
- Pack 可独立启用、禁用、升级和回滚。
- State Graph 可定义多节点工作流并在任意节点中断/恢复。
- Delegate Engine 可派生子 Agent 并锁死权限范围。
- Compact L2 正确标记和保留证据；L3 可嫁接 SessionShadow 摘要。
- SessionShadow 在 PostSampling 后异步更新且不阻塞主循环。

---

## W9-W10：通用企业系统接入框架

目标：让成熟企业系统和第三方系统可以通过 MCP 与 Skill CLI 快速接入，避免 Phase 1 被项目管理单场景锁死。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 5.1 | MCP Server 脚手架 | `create-nexus-mcp`，生成工具定义、配置、测试、Docker 模板 | `packages/infra/create-mcp` |
| 5.2 | MCP 模板工程 | 标准 `mcp-servers/_template`，含 `manifest.yaml` 和健康检查 | `mcp-servers/_template` |
| 5.3 | Connector Pack 协议 | `ConnectorDefinition`、凭据声明、rateLimit、数据密级 | `packages/tool-gateway` |
| 5.4 | Connector 注册 API | 注册、启用、禁用、健康检查、凭据绑定 | `apps/api-gateway` |
| 5.5 | Skill CLI | 技能创建、校验、发布、版本、回滚、本地测试 | `apps/cli` |
| 5.6 | Skill Store MVP | 文件系统 + SQLite FTS5，L0 摘要索引 | `packages/memory/skill-store.ts` |
| 5.7 | Environment Injector | 冷启动环境快照，工作目录、权限、外部系统状态 | `packages/kernel/environment` |
| 5.8 | Context Backfiller | 工具执行后环境 patch、最终一致回填 | `packages/kernel/environment` |

接入模式：

| 模式 | 适用对象 | 产物 |
|------|----------|------|
| MCP Server | Jira、禅道、飞书、钉钉、OA、GitLab、Confluence 等系统 | 工具集合 + Connector Pack |
| REST/OpenAPI Adapter | 已有标准 API 的企业服务 | 自动生成 ToolDefinition |
| Skill CLI | 操作经验、流程模板、Agent 技能、业务 SOP | `skill.md` / `skill.yaml` |
| Bot Channel | 飞书、钉钉、企业微信 | Gateway Channel Adapter |

验收标准：

- `create-nexus-mcp demo-system` 可生成可运行 MCP Server。
- Skill CLI 可创建、校验、发布技能。
- 新系统接入不需要修改 Kernel。
- Connector 的启停、健康、凭据、权限都由 Control Plane 管理。

---

## W11-W12：Phase 1 首个业务包，项目管理接入验证

目标：以项目管理能力包验证框架接入能力。项目管理是第一个业务场景，不是 Phase 1 的唯一目标。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 6.1 | PM MCP Server | `project.*`、`task.*`、`milestone.*`、`risk.*`、`report.*` | `mcp-servers/pm-tools` |
| 6.2 | RequirementAnalystAgent | 需求分析、澄清、结构化需求 | `packages/phase-intent` |
| 6.3 | TaskPlannerAgent | WBS 拆解、关键路径、工时估算 | `packages/phase-intent` |
| 6.4 | ProjectDoctorAgent | 项目健康诊断、风险识别 | `packages/phase-intent` |
| 6.5 | ProgressTrackerAgent | 进度监控、偏差分析、预测 | `packages/phase-intent` |
| 6.6 | ReminderAgent | 智能催办、升级规则、通知策略 | `packages/phase-intent` |
| 6.7 | EstimationAgent | 历史数据回归、工时估算 | `packages/phase-intent` |
| 6.8 | 通知工具 MVP | `notification.send` 抽象工具，预留多平台实现 | `mcp-servers/notification` |
| 6.9 | 飞书 Bot 首个入口 | Webhook 签名、消息解析、身份映射 | `apps/api-gateway/channels` |
| 6.10 | Phase 1 Pack Manifest | Agent、Tools、Skills、Policy、事件订阅声明 | `packages/phase-intent/manifest.yaml` |

验收标准：

- 用户可用自然语言完成需求分析、任务拆解、任务分配、催办。
- PM 工具以 MCP Server 独立运行。
- Phase 1 发布 `task.assigned_to_ai` 事件后，不要求 Phase 2 必须存在。

---

## W13-W14：集成验证与灰度内测

目标：完成 Phase 1 可用闭环，冻结 OERCD 全部接口，为 Phase 2/3 复用框架能力打基础。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 7.1 | OERCD 接口全量冻结 | Observe、Execute、Reflect、Crystallize、Distribute 五阶段接口定义完成，标注 @stability S1 | `packages/kernel/oercd` |
| 7.2 | OERCD Observe/Execute 实现 | 任务开始检索技能、执行轨迹 JSONL | `packages/kernel/oercd` |
| 7.3 | OERCD Reflect MVP | 工具调用 >=5 的任务触发异步反思 | `packages/kernel/oercd` |
| 7.4 | Compact L4 兜底 | Legacy Full Compact，保留 EvidenceRegistry 引用 | `packages/kernel/compact` |
| 7.5 | Graceful Shutdown MVP | SIGTERM 三阶段排水、活跃 Run 跟踪 | `packages/kernel/lifecycle` |
| 7.6 | Guardrails MVP | Prompt 注入检测、输出脱敏、数据分级标记 | `packages/guardrails` |
| 7.7 | 管理控制台 MVP | AgentRun、审批、审计、预算、Pack 启停 | `apps/console` |
| 7.8 | E2E 评估套件 | Mock LLM、录制回放、审批/预算/恢复场景 | `evals/` |
| 7.9 | 灰度发布 | Feature Flag、10% 内测流量、告警阈值 | 运维 |

OERCD 接口冻结说明：

```
Phase 1 冻结全部 5 阶段接口（@stability S1）：
  ├── IObservePhase     — 技能检索 + 情景记忆匹配
  ├── IExecutePhase     — 执行轨迹记录
  ├── IReflectPhase     — 效率分析 + 最优路径提取
  ├── ICrystallizePhase — 技能文件结构化生成（Phase 2 填充实现）
  └── IDistributePhase  — 知识分发 + 审核流程（Phase 3 填充实现）

原则：L1 接口在 Phase 1 冻结后不再变更，后续 Phase 只填充实现逻辑。
```

Phase 1 验收：

| 指标 | MVP 目标 |
|------|----------|
| 需求拆解准确率 | >= 70% |
| 端到端响应时间 | P95 < 90s |
| Checkpoint 恢复成功率 | >= 95% |
| 审计链路完整率 | 100% |
| 前缀缓存命中率 | >= 70% |
| 新企业系统接入 | 可通过 MCP 脚手架 + Connector Pack 完成 |
| 流式推送可用 | WebSocket 客户端可实时接收全类型事件 |

---

## Phase 1 交付后的框架能力矩阵

| 能力 | 状态 | 用于后续 Phase |
|------|------|----------------|
| Query Loop / Resilient Loop | ✅ 完整 | Phase 2/3 复用 |
| State Graph Engine | ✅ 完整 | Phase 2 定义工作流图 |
| Delegate Engine | ✅ 端口完整 | Phase 2 实装 Supervisor/Workers |
| Run Manager 状态机 | ✅ 完整 | Phase 2/3 复用 |
| Approval / Policy / Budget / Audit | ✅ MVP 完整 | Phase 2/3 复用 |
| IContextPolicy | ✅ 端口 + 默认实现 | Phase 2 补充 Phase-Aware 策略 |
| Tool Gateway + MCP Adapter | ✅ 完整 | Phase 2/3 所有工具接入 |
| Capability Pack | ✅ 完整 | Phase 2/3 注册业务能力 |
| Phase Bridge | ✅ 完整（含 tenantId） | Phase 间事件协作 |
| AgentStreamEvent / IAgentStreamBroker | ✅ 完整 | Phase 2 长任务进度推送 |
| Skill CLI | ✅ 完整 | 各 Phase 技能沉淀 |
| SessionShadow / Compact L1-L4 | ✅ 完整 | 长任务上下文管理 |
| OERCD | ✅ 接口冻结 + O/E/R MVP | Phase 2 填充 Crystallize，Phase 3 填充 Distribute |
| Guardrails | 🔶 MVP | Phase 2/3 强化 |
| Observability | 🔶 MVP（Trace+Metrics+Stream） | Phase 2 补充热力图 MVP |

---

## Phase 1 风险与控制

| 风险 | 控制措施 |
|------|----------|
| 框架范围过大导致延期 | W1-W6 只做最小可运行闭环，W7-W8 集中补 Kernel 增强 |
| 项目管理场景绑死 Phase 1 | 所有 PM 能力必须以 Pack + MCP 接入，不允许写入 Kernel |
| MCP 接入质量不一致 | 统一脚手架、测试模板、健康检查、权限声明 |
| Skill 污染 | Skill CLI 必须校验 schema、证据 ID、数据密级 |
| 审批过重影响体验 | R0/R1 自动执行，R2+ 按策略审批，RX 禁止执行 |
| 单租户假设扩散 | W5 起所有数据和事件预埋 tenantId，补偿层 `SingleTenantGuard` 标注日落 |
| OERCD 接口后期变更 | Phase 1 W13 冻结全部接口，后续只填充实现 |
| 流式协议缺失影响体验 | W5-W6 交付 AgentStreamEvent + WebSocket 推送 MVP |
