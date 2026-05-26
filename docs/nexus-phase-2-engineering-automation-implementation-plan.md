# Nexus Phase 2 实现计划：端到端工程自动化

> **来源蓝图**: `docs/nexus-enterprise-agent-middleware-complete-solution.md`  
> **阶段定位**: 在 Phase 1 框架内注册执行层能力包，构建从任务接收到代码交付的自动化机器人。  
> **交付原则**: 双入口任务接收、沙箱隔离、状态图编排、HITL 审批、事件回传、独立运行。

---

## 阶段目标

Phase 2 负责工程执行层，目标是让 Nexus 自动化机器人能够完成：

```
接收任务 → 解析需求 → 规划方案 → 代码实现 → 测试 → 审查 → 部署 → 验收 → 反馈迭代
```

任务来源必须同时支持两类入口：

| 来源 | 触发方式 | 进入路径 |
|------|----------|----------|
| 用户对话 | 用户直接在聊天/CLI/API 中提出开发任务 | Gateway → Intent Router → Phase 2 AgentRun |
| 项目管理系统 | PM 系统中任务指派给 Nexus 自动化机器人 | Phase Bridge `task.assigned_to_ai` → Phase 2 AgentRun |

Phase 2 不直接修改 Phase 1 的内部状态。任务结果统一发布 `task.completed`、`task.failed`、`task.acceptance_requested`、`task.acceptance_result` 事件，由 Phase 1 或外部系统自行消费。

---

## 独立运行边界

| 边界 | 规则 |
|------|------|
| Phase 2 启动条件 | 只依赖 Phase 1 已交付的公共框架能力，不依赖 Phase 3 |
| 事件订阅 | 必须监听 `task.assigned_to_ai`；可接收对话入口转入的 execution 类任务 |
| 事件发布 | 发布 `task.completed`、`task.failed`、`task.acceptance_requested`、`task.acceptance_result`、`knowledge.synced` |
| 数据边界 | Phase 2 维护执行计划、沙箱、代码变更、测试结果、部署记录，不写 Phase 1 业务库 |
| 安全边界 | 所有代码执行必须在沙箱内进行，生产部署必须走 R3 审批 |
| PM 状态同步 | 通过事件发布结果；如 PM 系统为外部独立系统，Phase 2 可通过 PM MCP 直接回写状态（策略配置） |

---

## 前置框架能力

| 能力 | 来源 | 使用方式 |
|------|------|----------|
| Run Manager | Phase 1 框架 | 管理长任务状态、审批等待、恢复 |
| Tool Gateway | Phase 1 框架 | 接入 Dev MCP、CI/CD MCP、Git 工具 |
| Phase Bridge | Phase 1 框架 | 接收 PM 任务和发布验收结果 |
| Approval / Policy | Phase 1 框架 | 高风险文件、依赖升级、部署审批 |
| Budget / Model Router | Phase 1 框架 | 控制长任务成本和模型降级 |
| Checkpoint / Durable Outbox | Phase 1 框架 | 长流程中断恢复 |
| Compact / SessionShadow | Phase 1 框架 | 代码任务长上下文管理 |
| Skill CLI / Skill Store | Phase 1 框架 | 沉淀开发流程技能 |
| State Graph Engine | Phase 1 框架 | 定义工程自动化工作流图 |
| Delegate Engine | Phase 1 框架 | Supervisor/Workers 编排 |
| IContextPolicy | Phase 1 框架 | Phase 2 补充代码场景策略 |
| AgentStreamEvent / IAgentStreamBroker | Phase 1 框架 | 长任务实时进度推送 |

---

## 总体里程碑

| 周期 | 里程碑 | 关键交付 |
|------|--------|---------|
| W15-W16 | 双入口任务接入与沙箱 | 对话入口、PM 任务入口、Docker/gVisor 沙箱、Git 工作流策略 |
| W17-W18 | 规划与代码工具链 | Dev MCP、需求解析、架构规划、执行计划、代码生成、代码审查 |
| W19-W20 | 测试与安全管线 | 测试生成、测试运行、BugFix、安全扫描、覆盖率门禁 |
| W21-W22 | CI/CD 与验收 | PR 创建、CI/CD 触发、部署验证、验收通知、PM 状态同步 |
| W23-W24 | 多 Agent 编排 + 可观测增强 | Supervisor/Workers、Context Policy、认知热力图 MVP、决策链 MVP |
| W25-W26 | 稳定验收 | 真实任务验证、恢复测试、成本优化、安全审计 |

