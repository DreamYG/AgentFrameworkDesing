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

---

## 实际运行业务流程（实现注释）

> 本章对照当前代码实现，描述用户消息从入口到响应的完整链路与意图识别细节。文档与代码同步维护。

### 1. 单一业务入口

业务请求只有一个 HTTP 入口和一个 Bot Webhook 入口；其余路由（runs/audit/packs/connectors/agents/health 等）属于控制面与运维面，不参与业务流。

| 入口 | 路由 | 文件 |
|------|------|------|
| HTTP 消息 | `POST /api/v1/messages` | `apps/api-gateway/src/server.ts` |
| 飞书 Bot | `POST /webhooks/feishu` | `apps/api-gateway/src/channels/feishu.ts` |
| 流式推送 | `GET /ws/stream/:runId` | `apps/api-gateway/src/server.ts` |

`POST /webhooks/feishu` 经 `FeishuChannelAdapter.normalize()` 归一化为 `NexusMessage` 后，与 HTTP 路径共用同一 `messageHandler`。

### 2. 意图识别实现

意图识别采用 **LLM 优先 + 关键词 fallback** 两层策略，端口与实现分离以遵守依赖方向。

#### 2.1 端口与配置

- 端口：`LLMIntentClassifier` / `IntentCache` / `IntentRouterMetricEvent`（`packages/control-plane/src/intent-router/index.ts`）
- 实现：`LLMIntentClassifierImpl`（`apps/api-gateway/src/intent/llm-classifier.ts`），内含 few-shot 校准、modelTier 提示、tenantId 透传、成本敏感开关
- 路由器：`IntentRouter.route()`，异步，签名 `(input: string, context?: { phase?: PhaseId; tenantId?: string }) => Promise<IntentClassification>`
- 决策来源 8 种细分 source：`llm` / `llm_cache_hit` / `llm_low_confidence` / `llm_unknown_agent` / `llm_no_decision` / `llm_disabled` / `keyword` / `fallback`
- 配置（全部可经 env 覆盖）：

| 变量 | 默认 | 作用 |
|------|------|------|
| `NEXUS_INTENT_MODEL` | 按 Provider 自动选 `gpt-4o-mini` / `claude-haiku-4-5` | 小模型分类器 |
| `NEXUS_INTENT_CONFIDENCE_THRESHOLD` | `0.5` | LLM 决策被采纳的最低信心 |
| `NEXUS_INTENT_CLARIFICATION_THRESHOLD` | `0.2`（bootstrap 默认 `0` 关闭） | 信心 < 此 + 关键词无命中 → 短路 + 要求用户澄清 |
| `NEXUS_INTENT_TIMEOUT_MS` | `8000` | 单次分类硬超时（AbortController） |
| `NEXUS_INTENT_CACHE_TTL_SEC` | `60` | 同 tenantId + 文本哈希缓存秒数（Redis） |
| `NEXUS_INTENT_COST_SENSITIVE` | `false` | 同分时优先 low-tier Agent（haiku/mini） |
| `NEXUS_INTENT_EXECUTION_KEYWORDS` | 内置中英文词表 | 自定义 execution phase 关键词 |
| `NEXUS_INTENT_CONNECTION_KEYWORDS` | 内置中英文词表 | 自定义 connection phase 关键词 |

#### 2.2 候选 Agent 构造

`IntentRouter` 从 `AgentRegistry` 取所有 `enabled` 的 Agent（如 `context.phase` 提供则进一步按 phase 过滤），构造候选项 `{ id, phase, description, capabilities }` 传给 LLM。

候选示例（Phase 1 默认 7 个 Agent，包含 1 个通用 + 6 个 PM 专用，所有 Agent 默认开放 `ai.*` 通用工具）：

```text
- id=general-assistant;   phase=intent; 描述=通用 AI 助手（对话/检索/文档/数据/生图）; 能力=ai.chat, ai.web.search, ai.document.summarize, ai.document.extract, ai.document.qa, ai.data.transform, ai.skill.search, ai.image.generate
- id=requirement-analyst; phase=intent; 描述=需求分析与澄清、结构化输出; 能力=doc.read, project.query + ai.*
- id=task-planner;        phase=intent; 描述=WBS 拆解 + 关键路径 + 工时估算; 能力=task.decompose, task.assign + ai.*
- id=project-doctor;      phase=intent; 描述=项目健康诊断 + 风险识别;       能力=project.query, risk.identify + ai.*
- id=progress-tracker;    phase=intent; 描述=进度监控 + 偏差分析 + 预测;    能力=task.query, milestone.query + ai.*
- id=reminder;            phase=intent; 描述=智能催办（策略矩阵驱动）;       能力=notification.send, task.query + ai.*
- id=estimation;          phase=intent; 描述=AI 工时估算（历史数据回归）;     能力=history.query, task.estimate + ai.*
```

> `ai.*` 简写指 `GENERAL_AI_TOOLS = [ai.chat, ai.web.search, ai.document.summarize, ai.document.extract, ai.document.qa, ai.data.transform, ai.skill.search]`，定义见 `packages/phase-intent/src/agents/index.ts`。`general-assistant` 额外开放 `ai.image.generate`。
>
> Fallback Agent：注册首位的 `general-assistant`，意图无法匹配时由通用助手承接（而不是把所有未知请求都塞给某个 PM Agent）。

#### 2.3 LLM 提示与解析

System Prompt：

> 你是 Nexus 平台的意图分类器。阅读用户消息和候选 Agent 描述，挑选最匹配的 Agent，并返回 0-1 的信心分。只输出一个 JSON 对象，不要额外解释、不要 Markdown 代码块。

User Prompt 末尾固定输出格式：

```json
{"agentId":"<候选 id 之一>","phase":"intent|execution|connection","confidence":<0-1>,"reason":"<一句话>"}
```

调用参数：`temperature: 0`、`maxTokens: 256`、`AbortController(8s timeout)`。

解析时使用正则 `/\{[\s\S]*\}/` 提取首个 JSON 块，校验 `agentId` 必须在候选列表中，`confidence` 强制 clamp 到 `[0, 1]`。

#### 2.4 路由决策表（8 种 source）

决策优先级：**缓存命中 → LLM 高信心 → 关键词 → fallback**。任一步降级都有专门 source 可观测。

| 触发条件 | `source` | 后续动作 |
|----------|----------|----------|
| Redis cache 命中相同 tenantId+text | `llm_cache_hit` | 跳过 LLM，直接用缓存决策 |
| LLM 输出且信心 ≥ threshold 且 agentId 在候选 | `llm` | 采纳 LLM；异步写 cache |
| LLM 输出但信心 < threshold | `llm_low_confidence` | 回落关键词，`reason` 标注上游 |
| LLM 输出 agentId 不在 enabled 候选 | `llm_unknown_agent` | 回落关键词 |
| LLM 抛错 / 超时 / JSON 解析失败 | `llm_no_decision` | 回落关键词 |
| 未注入 LLMIntentClassifier（无 API key） | `llm_disabled` | 直接关键词 |
| 关键词命中 Agent | `keyword` | 用关键词最匹配 Agent |
| 关键词无命中且无 enabled 候选 | `fallback` | 用 `fallbackAgentId`；信心 < `clarificationThreshold` 时设 `requiresClarification=true` |

短路：`requiresClarification=true` 时 `bootstrap.onMessage` **不创建 Run**，直接返回友好提示文案让用户重述（产品行为，可关闭）。

#### 2.5 缓存 + 观测指标

- **缓存**：key = `intent:{tenantId}:{hash(text)}`，TTL=60s（可配）。仅在 LLM 命中 `source='llm'` 时回写；fallback/keyword 路径不缓存（容易导致错误决策被复用）。
- **指标**：`onMetric` 回调由 bootstrap 注入，每次 route 产生一条 `intent.metric` 结构化日志（含 `source / latencyMs / confidence / cacheHit / tenantId / agentId`）。线上可按 `source` group by 统计 LLM 命中率、平均延迟、cache 命中率。
- **决策日志**：每次 route 后 bootstrap 打印 `intent.classified`（含 messageId / source / confidence / intentType / requiresClarification / reason），是排查"为什么选了某个 Agent"的入口。Run 创建后另有 `control_plane.run.created` 关联 runId。

#### 2.6 关键词 fallback 算法

`classifyPhase`：按关键词命中决定 phase（`execution` / `connection` / `intent`，默认 `intent`）。关键词列表可经 env 覆盖。

