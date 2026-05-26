# Nexus 分阶段实现计划

> **基于**: `nexus-enterprise-agent-middleware-complete-solution.md` v3.0  
> **原则**: 框架先行 → 业务填充；三阶段独立可运行、互不阻塞  
> **日期**: 2026-05-26

---

## 总体策略

```
Phase 1（W1-W14）: 框架主体 + 意图层业务
  ├── W1-W6:  框架基座（Kernel + Control Plane + Infra + Gateway）
  ├── W7-W10: 能力包体系 + 通用业务接入框架（MCP/Skill CLI）
  └── W11-W14: Phase 1 业务能力（项目管理为首个业务场景）

Phase 2（W15-W26）: 端到端工程自动化
  ├── W15-W18: 沙箱 + 代码工具链 + 任务接入（对话/PM 双入口）
  ├── W19-W22: 完整研发管线（代码→测试→审查→部署）
  └── W23-W26: 验收闭环 + 优化稳定

Phase 3（W27-W40）: 企业全局协同
  ├── W27-W30: 知识体系 + 文档 + 问答
  ├── W31-W35: OA/会议/通知/多平台连接器
  └── W36-W40: 高级协同 + GA 联调
```

**设计硬约束**：
- Phase 1 不依赖 Phase 2/3 的存在
- Phase 2 仅监听 `task.assigned_to_ai` 事件
- Phase 3 仅监听 `notification.requested` 和 `knowledge.synced` 事件
- 跨 Phase 协作仅通过 Phase Bridge 事件总线

---

## Phase 1 — 框架主体 + 通用业务接入层（W1-W14）

> **目标**: 构建完整的 Nexus 运行时框架，使其具备接入任意企业系统的通用能力；以项目管理为首个业务验证场景。

### 里程碑一览

| 周期 | 里程碑 | 关键交付 |
|------|--------|---------|
| W1-W2 | Kernel MVP | 推理引擎 + 基础 Compact + 生命周期 |
| W3-W4 | Control Plane MVP | 注册中心 + 运行管理 + 审批 + 预算 |
| W5-W6 | 基础设施 + Gateway | DB/Redis/Queue + API 网关 + 事件总线 |
| W7-W8 | 能力包体系 + Tool Gateway | 包注册/加载 + MCP 协议适配 + buildTool |
| W9-W10 | 通用接入框架 | MCP Server 脚手架 + Skill CLI + Connector 市场 |
| W11-W12 | Phase 1 业务 Agent | PM Agent 集（作为首个能力包） |
| W13-W14 | 集成验证 + 上线 | 端到端测试 + 灰度 + 记忆 MVP |

---

### W1-W2：Kernel MVP（薄内核 L1）

> 目标：实现 Agent Harness 发动机核心，使单个 Agent 可以完成推理→工具调用→循环。

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 1.1 | 搭建 Monorepo 骨架 | pnpm-workspace.yaml + turbo.json + tsconfig.base.json + ESLint flat config | 根目录 |
| 1.2 | 实现 `packages/shared` 基础类型 | NexusError 错误体系、S0 事件信封格式、PhaseId、基础 interface | `packages/shared` |
| 1.3 | 实现 Query Loop 核心 | `while` 推理环 + 工具分发 + 终止判定（无 tool_use / 预算耗尽） | `kernel/query-engine/query-loop.ts` |
| 1.4 | 实现 Resilient Loop Phase A-D 骨架 | Pre-Flight 检查 + Model Fallback 链 + Tool 错误分级 + Post-Turn 记账 | `kernel/query-engine/resilient-loop.ts` |
| 1.5 | 实现 IAgentRuntime 接口 | `start()` / `resume()` / `cancel()` 入口；`invoke()` 同步 + `stream()` 流式 | `kernel/query-engine/` |
| 1.6 | 实现 Compact L1 (Time-Gap Micro) | 时间间隔检测 + 旧工具结果清理（零 LLM 调用） | `kernel/compact/time-gap-micro.ts` |
| 1.7 | 实现 Checkpoint 基础版 | 周期性卡点 + `post_tool_execution` 卡点 + 持久化骨架 | `kernel/checkpoint/` |
| 1.8 | 实现 Lifecycle Hooks 注册机制 | 钩子阶段定义 + 注册 + 按序调度（pre_plan/post_tool/post_sampling 等） | `kernel/lifecycle/hooks.ts` |
| 1.9 | 实现单 Provider 适配（Anthropic） | 流式调用 + Tool Calling + 基础错误处理 | `packages/providers/` |
| 1.10 | 实现 Prompt Assembler 骨架 | System Prompt 六层结构（Layer 1-4 stable_prefix + Layer 5-6 dynamic_suffix） | `providers/prompt-assembler.ts` |