---

## W15-W16：双入口任务接入与开发沙箱

目标：让 Phase 2 可以从对话和项目管理系统同时接收任务，并在隔离环境中执行。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 8.1 | 对话任务入口 | Intent Router 识别 `execution` 类任务，创建 Phase 2 AgentRun | `packages/control-plane/intent-router` |
| 8.2 | PM 任务入口 | 监听 `task.assigned_to_ai`，解析任务、验收标准、优先级、上下文 | `packages/phase-execution` |
| 8.3 | Nexus Bot 身份 | 自动化机器人在 PM 系统中的账号、权限、任务认领动作 | `mcp-servers/pm-tools` |
| 8.4 | ExecutionPlan 模型 | 任务目标、步骤、依赖、风险、预算、卡点、验收标准 | `packages/shared` |
| 8.5 | Docker 沙箱管理器 | 容器创建、销毁、资源限制、网络白名单、PID 限制 | `packages/phase-execution/sandbox` |
| 8.6 | gVisor 高风险隔离 | R3/R4 或未知依赖任务启用增强隔离 | `packages/phase-execution/sandbox` |
| 8.7 | 文件系统隔离 | 源码基线只读挂载，Agent 在 worktree/overlayfs 写入 | `packages/phase-execution/sandbox` |
| 8.8 | Diff/Patch 提取 | 从沙箱写入层提取可审查 diff，不直接污染主仓库 | `packages/phase-execution/sandbox` |
| 8.9 | 临时凭据 | Git/CI/包管理器短期 Token，TTL 不超过任务预计时间 ×2 | `packages/phase-execution/sandbox` |
| 8.10 | Git 工作流策略 | 分支命名、并发冲突、PR 后清理（见下方详细定义） | `packages/phase-execution/sandbox` |
| 8.11 | Phase 2 Manifest | Agent、工具、事件订阅、权限、风险策略声明 | `packages/phase-execution/manifest.yaml` |

**Git 工作流策略定义**：

```
分支命名规范：
  nexus/{taskId}/{short-description}
  示例：nexus/TASK-1234/add-user-auth

并发冲突策略：
  • 每个任务独占一个 worktree + 独立分支
  • 同一文件被多个任务修改时，后完成的任务在 PR 阶段由 CI 检测冲突
  • 冲突检测失败 → 通知人工 + 标记为 waiting_external

PR 后清理：
  • PR 合并后 → 自动删除远程分支 + 清理本地 worktree
  • PR 关闭/放弃 → 保留分支 7 天后自动清理
  • 沙箱容器在任务完成/失败后 30 分钟内销毁（可配置保留用于调试）

基线同步：
  • 长任务开始前 rebase 最新主分支
  • 任务执行超过 4 小时触发基线检查，drift 过大时 HITL 提示
```

**PM 状态同步策略**：

```
配置项：pm.status_sync_mode（默认 "event"）

模式 1："event"（推荐，Phase 间解耦）
  Phase 2 发布 task.completed/failed → Phase 1 消费事件 → Phase 1 通过 PM MCP 更新状态
  适用场景：PM 系统由 Phase 1 管理

模式 2："direct"（外部独立 PM 系统）
  Phase 2 直接通过 PM MCP 回写任务状态（认领/进行中/已完成/失败）
  适用场景：PM 系统为外部系统，Phase 1 不管理其状态
  约束：回写操作风险等级 R1，必须记录审计

事件补偿机制：
  • 无论哪种模式，Phase 2 都会发布 task.completed/failed 事件（至少一次语义）
  • Phase Bridge 幂等键保证重复消费安全
  • 事件投递失败时进入 BullMQ dead-letter 队列，告警人工处理
```