`findBestAgent`：把 `agent.id + name + description + allowedTools` 拼成 haystack，用消息 token 计数命中次数排序取第一名。

> **Phase 1 边界**：bootstrap 不再硬编码 `phase: 'intent'`——`IntentRouter` 现在自动识别 phase。但 `phase-intent-pack` 只注册了 intent phase 的 Agent，所以 execution/connection 命中时 candidates 为空 → 走 `llm_disabled` 路径 → keyword fallback → fallback Agent（general-assistant）。等 Phase 2/3 注册自家 Agent 后无需改 router 自动生效。

#### 2.7 选中 Agent 后的下游影响

`bootstrap.ts` 在 `runtime.start()` 的 `context.metadata` 中带上 `agentId` 与 `modelPreference`，由 `AgentRuntimeImpl.modelResolver` 在每一轮推理动态切换：

| 影响维度 | 数据来源 | 实现 |
|----------|----------|------|
| System Prompt | `selectedAgent.promptTemplate` | `PromptAssembler.freeze().assemble()` |
| 模型 | `selectedAgent.modelPreference` | `ProviderRouter` 按 `claude-*` / `gpt-*` / `local-*` 前缀路由 |
| 工具白名单 | `selectedAgent.allowedTools` | `PolicyEngine.registerAgentTools()` 在 Pipeline Stage 2 拒绝越权工具 |

### 3. 端到端业务流程

完整流程图（业务路径 + 控制面副作用 + 错误/暂停分支）：

```mermaid
flowchart TD
  Client[Client/HTTP/WS/Bot]
  Gateway[GatewayServer.handleMessage]
  HMAC[HMAC verifyHmac]
  Router[MessageRouter.route]
  Guard[InputGuardrail.scan]
  Dedup[Redis SETNX dedup]
  RateLimit[Redis ratelimit]
  Handler[bootstrap.onMessage]
  Flag[FeatureFlagRegistry.isEnabled]
  Intent[IntentRouter.route]
  LLM["LLMIntentClassifier.classify (gpt-4o-mini / haiku, 8s)"]
  Keyword[keywordRoute fallback]
  Select[registry.get selectedAgent]
  Create[Orchestrator.createRun]
  Persist[AgentRunsRepository.create]
  Publish[PhaseBridge.publish task.created]
  Start[AgentRuntimeImpl.start]
  Hook1[hook pre_plan EnvironmentInjector]
  Loop[QueryLoop.run]
  Provider[ProviderRouter.chat]
  Tools[ToolGatewayPipeline.execute]
  Audit[AuditEngine.flush PG]
  Hook2[hook post_sampling SessionShadow]
  Hook3[hook post_complete OERCDEngine]
  Stream[InMemoryAgentStreamBroker.publishEvent]
  WS[WS /ws/stream/runId]
  Pause[control.shouldPause]
  Approve[/api/v1/runs/:id/approve]

  Client --> Gateway --> HMAC --> Router
  Router --> Guard --> Dedup --> RateLimit --> Handler
  Handler --> Flag --> Intent
  Intent --> LLM
  LLM -->|confidence >= threshold| Select
  LLM -->|fail / low / parse error| Keyword --> Select
  Select --> Create --> Persist
  Create --> Publish
  Create --> Start
  Start --> Hook1 --> Loop
  Loop --> Provider
  Loop --> Tools
  Loop --> Hook2
  Loop --> Audit
  Tools --> Pause
  Pause -->|requires_approval| Approve --> Loop
  Loop --> Hook3
  Loop --> Stream --> WS
```

各阶段职责与代码位置：

| 阶段 | 职责 | 代码位置 |
|------|------|----------|
| 1. 入口接收 | Fastify 路由收 HTTP；飞书 webhook 归一化为 `NexusMessage` | `apps/api-gateway/src/server.ts handleMessage` |
| 2. 签名校验 | 可选 HMAC（生产建议开） | `server.ts verifyHmac` |
| 3. 协议归一化 | 输入护栏、去重、身份、限流（Redis 后端可选） | `apps/api-gateway/src/middleware/message-router.ts` |
| 4. 灰度判定 | `FeatureFlagRegistry` 按用户 ID 计算 rollout 百分比 | `packages/control-plane/src/feature-flag/index.ts` |
| 5. 意图识别 | LLM 分类 → 关键词 fallback | `packages/control-plane/src/intent-router/index.ts` + `apps/api-gateway/src/intent/llm-classifier.ts` |
| 6. Run 创建 | `RunManager.create` + `BudgetManager.new` + `auditEngine.record('run.created')` | `packages/control-plane/src/orchestrator/index.ts createRun` |
| 7. 持久化 | `AgentRunsRepository.create()` 落 Postgres | `apps/api-gateway/src/bootstrap.ts onMessage` |
| 8. 业务事件 | 发布 `task.created` 到 `PhaseBridge`（生产替换为 BullMQ） | `packages/shared/src/events/phase-bridge.ts` |
| 9. 进入 Runtime | `AgentRuntimeImpl.start` 注入 `metadata.agentId` 与 `modelPreference` | `packages/kernel/src/query-engine/agent-runtime.ts` |
| 10. 推理环 | `QueryLoop.run`：Pre-Flight → LLM → 工具 → Compact → Checkpoint | `packages/kernel/src/query-engine/query-loop.ts` |
| 11. LLM 调用 | `ProviderRouter` 按 model 前缀分发到 Anthropic / OpenAI / 本地 | `packages/providers/src/provider-router.ts` |
| 12. 工具调用 | `ToolGatewayPipeline` 9 阶段：Schema/权限/风险/审批/脱敏/执行/审计/截断/自愈 | `packages/tool-gateway/src/pipeline.ts` |
| 13. Hook 副作用 | `pre_plan` 收集环境快照、`post_sampling` 异步刷新 `SessionShadow`、`post_complete` 触发 `OERCDEngine.reflect` | `apps/api-gateway/src/bootstrap.ts` |
| 14. 流式推送 | 每个 `AgentStreamEvent` 经 `InMemoryAgentStreamBroker` 转发到 WS 客户端 | `packages/observability/src/stream-broker.ts` + `server.ts streamEvents` |
| 15. 审批暂停 | 工具命中 R2+ 时 `processEvent.shouldPause=true`，`AbortController.abort()` 中断当前 turn，等 `POST /api/v1/runs/:id/approve` 调 `orchestrator.resumeRun` 续推 | `orchestrator/index.ts processEvent / resumeRun` |
| 16. 审计落库 | `auditEngine.flush()` 把内存条目批量写 `auditLogs` 表（生产模式） | `packages/control-plane/src/audit-engine/index.ts` |
| 17. Checkpoint | `CheckpointManager` 在 `post_tool_execution`/`pre_approval_wait`/`periodic` 触发；生产模式经 `CheckpointOutbox` 入 BullMQ 异步写 PG | `packages/kernel/src/checkpoint/*` + `packages/infra/src/checkpoint-outbox.ts` |
| 18. 完成与返回 | `event.type='completed'` → `AgentRunsRepository.complete` → 状态机进入 `succeeded` | `bootstrap.ts onMessage 内联回调` |

### 4. 错误与降级路径

| 场景 | 兜底行为 |
|------|----------|
| LLM 意图分类失败 / 超时 / 解析错误 | 关键词 fallback |
| `selectedAgent` 不在 registry | 使用 `defaultAgent`（第一个注册的 Agent） |
| Provider 主链路失败 | `ResilientLoop.invokeWithFallback` 切到 `fallbackProvider`（若注入） |
| 工具失败 Level 1-3 | `ToolSelfHealing.heal` 把错误回填给模型继续推理 |
| 工具失败 Level 4 | Checkpoint + emit `error`，由 HITL 介入 |
| 工具命中 R2+ | `approval_required` 事件 → `RunManager` 转 `waiting_approval`，审批后 `resumeRun` |
| 预算耗尽 | `budget_exhausted` → `waiting_budget`，调 `POST /budget/refill` 后续推 |
| Run 取消 | `POST /cancel` → `AgentRuntimeImpl.cancel`（abort 对应 controller） |
| 进程 SIGTERM | `GracefulShutdownController.drain` 三阶段：通知 → 等待 → 强制 checkpoint 落盘 |

### 5. 关键观测事件

线上排查时按以下 `msg` 字段过滤即可还原一次完整业务流（结构化 JSON 日志）：