**验收标准**：
- 可通过 CLI 发起一次完整的推理循环（用户消息→LLM→工具调用→结果→LLM→完成）
- Compact L1 在消息间隔 >30min 时自动清理旧结果
- Checkpoint 在每 5 次工具调用后落盘

---

### W3-W4：Control Plane MVP（强控制面 L2）

> 目标：实现全局治理能力，使 Agent 执行受到注册、审批、预算的约束。

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 2.1 | 实现 Agent Registry | Agent 定义注册（YAML→DB）+ Prompt 版本管理 + 工具权限声明 | `control-plane/agent-registry/` |
| 2.2 | 实现 Run Manager 状态机 | AgentRun CRUD + 状态转移（created→running→waiting_*→succeeded/failed） | `control-plane/run-manager/` |
| 2.3 | 实现 Approval Engine | 工具风险等级判定 + R2+ 审批策略 + 审批请求路由 + 结果回调 resume | `control-plane/approval-engine/` |
| 2.4 | 实现 Budget Manager | Token/成本/步数/时间四维预算 + 告警 + 模型降级触发 | `control-plane/budget-manager/` |
| 2.5 | 实现 Policy Engine 骨架 | RBAC 基础 + Agent 身份鉴权 + 工具权限四维判定 | `control-plane/policy-engine/` |
| 2.6 | 实现 Audit Engine 基础 | 全量调用链路记录（写入 + 基础查询 API） | `control-plane/audit-engine/` |
| 2.7 | 实现 Scheduler 基础 | FIFO + Priority 队列 + 并发上限管控 | `control-plane/scheduler/` |
| 2.8 | 实现 Intent Router 骨架 | LLM 意图分类 + Phase 路由 + Agent 能力匹配 + Fallback | `control-plane/intent-router/` |
| 2.9 | 实现 IRetryPolicy 端口 | 失败类型策略表 + 指数退避 + 模型降级切换 | `control-plane/retry-policy/` |
| 2.10 | 实现 IModelRouter 端口 | 任务类型→模型映射 + 预算降级规则（60%/80%/95% 三档） | `control-plane/model-router/` |

**验收标准**：
- Agent 定义可通过 YAML 注册并生效
- R2+ 工具调用触发审批流程，审批通过后 AgentRun 自动恢复
- 预算耗尽时 AgentRun 正确进入 `waiting_budget` 状态

---

### W5-W6：基础设施 + API Gateway

> 目标：搭建支撑全平台运行的基础设施，实现统一入口和事件总线。

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 3.1 | PostgreSQL Schema 设计 + Drizzle ORM | AgentRun、AgentDefinition、AuditLog、Checkpoint 等核心表 | `packages/infra/` |
| 3.2 | Redis 集成 | Session 缓存 + 消息去重 + 限流令牌桶 | `packages/infra/` |
| 3.3 | BullMQ 队列集成 | 任务调度队列 + OERCD 异步队列 + Checkpoint Outbox | `packages/infra/` |
| 3.4 | Phase Bridge 事件总线 MVP | PhaseBridgeEvent 发布/订阅 + 幂等键去重 + 事件类型路由 | `packages/shared/events/` |
| 3.5 | API Gateway HTTP/WS | Fastify HTTP 入口 + WebSocket 实时通道 + 协议归一化 | `apps/api-gateway/` |
| 3.6 | Message Router | 签名验证 + 消息去重 + 身份映射 + 限流 | `apps/api-gateway/` |
| 3.7 | OpenTelemetry 最小链路 | OTel SDK 集成 + AgentRun 全链路 Trace + 基础 Metrics | `packages/observability/` |
| 3.8 | 配置与 Secret 管理 | 环境变量→Zod 校验 config + Secret 隔离加载 | `packages/infra/` |
| 3.9 | Docker Compose 开发环境 | PG + Redis + Qdrant 一键启动 | 根目录 `docker/` |
| 3.10 | CI/CD Pipeline 骨架 | GitHub Actions: lint + type-check + unit test + build | `.github/workflows/` |

**验收标准**：
- `docker compose up` 可启动完整开发环境
- HTTP API 可接收消息并路由到 Intent Router
- Phase Bridge 可发布/消费事件（本地 BullMQ 实现）

---

### W7-W8：能力包体系 + Tool Gateway

