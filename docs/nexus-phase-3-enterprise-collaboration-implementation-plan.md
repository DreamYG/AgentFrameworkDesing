# Nexus Phase 3 实现计划：企业全局协同

> **来源蓝图**: `docs/nexus-enterprise-agent-middleware-complete-solution.md`  
> **阶段定位**: 在 Phase 1 框架内注册连接层能力包，实现企业知识、文档、会议、OA、通知等全局协同。  
> **交付原则**: 连接器能力包化、知识证据化、通知事件化、跨平台治理、独立运行。

---

## 阶段目标

Phase 3 负责企业连接层，目标是让 Nexus 成为企业系统之间的协同中枢，支持：

- 企业知识问答：跨知识库检索、带来源引用回答、权限过滤。
- 文档生成与维护：文档搜索、总结、翻译、更新、模板化生成。
- 会议纪要：会议创建、音频转录、纪要生成、行动项同步。
- OA 审批：请假、报销、会议室、流程审批的对话式处理。
- 多平台通知：飞书、钉钉、企微、邮件、日历等统一通知路由。
- 知识运营：知识过期检测、重复清理、技能分发、负迁移保护。

Phase 3 不依赖 Phase 2。它可以只基于 Phase 1 框架独立运行，也可以通过事件总线消费 Phase 1/2 发布的通知、知识和任务结果事件。

---

## 独立运行边界

| 边界 | 规则 |
|------|------|
| Phase 3 启动条件 | 只依赖 Phase 1 公共框架能力，不依赖 Phase 2 |
| 事件订阅 | `notification.requested`、`knowledge.synced`、`task.completed`、`task.acceptance_result` |
| 事件发布 | `notification.sent`、`knowledge.synced`、`knowledge.deprecated`、`approval.requested`、`approval.decided` |
| 数据边界 | Phase 3 维护知识索引、文档同步、会议纪要、通知记录、连接器状态 |
| 工具边界 | 外部系统通过 MCP Server / Connector Pack 接入，不直接写 Kernel 或其他 Phase |
| 权限边界 | 所有知识检索和文档操作必须继承用户、Agent、工具、数据范围四维权限 |
| 多租户 | 使用 Phase 1 预埋的 tenantId 贯穿全链路，Phase 3 做多租户加固验证 |

---

## 前置框架能力

| 能力 | 来源 | 使用方式 |
|------|------|----------|
| Gateway / Message Router | Phase 1 框架 | Bot、Webhook、HTTP、WS、CLI 入口 |
| Tool Gateway | Phase 1 框架 | 飞书、钉钉、企微、OA、文档、日历等 MCP 接入 |
| Agent Registry / Pack | Phase 1 框架 | 注册 Phase 3 AgentPack、ToolPack、ConnectorPack |
| Policy / Approval | Phase 1 框架 | 文档权限、OA 审批、通知范围控制 |
| Audit / Observability | Phase 1 框架 | 知识访问、审批、通知、文档修改留痕 |
| Memory / Skill Store | Phase 1 框架 | 知识问答、Skill 分发、组织知识沉淀 |
| Phase Bridge | Phase 1 框架 | 通知、知识、审批事件传递 |
| Cognitive Heatmap / Decision Chain | Phase 2 可观测层 | Phase 3 做 Console 可视化渲染 |
| OERCD 接口（S1 冻结） | Phase 1 框架 | Phase 3 填充 Distribute 实现 |

---

## 总体里程碑

| 周期 | 里程碑 | 关键交付 |
|------|--------|---------|
| W27-W28 | 企业知识体系 | RAG 管道、组织知识库、权限过滤、RAGAgent |
| W29-W30 | 文档与 Issue 协同 | DocumentAgent、IssueTriageAgent、文档/Issue MCP |
| W31-W32 | 会议、OA、日历 | MeetingAgent、OAAgent、CalendarAgent、多模态输入 |
| W33-W34 | 多平台连接器 | 飞书、钉钉、企微、OA、日历、通知路由 |
| W35-W36 | 高级协同 + 可视化 | PPT、跨平台事件、Console 热力图/决策链可视化 |
| W37-W38 | 学习闭环 + 多租户加固 | OERCD Distribute、Federation Guard、Curator、多租户验证 |
| W39-W40 | GA 联调与发布 | 三阶段联调、安全审计、性能优化、补偿日落 |

---

## W27-W28：企业知识体系