| 阶段 | 日志事件 | 字段 |
|------|---------|------|
| 入口接收 | `gateway.message.accepted` | tenantId, messageId, channel |
| 意图识别 | `intent.routed`（debug 模式） | source, confidence, reason, agentId |
| Run 创建 | `control_plane.run.created` | runId, agentId, correlationId, routeConfidence |
| 工具执行 | `tool.use.started` / `tool.use.finished` / `tool.use.failed` | toolName, toolCallId, durationMs |
| 审批 | `approval.required` / `approval.decision.received` | requestId, toolName, approved |
| Checkpoint | `checkpoint.saved` | checkpointId, turnCount |
| 预算告警 | `budget.warning` / `budget.exhausted` / `budget.refilled` | dimension, usage, limit |
| 暂停 / 取消 / 完成 | `control_plane.run.paused` / `run.cancelled` / `runtime.run.completed` | reason, result |
| 致命错误 | `runtime.event.error` / `runtime.run.failed` | code, message |

启用 `NEXUS_LOG_MODE=debug` 可额外打开工具结果详情、意图分类原因等细粒度字段。

### 6. 通用能力 + 专用能力（Phase 1 默认开放）

Phase 1 平台不仅承接 PM 业务工具调用，也内置一组**与业务系统解耦的通用 AI 工具**，PM 专用 Agent 与通用 Agent 都可调用。这样既保留"PM 专家 Agent"的精度，也满足"通用对话 / 检索 / 文档分析 / 数据处理 / 联网搜索"等开箱即用场景。

#### 6.1 通用工具清单

注册位置：`packages/tool-gateway/src/built-in-ai-tools.ts` → `registerBuiltInAITools(pipeline, options)`，由 `apps/api-gateway/src/main.ts` 在启动时一次性挂入 `ToolGatewayPipeline`。

| 工具 | 能力 | 风险 | 依赖 | 未配置时行为 |
|------|------|------|------|--------------|
| `ai.chat` | 通用对话/解释 | R0 | `ProviderRouter`（必有） | — |
| `ai.web.search` | 联网搜索 | R0（带外部副作用） | `TAVILY_API_KEY` 或 `BRAVE_API_KEY` | 调用即返回 `Web search provider is not configured` |
| `ai.document.summarize` | 文档摘要 | R0 | `ProviderRouter` | — |
| `ai.document.extract` | 文档结构化抽取（JSON / 字段） | R0 | `ProviderRouter` | — |
| `ai.document.qa` | 基于文档回答问题 | R0 | `ProviderRouter` | — |
| `ai.data.transform` | 数据格式/结构转换（JSON ↔ CSV ↔ Markdown 等） | R0 | `ProviderRouter` | — |
| `ai.skill.search` | 本地经验/SOP 检索 | R0 | `SkillStore` | 调用即返回 `Skill search is not configured` |
| `ai.image.generate` | 图像生成（DALL-E 兼容） | R1 | `OpenAIProvider.generateImage` | 调用即返回 `Image generation provider is not configured` |

所有工具都走 `ToolGatewayPipeline` 9 阶段管线（Schema/权限/风险/审批/脱敏/执行/审计/截断/自愈），与 PM 业务工具完全一致。

#### 6.2 通用 Agent 与 PM Agent 的工具白名单

| Agent | 业务工具 | 通用工具白名单 |
|-------|---------|----------------|
| `general-assistant` | — | `GENERAL_AI_TOOLS` + `ai.image.generate`（全开放） |
| `requirement-analyst` | `doc.read`, `project.query` | `GENERAL_AI_TOOLS` |
| `task-planner` | `task.decompose`, `task.assign` | `GENERAL_AI_TOOLS` |
| `project-doctor` | `project.query`, `risk.identify` | `GENERAL_AI_TOOLS` |
| `progress-tracker` | `task.query`, `milestone.query` | `GENERAL_AI_TOOLS` |
| `reminder` | `notification.send`, `task.query` | `GENERAL_AI_TOOLS` |
| `estimation` | `history.query`, `task.estimate` | `GENERAL_AI_TOOLS` |

白名单在 `PolicyEngine.registerAgentTools()`（pipeline Stage 2 `permission_check`）强校验，未授权工具直接拒绝。

#### 6.3 联网搜索 Provider 装配

`apps/api-gateway/src/main.ts → createWebSearchProvider(env)` 按优先级：

1. 若有 `TAVILY_API_KEY` → 走 Tavily API（`POST https://api.tavily.com/search`）
2. 否则若有 `BRAVE_API_KEY` → 走 Brave Search API（`GET https://api.search.brave.com/res/v1/web/search`）
3. 都未配置 → 不注入，`ai.web.search` 工具直接返回错误（fail-closed）

启动日志：

- 启用：`web_search.provider.enabled` `{ provider: tavily | brave }`
- 禁用：`web_search.provider.disabled` `{ reason: set TAVILY_API_KEY or BRAVE_API_KEY }`

#### 6.4 端到端流程示例

| 用户输入 | LLM 意图分类 | 选中 Agent | 典型工具链 |
|----------|--------------|------------|------------|
| "帮我搜下 Drizzle ORM 最新版本" | `agentId=general-assistant, confidence=0.85` | general-assistant | `ai.web.search` → `ai.chat` 汇总 |
| "把这段 JSON 转 CSV" | `agentId=general-assistant, confidence=0.9` | general-assistant | `ai.data.transform` |
| "这份合同关键日期是哪些" | `agentId=general-assistant, confidence=0.8` | general-assistant | `ai.document.extract` |
| "把需求拆成 WBS" | `agentId=task-planner, confidence=0.9` | task-planner | `task.decompose` → `task.assign`（仍可用 `ai.chat` 解释） |
| "项目当前健康度" | `agentId=project-doctor, confidence=0.9` | project-doctor | `project.query` + `risk.identify`（必要时用 `ai.skill.search` 拉相似案例） |
| 无明确业务意图（如打招呼） | LLM 信心不足 → 关键词无命中 | `general-assistant`（fallback） | `ai.chat` |

#### 6.5 与"专用能力"的边界约束

- 通用工具不会绕过 R2 审批：如未来出现 R2+ 的通用工具（例如外发邮件/调用支付），仍走 `ApprovalEngine`。
- 通用工具不会读 PM 业务库：除显式注入的 `SkillStore` 检索回调外，所有通用 AI 工具均无业务数据访问权限，符合 Kernel 与 Control Plane 的依赖方向约束。
- 通用工具产生的所有调用都会经过 `AuditEngine`，与 PM 工具一样可在 `GET /api/v1/audit?runId=...` 查询，符合 Phase 1 验收标准 G3。

### 7. 多 Agent 协作：子 Agent 委托（ai.agent.invoke）

针对"一次用户请求需要跨多个专家 Agent 协同"的场景，Phase 1 提供 Claude Code 风格的子 Agent 委托工具 `ai.agent.invoke`，由通用 Agent 主动调用、专家 Agent 完成子任务后汇总返回，全程同步在一个父 Run 的对话流里完成。

#### 7.1 设计概览

```text
                                          ┌──────────────────────┐
                user → general-assistant ─┤ LLM 决定调 ai.agent.invoke({agentId:task-planner, input:"拆WBS"}) │
                                          └─────────────┬────────┘
                                                        │ (pipeline)
                                ┌───────────────────────▼─────────────────────────┐
                                │ DelegateEngine                                  │
                                │  ├─ 校验委派深度 (默认 maxDepth=3)              │
                                │  └─ ChildRunStarter.start()                     │
                                │       ├─ orchestrator.createRun({childAgentId}) │
                                │       ├─ runtime.start(input, ctx{depth+1, ...})│
                                │       └─ 串行 yield child events 给 DelegateEng │
                                └───────────────────────┬─────────────────────────┘
                                                        │ events
                                ┌───────────────────────▼─────────────────────────┐
                                │ DelegateEngine 聚合 child events, 等 completed   │
                                │  → 返回 { childRunId, success, outputText }     │
                                └───────────────────────┬─────────────────────────┘
                                                        │ ToolResult
                                  general-assistant 把 outputText 写回主对话上下文，继续推理
```

关键端口与实现：
- `IChildRunStarter`（`packages/kernel/src/delegate/index.ts`）— Kernel 层端口
- `DelegateEngine`（同上）— 真实启动子 Run、聚合事件、限递归深度
- `ChildRunStarter` 实现 — bootstrap.ts 内联，注入 orchestrator + runtime + registry + broker
- `ai.agent.invoke` 工具 — `packages/tool-gateway/src/delegate-tool.ts → registerDelegateTool`