验收标准：

- 用户对话可创建开发任务 AgentRun。
- PM 系统指派任务后可通过 `task.assigned_to_ai` 触发 AgentRun。
- 沙箱内写入不会修改源码基线，只输出 diff/patch。
- 每个任务有独立 Git 分支和 worktree。
- 任务中断后可从最近 Checkpoint 恢复。

---

## W17-W18：规划 Agent 与代码工具链

目标：完成从需求解析到初版代码修改的自动化能力。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 9.1 | Dev MCP Server | `code.read`、`code.search`、`code.write`、`file.*`、`git.*`、`shell.execute` | `mcp-servers/dev-tools` |
| 9.2 | Git 工具安全策略 | `git.diff` R0、`git.commit` R2、`git.push` R3、force 操作默认禁止 | `mcp-servers/dev-tools` |
| 9.3 | Shell 工具沙箱策略 | 命令白名单、超时、输出预算、网络限制 | `mcp-servers/dev-tools` |
| 9.4 | RequirementParserAgent | 需求解析、验收标准、上下文缺口、风险识别 | `packages/phase-execution` |
| 9.5 | ArchitecturePlannerAgent | 技术方案、模块影响、接口变化、迁移风险 | `packages/phase-execution` |
| 9.6 | ExecutionPlannerAgent | 分步计划、文件清单、测试计划、预算估算 | `packages/phase-execution` |
| 9.7 | CodeGeneratorAgent | 按计划修改代码，输出 diff 与说明 | `packages/phase-execution` |
| 9.8 | CodeReviewerAgent | Critic 模式审查代码质量、边界、安全、测试缺口 | `packages/phase-execution` |
| 9.9 | RefactorAgent | 根据 Review 反馈执行小范围重构 | `packages/phase-execution` |
| 9.10 | 技术方案 HITL 卡点 | 高风险方案、跨模块改动、生产影响必须审批 | `packages/phase-execution` |

验收标准：

- 对话任务可生成结构化 `ExecutionPlan`。
- PM 任务可自动提取验收标准并补充缺口问题。
- CodeGenerator 只能通过 Dev MCP 在沙箱写入层修改文件。
- CodeReviewer 不通过时能触发 Refactor 循环。

---

## W19-W20：测试、BugFix 与安全管线

目标：让代码修改具备最小可验证质量闭环。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 10.1 | TestGeneratorAgent | 单元测试、集成测试、回归测试建议 | `packages/phase-execution` |
| 10.2 | TestRunnerAgent | 在沙箱内运行测试、构建、lint、类型检查 | `packages/phase-execution` |
| 10.3 | 测试结果解析 | 失败堆栈、失败用例、覆盖率、耗时、 flaky 标记 | `packages/phase-execution` |
| 10.4 | BugFixerAgent | 失败分析、修复尝试、最多 3 次循环，超限 HITL | `packages/phase-execution` |
| 10.5 | SecurityScannerAgent | SAST、依赖漏洞、Secret 检测、危险 API 检测 | `packages/phase-execution` |
| 10.6 | 覆盖率门禁 | 按项目配置覆盖率阈值，未达标阻断交付 | `packages/phase-execution` |
| 10.7 | 高风险变更识别 | 权限、认证、数据库、依赖大版本、删除 >100 行 | `packages/phase-execution` |
| 10.8 | 结果预算控制 | 测试日志、构建日志、扫描结果分页和摘要 | `packages/tool-gateway` |

验收标准：

- 测试失败能自动进入 BugFix 循环。
- 连续 3 次失败后转人工，不继续消耗预算。
- 安全扫描出现 Critical/High 时必须阻断交付。
- 测试和扫描结果进入 EvidenceRegistry。

---

## W21-W22：CI/CD、PR 与验收闭环