> 目标：实现可插拔能力包架构和统一工具网关，为后续所有业务接入奠定基础。

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 4.1 | 实现 CapabilityPackManifest 解析 | Manifest YAML/JSON 解析 + 依赖解析 + 内核兼容性校验 | `control-plane/agent-registry/` |
| 4.2 | 实现能力包生命周期管理 | published→installed→enabled→disabled→uninstalled 状态机 | `control-plane/agent-registry/` |
| 4.3 | 实现 buildTool 工厂 | Fail-Closed 默认值 + ToolSafetyCharacteristics 自动填充 | `tool-gateway/build-tool.ts` |
| 4.4 | 实现 Tool Gateway Pre/Post Pipeline | Schema 校验→权限检查→风险评估→审批判定→参数脱敏→执行→审计 | `packages/tool-gateway/` |
| 4.5 | 实现 MCP Protocol Adapter | MCP Client 连接管理 + 工具发现 + 执行适配 + 连接池 | `tool-gateway/protocol-adapters/mcp.ts` |
| 4.6 | 实现 REST Protocol Adapter | REST API 适配器 + OpenAPI Schema 自动转工具定义 | `tool-gateway/protocol-adapters/rest.ts` |
| 4.7 | 实现 IToolResultBudget | 工具结果截断策略（结构化/自由文本分别处理） | `tool-gateway/result-budget.ts` |
| 4.8 | 实现工具异常自愈矩阵 | Level 1-4 分级处理 + 错误转化为模型可理解上下文 | `tool-gateway/self-healing.ts` |
| 4.9 | 实现能力包热加载机制 | 运行时加载/卸载能力包，无需重启 Kernel | `control-plane/agent-registry/` |
| 4.10 | 实现 ISunsetEngine 骨架 | 补偿能力注册 + 日落条件评估（MVP: version_reached 类型） | `control-plane/sunset-engine/` |

**验收标准**：
- 通过 Manifest 声明的能力包可在运行时热加载
- MCP Server 工具可被 Agent 正确发现和调用
- buildTool 未声明特征的工具默认最严格安全策略
- 工具超时/Schema 错误可被自动回填给模型

---

### W9-W10：通用业务接入框架（MCP + Skill CLI）

> 目标：构建可扩展的第三方系统接入体系，使任何企业系统都可以通过 MCP Server 或 Skill CLI 快速接入。

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 5.1 | MCP Server 开发脚手架 | `create-nexus-mcp` CLI 脚手架（模板生成 + 配置 + 注册） | `packages/infra/create-mcp/` |
| 5.2 | MCP Server 模板工程 | 标准目录结构 + 工具定义模板 + 测试模板 + Docker 构建 | `mcp-servers/_template/` |
| 5.3 | Skill CLI 工具 | 技能文件 CRUD + 本地验证 + 发布到技能库 + 版本管理 | `apps/cli/` |
| 5.4 | Connector Pack 注册协议 | ConnectorDefinition 接口 + 注册 API + 健康检查 + 凭据管理 | `packages/tool-gateway/` |
| 5.5 | 连接器市场化治理 | Connector 列表 API + 启用/禁用 + 版本管理 + 灰度发布 | `control-plane/agent-registry/` |
| 5.6 | 实现 Environment Injector | 冷启动环境快照收集（<500ms） | `kernel/environment/injector.ts` |
| 5.7 | 实现 Context Backfiller | 工具执行后环境变更检测 + 差量回填 | `kernel/environment/backfiller.ts` |
| 5.8 | 实现 Compact L2 (Evidence-Aware) | 证据标记启发式规则 + EvidenceRegistry + 非证据压缩 | `kernel/compact/evidence-aware.ts` |
| 5.9 | 实现 SessionShadow MVP | PostSampling 异步摘要 + Redis 幂等写入 + 反膨胀 | `memory/session-shadow.ts` |
| 5.10 | 实现 Compact L3 (Session Graft) | 读取 SessionShadow 摘要 + 嫁接替换 + 证据保留 | `kernel/compact/session-graft.ts` |

**验收标准**：
- `npx create-nexus-mcp my-connector` 可生成可运行的 MCP Server 模板
- Skill CLI 可创建/编辑/发布技能文件
- 任意新的第三方系统可通过编写 MCP Server + 注册 ConnectorPack 接入 Nexus
- Compact L2/L3 正确保留证据并利用 SessionShadow 摘要

---

### W11-W12：Phase 1 业务 Agent（项目管理为首个场景）