#### 7.2 关键约束

| 约束 | 实现 |
|------|------|
| 递归深度限制（防止无限委派失控） | `DelegateEngine.maxDepth`（默认 3）通过 `NEXUS_DELEGATE_MAX_DEPTH` env 调整 |
| 子 Agent 白名单（防止任意 Agent 互相 invoke） | `DelegateToolOptions.invokableAgents`，bootstrap 默认填全部 `PHASE_INTENT_AGENTS` id |
| 谁能调 ai.agent.invoke | 只有 `general-assistant` 的 `allowedTools` 含 `ai.agent.invoke`，PM Agents 仅作为"被调用方"。这避免 PM Agent 间互调形成回路 |
| 审计同步落库 | Child run 走与父 run 完全一样的 `orchestrator.processEvent`，每次 tool/audit/budget 都被记录，parentRunId 通过 `correlationId` 串起 |
| 流式可观测 | Child events 同时 `broker.publishEvent(childRunId, event)`，WS `/ws/stream/:childRunId` 客户端能看到子 Run 进度 |
| 审批/预算独立 | Child run 有独立 `BudgetManager`，R2+ 工具仍触发独立审批；父 Run 不会因子 Run 等审批而僵死（异步生成器） |

#### 7.3 典型流程示例

用户："帮我把这个需求 X 分析清楚、拆成 WBS、估好工时。"

1. **入口路由**：LLM 意图分类→`general-assistant`（综合任务）
2. **父 Run** 启动，LLM 决定按依赖顺序委派：
   - `ai.agent.invoke({ agentId: 'requirement-analyst', input: '需求 X：...' })` → child run #1
   - 拿到 `outputText = 结构化需求` 后
   - `ai.agent.invoke({ agentId: 'task-planner', input: '需求结构：...' })` → child run #2
   - 拿到 `outputText = WBS` 后
   - `ai.agent.invoke({ agentId: 'estimation', input: '任务列表：...' })` → child run #3
3. **聚合输出**：general-assistant 把三段产出整合为最终回复返还用户
4. **审计链路**：4 个 run（1 父 + 3 子）的 audit 都能在 `GET /api/v1/audit?tenantId=...` 查到，`correlationId` 都指向用户最初的 messageId

#### 7.4 与三种"未做"路径的边界

- 选项 B（IntentPlanner 多 Agent 计划）：本方案让 LLM 自主决策委派顺序，不需要硬编码计划；如果你后期需要更刚性的串行/并行编排，再上 IntentPlanner。
- 选项 C（事件驱动异步流水线）：本方案是同步委派、单次请求内返回；跨对话/跨小时的长任务流转仍走 PhaseBridge `task.assigned_to_ai`，两套机制互补。
- Run 内动态切换 Agent：本方案是"父 Run + 多个独立子 Run"，**没有**在同一 Run 内换 Agent，这样审计/预算/审批边界清晰，回放可独立。

#### 7.5 配置与环境变量

| 变量 | 默认值 | 作用 |
|------|--------|------|
| `NEXUS_DELEGATE_MAX_DEPTH` | `3` | 委派递归深度上限，超过即拒绝并返回 `delegation_depth_exceeded` 错误 |

代码位置：
- `packages/kernel/src/delegate/index.ts` — DelegateEngine + 端口
- `packages/tool-gateway/src/delegate-tool.ts` — `ai.agent.invoke` 工具
- `apps/api-gateway/src/bootstrap.ts` — ChildRunStarter 实现 + 注册
- `packages/phase-intent/src/agents/index.ts` — `ALL_AI_TOOLS` 含 `ai.agent.invoke`（仅 general-assistant）
- `packages/phase-intent/src/agents/prompts.ts` — general-assistant 的"协调者"角色指引

### 8. 记忆系统补丁（Phase 1 末期）

为了让 SkillStore / EvidenceRegistry / SessionShadow / Compact L4 在云部署后真正可用，做了 5 项收敛补丁。原 §6 / §7 的能力不变，本节只追加补丁说明。

#### 8.1 SkillStore Backend 抽象（双轨改造）

| 组件 | 位置 | 状态 |
|------|------|------|
| `ISkillBackend` 端口 | `packages/memory/src/skill-store.ts` | ✅ 新增 |
| `FsSkillBackend` | 同上 | ✅ 文件系统持久化（开发/本地默认） |
| `PgSkillBackend` | 同上 | ✅ 走 `SkillsRepository`（生产/云部署默认） |
| `SkillStore(backendOrDir)` | 同上 | ✅ 接受 backend 或目录字符串（向后兼容） |

main.ts 装配时：`database` 配置 → 自动用 `PgSkillBackend`；否则用 `FsSkillBackend(config.NEXUS_SKILL_DIR)`。启动日志：`skill_store.backend.bound { backend: 'pg' | 'fs' }`。

#### 8.2 EvidenceRegistry 跨 Run 持久化

| 组件 | 位置 | 状态 |
|------|------|------|
| `evidence_entries` 表 | `packages/infra/src/database/schema.ts` | ✅ 新增 |
| `EvidenceEntriesRepository` | `packages/infra/src/database/repositories.ts` | ✅ 新增 |
| `IEvidencePersister` 端口 | `packages/kernel/src/compact/evidence-registry.ts` | ✅ 新增 |
| `EvidenceRegistry({ persister, runId, tenantId })` | 同上 | ✅ `scanAndRegister` / `evict` 异步双写 |
| `loadFromPersister(runId)` | 同上 | ✅ resume 场景从 PG 恢复 |

效果：tool 结果里出现的文件路径 / URL / 错误堆栈，Run 结束后仍可在 `evidence_entries` 表查到；resume 时通过 `loadFromPersister` 重建内存索引。

#### 8.3 SessionShadow PG 兜底

| 组件 | 位置 | 状态 |
|------|------|------|
| `session_summaries` 表 | `packages/infra/src/database/schema.ts` | ✅ 新增 |
| `SessionSummariesRepository` | `packages/infra/src/database/repositories.ts` | ✅ 新增 |
| `ISessionSummaryPersister` 端口 | `packages/memory/src/session-shadow.ts` | ✅ 新增 |
| Redis miss → PG fallback + 回写 Redis | 同上 | ✅ |

效果：`update()` 在 Redis CAS 后异步双写 PG；`get()` Redis miss 时从 PG 加载并 warm cache。Redis 重启不再丢失会话级摘要。

#### 8.4 Compact L4 可配模型 + Cache-Friendly 重写

原 L4 把所有非 system 消息清空、将 messages[1] 硬改为 `user` 角色的摘要，破坏了 Prompt Cache 前缀和对话角色序列。

改写策略（`packages/kernel/src/compact/legacy-compact.ts`）：

- **保留 `messages[0]`**（system，stable_prefix 不破坏）
- **保留最近 `keepRecentTurns × 2`** 条（默认 4 轮 = 8 条）
- 中间消息全部替换为**单条 system 角色** `<compacted_summary>...</compacted_summary>`
- LLM 调用模型由 `compactModel` 配置决定，默认 `claude-haiku-4-5`

配置：
- `NEXUS_COMPACT_MODEL`（默认按 Provider 选 `claude-haiku-4-5` / `gpt-4o-mini`）
- `NEXUS_COMPACT_KEEP_RECENT_TURNS`（默认 4）

#### 8.5 装配链路（main.ts）

```text
loadConfig()
  ↓
[skillsRepo, evidenceRepo, sessionSummariesRepo] = database ? pg : undefined
  ↓
skillBackend  = skillsRepo ? PgSkillBackend : FsSkillBackend
skillStore    = new SkillStore(skillBackend)
sessionPersister = sessionSummariesRepo → ISessionSummaryPersister
sessionShadow = new SessionShadow(redis ?? memory, { persister, tenantId })
evidencePersister = evidenceRepo → IEvidencePersister
  ↓
createNexusApp({
  ...,
  compactOptions: { compactModel, keepRecentTurns, evidencePersister },
})
  ↓
AgentRuntimeImpl.start() → QueryLoop({ compactOptions })
  ↓ per-Run new
CompactEngine({ provider, compactModel, keepRecentTurns, evidencePersister, runId, tenantId })
```

#### 8.6 完成度对照