目标：完成从本地沙箱验证到外部交付系统的闭环。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 11.1 | PRCreatorAgent | Commit、PR 标题、描述、变更摘要、测试说明 | `packages/phase-execution` |
| 11.2 | CI/CD MCP Adapter | GitHub Actions、GitLab CI、Jenkins 状态查询和触发 | `mcp-servers/dev-tools` |
| 11.3 | DeploymentAgent | 非生产部署触发、部署状态监控、健康检查 | `packages/phase-execution` |
| 11.4 | 生产部署审批 | 生产部署 R3，必须人工审批和回滚方案 | `packages/control-plane/approval-engine` |
| 11.5 | AcceptanceAgent | 通知验收人、收集反馈、生成修订计划 | `packages/phase-execution` |
| 11.6 | 任务结果事件 | `task.completed`、`task.failed`、`task.acceptance_requested`、`task.acceptance_result` | `packages/phase-execution` |
| 11.7 | PM 状态同步 | 按策略配置（event/direct）同步任务状态到 PM 系统 | `packages/phase-execution` |
| 11.8 | OERCD Execute 轨迹 | 端到端执行轨迹 JSONL，供后续反思 | `packages/kernel/oercd` |

验收标准：

- 能为低风险任务自动创建 PR。
- CI 失败可回到 BugFix 循环。
- 验收不通过时生成下一轮修改计划。
- PM 系统任务状态与 Nexus 执行结果保持一致。
- Phase 2 通过事件回传结果，同时可选直接回写。

---

## W23-W24：多 Agent 编排与可观测增强

目标：提升复杂任务的可控性、上下文效率、学习能力和可解释性。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 12.1 | Phase 2 State Graph 工作流定义 | 规划、实现、验证、交付、验收节点图（使用 Phase 1 State Graph Engine） | `packages/phase-execution/workflows` |
| 12.2 | IOrchestrationSelector 实装 | Solo、Sequential、Parallel、Hierarchical 自动选择 | `packages/control-plane/orchestration` |
| 12.3 | Supervisor/Workers 编排实现 | 使用 Phase 1 Delegate Engine 端口，实现任务拆解和并行执行 | `packages/phase-execution` |
| 12.4 | 子 Agent 权限配置 | 子 Agent 只继承必要工具、预算、数据范围 | `packages/phase-execution` |
| 12.5 | Phase 2 Context Policy | `sliding_window + rag_augmented + checkpoint_restore` 代码场景策略 | `packages/control-plane/context-policy` |
| 12.6 | Cache-Aware Compact | 代码长上下文中尽量不破坏 `stable_prefix` | `packages/providers/prompt-cache` |
| 12.7 | OERCD Crystallize 实现 | 成功任务生成开发技能草案，附 evidenceIds（填充 Phase 1 冻结的接口） | `packages/kernel/oercd` |
| 12.8 | 反面案例库 | 失败任务沉淀为反面案例，供后续规划避坑 | `packages/memory` |
| 12.9 | Cognitive Heatmap MVP | 规划 token 占比、工具选择犹豫度、证据利用率、信息依赖度 | `packages/observability/cognitive-heatmap.ts` |
| 12.10 | Decision Chain Recorder MVP | tool_selection、plan_step、risk_assessment、error_recovery 记录 | `packages/observability/decision-chain.ts` |

**说明**：
- 任务 12.1 使用 Phase 1 W7-W8 交付的 State Graph Engine（`IGraphNode`/`IGraphEdge`），Phase 2 只定义业务工作流图，不修改 L1 代码。
- 任务 12.3 使用 Phase 1 W7-W8 交付的 Delegate Engine 端口，Phase 2 在 L3 层配置 Supervisor 和 Workers 的角色分配。
- 任务 12.7 填充 Phase 1 W13 冻结的 `ICrystallizePhase` 接口实现。
- 任务 12.9-12.10 在 `packages/observability` 横切层实现，对 Phase 2 的代码任务提供决策可解释能力，Phase 3 对其做 Console 可视化。

验收标准：

- 复杂任务可由 Supervisor 分配给多个 Worker。
- 子 Agent 无法越权调用未授权工具。
- 长任务 Compact 后仍保留关键证据和测试结果。
- 成功任务可生成待审核技能。
- 每轮推理可生成认知热力指标。
- 关键决策（tool_selection、plan_step）有完整决策链记录。

---

## W25-W26：稳定验收与 Beta 发布