> 目标：在已就绪的框架中，以能力包形式实装第一组业务 Agent，验证框架的业务承载能力。

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 6.1 | 实现 PM MCP Server (nexus-pm-tools) | project.create/query + task.decompose/assign/updateStatus + risk.* | `mcp-servers/pm-tools/` |
| 6.2 | 实现 RequirementAnalystAgent | 需求分析 + 澄清 + 结构化输出（AgentPack 形式注册） | `packages/phase-intent/` |
| 6.3 | 实现 TaskPlannerAgent | WBS 拆解 + 关键路径 + 工时估算 | `packages/phase-intent/` |
| 6.4 | 实现 ProjectDoctorAgent | 项目健康诊断 + 风险识别 | `packages/phase-intent/` |
| 6.5 | 实现 ProgressTrackerAgent | 进度监控 + 偏差分析 | `packages/phase-intent/` |
| 6.6 | 实现 ReminderAgent | 智能催办（策略矩阵驱动） | `packages/phase-intent/` |
| 6.7 | 实现通知 MCP Server 骨架 | notification.send（预留多平台适配口） | `mcp-servers/notification/` |
| 6.8 | 实现飞书 Bot 接入 | Webhook 签名验证 + 消息解析 + 身份映射 | `apps/api-gateway/channels/feishu.ts` |
| 6.9 | Phase 1 能力包 Manifest | 完整的 CapabilityPackManifest 声明 + 依赖关系 | `packages/phase-intent/manifest.yaml` |
| 6.10 | 催办策略引擎 | 策略矩阵配置化 + 升级规则 + 与 Scheduler 集成 | `packages/phase-intent/` |

**验收标准**：
- 通过自然语言可完成：需求分析→任务拆解→分配→催办 全流程
- 所有 Agent 以能力包形式注册，可独立启用/禁用
- PM 工具以 MCP Server 独立进程运行

---

### W13-W14：集成验证 + 灰度上线

> 目标：端到端集成测试 + 记忆/学习基础 + 灰度验证。

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 7.1 | 记忆系统 MEM-0/MEM-1 | 工作记忆（上下文窗口）+ 会话记忆（Redis TTL） | `packages/memory/` |
| 7.2 | OERCD Observe/Execute MVP | 任务开始时检索相关技能 + 执行轨迹记录 | `kernel/oercd/` |
| 7.3 | 技能库基础（MEM-3 MVP） | 技能文件存储 + FTS5 索引 + 渐进式加载（L0 摘要） | `packages/memory/skill-store.ts` |
| 7.4 | 实现 Compact L4 (Legacy Full) | LLM 调用生成压缩摘要（兜底） | `kernel/compact/legacy-compact.ts` |
| 7.5 | 实现 Graceful Shutdown 骨架 | 三阶段排水 + SIGTERM 处理 + 活跃 Run 跟踪 | `kernel/lifecycle/graceful-shutdown.ts` |
| 7.6 | 端到端集成测试套件 | Mock LLM 录制回放 + 场景覆盖（正常/审批/超时/预算耗尽） | `evals/` |
| 7.7 | 管理控制台 MVP | AgentRun 列表 + 状态查看 + 审批操作 + 审计日志查询 | `apps/console/` |
| 7.8 | 性能基线测试 | P95 响应时间 + Token 消耗 + 成本统计 | `evals/` |
| 7.9 | 安全基线扫描 | 输入注入扫描 + 输出脱敏 + 权限边界验证 | `packages/guardrails/` |
| 7.10 | 灰度发布 + 内测 | Feature Flag 配置 + 10% 流量灰度 + 监控告警 | 运维 |

**验收标准**（Phase 1 GA 标准）：
- 需求拆解准确率 ≥ 70%
- 端到端响应时间 P95 < 90s
- Checkpoint 恢复成功率 ≥ 95%
- 审计链路完整率 = 100%
- 前缀缓存命中率 ≥ 70%

---

### Phase 1 交付后的框架能力矩阵

| 层级 | 模块 | 就绪状态 | 说明 |
|------|------|---------|------|
| L1 Kernel | Query Loop + Resilient Loop | ✅ 完整 | 推理引擎核心 |
| L1 Kernel | Compact L1/L2/L3/L4 | ✅ 完整 | 四级金字塔级联 |
| L1 Kernel | Checkpoint 多卡点 | ✅ 完整 | 语义事件驱动 |
| L1 Kernel | Lifecycle Hooks | ✅ 完整 | 全阶段钩子 |
| L1 Kernel | Environment 感知 | ✅ 完整 | 冷启动+回填 |
| L1 Kernel | Graceful Shutdown | ✅ 基础 | 三阶段排水 |
| L1 Kernel | OERCD | 🔶 MVP | Observe+Execute |
| L2 Control | Agent Registry | ✅ 完整 | 含能力包管理 |
| L2 Control | Run Manager | ✅ 完整 | 完整状态机 |
| L2 Control | Approval Engine | ✅ 完整 | R2+ 审批 |
| L2 Control | Budget Manager | ✅ 完整 | 四维预算 |
| L2 Control | Policy Engine | 🔶 基础 | RBAC |
| L2 Control | Audit Engine | ✅ 完整 | 全链路 |
| L2 Control | Model Router | ✅ 完整 | 多维路由 |
| L2 Control | Retry Policy | ✅ 完整 | 分级重试 |
| 横切 | Tool Gateway | ✅ 完整 | MCP/REST 适配 |
| 横切 | Memory MEM-0/1/3 | ✅ 基础 | 工作/会话/技能 |
| 横切 | SessionShadow | ✅ 完整 | 零阻塞 |
| 横切 | Guardrails | 🔶 基础 | 输入扫描+输出脱敏 |
| 横切 | Observability | 🔶 基础 | OTel 链路+基础指标 |
| 接入 | API Gateway | ✅ 完整 | HTTP/WS |
| 接入 | Phase Bridge | ✅ 完整 | 事件总线 |
| 接入 | MCP 脚手架 | ✅ 完整 | 快速创建连接器 |
| 接入 | Skill CLI | ✅ 完整 | 技能管理 |