| 能力 | 补丁前 | 补丁后 |
|------|--------|--------|
| Skills 跨实例共享 | ❌ FS-only | ✅ PG（生产）+ FS（本地） |
| Evidence 跨 Run 不丢 | ❌ 内存 | ✅ `evidence_entries` 表持久化 |
| SessionShadow Redis 重启 | ❌ 数据丢 | ✅ PG 兜底 + Redis warm cache |
| Compact L4 model 可配 | ❌ 硬编码 `compact-model` | ✅ env / Provider 自动选 |
| Compact L4 cache-friendly | ❌ 破坏 stable_prefix | ✅ 仅替换中段 + system 角色摘要 |

#### 8.7 仍按 Phase 2/3 延后的项（设计预期）

- **OERCD Crystallize / Distribute**：接口已冻结，当前 Noop；Phase 2 填充自动技能入库。
- **EpisodicMemory**：`ObserveResult.episodicMemories` 字段占位，等 Phase 2 与 Skills 检索一并升级（含向量化）。
- **FederationGuard**：跨租户知识联邦 + 负迁移检测，Phase 3。
- **Project / Federation Compact**：跨 session 长期记忆，与 Federation Memory 一起在 Phase 3 实现。

### 9. 上线就绪（Production-Ready 三件套）

Phase 1 末期补齐 3 个生产 blocker，让镜像可以直接交付 K8s / Docker 自愈环境。

#### 9.1 自动 DB Migration

`packages/infra/drizzle/0000_init.sql` 由 `drizzle-kit generate` 生成，包含全部 11 张表（agentRuns / checkpoints / auditLogs / approvalRequests / phaseBridgeEvents / installedPacks / connectors / skills / evidenceEntries / sessionSummaries / agentDefinitions）。

- API：`runMigrations(db, { migrationsFolder? })`（`packages/infra/src/database/client.ts`），默认目录通过 `import.meta.url` 解析到 `packages/infra/drizzle/`，源码 / 编译产物双兼容
- 启动行为：`main.ts` 在 `createDatabase()` 之后立即 `await runMigrations(database)`，日志 `infra.db.migrations_applied`；失败时 throw 阻止后续启动
- 幂等：drizzle 内部有 `__drizzle_migrations` 表追踪已执行版本，重启不会重复执行
- 修改 schema：本地跑 `pnpm --filter @nexus/infra exec drizzle-kit generate --name=<change>` 生成新 SQL → 提交 → 部署时自动应用

#### 9.2 真实健康检查

`/health` 现在返回完整依赖矩阵，任一组件不健康返 503：

```json
{
  "status": "ok" | "degraded",
  "uptimeSeconds": 1234,
  "checks": {
    "database": { "healthy": true },
    "redis":    { "healthy": false, "error": "connection refused" }
  }
}
```

- API：`GatewayServer.setHealthChecks([{ name, check: () => Promise<void> }])`
- main.ts 注入：`pingDatabase(db)`（`SELECT 1`）+ `redisClient.ping()`（返回 `PONG` 才算健康）
- K8s 用 `livenessProbe: { httpGet: /health }` 即可自愈
- Docker：Dockerfile 含 `HEALTHCHECK` 直接调 `/health`

#### 9.3 SIGTERM 优雅排水

- `GracefulShutdownController` 已经写好（`packages/kernel/src/lifecycle/graceful-shutdown.ts`），main.ts 终于把它接到 AgentRuntimeImpl
- `GRACEFUL_SHUTDOWN_TIMEOUT_MS` 默认 30s
- 流程：SIGTERM → `controller.drain()` 三阶段（标记 draining → 等所有 active runs 自然完成 → 超时则 force abort + checkpoint）→ `shutdown()` 清理 Redis/Queue/OTel → `process.exit(0)`
- 日志：`shutdown.signal.received` / `shutdown.drain.completed { totalRuns, completedNormally, checkpointedForcefully, durationMs }` / `shutdown.cleanup.failed`
- 滚动发布 / 扩缩容时活动请求不再被硬中断；token 不浪费、用户能拿到结果

#### 9.4 部署清单（按顺序执行即可）

| 步骤 | 命令 | 说明 |
|------|------|------|
| 1. 配置 env | `cp docker/.env.example .env` 并填入 LLM key | 必填：`ANTHROPIC_API_KEY` 或 `OPENAI_API_KEY`；选填：`TAVILY_API_KEY` / `BRAVE_API_KEY` / `NEXUS_HMAC_SECRET` / `FEISHU_ENCRYPT_KEY` |
| 2. 起依赖 | `docker compose up -d postgres redis` | 等 healthcheck 都 green |
| 3. 起服务 | `docker compose up -d api-gateway` | 启动时自动 migrate，log 看到 `infra.db.migrations_applied` |
| 4. 检查健康 | `curl http://localhost:3000/health` | 全 healthy 才算就绪 |
| 5. 验证业务 | `curl -X POST http://localhost:3000/api/v1/messages -d '{"content":"帮我拆 WBS","tenantId":"t1","userId":"u1"}'` | 返回 `runId`，跟踪 `GET /api/v1/runs/:id` |
| 6. 流式观察 | `wscat -c ws://localhost:3000/ws/stream/<runId>` | 看 tool/text/completed 事件 |

#### 9.5 生产环境注意事项（非 blocker，但推荐）

- **CORS**：`CORS_ORIGINS` 默认 `*`，生产应该收紧到具体 origin
- **HMAC**：`NEXUS_HMAC_SECRET` 默认未配置；生产强烈建议配置
- **LLM key**：未配置时自动用 `LocalPhaseOneProvider`（只会跑预设 PM 演示流程），生产必须配真实 key
- **PII**：当前 Run.input 含用户消息全文落库，敏感场景应在 `MessageRouter` 加 redaction
- **WebSocket 心跳**：当前 WS 长连接没 ping/pong，云负载均衡器可能切断，建议加 30s 心跳
- **mcp-pm-tools**：当前 in-memory，生产对接你的真实 PM 系统时按 §7 把 mcp-pm-tools 换成真实 PM MCP Server

#### 9.6 K8s manifest 示例（参考）

```yaml
livenessProbe:
  httpGet: { path: /health, port: 3000 }
  initialDelaySeconds: 20
  periodSeconds: 15
readinessProbe:
  httpGet: { path: /ready, port: 3000 }
  initialDelaySeconds: 5
  periodSeconds: 5
terminationGracePeriodSeconds: 45    # 比 GRACEFUL_SHUTDOWN_TIMEOUT_MS 大 10-15s
```

---

### 10. 项目骨架全景（实际代码事实）

本节为 Phase 1 实施末期的**实际项目骨架快照**，由 Glob 扫描全部 `packages/*/src/**`、`apps/*/src/**`、`mcp-servers/*/src/**` 得出，作为后续审查与重构的事实底座。

#### 10.1 一图全景

```mermaid
graph TB
    subgraph "apps（部署单元）"
        App1[api-gateway<br/>main + bootstrap + server + middleware + intent + channels + infra]
        App2[cli]
        App3[console]
    end

    subgraph "L3 业务能力包"
        L3A[phase-intent<br/>7 Agents + manifest + prompts]
    end

    subgraph "L4 补偿层（独立目录）"
        L4A[compensation/<br/>当前空]
    end

    subgraph "mcp-servers 独立进程"
        M1[pm-tools<br/>HTTP+stdio MCP]
        M2[_template<br/>新 MCP 脚手架]
    end

    subgraph "L2 控制面 control-plane（15 子模块）"
        C1[agent-registry + manifest]
        C2[run-manager + orchestrator]
        C3[approval-engine + retry-policy]
        C4[policy-engine + model-router]
        C5[budget-manager + scheduler]
        C6[audit-engine + decision-recorder]
        C7[intent-router + context-policy]
        C8[feature-flag + sunset-engine + trust-engine]
    end

    subgraph "L1 薄内核 kernel（8 子模块）"
        K1[query-engine: agent-runtime + query-loop + resilient-loop + types]
        K2[compact: L1-L4 + evidence-registry + evidence-aware + session-graft]
        K3[checkpoint: manager + in-memory-store + types]
        K4[lifecycle: hook-registry + graceful-shutdown]
        K5[state-graph]
        K6[delegate]
        K7[oercd]
        K8[environment]
    end

    subgraph "横切能力"
        X1[tool-gateway: pipeline + build-tool + adapters + connector-bridge + pm-tools-bridge + built-in-ai-tools + delegate-tool + self-healing + result-budget]
        X2[memory: skill-store + session-shadow]
        X3[guardrails: input/output 一体]
        X4[providers: anthropic + openai + provider-router + prompt-assembler]
        X5[observability: logs + traces + metrics + stream-broker]
    end

    subgraph "底层 shared + infra"
        S1[shared: types + events + errors + utils + constants]
        S2[infra: config + database/{schema,repositories,client} + redis + queue + checkpoint-outbox + create-mcp + agent-config]
    end

    App1 --> L3A
    App1 --> C1
    App1 --> C2
    App1 --> K1
    App1 --> X1
    App1 --> X5

    C1 --> S2
    C2 --> S2
    C6 --> S2

    K1 --> X4
    K1 --> X1
    K1 --> X2

    L3A --> M1
    X1 --> M1
    X1 --> M2

    L3A --> S1
    K1 --> S1
    X1 --> S1
```