目标：通过真实任务验证 Phase 2 端到端工程自动化能力。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 13.1 | 真实任务验证 | 5 个低风险真实开发任务端到端完成 | `evals/` |
| 13.2 | 双入口回归 | 对话入口与 PM 任务入口均完成全链路 | `evals/` |
| 13.3 | Checkpoint 恢复压测 | 随机中断、恢复、审批等待、预算等待 | `evals/` |
| 13.4 | 沙箱安全审计 | 沙箱逃逸、凭据泄露、网络越界、文件越界测试 | `packages/guardrails` |
| 13.5 | 成本优化 | Phase 2 代码任务平均成本 Beta < $4 | 全链路 |
| 13.6 | 性能压测 | 并发开发任务、队列堆积、沙箱资源竞争 | `evals/` |
| 13.7 | Git 工作流验证 | 并发任务分支隔离、冲突检测、PR 后清理 | `evals/` |
| 13.8 | PM 同步验证 | event 模式和 direct 模式均能正确同步状态 | `evals/` |
| 13.9 | 运行手册 | 沙箱故障、CI 故障、审批卡住、恢复失败处理 | `docs/` |

Beta 验收：

| 指标 | Beta 目标 |
|------|-----------|
| 代码编译通过率 | >= 75% |
| 测试通过率（含自修复） | >= 75% |
| 代码审查通过率 | >= 60% |
| 安全扫描 Critical/High | 0 |
| 单任务平均耗时 | < 60min |
| Phase 2 代码任务平均成本 | < $4 |
| Checkpoint 恢复成功率 | >= 95% |
| 双入口触发成功率 | >= 95% |
| PM 状态同步成功率 | >= 99% |
| 决策可追溯率 | >= 80% |

---

## Phase 2 能力包结构

```text
packages/phase-execution/
├── src/
│   ├── agents/
│   │   ├── requirement-parser-agent.ts
│   │   ├── architecture-planner-agent.ts
│   │   ├── execution-planner-agent.ts
│   │   ├── code-generator-agent.ts
│   │   ├── code-reviewer-agent.ts
│   │   ├── refactor-agent.ts
│   │   ├── test-generator-agent.ts
│   │   ├── test-runner-agent.ts
│   │   ├── bug-fixer-agent.ts
│   │   ├── security-scanner-agent.ts
│   │   ├── deployment-agent.ts
│   │   ├── pr-creator-agent.ts
│   │   └── acceptance-agent.ts
│   ├── sandbox/
│   │   ├── container-manager.ts
│   │   ├── filesystem-isolation.ts
│   │   ├── credential-manager.ts
│   │   └── git-workflow.ts          ← Git 分支/worktree/清理策略
│   ├── workflows/
│   │   └── dev-pipeline-graph.ts    ← State Graph 工作流定义（使用 L1 端口）
│   ├── sync/
│   │   └── pm-status-sync.ts       ← PM 状态同步（event/direct 双模式）
│   ├── events/
│   └── policies/
└── manifest.yaml
```

---

## Phase 2 风险与控制

| 风险 | 控制措施 |
|------|----------|
| Agent 修改代码失控 | 沙箱隔离、diff/patch 输出、HITL 审批、PR 审查 |
| Shell 工具危险 | 白名单、超时、网络限制、R2/R3 审批 |
| 测试日志炸上下文 | Tool Result Budget 分页和摘要 |
| CI/CD 外部系统不稳定 | RetryPolicy、Checkpoint、`waiting_external` |
| PM 状态不一致 | 双模式同步 + 事件幂等 + dead-letter 告警 |
| 成本失控 | 四维预算、模型路由、Context Policy、Compact |
| 技能污染 | OERCD 产物默认 pending_review，必须 evidenceIds |
| 并发任务 Git 冲突 | 独立 worktree + CI 冲突检测 + HITL 升级 |
| 长任务基线漂移 | 4 小时基线检查 + drift 告警 + 可选 rebase |
| L1 层级违规 | State Graph 和 Delegate 仅使用端口，不在 Phase 2 新增 L1 代码 |