---

## Phase 2 — 端到端工程自动化（W15-W26）

> **目标**: 构建从任务接收到代码交付的完整自动化管线。  
> **任务来源**: ① 用户对话直接下达 ② 项目管理系统中的任务指派给 Nexus 自动化机器人  
> **前置条件**: Phase 1 框架已就绪，直接在框架内注册 Phase 2 能力包。

### 里程碑一览

| 周期 | 里程碑 | 关键交付 |
|------|--------|---------|
| W15-W16 | 任务接入 + 沙箱 | 双入口任务接收 + Docker 沙箱 |
| W17-W18 | 代码工具链 | Dev MCP Server + CodeGenerator + Critic |
| W19-W20 | 测试 + 审查管线 | TestGenerator + Runner + BugFixer + SecurityScanner |
| W21-W22 | CI/CD 交付 | Deployment + PR + Acceptance |
| W23-W24 | 编排优化 | Hierarchical 编排 + State Graph 流程 |
| W25-W26 | 稳定验收 | 5 个真实任务验证 + 性能优化 |

---

### W15-W16：任务双入口 + 开发沙箱

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 8.1 | 对话任务入口 | 用户通过对话下达开发任务 → Intent Router 识别为 execution 类 → 创建 AgentRun | `control-plane/intent-router/` |
| 8.2 | PM 系统任务入口 | 监听 `task.assigned_to_ai` 事件 → 解析任务详情 → 创建 Phase 2 AgentRun | `packages/phase-execution/` |
| 8.3 | 任务机器人身份 | Nexus Bot 在 PM 系统中的身份注册 + 任务认领/状态回写 | `packages/phase-execution/` |
| 8.4 | Docker 沙箱管理器 | 容器创建/销毁 + cap-drop ALL + 网络白名单 + 资源限制 | `packages/phase-execution/sandbox/` |
| 8.5 | 沙箱文件系统隔离 | 源码只读挂载 + OverlayFS 写入层 + diff/patch 提取 | `packages/phase-execution/sandbox/` |
| 8.6 | 沙箱凭据管理 | 短生命周期 Token 生成（TTL ≤ 任务×2） + 自动失效 | `packages/phase-execution/sandbox/` |
| 8.7 | State Graph 编排配置 | Phase 2 工作流图定义（规划→实现→验证→交付） | `packages/phase-execution/` |
| 8.8 | Phase 2 能力包 Manifest | CapabilityPackManifest 声明 + 事件订阅声明 | `packages/phase-execution/manifest.yaml` |

---

### W17-W18：代码工具链 + 规划 Agent

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 9.1 | Dev MCP Server (nexus-dev-tools) | code.read/write/search + git.* + shell.execute + file.* | `mcp-servers/dev-tools/` |
| 9.2 | RequirementParserAgent | 深度需求解析 + 验收标准提取 + 技术约束识别 | `packages/phase-execution/` |
| 9.3 | ArchitecturePlannerAgent | 技术方案设计 + 接口定义 + 文件结构规划 | `packages/phase-execution/` |
| 9.4 | ExecutionPlannerAgent | 分步执行计划 + 依赖分析 + 估算 Token/时间 | `packages/phase-execution/` |
| 9.5 | CodeGeneratorAgent | 代码实现（多文件、跨模块）+ 上下文感知 | `packages/phase-execution/` |
| 9.6 | CodeReviewerAgent | 自审查（Critic 模式）+ 最佳实践检查 + 改进建议 | `packages/phase-execution/` |
| 9.7 | RefactorAgent | 根据 Review 反馈执行重构 + 代码优化 | `packages/phase-execution/` |
| 9.8 | HITL 技术方案确认节点 | State Graph 中断点 + 审批通过后 resume | `packages/phase-execution/` |

---