#### 10.2 包/模块清单（11 包，按层级排序）

##### 底座：`packages/shared`（@stability S0）

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `types/` | agent / tool / events / budget / llm / phase / stream + index | 跨包类型契约 |
| `events/` | phase-bridge.ts + index | `IPhaseBridge` + `InMemoryPhaseBridge` |
| `errors/` | nexus-error + tool.error + provider.error + guardrail.error + budget.error | NexusError 基类 + 5 个域错误 |
| `utils/` | id (UUID/ULID) + retry + token-counter + truncate | 公共工具函数 |
| `constants/` | limits（系统硬上限）+ defaults（默认配置值） | 不可调常量 + 可覆盖默认 |

##### 底座：`packages/infra`

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `config/` | index.ts（Zod 解析 + fail-fast） | 环境变量统一入口 |
| `database/schema/` | 8 域文件（agent-registry / agent-run / audit / approval / phase-bridge / pack / connector / memory）+ index 聚合 | Drizzle ORM 表定义 |
| `database/repositories/` | 8 仓储文件（按域一一对应）+ index | 数据访问层 |
| `database/client.ts` | `createDatabase` + `runMigrations` + `pingDatabase` | PG 客户端 + 启动迁移 + 健康检查 |
| `redis/index.ts` | `RedisClient`（dedup / ratelimit / session / generic kv / CAS / ping） | Redis 抽象 |
| `queue/index.ts` | `QueueManager`（BullMQ） | 异步任务后端 |
| `checkpoint-outbox.ts` | Checkpoint outbox（BullMQ + PG） | 异步检查点持久化 |
| `create-mcp/index.ts` | `CreateMcpScaffold` | MCP server 脚手架生成器 |
| `agent-config/index.ts` | `loadAgentRuntimeConfigs` | YAML/ENV 注入每个 Agent 模型偏好 |
| `drizzle/0000_init.sql` + `meta/` | drizzle migrations | 生产自动迁移 |

##### L1 薄内核：`packages/kernel`（@stability S1）

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `query-engine/` | agent-runtime + query-loop + resilient-loop + types + index | IAgentRuntime 实现 + 推理环 + 韧性 Phase A-D |
| `compact/` | compact-engine + time-gap-micro (L1) + evidence-aware (L2) + session-graft (L3) + legacy-compact (L4) + evidence-registry + types + index | 金字塔级联防爆 + 证据保留 |
| `checkpoint/` | checkpoint-manager + in-memory-store + types + index | 多卡点 Checkpoint |
| `lifecycle/` | hook-registry + graceful-shutdown + types + index | 生命周期钩子 + 优雅停机 |
| `state-graph/` | index | DAG 工作流引擎 |
| `delegate/` | index | 子 Agent 委派端口 + DelegateEngine |
| `oercd/` | index | Observe/Execute/Reflect + Crystallize/Distribute Noop |
| `environment/` | index | DefaultEnvironmentInjector + DefaultContextBackfiller |

##### L2 控制面：`packages/control-plane`（@stability S2）

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `agent-registry/` | index + manifest | Agent 注册 + PackRegistry |
| `run-manager/` | index | AgentRun 状态机（created→running→...→succeeded） |
| `orchestrator/` | index | `ControlPlaneOrchestrator`（联动 RunManager/Approval/Budget/Audit） |
| `approval-engine/` | index | R2+ 审批策略匹配与流转 |
| `policy-engine/` | index | 工具白名单 + 风险等级评估 |
| `budget-manager/` | index | Token/cost/time/step 多维预算 |
| `audit-engine/` | index | 审计记录引擎 |
| `decision-recorder/` | index | 认知决策链（6 类决策 + 聚合统计） |
| `trust-engine/` | index | 信任度评估（滑窗 + 加权 + 自主度调节） |
| `scheduler/` | index | 定时任务调度 |
| `intent-router/` | index | LLM-first 意图分类 + 关键词 fallback + 缓存 + 指标 |
| `model-router/` | index | 按任务/预算选择模型 |
| `context-policy/` | index | 上下文策略端口 + 默认实现 |
| `retry-policy/` | index | 错误分类 + 退避决策 |
| `feature-flag/` | index | rollout 百分比开关 |
| `sunset-engine/` | index | L4 补偿层日落 |

##### 横切：`packages/tool-gateway`

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `pipeline.ts` | `ToolGatewayPipeline` | 9 阶段管线（schema/permission/risk/approval/sanitize/execute/audit/truncate/heal） |
| `build-tool.ts` | `buildTool` 工厂 | fail-closed 工具构造 |
| `tool-executor.ts` | `GatewayToolExecutor` | Kernel ↔ Gateway 适配 |
| `protocol-adapters/index.ts` | `MCPAdapter` + `RESTAdapter` | HTTP MCP + REST/OpenAPI（gRPC 待） |
| `connector.ts` + `connector-bridge.ts` | `ConnectorRegistry` + `ConnectorToolBridge` | 外部连接器生命周期 |
| `pm-tools-bridge.ts` | 桥接本地 PM tools 到 Pipeline | Phase 1 业务连接 |
| `built-in-ai-tools.ts` | `ai.chat/web.search/document.summarize/extract/qa/data.transform/skill.search/image.generate` | 通用 AI 能力 |
| `delegate-tool.ts` | `ai.agent.invoke` | 子 Agent 委派工具 |
| `self-healing.ts` | `ToolSelfHealing` | 工具失败回填模型 |
| `result-budget.ts` | `ToolResultBudget` | 结果截断 |

##### 横切：`packages/memory`

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `session-shadow.ts` | `SessionShadow` + `ISessionSummaryPersister` | post_sampling 异步会话摘要 + PG 兜底 |
| `skill-store.ts` | `SkillStore` + `FsSkillBackend` + `PgSkillBackend` | 双后端技能存储 |

##### 横切：`packages/guardrails`

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `index.ts` | `InputGuardrail`（Prompt 注入扫描） | 输入侧护栏 MVP |

> 蓝图要求 input/{injection-detector,unicode-scanner,data-leak-detector} + output/{pii-redactor,secret-scanner,confidence-tagger} 拆 6 子模块；当前只有 1 个 index.ts，**待重构（G7）**。

##### 横切：`packages/providers`

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `types.ts` | `IModelProvider` 接口 | Provider 抽象 |
| `adapters/anthropic.ts` | `AnthropicProvider` | Claude 流式 + tool calling |
| `adapters/openai.ts` | `OpenAIProvider` | GPT-4o + DALL-E |
| `provider-router.ts` | `ProviderRouter` | 按模型前缀路由 |
| `prompt-assembler.ts` | `PromptAssembler` | System Prompt 六层组装 + stable_prefix |

##### 横切：`packages/observability`

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `logs/index.ts` | `NexusLogger` (pino, dev/debug 双模式) | 结构化日志 |
| `traces/index.ts` | `OpenTelemetryManager` | 分布式链路追踪 |
| `metrics/index.ts` | `OpenTelemetryMetrics` (Prometheus exporter) | 指标采集 |
| `stream-broker.ts` | `InMemoryAgentStreamBroker` | AgentStreamEvent 多消费者分发 |
| `bootstrap.ts` | `bootstrapObservability` | 应用启动一站式装配 |

##### L3 能力包：`packages/phase-intent`