目标：构建企业知识问答与组织知识库，所有回答必须带来源、权限和置信度。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 14.1 | RAG 检索管道 | Qdrant 向量检索、Elasticsearch 关键词检索、RRF 融合、Reranker | `packages/memory/rag-pipeline.ts` |
| 14.2 | 组织知识库 MEM-4 | 多源文档接入、版本化、RBAC 权限继承、数据分级 | `packages/memory/org-knowledge.ts` |
| 14.3 | 情景记忆 MEM-2 | 同类协同任务经验检索、权限过滤 | `packages/memory/episodic-memory.ts` |
| 14.4 | 知识摄入管道 | PDF、Word、Markdown、网页、飞书文档解析、分块、嵌入 | `packages/memory/ingestion` |
| 14.5 | RAGAgent | 企业知识库问答、来源引用、低置信度标注 | `packages/phase-connection` |
| 14.6 | 数据权限过滤 | 用户身份、Agent Scope、数据密级、文档 ACL 四维过滤 | `packages/guardrails` |
| 14.7 | `knowledge.synced` 事件 | 知识摄入完成、版本更新、权限变更事件 | `packages/phase-connection/events` |
| 14.8 | Qdrant/ES 部署配置 | 索引、备份、容量、健康检查 | `packages/infra` |

验收标准：

- 用户可对企业知识库提问并获得带来源引用的回答。
- 无权限文档不可被检索或引用。
- 新知识同步后发布 `knowledge.synced`。
- RAG 结果可被审计追踪到文档 ID、段落位置和置信度。

---

## W29-W30：文档与 Issue 协同

目标：将文档和 Issue 平台接入 Nexus，支持搜索、生成、更新、分类和协同流转。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 15.1 | DocumentAgent | 文档搜索、生成、更新、总结、翻译、格式转换 | `packages/phase-connection` |
| 15.2 | IssueTriageAgent | Issue 分类、优先级、责任人建议、重复问题识别 | `packages/phase-connection` |
| 15.3 | KnowledgeOpsAgent | 知识质量维护、过期检测、重复清理、引用统计 | `packages/phase-connection` |
| 15.4 | `nexus-doc-mcp` | 文档 CRUD、搜索、权限、版本、评论 | `mcp-servers/doc` |
| 15.5 | `nexus-issue-mcp` | Issue CRUD、分配、状态流转、标签、评论 | `mcp-servers/issue` |
| 15.6 | 文档模板系统 | 周报、复盘、会议纪要、需求文档模板 | `packages/phase-connection/templates` |
| 15.7 | 外部内容隔离 | RAG、文档、Issue 内容统一 `<external_data>` 包裹 | `packages/providers/prompt-assembler` |
| 15.8 | Phase 3 Manifest | Agent、Connector、事件订阅、权限策略声明 | `packages/phase-connection/manifest.yaml` |

验收标准：

- 可根据对话生成带模板的项目文档。
- 可从 Issue 平台读取问题并给出分类、优先级和责任人建议。
- 文档更新必须保留版本和审计记录。
- 低信任外部内容不能提升为系统指令。

---

## W31-W32：会议、OA 与日历

目标：实现常见企业办公协同能力，包括会议纪要、OA 审批和日程管理。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 16.1 | MeetingAgent | 会议创建、会议资料准备、纪要生成、行动项同步 | `packages/phase-connection` |
| 16.2 | OAAgent | 请假、报销、会议室、采购、合同等对话式审批入口 | `packages/phase-connection` |
| 16.3 | CalendarAgent | 日程创建、冲突检测、每日总结、次日计划 | `packages/phase-connection` |
| 16.4 | `nexus-oa-mcp` | OA 审批、请假、报销、会议室 API 适配 | `mcp-servers/oa` |
| 16.5 | `nexus-calendar-mcp` | 飞书/Outlook 日历查询、创建、修改 | `mcp-servers/calendar` |
| 16.6 | 会议纪要解析引擎 | 音频转录、发言摘要、关键决策、行动项识别 | `packages/phase-connection/meeting` |
| 16.7 | 多模态输入管道 | 音频、视频关键帧、图片、文档解析 | `packages/phase-connection/multimodal` |
| 16.8 | OA 风险策略 | R2 普通审批、R3 资金/合同、R4 权限/凭据 | `packages/control-plane/approval-engine` |

验收标准：

- 可从会议录音生成纪要和行动项。
- 行动项可发布为 `task.created` 或同步到 PM 系统。
- OA 高风险审批必须进入 Approval Engine。
- 日历冲突检测不跨越用户授权范围。

---

## W33-W34：多平台连接器与通知路由

目标：建立统一多平台连接能力，使通知和协同动作不绑定单一平台。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 17.1 | `nexus-feishu-mcp` | 消息、文档、会议、审批、日历、人事 | `mcp-servers/feishu` |
| 17.2 | `nexus-dingtalk-mcp` | 消息、待办、审批、日历 | `mcp-servers/dingtalk` |
| 17.3 | `nexus-wecom-mcp` | 消息、文档、审批、通讯录 | `mcp-servers/wecom` |
| 17.4 | 飞书/钉钉/企微 Bot Channel | Webhook、签名验证、消息解析、身份映射 | `apps/api-gateway/channels` |
| 17.5 | Notification Router | 统一通知出口、平台选择、降级、幂等发送 | `packages/phase-connection/notification` |
| 17.6 | 通知模板与卡片 | 文本、富文本、审批卡片、任务卡片 | `packages/phase-connection/templates` |
| 17.7 | 多平台身份映射 | 外部用户 ID → Nexus UserId/TenantId | `packages/control-plane/policy-engine` |
| 17.8 | 连接器健康监控 | ping、rateLimit、凭据过期、降级告警 | `packages/tool-gateway` |