### W19-W20：测试 + 安全管线

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 10.1 | TestGeneratorAgent | 单元测试 + 集成测试代码生成 | `packages/phase-execution/` |
| 10.2 | TestRunnerAgent | 沙箱内测试执行 + 结果解析 + 覆盖率统计 | `packages/phase-execution/` |
| 10.3 | BugFixerAgent | 失败分析 + 自动修复（≤3 次，超限→HITL） | `packages/phase-execution/` |
| 10.4 | SecurityScannerAgent | SAST 安全扫描 + 漏洞分级 + 修复建议 | `packages/phase-execution/` |
| 10.5 | 实现→验证循环编排 | Code→Review→Fix 循环 + Test→Fix 循环 + 退出条件 | `packages/phase-execution/` |
| 10.6 | 测试覆盖率门禁 | 可配置覆盖率阈值 + 未达标阻断交付 | `packages/phase-execution/` |

---

### W21-W22：CI/CD 交付管线

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 11.1 | DeploymentAgent | CI/CD 触发 + 构建状态监控 + 部署验证 | `packages/phase-execution/` |
| 11.2 | PRCreatorAgent | 创建 PR + 变更说明生成 + Commit Message 规范化 | `packages/phase-execution/` |
| 11.3 | AcceptanceAgent | 验收通知 + 反馈收集 + 迭代循环触发 | `packages/phase-execution/` |
| 11.4 | CI/CD MCP Server 适配 | GitHub Actions / GitLab CI / Jenkins 适配器 | `mcp-servers/dev-tools/` |
| 11.5 | 任务完成事件发布 | `task.completed` / `task.failed` / `task.acceptance_result` 事件 | `packages/phase-execution/` |
| 11.6 | 高风险部署策略 | 生产部署 R3 级审批 + 变更审批流 + 回滚机制 | `packages/phase-execution/` |

---

### W23-W24：编排优化

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 12.1 | IOrchestrationSelector 实装 | 根据任务复杂度自动选择 Solo/Sequential/Parallel/Hierarchical | `control-plane/orchestration/` |
| 12.2 | Hierarchical 编排引擎 | Supervisor→Workers 模式 + 预算分配 + 结果合并 | `kernel/delegate/` |
| 12.3 | Delegate Engine 完善 | 子 Agent 派生 + 权限锁死 + 预算继承 | `kernel/delegate/` |
| 12.4 | OERCD Reflect + Crystallize | 执行轨迹分析 + 最优路径提取 + 技能文件生成 | `kernel/oercd/` |
| 12.5 | Phase 2 Context Policy | 代码上下文策略（sliding_window + rag_augmented） | `control-plane/context-policy/` |
| 12.6 | Prompt Cache 协同优化 | Cache-Aware Compact + 跨 Run 缓存池 | `providers/prompt-cache/` |

---

### W25-W26：稳定验收

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 13.1 | 真实任务验证（×5） | 5 个低风险真实开发任务端到端完成 | `evals/` |
| 13.2 | Checkpoint 恢复测试 | 随机中断 + 恢复测试（目标 ≥95%） | `evals/` |
| 13.3 | 成本优化 | 单任务平均成本 < $4 | 全链路 |
| 13.4 | Phase 2 安全审计 | 沙箱逃逸测试 + 凭据安全 + 代码注入防护 | `packages/guardrails/` |
| 13.5 | 性能压测 | 并发任务压测 + 资源竞争验证 | `evals/` |
| 13.6 | 文档与操作手册 | Phase 2 使用文档 + 故障排查手册 | `docs/` |

**验收标准**（Phase 2 Beta）：
- 代码编译通过率 ≥ 75%
- 测试通过率（含自修复）≥ 75%
- 安全扫描零高危
- 单任务平均耗时 < 60min
- 单任务平均成本 < $4
- 双入口（对话/PM 系统）均可正常触发完整管线

---

## Phase 3 — 企业全局协同（W27-W40）

> **目标**: 实现企业级知识问答、文档生成、会议纪要、OA 审批、多平台通知等全局协同能力。  
> **前置条件**: Phase 1 框架 + Phase Bridge 事件总线已就绪。

### 里程碑一览

| 周期 | 里程碑 | 关键交付 |
|------|--------|---------|
| W27-W28 | 知识体系 | RAG 管道 + 组织知识库 + 知识问答 |
| W29-W30 | 文档与 Issue | DocumentAgent + IssueTriageAgent |
| W31-W32 | OA + 会议 | OAAgent + MeetingAgent + CalendarAgent |
| W33-W34 | 多平台连接器 | 飞书/钉钉/企微深度集成 |
| W35-W36 | 高级功能 | PPT 生成 + 跨平台事件 + 知识联邦 |
| W37-W38 | 学习闭环完善 | OERCD 完整 + Federation Guard + Curator |
| W39-W40 | GA 联调 + 发布 | 三阶段联调 + 安全审计 + GA 候选 |