| 子模块 | 文件 | 职责 |
|--------|------|------|
| `manifest.yaml` | 能力包清单 | provisions（agents/tools/policies）+ events 声明 |
| `bootstrap.ts` | `registerPhaseIntentAgents` | 注册 7 个 Agent + 应用覆盖 |
| `agents/index.ts` | `PHASE_INTENT_AGENTS` 7 个定义 + `GENERAL_AI_TOOLS` | Phase 1 业务 Agent 元数据 |
| `agents/prompts.ts` | 7 个 Agent 的 identity/safety/skills prompt | 提示模板 |
| `index.ts` | 包入口 | 导出 |

##### L4 补偿层：`compensation/`（根目录）

当前**空目录**——按设计无需 Phase 1 补偿适配器。

#### 10.3 apps 与独立进程

| 应用 | 文件 | 部署形态 |
|------|------|----------|
| `apps/api-gateway` | main + bootstrap + server + middleware/message-router + intent/llm-classifier + channels/feishu + infra/checkpoint-store | Fastify HTTP/WS 主服务 |
| `apps/cli` | index.ts | 命令行（skill / mcp / run 等命令） |
| `apps/console` | index.ts | Web 控制台 model + HTML 渲染 |
| `mcp-servers/pm-tools` | index.ts + manifest.yaml | 独立 HTTP MCP server（Phase 1 业务工具） |
| `mcp-servers/_template` | index.ts + manifest.yaml + tests | 新 MCP server 脚手架模板 |

#### 10.4 测试矩阵

| 包 | 测试文件数 | 用例数 |
|----|-----------|--------|
| `apps/api-gateway` | 5 | 22 |
| `apps/console` | 1 | 1 |
| `packages/kernel` | 7 | 30 |
| `packages/control-plane` | 5 | **44**（+7 trust/decision） |
| `packages/tool-gateway` | 3 | 11 |
| `packages/memory` | 2 | 8 |
| `packages/infra` | 2 | 3 |
| `packages/providers` | 2 | 2 |
| `packages/observability` | 1 | 3 |
| `evals` | 3 | 10 |
| **合计** | **31** | **133** |

#### 10.5 部署资产清单

| 类别 | 文件 | 状态 |
|------|------|------|
| 多阶段构建 | `Dockerfile`（node:22-alpine + pnpm，含 HEALTHCHECK） | ✅ |
| 镜像优化 | `.dockerignore` | ✅ |
| 开发栈 | `docker/docker-compose.yml`（PG/Redis/Qdrant + api-gateway） | ✅ |
| 环境模板 | `docker/.env.example`（含 LLM key、意图、Compact、Web 搜索全部参数） | ✅ |
| CI/CD | `.github/workflows/ci.yml`（typecheck + test + build + DockerHub auto-push） | ✅ |
| 生产 compose | `docker-compose.prod.yml` | ❌ 待补 |
| K8s manifest | `config/k8s/` | ❌ 待补 |
| 多环境 env | `config/env/.env.{dev,staging,prod}` | ❌ 待补 |
| DB 迁移 | `packages/infra/drizzle/0000_init.sql` + `meta/` | ✅ |

---

### 11. 与总平台规划的一致性审查

> 总平台规划权威文档：`docs/nexus-enterprise-agent-middleware-complete-solution.md`（v3.0 架构方案）+ `.cursor/rules/agent-architecture-overview.mdc`（核心条款）。
> 本节按 8 个维度逐条对照当前实现。

#### 11.1 平台定位对齐

| 总规划要求 | 当前状态 | 评价 |
|-----------|---------|------|
| AI 认知中间件（非单体 ChatBot） | ✅ Gateway + Control Plane + Kernel + Cross-Cutting 完整分层 | ✅ 完全对齐 |
| 自然语言意图 → 可审计、可治理、可恢复、可持续学习 | ✅ 可审计（AuditEngine 全链路）+ 可治理（Approval/Policy）+ 可恢复（Checkpoint 多卡点）+ 可持续学习（OERCD O/E/R） | 🟡 学习闭环 C/D 未通（Phase 2/3） |

#### 11.2 运行时分层对齐

总规划：`Gateway → Control Plane → Agent Runtime → Cross-Cutting → Providers → Infrastructure` 六层。

| 层级 | 总规划 | 当前实现 | 评价 |
|------|--------|---------|------|
| Gateway | 协议归一/签名/去重/限流 | `apps/api-gateway`（HMAC + dedup + ratelimit + InputGuardrail + Feishu webhook） | ✅ 对齐 |
| Control Plane | Intent/Registry/RunManager/Approval/Policy/Budget/Audit/Scheduler | `packages/control-plane` 16 子模块（覆盖全部 8 项 + 8 个 v3.0 演进项） | ✅ 超出 |
| Agent Runtime / Harness | QueryLoop/StateGraph/Hooks/Compact/Checkpoint/OERCD | `packages/kernel` 8 子模块（全部对齐 + delegate/environment 补强） | ✅ 超出 |
| Cross-Cutting | Memory/RAG, ToolGateway, Guardrails, Observability | memory（缺 RAG）+ tool-gateway + guardrails（仅 input）+ observability | 🟡 RAG 缺失（Phase 2/3）+ guardrails 只 input |
| Providers | LLM + Prompt Assembler + Cache | providers 含 anthropic + openai + router + prompt-assembler | 🟡 **缺 Prompt Cache 管理**（B3 盲区） |
| Infrastructure | PG/Redis/Qdrant/BullMQ/… | infra（PG + Redis + BullMQ） | 🟡 缺 Qdrant 集成（RAG 一并） |

#### 11.3 四层演进骨架对齐

总规划：L1 薄内核 / L2 强控制面 / L3 可插拔能力包 / L4 补偿层（可日落）。

| 层 | 总规划职责 | 当前实现 | 评价 |
|----|-----------|---------|------|
| L1 薄内核 | QueryLoop、Compact、Checkpoint、Lifecycle；Tool/Memory **仅端口** | ✅ kernel 8 子模块；ToolExecutor 是接口；CheckpointStore 是接口；OERCDSkillSearch 是接口 | ✅ 完全对齐 |
| L2 强控制面 | 注册、策略、审批、审计、预算、调度 | ✅ control-plane 16 子模块（全部覆盖 + 6 演进项） | ✅ 超出 |
| L3 能力包 | Phase1/2/3 Agent+Tool，Manifest 热插拔 | ✅ phase-intent 包含 manifest.yaml；通过 `/api/v1/packs/install` 热装 | ✅ 对齐（待补 phase-execution / phase-connection 包） |
| L4 补偿层 | 过渡适配器，**必须标注 sunset 日期** | `compensation/` 空目录 + `sunset-engine` 已实现 | ✅ 基础设施备好 |

#### 11.4 七项长期稳定原则对齐 ⭐

| # | 原则 | 当前实现 | 评价 |
|---|------|----------|------|
| 1 | **薄内核** — Kernel 只有推理环，禁止业务域逻辑 | ✅ Kernel 8 个子模块均为通用机制；PM 业务逻辑全部在 `phase-intent` + `mcp-servers/pm-tools` | ✅ 完全对齐 |
| 2 | **强控制面** — 权限/审批/审计/预算集中，禁止 Agent 各自鉴权 | ✅ `PolicyEngine` 统一工具白名单；`ApprovalEngine` 统一 R2+ 审批；`AuditEngine` 统一审计 | ✅ 完全对齐 |
| 3 | **能力包化** — 业务以 Pack 注册；禁止 Pack 直接 import 其他 Pack 内部模块 | ✅ phase-intent 通过 `AgentRegistry.register` 注册；Pack 间通过 PhaseBridge 事件协作 | ✅ 完全对齐 |
| 4 | **策略驱动** — 行为由 Policy/FeatureFlag 配置，禁止 `if (toolName===…)` 硬编码 | 🟡 `FeatureFlagRegistry` ✅；`PolicyEngine` ✅；但 `ai.web.search` 等内置工具的 risk level 仍硬编码在 `built-in-ai-tools.ts` | 🟡 大部分对齐 |
| 5 | **事件解耦** — Phase 间经 **Phase Bridge** 事件总线，禁止跨 Phase 函数直调 | 🟡 `InMemoryPhaseBridge` 接口 ✅；当前 phase-intent 发布 `task.assigned_to_ai` 事件；**但 phase-bridge 不是独立包**（在 shared/events 里）且**只有内存实现** | 🟡 接口对齐，生产实现缺失 |
| 6 | **证据优先** — 决策/学习/技能入库必须有 Evidence 链 | ✅ `EvidenceRegistry` 自动扫描 + PG 持久化；`SkillStore.validate` 强制 `evidenceIds.length > 0`；OERCD trace 含 evidence | ✅ 完全对齐 |
| 7 | **补偿可日落** — L4 适配器到期下线 | ✅ `SunsetEngine` 已实现；compensation/ 目录预留；**当前无 L4 适配器需要日落** | ✅ 基础设施备好 |