验收标准：

- 同一 `notification.requested` 可根据策略发送到飞书、钉钉或企微。
- 平台不可用时可降级到备选平台或邮件。
- 重复通知通过 idempotencyKey 去重。
- 所有通知记录可审计。

---

## W35-W36：高级协同能力与可观测可视化

目标：补齐富媒体输出、跨 Phase 协同；将 Phase 2 已实现的认知热力图和决策链做 Console 可视化。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 18.1 | PPTGeneratorAgent | 项目汇报、周报、复盘 PPT 自动生成 | `packages/phase-connection` |
| 18.2 | `nexus-ppt-mcp` | PPT 生成、模板管理、导出 | `mcp-servers/ppt` |
| 18.3 | 跨 Phase 协同事件 | `task.completed` → 通知、文档归档、知识同步 | `packages/phase-connection/events` |
| 18.4 | Console 热力图可视化 | 渲染 Phase 2 生成的 Cognitive Heatmap 数据为热力图 UI | `apps/console` |
| 18.5 | Console 决策链可视化 | 渲染 Decision Chain 记录为可交互决策追溯 UI | `apps/console` |
| 18.6 | Explainability API | `/decisions`、`/heatmap`、`/explain/{turnIndex}` HTTP 端点 | `packages/observability/explainability-api.ts` |
| 18.7 | 多 Phase 事件链路可视化 | 通过 correlationId 追踪跨 Phase 事件流 | `apps/console` |
| 18.8 | 外部输出安全 | 文档、PPT、通知中的 PII/密钥/内部 IP 脱敏 | `packages/guardrails` |

**说明**：
- Cognitive Heatmap 和 Decision Chain 的数据采集/记录已在 Phase 2 W23-W24 实现（`packages/observability`）。
- Phase 3 本里程碑仅负责 Console 可视化渲染和 Explainability API HTTP 端点，不重复实现采集逻辑。
- 可视化对三个 Phase 的 AgentRun 均生效（横切能力）。

验收标准：

- 可基于项目数据生成汇报 PPT。
- 管理控制台可展示热力图和决策链。
- 关键决策可通过 Explainability API 查询。
- 跨 Phase 事件链路能通过 correlationId 追踪。
- 富媒体输出必须经过输出安全扫描。

---

## W37-W38：学习闭环、联邦守卫与多租户加固

目标：完成企业协同场景下的知识沉淀、知识分发和多租户隔离加固验证。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 19.1 | OERCD Distribute 实现 | Self、Peer、Cross-Phase、Organization 分发（填充 Phase 1 冻结的 `IDistributePhase` 接口） | `packages/kernel/oercd` |
| 19.2 | Knowledge Federation Guard | 负迁移评估、A/B 对照、自动回滚 | `packages/memory/federation-guard.ts` |
| 19.3 | Knowledge Curator | 技能剪枝、过期检测、相似技能合并、替代推荐 | `packages/kernel/oercd` |
| 19.4 | AutonomyScore 完整实现 | 信任分、风险、可逆性、上下文熟悉度、自主权 | `packages/control-plane/policy-engine` |
| 19.5 | 多租户隔离加固验证 | 验证 tenantId 贯穿事件、审计、记忆、RAG、连接器的完整隔离 | 全链路 |
| 19.6 | 数据保留策略 | 数据生命周期、归档、删除、合规导出 | `packages/infra` |
| 19.7 | 反面案例库 | 失败协同案例沉淀，供后续计划规避 | `packages/memory` |
| 19.8 | 流式背压完整实现 | `IAgentStreamBroker` ACK、重放、慢消费者降级 | `packages/observability` |

**多租户加固说明**：

```
Phase 1 W5-W6 已预埋 tenantId：
  • 所有数据库表含 tenantId 列
  • PhaseBridgeEvent 信封含 tenantId
  • 审计日志含 tenantId
  • Phase 1 以 SingleTenantGuard 补偿能力运行

Phase 3 W37-W38 多租户加固验证：
  • 验证跨租户事件不会泄露（事件消费按 tenantId 过滤）
  • 验证 RAG 检索不跨越租户边界（向量索引 + 权限过滤）
  • 验证连接器凭据按租户隔离（Secret 存储 + 访问控制）
  • 验证审计按租户可查询/导出
  • 压测：模拟多租户并发，验证无数据串扰
  • 验证通过后日落 SingleTenantGuard 补偿能力
```