---

### W27-W28：知识体系

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 14.1 | RAG 检索管道 | 向量检索(Qdrant) + 关键词检索(ES) + RRF 融合 + Reranker | `packages/memory/rag-pipeline.ts` |
| 14.2 | 组织知识库 MEM-4 | 多源文档接入 + 向量化 + 版本化 + RBAC 权限继承 | `packages/memory/org-knowledge.ts` |
| 14.3 | RAGAgent | 企业知识库自然语言问答 + 来源引用 + 置信度标注 | `packages/phase-connection/` |
| 14.4 | 知识摄入管道 | 文档解析（PDF/Word/Markdown）+ 分块 + 嵌入 + 存储 | `packages/memory/` |
| 14.5 | 情景记忆 MEM-2 | PostgreSQL + Qdrant 混合检索 + 权限过滤 | `packages/memory/episodic-memory.ts` |
| 14.6 | Qdrant + Elasticsearch 部署 | 向量数据库 + 搜索引擎集成 | `packages/infra/` |

---

### W29-W30：文档 + Issue 管理

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 15.1 | DocumentAgent | 文档搜索/生成/更新/总结/翻译 | `packages/phase-connection/` |
| 15.2 | IssueTriageAgent | 问题分类 + 优先级 + 责任人建议 | `packages/phase-connection/` |
| 15.3 | nexus-doc-mcp | 文档 CRUD + 搜索 + 权限适配 | `mcp-servers/doc/` |
| 15.4 | nexus-issue-mcp | Issue CRUD + 分配 + 状态流转 | `mcp-servers/issue/` |
| 15.5 | KnowledgeOpsAgent | 知识质量维护 + 过期检测 + 重复清理 | `packages/phase-connection/` |
| 15.6 | Phase 3 能力包 Manifest | 完整声明 + 事件订阅（notification.*/knowledge.synced） | `packages/phase-connection/manifest.yaml` |

---

### W31-W32：OA + 会议 + 日历

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 16.1 | OAAgent | 对话式审批/请假/报销/会议室预订 | `packages/phase-connection/` |
| 16.2 | MeetingAgent | 会议创建 + 纪要提取 + 行动项同步 | `packages/phase-connection/` |
| 16.3 | CalendarAgent | 日程管理 + 每日总结 + 次日计划 | `packages/phase-connection/` |
| 16.4 | nexus-oa-mcp | 审批/请假/报销/会议室 API 适配 | `mcp-servers/oa/` |
| 16.5 | 会议纪要解析引擎 | 音频转录 + 关键决策提取 + 行动项识别 | `packages/phase-connection/` |
| 16.6 | 多模态输入管道 | 音频(Whisper STT) + 文档解析 + 图像分析 | `packages/phase-connection/` |

---

### W33-W34：多平台连接器

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 17.1 | nexus-feishu-mcp | 消息/文档/会议/审批/日历/人事 全能力 | `mcp-servers/feishu/` |
| 17.2 | nexus-dingtalk-mcp | 消息/待办/审批/日历 | `mcp-servers/dingtalk/` |
| 17.3 | nexus-wecom-mcp | 消息/文档/审批 | `mcp-servers/wecom/` |
| 17.4 | 钉钉 Bot 接入 | Webhook + 消息解析 + 身份映射 | `apps/api-gateway/channels/dingtalk.ts` |
| 17.5 | 企微 Bot 接入 | Webhook + 消息解析 + 身份映射 | `apps/api-gateway/channels/wecom.ts` |
| 17.6 | 多平台消息路由 | 统一通知出口 + 平台选择策略 + 降级 | `packages/phase-connection/` |

---

### W35-W36：高级功能

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 18.1 | PPTGeneratorAgent | 项目汇报/周报/复盘 PPT 自动生成 | `packages/phase-connection/` |
| 18.2 | nexus-ppt-mcp | PPT 生成 + 模板管理 | `mcp-servers/ppt/` |
| 18.3 | 跨 Phase 事件协同 | Phase 1 任务完成 → Phase 3 自动通知相关人 | 事件总线 |
| 18.4 | 认知热力图 + 决策链 | 完整实现 Cognitive Heatmap + Decision Chain Recorder | `packages/observability/` |
| 18.5 | Explainability API | GET /decisions + /heatmap + /explain/{turn} | `packages/observability/` |
| 18.6 | 管理控制台增强 | 热力图可视化 + 决策链展示 + 多 Phase 监控 | `apps/console/` |

---