**七项原则达成率：5 ✅ + 2 🟡 = 100% 接口对齐 / 71% 生产实现完整**

#### 11.5 七大结构性盲区（B1-B7）对齐 ⭐

| # | 盲区机制 | 当前实现位置 | 评价 |
|---|----------|--------------|------|
| B1 | 韧性推理 Phase A-D | `packages/kernel/src/query-engine/resilient-loop.ts` | ✅ 完整（preFlight + 主链 + fallback provider + self-healing） |
| B2 | 金字塔 Compact L1-L4 + EvidenceRegistry | `packages/kernel/src/compact/{time-gap-micro,evidence-aware,session-graft,legacy-compact,evidence-registry}.ts` | ✅ 完整 |
| B3 | Prompt Cache（stable_prefix） | `packages/providers/src/prompt-assembler.ts` 有 `stable_prefix` / `dynamic_suffix` 概念 | 🟡 **缺 cache 命中观测 + cache-aware compact**（应有 `providers/cache/prompt-cache.ts`） |
| B4 | SessionShadow @ `post_sampling` | `packages/memory/src/session-shadow.ts` + bootstrap.ts 注册 `post_sampling` hook | ✅ 完整（含 Redis CAS + PG 兜底） |
| B5 | 流式事件背压 | `packages/observability/src/stream-broker.ts` 有 `maxInFlight` 参数 | ✅ 基础对齐（无 DropPolicy 高级策略） |
| B6 | GracefulShutdown 多卡点 | `packages/kernel/src/lifecycle/graceful-shutdown.ts` + main.ts SIGTERM 装配 + checkpoint reason 含 `graceful_shutdown` | ✅ 完整 |
| B7 | ContextBackfiller 环境回填 | `packages/kernel/src/environment/index.ts` (`DefaultEnvironmentInjector` + `DefaultContextBackfiller`) | 🟡 基础设施有，但**只回填环境快照，未回填历史 Run 上下文** |

**结构性盲区覆盖率：5 ✅ + 2 🟡 = 71% 完全对齐 / 100% 接口埋点**

#### 11.6 稳定性分级 S0-S5 标注情况

| 级别 | 总规划范围 | 当前 `@stability S*` JSDoc 标注 | 评价 |
|------|-----------|--------------------------------|------|
| S0 | 事件信封、错误码 | `packages/shared/src/errors/nexus-error.ts:@stability S0` | ✅ |
| S1 | Kernel 公共接口 | `query-loop.ts:@stability S1`、`compact-engine.ts:@stability S1`、`evidence-registry.ts:@stability S1`、`oercd/index.ts:@stability S1`、`delegate/index.ts:@stability S1`、`agent-runtime.ts:@stability S1` | ✅ |
| S2 | Control Plane 策略 API | `orchestrator/index.ts:@stability S2`、新增 `trust-engine:@stability S2`、`decision-recorder:@stability S2`、infra schema/repositories 均标注 S2 | ✅ |
| S3 | Core Pack API | `built-in-ai-tools.ts:@stability S3`、`delegate-tool.ts:@stability S3` | ✅ |
| S4 | Biz Pack | phase-intent 内未标 S4（隐含） | 🟡 应显式标注 |
| S5 | 补偿层 | compensation/ 空 | — |

**评价**：S0-S3 完整标注，S4 业务包未显式标注（小问题）。

#### 11.7 Phase 拓扑硬约束对齐

| 约束 | 实现 | 评价 |
|------|------|------|
| 任一 Phase 可独立启动；Phase1 不依赖 Phase2/3 | ✅ phase-intent 只发布 `task.assigned_to_ai`，不等待回执 | ✅ |
| Phase2 仅监听 `task.assigned_to_ai`；Phase3 监听 `notification.*` / `knowledge.synced` | ✅ 事件类型已定义；当前 Phase2/3 包未存在 | ✅ 契约就绪 |
| 跨 Phase 协作 **仅事件** | ✅ phase-intent 不 import phase-execution；通过 PhaseBridge | ✅ |

#### 11.8 Agent Harness 洋葱 L0-L6 对齐

总规划：外→内 `治理外壳 → ToolGateway → Memory → Compact → QueryLoop+ResilientLoop → 环境感知 → LLM`。

| 层 | 总规划 | 当前实现 |
|----|--------|---------|
| L0 治理外壳 | 审批/审计/预算/限流 | ✅ Gateway + ControlPlaneOrchestrator |
| L1 ToolGateway | 9 阶段管线 | ✅ `ToolGatewayPipeline` |
| L2 Memory | SessionShadow + SkillStore | ✅ |
| L3 Compact | L1-L4 金字塔 | ✅ `CompactEngine` |
| L4 QueryLoop + ResilientLoop | 推理环 + Phase A-D | ✅ `QueryLoop` + `ResilientLoop` |
| L5 环境感知 | EnvironmentInjector + ContextBackfiller | ✅ `packages/kernel/src/environment/` |
| L6 LLM | Provider 适配 | ✅ `ProviderRouter` |

**洋葱完整对齐 7/7。"内层不知业务 Phase"约束 ✅**（kernel 任何一个模块都不 import phase-intent）。

#### 11.9 综合一致性评分

| 维度 | 评分 | 主要 gap |
|------|------|---------|
| 平台定位 | 10/10 | — |
| 运行时分层 | 9/10 | 缺 RAG + Qdrant + prompt cache |
| 四层演进骨架 | 10/10 | — |
| **七项长期稳定原则** | **9/10** | 原则 5：phase-bridge 非独立包、无生产实现 |
| 七大结构性盲区（B1-B7） | 9/10 | B3 缺 cache 观测；B7 只回填环境快照 |
| 稳定性分级 S0-S5 | 9/10 | S4 未显式标注 |
| Phase 拓扑硬约束 | 10/10 | — |
| Agent Harness 洋葱 | 10/10 | — |
| **加权综合** | **9.5/10** | — |

#### 11.10 与总规划的真实偏离（必须知道的 5 件事）

按重要程度排序，**所有偏离都在 Phase 2/3 范围内可弥补**：

1. **phase-bridge 非独立包**（违反"事件解耦"原则的形式要求，但功能本身在 `shared/events/phase-bridge.ts`）。一旦多实例部署，没有 Redis Streams adapter 就无法跨节点投递事件。**Phase 3 重构（计划中的 G3）**。

2. **Prompt Cache 管理缺失**（B3）。`PromptAssembler` 区分了 stable_prefix / dynamic_suffix，但没有 `providers/cache/prompt-cache.ts` 统一管理 Anthropic cache_control / OpenAI cache mark 的下发与命中观测。**Phase 2 补**。

3. **OERCD Crystallize / Distribute 是 Noop**。当前是接口冻结状态，符合 v3.0 设计预期（C 在 Phase 2 填充、D 在 Phase 3 填充），不算偏离。

4. **Memory 缺 working / episodic / RAG**。WorkingMemory（MEM-0）与 EpisodicMemory（MEM-2）字段已留位但无实现；RAG pipeline 完全没有。**Phase 2 与向量化检索一起补**。

5. **Guardrails 仅 input 一半**。蓝图要求 input/{injection-detector,unicode-scanner,data-leak-detector} + output/{pii-redactor,secret-scanner,confidence-tagger} 共 6 个子模块；当前只 1 个 InputGuardrail。**Phase 2 优先补 output 侧**。

#### 11.11 结论

> Phase 1 实施在**架构层面 100% 对齐**总平台规划（七项原则 + 四层骨架 + B1-B7 + S0-S5），在**生产实现层面 75-90% 完整**（接口齐 + 5 个生产化短板待 Phase 2/3 补）。
>
> **当前骨架可以作为 Phase 2/3 演进的稳定底座**，不需要回头重写。后续工作集中在：
> - 补"生产化"短板（phase-bridge 独立包 + Redis Streams adapter / Prompt Cache 管理 / Guardrails 输出侧）
> - 补"业务能力"（Memory RAG / OERCD Crystallize+Distribute / phase-execution + phase-connection 业务包）
> - 不需要重构现有 11 个包的目录结构。