验收标准：

- 高质量知识可按范围分发。
- 分发后出现负迁移可自动回滚。
- 租户间知识、审计、连接器凭据完全隔离（验证通过）。
- 过期知识能被 Curator 标记并推荐替代。
- SingleTenantGuard 补偿能力满足日落条件。

---

## W39-W40：GA 联调与发布

目标：完成三阶段联调、安全审计和 GA 候选发布。

| # | 任务 | 产出 | 模块 |
|---|------|------|------|
| 20.1 | 三阶段联调 | Phase 1 任务 → Phase 2 执行 → Phase 3 通知/归档/知识同步 | `evals/` |
| 20.2 | 企业协同 E2E 场景 | 知识问答、会议纪要、OA 审批、通知、多平台失败降级 | `evals/` |
| 20.3 | 安全审计 | 权限越权、Prompt 注入、PII 泄露、连接器凭据、审计完整性 | 安全 |
| 20.4 | 性能优化 | RAG 延迟、通知吞吐、连接器限流、缓存命中率 | 全链路 |
| 20.5 | 补偿层日落评估 | `ISunsetEngine` 评估并下线已替代补偿能力（含 SingleTenantGuard） | `packages/control-plane/sunset-engine` |
| 20.6 | 运维手册 | 连接器故障、知识同步失败、审批超时、通知失败处理 | `docs/` |
| 20.7 | GA 候选发布 | 灰度、监控、告警、回滚方案 | 运维 |

GA 验收：

| 指标 | GA 目标 |
|------|---------|
| 系统可用性 | >= 99.5% |
| 审计链路完整率 | 100% |
| RAG 回答来源引用率 | >= 95% |
| 无权限知识泄露 | 0 |
| 通知送达率 | >= 95% |
| Checkpoint 恢复成功率 | >= 99% |
| 高危安全事件 | 0 |
| 知识联邦负迁移回滚率 | <= 5% |
| 多租户隔离验证 | 100% 通过 |
| 前缀缓存命中率 | >= 85% |

---

## Phase 3 能力包结构

```text
packages/phase-connection/
├── src/
│   ├── agents/
│   │   ├── rag-agent.ts
│   │   ├── document-agent.ts
│   │   ├── issue-triage-agent.ts
│   │   ├── meeting-agent.ts
│   │   ├── oa-agent.ts
│   │   ├── calendar-agent.ts
│   │   ├── knowledge-ops-agent.ts
│   │   └── ppt-generator-agent.ts
│   ├── notification/
│   ├── meeting/
│   ├── multimodal/
│   ├── templates/
│   ├── events/
│   └── policies/
└── manifest.yaml
```

---

## Connector 清单

| Connector | 类型 | 覆盖能力 | 风险等级 |
|-----------|------|----------|----------|
| `nexus-feishu-mcp` | MCP Server | 消息、文档、会议、审批、日历、人事 | R0-R3 |
| `nexus-dingtalk-mcp` | MCP Server | 消息、待办、审批、日历 | R0-R3 |
| `nexus-wecom-mcp` | MCP Server | 消息、文档、审批、通讯录 | R0-R3 |
| `nexus-oa-mcp` | MCP Server | 审批、请假、报销、会议室 | R1-R4 |
| `nexus-doc-mcp` | MCP Server | 文档 CRUD、搜索、权限 | R0-R2 |
| `nexus-issue-mcp` | MCP Server | Issue CRUD、分配、状态流转 | R0-R2 |
| `nexus-ppt-mcp` | MCP Server | PPT 生成、模板管理、导出 | R0-R1 |
| `nexus-calendar-mcp` | MCP Server | 日历查询、创建、修改 | R0-R2 |

---

## Phase 3 风险与控制

| 风险 | 控制措施 |
|------|----------|
| 知识越权泄露 | RAG 前置权限过滤、数据密级、审计抽检 |
| Prompt 注入污染文档生成 | 外部内容隔离、Guardrails 扫描、低信任来源标注 |
| 连接器凭据泄露 | Secret Manager、短期缓存、审计、最小权限 |
| 多平台通知重复或风暴 | idempotencyKey、限流、通知策略、慢消费者降级 |
| OA 高风险误操作 | R3/R4 审批、多审批人、可逆性检查 |
| 知识联邦负迁移 | Federation Guard、A/B 对照、自动回滚 |
| RAG 延迟过高 | 混合检索缓存、RRF 限流、异步索引、分层索引 |
| 多租户隔离不彻底 | Phase 1 预埋 tenantId + Phase 3 加固验证 + 日落 SingleTenantGuard |
| 热力图/决策链数据依赖 Phase 2 | 若 Phase 2 未部署，Console 可视化优雅降级（显示"无数据"） |