### W37-W38：学习闭环完善

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 19.1 | OERCD Distribute | 知识分发（Self/Peer/Cross-Phase/Organization） | `kernel/oercd/distribute.ts` |
| 19.2 | Knowledge Federation Guard | 负迁移检测 + A/B 对照 + 自动回滚 | `memory/federation-guard.ts` |
| 19.3 | Knowledge Curator | 技能库剪枝 + 过期检测 + 合并相似技能 | `kernel/oercd/curator.ts` |
| 19.4 | AutonomyScore 完整实现 | 五因子公式 + 动态信任度调整 + 自主权升降级 | `control-plane/policy-engine/` |
| 19.5 | 多租户隔离 | TenantId 贯穿全链路 + 数据隔离 + 配额管理 | 全链路 |
| 19.6 | 流式背压 + 断线重放 | IAgentStreamBroker 完整实现 + 消费者管理 | `packages/observability/` |

---

### W39-W40：GA 联调 + 发布

#### 任务清单

| # | 任务 | 产出 | 所属模块 |
|---|------|------|---------|
| 20.1 | 三阶段联调测试 | Phase 1→2→3 事件联通 + 端到端场景验证 | `evals/` |
| 20.2 | 安全审计（全面） | 渗透测试 + 代码审计 + 权限覆盖验证 | 安全 |
| 20.3 | 性能优化 | 全链路性能分析 + 瓶颈优化 + 缓存调优 | 全链路 |
| 20.4 | 补偿层日落评估 | ISunsetEngine 运行 + 已就绪补偿能力下线 | `control-plane/sunset-engine/` |
| 20.5 | 文档完善 | API 文档 + 架构文档 + 运维手册 + 开发者指南 | `docs/` |
| 20.6 | GA 发布 | 全量上线 + 监控告警 + 灰度切换 | 运维 |

**验收标准**（GA）：
- 系统可用性 ≥ 99.5%
- 前缀缓存命中率 ≥ 85%
- Checkpoint 恢复成功率 ≥ 99%
- 审计链路完整率 = 100%
- 高危安全事件 = 0
- 知识联邦负迁移回滚率 ≤ 5%

---

## 风险与缓解

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| Phase 1 框架构建工期过长 | 阻塞 Phase 2/3 | Phase 2/3 可并行启动业务 Agent 开发（不依赖框架就绪） |
| MCP Server 性能瓶颈 | 工具调用延迟 | 连接池 + 超时 + 降级 |
| Phase 2 沙箱安全 | 代码执行风险 | gVisor 增强隔离 + 资源硬限制 + 网络白名单 |
| 多 Phase 事件一致性 | 状态不一致 | 幂等键 + 事件溯源 + 补偿机制 |
| LLM 成本失控 | 预算超支 | 四维预算 + 模型降级 + Prompt Cache |
| 知识污染 | Agent 行为退化 | Federation Guard + A/B 对照 + 快速回滚 |

---

## 补偿层规划（L4）

> 以下补偿能力在框架核心未就绪时使用，就绪后按日落流程下线。

| 补偿能力 | 补偿什么 | Phase 引入 | 日落条件 |
|---------|---------|-----------|---------|
| FlatContextWindow | Compact L2/L3 未就绪 | Phase 1 W1-W6 | Compact L3 就绪（W9） |
| StaticModelMapping | IModelRouter 未就绪 | Phase 1 W1-W2 | ModelRouter 就绪（W4） |
| ManualRetryMiddleware | IRetryPolicy 未就绪 | Phase 1 W1-W2 | RetryPolicy 就绪（W4） |
| SyncToolBridge | 异步 Tool Gateway 未就绪 | Phase 1 W1-W4 | Tool Gateway 就绪（W8） |
| SingleTenantGuard | 多租户隔离未完成 | Phase 1 W1 | 多租户贯穿（Phase 3 W37） |

---

## 依赖关系图

```
Phase 1 内部依赖：
  W1-2 (Kernel) → W3-4 (Control Plane) → W5-6 (Infra)
                ↘ W7-8 (Pack+Tool GW) → W9-10 (接入框架)
                                       ↘ W11-12 (PM Agent) → W13-14 (验证)

Phase 2 对 Phase 1 的依赖：
  Phase 1 W8 (Tool Gateway + MCP) → Phase 2 W15 (沙箱)
  Phase 1 W4 (Run Manager)        → Phase 2 W15 (任务入口)
  Phase 1 W6 (Phase Bridge)       → Phase 2 W15 (task.assigned_to_ai)

Phase 3 对 Phase 1 的依赖：
  Phase 1 W8 (Tool Gateway + MCP) → Phase 3 W27 (连接器)
  Phase 1 W6 (Phase Bridge)       → Phase 3 W27 (notification.*/knowledge.synced)
  Phase 1 W10 (MCP 脚手架)       → Phase 3 W33 (多平台 MCP)

Phase 2/3 之间无直接依赖（仅通过事件总线）
```
