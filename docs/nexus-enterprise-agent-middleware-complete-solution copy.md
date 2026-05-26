# Nexus 企业级 Agent 中间件完整解决方案

> **版本**: v3.1 落地加固版（v3.0 三方融合版 → 工程契约自洽修订）  
> **日期**: 2026-05-26  
> **状态**: 完整解决方案（生产级架构蓝图，按 MVP/Beta/GA 分阶段落地验证，Phase 0a 契约冻结期前需完成 §22 决策记录裁决）  
> **核心定位**: Nexus 是企业级 AI 认知中间件，负责把自然语言意图转化为可审计、可治理、可恢复、可持续学习的企业系统操作。
> 
> **v3.1 修订摘要**：  
> - 修复 v3.0 的 9 项内部矛盾（成本公式三套并行、IAgentRuntime 端口分裂、Cache 命中率"设计保证 vs 设计目标"等）  
> - 补齐 12 项无法落地的接口/算法缺口（`AgentRun`/`FailureContext`/`SunsetEvaluation`/Cache-Aware Compact 算法等）  
> - 加固 13 项隐性架构风险（`waiting_external` admin 恢复、SessionShadow Redis 故障降级、L3 Compact 端口化等）  
> - 新增 §22「架构决策记录（ADR）」与 §23「单一真相源对照表」，固化 Phase 0a 契约冻结期产出

---

## 版本演进说明

本文档为三份子方案的统一融合版本，演进路径如下：

| 版本 | 来源文档 | 核心贡献 |
|------|---------|---------|
| v1.0 基线 | `nexus-enterprise-agent-middleware-architecture.md` | 总体分层、AgentRun 状态机、五层记忆、控制面、安全护栏、三阶段积木式设计 |
| v2.0 演进 | `nexus-enterprise-agent-middleware-optimization-plan.md` | 薄内核/强控制面/可插拔/可日落四层骨架、能力分层 S0-S5、领域模型补齐、知识联邦守卫、Connector 市场化治理 |
| v2.0 深度创新 | `nexus-deep-innovation-optimization.md` | 七大架构创新：金字塔级联 Compact、双轨影子代理、韧性推理循环、Prompt Cache 战略、环境回填、优雅停机排水、认知热力图 |
| **v3.0 融合版**（本文档） | 上述三份方案融合 | 在 v1.0 基线之上整合 v2.0 演进的契约规范与 v2.0 深度创新的七大机制，形成可进入分阶段工程实施与验证的完整蓝图 |

**核心整合原则**：
- **增量融合，不破坏向后兼容** —— 所有 v2.0 创新均为对 v1.0 接口的扩展
- **稳定性分级管理** —— 借鉴 v2.0 演进的 S0-S5 分级，明确每个接口的变更承诺
- **盲区驱动增强** —— 按 v2.0 深度创新识别的 B1-B7 七大结构性盲区逐项加固
- **能力包化交付** —— 创新机制以可插拔能力包形式提供，渐进引入不阻塞主线

---

## 一、建设目标与总体定位

### 1.1 业务目标

| 阶段 | 时间 | 目标 |
|------|------|------|
| Phase 1 — 意图层 | W7-W14 | 自然语言驱动项目管理：需求分析、任务拆解、进度追踪、风险诊断、智能催办 |
| Phase 2 — 执行层 | W15-W26 | 端到端工程自动化：接收任务→代码实现→测试→审查→部署→验收 |
| Phase 3 — 连接层 | W27-W40 | 企业全局协同：知识问答、文档生成、会议纪要、OA 审批、多平台通知 |

### 1.2 平台定位

```
传统企业架构：
  用户 → Web 前端 → 业务后端 → 数据库（被动响应）

Nexus 认知中间件架构：
  用户（自然语言）
       │
       ▼
  ┌─────────────────────────────────────────────────────┐
  │              Nexus 认知中间件                          │
  │  理解 → 规划 → 执行 → 验证 → 学习（主动认知循环）    │
  └──────────────────────┬──────────────────────────────┘
                         │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
  项目管理系统      Git/CI-CD       飞书/钉钉/OA/文档/PPT
```

### 1.3 最终能力形态

**自然语言输入示例**：

```
"帮我把上周产品同步会里提到的用户反馈整理成需求，拆分到Q3迭代计划里，
 高优的任务自动分配给研发团队，低优的先排到backlog，然后在飞书群里同步一下"
```

**Nexus 执行链路**：

```
1. 意图理解 → 识别出：整理需求 + 拆分任务 + 分配 + 通知
2. 信息收集 → 检索会议纪要、用户反馈文档
3. 需求结构化 → 生成 WorkItem（Story/Task 级别）
4. 优先级判定 → 基于历史数据 + 业务规则打分
5. 智能分配 → 匹配团队成员能力和负载
6. 排期规划 → 高优进 Q3 Sprint，低优进 Backlog
7. 通知同步 → 飞书群发送结构化消息
8. 知识沉淀 → OERCD 学习心跳记录本次操作模式
```

---

## 二、核心架构原则

### 2.1 四层演进骨架

```
┌─────────────────────────────────────────────────────────────────┐
│ L4: 可卸载补偿层 (Sunset-Ready Compensation)                     │
│     • 临时兼容适配器、过渡桥接模块                                │
│     • 设计时即标记"日落日期"，到期自动废弃                       │
├─────────────────────────────────────────────────────────────────┤
│ L3: 可插拔能力包 (Pluggable Capability Packs)                    │
│     • Phase 1/2/3 各自独立的 Agent + Tool 集合                   │
│     • 通过 Manifest 声明依赖，热插拔无需重启内核                  │
├─────────────────────────────────────────────────────────────────┤
│ L2: 强控制面 (Control Plane)                                     │
│     • 注册中心、策略引擎、审批、审计、预算、调度                  │
│     • 提供全局治理能力，能力包通过控制面获取授权                  │
├─────────────────────────────────────────────────────────────────┤
│ L1: 薄内核 (Thin Kernel) — 即 Agent Harness 发动机层              │
│     • Query Loop + Compact Engine + Checkpoint + Lifecycle     │
│     • Tool/Memory 以端口形式外置，见 §3.4 Harness 包映射         │
│     • 极度稳定，版本迭代周期 > 6 个月                            │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 长期稳定原则

| 原则 | 含义 | 反面教材 |
|------|------|---------|
| **薄内核** | Kernel 只负责推理循环，不含业务逻辑 | 在 Query Loop 里写项目管理代码 |
| **强控制面** | 所有治理（权限/审批/审计/预算）集中管控 | 每个 Agent 自行实现权限检查 |
| **能力包化** | 业务功能以标准包形式注册，可独立升级 | Phase 2 Agent 直接 import Phase 1 内部模块 |
| **策略驱动** | 行为由配置决定而非硬编码 | `if (toolName === 'deploy') requireApproval()` |
| **事件解耦** | 阶段间通过 Phase Bridge 协议通信 | Phase 2 直接调 Phase 1 的函数 |
| **证据优先** | 任何决策/学习必须有可回溯证据链 | 技能库里出现来源不明的条目 |
| **补偿可日落** | 临时兼容方案设计时即标注过期日期 | 适配器越积越多成为技术债 |

### 2.3 能力分层演进速度

| 层 | 代号 | 变更频率 | 兼容承诺 | 灰度策略 | 治理要求 |
|----|------|---------|---------|---------|---------|
| S0 | 不可变（事件信封格式、错误码） | 永不变更 | 永远向后兼容 | 不适用 | 任何变更视为 break |
| S1 | 内核 (Kernel) | 年 ≤2 次 | 大版本保证 24 月 | 影子流量验证 + 双版本并行 6 月 | 全量回归 + 灰度 |
| S2 | 控制面 (Control Plane) | 季度级 | 小版本保证 6 月 | 灰度 10% → 50% → 100%（周级） | 策略变更审批 |
| S3 | 核心能力包 (Core Packs) | 月级 | Pack API 保证 3 月 | Feature Flag 按租户灰度 | Agent 定义变更审核 |
| S4 | 业务/工具适配器 (Biz Packs) | 周级 | 社区包不承诺兼容 | 用户手动升级 | Schema 校验 + 集成测试 |
| S5 | 补偿层 (Compensation) | 临时 — 有日落日期 | 不承诺兼容 | 日落条件自动评估 | 到期自动下线告警 |

### 2.4 七项结构性盲区诊断与覆盖

> 来自 v2.0 深度创新审计——在 v1.0 基线之上识别的盲区，本文档逐项给出加固方案。  
> **v3.1 修订**：每项盲区显式映射到 §18 落地路线图周次，避免「架构有加固章节但路线图无对应交付」的脱节。

| 编号 | 盲区 | 影响 | 严重度 | 本文档加固章节 | §18 落地周次 | 验收指标 |
|------|------|------|--------|--------------|------------|---------|
| B1 | **推理循环韧性缺失** | Query Loop 缺乏异常降级和自愈机制，单次工具失败可导致 AgentRun 崩溃 | 🔴 Critical | §5.6 韧性推理循环引擎 | Phase 0b W7–W10 | §19.5 工具异常自愈率 ≥70% |
| B2 | **上下文防爆体系单薄** | 仅有触发条件描述，缺少时间间隔感知和证据保留机制 | 🔴 Critical | §9.3 金字塔级联 Compact 体系 | Phase 0b W7–W10（L1/L4）+ Phase 1 W15–W18（L2/L3） | §19.6 Compact 缓存失效率 ≤0.10 |
| B3 | **Prompt Cache 战略缺失** | 缺少系统级缓存策略，无法稳定提升前缀缓存命中率 | 🟠 High | §17.6 Prompt Cache 战略体系 | Phase 0c W11–W14 | §19.6 Cache 命中率 ≥0.85（设计目标） |
| B4 | **记忆系统缺少影子代理模式** | 记忆更新阻塞主推理循环 | 🟠 High | §9.5 双轨影子记忆代理体系 | Phase 1 W15–W18 | SessionShadow P95 写入 <50ms |
| B5 | **流式输出架构未定义** | 需要统一事件类型、背压控制、多消费者广播与断线重放契约 | 🟠 High | §20.13 流式事件联合类型增强 | Phase 0c W11–W14 | §19.5 流式中断恢复率 ≥90% |
| B6 | **优雅停机与状态排水缺失** | 仅提及 Checkpoint，未定义 SIGTERM 后的多卡点落盘 | 🟡 Medium | §5.7 优雅停机与状态排水机制 | Phase 0b W7–W10 | §19.5 已确认状态零丢失率 =100% |
| B7 | **工具系统缺少环境回填机制** | 工具执行后的环境变更无法自动感知和回填 | 🟡 Medium | §7.7 环境感知与状态回填引擎 | Phase 1 W15–W18 | 环境快照采集 P95 <500ms |

> **硬约束**：未完成对应周次交付的盲区，不得进入下一 Phase 的「GA 候选」评审。详见 §18.0 Phase 0a 契约冻结期。

---

## 三、总体架构

### 3.1 总体分层

```
┌══════════════════════════════════════════════════════════════════════════════┐
║                           接入层 (Gateway Layer)                            ║
║  HTTP API    WebSocket    gRPC    CLI    飞书Bot    钉钉Bot    WeCom Bot   ║
║  ┌────────────────────────────────────────────────────────────────────────┐║
║  │ Message Router: 协议归一化 → 签名验证 → 消息去重 → 身份映射 → 限流  │║
║  └────────────────────────────────────────────────────────────────────────┘║
╠══════════════════════════════════════════════════════════════════════════════╣
║                     控制面 (Control Plane)                                  ║
║  Intent Router │ Agent Registry │ Approval Engine │ Audit Engine           ║
║  Policy Engine │ Run Manager    │ Budget Manager  │ Scheduler              ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                     运行时 (Agent Runtime)                                  ║
║  Query Loop │ State Graph │ External Adapter │ Lifecycle Hooks             ║
║  Compact Engine │ Checkpoint Store │ Delegate Engine │ OERCD Loop          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                     横切能力 (Cross-Cutting)                                ║
║  Memory & RAG │ Unified Tool Gateway │ Guardrails │ Observability          ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                     Provider 适配层                                         ║
║  OpenAI │ Anthropic │ Local (Ollama/vLLM) │ Smart Router                  ║
╠══════════════════════════════════════════════════════════════════════════════╣
║                     基础设施 (Infrastructure)                               ║
║  PostgreSQL │ Redis │ Qdrant │ MinIO │ Kafka/BullMQ │ Elasticsearch        ║
╚══════════════════════════════════════════════════════════════════════════════╝
```

### 3.2 三阶段独立运行拓扑

```
┌─────────────────────────────────────────────────────────────────────┐
│                  Nexus Phase Bridge (事件总线)                        │
│  task.* ◀──▶ notification.* ◀──▶ knowledge.* ◀──▶ approval.*       │
└──────┬──────────────────────┬───────────────────────┬───────────────┘
       │                      │                       │
┌──────▼──────────┐  ┌───────▼───────────┐  ┌───────▼───────────┐
│ Phase 1         │  │ Phase 2            │  │ Phase 3            │
│ 意图层 (Intent) │  │ 执行层 (Execute)   │  │ 连接层 (Connect)   │
│ ──────────────  │  │ ────────────────   │  │ ────────────────   │
│ 独立进程/容器   │  │ 独立进程/容器      │  │ 独立进程/容器      │
│ 独立DB Schema   │  │ 独立DB Schema      │  │ 独立DB Schema      │
│ 独立API端点     │  │ 独立API端点        │  │ 独立API端点        │
│ 可单独部署升级  │  │ 可单独部署升级     │  │ 可单独部署升级     │
└─────────────────┘  └───────────────────┘  └───────────────────┘

设计硬约束：
• 任何一个 Phase 可以单独启动并提供服务（运行时独立 ≠ 业务独立）
• Phase 1 不依赖 Phase 2/3 的存在
• Phase 2 只需通过事件总线监听 task.assigned_to_ai 事件
• Phase 3 只需通过事件总线监听 notification.requested 和 knowledge.synced 事件

**Phase Bridge SPOF 与 Schema 演进规约（v3.1 新增）**：

| 议题 | 规约 |
|------|------|
| **总线高可用** | 共享 Redis/BullMQ 必须部署 ≥3 节点 Sentinel/Cluster；单 AZ 故障不影响 Phase 启动；月度故障演练验证 |
| **事件 `schemaVersion` 演进** | 仅允许向前兼容增量（增加可选字段）；删除/重命名/类型变更需经历「双写双读 4 周 → 旧 schema 弃用通知 4 周 → 物理移除」共 8 周窗口 |
| **消费者降级** | 收到未知 `schemaVersion` 必须丢入 `dead-letter-queue.{event.type}` 而非崩溃；DLQ 由 §6 控制面 Audit Engine 周期巡检 |
| **业务依赖透明化** | Phase 2/3 启动时必须声明 `dependsOn: [Phase1.task.assigned_to_ai]` 等业务事件；运维 Dashboard 显示「业务依赖图」与「运行时独立性」两个视图 |
| **跨 Phase Schema Registry** | `apps/api-gateway/schema-registry` 必须在 Phase 0b 上线；所有 `PhaseBridgeEvent.type` 必须在 Registry 注册才允许发布 |
```

### 3.3 内核职责边界

| 组件 | 职责 | 不做什么 |
|------|------|---------|
| Query Loop | 推理循环 + 工具分发 + 终止判定 | 不做业务路由、不做审批判定 |
| Compact Engine | 上下文压缩 + Token 预算适配 | 不做知识检索、不做记忆持久化 |
| Checkpoint Store | 状态快照 + 恢复 | 不做调度、不做超时管理 |
| Tool Gateway | 工具路由 + 前后置管线 | 不做工具实现、不做业务逻辑 |
| Lifecycle Hooks | 钩子注册 + 按序执行 | 不做钩子逻辑实现 |
| Delegate Engine | 子Agent派生 + 权限锁死 | 不做子Agent调度、不做结果合并 |
| State Graph Engine | 有向图节点调度、边转换、中断/恢复 | 不含编排策略选择（由 Control Plane 注入） |
| Environment Injector | 冷启动环境快照 + 运行时回填触发 | 不做 Prompt 六层组装（由 providers 负责） |

### 3.4 Agent Harness 工程结构（洋葱模型与包映射）

> **术语说明**：Nexus 中的 **Agent Harness** = 除 LLM API 之外、使 Agent 具备感知、执行、记忆、预算与拦截能力的运行时宿主工程。概念借鉴 Claude Code Harness；企业版将 Tool Gateway、Memory、治理外置为独立包，内核只保留推理环与稳定契约。

#### 3.4.1 Harness 洋葱模型（由外向内）

```
┌─────────────────────────────────────────────────────────────────────────┐
│  L6 治理外壳 — Control Plane + Guardrails（审批/预算/策略/注入扫描）     │
├─────────────────────────────────────────────────────────────────────────┤
│  L5 手脚层 — packages/tool-gateway（MCP/REST + 权限 + 审计 + 自愈回填）  │
├─────────────────────────────────────────────────────────────────────────┤
│  L4 记忆层 — packages/memory（SessionShadow / 情景 / 技能 / RAG）        │
│         │                                                                 │
│         └── 端口下沉至 L3：IMemorySummaryProvider（仅供 L3 Compact 调用） │
├─────────────────────────────────────────────────────────────────────────┤
│  L3 防爆层 — kernel/compact（L1 Time-Gap → L2 Evidence → L3 Graft → L4）│
│         ▲                                                                 │
│         │ 依赖 IMemorySummaryProvider 端口（接口在 kernel/ports，         │
│         │ 实现注入由 control-plane 完成）；kernel 不直接 import memory   │
├─────────────────────────────────────────────────────────────────────────┤
│  L2 发动机 — kernel/query-engine（Query Loop + resilient-loop Phase A-D）│
├─────────────────────────────────────────────────────────────────────────┤
│  L1 环境感知 — kernel/environment + IPromptAssembler 端口（dynamic 注入） │
│         │                                                                 │
│         └── L0 Provider 通过 IPromptAssembler 反向消费环境数据            │
│             （依赖倒置：providers 持有端口，environment 注入实现）        │
├─────────────────────────────────────────────────────────────────────────┤
│  L0 大脑 — packages/providers（LLM API，流式 + Tool Calling + Cache）   │
└─────────────────────────────────────────────────────────────────────────┘

设计原则：内层不知道业务 Phase；外层失败不击穿 L0/L2（洋葱式防御，§2.2）。

跨层访问硬约束（v3.1 修订）：
• 内层 import 外层包 = 违规（CI 检查）；必须通过 kernel/ports 下的端口接口反向注入
• L3 Compact 需要会话摘要时：调用注入的 IMemorySummaryProvider，而非 import memory
• L1 Environment 需要拼装 Prompt 时：实现 IPromptAssembler.collectDynamic()，由 L0 Provider 在调用前 pull
• L3 Compact 在 IMemorySummaryProvider 不可用时（如 SessionShadow Redis 故障）：自动降级到 L2 Evidence-Only Compact，发射 nexus.shadow.unavailable 事件
```

#### 3.4.2 Claude Code Harness → Nexus 包映射

| Harness 子系统（CC） | Nexus 模块 | Monorepo 路径 |
|---------------------|-----------|---------------|
| CLI 入口 | Gateway + CLI | `apps/api-gateway`, `apps/cli` |
| QueryEngine（会话底盘） | Run Manager + IAgentRuntime | `control-plane/run-manager`, `kernel/query-engine` |
| query.ts（推理环） | Query Loop + Resilient Loop | `kernel/query-engine/query-loop.ts`, `resilient-loop.ts` |
| context.ts | Environment Injector + Prompt Assembler | `kernel/environment/`, `providers/prompt-assembler.ts` |
| Tool.ts + 权限 | Tool Gateway + Approval | `tool-gateway/`, `control-plane/approval-engine` |
| compact/ | 金字塔级联 Compact | `kernel/compact/*` |
| sessionMemory | SessionShadow | `memory/session-shadow.ts` |
| extractMemories | OERCD + KnowledgeCrystallizer | `kernel/oercd/`, `memory/knowledge-crystallizer.ts` |
| Hooks | Lifecycle Hook Registry | `kernel/lifecycle/hooks.ts` |
| 持久化/恢复 | Checkpoint + Graceful Shutdown | `kernel/checkpoint/`, `lifecycle/graceful-shutdown.ts` |

#### 3.4.3 Harness 五阶段生命周期（端到端）

```
① 冷启动 & 环境装载
   Gateway/CLI → Run Manager 创建 AgentRun → EnvironmentInjector.collect()
   → Prompt Assembler 输出 stable_prefix + dynamic_suffix（§17.5-17.6）

② 主循环（心跳）
   resilient-loop: Phase A(Pre-Flight) → Phase B(LLM+降级) → 流式 yield
   → Compact 级联预判/执行（§9.3）→ 预算检查

③ 工具执行
   PreTool Hook → Tool Gateway（Schema/权限/审批）→ 执行 → PostTool
   → ContextBackfiller.apply() → 错误自愈回填（§7.6-7.7）

④ 后台影子（非阻塞）
   PostSampling → SessionShadow 增量摘要（§9.5）
   Run 结束 → KnowledgeCrystallizer → OERCD Reflect/Crystallize（§15）

⑤ 终止 & 持久化
   无 tool_use / 预算耗尽 → PostComplete → Checkpoint 卡点落盘
   SIGTERM → GracefulShutdown 三阶段排水（§5.7）
```

#### 3.4.4 QueryEngine 与 Run Manager 职责分界

| 角色 | 归属 | 职责 | 类比（Claude Code） |
|------|------|------|---------------------|
| **Run Manager** | Control Plane | AgentRun CRUD、状态机、调度、超时、并发、审批挂起恢复 | QueryEngine 外壳（会话生命周期） |
| **Query Loop** | Kernel / Harness | 单 Run 内 `while` 推理环、工具分发、流式事件、终止判定 | query.ts 状态机 |
| **Resilient Loop** | Kernel / Harness | 包裹每轮 Turn 的 Phase A-D 防御层 | query.ts 错误处理增强 |
| **IAgentRuntime** | Kernel 对外端口 | **生命周期方法**：`start(spec)` / `resume(runId, fromCheckpoint?)` / `cancel(runId, reason)`<br>**会话调用方法**：`invoke(runId, message)` / `stream(runId, message)`<br>**自省方法**：`getAvailableTools(ctx)` / `healthCheck()` | QueryEngine.submitMessage |

**硬约束**：
- Run Manager 不实现推理逻辑；Query Loop 不直接改 AgentRun 状态机（通过事件/回调通知 Run Manager）
- IAgentRuntime 完整 TypeScript 定义见 §20.1；v3.1 修订统一了「生命周期 + 会话调用 + 自省」三组方法，消除 v3.0 端口签名分裂
- `AgentContext`、`HealthStatus`、`AgentRunSpec` 等公共类型定义见 §20.14 单一真相源

---

## 四、接入层与消息路由

### 4.1 接入通道

| 通道 | 协议 | 认证方式 | 特点 |
|------|------|---------|------|
| HTTP API | REST/JSON | Bearer Token (JWT) | 标准 API 接入 |
| WebSocket | WS/WSS | 握手时 Token 认证 | 实时双向通信、流式响应 |
| gRPC | HTTP/2 + Protobuf | mTLS 或 Token | 内部服务间高性能通信 |
| CLI | 本地 Socket / HTTP | 本地凭据文件 | 开发者日常使用 |
| 飞书 Bot | HTTP Webhook | 签名验证 | 企业 IM 接入 |
| 钉钉 Bot | HTTP Webhook | 签名验证 | 企业 IM 接入 |
| WeCom Bot | HTTP Webhook | 企业签名 | 企业微信接入 |

### 4.2 Message Router 职责流程

```
外部消息到达
    │
    ▼
┌──────────────────┐
│ 协议归一化        │ ← 将各渠道消息转为统一 NexusMessage 格式
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 签名/Token 验证  │ ← 校验来源合法性，拒绝伪造请求
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 消息去重 (Redis) │ ← 基于 messageId 幂等性保证
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 身份映射          │ ← 外部用户 ID → Nexus 统一身份（UserId + TenantId）
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 限流 (Rate Limit)│ ← 按用户/租户/Agent 维度令牌桶限流
└────────┬─────────┘
         │
         ▼
  分发至 Control Plane → Intent Router
```

### 4.3 接入层强制策略

| 策略 | 说明 | 违规处理 |
|------|------|---------|
| 签名必须校验 | 所有 Webhook 入口必须验证平台签名 | 拒绝请求 + 安全告警 |
| 消息必须去重 | 同一 messageId 在 TTL 内仅处理一次 | 返回上次结果（幂等） |
| 身份必须映射 | 无法映射身份的请求不允许进入控制面 | 返回 401 + 记录审计 |
| 限流必须生效 | 超出配额的请求直接拒绝 | 返回 429 + 降级提示 |
| 请求必须超时 | 接入层整体超时上限 30s | 超时返回异步任务 ID |

---

## 五、Agent Runtime 与运行时契约

### 5.1 Runtime 形态

| 形态 | 适用场景 | 特点 |
|------|---------|------|
| **Query Loop** | 单轮/多轮对话式任务 | 推理→工具→循环，直到自然终止 |
| **State Graph** | 复杂多步骤工作流 | 有向图状态机，节点间显式转移 |
| **External Adapter** | 桥接外部 Agent/系统 | 将外部系统包装为 Nexus Agent 运行实例 |

> **实现归属**：Query Loop / State Graph 执行引擎在 `packages/kernel/`（Harness L2）；AgentRun 生命周期与调度在 `control-plane/run-manager`（见 §3.4.4）。State Graph 的图定义与 `IGraphNode`/`IGraphEdge` 契约见 §20.6。

### 5.2 AgentRun 状态机

```
                         ┌──────────┐
                         │ created  │
                         └────┬─────┘
                              │ Scheduler 分配资源
                         ┌────▼─────┐
        ┌────────────────│ running  │────────────────┐
        │                └──┬───┬───┘                │
        │ 需审批              │   │ 需外部事件/预算/停机 │ 成功/失败/取消
        ▼                    │   ▼                    ▼
┌────────────────┐           │ ┌────────────────┐ ┌───────────┐
│waiting_approval│           │ │waiting_external│ │ succeeded │
└───────┬────────┘           │ └───────┬────────┘ └───────────┘
        │ 审批到达            │         │ 回调到达
        └──────────────┐     │         └──────────────┐
                       ▼     ▼                        │
                 ┌──────────────┐                     │
                 │waiting_budget│                     │
                 └──────┬───────┘                     │
                        │ 预算补充/人工恢复             │
                        ▼                              │
                 ┌──────────┐                          │
                 │ resuming │──────────────────────────┘
                 └────┬─────┘
                      │ Checkpoint 加载成功
                      ▼
                   running

        SIGTERM/SIGINT ─▶ draining ─▶ waiting_external / succeeded
        不可恢复错误 ─▶ failed ─▶ handed_over
        用户/系统取消 ─▶ cancelled
```

### 5.3 状态转移规则

| 当前状态 | 事件 | 目标状态 | 前置条件 |
|---------|------|---------|---------|
| created | scheduler.dispatch | running | 资源可用 + 预算充足 |
| running | tool.require_approval | waiting_approval | 工具风险等级 ≥ R2 或策略判定需要审批 |
| running | external.event_needed | waiting_external | 需等待异步回调 |
| running | run.complete | succeeded | 任务自然终止 |
| running | budget.exhausted | waiting_budget | Checkpoint 已同步落盘，等待预算补充或人工处置 |
| running | timeout.exceeded | failed | 超过最大执行时间且恢复策略不可用 |
| waiting_approval | approval.granted | running | 审批人批准 |
| waiting_approval | approval.denied | failed | 审批人拒绝 |
| waiting_approval | approval.timeout | handed_over | 超过审批等待上限 |
| waiting_external | event.received | running | 外部事件到达 |
| waiting_external | admin.resume | resuming | **v3.1 新增**：管理员 API 或 Cron 巡检触发恢复（处理 K8s 重启后无 event 触发场景） |
| waiting_external | run.timeout | handed_over | **v3.1 新增**：等待外部事件超时（默认 24h，可配 `WAITING_EXTERNAL_TIMEOUT`） |
| waiting_budget | budget.refilled | resuming | 预算补充完成 + 存在有效 Checkpoint |
| waiting_budget | budget.denied | handed_over | 预算补充被拒绝或超时 |
| resuming | recovery.loaded | running | Checkpoint 校验通过 |
| resuming | recovery.corrupted | failed | **v3.1 新增**：Checkpoint 校验失败（`CheckpointCorruptionError`），不再无限重试 |
| failed | recovery.attempt | resuming | 存在有效 Checkpoint |
| failed | escalate.human | handed_over | 自动恢复失败 |
| any | shutdown.received | draining | 进程进入排水期，停止接收新请求 |
| draining | drain.completed | waiting_external | 未完成 Run 已 forceFlush，等待调度恢复 |
| draining | drain.completed_all | succeeded | 当前 Run 在宽限期内自然完成 |
| any | user.cancel | cancelled | 用户主动取消 |

**`waiting_external` 恢复触发器优先级（v3.1 新增）**：
1. **业务事件回调**（最高优先级）：审批结果、外部 webhook、定时事件
2. **管理员 API**（运维通道）：`POST /admin/runs/{runId}/resume` 需 R4 级审批
3. **Cron 巡检**（兜底）：每 5 分钟扫描 `waiting_external` 且 `lastEventAt` > 1h 的 Run，发射 `admin.resume` 事件，由 RunManager 决策是否恢复
4. **超时回收**（保底）：超过 `WAITING_EXTERNAL_TIMEOUT`（默认 24h）自动转入 `handed_over`，避免 Run 永久卡死

### 5.4 生命周期钩子（Harness Hook 管线）

> 对齐 Claude Code Hooks + v3.0 扩展。业务逻辑在能力包/控制面注册；Kernel 只负责按序调度。

**钩子阶段一览**：

| 阶段 | 触发时机 | 典型挂载逻辑 | 阻塞主循环 |
|------|---------|-------------|-----------|
| `pre_plan` | Run 启动 / 新一轮规划前 | 情景记忆检索、技能 L0 索引、项目级快照注入 | 是 |
| `post_plan` | 规划输出完成后 | 记录 Decision Chain（plan_step） | 否 |
| `pre_tool` | 每次工具调用前 | 权限预检、参数脱敏、AutonomyScore 判定 | 是 |
| `post_tool` | 工具返回后 | 审计、Environment Backfiller、结果截断 | 否 |
| `post_sampling` | **每轮 LLM 输出完成后** | **SessionShadow 增量摘要（fire-and-forget）** | 否 |
| `pre_complete` | 判定即将结束前 | 最终 Checkpoint 预写 | 否 |
| `post_complete` | Run 成功结束 | OERCD 异步、审计 flush、指标上报 | 否 |
| `on_error` | 未捕获异常 / Level 4 工具失败 | Checkpoint 紧急落盘、HITL 升级 | 否 |
| `on_compact` | 任意 Compact 级别执行后 | 更新 EvidenceRegistry、Checkpoint（reason=`post_compact`） | 否 |
| `on_checkpoint` | 多卡点落盘完成 | 可观测事件 `checkpoint` 流式推送 | 否 |
| `on_shutdown` | SIGTERM / drain 阶段 | GracefulShutdown 协调、SessionShadow 最终 flush | 是（排水期） |

```
Agent 执行全周期（含 post_sampling）：

  ┌──────────┐   ┌───────────┐   ┌──────────┐   ┌──────────────┐
  │ PrePlan  │──▶│ PostPlan  │──▶│  LLM Turn │──▶│ PostSampling │ ← SessionShadow
  │ 规划前    │   │ 规划后     │   │ 推理轮次   │   │ 采样后        │
  └──────────┘   └───────────┘   └─────┬────┘   └──────┬───────┘
                                        │                  │
                    ┌───────────────────┼──────────────────┘
                    │ 有 tool_use?     │
                    ▼                  ▼
              ┌──────────┐      ┌──────────┐
              │ PreTool  │─────▶│ PostTool │ → Backfiller
              │ 工具前    │      │ 工具后    │
              └──────────┘      └────┬─────┘
                                     │ 循环
                                     ▼
              ┌─────────────┐   ┌─────────────┐
              │ PreComplete │──▶│PostComplete │ → OERCD / 审计
              │ 完成前       │   │ 完成后       │
              └─────────────┘   └─────────────┘

  横切事件：on_compact / on_checkpoint / on_error / on_shutdown
```

**PrePlan 触发内容**：
- 检索情景记忆（同类任务历史经验）
- 加载技能库索引（L0 摘要 ~20 token/条）
- 注入项目级上下文快照（跨日恢复时）
- `EnvironmentInjector.collect()` 冷启动快照（首次 Turn）

### 5.5 Checkpoint 多卡点策略

> v3.0 升级：从"按工具次数"升级为"按语义事件"的多卡点策略，确保任何中断都能从最近的语义点恢复。

**正常运行时的 Checkpoint 卡点**：

| 卡点 | 触发条件 | 快照内容 | reason 标记 |
|------|---------|---------|------------|
| 卡点 1：模型输出完成后 | 每次 LLM 响应完成 | messages + budget + turnCount | `post_model_output` |
| 卡点 2：工具执行完成后 | 每批工具执行完成 | messages + budget + toolResults + environmentPatch | `post_tool_execution` |
| 卡点 3：Compact 执行后 | 任何级别 Compact 完成 | 压缩后 messages + compactMetadata + evidenceRegistry | `post_compact` |
| 卡点 4：审批等待前 | 进入 waiting_approval 状态前 | 完整快照 + pendingApproval | `pre_approval_wait` |
| 卡点 5：重要决策后 | 工具 riskLevel ≥ R2 完成后 | 完整快照 + decisionChainRef | `high_risk_decision` |
| 卡点 6：周期性 | 每 N 次工具调用（默认 5） | 当前完整状态 | `periodic_interval` |
| 卡点 7：优雅停机 | SIGTERM 信号触发 | 完整快照 + drainPhase | `graceful_shutdown` |
| 卡点 8：强制落盘 | 宽限期超时 | 紧急快照 + partialContent | `force_shutdown` |

**落盘实现**：正常运行期采用 Durable Outbox 异步入队，入队成功后才视为已安排落盘；进入 `waiting_*`、高风险决策后、Compact 后与停机排水阶段必须执行 `forceFlush`。任何持久化失败都必须触发 `on_error` 并阻止状态进入不可恢复等待，避免与"零数据丢失"目标冲突（详见 §5.7 IIncrementalPersistence）。

**写放大控制策略（v3.1 新增）**：

| 控制项 | 默认值 | 说明 |
|--------|--------|------|
| **卡点合并窗口** | 500ms | 同一 Run 在窗口内的多次卡点（post_model_output + post_tool_execution）合并为一次 Outbox 入队，以最高 reason 优先级标记 |
| **周期性卡点上限** | 每 5 次工具调用 1 次 | 防止短时工具风暴触发过频快照；与 §5.6 Phase D 评估对齐 |
| **Outbox 批量入队** | 32 条/批 或 100ms | BullMQ producer 端聚合，降低 Redis OPS 压力 |
| **Outbox 持久化保证** | Redis AOF `appendfsync everysec` + PostgreSQL Outbox 表 WAL | 单点故障窗口 ≤1s；§19.5「已确认状态零丢失」明确仅承诺 forceFlush + WAL fsync 后的状态 |
| **降级写穿透** | Outbox 积压 >1000 时 | 自动切换 Compact/Approval/Shutdown 为同步 `forceFlush`，其余 reason 丢入 best-effort 队列，保证关键卡点不丢 |
| **关键卡点强制 forceFlush** | `pre_approval_wait`、`high_risk_decision`、`graceful_shutdown`、`force_shutdown` | 这四类必须 WAL fsync 确认后才返回，绕过合并窗口 |

### 5.6 韧性推理循环引擎（B1 加固）

> v3.0 新增：解决 v1.0/v2.0 演进方案的"快乐路径"假设——所有异常都通过 Phase A-D 四阶段强化转化为可恢复事件。

**四阶段强化骨架**：

```
韧性推理循环引擎（每轮 Turn 包裹）：

Phase A: Pre-Flight Check（起飞前检查）
  ┌─────────────────────────────────────────────────────────────────┐
  │ 每轮循环开始前执行：                                              │
  │ • 预算余量检查（Token / 成本 / 步数 / 时间四维）                  │
  │ • 上下文防爆预判（当前 Token 数 vs 阈值，预判是否需要 Compact）    │
  │ • AbortSignal 检查（外部取消信号）                                │
  │ • 环境状态快照（当前工作目录、活跃文件、Git 分支）                │
  │                                                                   │
  │ 任一检查不通过 → 进入 Graceful Termination 而非直接 throw         │
  └─────────────────────────────────────────────────────────────────┘

Phase B: Model Invocation with Fallback（模型调用含降级）
  ┌─────────────────────────────────────────────────────────────────┐
  │ 主模型调用失败时的降级链：                                         │
  │                                                                   │
  │ 1. 网络瞬断（HTTP 429/500/503）→ 指数退避重试（最多 3 次）       │
  │ 2. 模型过载 → 切换至 fallbackModel                               │
  │ 3. fallbackModel 也失败 → 切换至本地模型（如 Ollama）            │
  │ 4. 所有模型不可用 → Checkpoint 落盘 + 通知人工 + 状态设为         │
  │    waiting_external                                               │
  │                                                                   │
  │ 流式中断恢复：                                                    │
  │ • 流式传输中断时，保留已接收的 partial content                    │
  │ • 重试时携带 partial content 告知模型已生成的内容                  │
  │ • 避免重复生成已完成的推理                                        │
  └─────────────────────────────────────────────────────────────────┘

Phase C: Tool Execution with Self-Healing（工具执行含自愈）
  ┌─────────────────────────────────────────────────────────────────┐
  │ 工具执行异常的分级处理：                                           │
  │                                                                   │
  │ Level 1: 超时 → 取消 + 将超时信息作为 tool_result 回填模型        │
  │ Level 2: Schema 校验失败 → 错误信息回填模型让其自修复参数         │
  │ Level 3: 权限拒绝 → 通知模型选择替代工具或降级方案               │
  │ Level 4: 不可恢复错误 → 记录错误 + Checkpoint + HITL 升级        │
  │                                                                   │
  │ 核心原则："将错误转化为模型可理解的上下文，让模型自主决策下一步"    │
  └─────────────────────────────────────────────────────────────────┘

Phase D: Post-Turn Bookkeeping（每轮结束记账）
  ┌─────────────────────────────────────────────────────────────────┐
  │ 每轮循环结束后：                                                   │
  │ • 更新预算消耗（精确到本轮的 input/output/cached token）          │
  │ • 触发 SessionShadow 异步更新（fire-and-forget）                  │
  │ • 评估是否需要 Checkpoint（每 N 轮或重要决策后）                  │
  │ • 发射流式事件供外部消费                                          │
  │ • 环境状态差量检测（对比 Phase A 快照）                           │
  └─────────────────────────────────────────────────────────────────┘
```

**异常降级策略矩阵**：

| 异常类型 | 检测方式 | 降级策略 | 恢复路径 |
|---------|---------|---------|---------|
| HTTP 429 Rate Limit | 响应状态码 | 指数退避（2s, 4s, 8s） | 等待后自动重试 |
| HTTP 500/503 Server Error | 响应状态码 | 重试 3 次 → 切换 Provider | 切换后继续 |
| 网络超时 | AbortSignal timeout | 保留 partial → 重试 | 携带已接收内容重试 |
| Context Window Exceeded | API 错误码 | 紧急 L4 Compact → 重试 | Compact 后继续 |
| 模型拒绝（safety filter） | stop_reason=safety | 停止自动重试，生成安全解释或升级人工 | 人工确认后按新任务恢复 |
| 预算耗尽 | BudgetManager 检查 | Checkpoint + 通知人工 | 人工补充预算后 resume |
| 工具不可达 | 连接超时 | 通知模型选择替代方案 | 模型自主选择替代 |

**工具异常自愈示例**：

```
场景：git.push 因 "non-fast-forward" 错误失败

传统处理：直接报错，AgentRun 失败
韧性处理：
  1. 将错误信息格式化为 tool_result：
     "[ERROR: non-fast-forward] 远程分支有新提交。
      建议操作：先执行 git pull --rebase 解决冲突后重试。"
  2. 模型读取后自主决策：
     → 调用 git.pull (rebase) → 解决冲突 → 重新 git.push
  3. 无需人工介入，Agent 自主修复
```

### 5.7 优雅停机与状态排水机制（B6 加固）

> v3.0 新增：解决进程终止时的状态保全问题，通过三阶段排水确保零数据丢失。

```
优雅停机排水机制（三阶段 + 多卡点落盘）：

┌─────────────────────────────────────────────────────────────────────┐
│                    SIGTERM / SIGINT 接收                              │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 1: 立即排水（0-2s）                                            │
│ ─────────────────────────────────────────────────────────────────── │
│ • 标记所有活跃 AgentRun 为 "draining" 状态                          │
│ • 停止接收新请求（HTTP Gateway 返回 503）                           │
│ • 停止从 BullMQ 拉取新任务                                          │
│ • 向所有活跃 WebSocket 客户端发送 "server_draining" 事件            │
└────────────────────────────────┬────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 2: 宽限期（2-30s，可配置 GRACEFUL_SHUTDOWN_TIMEOUT）           │
│ ─────────────────────────────────────────────────────────────────── │
│ • 等待当前正在执行的 LLM 调用完成（流式接收不中断）                 │
│ • 等待当前正在执行的工具调用完成（受工具自身 timeout 限制）          │
│ • 每个完成的 Turn 立即 Checkpoint 落盘                              │
│ • SessionShadow 执行最终的 Summary 增量更新                         │
│ • KnowledgeCrystallizer 将待处理的反思任务标记为"可恢复"            │
└────────────────────────────────┬────────────────────────────────────┘
                                 │ 宽限期结束或所有 Run 完成
                                 ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Phase 3: 强制落盘（30-60s）                                          │
│ ─────────────────────────────────────────────────────────────────── │
│ • 仍在运行的 AgentRun：                                              │
│   - 中止当前 LLM 调用（AbortController.abort()）                    │
│   - 保存当前 messages 到 Checkpoint（含 partial content）           │
│   - 状态设为 "waiting_external"（人工恢复触发）                     │
│ • 持久化所有未写入的审计日志（批量 flush）                          │
│ • 关闭数据库连接池                                                   │
│ • 关闭 Redis 连接                                                    │
│ • 发送最后的 OpenTelemetry span                                     │
│ • 进程退出                                                           │
└─────────────────────────────────────────────────────────────────────┘
```

**核心接口**（权威定义见 §20.6；本节仅展示与运行时强相关的摘要）：

```typescript
/**
 * 优雅停机控制器
 * @description 管理进程终止时的三阶段排水逻辑
 * @stability S1
 */
interface IGracefulShutdownController {
  /** 注册一个活跃的 AgentRun（用于排水跟踪） */
  registerActiveRun(runId: string, abortController: AbortController): void;

  /** 移除已完成的 AgentRun */
  deregisterRun(runId: string): void;

  /**
   * 启动排水流程。
   * @param signal - 触发信号类型
   * @param config - 排水配置（grace_period 等，v3.1 新增）
   * @returns 排水完成的 Promise（所有 Run 安全保存后 resolve）
   */
  drain(signal: 'SIGTERM' | 'SIGINT', config?: DrainConfig): Promise<DrainResult>;

  /** 获取当前排水状态 */
  getStatus(): ShutdownStatus;

  /**
   * v3.1 新增：订阅 Run 级排水状态变更
   * @description 供 Run Manager 同步将 AgentRun 状态机转入 'draining'
   */
  onRunStatusTransition(handler: (runId: string, phase: ShutdownPhase) => void): Disposable;
}

/** v3.1 新增：排水配置 */
interface DrainConfig {
  /** 宽限期（Phase 2 持续时间），默认 30s，K8s 应配为 terminationGracePeriodSeconds - 5s */
  readonly gracePeriodMs: number;
  /** Phase 1 立即排水超时，默认 2s */
  readonly immediateDrainMs: number;
  /** Phase 3 强制落盘超时，默认 30s */
  readonly forceFlushMs: number;
  /** force kill 时是否将运行中 Run 设为 waiting_external，默认 true */
  readonly preserveRunsAsWaiting: boolean;
}

interface DrainResult {
  readonly totalRuns: number;
  readonly completedNormally: number;
  readonly checkpointedForcefully: number;
  /** v3.1 新增：被转为 waiting_external 的 runId 列表（供运维 Dashboard 显示） */
  readonly preservedRunIds: readonly string[];
  /** v3.1 新增：丢失的 Run 计数（force kill 时 WAL fsync 未完成的） */
  readonly lostRunCount: number;
  readonly durationMs: number;
}

type ShutdownStatus = 'running' | 'draining' | 'force_saving' | 'terminated';
type ShutdownPhase = 'phase1_immediate' | 'phase2_grace' | 'phase3_force' | 'completed';
```

**Run 级状态桥接（v3.1 新增）**：
- `IGracefulShutdownController.drain()` 在 Phase 1 启动时，对所有 `registerActiveRun` 注册的 Run 调用 Run Manager 提供的 `runManager.transitionTo(runId, 'draining', { reason: 'shutdown' })`
- Phase 3 force kill 前，按 `DrainConfig.preserveRunsAsWaiting` 决定：
  - `true`（默认）：转 `waiting_external`，由 §5.3 admin.resume / Cron 巡检触发恢复
  - `false`（仅测试环境）：转 `failed`，由 §5.3 recovery.attempt 链路恢复
- 配置入口：`config/runtime.yaml > graceful_shutdown.*`，启动时由 Zod 校验

---

## 六、控制面

### 6.1 Control Plane 子系统

```
Control Plane
├── Intent Router（意图路由器）
│   ├── 三级级联分类（v3.1 修订，去除 LLM 单点依赖）：
│   │   ├── L1: 规则匹配（关键词 + 正则，<5ms，覆盖 60%+ 高频意图）
│   │   ├── L2: 微调 SLM 分类器（fastText/DistilBERT 级别，<50ms，覆盖 35% 中频）
│   │   └── L3: 主 LLM 分类（仅低置信度兜底，<2s，覆盖 5% 长尾）
│   ├── Phase 路由（intent / execution / connection）
│   ├── Agent 能力匹配
│   ├── 降级兜底（无匹配时走 fallback Agent）
│   └── Provider 不可用时回退到 L1+L2 级联，禁止控制面阻塞
│
├── Agent Registry（注册中心）
│   ├── Agent 定义注册（YAML + 代码）
│   ├── Prompt 版本管理（可回滚）
│   ├── 模型策略配置
│   └── 工具权限声明
│
├── Run Manager（运行管理器）
│   ├── AgentRun CRUD + 状态机管理
│   ├── Checkpoint 读写调度
│   ├── 超时/异常监控
│   └── 并发控制（同一任务不重复启动）
│
├── Approval Engine（审批引擎）
│   ├── 工具风险等级判定
│   ├── 审批策略（规则 + ABAC）
│   ├── 审批请求生成与路由
│   └── 审批结果回调（resume AgentRun）
│
├── Policy Engine（策略引擎）
│   ├── RBAC + ABAC 混合策略
│   ├── Agent 身份鉴权
│   ├── 数据范围控制
│   └── 操作风险评估
│
├── Budget Manager（预算管理器）
│   ├── Token 预算分配与追踪
│   ├── 美元成本实时计算
│   ├── 预算告警与熔断
│   └── 模型降级策略（超预算自动切换）
│
├── Audit Engine（审计引擎）
│   ├── 全量调用链路记录
│   ├── 决策证据归档
│   ├── 合规报告生成
│   └── 审计查询 API
│
└── Scheduler（调度器）
    ├── 定时任务调度（Cron Agent）
    ├── 资源分配（并发 Agent 上限管控）
    ├── 优先级队列
    └── 负载均衡
```

### 6.2 Scheduler 策略

| 策略 | 说明 | 参数 |
|------|------|------|
| FIFO | 先进先出，默认策略 | - |
| Priority | 按任务优先级排序 | priority: P0-P4 |
| Fair Share | 按租户/用户公平分配 | maxConcurrentPerTenant |
| Deadline | 截止日期优先 | dueDate |
| Cost Aware | 低成本任务优先（节省预算） | estimatedCost |
| Backpressure | 系统过载时暂缓新任务 | queueDepthThreshold |

---

## 七、工具网关

### 7.1 Tool Gateway 流程

```
Agent Kernel ─ ToolCall ─▶ Tool Router
                                │
                                ▼
  ┌────────────────────────────────────────────────────────────────┐
  │                Pre-Execution Pipeline                           │
  │  Schema校验 → 权限检查 → 风险评估 → 审批判定 → 参数脱敏      │
  └────────────────────────────┬───────────────────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              ▼                                 ▼
  ┌──────────────────────┐          ┌──────────────────────┐
  │ Protocol Adapter      │          │ Internal Tools       │
  │ ──────────────────── │          │ ──────────────────── │
  │ • MCP Client         │          │ • buildTool 工厂     │
  │ • REST Adapter       │          │ • PM 工具集          │
  │ • GraphQL Adapter    │          │ • Dev 工具集         │
  │ • gRPC Adapter       │          │ • Office 工具集      │
  └──────────┬───────────┘          └──────────┬───────────┘
             │                                  │
             └──────────────┬───────────────────┘
                            ▼
  ┌────────────────────────────────────────────────────────────────┐
  │                Post-Execution Pipeline                          │
  │  结果标准化 → 审计记录 → 输出脱敏 → 成本计量 → 返回 Kernel   │
  └────────────────────────────────────────────────────────────────┘
```

### 7.2 工具安全契约（v3.0 增强版）

> v3.0 升级：在 v1.0 基础特征上增加环境副作用声明（B7 加固）和输出预算控制（解决工具结果炸毁上下文问题）。

```typescript
/**
 * 工具安全特征声明（v3.0 增强）
 * Fail-Closed 默认值：未声明的特征默认为最安全选项
 * @property isReadOnly - 是否只读（默认 false → 被当作写操作管控）
 * @property isDestructive - 是否有破坏性（默认 true → 未声明时按潜在破坏性管控）
 * @property isConcurrencySafe - 是否并发安全（默认 false → 串行执行）
 * @property isIdempotent - 是否幂等（默认 false）
 * @property reversibility - 可逆性等级
 * @property environmentSideEffects - 该工具可能影响的环境维度列表（v3.0 新增）
 * @property maxOutputTokens - 工具输出的最大 token 预算（v3.0 新增，超出将被截断）
 */
interface ToolSafetyCharacteristics {
  readonly isReadOnly: boolean;
  readonly isDestructive: boolean;
  readonly isConcurrencySafe: boolean;
  readonly isIdempotent: boolean;
  readonly reversibility: 'reversible' | 'partially' | 'irreversible' | 'unknown';
  readonly environmentSideEffects: readonly EnvironmentDimension[];
  readonly maxOutputTokens: number;
}

/** 环境维度——供回填引擎使用 */
type EnvironmentDimension =
  | 'working_directory'
  | 'file_system'
  | 'git_state'
  | 'permissions'
  | 'external_system_state'
  | 'unknown'
  | 'none';

/**
 * 完整工具定义接口（v3.0 增强）
 * @template TInput - 输入参数类型
 * @template TOutput - 输出结果类型
 */
interface ToolDefinition<TInput = unknown, TOutput = unknown> {
  readonly name: string;
  readonly description: string;
  readonly schema: JSONSchema7;
  readonly riskLevel: ToolRiskLevel;
  readonly characteristics: ToolSafetyCharacteristics;
  readonly timeout: number;
  readonly retryable: boolean;
  readonly maxRetries?: number;
  /** v3.0 新增：工具可提供的上下文回填信息 */
  readonly backfillContext?: ToolBackfillDeclaration;
  execute(params: TInput, ctx: ToolContext): Promise<ToolResult<TOutput>>;
}

/**
 * 工具回填声明——告知 Backfiller 该工具会影响哪些环境维度
 */
interface ToolBackfillDeclaration {
  /** 该工具执行后会产生哪些维度的环境变更 */
  readonly affectedDimensions: readonly EnvironmentDimension[];
  /** 回填信息的提取方式 */
  readonly extractionStrategy: 'from_output' | 'from_side_effect' | 'manual_probe';
}
```

### 7.3 风险等级

| 等级 | 标识 | 示例 | 默认策略 |
|------|------|------|---------|
| R0 | `read` | 查询项目、搜索文档、读取文件 | 自动执行，记录审计 |
| R1 | `write:low` | 添加评论、创建草稿、更新待办 | 自动执行或轻审批 |
| R2 | `write:medium` | 修改排期、批量催办、更新负责人 | 策略判断 + 部分审批 |
| R3 | `write:high` | 删除项目、合并代码、发布生产 | **必须**人工审批 |
| R4 | `privileged` | 权限变更、凭据操作、资金审批 | 必须多人审批 |
| RX | `destructive` | 数据库 DROP、批量删除、不可逆操作 | 禁止 Agent 直接执行 |

**RX 侧面执行防护（v3.1 新增）**：
> 风险：通过 `shell.execute` / Shell MCP Adapter 间接执行 `psql -c "DELETE ..."`、`mysql -e "DROP ..."`、`rm -rf /` 等可达 RX 影响的命令。

| 防护层 | 实现 | 部署位置 |
|--------|------|---------|
| **Shell 关键词黑名单** | 命令字符串预解析，匹配 `(DROP\|TRUNCATE\|DELETE\s+FROM)\b` / `rm\s+-rf` / `dd\s+if=` / 等 60+ 模式 | Tool Gateway pre-execution pipeline |
| **解析后命令分类** | 用 `shell-parser` 解析为 AST，识别 destructive 子命令树 → 标记为 RX | Tool Gateway 风险评估阶段 |
| **数据库连接审计** | Shell 工具调用含 `psql/mysql/mongo/redis-cli` 时，自动加 `-c "SELECT 1"` 探针验证连接 + 强制 readonly 角色 | Sandbox 内网络白名单 + Connector 凭据策略 |
| **Sandbox 网络白名单** | 生产 DB 连接串域名/IP 默认不在白名单内，需 R4 审批的 Connector 凭据才能访问 | §13.1 沙箱强制边界 |
| **Container 文件系统只读** | `/`、`/etc`、`/usr` mount readonly；写操作仅在 overlayfs 内 | §13.1 沙箱强制边界 |
| **审计强制留痕** | RX 风险匹配触发 `tool.high_risk_pattern` 审计事件，同步推送安全团队 | Audit Engine + 安全告警通道 |

### 7.4 buildTool 工厂与 Fail-Closed 默认值

> 来源 v1.0 基线 Claude Code Harness 借鉴——所有工具必须经 buildTool 工厂注册，未声明的安全特征默认为最严格值。

```typescript
/**
 * 工具构建工厂
 * @description 所有工具必须通过此工厂注册，确保 Fail-Closed 默认值生效
 *
 * Fail-Closed 默认值规则：
 *   isReadOnly = false          → 默认按写操作管控
 *   isDestructive = true        → 默认按潜在破坏性管控
 *   isConcurrencySafe = false   → 默认串行执行
 *   isIdempotent = false        → 默认重试时需用户确认
 *   reversibility = 'unknown'   → 默认按不可逆处理
 *   environmentSideEffects = ['unknown']  → 默认强制回填探测并触发策略审批
 */
function buildTool<TInput, TOutput>(
  spec: Partial<ToolDefinition<TInput, TOutput>> & {
    name: string;
    execute: ToolDefinition<TInput, TOutput>['execute'];
  },
): ToolDefinition<TInput, TOutput>;
```

### 7.5 工具结果预算控制（B1 加固 - 防上下文炸毁）

```typescript
/**
 * 工具结果预算控制器
 * @description 确保单次工具返回不会炸毁上下文窗口
 * @stability S2
 */
interface IToolResultBudget {
  /**
   * 截断超长工具结果。
   * 策略：
   * 1. 结果 ≤ maxTokens → 原样返回
   * 2. 结果 > maxTokens 且为结构化数据 → 保留前 N 行 + "[...truncated {total} lines]"
   * 3. 结果 > maxTokens 且为自由文本 → 保留首尾各 40% + 中间省略
   * 4. 截断后的结果标注原始长度，供模型判断是否需要分页读取
   */
  truncate(result: string, maxTokens: number): TruncatedResult;
}

interface TruncatedResult {
  readonly content: string;
  readonly wasTruncated: boolean;
  readonly originalTokens: number;
  readonly retainedTokens: number;
  /** 如果被截断，告知模型如何获取完整内容 */
  readonly paginationHint?: string;
}
```

### 7.6 工具异常自愈处理矩阵

| 异常等级 | 触发场景 | 处理动作 | 是否回填模型 |
|---------|---------|---------|------------|
| Level 1 | 工具超时 | 取消 + 超时信息回填 | ✓ |
| Level 2 | Schema 校验失败 | 错误信息回填让模型自修复参数 | ✓ |
| Level 3 | 权限拒绝 | 通知模型选择替代工具或降级方案 | ✓ |
| Level 4 | 不可恢复错误（网络/凭据失效） | 记录错误 + Checkpoint + HITL 升级 | ✗ |

### 7.7 环境感知与状态回填引擎（B7 加固）

> v3.0 新增：解决"工具执行后的环境变更无法自动回填到后续上下文"问题——通过两阶段架构（冷启动注射 + 运行时回填）实现。

```
环境感知引擎（两阶段架构）：

阶段 1: 冷启动注射（AgentRun 启动时）
  ┌─────────────────────────────────────────────────────────────────┐
  │ 并发收集当前环境快照（<500ms）：                                   │
  │                                                                   │
  │ • 工作目录（cwd + 目录结构摘要）                                  │
  │ • Git 状态（branch + dirty files + last commit）                  │
  │ • 文件系统（关键文件的 mtime + size）                             │
  │ • 权限上下文（当前 Agent 的 allowed tools + risk level）          │
  │ • 外部系统状态（项目状态 / 最近审批 / 阻塞项）                   │
  │                                                                   │
  │ 产出：EnvironmentSnapshot（注入 System Prompt 的 dynamic_suffix） │
  └─────────────────────────────────────────────────────────────────┘

阶段 2: 运行时回填（工具执行后）
  ┌─────────────────────────────────────────────────────────────────┐
  │ 每次工具执行后，检测环境变更并回填：                               │
  │                                                                   │
  │ 工具类型          │ 可能的环境变更      │ 回填方式               │
  │ ─────────────────┼────────────────────┼─────────────────────── │
  │ file.write        │ 文件系统变更        │ 更新 EnvironmentSnapshot│
  │ git.commit        │ Git 状态变更        │ 更新 branch/commit info│
  │ shell.execute     │ 目录/文件/进程      │ 重新采集受影响维度     │
  │ deploy.execute    │ 外部系统状态        │ 注入部署结果状态       │
  │ approval.decided  │ 权限上下文变更      │ 刷新权限快照           │
  │                                                                   │
  │ 回填内容注入位置：下一轮 System Prompt 的 dynamic_suffix         │
  │ 关键约束：回填不修改 stable_prefix（保护缓存命中率）              │
  └─────────────────────────────────────────────────────────────────┘
```

**核心接口**（详见 §20.7）：

```typescript
/**
 * 环境注射器 — 冷启动时收集环境快照
 * @stability S2
 */
interface IEnvironmentInjector {
  /**
   * 并发收集所有环境维度的当前状态。
   * @param agentId - Agent 定义 ID（决定收集哪些维度）
   * @param tenantId - 租户 ID（决定数据范围）
   * @returns 环境快照（用于注入 dynamic_suffix）
   */
  collect(agentId: string, tenantId: string): Promise<EnvironmentSnapshot>;
}

/**
 * 上下文回填器 — 工具执行后更新环境状态
 * @stability S2
 */
interface IContextBackfiller {
  /**
   * 接收工具执行产生的环境补丁，更新内存中的环境快照。
   * @param patch - 工具产生的上下文变更
   */
  apply(patch: ContextPatch): void;

  /** 获取当前累积的环境快照 */
  getSnapshot(): Readonly<EnvironmentSnapshot>;

  /** 生成用于注入 Prompt 的格式化环境描述 */
  renderForPrompt(): string;
}

interface EnvironmentSnapshot {
  readonly workingDirectory: string;
  readonly directoryStructure: string;
  readonly gitState: GitStateSnapshot | null;
  readonly fileSystemState: FileSystemSnapshot;
  readonly permissionContext: PermissionContext;
  readonly externalSystemState: Record<string, unknown>;
  readonly collectedAt: Date;
}

interface ContextPatch {
  readonly dimension: EnvironmentDimension;
  readonly before: string;
  readonly after: string;
  readonly toolName: string;
  readonly timestamp: Date;
}
```

---

## 八、安全护栏与治理基线

### 8.1 四维权限模型

```
任何一次工具调用的权限判定需要四个维度同时满足：

  ┌────────────────────────────────────────────────────────────┐
  │                    权限判定引擎                              │
  │                                                             │
  │  维度 1: 用户身份（谁触发的？）                              │
  │  ├── SSO/OAuth 认证 → 角色集合                             │
  │  └── 项目成员 / 管理员 / 审批人 / 审计员                    │
  │                                                             │
  │  维度 2: Agent 身份（哪个 Agent 在执行？）                   │
  │  ├── AgentDefinition.allowedTools                           │
  │  └── Agent Scope 声明（只能访问声明过的工具和知识范围）      │
  │                                                             │
  │  维度 3: 工具身份（调用什么工具、什么动作？）                │
  │  ├── 工具风险等级（R0-R4/RX）                               │
  │  └── 工具安全特征（isDestructive / isReadOnly）             │
  │                                                             │
  │  维度 4: 数据范围（访问或修改哪些数据？）                    │
  │  ├── 项目边界（Agent 只能操作授权项目的数据）                │
  │  └── 数据密级（公开 / 内部 / 机密 / 绝密）                 │
  │                                                             │
  │  判定结果：allow / deny / require_approval                  │
  └────────────────────────────────────────────────────────────┘
```

### 8.2 输入安全

| 威胁类型 | 检测机制 | 处理策略 |
|---------|---------|---------|
| Prompt 注入 | 特征模式匹配 + LLM 分类器双层扫描 | 拦截 + 安全告警 |
| 隐藏 Unicode | 不可见字符检测 | 清除隐藏字符 |
| 数据外泄尝试 | URL/域名白名单检测 | 拦截 + 记录 |
| 编码绕过 | Base64/Hex/ROT13 解码后重新扫描 | 解码后再走完整扫描管线 |
| 权限提升 | 指令覆盖检测 | 拦截 + 安全告警 |
| 超长输入 | 长度硬限制 | 截断 + 提示用户 |

**多模态污染防护（v3.1 新增，对应 §14.2 ContentPart）**：

| 模态 | 威胁 | 防护 |
|------|------|------|
| **Markdown 文本** | 嵌套 `# System:` / 伪 XML 标签 / 链接 javascript: 协议 | Markdown AST 白名单解析；拒绝 `<script>`、`<iframe>`、`javascript:` URL；剥离未在白名单内的 HTML 标签 |
| **JSON 内容** | 嵌套 `<external_data>` 字符串、`__proto__` 污染、深度炸弹 | 严格 schema 校验；`JSON.parse` 后限制深度 ≤32、键数 ≤1024；剥离 prototype-pollution 关键字 |
| **图像（OCR 旁路）** | 图中嵌入 prompt 注入文字（如"忽略以上指令"） | 上传时强制 OCR 扫描，OCR 结果走 prompt 注入双层扫描；扫描结果 trust_level=low |
| **音频（语音注入）** | 转录文本含注入指令 | ASR 转录后走文本注入扫描；转录文本 trust_level=low；不直接拼接 system 消息 |
| **视频（帧采样）** | 关键帧 OCR + 字幕注入 | 按 1fps 采样关键帧 OCR；字幕轨独立扫描 |
| **二进制文件** | 文件名/元数据注入 | 文件名拒绝 `<>:"/\\|?*` 与控制字符；元数据剥离至仅保留 mimeType + size |
| **代码块** | `code` ContentPart 含 `os.system('rm -rf /')` 等 | 代码块标注 trust_level=low；模型生成执行决策时必须经 §7.3 RX 防护 |
| **表格内容** | 大表（HTML/CSV）含隐藏字符或注入 | 限制行 ≤10000、列 ≤256；超限自动分页摘要；trust_level=low |

> **统一原则**：所有非文本模态经过解析/转录后产生的文本，其 trust_level **永远不高于** `low`，必须经过 §17.7 `<external_data>` 信封注入，且不参与 system 消息拼接。

### 8.3 输出安全

| 过滤项 | 检测规则 | 处理方式 |
|--------|---------|---------|
| API Key / 密钥 | 正则 + 熵检测 | 替换为 `[REDACTED]` |
| 手机号 / 身份证 / 银行卡 | 正则模式 | 脱敏处理 |
| 内部 IP / 内网地址 | CIDR 匹配 | 屏蔽 |
| 无来源事实陈述 | RAG 未命中时检测 | 标注 `[低置信度]` |
| 合规敏感内容 | 关键词 + 分类器 | 拦截 + 人工复核 |

### 8.4 数据合规

| 合规要求 | 实现机制 | 适用范围 |
|---------|---------|---------|
| 数据主权 | 机密数据不发送到境外 LLM，走本地模型 | 标记为"机密"的数据 |
| GDPR 个人数据保护 | 涉及用户数据的输出自动脱敏 | 所有含 PII 的输出 |
| 审计留痕 | 所有数据访问记录完整审计链路 | 全量数据操作 |
| 最小权限 | Agent 只能访问声明范围内的数据 | 所有 Agent |
| 数据分级 | 公开→内部→机密→绝密四级管控 | 所有数据资产 |

---

## 九、记忆、知识与上下文工程

### 9.1 记忆层级

| 层 | 名称 | 存储 | 生命周期 | 容量策略 |
|----|------|------|---------|---------|
| MEM-0 | 工作记忆 | 模型上下文窗口（内存） | 单次推理循环 | 金字塔 Compact L1→L2→L3→L4（§9.3） |
| MEM-1 | 会话记忆 | Redis (TTL = 会话+24h) | 会话级 | 冻结快照 + 影子代理异步更新 |
| MEM-2 | 情景记忆 | PostgreSQL + Qdrant | 永久（可归档） | 混合检索 + 权限过滤 |
| MEM-3 | 程序性技能库 | 文件系统 + SQLite FTS5 | 永久（Curator 剪枝） | 渐进式披露三级加载 |
| MEM-4 | 组织知识库 | Qdrant + Elasticsearch | 永久（版本化） | 多源管道 + RBAC 权限继承 |

### 9.2 Context Engineering 流程

```
Agent 推理前：上下文组装管线

  ┌─────────────────────────────────────────────────────────────┐
  │ 1. 基础层注入                                                │
  │    System Prompt + Agent 身份 + 技能索引(L0, ~20 token/条)  │
  └────────────────────────────┬────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────┐
  │ 2. 会话记忆注入                                              │
  │    冻结快照（保证前缀缓存命中率 ≈ 85-95%）                   │
  └────────────────────────────┬────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────┐
  │ 3. 工作上下文                                                │
  │    当前对话消息 + 工具调用结果（按新旧排序）                  │
  └────────────────────────────┬────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────┐
  │ 4. 动态检索注入                                              │
  │    情景记忆（同类任务经验）+ RAG 知识（按需）                │
  └────────────────────────────┬────────────────────────────────┘
                               │
  ┌────────────────────────────▼────────────────────────────────┐
  │ 5. Token 预算裁剪                                            │
  │    总量超限时触发 Compact Engine（§9.3 四级级联）            │
  └─────────────────────────────────────────────────────────────┘
```

### 9.3 金字塔级联 Compact 体系（B2 加固）

> v3.0 统一命名（取代 v1.0 的 Micro / Session / Project / Legacy 旧称）：

| v3.0 标准名 | 旧称（已废弃，实现勿混用） |
|------------|-------------------------|
| **L1** Time-Gap Micro Compact | Micro Compact |
| **L2** Evidence-Aware Compact | （无，v3.0 新增） |
| **L3** Session Memory Graft | Session Compact |
| **L4** Legacy Full Compact | Project Compact / Legacy Compact |

在 v1.0 四级 Compact 思路上，新增**时间间隔感知**与**证据感知**，确保跨越压缩边界的关键信息存活。

**四级金字塔（标准定义）**：

| 级别 | 触发条件 | 行为 | LLM 调用 | 延迟 | 创新点 |
|------|---------|------|---------|------|-------|
| L1 Time-Gap Micro Compact | 相邻消息间隔 > 30 min 或工具结果 > 4KB | 旧工具结果替换为 `[已清理: {tool} at {time}, {duration}ms]`，保留 input + 前 200 字 output | 零 | <1ms | 利用时间间隔作为"认知边界"信号 |
| L2 Evidence-Aware Compact | 总 Token 达窗口 70% | 扫描所有工具结果，标记包含证据（文件路径/URL/代码/数据/错误堆栈）的结果；证据保留完整内容，非证据压缩为单行摘要；证据存入 EvidenceRegistry | 零 | <5ms | **独创**：识别"什么信息是后续推理的证据"，跨越压缩边界保留 |
| L3 Session Memory Graft | 总 Token 达窗口 80% | 通过 `IMemorySummaryProvider` 端口读取 SessionShadow 预生成的 SESSION_SUMMARY；前半段替换为摘要 + 证据索引，保留 L2 标记的证据 + 最近 N 轮 | 零（复用影子代理） | <10ms | **嫁接**而非替换——证据跨越压缩边界存活 |
| L4 Legacy Full Compact | 前三级均无法将 Token 降至安全水位 | 启动独立 LLM 调用，生成包含证据引用的全文压缩摘要 | 一次 | 3-8s | 压缩 Prompt 中明确指示保留 EvidenceRegistry 中的所有证据 ID |

**L3 端口化与降级路径（v3.1 修订）**：

```typescript
/**
 * 会话摘要提供者端口
 * @description L3 Compact 通过此端口反向消费 memory 包，避免 kernel → memory 直接 import
 * @stability S1（位于 kernel/ports，由 control-plane 注入实现）
 */
interface IMemorySummaryProvider {
  /**
   * 获取指定 Run 的最新会话摘要
   * @returns SessionSummary 或 null（影子代理未就绪/Redis 故障）
   */
  getSummary(runId: string): Promise<SessionSummary | null>;

  /** 健康探针，供 L3 决策是否走降级路径 */
  isAvailable(): boolean;
}
```

**Compact 级联决策中的降级路径**：

```
                    ┌──────────────────────────────┐
                    │ 当前 Token 占比 ≥ 70%？       │
                    └───────────┬──────────────────┘
                     否 ▼               是 ▼
              ┌──────────────┐    ┌─────────────────────────┐
              │ 检查时间间隔  │    │ L2 Evidence-Aware Compact│
              │ ≥ 30 min？   │    └───────────┬─────────────┘
              └──────┬───────┘                │ 仍超 80%？
               否 ▼      是 ▼                 ▼
          无操作    L1 Time-Gap      ┌─────────────────────┐
                    Micro Compact    │ IMemorySummaryProvider│
                                     │  .isAvailable()?     │
                                     └────┬──────────┬──────┘
                                          │ 是        │ 否（Redis 故障/Shadow 未就绪）
                                          ▼          ▼
                                  ┌─────────────┐ ┌─────────────────────┐
                                  │ L3 Graft    │ │ 跳过 L3，发射事件     │
                                  │  (用 Summary)│ │  nexus.shadow.       │
                                  └──────┬──────┘ │  unavailable         │
                                         │仍超？  │ 直接进入 L4          │
                                         ▼        └──────────┬──────────┘
                                         └──────────────────►│
                                                              ▼
                                                  ┌─────────────────────┐
                                                  │ L4 Legacy Full      │
                                                  │     Compact         │
                                                  └─────────────────────┘
```

**降级语义**：
- L3 不可用时**不阻塞** Compact 流水线，直接进入 L4；同时发射 `nexus.shadow.unavailable` 指标供 SRE 告警
- L4 Compact 的 prompt 中携带 EvidenceRegistry，即使无 Shadow 摘要也能保留证据完整性
- 连续 5 次 `nexus.shadow.unavailable` 触发自动检查 Redis 健康 + 切换到 PostgreSQL 兜底（`memory/session-shadow.ts` 实现双写）

**级联触发决策树**：

```
                    ┌──────────────────────────────┐
                    │ 当前 Token 占比 ≥ 70%？       │
                    └───────────┬──────────────────┘
                     否 ▼               是 ▼
              ┌──────────────┐    ┌─────────────────────────┐
              │ 检查时间间隔  │    │ L2 Evidence-Aware Compact│
              │ ≥ 30 min？   │    └───────────┬─────────────┘
              └──────┬───────┘                │ 仍超 80%？
               否 ▼      是 ▼                 ▼
          无操作    L1 Time-Gap      ┌─────────────────────┐
                    Micro Compact    │ L3 Session Graft    │
                                     └───────────┬─────────┘
                                                  │ 仍超限？
                                                  ▼
                                     ┌─────────────────────┐
                                     │ L4 Legacy Full      │
                                     │     Compact         │
                                     └─────────────────────┘
```

**证据注册表（EvidenceRegistry）**：

```typescript
interface EvidenceRegistry {
  readonly entries: ReadonlyMap<string, EvidenceEntry>;
}

interface EvidenceEntry {
  readonly id: string;
  readonly sourceToolCall: string;
  readonly type: 'file_path' | 'url' | 'code_snippet' | 'data_table' | 'error_trace';
  readonly content: string;
  readonly turnCreated: number;
  readonly accessCount: number;
  /** 证据的预估 token 数 */
  readonly tokenCount: number;
  /** 证据是否被后续 Turn 实际引用过 */
  readonly wasReferenced: boolean;
}
```

**证据标记启发式规则**（基于规则、零 LLM 调用）：

1. 文件路径模式（`/path/to/file`, `C:\path\to\file`）
2. URL 模式（http/https/ftp）
3. 代码片段（包含函数定义、类定义、import 语句）
4. 结构化数据（JSON/YAML/表格）
5. 错误堆栈（包含 `at`, `Error:`, `Traceback`）

**证据治理策略**（防止注册表膨胀）：

| 策略 | 触发条件 | 动作 |
|------|---------|------|
| TTL 淘汰 | 证据年龄 > 20 turns 且 accessCount = 0 | 主动移除 |
| 容量上限 | 单 Run 证据 > 50 条 | 移除 accessCount 最低的旧证据 |
| 引用强化 | wasReferenced = true 的证据 | TTL 翻倍，最后淘汰 |

### 9.4 RAG 检索管道

```
查询输入
    │
    ▼
┌──────────────────┐
│ 意图分类          │ ← 判断问题类型（事实/操作/分析/创建）
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 权限过滤          │ ← RBAC：只返回用户有权访问的内容
└────────┬─────────┘
         │
    ┌────┴────┐
    ▼         ▼
┌────────┐ ┌────────┐
│向量检索 │ │关键词  │
│(Qdrant)│ │检索(ES)│
└───┬────┘ └───┬────┘
    │          │
    └────┬─────┘
         │ RRF 融合排序（Reciprocal Rank Fusion）
         ▼
┌──────────────────┐
│ Cross-Encoder    │ ← 重排序提升精确度
│ Reranker         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ 上下文组装        │ ← 生成带来源引用的 context package
│ + 来源标注        │   每条引用保留：文档ID + 段落位置 + 置信度
└──────────────────┘
```

### 9.5 双轨影子记忆代理体系（B4 加固）

> v3.0 新增：解决记忆更新阻塞主推理循环的问题——通过 SessionShadow + KnowledgeCrystallizer 双轨架构异步生成会话摘要和提炼技能，主循环完全不阻塞。

```
双轨影子代理体系：

┌────────────────────────────────────────────────────────────────────┐
│                        主推理循环（Query Loop）                      │
│                                                                     │
│  Turn 1 → Turn 2 → Turn 3 → ... → Turn N                         │
│     │         │         │                                           │
│     ├─────────┴─────────┴── 异步事件流 ──────────────────┐         │
│     │                                                     │         │
└─────┼─────────────────────────────────────────────────────┼─────────┘
      │                                                     │
      ▼                                                     ▼
┌─────────────────────────┐          ┌─────────────────────────────┐
│ Shadow Agent 1:          │          │ Shadow Agent 2:              │
│ SessionShadow            │          │ KnowledgeCrystallizer        │
│ ──────────────────────── │          │ ──────────────────────────── │
│ • 监听每轮 PostSampling  │          │ • 监听 AgentRun 完成事件     │
│ • 增量更新会话摘要       │          │ • 分析执行轨迹提取技能       │
│ • 写入 Redis（TTL 控制） │          │ • 写入技能库（pending 状态） │
│ • 供 L3 Compact 即时读取 │          │ • 触发 Distribute 审核流程   │
│                          │          │                              │
│ 特性：                   │          │ 特性：                       │
│ • 非阻塞（fire-and-forget）│         │ • 后台异步（BullMQ 队列）    │
│ • 幂等写入（版本号控制） │          │ • 仅复杂任务触发（≥5 工具调用）│
│ • 反膨胀：增量追加而非   │          │ • 包含证据引用和效率指标     │
│   全量重写               │          │                              │
└─────────────────────────┘          └─────────────────────────────┘
```

**SessionSummary 骨架协议**：

```typescript
/**
 * 会话摘要结构 — SessionShadow 的产出物
 * @description 设计为可直接注入 System Prompt 的 stable 格式
 */
interface SessionSummary {
  /** 摘要版本（单调递增） */
  readonly version: number;
  /** 涵盖的 Turn 范围 [from, to] */
  readonly turnRange: readonly [number, number];
  /** 任务进展摘要（≤500 字符） */
  readonly progressSummary: string;
  /** 已确认的关键决策（不可变事实） */
  readonly confirmedDecisions: readonly string[];
  /** 待处理的开放问题 */
  readonly openQuestions: readonly string[];
  /** 活跃的证据引用 ID 列表 */
  readonly activeEvidenceIds: readonly string[];
  /** 摘要 Token 数（用于预算计算） */
  readonly tokenCount: number;
}
```

**SessionShadow 工作流**：

```
1. 监听 PostSampling 事件（每轮推理完成后触发）
2. 将新 Turn 的关键信息提取为增量 delta：
   - 新的决策（confirmed_decisions_delta）
   - 解决的问题（resolved_questions）—— 由规则匹配（同问题在新 Turn 出现"已确认"等关键词）
   - 新产生的问题（new_questions）
   - 新的证据（new_evidence_ids）
3. 将 delta 合并到现有 SessionSummary
4. 执行反膨胀检查
5. 双写：Redis（热路径）+ PostgreSQL（持久化兜底，每 N=5 次 Turn 异步落盘）
6. 更新 Token 计数（供 Compact 引擎预判使用）

幂等保证：
  • Redis key: session_summary:{runId}（TTL=24h+session 时长）
  • PostgreSQL 表 session_shadow（runId PK，version 列单调递增）
  • 使用 CAS（Compare-And-Swap）更新，version 冲突时丢弃旧写入
  • 多实例部署安全（不依赖进程内状态）
```

**Redis 故障降级路径（v3.1 新增）**：

| 故障场景 | 检测 | 降级行为 |
|---------|------|---------|
| **Redis 主从切换** | Redis client 自动 reconnect，期间写入入 in-process queue | 切换完成后 batch flush；queue 满 1000 条转 PostgreSQL 同步写 |
| **Redis 完全不可用** | 连续 3 次 ping 超时（5s × 3） | SessionShadow 写直接降级到 PostgreSQL；`IMemorySummaryProvider.isAvailable()` 返回 `true`（PG 兜底仍可用） |
| **PostgreSQL 也故障** | PG connection pool 耗尽 | `isAvailable()` 返回 `false`；L3 Compact 跳过走 L4；发射 `nexus.shadow.unavailable` 指标 |
| **进程崩溃丢失 in-process queue** | restart 后 inspect Redis vs PG 差异 | startup 时从 PG 加载 latest version 到 Redis；diff 期间 Compact 暂时多用 L4（成本可控） |
| **CAS 冲突频繁**（version 撞车） | metric `session_shadow.cas_conflict_rate` > 5% | 自动切换到串行写模式（per-Run 单 worker），牺牲并发换正确性 |

**反膨胀 deflate 实现细节（v3.1 修订）**：

- `openQuestions` 解决判定：**规则优先（关键词匹配"已确认/已解决/skip"）+ 兜底规则（age > 5 Turn 且未在 confirmedDecisions 引用则归档为 `archivedQuestions`）**，不使用额外 LLM 调用
- `confirmedDecisions` 合并：相同 entity（项目/任务/文件）的多条决策按时间降序保留最新一条，旧版本进 archive
- `activeEvidenceIds` 淘汰：accessCount=0 且 age > 5 turns 自动移除，但 EvidenceRegistry 全文保留（仅从 active 索引剔除）

**反膨胀机制**：

```typescript
/**
 * 记忆反膨胀接口
 * @description 防止 SessionSummary 随 Turn 增加而无限膨胀
 */
interface IMemoryAntiInflation {
  /**
   * 在追加新内容前，检查并压缩现有摘要。
   * 策略：
   * - confirmedDecisions 超过 10 条时，合并相关条目
   * - openQuestions 中已解决的问题自动移除
   * - activeEvidenceIds 中 accessCount=0 且 age > 5 turns 的自动淘汰
   */
  deflate(current: SessionSummary, newTurnData: TurnData): SessionSummary;
}
```

### 9.6 Phase-Aware Context Engineering

> 来源 v2.0 演进——不同 Phase 的上下文画像差异极大，需要 Phase 感知的策略选择。

**各 Phase 的 Context Profile 表**：

| Phase | 典型上下文大小 | 主要内容 | 推荐策略 | 缓存命中率目标 |
|-------|-------------|---------|---------|-------------|
| Phase 1 (意图) | 8K-15K tokens | 项目背景 + 历史需求 + 技能索引 | summary_prefix | ≥ 90% |
| Phase 2 (执行) | 20K-80K tokens | 代码文件 + 测试结果 + Git Diff | sliding_window + rag_augmented | ≥ 75% |
| Phase 3 (连接) | 5K-12K tokens | 用户偏好 + 平台上下文 + 知识库 | full_context / rag_augmented | ≥ 85% |

**上下文策略类型枚举**：

```typescript
/** 上下文策略类型 */
type ContextStrategy =
  | 'full_context'           // 完整上下文（窗口充足时）
  | 'sliding_window'         // 滑动窗口（保留最近 N 轮）
  | 'summary_prefix'         // 摘要前缀 + 最近对话
  | 'rag_augmented'          // RAG 增强（按需检索注入）
  | 'checkpoint_restore'     // 检查点恢复（跨日任务）
  | 'aggressive_compact';    // 激进压缩（预算紧张时）
```

**决策流程图**：

```
上下文组装决策流程：

  ┌─────────────────────┐
  │ 计算当前上下文大小   │
  └──────────┬──────────┘
             │
     ┌───────▼───────┐
     │ < 50% 窗口？  │── Yes ──▶ full_context
     └───────┬───────┘
             │ No
     ┌───────▼───────┐
     │ < 80% 窗口？  │── Yes ──▶ sliding_window
     └───────┬───────┘
             │ No
     ┌───────▼───────────┐
     │ 有预生成摘要？    │── Yes ──▶ summary_prefix
     └───────┬───────────┘
             │ No
     ┌───────▼───────────┐
     │ 有检查点？        │── Yes ──▶ checkpoint_restore
     └───────┬───────────┘
             │ No
             ▼
        aggressive_compact
```

---

## 十、自适应策略体系

### 10.1 AutonomyScore 公式（v3.1 修订）

> **v3.1 修订要点**：（1）输出 clamp 到 [0,1]，（2）冷启动赋值规则明确，（3）与 R 风险等级硬规则的裁决顺序显式化，（4）TrustBonus 换算公式给出，（5）权重总和归一约束。

**计算公式**：

```
raw_score = BaseAutonomy
          + ReversibilityWeight × Reversibility(tool)
          + ContextFamiliarityWeight × ContextFamiliarity(task)
          - RiskPenalty(tool.riskLevel)
          + TrustBonusWeight × TrustBonus(agent.trustProfile)

AutonomyScore = clamp(raw_score, 0.0, 1.0)

其中（权重和约束）：
  BaseAutonomy            ∈ [0.0, 1.0]  Agent 定义中的默认自主度（必填）
  Reversibility(tool)    ∈ {1.0, 0.5, 0.0, 0.5}  可回滚/部分/不可逆/unknown
  ContextFamiliarity(task)∈ [0.0, 1.0]  任务熟悉度
                            = 0.4 × min(1, 情景记忆命中数 / 5)
                            + 0.4 × min(1, 技能库覆盖度)
                            + 0.2 × min(1, AgentTrustProfile.totalRuns / 100)
  RiskPenalty             ∈ {0, 0.1, 0.3, 0.6, 1.0, 2.0}  R0/R1/R2/R3/R4/RX
  TrustBonus              ∈ [0.0, 1.0]  = AgentTrustProfile.computeTrustScore()
                            （详见 §20.5，公式：0.6×successRate + 0.3×accuracyScore + 0.1×safetyScore）

  ReversibilityWeight       = 0.25
  ContextFamiliarityWeight  = 0.20
  TrustBonusWeight          = 0.15
  权重总和 = 0.60（剩余 0.40 留给 BaseAutonomy）
```

**冷启动赋值规则（totalRuns < 10）**：

| 变量 | 冷启动初值 | 收敛条件 |
|------|---------|---------|
| `ContextFamiliarity` | 0.3（行业先验，假设新 Agent 对任务半生不熟） | totalRuns ≥ 50 切换为公式计算 |
| `TrustBonus` | `BaseAutonomy × 0.5`（贝叶斯先验：信任 = 起点信任的一半） | totalRuns ≥ 30 切换为 `computeTrustScore()` |
| `recentFailures` 权重 | 单次失败惩罚封顶 0.2（防止首次失败永久打入冷宫） | totalRuns ≥ 20 后采用 EWMA 指数加权 |

**裁决与 R 级硬规则的优先级（v3.1 关键修订）**：

```
工具调用 → 进入审批决策路径，按以下优先级依次裁决：

1. RX 级 → 硬拒绝（Fail-Closed，禁止 Agent 直接执行）
2. R4 级 → 强制走多人审批，AutonomyScore 仅用于建议优先级
3. R3 级 → 强制走人工审批，AutonomyScore 仅用于建议审批人
4. R0/R1/R2 级 → 按 AutonomyScore 决策：
   - score ≥ 0.7 → 自动执行
   - 0.4 ≤ score < 0.7 → 轻量确认（飞书/钉钉卡片确认）
   - score < 0.4 → 完整审批流程
5. Policy Engine override（v3.1 新增）→ 任何 ABAC/RBAC 策略可向上覆盖（拒绝更严，不可向下放宽）

硬约束：
- R3/R4 永远不能因高 AutonomyScore 被自动放行
- AutonomyScore 仅影响 R0–R2 与轻量确认/审批的分流
- Policy Engine 在所有层级具有"拒绝即终结"的权力，但不能放宽 R 级硬规则
```

**反 Reward-Hacking 约束（v3.1 新增）**：

- ContextFamiliarity 中"情景记忆命中数"按 **去重后** 计数（同 entity 重复任务不抬分）
- TrustBonus 单次任务最大正向增量 0.01，下降无限制（非对称权重）
- 跨租户的 trust 数据不可合并（隔离 §20.5 `tenantId` 字段）
- §19.4 KPI「AutonomyScore 月增长 ≥ +0.05」必须与「审批抽检率 ≥ 5%」「幻觉检出率 ≥ 80%」三联动评估，单指标达标不通过

### 10.2 自适应编排

| 编排模式 | 量化触发条件（v3.1 修订） | Agent 拓扑 | 适用场景 |
|---------|------------------------|-----------|---------|
| Solo | `subtaskCount = 1` ∧ `requiredCapabilities.size ≤ 1` | 1 Agent | 简单查询、单步操作 |
| Sequential | `subtaskCount ∈ [2,5]` ∧ `dependencyDepth > 0` ∧ 无可并行分支 | A → B → C | 需求分析→拆解→分配 |
| Parallel | `subtaskCount ≥ 2` ∧ `parallelizableRatio ≥ 0.5` ∧ 子任务无写冲突 | A ∥ B ∥ C → Merge | 多文件同时编辑 |
| Hierarchical | `subtaskCount > 5` ∨ `requiredCapabilities.size > 3` ∨ Phase=execution | Supervisor → Workers | Phase 2 完整开发流 |
| Swarm | `taskUncertainty > 0.7` ∧ `experimentalMode=true`（v3.1 仅试验环境） | Peer-to-Peer | 探索性任务（v3.2 GA 候选，v3.1 不出生产） |

**切换 hysteresis 与 cooldown（v3.1 新增）**：

| 项 | 默认值 | 说明 |
|----|-------|------|
| `mode_switch_min_interval` | 30s | 同一 Run 内编排模式切换最小间隔，防震荡 |
| `mode_switch_score_delta` | 0.15 | 切换需要新模式评分 - 当前模式评分 ≥ 0.15，否则保持 |
| `mode_switch_max_per_run` | 3 | 单 Run 内总切换次数上限，超限锁定到 Hierarchical 兜底 |
| `mode_decision_cache_ttl` | 10s | Selector 决策结果短期缓存，降低热路径开销 |

> `IOrchestrationSelector.select()` 实际签名见 §20.4；返回 `OrchestrationDecision { mode, score, alternatives, cooldownUntil }`。

### 10.3 模型路由策略（v3.1 修订：统一阈值口径 + Run 内 stable_prefix 约束）

```
任务类型 + 预算状态 → 模型选择：

┌──────────────────────────────────────────────────────────────────┐
│ 路由规则（按任务类型）：                                            │
│                                                                   │
│  规划/架构设计类    → Claude Opus / GPT-4.5 (高推理力)             │
│  代码生成类         → Claude Sonnet / GPT-4o (平衡)               │
│  简单查询/分类     → GPT-4o-mini / Claude Haiku (快速)             │
│  安全/合规检查     → 专用微调模型 (准确)                            │
│  嵌入/向量化       → text-embedding-3-small (成本低)               │
│                                                                   │
│ 预算降级阈值（统一为「remaining%」口径，与 §10.4 一致）：           │
│  remaining ≥ 40%   使用声明的首选模型                              │
│  20% ≤ remaining < 40%   自动切换至轻量模型（mini/haiku）          │
│  10% ≤ remaining < 20%   仅执行必要步骤，跳过可选优化              │
│  remaining < 10%   停止执行，保存 Checkpoint，通知人工             │
└──────────────────────────────────────────────────────────────────┘
```

**Run 内 stable_prefix 约束（v3.1 新增）**：

- 同一 AgentRun 内，**默认不允许中途切换 modelId**，以保持 stable_prefix 缓存命中
- 例外情况（必须经 §20.9 `IModelRouter.route()` 返回 `fallback.allowed=true`）：
  1. 主模型失败连续 ≥3 次（Phase B 降级）
  2. 预算 remaining < 20% 触发轻量化
  3. 用户/管理员显式 override
- 切换发生时：发射 `model_fallback` 流式事件 + 标记 cache_invalidated；下一 Turn 走全新 prefix
- 切换记录持久化到 `AgentRun.modelTransitions[]`，供成本对账与回溯

### 10.4 预算维度（v3.1 修订：单一真相源 + 多 Run 预留机制）

```
TotalBudget = TokenBudget ∩ CostBudget ∩ TimeBudget ∩ StepBudget

子预算定义（v3.1 唯一权威）：
  TokenBudget    = InputBudget + CachedPrefixBudget + ThinkingBudget + OutputBudget
                   （单位：tokens，由 Provider tokenizer 计算）
  CostBudget     = ∑(各模型调用 USD 成本) + ∑(工具 API 成本) + ∑(沙箱 CPU·秒成本)
                   （单位：USD，含汇率字段供 CNY 换算）
  TimeBudget     = AgentRun 端到端墙钟时间
                   （单位：秒）
  StepBudget     = Tool 调用次数 + RAG 检索次数
                   （单位：次数）

降级阈值（统一为「remaining%」口径，与 §10.3 一致）：
  remaining ≥ 40%  → 正常执行
  20% ≤ remaining < 40%  → 切换至轻量模型 / 跳过可选 RAG
  10% ≤ remaining < 20%  → 仅执行必要步骤，跳过可选优化
  remaining < 10%  → 强制总结 + Checkpoint + 通知人工

多维预算最终耗尽判定：
  isExhausted = ANY(dimension.remaining ≤ 0)
```

> **成本公式与 §16.4、§17.6 关系**：本节仅定义维度，**权威成本公式集中在 §17.6** 并通过 §23「单一真相源对照表」引用。§16.4 仅展示衍生计算示例，不再提供独立公式。

**多 Run 共享预算池隔离（v3.1 新增）**：

| 机制 | 实现 |
|------|------|
| **Reservation Tree** | `tenant → project → run → turn` 四层预留树；Run 启动时从 project 池 `reserve()`，结束时 `release()` |
| **预留语义** | `reserve(amount)` 原子操作，失败抛 `BudgetExhaustedError`；`commit(used)` 实际扣减；`release()` 释放未用部分 |
| **Fair Share 限制** | `maxConcurrentRunsPerTenant`、`maxTokensPerHourPerTenant` 双限；超限走 §6.2 Backpressure 调度策略 |
| **突发 burst 处理** | 允许超出日预算 20%（reserved bucket），但 §16 触发告警；连续 3 天 burst 自动锁定为非升级模式 |
| **审批挂起期间** | `waiting_approval` 状态的 Run 预留减半（释放 50% 给其他 Run），审批通过后重新申请 |
| **OOM 防护** | 单 Run 预留上限 = `min(tenant.daily / 10, $20)`，防止单个失控 Run 击穿租户预算 |

### 10.5 重试策略

> v3.0 新增：根据失败类型决定是否重试、如何重试，避免重试风暴和无效重试。

**IRetryPolicy 接口**：

```typescript
/**
 * 重试策略端口
 * @description 根据失败类型决定是否重试、如何重试
 * @stability S2
 */
interface IRetryPolicy {
  /**
   * 判断是否应该重试
   * @param failure - 失败信息
   * @param attempt - 当前尝试次数
   * @returns 重试决策
   */
  shouldRetry(failure: FailureContext, attempt: number): RetryDecision;
}

/** 重试决策 */
type RetryDecision =
  | { action: 'retry'; delayMs: number; strategy: 'same' | 'fallback_model' | 'simplified_prompt' }
  | { action: 'abort'; reason: string }
  | { action: 'escalate'; target: 'human' | 'supervisor_agent' };
```

**失败类型策略表（v3.1 修订：加 jitter + 幂等保护）**：

| 失败类型 | 重试策略 | 最大尝试 | 退避策略 | 幂等性要求 |
|---------|---------|---------|---------|-----------|
| 网络超时 (timeout) | 原样重试 | 3 | **指数退避 + Full Jitter**：`delay = random(0, base × 2^attempt)`，base=1s | 工具必须 `isIdempotent=true` 才重试，否则升级人工 |
| 速率限制 (rate_limit) | 延迟后重试 | 5 | 优先使用 API 返回的 `Retry-After`，缺失时退化为 `random(2^attempt, 2^(attempt+1))` 秒 | 与租户级 §6.2 backpressure 联动 |
| 模型过载 (overloaded) | 切换备选模型 | 2 | 立即切换 + 5s cooldown | 触发 §10.3 `model_fallback` 事件 |
| 输出格式错误 (format_error) | 简化 Prompt 重试 | 2 | 无退避 | LLM 调用本身幂等 |
| 工具执行失败 (tool_error) | 参数修正后重试 | 2 | 100ms + jitter | **强制**：仅 `isIdempotent=true` 工具可参数修正重试；非幂等工具必须升级人工或 saga 补偿 |
| 幻觉检测 (hallucination) | 注入纠正提示 | 1 | 无退避 | - |
| 预算耗尽 (budget_exhausted) | 不重试，升级人工 | 0 | - | - |
| 权限拒绝 (permission_denied) | 不重试，升级人工 | 0 | - | - |
| Checkpoint 损坏 (checkpoint_corrupt) | 不重试，转 `failed` | 0 | - | 触发 §5.3 `recovery.corrupted` 转移 |

**FailureContext 标准结构（v3.1 新增，详见 §20.10）**：

```typescript
interface FailureContext {
  readonly runId: string;
  readonly turnIndex: number;
  readonly attemptCount: number;          // 从 1 起算
  readonly maxAttempts: number;
  readonly errorCode: string;             // NexusError.code
  readonly errorKind: 'transient' | 'permanent' | 'unknown';
  readonly retryable: boolean;            // 基础可重试性，IRetryPolicy 可 override
  readonly failureType: FailureType;      // 上表枚举值
  readonly originalError: NexusError;
  readonly toolCallId?: string;           // 工具失败专用
  readonly toolCharacteristics?: ToolSafetyCharacteristics;  // 用于幂等判定
  readonly modelInfo?: { modelId: string; provider: string };
}

type FailureType =
  | 'timeout' | 'rate_limit' | 'overloaded' | 'format_error'
  | 'tool_error' | 'hallucination' | 'budget_exhausted'
  | 'permission_denied' | 'checkpoint_corrupt';
```

**全局重试治理**：

- 单 Run 总重试次数上限 = `floor(StepBudget × 0.3)`，超限强制升级人工
- 同一工具连续失败 ≥3 次自动加入 `tool.degraded` 列表，本 Run 内禁用
- 防 thundering herd：同租户多 Run 同时遇 rate_limit 时，按 runId 哈希分散到 [base, base × N] 窗口

### 10.6 自适应策略端口契约（汇总）

> v3.0 新增：将上述所有自适应策略统一为可插拔端口，控制面通过策略注入决定运行时行为。

| 端口 | 职责 | 稳定性 | 关联章节 |
|------|------|--------|---------|
| `IOrchestrationSelector` | 根据任务特征动态选择编排模式 | S2 | §10.2 + §20.4 |
| `IContextPolicy` | 决定上下文组装与压缩策略 | S2 | §9.6 + §20.8 |
| `IModelRouter` | 根据任务类型、预算、延迟选择模型 | S2 | §10.3 + §20.9 |
| `IRetryPolicy` | 决定失败重试策略 | S2 | §10.5 + §20.10 |
| `IToolResultBudget` | 决定工具结果截断策略 | S2 | §7.5 |

---

## 十一、可插拔能力包体系

### 11.1 包类型五级分类

> v3.0 升级：采用按"影响范围"五级分类的方式，便于差异化治理。

```
能力包五级分类：

┌─────────────────────────────────────────────────────┐
│  Level 5: Platform Pack（平台级）                      │
│  ── 由 Nexus 核心团队维护，全局影响                    │
│  ── 示例: Authentication Pack, Observability Pack     │
├─────────────────────────────────────────────────────┤
│  Level 4: Domain Pack（领域级）                        │
│  ── 特定业务领域的完整能力集                           │
│  ── 示例: DevOps Pack, Finance Pack, HR Pack          │
├─────────────────────────────────────────────────────┤
│  Level 3: Agent Pack（Agent 级）                      │
│  ── 单个 Agent 的完整定义（Prompt + Tools + Skills）  │
│  ── 示例: CodeReviewerAgent Pack, PPTGeneratorPack   │
├─────────────────────────────────────────────────────┤
│  Level 2: Tool Pack（工具级）                         │
│  ── 一组相关工具的集合                                │
│  ── 示例: Git Tools Pack, Feishu Tools Pack          │
├─────────────────────────────────────────────────────┤
│  Level 1: Connector Pack（连接器级）                  │
│  ── 单个外部系统的接入适配                            │
│  ── 示例: Jira Connector, Confluence Connector       │
└─────────────────────────────────────────────────────┘
```

**按功能维度的细分类型**（与五级分类正交）：

| 类型 | 说明 | 示例 | 部署方式 |
|------|------|------|---------|
| AgentPack | 一组相关 Agent 的集合 | PM Agent Pack (Phase 1) | 独立注册，按需启用 |
| ToolPack | 一组相关工具的集合 | Feishu Tool Pack | MCP Server 独立进程 |
| ProviderPack | LLM Provider 适配器 | Anthropic Provider | 插件式加载 |
| GuardrailPack | 护栏规则集 | GDPR Compliance Pack | 策略引擎热加载 |
| MemoryPack | 记忆存储适配器 | Qdrant Memory Pack | 接口适配 |
| IntegrationPack | 外部系统集成器 | Jira Integration Pack | Connector 模式 |
| ConnectorPack | 单一外部系统连接器 | Jira Connector | Connector 模式 |

### 11.2 能力包生命周期

```
能力包状态机：

  ┌───────────┐    install    ┌───────────┐
  │ published │──────────────▶│ installed │
  └───────────┘               └─────┬─────┘
                                    │ enable
                              ┌─────▼─────┐
                              │  enabled  │◀──────────┐
                              └─────┬─────┘           │
                                    │ disable    re-enable
                              ┌─────▼─────┐           │
                              │  disabled │──────────┘
                              └─────┬─────┘
                                    │ uninstall
                              ┌─────▼───────┐
                              │ uninstalled │
                              └─────────────┘

状态转换规则：
  published → installed:  依赖检查通过 + 兼容性验证
  installed → enabled:    首次启用需运行 onActivate 钩子
  enabled → disabled:     保留数据，停止接收请求
  disabled → enabled:     运行 onReactivate 钩子
  disabled → uninstalled: 运行 onDeactivate 钩子 + 数据清理确认

版本管理：
  • 同一能力包可同时存在多个版本
  • 支持灰度发布（按租户/用户百分比）
  • 支持一键回滚到上个版本
```

### 11.3 CapabilityPackManifest 接口（v3.1 修订：semver-range + 钻石依赖 + 签名）

```typescript
/**
 * 能力包清单声明（v3.1 增强版）
 * 每个能力包必须提供此清单，用于注册和依赖解析
 * @stability S2（控制面契约）
 */
interface CapabilityPackManifest {
  readonly id: string;                          // 反向 DNS：com.nexus.phase1.pm-tools
  readonly name: string;
  readonly version: string;                     // 严格 SemVer 2.0
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly type: PackType;
  readonly phase?: PhaseId;
  readonly description: string;
  readonly author: string;
  readonly signature: PackSignature;            // v3.1 新增：包签名（防篡改）
  readonly kernelCompatibility: SemverRange;    // v3.1 改类型：semver-range 结构
  readonly provisions: readonly PackProvision[];
  readonly requirements: readonly PackRequirement[];
  readonly lifecycle: PackLifecycle;
  readonly runtime: PackRuntimeSpec;            // v3.1 新增：运行时隔离规约
  readonly agents?: readonly AgentDefinitionRef[];
  readonly tools?: readonly ToolDefinitionRef[];
  readonly guardrails?: readonly GuardrailRuleRef[];
  readonly config: PackConfigSchema;
  readonly healthCheck: string;
  readonly sunsetDate?: Date;
  readonly hotReloadable: boolean;              // v3.1 新增：是否支持热插拔（false 时需滚动重启）
}

/** SemVer Range 结构化定义（v3.1 新增） */
interface SemverRange {
  readonly min: string;                         // 最低兼容版本，例 "3.1.0"
  readonly max?: string;                        // 最高兼容版本（不含）
  readonly excludes?: readonly string[];        // 已知不兼容版本
}

/** 包签名（v3.1 新增） */
interface PackSignature {
  readonly algorithm: 'ed25519' | 'rsa-pss-sha256';
  readonly publicKeyId: string;                 // 在 control-plane 信任根中注册
  readonly signature: string;                   // base64
  readonly signedAt: Date;
}

/** 运行时隔离规约（v3.1 新增） */
interface PackRuntimeSpec {
  readonly executionMode: 'in-process' | 'worker_thread' | 'child_process' | 'mcp_server';
  readonly resourceLimits: {
    readonly maxMemoryMB: number;
    readonly maxCpuPercent: number;
    readonly maxConcurrentRuns: number;
  };
  readonly networkPolicy: 'isolated' | 'whitelist' | 'open';
  readonly allowedHosts?: readonly string[];
}

type PackType =
  | 'agent'
  | 'tool'
  | 'provider'
  | 'guardrail'
  | 'memory'
  | 'integration'
  | 'connector';

/** 包提供的能力（v3.1：增加唯一性约束） */
interface PackProvision {
  readonly type: 'agent' | 'tool' | 'connector' | 'policy' | 'guard';
  readonly id: string;                          // 全局唯一，命名空间 packId/id
  readonly description: string;
  readonly exports: readonly string[];
  readonly stability: 'S2' | 'S3' | 'S4' | 'S5';  // v3.1 新增：能力稳定性分级
}

/** 包依赖的能力（v3.1：结构化 versionRange） */
interface PackRequirement {
  readonly packId: string;
  readonly versionRange: SemverRange;           // v3.1 改类型
  readonly optional: boolean;
  readonly resolutionHint?: 'strict' | 'highest-compatible' | 'isolated';  // v3.1 新增
}

/** 生命周期钩子（v3.1 修订：沙箱执行 + 签名校验） */
interface PackLifecycle {
  /** 钩子脚本路径（相对包根目录） */
  readonly onInstall?: PackHookSpec;
  readonly onActivate?: PackHookSpec;
  readonly onDeactivate?: PackHookSpec;
  readonly onReactivate?: PackHookSpec;
  readonly onUninstall?: PackHookSpec;
}

/** 钩子规约（v3.1 新增） */
interface PackHookSpec {
  readonly script: string;                      // 脚本相对路径
  readonly timeoutMs: number;                   // 单次执行上限，默认 30000
  readonly executionMode: 'worker_thread' | 'child_process';  // 强制沙箱执行
  readonly allowedAPIs: readonly string[];      // 允许调用的 control-plane API
}
```

**钻石依赖 Resolution 算法（v3.1 新增）**：

```
输入：Pack A 依赖 Pack B@^1.0.0 和 Pack C@^1.0.0；B 依赖 D@^1.0.0；C 依赖 D@^2.0.0

Resolution 决策树：
1. 收集所有 PackRequirement 形成依赖图
2. 对每个 packId 收集所有 versionRange，求交集
3. 交集非空 → 选 highest-compatible 版本（按 resolutionHint）
4. 交集为空 → 进入隔离模式：
   a. requirementHint = 'isolated' → 允许 D@1.x 与 D@2.x 同时加载到独立沙箱
   b. requirementHint = 'strict'   → 拒绝安装，返回冲突报告
   c. requirementHint = 'highest-compatible'（默认） → 尝试选 D@2.x，但要求 B 声明 peerCompatible
5. 钻石依赖审计：所有 isolated 加载产生 nexus.pack.diamond_dependency 指标

provisions 冲突仲裁：
- 同 packId/id 跨 Pack 重名 → 拒绝安装
- 跨 Pack 同 type+name 但不同 id → 必须由 Policy Engine 配置 default-resolver 才能解析
```

**热插拔范围明确化（v3.1 新增）**：

| 变更类型 | 是否需重启 | 处理方式 |
|---------|----------|---------|
| `hotReloadable=true` 的 Tool/Agent 版本升级 | 否 | Pack Registry 热加载，在途 Run 锁定旧版本，新 Run 用新版本 |
| `hotReloadable=true` 的配置变更 | 否 | 通过 ConfigWatcher 推送，下一 Turn 生效 |
| Guardrail 规则集 | 否 | 策略引擎热加载（紧急 CVE 响应路径） |
| Kernel 接口变更（S0/S1） | **是** | 全集群滚动重启 |
| Provider 凭据轮换 | 否 | Secret Manager 自动注入 |
| Pack lifecycle 钩子（含 native 依赖） | **是** | 节点级滚动重启 |
| MCP Server 进程升级 | 否（仅 MCP 进程重启） | Tool Gateway reconnect |

### 11.4 补偿能力日落管理（来自 v2.0 演进 §6）

> v3.0 新增：补偿能力 ≠ 永久能力——任何为弥补内核未就绪而引入的临时桥接必须声明日落条件。

**补偿能力清单与日落条件表**：

| 补偿能力 | 补偿什么 | 日落条件 | 预计日落版本 |
|---------|---------|---------|------------|
| ManualRetryMiddleware | L1 缺少原生重试端口 | IRetryPolicy 正式发布 | v3.1 |
| LegacyPromptInjection | L2 安全扫描器未就绪时的规则过滤 | GuardrailPack 达到 P95 准确率 | v3.2 |
| SyncToolBridge | 异步工具网关未就绪时的同步桥接 | IToolProtocolAdapter 支持全异步 | v3.1 |
| FlatContextWindow | 上下文策略引擎未就绪时的简单截断 | IContextPolicy 三种以上策略可用 | v3.2 |
| StaticModelMapping | 模型路由未就绪时的静态映射表 | IModelRouter 支持多维路由 | v3.3 |
| SingleTenantGuard | 多租户隔离未完成时的单租户保护 | TenantId 贯穿事件信封 + 数据层 | v4.0 |

**ISunsetEngine 接口（v3.1 修订：分级 S5、补全 SunsetEvaluation 类型、加 rollback）**：

```typescript
/**
 * 补偿能力日落引擎
 * @description 自动评估补偿能力的日落条件并驱动日落流程
 * @stability S5 — 治理补偿层契约本身亦为 L4 临时设施，最终随补偿全部下线而消亡
 */
interface ISunsetEngine {
  /**
   * 注册补偿能力及其日落条件
   * @param spec - 补偿能力规格
   */
  register(spec: CompensationSpec): void;

  /**
   * 评估所有补偿能力的日落就绪状态
   * @returns 评估报告
   */
  evaluate(): Promise<readonly SunsetEvaluation[]>;

  /**
   * 执行日落动作
   * @param compensationId - 补偿能力 ID
   * @param action - 日落动作
   * @returns 执行结果（含回滚信息）
   */
  executeSunset(compensationId: string, action: SunsetAction): Promise<SunsetExecutionResult>;

  /**
   * v3.1 新增：回滚已执行的日落动作
   * @description 当 Hard Sunset 后发现关键依赖未拆除导致故障时，回滚到 Soft Sunset
   */
  rollback(compensationId: string, toAction: SunsetAction): Promise<void>;
}

/** 补偿能力规格（v3.1 修订） */
interface CompensationSpec {
  readonly id: string;
  readonly name: string;
  /** 它补偿的内核/控制面缺失 */
  readonly compensatesFor: string;
  /** 日落条件列表（全部满足则可日落） */
  readonly sunsetConditions: readonly SunsetCondition[];
  /** 最大存活版本数 */
  readonly maxVersionsAlive: number;
  /** v3.1 新增：评估指标的客观基准 */
  readonly evaluationBaseline?: EvaluationBaseline;
}

/** 评估基准（v3.1 新增） */
interface EvaluationBaseline {
  readonly testDatasetId: string;           // 评估数据集 ID（如 guardrail-benchmark-v2）
  readonly sampleSize: number;              // 最少样本数
  readonly windowDays: number;              // 评估窗口
  readonly maintainedBy: string;            // 维护团队
}

/** 日落条件 */
type SunsetCondition =
  | { type: 'interface_available'; interfaceId: string; minVersion: string }
  | { type: 'metric_threshold'; metric: string; operator: '>=' | '<='; value: number; baseline: EvaluationBaseline }
  | { type: 'call_volume_threshold'; metric: 'compensation.invocation_count'; operator: '<='; value: number; windowDays: number }
  | { type: 'version_reached'; version: string }
  | { type: 'manual_approval'; approver: string };

/** 日落动作 */
type SunsetAction = 'observe' | 'soft_sunset' | 'hard_sunset';

/** v3.1 新增：评估报告 */
interface SunsetEvaluation {
  readonly compensationId: string;
  readonly currentAction: SunsetAction;
  readonly recommendedAction: SunsetAction;
  readonly readyToProgress: boolean;
  readonly conditionResults: readonly SunsetConditionResult[];
  readonly evaluatedAt: Date;
}

interface SunsetConditionResult {
  readonly condition: SunsetCondition;
  readonly passed: boolean;
  readonly actualValue?: number | string;
  readonly evidence: string;          // 数据来源说明
}

/** v3.1 新增：执行结果 */
interface SunsetExecutionResult {
  readonly success: boolean;
  readonly fromAction: SunsetAction;
  readonly toAction: SunsetAction;
  readonly rollbackable: boolean;
  readonly rollbackTokenId?: string;       // 用于 rollback() 的 token
  readonly errorMessage?: string;
}
```

> **补偿层分级修订**：v3.0 标 `ISunsetEngine @stability S3` 是错误，与 §2.3 「L4/L5 = S5」约束冲突。v3.1 统一为 **S5**：治理补偿契约本身不承诺向后兼容，最终随所有补偿模块下线而消亡。 §20.12 同步修正。

**平滑降级机制（三阶段）**：

```
补偿能力日落三阶段：

阶段 1: Observation 期（2 周）
├── 双写模式：补偿能力 + 新能力同时运行
├── 对比指标：延迟、成功率、结果一致性
├── 自动化验证：>= 99.5% 一致性才进入下一阶段
└── 退出条件：一致性 < 99.5% 则回退

阶段 2: Soft Sunset 期（4 周）
├── 新请求默认走新能力
├── 补偿能力仅处理新能力失败时的降级流量
├── 监控降级触发率（目标 < 1%）
├── 审计日志标记补偿能力调用
└── 退出条件：降级率 < 0.5% 持续 2 周

阶段 3: Hard Sunset
├── 补偿能力代码标记 @deprecated
├── 下一版本物理移除
├── 移除前最终确认：过去 4 周零降级调用
└── 发布变更日志通知所有使用方
```

---

## 十二、三阶段业务方案

### 12.1 Phase 1 — 意图层详细方案

**Agent 列表**：

| Agent | 职责 | 核心工具 | 模型 |
|-------|------|---------|------|
| RequirementAnalystAgent | 需求分析与澄清、结构化输出 | doc.read, project.query | Sonnet |
| TaskPlannerAgent | WBS 拆解 + 关键路径 + 工时估算 | task.decompose, task.assign | Sonnet |
| ProjectDoctorAgent | 项目健康诊断 + 风险识别 | project.query, risk.identify | Sonnet |
| ProgressTrackerAgent | 进度监控 + 偏差分析 + 预测 | task.query, milestone.query | Haiku |
| ReminderAgent | 智能催办（策略矩阵驱动） | notification.send, task.query | Haiku |
| EstimationAgent | AI 工时估算（历史数据回归） | history.query, task.estimate | Sonnet |

**工具集（MCP Server: nexus-pm-tools）**：

| 工具 | 类型 | 风险等级 | 说明 |
|------|------|---------|------|
| project.create | write | R1 | 创建项目 |
| project.query | read | R0 | 查询项目信息 |
| task.decompose | write | R1 | WBS 任务拆解 |
| task.assign | write | R2 | 分配任务负责人 |
| task.updateStatus | write | R1 | 更新任务状态 |
| milestone.create | write | R1 | 创建里程碑 |
| risk.identify | write | R1 | 识别并记录风险 |
| risk.assess | read | R0 | 风险评估 |
| notification.send | write | R1 | 发送通知消息 |
| report.generate | read | R0 | 生成报告 |

**催办策略表**：

| 任务状态 | 距截止日 | 催办策略 | 升级条件 |
|---------|---------|---------|---------|
| 进行中（正常进度） | > 3 天 | 无操作 | - |
| 进行中（偏慢） | > 3 天 | 日报提醒 | 连续 3 天无进展 |
| 进行中（偏慢） | 1-3 天 | 紧急提醒 + 通知 PM | 阻塞原因未解决 |
| 未开始 | 1-3 天 | 升级提醒 + 阻塞分析 | 无响应自动升级 |
| 任意 | 0 天 | 高优警报 + HITL 判定 | - |
| 已超期 | < 0 天 | 自动风险事件 + 管理层通知 | - |

### 12.2 Phase 2 — 执行层详细方案

**Agent 列表**：

| Agent | 层级 | 职责 | 模型 |
|-------|------|------|------|
| RequirementParserAgent | 规划层 | 深度需求解析 + 验收标准提取 | Opus |
| ArchitecturePlannerAgent | 规划层 | 技术方案设计 + 接口定义 | Opus |
| ExecutionPlannerAgent | 规划层 | 分步执行计划生成 | Sonnet |
| CodeGeneratorAgent | 实现层 | 代码实现（多文件、跨模块） | Sonnet |
| CodeReviewerAgent | 实现层 | 自我审查（Critic 模式） | Sonnet |
| RefactorAgent | 实现层 | 代码优化重构 | Sonnet |
| TestGeneratorAgent | 验证层 | 测试代码生成 | Sonnet |
| TestRunnerAgent | 验证层 | 沙箱内测试执行 | Haiku |
| BugFixerAgent | 验证层 | 失败分析 + 自动修复（≤3次） | Sonnet |
| SecurityScannerAgent | 验证层 | SAST 安全扫描 | 专用模型 |
| DeploymentAgent | 交付层 | CI/CD 触发 + 部署验证 | Haiku |
| PRCreatorAgent | 交付层 | 创建 PR + 变更说明 | Sonnet |
| AcceptanceAgent | 交付层 | 通知验收 + 反馈迭代 | Sonnet |

**研发交付工作流**：

```
task.assigned_to_ai 事件到达
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 规划阶段                                                     │
│  RequirementParser → ArchitecturePlanner → ExecutionPlanner │
│  [可选 HITL: 技术方案确认]                                   │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 实现阶段（循环）                                             │
│  CodeGenerator → CodeReviewer → [通过?]                     │
│       ↑                            │ 不通过                  │
│       └────── RefactorAgent ◀──────┘                        │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 验证阶段                                                     │
│  TestGenerator → TestRunner → [通过?]                       │
│       │                          │ 不通过                    │
│       │              BugFixer ───┘ (≤3次, 超限→HITL)        │
│       ▼                                                      │
│  SecurityScanner → [通过?] → 否 → HITL                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────┐
│ 交付阶段                                                     │
│  DeploymentAgent → PRCreator → AcceptanceAgent              │
│       │                              │                       │
│       │                   ┌──────────┴──────────┐           │
│       │                   │ 通过：              │            │
│       │                   │  • 发布验收结果事件 │            │
│       │                   │  • 触发 OERCD 学习  │            │
│       │                   └─────────────────────┘           │
│       │                   ┌──────────┴──────────┐           │
│       │                   │ 不通过：             │            │
│       │                   │  • 解析反馈          │            │
│       │                   │  • 生成修改计划      │            │
│       │                   │  • 新一轮迭代        │            │
│       │                   └─────────────────────┘           │
└─────────────────────────────────────────────────────────────┘
```

> Phase 2 不直接修改 Phase 1 内部状态；交付结果统一发布 `task.acceptance_result` / `task.completed` / `task.failed` 事件，由 Phase 1 自行消费并更新任务状态，保持 Phase Bridge 事件解耦硬约束。

### 12.3 Phase 3 — 连接层详细方案

**Agent 列表**：

| Agent | 职责 | 核心集成平台 |
|-------|------|------------|
| IssueTriageAgent | 问题分类 + 优先级 + 责任人建议 | Jira/自研 Issue 平台 |
| DocumentAgent | 文档搜索/生成/更新/总结/翻译 | 飞书文档/Confluence |
| MeetingAgent | 会议创建 + 纪要提取 + 行动项同步 | 飞书会议/腾讯会议 |
| PPTGeneratorAgent | 项目汇报/周报/复盘 PPT 生成 | PPT 生成引擎 |
| OAAgent | 对话式审批/请假/报销/会议室预订 | 企业 OA 系统 |
| CalendarAgent | 日程管理 + 每日总结 + 次日计划 | 飞书/Outlook 日历 |
| KnowledgeOpsAgent | 知识质量维护/过期检测/重复清理 | 内部知识库 |
| RAGAgent | 企业知识库自然语言问答 | Qdrant + ES |

**Connector 列表**：

| Connector (MCP Server) | 覆盖能力 |
|----------------------|---------|
| nexus-feishu-mcp | 消息/文档/会议/审批/日历/人事 |
| nexus-dingtalk-mcp | 消息/待办/审批/日历 |
| nexus-wecom-mcp | 消息/文档/审批 |
| nexus-oa-mcp | 审批/请假/报销/会议室 |
| nexus-issue-mcp | Issue CRUD/分配/状态流转 |
| nexus-doc-mcp | 文档 CRUD/搜索/权限 |
| nexus-ppt-mcp | PPT 生成/模板管理 |

---

## 十三、开发沙箱与研发交付安全

### 13.1 沙箱强制边界（v3.1 修订：默认 gVisor + 资源配额修正 + GPU 隔离）

| 边界维度 | 约束 | 违规处理 |
|---------|------|---------|
| 容器隔离 | 每任务独立容器，`--cap-drop ALL` + 最小权限恢复 + seccomp profile + AppArmor | 拒绝执行 |
| 内核级隔离（v3.1 默认开启） | **gVisor (runsc)** 作为默认 runtime；性能敏感任务可降级为 runc + 强 seccomp | gVisor unavailable 时拒绝高风险任务 |
| 网络白名单 | 仅允许：Git 仓库 / npm-pypi / CI API / 内部 API；CNI 层 + iptables 双控；DNS over 内网解析器 | 其他连接丢弃 |
| **资源限制（v3.1 调整：适配真实研发负载）** | **CPU: 4核, 内存: 8GB, 磁盘: 20GB, PID: 1024**（Phase 2 标准；轻量任务可降为 2核/4GB/512 PID） | 超限 OOMKill；告警通知 |
| GPU 隔离（v3.1 新增） | NVIDIA GPU MIG/MPS 切片 + 独立 namespace；GPU 任务走单独资源池，禁止与 CPU 任务混合调度 | 拒绝 GPU 任务调度 |
| 凭据管理 | 短生命周期临时 Token（TTL = min(任务预计时间×2, 1h)）；waiting_approval 状态自动延长凭据；任务完成立即吊销 | 过期自动失效 |
| 文件系统 | 源码基线只读挂载，Agent 在独立 worktree / overlayfs 写入，最终以 diff/patch 形式提交；`/`、`/etc`、`/usr` 强制 readonly | 越界写入被拒绝 |
| 进程限制 | 禁止 fork bomb，PID namespace 隔离；`ulimit -u 256`；`fork` 调用频率限制（每秒 ≤10） | cgroup 强制限制 |
| 容器逃逸检测（v3.1 新增） | falco 运行时安全规则；kernel module 加载告警；mount/unmount syscall 阻断 | 立即终止容器 + 安全告警 + 隔离主机 |
| 多租户调度（v3.1 新增） | 不同 tenant 任务不共享 node（按 tenantId 反亲和）；同 tenant 不同 user 可共享 node 但不共享容器 | 调度器拒绝违规调度 |

### 13.2 高风险研发任务策略

| 风险场景 | 识别条件 | 额外管控 |
|---------|---------|---------|
| 涉及生产数据库 | 工具调用含 production DB 连接串 | 禁止 Agent 直接操作，必须 HITL |
| 涉及密钥/凭据 | 代码中出现 secret pattern | 自动 REDACT + 安全团队告警 |
| 大规模代码删除 | 单次删除 > 100 行 | 需 CodeReviewer 二次确认 |
| 依赖升级 | package.json 大版本变更 | 自动触发兼容性测试 |
| 部署到生产 | deploy target = production | R3 级审批 + 变更审批流 |
| 修改权限/安全配置 | 涉及 RBAC/Auth 相关文件 | R4 级审批 + 安全审查 |

---

## 十四、多协议与多模态能力

### 14.1 工具协议

| 协议 | 适配器 | 适用场景 | 特点 |
|------|--------|---------|------|
| MCP (Model Context Protocol) | MCPToolAdapter | 标准化工具接入（主选） | 事实标准，生态丰富 |
| REST/HTTP | RESTToolAdapter | 传统 API 接入 | 简单直接，适配成本低 |
| GraphQL | GraphQLToolAdapter | 复杂数据查询 | 按需取数，减少冗余 |
| gRPC | GRPCToolAdapter | 内部高性能服务 | 强类型，高吞吐 |
| WebSocket | WSToolAdapter | 实时双向通信 | 流式数据，持久连接 |
| CLI/Shell | ShellToolAdapter | 命令行工具包装 | 沙箱内执行，受限环境 |

### 14.2 ContentPart 多模态类型

```typescript
/**
 * 多模态内容片段类型定义
 * 支持文本、图像、音频、视频、文件等多种模态
 */
type ContentPart =
  | { readonly type: 'text'; readonly text: string }
  | { readonly type: 'image'; readonly source: ImageSource; readonly alt?: string }
  | { readonly type: 'audio'; readonly source: AudioSource; readonly transcript?: string }
  | { readonly type: 'video'; readonly source: VideoSource; readonly summary?: string }
  | { readonly type: 'file'; readonly source: FileSource; readonly mimeType: string }
  | { readonly type: 'code'; readonly language: string; readonly content: string }
  | { readonly type: 'table'; readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[] };

interface ImageSource {
  readonly type: 'base64' | 'url' | 'file_id';
  readonly data: string;
  readonly mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

interface AudioSource {
  readonly type: 'base64' | 'url' | 'file_id';
  readonly data: string;
  readonly mediaType: 'audio/mp3' | 'audio/wav' | 'audio/ogg';
  readonly durationMs: number;
}

interface VideoSource {
  readonly type: 'url' | 'file_id';
  readonly data: string;
  readonly mediaType: 'video/mp4' | 'video/webm';
  readonly durationMs: number;
}

interface FileSource {
  readonly type: 'base64' | 'url' | 'file_id';
  readonly data: string;
  readonly filename: string;
  readonly sizeBytes: number;
}
```

### 14.3 媒体处理管道

```
多模态输入
    │
    ├── 文本 → 直接进入上下文
    │
    ├── 图像 → Vision 模型分析 → 生成文字描述 → 进入上下文
    │         └── 大图自动压缩（保持宽高比，限制 2048px）
    │
    ├── 音频 → Whisper STT → 文字转录 → 进入上下文
    │         └── 长音频自动分段（每段 ≤ 30s）
    │
    ├── 视频 → 关键帧提取 + 音频转录 → 结构化摘要 → 进入上下文
    │
    ├── 文件(PDF/Word) → 文档解析器 → 结构化文本 → 进入上下文
    │                    └── 大文档自动分块（chunk ≤ 4KB）
    │
    └── 代码文件 → 语法高亮 + AST 分析 → 结构化代码块 → 进入上下文

输出同样支持多模态：Agent 可指示生成图表、PPT、文档等富媒体输出
```

---

## 十五、学习闭环与知识联邦

### 15.1 OERCD 门控表

| 阶段 | 触发条件 | 输入 | 输出 | 质量门控 |
|------|---------|------|------|---------|
| Observe（观察） | 任务开始 | 任务描述 + 上下文 | 相关技能 + 历史经验 | 检索结果相关度 > 0.7 |
| Execute（执行） | 观察完成 | 计划 + 工具 | 执行轨迹 (JSONL) | - |
| Reflect（反思） | 执行完成 + 工具调用 ≥ 5 | 执行轨迹 | 效率分析 + 最优路径 | 反思质量评分 > 0.6 |
| Crystallize（结晶） | 反思通过 | 反思输出 | 结构化技能文件 (Markdown) | 技能唯一性检查（与已有技能 <0.85 相似度） |
| Distribute（分发） | 结晶通过审核 | 已审核技能 | 推送至相关 Agent 技能库 | 人工/自动审核通过 |

### 15.2 OERCD 不进入条件

| 条件 | 原因 | 替代处理 |
|------|------|---------|
| 工具调用 < 5 次 | 任务过简单，无学习价值 | 仅记录执行日志 |
| 任务失败（非重试成功） | 失败经验单独处理 | 记入"反面案例库" |
| 重复任务（与已有技能相似度 > 0.85） | 无新知识 | 更新已有技能的命中计数 |
| Agent 信任度 < 0.5 | 不可信来源 | 不允许产生新技能 |
| 预算不足 | Reflect 需要额外 LLM 调用 | 标记为待处理，低峰期补执行 |

### 15.3 Evidence-Driven Trust 闭环

```
┌───────────────────────────────────────────────────────────────────┐
│                  Evidence-Driven Trust Loop                         │
│                                                                    │
│  Agent 执行 ──▶ 产生证据 ──▶ 验证证据 ──▶ 更新信任度            │
│       │              │            │             │                  │
│       │              ▼            ▼             ▼                  │
│       │         执行轨迹     自动验证      TrustProfile           │
│       │         工具结果     人工抽检      ├── successRate         │
│       │         决策理由     规则校验      ├── accuracyScore       │
│       │                                    ├── safetyScore         │
│       │                                    └── 影响 AutonomyScore  │
│       │                                                            │
│       └──── 信任度影响下次任务的自主权范围 ◀────────────────────── │
│                                                                    │
│  正循环：高信任 → 更多自主权 → 更多成功 → 信任进一步提升          │
│  负循环：低信任 → 更多审批 → 发现问题 → 修正后逐步恢复           │
└───────────────────────────────────────────────────────────────────┘
```

### 15.4 知识联邦分发类型

| 分发类型 | 触发条件 | 目标范围 | 审核要求 |
|---------|---------|---------|---------|
| Self（自分发） | 技能结晶完成 | 产出该技能的 Agent 本身 | 自动通过 |
| Peer（同级分发） | 审核通过 + 标签匹配 | 同 Phase 内相关 Agent | 规则审核 |
| Cross-Phase（跨阶段） | 审核通过 + 跨阶段标签 | 其他 Phase 的相关 Agent | 人工审核 |
| Organization（全局） | 高质量 + 通用性强 | 所有 Agent 可见 | 知识委员会审核 |
| Deprecated（废弃通知） | Curator 标记过期 | 所有引用该技能的 Agent | 自动通知 + 替代推荐 |

### 15.5 知识联邦守卫（v3.0 新增 - 反向负迁移保护）

> v3.0 新增：防止知识分发导致 Agent 性能下降（负迁移）——任何分发必须经联邦守卫评估、监控、回滚。

```typescript
/**
 * 知识联邦守卫
 * @description 防止知识分发导致负迁移（Agent 性能下降）
 * @stability S3
 */
interface IKnowledgeFederationGuard {
  /**
   * 评估知识是否适合分发到目标 Agent
   * @param knowledge - 待分发知识
   * @param request - 分发请求（v3.1 修订：从单一 targetAgent 改为完整请求结构）
   * @returns 分发决策
   */
  evaluate(
    knowledge: KnowledgeAsset,
    request: FederationRequest,
  ): Promise<FederationDecision>;

  /**
   * 监控分发后的效果（基于 A/B 对照）
   * @param distributionId - 分发记录 ID
   * @returns 效果评估
   */
  monitor(distributionId: string): Promise<FederationImpact>;

  /**
   * 回滚负迁移知识
   * @param distributionId - 分发记录 ID
   */
  rollback(distributionId: string): Promise<void>;
}

/** 分发请求（v3.1 新增） */
interface FederationRequest {
  readonly sourceAgentId: string;
  readonly sourceTenantId: string;
  readonly targetAgents: readonly AgentTrustProfile[];
  readonly proposedScope: 'self' | 'peer' | 'cross_phase' | 'organization';
  readonly proposedTenantScope: 'same_tenant' | 'cross_tenant_within_org' | 'global';  // v3.1：多租户传播范围
  readonly experimentConfig?: ABExperimentConfig;
}

/** A/B 实验配置（v3.1 新增） */
interface ABExperimentConfig {
  readonly controlGroupSize: number;
  readonly treatmentGroupSize: number;
  readonly observationWindowHours: number;  // 默认 72h
  readonly successCriteria: {
    readonly successRateDelta: number;       // 要求 ≥ 0
    readonly userSatisfactionDelta: number;
    readonly costDelta: number;              // 要求 ≤ +20%
  };
}

/** 联邦决策结果 */
interface FederationDecision {
  readonly approved: boolean;
  readonly reason: string;
  readonly recommendedScope: 'self' | 'peer' | 'cross_phase' | 'organization';
  readonly recommendedTenantScope: 'same_tenant' | 'cross_tenant_within_org' | 'global';  // v3.1
  readonly requiresHumanReview: boolean;
  readonly conditionedOn?: readonly string[];   // 满足前提条件后可重新评估
}

/** 联邦影响评估（v3.1 修订：补完 A/B 对照字段） */
interface FederationImpact {
  readonly distributionId: string;
  readonly controlGroup: GroupMetrics;
  readonly treatmentGroup: GroupMetrics;
  readonly performanceDelta: number;            // treatment - control
  readonly userSatisfactionDelta: number;
  readonly costDelta: number;
  readonly pValue: number;                      // 显著性检验
  readonly isNegativeTransfer: boolean;
  readonly recommendedAction: 'continue' | 'rollback' | 'extend_observation';
}

interface GroupMetrics {
  readonly sampleSize: number;
  readonly successRate: number;
  readonly avgCostUSD: number;
  readonly avgLatencyMs: number;
  readonly userSatisfactionScore: number;
}
```

### 15.6 反向负迁移保护机制表

| 保护机制 | 触发条件 | 动作 |
|---------|---------|------|
| A/B 对照 | 分发后 72h 内 | 对比使用新知识 vs 不使用的 Agent 性能 |
| 性能回退检测 | 目标 Agent 成功率下降 > 5% | 自动回滚 + 标记知识为"有害" |
| 冲突检测 | 新知识与已有知识矛盾 | 暂停分发 + 人工仲裁 |
| 过载保护 | 目标 Agent 技能库 > 200 条 | 触发 Curator 剪枝后再分发 |
| 信任度过滤 | 知识来源 Agent 信任度 < 0.5 | 禁止跨阶段分发 |
| 数据分级过滤 | 知识包含 `restricted` 数据 | 仅自分发，禁止外分发 |

---

## 十六、可观测、成本与风险控制

### 16.1 可观测三支柱

| 支柱 | 技术栈 | 采集内容 | 存储与可视化 |
|------|--------|---------|------------|
| Traces（链路） | OpenTelemetry SDK | AgentRun 全链路：意图→规划→工具调用→结果 | Grafana Tempo |
| Metrics（指标） | Prometheus client | 延迟/吞吐/错误率/成本/预算使用率 | Prometheus + Grafana |
| Logs（日志） | Pino 结构化日志 | 决策日志/错误日志/审计日志 | Elasticsearch + Kibana |

### 16.2 核心指标

**基础运行指标（v3.1 修订：统一命名 + Phase 1 P95 与告警阈值对齐）**：

| 指标名 | 说明 | 告警阈值 | Cardinality 控制 |
|--------|------|---------|------------------|
| `nexus.run.duration_ms` | AgentRun 端到端耗时 | Phase1 P95 > 90s / Phase2 P95 > 1800s / Phase3 P95 > 30s | 按 phase 分桶 |
| `nexus.run.llm_calls` | 每任务 LLM 调用次数 | > 20 次 | label: phase |
| `nexus.run.token_usage` | Token 消耗（按 Agent/Phase） | 超日预算 80% | label: tenant + phase（不含 runId） |
| `nexus.tool.latency_ms` | 工具调用延迟 | P95 > 10s | label: tool_name 取 top-50 + `_other` |
| `nexus.tool.error_rate` | 工具调用失败率 | > 10% | label: tool_name + error_kind 枚举 |
| `nexus.tool.error_rate_by_type` | 工具失败按错误码分类 | 单错误码 > 5% | label: error_code 取 top-30 + `_other` |
| `nexus.hitl.trigger_count` | HITL 触发次数 | 高频需根因分析 | label: agent_id |
| `nexus.cost.per_task_usd` | 每任务美元成本 | 超预算告警 | label: phase + tenant_tier |
| `nexus.approval.wait_ms` | 审批等待时间 | > 30min 升级 | label: risk_level |
| `nexus.checkpoint.success_rate` | Checkpoint 保存成功率 | < 99% | label: reason |
| `nexus.skill.hit_rate` | 技能库命中率 | 评估 OERCD 效果 | label: phase |
| `nexus.cache.hit_ratio` | 前缀缓存命中率（**唯一权威**，统一 v3.0 prefix_hit_rate 与 cache_hit_ratio 双名） | < 0.80 需优化 | label: provider + phase |
| `nexus.compact.trigger_count` | Compact 触发频率（按级别） | L4 频繁触发需优化 | label: compact_level (L1/L2/L3/L4) |
| `nexus.shadow.unavailable` | SessionShadow 不可用计数（**v3.1 新增**，对应 §9.3 降级路径） | 5min 内 > 5 次 | label: failure_reason |
| `nexus.pack.diamond_dependency` | Pack 钻石依赖隔离次数（**v3.1 新增**） | > 0 需关注 | label: pack_id |
| `nexus.streaming.context_window_usage` | 上下文窗口使用率（**v3.1 新增**） | > 0.85 | label: model_id |
| `nexus.token.throughput` | Token 吞吐（output tokens/sec，**v3.1 新增**） | < 10 提示模型过载 | label: model_id |

**Cardinality 全局约束（v3.1 新增）**：

| 约束项 | 限制 |
|-------|------|
| 单指标 label 总组合 | ≤ 10,000 |
| `runId` 不作 label | 仅用 trace_id 关联 |
| 高基数维度 | top-N 聚合 + `_other` bucket（N 默认 30）|
| Recording Rules | 按 tenant/agent 级预聚合，避免 query 时 cardinality 爆炸 |
| 指标重复注册防护 | 同公式 metric 在 §16.2 与 §16.3 不重复，§16.3 仅引用 §16.2 指标名 |

**Prompt Cache 指标（v3.0 新增）**：

| 指标 | 定义 | 目标 | 采集方式 |
|------|------|------|---------|
| `cache_hit_ratio` | 缓存命中 token / 总输入 token | ≥ 0.85 | Provider usage 返回值 |
| `stable_prefix_drift` | stable_prefix 在 Run 内变更次数 | = 0 | Prompt Assembler 内部计数 |
| `compact_cache_invalidation` | Compact 导致的缓存失效次数/总 Compact 次数 | ≤ 0.10 | Compact 事件标记 |
| `cross_run_cache_reuse` | 跨 Run 缓存命中 token / 总缓存 token | ≥ 0.70 | 同 Agent 多 Run 对比 |
| `cache_warm_up_turns` | 新 Run 达到稳定缓存命中率所需的轮次数 | ≤ 2 | 前 N 轮命中率统计 |
| `cost_per_turn_with_cache` | 启用缓存后的每轮平均成本 | ≤ $0.003 | 预算管理器实时计算 |

**韧性与性能指标（v3.0 新增）**：

| 指标 | 定义 | 目标值 | 采集方式 |
|------|------|--------|---------|
| `tool_self_healing_rate` | 工具失败后模型自主修复并完成任务的比例 | ≥ 70% | 注入模拟错误的集成测试 |
| `model_fallback_transparency` | 降级发生后任务仍成功完成的比例 | ≥ 85% | fallback 触发场景的任务完成率 |
| `checkpoint_recovery_rate` | 从 Checkpoint 恢复后任务正常续接的比例 | ≥ 95% | 随机中断 + 恢复测试 |
| `graceful_shutdown_zero_loss` | SIGTERM 后所有活跃 Run 的状态成功保存 | = 100% | 压力测试中发送 SIGTERM |
| `stream_resume_rate` | 流式传输中断后客户端可无缝续接 | ≥ 90% | 网络抖动模拟测试 |

**认知质量指标（v3.0 新增 - 来自认知热力图）**：

| 指标 | 定义 | 目标值 | 采集方式 |
|------|------|--------|---------|
| `decision_traceability_rate` | 有完整决策链记录的关键决策 / 总关键决策 | ≥ 95% | Decision Chain 完整性审计 |
| `evidence_utilization_rate` | 实际引用的证据 / 可用证据总量 | ≥ 0.60 | Heat Map 中的 evidence_usage 指标 |
| `cognitive_efficiency_trend` | 同类型任务的 token 消耗是否随 OERCD 迭代下降 | 逐月下降 | 同类任务分组对比 |
| `hallucination_detection_rate` | 无证据支撑的事实性陈述被标注的比例 | ≥ 80% | 人工抽检 + 自动化检测 |
| `thinking_token_ratio` | 规划 token / 总输出 token | 0.10-0.30 | Heat Map 采集 |
| `tool_selection_hesitation` | 候选工具数 / 最终选择前的推理 token 数 | < 100 | Heat Map 采集 |

### 16.3 认知热力图与决策链（v3.0 新增）

> 使 Agent 推理过程对人类**可观测、可理解、可审计**。

**Cognitive Heat Map（认知热力图）**——记录每轮推理的"认知分配"：

| 维度 | 计算公式 | 价值 |
|------|---------|------|
| 规划 token 占比 | thinking_tokens / total_output_tokens | 识别推理深度 |
| 工具选择犹豫度 | 候选工具数 / 最终选择前的推理 token 数 | 识别工具集是否过载 |
| 信息依赖度 | 本轮引用了多少之前轮次的内容 | 识别上下文关键转折点 |
| 证据利用率 | 引用的证据 / 可用证据总数 | 识别证据质量 |

可视化：每轮 Turn 生成一行热力指标，管理控制台可渲染为热力图。

**Decision Chain Recorder（决策链记录器）**——记录关键决策完整推理链：

| 决策类型 | 记录字段 |
|---------|---------|
| `tool_selection` | 为什么选择这个工具而非其他？ |
| `plan_step` | 为什么这一步先执行而非另一步？ |
| `risk_assessment` | 为什么判定这个操作是安全/危险的？ |
| `error_recovery` | 遇到错误后为什么选择这个恢复策略？ |
| `delegation` | 为什么委派给子 Agent 而非自己执行？ |

每条记录包含：`input`（决策输入上下文摘要）+ `reasoning_summary`（脱敏后的推理摘要，禁止保存原始模型思维内容）+ `alternatives`（被放弃的替代方案）+ `confidence`（0-1 置信度）+ `evidence_basis`（依赖的证据 ID）+ `output`（最终决策）。

**Explainability API**：

```
GET /api/v1/agent-runs/{id}/decisions
  → 返回该 Run 的完整决策链

GET /api/v1/agent-runs/{id}/heatmap
  → 返回每轮的认知热力指标

GET /api/v1/agent-runs/{id}/explain/{turnIndex}
  → 返回指定轮次的详细解释（含脱敏 reasoning 摘要和证据引用）
```

### 16.4 成本模型公式

> **v3.1 单一真相源**：成本核心公式集中在 **§17.6 Prompt Cache 战略体系**，本节仅作衍生指标说明与示例。详见 §23 单一真相源对照表。

**派生公式（基于 §17.6 权威定义）**：

```
单次 AgentRun 成本：

  C_run = Σ C_turn(i)  for i in 1..N_turns
        + Σ C_shadow(j)  for j in shadow_invocations   // v3.1 新增：影子代理独立计量

  C_turn 详细分解 → 参见 §17.6 增强公式（T_stable / T_dynamic / α）

  C_tool_calls = Σ (tool_api_cost + tool_compute_cost + tool_sandbox_cpu_seconds × C_cpu)
  C_retrieval  = N_rag_queries × C_per_rag_query + N_embedding × C_per_embedding

汇率与计费货币：
  C_run_USD  = 内部基准（与 Provider invoice 单位一致）
  C_run_CNY  = C_run_USD × ExchangeRate(date)   // 财务对账走 CNY

日成本预算（v3.1 修订：含 Burst 缓冲）：
  DailyBudget(tenant) = ExpectedDailyCost + 2 × P95Deviation
                      // P95 偏差预留，应对突发 campaign

月度成本预测（v3.1 修订：含季节性与新 Agent 冷启动）：
  MonthlyCost ≈ Σ DailyCost(d) × (1 + SeasonalFactor(d)) × (1 + ColdStartFactor)
                for d in [1..N_working_days]
                ColdStartFactor = 0.15 if 当月有新 Agent 上线 else 0

每 1K Run 成本（v3.1 新增 SLO）：
  CostPer1KRuns(phase) = Σ C_run / N_runs × 1000
  
  Phase 1 SLO：≤ $40 / 1K runs
  Phase 2 SLO：≤ $2000 / 1K runs
  Phase 3 SLO：≤ $30 / 1K runs

财务对账（v3.1 新增）：
  Reconciliation = |Σ C_turn(internal) - Σ ProviderInvoice| / Σ ProviderInvoice
  目标：偏差 ≤ 2%（月度）；> 5% 触发审计
```

### 16.5 风险矩阵（v3.1 修订：量化打分 + 补全数据泄露/组织变革/可观测自身风险）

**评分标准**：影响 1-5（1=轻微/5=灾难）；概率 1-5（1=罕见/5=频繁）；**风险分 = 影响 × 概率**；分 ≥15 列入「关键风险」必须有 owner。

**基础风险（v1.0 基线）**：

| 风险 | 影响 | 概率 | 风险分 | 应对策略 | Owner |
|------|------|------|------|---------|-------|
| LLM 幻觉导致错误决策 | 5 | 4 | 20 | HITL 审批 + RAG 强制引用 + 低置信度标注 + Critic Agent | 安全负责人 |
| Agent 无限循环消耗资源 | 4 | 3 | 12 | 四维预算硬约束 + 成本熔断器 + 超时 HITL 升级 | 控制面负责人 |
| Phase 2 AI 代码质量不稳定 | 4 | 4 | 16 | 低风险任务起步 + 强制 HITL 审查 + 测试覆盖率门禁 | Phase 2 负责人 |
| Token 成本失控 | 3 | 3 | 9 | Cache + 模型路由降级 + 单任务预算上限 + 日预算告警 | 控制面负责人 |
| 自研编排引擎稳定性 | 4 | 3 | 12 | 充分测试 + 参考成熟架构 + 灰度发布 + Chaos 演练 | 内核负责人 |
| 企业数据安全合规 | 5 | 3 | 15 | 数据分级 + 机密走本地模型 + RBAC 全覆盖 | 合规负责人 |
| Prompt 注入攻击 | 5 | 4 | 20 | §17.7 Structural Isolation + 双层注入扫描 + Markdown/JSON/二进制污染防护 | 安全负责人 |
| 三阶段集成复杂度 | 3 | 4 | 12 | 事件总线解耦 + 独立可运行 + Schema Registry + 渐进集成测试 | 平台负责人 |
| 沙箱逃逸 | 5 | 2 | 10 | gVisor 默认 + falco 检测 + 网络白名单 + cap-drop + 资源限制 + 多租户反亲和 | 安全负责人 |
| 知识污染（错误技能扩散） | 3 | 3 | 9 | 审核门控 + 信任度机制 + Federation Guard A/B 对照 + 快速回滚 | 知识负责人 |

**v3.1 新增/强化风险（数据泄露 / 误操作 / 组织 / 可观测自身）**：

| 新增风险 | 影响 | 概率 | 风险分 | 应对策略 | Owner |
|---------|------|------|------|---------|-------|
| 数据泄露（DLP 误发） | 5 | 3 | 15 | 出站 DLP 引擎 + API Key 正则脱敏 + 决策链 PII 分级 + 日志 redact | 安全负责人 |
| 数据泄露（日志含 Prompt） | 4 | 4 | 16 | Pino redact 规则 + log sampling + 禁止打印完整 Prompt（§17 工程规范） | 安全负责人 |
| 误删生产数据（间接 RX） | 5 | 2 | 10 | §7.3 RX 侧面执行防护 + Shell 黑名单 + 沙箱只读 + Connector 凭据 readonly 角色 | 安全负责人 |
| 错误审批（盲批/幻觉自动放行） | 5 | 3 | 15 | §10.1 R3/R4 硬规则 override + 审批抽检 ≥5% + 审批人指纹/二要素 | 审批治理 |
| 组织变革阻力（用户拒用） | 4 | 4 | 16 | 渐进式上线 + 用户培训 + 灰度反馈渠道 + 影子流量先于正式流量 6 周 | 业务负责人 |
| Schema Registry 故障（事件不可达） | 4 | 2 | 8 | 多 region 热备 + 本地 schema cache + DLQ 兜底 | 平台负责人 |
| 可观测自身故障（Prometheus/ES 失联） | 3 | 2 | 6 | OTel Collector 本地 buffer + 降级到 logs only + 关键指标双写 | SRE |
| Provider 全部不可用（外部 LLM 大规模故障） | 5 | 1 | 5 | 本地模型（Ollama/vLLM）兜底 + 关键 Agent 必须支持降级运行 | 控制面负责人 |
| Compact-Cache 死结 | 3 | 3 | 9 | §9.3 决策树自动选择 + L3 失败降级 L4 + cache_invalidation 告警 | 内核负责人 |
| Trust 单点失败永久打入冷宫 | 3 | 2 | 6 | §10.1 冷启动赋值 + 单次失败惩罚封顶 0.2 + EWMA 衰减 | 内核负责人 |

**v3.0/v3.1 创新机制引入的特有风险**：

| 新增风险 | 影响 | 概率 | 风险分 | 应对策略 |
|---------|------|------|------|---------|
| SessionShadow 摘要质量退化 | 3 | 3 | 9 | 反膨胀机制自动修剪 + 定期人工抽检 + Token 上限 500 |
| SessionShadow Redis 单点 | 3 | 2 | 6 | §9.5 双写 PostgreSQL 兜底 + isAvailable() 端口降级 |
| Prompt Cache 冷启动延迟 | 2 | 4 | 8 | 预热机制 + 缓存未命中不影响功能正确性 |
| 证据注册表内存膨胀 | 3 | 3 | 9 | TTL 20 turns + accessCount=0 淘汰 + 单 Run ≤50 证据 |
| 环境回填不一致 | 3 | 2 | 6 | 最终一致性 + 关键工具同步回填 + 差异检测告警 |
| 决策链记录性能开销 | 2 | 3 | 6 | 异步 BullMQ + 仅 R1+ 决策 + 批量 flush |
| 优雅停机超时数据丢失 | 4 | 2 | 8 | 三阶段递进 + force kill 仍保留 Checkpoint + K8s preStop hook |
| 知识联邦负迁移 | 4 | 3 | 12 | A/B 对照 72h + 性能回退检测 + 自动回滚 + 信任度过滤 |
| Pack 钻石依赖冲突 | 3 | 2 | 6 | §11.3 SemVer Range + isolated 加载 + 钻石依赖指标 |
| Hard Sunset 后回退困难 | 3 | 2 | 6 | §11.4 rollback() 接口 + Soft Sunset 4 周观察期 |

**风险评审治理**：
- 每周 SRE/安全/合规联席会议复盘风险分 ≥12 的项；分 ≥15 的项进入月度董事会通报
- 应对策略落实后重新评估「残余风险」，记入 ADR
- 风险登记册存档：`docs/risk-register/`

---

## 十七、工程实现基线

### 17.1 技术栈

| 层级 | 技术 | 版本 | 选型理由 |
|------|------|------|---------|
| 语言 | TypeScript | 5.5+ | 严格类型 + AI SDK 生态 |
| 运行时 | Node.js | 22 LTS | 原生 fetch/WebSocket + 性能优化 |
| 包管理 | pnpm | 9+ | workspace 支持 + 磁盘效率 |
| 构建 | Turborepo | 2+ | 增量构建 + 远程缓存 |
| HTTP | Fastify | 5+ | 高性能 + Schema 校验 |
| 校验 | Zod | 3+ | TypeScript 类型推导 |
| ORM | Drizzle ORM | 0.36+ | 类型安全 + 轻量 |
| 队列 | BullMQ | 5+ | Redis 原生 + 重试策略 |
| LLM SDK | Vercel AI SDK | 4+ | 多 Provider + 流式 + tool calling |
| 测试 | Vitest | 2+ | 快速 + ESM 原生 |
| Lint | ESLint 9 + Prettier | latest | flat config |

### 17.2 推荐目录结构

```
nexus/
├── packages/
│   ├── kernel/                  # L1 薄内核
│   │   ├── src/
│   │   │   ├── query-engine/    # Harness L2：单 Run 推理环（§3.4.4）
│   │   │   │   ├── query-loop.ts
│   │   │   │   ├── resilient-loop.ts   # Phase A-D 韧性循环（v3.0）
│   │   │   │   └── stream-executor.ts
│   │   │   ├── state-graph/     # Harness：图节点执行（策略由 control-plane 注入）
│   │   │   │   ├── graph-engine.ts
│   │   │   │   └── node-executor.ts
│   │   │   ├── compact/         # Harness 防爆层（§9.3 四级命名）
│   │   │   │   ├── time-gap-micro.ts   # L1 Time-Gap Micro Compact
│   │   │   │   ├── evidence-aware.ts   # L2 Evidence-Aware Compact（独创）
│   │   │   │   ├── session-graft.ts    # L3 Session Memory Graft
│   │   │   │   ├── legacy-compact.ts   # L4 Legacy Full Compact
│   │   │   │   └── evidence-registry.ts
│   │   │   ├── context-manager/ # Context 组装端口（§9.2 管线实现）
│   │   │   ├── delegate/        # 子 Agent 委派
│   │   │   ├── checkpoint/      # 多卡点持久化（v3.0 增强）
│   │   │   │   ├── incremental.ts      # IIncrementalPersistence
│   │   │   │   └── snapshot.ts
│   │   │   ├── lifecycle/       # 生命周期 + 优雅停机（v3.0 增强）
│   │   │   │   ├── hooks.ts
│   │   │   │   └── graceful-shutdown.ts # IGracefulShutdownController
│   │   │   ├── environment/     # 环境感知与回填（v3.0 新增）
│   │   │   │   ├── injector.ts          # IEnvironmentInjector
│   │   │   │   └── backfiller.ts        # IContextBackfiller
│   │   │   └── oercd/           # 学习心跳
│   │   │       ├── observe.ts
│   │   │       ├── execute.ts
│   │   │       ├── reflect.ts
│   │   │       ├── crystallize.ts
│   │   │       ├── distribute.ts
│   │   │       └── curator.ts
│   │   └── package.json
│   │
│   ├── control-plane/           # L2 强控制面
│   │   ├── src/
│   │   │   ├── intent-router/
│   │   │   ├── agent-registry/
│   │   │   ├── run-manager/     # AgentRun 状态机/调度（非推理逻辑，§3.4.4）
│   │   │   ├── approval-engine/
│   │   │   ├── policy-engine/
│   │   │   ├── budget-manager/
│   │   │   ├── audit-engine/
│   │   │   ├── scheduler/
│   │   │   ├── orchestration/   # IOrchestrationSelector（v3.0）
│   │   │   ├── context-policy/  # IContextPolicy（v3.0）
│   │   │   ├── model-router/    # IModelRouter（v3.0）
│   │   │   ├── retry-policy/    # IRetryPolicy（v3.0）
│   │   │   └── sunset-engine/   # ISunsetEngine（v3.0）
│   │   └── package.json
│   │
│   ├── tool-gateway/            # 统一工具网关
│   │   ├── src/
│   │   │   ├── build-tool.ts            # buildTool 工厂（v3.0）
│   │   │   ├── result-budget.ts         # IToolResultBudget（v3.0）
│   │   │   └── protocol-adapters/       # MCP/REST/GraphQL/gRPC
│   │   └── package.json
│   ├── memory/                  # 记忆与知识
│   │   ├── src/
│   │   │   ├── working-memory.ts
│   │   │   ├── session-shadow.ts        # SessionShadow 影子代理（v3.0）
│   │   │   ├── session-shadow-pg.ts     # v3.1：PostgreSQL 兜底持久化
│   │   │   ├── memory-summary-provider.ts # v3.1：IMemorySummaryProvider 实现
│   │   │   ├── knowledge-crystallizer.ts # 知识结晶影子代理（v3.0）
│   │   │   ├── session-summary.ts       # 反膨胀机制（v3.0）
│   │   │   ├── episodic-memory.ts
│   │   │   ├── skill-store.ts
│   │   │   ├── org-knowledge.ts
│   │   │   ├── federation-guard.ts      # IKnowledgeFederationGuard（v3.0）
│   │   │   └── rag-pipeline.ts
│   │   └── package.json
│   ├── guardrails/              # 安全护栏
│   │   └── src/
│   │       ├── prompt-injection-scanner.ts
│   │       ├── multimodal-sanitizer.ts  # v3.1：多模态污染防护（§8.2）
│   │       └── output-dlp.ts
│   ├── providers/               # LLM Provider
│   │   ├── src/
│   │   │   ├── prompt-cache/            # Prompt Cache 战略（v3.0）
│   │   │   │   ├── stable-prefix.ts
│   │   │   │   ├── cache-aware-compact.ts
│   │   │   │   └── cross-run-pool.ts
│   │   │   ├── prompt-assembler.ts      # System Prompt 六层组装（v3.0）
│   │   │   ├── prompt-assembler-anthropic.ts  # v3.1：Provider-specific 适配
│   │   │   ├── prompt-assembler-openai.ts     # v3.1
│   │   │   └── prompt-assembler-gemini.ts     # v3.1
│   │   └── package.json
│   ├── observability/           # 可观测（v3.0 增强）
│   │   ├── src/
│   │   │   ├── traces/
│   │   │   ├── metrics/
│   │   │   │   ├── recording-rules.ts   # v3.1：Prometheus recording rules（cardinality 控制）
│   │   │   │   └── otel-genai-semconv.ts # v3.1：OTel GenAI semantic convention
│   │   │   ├── logs/
│   │   │   ├── cognitive-heatmap.ts     # 认知热力图（v3.0）
│   │   │   ├── decision-chain.ts        # 决策链记录器（v3.0）
│   │   │   ├── decision-chain-store.ts  # v3.1：决策链存储（PG + TSDB）
│   │   │   └── explainability-api.ts    # Explainability API（v3.0）
│   │   └── package.json
│   ├── shared/                  # 共享类型（S0 不可变契约）
│   │   ├── src/
│   │   │   ├── errors/                  # v3.1：NexusError 错误码注册表
│   │   │   │   ├── nexus-error.ts
│   │   │   │   ├── error-codes.ts       # S0 错误码 const enum
│   │   │   │   └── http-mapping.ts      # NexusError → HTTP/gRPC 状态码
│   │   │   ├── events/                  # v3.1：S0 事件信封
│   │   │   │   ├── envelope.ts          # NexusEventEnvelope（S0）
│   │   │   │   ├── phase-bridge.ts      # PhaseBridgeEvent（S2 载荷）
│   │   │   │   └── stream-events.ts     # AgentStreamEvent 联合类型
│   │   │   ├── domain/                  # v3.1：领域模型补齐（§20.14）
│   │   │   │   ├── agent-run.ts         # AgentRun aggregate root
│   │   │   │   ├── budget-snapshot.ts   # BudgetSnapshot 单一定义
│   │   │   │   ├── evidence.ts          # Evidence 统一类型
│   │   │   │   ├── skill-entry.ts
│   │   │   │   └── approval-request.ts
│   │   │   └── ports/                   # v3.1：跨包端口（IMemorySummaryProvider 等）
│   │   │       ├── memory-summary-provider.ts
│   │   │       ├── prompt-assembler.ts
│   │   │       └── tool-result-budget.ts
│   │   └── package.json
│   │
│   ├── phase-intent/            # L3 Phase 1 能力包
│   │   ├── src/
│   │   │   ├── manifest.ts              # CapabilityPackManifest（v3.1）
│   │   │   ├── bridge-subscriber.ts     # Phase Bridge 事件订阅
│   │   │   ├── agents/                  # 6 个 Agent（详见 §12.1）
│   │   │   └── tools/                   # PM Tools（在 mcp-servers 暴露）
│   │   └── package.json
│   ├── phase-execution/         # L3 Phase 2 能力包
│   │   ├── src/
│   │   │   ├── manifest.ts
│   │   │   ├── bridge-subscriber.ts     # 监听 task.assigned_to_ai
│   │   │   ├── agents/                  # 13 个 Agent（详见 §12.2）
│   │   │   └── workflows/               # 研发交付工作流
│   │   └── package.json
│   ├── phase-connection/        # L3 Phase 3 能力包
│   │   ├── src/
│   │   │   ├── manifest.ts
│   │   │   ├── bridge-subscriber.ts
│   │   │   ├── agents/                  # 8 个 Agent（详见 §12.3）
│   │   │   └── connectors/              # 飞书/钉钉/OA Connector 配置
│   │   └── package.json
│   │
│   └── infra/                   # 基础设施胶水
│
├── apps/
│   ├── api-gateway/             # HTTP/WS 网关
│   │   └── src/
│   │       ├── schema-registry/         # v3.1：Phase Bridge Schema Registry
│   │       └── bff/                     # v3.1：Console BFF（仅 OpenAPI 调用）
│   ├── console/                 # 管理控制台（纯前端，禁止 import control-plane）
│   └── cli/                     # CLI 客户端
│
├── compensation/                # L4 补偿层（v3.1 补齐：根目录与 §2.1 一致）
│   ├── manual-retry-middleware/         # 日落 v3.1
│   ├── legacy-prompt-injection/         # 日落 v3.2
│   ├── sync-tool-bridge/                # 日落 v3.1
│   ├── flat-context-window/             # 日落 v3.2
│   ├── static-model-mapping/            # 日落 v3.3
│   ├── single-tenant-guard/             # 日落 v4.0
│   └── README.md                        # 每个补偿模块必须含 sunsetDate
│
├── mcp-servers/                 # MCP Server 独立进程
│   ├── pm-tools/
│   ├── dev-tools/
│   ├── feishu/
│   ├── dingtalk/
│   └── oa/
│
├── evals/                       # 评估
├── docs/                        # 文档
├── config/                      # 配置
├── pnpm-workspace.yaml
├── tsconfig.base.json
└── turbo.json
```

### 17.3 NexusError 错误体系

```typescript
/**
 * Nexus 领域错误基类
 * 所有自定义错误继承此类，提供统一的错误处理契约
 * @property code - 机器可读错误码（格式：DOMAIN.SUB_CODE）
 * @property retryable - 是否可安全重试
 * @property context - 结构化上下文信息，用于审计和调试
 */
class NexusError extends Error {
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

/** 工具执行失败 */
class ToolExecutionError extends NexusError { }

/** LLM Provider 通信失败 */
class ProviderError extends NexusError { }

/** 安全护栏违规 */
class GuardrailViolation extends NexusError { }

/** 编排异常 */
class OrchestrationError extends NexusError { }

/** 预算耗尽 */
class BudgetExhaustedError extends NexusError { }

/** 审批超时 */
class ApprovalTimeoutError extends NexusError { }

/** Checkpoint 损坏 */
class CheckpointCorruptionError extends NexusError { }

/** 能力包加载失败 */
class PackLoadError extends NexusError { }

/** 知识检索失败 */
class RetrievalError extends NexusError { }
```

### 17.4 Prompt 管理策略

| 策略 | 说明 | 实现 |
|------|------|------|
| 模板与逻辑分离 | Prompt 在独立 `prompts.ts` 文件维护 | 每个 Agent 目录下的 prompts.ts |
| 类型安全模板函数 | 使用 TypeScript 函数生成 Prompt | 函数参数携带完整类型信息 |
| 版本化管理 | 每个 Prompt 版本可追溯、可回滚 | Agent Registry 存储版本历史 |
| A/B 测试支持 | 同一 Agent 可配置多个 Prompt 版本 | 按流量百分比分流 |
| 系统级统一维护 | 跨 Agent 共用的系统级指令集中管理 | shared/system-prompts.ts |
| 动态注入 | 运行时根据上下文注入变量 | 模板函数参数传递 |

### 17.5 System Prompt 六层组装架构（v3.0 新增）

> 来源 v2.0 深度创新——通过 stable_prefix / dynamic_suffix 二分确保 Prompt Cache 高命中率。

```
System Prompt 六层组装架构：

┌─────────────────────────────────────────────────────────────────────┐
│ Layer 1: Identity & Role（身份与角色）                    ← stable  │
│ "你是 Nexus 平台的 {agent_name}，负责 {responsibility}..."         │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 2: Safety & Constraints（安全约束）                 ← stable  │
│ "严禁执行以下操作... 输出格式必须符合..."                           │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 3: Stable Skill Index（冻结技能索引快照，L0 摘要） ← stable  │
│ "你具备以下技能：\n- skill_001: 需求拆解（WBS 方法论）\n- ..."     │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 4: Tool Signatures（经权限过滤的工具签名快照）      ← stable  │
│ [Run 启动时由 Tool Gateway 按字母序冻结，确保跨轮次稳定]            │
├─────────────────────────────────────────────────────────────────────┤
│ ══════════════════ stable_prefix 边界 ══════════════════════════════│
├─────────────────────────────────────────────────────────────────────┤
│ Layer 5: Environment Context（环境上下文）                ← dynamic │
│ "当前工作目录: /project\nGit 分支: feature/auth\n时间: ..."        │
├─────────────────────────────────────────────────────────────────────┤
│ Layer 6: Session Summary（会话摘要）                      ← dynamic │
│ <session_summary version="3">...</session_summary>                  │
└─────────────────────────────────────────────────────────────────────┘

stable_prefix（Layer 1-4）：
  • 在 AgentRun 启动时冻结，生命周期内不得被 Pack/权限/技能热更新改写
  • 提升 Prompt Cache 命中率，但命中率必须以 Provider usage 实测为准
  • 内容确定性排序（工具按名称排、技能按 ID 排）

dynamic_suffix（Layer 5-6）：
  • 每轮可更新
  • 由 EnvironmentInjector + SessionShadow 自动维护
  • Run 内新增技能、权限变化、外部环境变化以 delta 形式注入，不回写 stable_prefix
  • 更新时保持格式结构稳定（有利于部分缓存命中）
```

### 17.6 Prompt Cache 战略体系（B3 加固）

> v3.0 新增：通过四大缓存策略提升稳定前缀命中率。α≈0.90 是设计目标，不是架构保证；不同 Provider、模型和上下文策略必须分别实测校准。

**四大策略协同**：

```
策略 1: Stable Prefix 冻结
  ┌─────────────────────────────────────────────────────────────────┐
  │ System Prompt 分为 stable_prefix + dynamic_suffix（见 §17.5）    │
  │ 关键约束：stable_prefix 在整个 AgentRun 生命周期内不可变          │
  │ 缓存命中条件：prefix 完全匹配 → 缓存命中 → 10x 成本折扣         │
  └─────────────────────────────────────────────────────────────────┘

策略 2: Shadow Agent 寄生缓存
  ┌─────────────────────────────────────────────────────────────────┐
  │ SessionShadow 的输出被设计为"缓存友好"格式：                      │
  │ • 摘要内容追加式更新（新内容添加到尾部，不修改已缓存的前缀）     │
  │ • 使用固定的 XML 结构标签（<session_summary>...</session_summary>）│
  │ • 版本号在标签属性中而非内容中（不影响内容前缀匹配）             │
  │ 效果：即使 Session Summary 更新，前缀部分仍可命中缓存            │
  └─────────────────────────────────────────────────────────────────┘

策略 3: Cache-Aware Compact（v3.1 补全：命中点检测算法）
  ┌─────────────────────────────────────────────────────────────────┐
  │ Compact Engine 执行压缩时感知缓存边界：                           │
  │                                                                   │
  │ 命中点检测算法：                                                   │
  │   1. Provider 返回 usage 时含 `cached_input_tokens` 字段          │
  │   2. cache_boundary_index = max(i) s.t. Σ msg[0..i].tokens       │
  │                                          ≤ cached_input_tokens   │
  │   3. 标记 messages[0..cache_boundary_index] 为"已缓存前缀"        │
  │                                                                   │
  │ Compact 决策矩阵：                                                 │
  │   • L1/L2/L3 → 仅压缩 cache_boundary_index 之后的消息            │
  │   • L4 必须压缩前缀 → 计算成本权衡：                              │
  │     cache_lost = T_stable × α × (R_input - R_cached)             │
  │     compact_save = (T_full - T_compact) × R_input                │
  │     执行 L4 当且仅当 compact_save > cache_lost × 2               │
  │     否则降级为 L3 + 容忍部分上下文丢失                            │
  │                                                                   │
  │ Provider 不返回 cached_input_tokens 时（如本地模型）：              │
  │   • 退化为「消息时序」估算：仅压缩最近 30% 的消息                  │
  │   • 发射 cache_unobservable 指标，提示运维 Provider 升级           │
  └─────────────────────────────────────────────────────────────────┘

策略 4: 跨 AgentRun 缓存池
  ┌─────────────────────────────────────────────────────────────────┐
  │ 同一 Agent Definition 的多个 AgentRun 共享缓存：                  │
  │ • Agent 的 stable_prefix 相同 → 自然共享 Provider 级缓存         │
  │ • 冻结技能索引按确定性排序 → 同版本 Agent 的技能前缀一致         │
  │ • 组织知识摘要按确定性快照 → 同日 Run 共享知识缓存               │
  │ • 限制：同 region + 同 tenant 共享池；跨 region 无法共享          │
  └─────────────────────────────────────────────────────────────────┘
```

**跨 Provider 适配（v3.1 新增）**：

| Provider | Cache 机制 | 配置点 | 倍率（R_cached / R_input） | 最小缓存块 |
|----------|-----------|--------|---------------------------|-----------|
| Anthropic Claude | 显式 `cache_control` breakpoint | `prompt-assembler-anthropic.ts` 在 Layer 4 末尾插入 | 0.10 | 1024 tokens |
| OpenAI GPT-4/4o | 自动前缀缓存（块级） | `prompt-assembler-openai.ts` 保证 stable_prefix 顺序 | 0.50 | 1024 tokens |
| Google Gemini | Context Caching API | `prompt-assembler-gemini.ts` 显式 cachedContent 引用 | 0.25 | 32768 tokens |
| 本地（Ollama/vLLM） | KV-cache 进程内 | 无显式 API | N/A（无外部计费） | 由 vLLM `--enable-prefix-caching` 控制 |

> Provider 切换会**完全失效** stable_prefix Cache。`IModelRouter` 必须遵守 §10.3 Run 内 stable_prefix 约束。

**缓存友好的工具签名排序规则**：

```
1. 按工具名称字母序排列（ASCII 排序）
2. 每个工具的参数按 JSON Schema 属性名字母序排列
3. 可选参数标记为 [optional] 但不影响排序
4. 工具列表变更（增删工具）时：
   - 如果在 AgentRun 中途变更 → 标记 cache_invalidation 事件
   - 如果在 Run 之间变更 → 自然适应（跨 Run 缓存部分失效可接受）

示例（stable 输出）：
  tools:
    - code.read(path: string, startLine?: number, endLine?: number)
    - code.write(path: string, content: string, createIfMissing?: boolean)
    - git.commit(message: string, files?: string[])
    - git.push(remote?: string, branch?: string)
    - shell.execute(command: string, cwd?: string, timeout?: number)
```

**缓存失效场景及应对**：

| 失效场景 | 触发原因 | 应对策略 |
|---------|---------|---------|
| Agent 定义变更 | Prompt 模板或工具集更新 | 标记为预期失效，下次 Run 自然重建缓存 |
| L4 Compact 执行 | 极端场景触发全文压缩 | L4 Compact 后主动标记 cache_invalidated |
| 技能库更新 | 新技能加入候选列表 | 当前 Run 以 `skill_delta` 注入 dynamic_suffix；下个 Run 才可进入冻结技能索引 |
| Provider 缓存过期 | Provider 侧缓存 TTL 到期 | 无法控制，通过监控指标感知并统计 |

**增强成本公式**（Cache-Aware）：

```
增强成本模型：

C_turn = T_dynamic × R_input                    ← 动态内容全价
       + T_stable × α × R_cached                ← 稳定前缀缓存命中（大折扣）
       + T_stable × (1-α) × R_input             ← 稳定前缀缓存未命中（全价）
       + T_output × R_output                    ← 输出 token

参数估算：
  T_stable  ≈ 3,000-5,000 tokens（身份 + 技能索引 + 安全规则 + 工具签名）
  T_dynamic ≈ 500-2,000 tokens（环境状态 + Session Summary + 任务 context）
  α         ≈ 0.85-0.95（目标区间，由冻结策略约束并通过实测校准）
  R_cached  ≈ R_input × 0.1（Anthropic）或 R_input × 0.5（OpenAI）

目标：相比无缓存方案，输入成本降低 60-80%
```

### 17.7 外部内容隔离注入协议（v3.1 升级：Structural Isolation）

> **v3.1 修订**：v3.0 单纯靠 XML 标签无法抵御 prompt injection（攻击者注入 `</external_data><system>` 等）。v3.1 改为**结构性隔离 + 标签辅助 + 内容净化**三层防御。

**第一层：结构性隔离（Structural Isolation）**

```
不可信内容（trust_level=low / medium）的处理：

1. 永远不拼接到 system message：
   ✗ messages = [{role: 'system', content: prompt + user_input + tool_result}]
   ✓ messages = [
       {role: 'system', content: prompt},        // 纯净系统指令
       {role: 'user', content: rendered_user},   // 用户内容（trust=low）
       {role: 'tool', content: tool_result},     // 工具结果（trust=high）
     ]

2. RAG / 长文档：
   ✓ 走 Provider 的 「文档块」或「附件」原语（如 Anthropic Documents API）
   ✗ 不直接 string concat 到 user message

3. 多模态：图像 OCR、音频转录、视频字幕产生的文本：
   ✓ 独立 user/tool message，trust_level 强制 low
   ✗ 不与原始 prompt 合并
```

**第二层：标签辅助（v3.0 保留）**

所有外部内容仍需使用隔离标签包裹，提供来源审计：

```
<external_data source="rag_retrieval" trust_level="medium" id="evidence_42">
  [RAG 检索到的文档内容]
</external_data>

<external_data source="tool_result" trust_level="high" tool="git.diff" id="tool_call_88">
  [工具执行结果]
</external_data>

<external_data source="user_input" trust_level="low" id="msg_17">
  [用户原始输入]
</external_data>
```

> 标签作用：审计追溯 + 模型软引导，**不**作为唯一防护。

**第三层：内容净化管线（v3.1 新增）**

每类内容在注入前必须经过对应净化器（在 `packages/guardrails/multimodal-sanitizer.ts`）：

| 内容类型 | 净化规则 |
|---------|---------|
| **Markdown 文本** | AST 解析 → 白名单标签（p/strong/em/ul/ol/li/code/pre）；剥离 `<script>`/`<iframe>`；拒绝 `javascript:` URL；拒绝嵌套 `<external_data>` 字符串 |
| **JSON** | 严格 schema 校验 → 深度 ≤32、键数 ≤1024 → 剥离 `__proto__`/`constructor` 关键字 |
| **HTML** | 基于 DOMPurify 白名单清洗 |
| **代码块 (`code` ContentPart)** | trust_level=low；执行决策必须经 §7.3 RX 防护 |
| **OCR/ASR 转录文本** | 走 prompt 注入双层扫描；trust=low；独立 message |
| **二进制文件元数据** | 仅保留 mimeType、size、sha256；剥离 EXIF/扩展属性 |
| **表格** | 行 ≤10000、列 ≤256；超限分页 |

**安全规则（v3.1 强化）**：

- trust_level="low" 的内容**永远以独立 user message 形式出现**，不进 system
- trust_level="medium" 的 RAG 结果走 Provider 文档原语（如可用）
- trust_level="high" 的工具结果**仍需净化**（工具可能被 prompt 注入操控返回恶意 payload）
- 净化失败 → 拒绝注入 + 发射 `nexus.guardrail.sanitization_failed` 指标 + 写审计
- §8.2 双层扫描在净化**之前**与**之后**各执行一次，确保编码绕过也被抓住

**trust_level 与 message role 映射表（v3.1 权威）**：

| trust_level | 来源 | 注入位置 | 净化要求 |
|------------|------|---------|---------|
| `high` | 工具结果、系统时间戳 | `role: tool`（独立 message） | JSON schema 校验 |
| `medium` | RAG 检索、外部 API 验证后 | `role: user`（独立 message）或 Provider 文档原语 | Markdown AST 清洗 |
| `low` | 用户消息、OCR/ASR、第三方文档 | `role: user`（独立 message） | 全套净化 + 双层扫描 |

### 17.8 配置与 Secret 策略

| 类型 | 加载方式 | 存储位置 | 热更新 |
|------|---------|---------|--------|
| 应用配置 | 环境变量 → config 对象（启动时校验） | .env / 配置中心 | 需重启 |
| Agent 策略配置 | 数据库 + 缓存 | PostgreSQL + Redis | 支持热更新 |
| LLM API Key | Secret Manager → 短期缓存 | Vault / K8s Secret | 自动轮转 |
| MCP Server 凭据 | Secret Manager → 启动时注入 | Vault | 需重启 MCP 进程 |
| 沙箱临时 Token | 动态生成（TTL ≤ 任务×2） | 内存（不持久化） | 自动过期 |

---

## 十八、落地路线图（v3.1 修订：增加 Phase 0a 契约冻结期 + 明确团队规模 + B1-B7 加固对齐）

**落地原则**：
1. 先交付可审计、可恢复、可审批的最小闭环，再逐步引入 OERCD、联邦守卫、认知热力图等增强能力
2. 所有指标按 MVP / Beta / GA 三档验收，禁止在 MVP 阶段承诺完整 v3.0 能力
3. **Phase 0a 契约冻结期产物未通过评审，不进入 Phase 0b 编码**（v3.1 硬约束）
4. 每个 Phase 末尾预留 1 周技术债清偿 + 生产事故缓冲

**团队规模假设（v3.1 明确）**：

| 角色 | 人数 | 主责 |
|------|------|------|
| 内核工程师 | 3 | Kernel/Harness/Compact/Checkpoint/Runtime |
| 控制面工程师 | 2 | RunManager/Approval/Budget/Policy/Sunset |
| Phase 业务工程师 | 3 | Phase 1/2/3 Agent + 工具 + Connector |
| 平台/基建工程师 | 1 | PG/Redis/BullMQ/Schema Registry/CI/CD |
| 安全工程师 | 1 | 沙箱/Guardrails/红队/合规 |
| SRE | 1 | 可观测/告警/Chaos/MTTR |
| QA + 评测工程师 | 1 | Evals/红队/A-B 测试 |
| 产品/PMO | 1 | 跨阶段协调 + 客户对接 |
| **合计** | **12** | 全 GA 路径推荐配置；MVP 阶段可缩减至 8 人 |

**总周期**：48 周（v3.1 从 40 周调整为 48 周，原因：增加 Phase 0a 4 周契约冻结期 + Phase 2/3 各增加 2 周技术债清偿缓冲）

### Phase 0a — 契约冻结期（Week 1-4，v3.1 新增）

> **目标**：消除 v3.0 文档内部矛盾，固化单一真相源，**不写业务代码**，仅产出 ADR 与冻结契约。

| 周 | 目标 | 交付物 | 验收 |
|----|------|--------|------|
| W1 | 矛盾澄清 | §22 ADR-001 ~ ADR-009：成本公式 / IAgentRuntime 端口 / AutonomyScore 裁决 / 预算阈值 / Compensation 分级 / Cache 承诺等 9 项 | 评审会议通过 |
| W2 | 类型定义冻结 | §20.14 14 个领域模型完整 TypeScript 定义；S0 事件信封；NexusError 错误码注册表 | TS 编译通过 + Lint clean |
| W3 | 端口契约冻结 | §20.1–§20.13 所有 14 个端口接口；跨包依赖图与 ESLint dependency-cruiser 规则 | CI 自动检测向上 import = 0 |
| W4 | 路线图对齐 | B1-B7 加固周次表（§2.4）；§19 验收指标拆解到周；Phase 0b 启动条件 checklist | PMO 评审通过 |

### Phase 0b — Kernel 与控制面 MVP（Week 5-12）

| 周 | 目标 | 交付物 |
|----|------|--------|
| W5-6 | Kernel MVP | Query Loop + Resilient Loop Phase A-D + IAgentRuntime（start/resume/cancel + invoke/stream）+ 单 Provider 适配 + Tool Gateway buildTool + Compact L1 + L4 |
| W7-8 | 韧性与停机 | Checkpoint 多卡点 + 写放大控制 + GracefulShutdown 三阶段（**B1/B6 加固**） |
| W9-10 | 控制面 MVP | Agent Registry + Run Manager 状态机（含 admin.resume 路径）+ Approval Engine（R2+）+ Budget Reservation Tree + Audit Engine |
| W11-12 | 基础设施 + 安全底座 | PostgreSQL + Redis Sentinel + BullMQ + Phase Bridge + Schema Registry + API Gateway + OTel GenAI semconv + 沙箱 gVisor 默认 + 红队 100 条基线 |

### Phase 0c — 可观测与 Cache 底座（Week 13-14）

| 周 | 目标 | 交付物 |
|----|------|--------|
| W13 | 可观测 | Cognitive Heatmap 采集端口 + Decision Chain 存储 + Explainability Lite API（**部分 B6 完成**） |
| W14 | Cache 底座 | Stable Prefix 冻结 + Cache-Aware Compact 算法 + 跨 Provider Adapter（Anthropic/OpenAI）+ §17.6 Cache 失效告警（**B3 加固**） |

### Phase 1 — 意图层（Week 15-22，含 1 周缓冲）

| 周 | 目标 | 交付物 |
|----|------|--------|
| W15-16 | 核心 Agent（裁剪到 3 个） | RequirementAnalystAgent + TaskPlannerAgent + ReminderAgent |
| W17-18 | 记忆与 Shadow | MEM-0/MEM-1 + SessionShadow（Redis + PG 双写）+ KnowledgeCrystallizer Lite（**B4 加固**）+ 环境回填（**B7 加固**） |
| W19-20 | Compact 进阶 | Evidence-Aware Compact L2 + Session Memory Graft L3 + IMemorySummaryProvider 接线（**B2 加固**） |
| W21 | 平台接入 | 飞书 Bot + PM MCP Server + 通知工具集 |
| W22 | 验证 + 缓冲 | OERCD Observe/Execute MVP + 集成测试 + 灰度内测 + 技术债清偿 |

### Phase 2 — 执行层（Week 23-36，含 2 周缓冲）

> **范围调整**：将 13 个 Agent 拆为 Beta（8 个）+ GA（5 个）两批；W23-W34 完成 Beta，W35-W36 含真实任务验证 + 缓冲。

| 周 | 目标 | 交付物 |
|----|------|--------|
| W23-25 | 沙箱与编码 | Docker + gVisor 沙箱（资源配额 4核/8GB/1024 PID）+ CodeGeneratorAgent + RequirementParserAgent + 代码工具集 |
| W26-28 | 规划链 | ArchitecturePlannerAgent + ExecutionPlannerAgent + 规划阶段 HITL |
| W29-31 | 验证链 | TestGeneratorAgent + TestRunnerAgent + BugFixerAgent + CodeReviewerAgent（Beta 5 个 Agent） |
| W32-34 | 交付链 | DeploymentAgent + PRCreatorAgent + AcceptanceAgent + CI/CD 集成 |
| W35-36 | 稳定 + 缓冲 | Checkpoint 恢复 + 5 个低风险真实任务验证（不含生产部署）+ 技术债清偿 |

> SecurityScannerAgent / RefactorAgent / 等 GA 增量功能延后至 v3.2 单独迭代。

### Phase 3 — 连接层（Week 37-48，含 2 周缓冲）

| 周 | 目标 | 交付物 |
|----|------|--------|
| W37-39 | 知识与问答 | RAG 系统 + RAGAgent + IssueTriageAgent + DocumentAgent |
| W40-42 | 办公自动化 | OAAgent + MeetingAgent + CalendarAgent |
| W43-44 | 高级功能 | PPTGenerator + 飞书深度集成 |
| W45 | 联邦守卫 | KnowledgeFederationGuard A/B 对照 + 自动回滚 |
| W46-47 | GA 候选 | 三阶段联调 + 安全审计 + 红队评估 + Chaos 演练 + 性能优化 + Curator Beta |
| W48 | GA 验收 + 缓冲 | GA 候选验收 + 文档完善 + 技术债清偿 |

**Phase 间硬约束**：
- 每个 Phase 末必须通过 §19 对应阶段验收指标，否则不允许进入下一 Phase
- 任何 Phase 失败 → 触发 PMO 评审 → 决定降级范围 / 延期 / 团队扩容
- B1-B7 加固未交付 → 不能进入 GA 候选评审

---

## 十九、验收与评估体系

### 19.1 Phase 1 指标

| 指标 | MVP 目标 | GA 目标 | 衡量方式 |
|------|---------|--------|---------|
| 需求拆解准确率 | ≥ 70% | ≥ 80% | 人工评审 100 条拆解结果 |
| 任务 WBS 完整度 | ≥ 75% | ≥ 85% | 评估验收标准覆盖率 |
| 风险识别召回率 | ≥ 60% | ≥ 70% | 与人工识别结果对比 |
| 催办触达率 | ≥ 90% | ≥ 95% | 通知消息送达确认 |
| 工时估算偏差 | ≤ 40% | ≤ 30% | 估算值 vs 实际值回归分析 |
| 端到端响应时间 | P95 < 90s | P95 < 60s | APM 监控 |

### 19.2 Phase 2 指标

| 指标 | Beta 目标 | GA 目标 | 衡量方式 |
|------|---------|--------|---------|
| 代码编译通过率 | ≥ 75% | ≥ 90% | CI 构建结果统计 |
| 测试通过率（首次） | ≥ 50% | ≥ 70% | 首次测试运行结果 |
| 测试通过率（含自修复） | ≥ 75% | ≥ 90% | 3 次自修复后测试结果 |
| 代码审查通过率 | ≥ 60% | ≥ 75% | 人工 Review 通过率 |
| 安全扫描零高危 | 100% | 100% | SAST 扫描无 Critical/High |
| 单任务平均耗时 | < 60min | < 30min | 从接收到 PR 创建 |
| 单任务平均成本 | < $4 | < $2 | 含所有 LLM 调用成本 |

### 19.3 平台治理指标

| 指标 | MVP/Beta 目标 | GA 目标 | 衡量方式 |
|------|-------------|--------|---------|
| Checkpoint 恢复成功率 | ≥ 95% | ≥ 99% | 模拟中断恢复测试 |
| 审计链路完整率 | 100% | 100% | 抽检 AgentRun 审计记录 |
| 审批响应时间 | P50 < 10min | P50 < 5min | 审批请求到决定的时间 |
| 前缀缓存命中率 | ≥ 70% | ≥ 85% | Provider 层统计，仅统计 stable-prefix eligible turns |
| 系统可用性 | ≥ 99.0% | ≥ 99.5% | 月度 SLA 计算 |
| 高危安全事件 | 0 | 0 | 安全监控告警 |

### 19.4 学习效果指标

| 指标 | 目标值 | 衡量方式 |
|------|--------|---------|
| 技能库命中率 | ≥ 40%（半年后） | OERCD Observe 阶段匹配率 |
| 重复任务效率提升 | ≥ 30% | 同类任务首次 vs 复现的 Token/时间对比 |
| 技能审核通过率 | ≥ 70% | 自动结晶 → 审核通过比例 |
| 知识分发采纳率 | ≥ 50% | 分发技能被目标 Agent 实际使用的比例 |
| Curator 剪枝准确率 | ≥ 90% | 人工抽检被废弃技能的合理性 |
| 知识联邦负迁移回滚率 | ≤ 5% | Federation Guard 自动回滚统计 |
| AutonomyScore 月增长 | ≥ +0.05 | Trust Engine 全局平均 |
| 审批摩擦下降率 | ≥ 10%/月 | 审批引擎统计 |

### 19.5 韧性与性能验收（v3.0 新增）

| 指标 | Beta 目标 | GA 目标 | 衡量方式 |
|------|---------|--------|---------|
| 工具异常自愈率 | ≥ 50% | ≥ 70% | 注入模拟错误的集成测试 |
| 模型降级透明度 | ≥ 70% | ≥ 85% | fallback 触发场景下的任务完成率 |
| Checkpoint 恢复成功率 | ≥ 95% | ≥ 99% | 随机中断 + 恢复测试 |
| 优雅停机已确认状态零丢失率 | = 100% | = 100% | 压力测试中发送 SIGTERM，仅统计已 `enqueue` 或 `forceFlush` 的 Checkpoint |
| 流式中断恢复率 | ≥ 75% | ≥ 90% | 网络抖动模拟测试 |

### 19.6 成本控制验收（v3.0 新增）

| 指标 | Beta 目标 | GA 目标 | 衡量方式 |
|------|---------|--------|---------|
| Prompt Cache 命中率 | ≥ 0.70 | ≥ 0.85 | Provider 返回的 usage 统计，按 Provider/Phase 分桶 |
| 单任务平均成本降幅 | ≥ 30% | ≥ 60% | A/B 对比（开启/关闭缓存策略） |
| Compact 缓存失效率 | ≤ 0.20 | ≤ 0.10 | Compact 事件中的 cache_invalidated 标记 |
| SessionShadow 额外成本 | ≤ $0.08 | ≤ $0.05 | 影子代理独立计量 |
| Phase 1/3 简单任务平均成本 | ≤ $0.08 | ≤ $0.04 | 含所有 LLM 调用成本 |
| Phase 2 代码任务平均成本 | ≤ $4.00 | ≤ $2.00 | 含规划、实现、测试、自修复成本 |

### 19.7 认知质量验收（v3.0 新增）

| 指标 | 目标值 | 衡量方式 |
|------|--------|---------|
| 决策可追溯率 | ≥ 95% | Decision Chain 完整性审计 |
| 证据利用率 | ≥ 0.60 | Heat Map 中的 evidence_usage 指标 |
| 认知效率趋势 | 逐月下降 | 同类任务分组对比 |
| 幻觉检出率 | ≥ 80% | 人工抽检 + 自动化检测（LLM-as-judge + Kappa 校准） |

### 19.8 安全与合规验收（v3.1 新增）

> **GA 阻断项**：本节任一指标未达 GA 标准，不允许进入正式生产。

| 指标 | Beta 目标 | GA 目标 | 衡量方式 |
|------|---------|---------|---------|
| Prompt 注入红队通过率 | ≥ 90%（拦截率） | ≥ 98% | 红队 100 条基线 + 季度扩展 200 条 |
| 越权工具调用阻断率 | 100% | 100% | 20 条越权用例（RX 间接执行 / 跨租户访问） |
| 出站 DLP 命中精度 | ≥ 80% | ≥ 95% | 注入 50 条含 PII/Secret 的测试输出 |
| 多模态污染防护通过率 | ≥ 85% | ≥ 95% | 注入图像 OCR / Markdown / JSON 污染各 30 条 |
| 合规：数据主权 | 100% | 100% | 标记机密数据走本地模型的执行追溯 |
| 合规：GDPR/PII 脱敏 | ≥ 99% | 100% | 含 PII 输出抽检 |
| 合规：审计完整性 | ≥ 99% | 100% | AgentRun 审计链完整率 |
| 沙箱逃逸检测 | 100% | 100% | falco 规则 + 月度演练 |

### 19.9 SLO 分级与告警治理（v3.1 新增）

> 区分「SLO（必须达成）」与「Best Effort（最佳努力）」，避免每月扯皮。

| 指标类别 | SLO 性质 | 阻断 GA | 月度告警 SLA |
|---------|---------|---------|------------|
| 系统可用性、安全/合规指标、Checkpoint 零丢失 | **SLO** | 是 | 错误预算 0.5% |
| Cache 命中率、Compact 触发频率、Shadow 成功率 | Best Effort | 否 | 趋势观察，未达不阻断 |
| AutonomyScore 月增长、技能命中率、审批摩擦下降 | Trend | 否 | 与安全验收联动评估 |

### 19.10 韧性与 Chaos 验收（v3.1 新增，扩展 §19.5）

| 指标 | Beta 目标 | GA 目标 | 衡量方式 |
|------|---------|---------|---------|
| MTTR（平均恢复时间） | ≤ 30min | ≤ 10min | 月度故障演练统计 |
| Chaos 测试通过率 | ≥ 80% | ≥ 95% | Pod kill / Redis 分区 / Provider 全拒 / 网络抖动 月度演练 |
| 月度故障演练频率 | 1 次/月 | 2 次/月 | SRE 演练日志 |
| 备灾切换时间 | ≤ 60min | ≤ 30min | 跨 AZ 故障切换 |

### 19.11 成本对账验收（v3.1 新增，扩展 §19.6）

| 指标 | Beta 目标 | GA 目标 | 衡量方式 |
|------|---------|---------|---------|
| 每 1K Run 成本（Phase 1） | ≤ $80 | ≤ $40 | 月度 1K Run 负载压测 |
| 每 1K Run 成本（Phase 2） | ≤ $4000 | ≤ $2000 | 月度 1K Run 负载压测 |
| 每 1K Run 成本（Phase 3） | ≤ $60 | ≤ $30 | 月度 1K Run 负载压测 |
| Provider 对账偏差 | ≤ 5% | ≤ 2% | 月度内部 C_run vs 外部 invoice |
| 日预算告警准确率 | ≥ 85% | ≥ 95% | 注入超支场景测试 |
| CNY 双币种核算 | 支持 | 支持 | 财务系统对接 |

---

## 二十、核心接口契约

### 20.1 IAgentRuntime

```typescript
/**
 * Agent 运行时核心接口（v3.1 修订：合并生命周期 + 会话调用 + 自省三组方法）
 * 定义 Agent 的基本执行能力契约
 * @template TInput - 输入类型
 * @template TOutput - 输出类型
 * @stability S1
 */
interface IAgentRuntime<TInput = unknown, TOutput = unknown> {
  /** Agent 唯一标识（v3.1 注：phase 字段从此接口移除，phase 是 L3 业务域标识，应放在 AgentSpec） */
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly version: string;

  // ===== 生命周期方法（v3.1 新增）=====

  /**
   * 启动一个新的 AgentRun
   * @description 由 Run Manager 调用；返回的 AgentRun 进入 'running' 状态
   * @param spec - Run 启动规约（含 input、tenant、budget 预留等）
   * @returns 新创建的 AgentRun（含 runId）
   */
  start(spec: AgentRunSpec<TInput>): Promise<AgentRun>;

  /**
   * 从 Checkpoint 恢复 AgentRun
   * @param runId - 要恢复的 AgentRun ID
   * @param fromCheckpoint - 指定 Checkpoint ID；缺省时使用最新
   * @returns 恢复后的 AgentRun
   */
  resume(runId: string, fromCheckpoint?: string): Promise<AgentRun>;

  /**
   * 取消运行中的 AgentRun
   * @param runId - 目标 Run ID
   * @param reason - 取消原因（user_cancel / timeout / system_shutdown / budget_exhausted）
   */
  cancel(runId: string, reason: CancelReason): Promise<void>;

  // ===== 会话调用方法 =====

  /**
   * 同步调用 — 等待完整结果返回
   * @param runId - 关联的 AgentRun（必须已 start）
   * @param input - 输入参数
   * @returns 完整输出结果
   */
  invoke(runId: string, input: TInput): Promise<TOutput>;

  /**
   * 流式调用 — 逐步产出中间事件
   * @param runId - 关联的 AgentRun（必须已 start）
   * @param input - 输入参数
   * @yields Agent 执行过程中的流式事件
   */
  stream(runId: string, input: TInput): AsyncGenerator<AgentStreamEvent>;

  // ===== 自省方法 =====

  /**
   * 获取 Agent 可用工具列表（经权限过滤）
   * @param permissions - 当前权限上下文
   * @returns 可用工具定义列表
   */
  getAvailableTools(permissions: PermissionContext): readonly ToolDefinition[];

  /**
   * 获取 Agent 健康状态
   * @returns 健康检查结果
   */
  healthCheck(): Promise<HealthStatus>;
}

/** 取消原因（v3.1 新增） */
type CancelReason =
  | 'user_cancel'
  | 'timeout'
  | 'system_shutdown'
  | 'budget_exhausted'
  | 'policy_denied'
  | 'admin_override';

/** Run 启动规约（v3.1 新增；完整字段见 §20.14） */
interface AgentRunSpec<TInput = unknown> {
  readonly agentId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly input: TInput;
  readonly budgetReservation: BudgetReservation;
  readonly traceContext: TraceContext;          // OTel 传播
  readonly priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  readonly deadlineAt?: Date;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/** HealthStatus（v3.1 新增完整定义） */
interface HealthStatus {
  readonly status: 'healthy' | 'degraded' | 'unhealthy';
  readonly checkedAt: Date;
  readonly checks: ReadonlyArray<{
    readonly name: string;
    readonly status: 'pass' | 'warn' | 'fail';
    readonly message?: string;
    readonly latencyMs?: number;
  }>;
}
```

### 20.2 PhaseBridgeEvent（增强版）

```typescript
/**
 * 阶段桥接事件 — 增强版
 * 三个阶段通过此协议实现完全解耦、可追溯、幂等的通信
 * @template T - 事件载荷类型
 * @property schemaVersion - 事件 Schema 版本，支持向前兼容
 * @property causationId - 因果链 ID，追踪事件因果关系
 * @property idempotencyKey - 幂等键，防止重复消费
 * @property tenantId - 租户 ID，多租户隔离
 * @property actor - 触发者信息（用户/Agent/系统）
 * @property dataClassification - 数据密级，决定传输和存储策略
 * @property target - 点对点事件目标；广播/多订阅事件不填
 * @property targets - 多目标事件目标；与 target 二选一
 */
interface PhaseBridgeEvent<T = unknown> {
  readonly id: string;
  readonly schemaVersion: string;
  readonly source: PhaseId;
  readonly target?: PhaseId;
  readonly targets?: readonly PhaseId[];
  readonly type: PhaseBridgeEventType;
  readonly payload: T;
  readonly correlationId: string;
  readonly causationId: string;
  readonly idempotencyKey: string;
  readonly tenantId: string;
  readonly actor: EventActor;
  readonly dataClassification: DataClassification;
  readonly timestamp: Date;
  readonly ttl?: number;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

type PhaseId = 'intent' | 'execution' | 'connection';

type PhaseBridgeEventType =
  | 'task.created'
  | 'task.updated'
  | 'task.assigned_to_ai'
  | 'task.completed'
  | 'task.failed'
  | 'task.acceptance_requested'
  | 'task.acceptance_result'
  | 'knowledge.synced'
  | 'knowledge.deprecated'
  | 'notification.requested'
  | 'approval.requested'
  | 'approval.decided'
  | 'risk.identified'
  | 'reminder.triggered';

interface EventActor {
  readonly type: 'user' | 'agent' | 'system' | 'scheduler';
  readonly id: string;
  readonly name: string;
}

type DataClassification = 'public' | 'internal' | 'confidential' | 'top_secret';
```

事件路由约束：
- 点对点命令型事件使用 `target`，例如审批回调定向恢复某个 Phase。
- 领域事实型事件默认按 topic 广播订阅，不强制填写 `target`，避免 Phase Bridge 退化为跨 Phase RPC。
- `target` 与 `targets` 不得同时出现；Schema Registry 需在发布前校验。

### 20.3 IToolProtocolAdapter

```typescript
/**
 * 工具协议适配器接口
 * 将不同协议（MCP/REST/gRPC/GraphQL）统一为内部工具调用契约
 * @property protocol - 适配的协议类型
 */
interface IToolProtocolAdapter {
  /** 适配器名称 */
  readonly name: string;

  /** 支持的协议 */
  readonly protocol: ToolProtocol;

  /**
   * 发现可用工具列表
   * @returns 工具定义列表
   */
  discover(): Promise<readonly ToolDefinition[]>;

  /**
   * 执行工具调用
   * @param toolName - 工具名称
   * @param params - 调用参数
   * @param ctx - 执行上下文
   * @returns 标准化工具结果
   */
  execute(toolName: string, params: unknown, ctx: ToolContext): Promise<ToolResult>;

  /**
   * 健康检查
   * @returns 适配器连接是否正常
   */
  ping(): Promise<boolean>;

  /**
   * 优雅关闭连接
   */
  close(): Promise<void>;
}

type ToolProtocol = 'mcp' | 'rest' | 'graphql' | 'grpc' | 'websocket' | 'shell';
```

### 20.4 IOrchestrationSelector + OrchestrationStrategy（v3.1 修订：量化条件 + cooldown + 持久化决策 ID）

```typescript
/**
 * 编排策略选择器接口
 * @description 根据任务特征和上下文动态选择最佳编排模式
 * @stability S2
 */
interface IOrchestrationSelector {
  /**
   * 选择编排策略
   * @param task - 任务描述（含量化特征）
   * @param agents - 可用 Agent 列表
   * @param context - 选择上下文（历史经验、资源状态等）
   * @returns 推荐的编排决策
   */
  select(
    task: TaskDescription,
    agents: readonly AgentDefinition[],
    context: OrchestrationContext,
  ): Promise<OrchestrationDecision>;

  /** v3.1 新增：在 Run 中途重新选择（受 cooldown 与切换上限约束） */
  reselect(
    runId: string,
    currentMode: OrchestrationMode,
    reason: ReselectReason,
  ): Promise<OrchestrationDecision>;
}

/** 任务描述（v3.1 新增量化特征） */
interface TaskDescription {
  readonly description: string;
  readonly subtaskCount: number;
  readonly dependencyDepth: number;
  readonly parallelizableRatio: number;         // [0,1]
  readonly requiredCapabilities: ReadonlySet<string>;
  readonly taskUncertainty: number;             // [0,1]
  readonly priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  readonly phase: PhaseId;
}

/** 编排上下文 */
interface OrchestrationContext {
  readonly runId: string;
  readonly tenantId: string;
  readonly experimentalMode: boolean;           // swarm 仅 true 时可选
  readonly resourceState: {
    readonly tenantConcurrency: number;
    readonly budgetRemaining: BudgetSnapshot;
  };
  readonly historicalSuccess?: ReadonlyMap<OrchestrationMode, number>;   // 历史成功率
}

/** 编排决策（v3.1 修订：补 score + cooldown + decisionId） */
interface OrchestrationDecision {
  readonly decisionId: string;
  readonly strategy: OrchestrationStrategy;
  readonly score: number;                       // [0,1]，主推荐评分
  readonly alternatives: readonly {
    readonly mode: OrchestrationMode;
    readonly score: number;
    readonly reason: string;
  }[];
  readonly cooldownUntil: Date;                 // 在此时间前不允许 reselect
  readonly decidedAt: Date;
}

type ReselectReason =
  | 'task_complexity_increased'
  | 'subtask_failed'
  | 'budget_pressure'
  | 'user_request'
  | 'admin_override';

/**
 * 编排策略定义
 * @property mode - 编排模式
 * @property agents - 参与的 Agent 及其角色
 * @property topology - Agent 间的拓扑关系
 * @property fallback - 降级策略
 */
interface OrchestrationStrategy {
  readonly mode: OrchestrationMode;
  readonly agents: readonly AgentRole[];
  readonly topology: AgentTopology;
  readonly budget: BudgetAllocation;
  readonly fallback: FallbackStrategy;
  readonly maxRetries: number;
  readonly timeoutMs: number;
}

type OrchestrationMode =
  | 'solo'
  | 'sequential'
  | 'parallel'
  | 'hierarchical'
  | 'swarm';                                    // v3.1 标注：仅 experimentalMode=true 可选

interface AgentRole {
  readonly agentId: string;
  readonly role: 'supervisor' | 'worker' | 'critic' | 'router';
  readonly budgetShare: number;
}

interface AgentTopology {
  readonly edges: readonly TopologyEdge[];
  readonly entryPoint: string;
  readonly exitPoints: readonly string[];
}

interface TopologyEdge {
  readonly from: string;
  readonly to: string;
  /** v3.1 修订：declarative 表达式，与 §20.11 GraphEdge 一致 */
  readonly condition?: GraphExpression;
}

/** v3.1 新增：Fallback 策略 */
interface FallbackStrategy {
  readonly mode: OrchestrationMode;             // 降级到的模式
  readonly maxFallbacks: number;                // 单 Run 最多降级次数
  readonly triggerOn: readonly ReselectReason[];
}

interface BudgetAllocation {
  readonly perAgent: ReadonlyMap<string, number>;
  readonly globalReserve: number;
}
```

### 20.5 AgentTrustProfile

```typescript
/**
 * Agent 信任档案
 * 基于历史执行数据动态维护，影响 AutonomyScore 计算
 * @property successRate - 历史任务成功率
 * @property accuracyScore - 输出准确度评分
 * @property safetyScore - 安全合规评分
 * @property totalRuns - 总执行次数
 * @property lastUpdated - 最后更新时间
 */
interface AgentTrustProfile {
  readonly agentId: string;
  readonly tenantId: string;                    // v3.1 新增：多租户隔离
  readonly successRate: number;
  readonly accuracyScore: number;
  readonly safetyScore: number;
  readonly totalRuns: number;
  readonly recentFailures: number;
  readonly skillContributions: number;
  readonly lastUpdated: Date;
  /** v3.1 新增：EWMA 衰减因子（默认 0.95），用于历史成功率指数加权 */
  readonly ewmaDecay: number;
  /** v3.1 新增：单次失败惩罚封顶（默认 0.2），避免一次性击穿 */
  readonly maxSinglePenalty: number;

  /**
   * 计算综合信任度（v3.1 公式确定化）
   * @description trustScore = 0.6 × successRate + 0.3 × accuracyScore + 0.1 × safetyScore
   *              冷启动（totalRuns < 30）：返回 BaseAutonomy × 0.5
   * @returns 0.0-1.0 之间的信任度分数（clamp）
   */
  computeTrustScore(): number;

  canProduceSkills(): boolean;
  canDistributeCrossPhase(): boolean;
}

/**
 * 信任度更新引擎（v3.1 新增独立服务）
 * @stability S2
 */
interface IAgentTrustEngine {
  /** 基于证据更新 Trust Profile（EWMA） */
  recordEvidence(agentId: string, tenantId: string, evidence: Evidence): Promise<AgentTrustProfile>;

  /** 周期衰减（每日跑） */
  decay(agentId: string, tenantId: string): Promise<AgentTrustProfile>;

  /** 重置（运维通道，需 R4 审批） */
  reset(agentId: string, tenantId: string, reason: string): Promise<AgentTrustProfile>;

  /** 查询 */
  get(agentId: string, tenantId: string): Promise<AgentTrustProfile | null>;
}
```

### 20.6 IGracefulShutdownController + IIncrementalPersistence（v3.1 修订：DrainConfig + Run 状态桥接）

> `CheckpointSnapshot` / `CheckpointReason` 权威定义已迁移至 §20.14，此节仅展示端口。

```typescript
/**
 * 优雅停机控制器
 * @description 管理进程终止时的三阶段排水逻辑
 * @stability S1
 */
interface IGracefulShutdownController {
  registerActiveRun(runId: string, abortController: AbortController): void;
  deregisterRun(runId: string): void;

  /**
   * v3.1 修订：drain 接受 config 参数
   * @param signal 触发信号
   * @param config 排水配置（grace_period 等）
   */
  drain(signal: 'SIGTERM' | 'SIGINT', config?: DrainConfig): Promise<DrainResult>;

  getStatus(): ShutdownStatus;

  /** v3.1 新增：订阅 Run 级排水状态变更（供 Run Manager 同步状态机） */
  onRunStatusTransition(handler: (runId: string, phase: ShutdownPhase) => void): Disposable;
}

/** 排水配置（v3.1 新增） */
interface DrainConfig {
  readonly gracePeriodMs: number;               // 默认 30000；K8s = terminationGracePeriodSeconds - 5s
  readonly immediateDrainMs: number;            // 默认 2000
  readonly forceFlushMs: number;                // 默认 30000
  readonly preserveRunsAsWaiting: boolean;      // 默认 true（force kill 时转 waiting_external）
}

/** 排水结果（v3.1 修订） */
interface DrainResult {
  readonly totalRuns: number;
  readonly completedNormally: number;
  readonly checkpointedForcefully: number;
  readonly preservedRunIds: readonly string[];  // 转 waiting_external 的 Run
  readonly lostRunCount: number;                // WAL fsync 未完成的 Run 数（应为 0）
  readonly durationMs: number;
}

type ShutdownStatus = 'running' | 'draining' | 'force_saving' | 'terminated';
type ShutdownPhase = 'phase1_immediate' | 'phase2_grace' | 'phase3_force' | 'completed';

/**
 * 增量持久化管理器
 * @description 通过 Durable Outbox 管理多卡点落盘
 * @stability S1
 */
interface IIncrementalPersistence {
  /** 将 Checkpoint 写入 Durable Outbox，入队成功后才允许主循环继续 */
  enqueue(runId: string, snapshot: CheckpointSnapshot): Promise<CheckpointEnqueueResult>;
  /** 同步保存 Checkpoint（等待审批、预算耗尽、Compact 后、停机排水阶段使用） */
  forceFlush(runId: string, snapshot: CheckpointSnapshot): Promise<void>;
  /** v3.1 新增：查询 Outbox 积压状态（用于 §5.5 降级写穿透判断） */
  getOutboxBacklog(): Promise<{ pending: number; oldestAgeMs: number }>;
}

interface CheckpointEnqueueResult {
  readonly checkpointId: string;
  readonly outboxOffset: string;
  readonly acceptedAt: Date;
}

interface Disposable {
  dispose(): void;
}
```

### 20.7 IEnvironmentInjector + IContextBackfiller（v3.1 修订：apply 改 async + 重采集触发器）

> 共享类型 `EnvironmentSnapshot`/`GitStateSnapshot`/`FileSystemSnapshot`/`PermissionContext` 权威定义已迁移至 §20.14；本节仅描述端口。

```typescript
/**
 * 环境注射器 — 冷启动时收集环境快照
 * @stability S2
 */
interface IEnvironmentInjector {
  /**
   * 收集环境快照
   * @param agentId Agent 定义 ID（决定收集哪些维度）
   * @param tenantId 租户 ID
   * @param dimensions 可选维度过滤；缺省全采集
   */
  collect(
    agentId: string,
    tenantId: string,
    dimensions?: readonly EnvironmentDimension[],
  ): Promise<EnvironmentSnapshot>;

  /** v3.1 新增：探测可用维度（按 Agent 权限） */
  availableDimensions(agentId: string, tenantId: string): Promise<readonly EnvironmentDimension[]>;
}

/**
 * 上下文回填器 — 工具执行后更新环境状态
 * @stability S2
 * @description v3.1 修订：apply 改为 async，并增加 reSample 触发器
 */
interface IContextBackfiller {
  /**
   * 应用工具产生的环境补丁
   * @description v3.1：改为 async；shell.execute 等需要重采集的工具，apply 内部会触发 reSample
   */
  apply(patch: ContextPatch): Promise<void>;

  /**
   * v3.1 新增：强制重新采集指定维度（shell.execute、unknown 副作用工具用）
   */
  reSample(dimensions: readonly EnvironmentDimension[]): Promise<EnvironmentSnapshot>;

  getSnapshot(): Readonly<EnvironmentSnapshot>;

  /**
   * 生成用于注入 Prompt 的格式化环境描述
   * @description 仅返回 dynamic_suffix 内容；stable_prefix 永不修改
   */
  renderForPrompt(): string;

  /** v3.1 新增：订阅环境变更（多消费者；带版本号防 stale） */
  onChange(handler: (snapshot: EnvironmentSnapshot, version: number) => void): Disposable;
}

interface ContextPatch {
  readonly dimension: EnvironmentDimension;
  readonly before: string;
  readonly after: string;
  readonly toolName: string;
  readonly timestamp: Date;
  /** v3.1 新增：是否需要立即触发 reSample */
  readonly requiresReSample: boolean;
}
```

### 20.8 IContextPolicy（v3.0 端口契约）

```typescript
/**
 * 上下文工程策略端口
 * @stability S2
 */
interface IContextPolicy {
  decide(profile: ContextProfile): Promise<ContextDecision>;
}

type ContextStrategy =
  | 'full_context'
  | 'sliding_window'
  | 'summary_prefix'
  | 'rag_augmented'
  | 'checkpoint_restore'
  | 'aggressive_compact';
```

### 20.9 IModelRouter（v3.1 修订：Run 内 stable_prefix 约束 + 熔断器）

```typescript
/**
 * 模型路由端口
 * @stability S2
 * @description v3.1 修订：增加 Run 上下文，使 Router 能感知 stable_prefix 约束
 */
interface IModelRouter {
  /**
   * 路由决策
   * @param request 路由请求（含 Run 上下文）
   */
  route(request: ModelRoutingRequest): Promise<ModelDecision>;

  /** v3.1 新增：Provider 熔断器查询 */
  getProviderHealth(providerId: string): ProviderHealthSnapshot;
}

interface ModelRoutingRequest {
  readonly runId: string;                       // v3.1 新增：关联 Run
  readonly tenantId: string;
  readonly currentModelId?: string;             // v3.1 新增：Run 当前模型，用于 stable_prefix 约束
  readonly taskType: 'reasoning' | 'coding' | 'analysis' | 'creative' | 'simple';
  readonly remainingBudget: BudgetSnapshot;     // v3.1 统一类型（替代 BudgetState）
  readonly latencyRequirement: 'realtime' | 'interactive' | 'batch';
  readonly qualityRequirement: 'best' | 'good' | 'acceptable';
  readonly contextSize: number;
  readonly allowSwitch: boolean;                // v3.1 新增：是否允许中途切换模型（破坏 cache）
}

interface ModelDecision {
  readonly modelId: string;
  readonly providerId: string;
  readonly reason: string;
  readonly fallback?: {
    readonly modelId: string;
    readonly providerId: string;
    readonly allowed: boolean;                  // v3.1：仅 Phase B/budget/admin 三种情况 allowed=true
  };
  readonly estimatedCostUSD: number;
  readonly invalidatesCache: boolean;           // v3.1：是否会失效 stable_prefix
  readonly decisionId: string;                  // v3.1：持久化决策 ID
}

interface ProviderHealthSnapshot {
  readonly providerId: string;
  readonly state: 'healthy' | 'degraded' | 'circuit_open' | 'circuit_half_open';
  readonly errorRate5m: number;
  readonly p99LatencyMs: number;
  readonly rateLimitHeadroom: number;           // [0,1]
  readonly checkedAt: Date;
}
```

### 20.10 IRetryPolicy（v3.1 修订：FailureContext 标准结构 + jitter）

```typescript
/**
 * 重试策略端口
 * @stability S2
 */
interface IRetryPolicy {
  /** v3.1 修订：异步以支持上下文加载（如查 Tool 幂等性） */
  shouldRetry(failure: FailureContext): Promise<RetryDecision>;
}

/**
 * 失败上下文（v3.1 单一定义，与 §10.5 一致）
 */
interface FailureContext {
  readonly runId: string;
  readonly turnIndex: number;
  readonly attemptCount: number;                // 从 1 起算
  readonly maxAttempts: number;
  readonly errorCode: string;                   // NexusError.code
  readonly errorKind: 'transient' | 'permanent' | 'unknown';
  readonly retryable: boolean;
  readonly failureType: FailureType;
  readonly originalError: NexusError;
  readonly toolCallId?: string;
  readonly toolCharacteristics?: ToolSafetyCharacteristics;
  readonly modelInfo?: { readonly modelId: string; readonly providerId: string };
}

type FailureType =
  | 'timeout' | 'rate_limit' | 'overloaded' | 'format_error'
  | 'tool_error' | 'hallucination' | 'budget_exhausted'
  | 'permission_denied' | 'checkpoint_corrupt';

/** 重试决策（v3.1 修订：补全 jitter 与 strategy 枚举） */
type RetryDecision =
  | {
      readonly action: 'retry';
      readonly delayMs: number;                 // 已含 jitter
      readonly strategy: 'same' | 'fallback_model' | 'simplified_prompt' | 'parameter_fix';
      readonly nextAttempt: number;
    }
  | { readonly action: 'abort'; readonly reason: string }
  | { readonly action: 'escalate'; readonly target: 'human' | 'supervisor_agent'; readonly reason: string };
```

### 20.11 IGraphNode + IGraphEdge（v3.1 修订：declarative 表达式 + 循环检测）

```typescript
/**
 * 状态图节点契约
 * @description 每个节点是状态图中的一个处理单元
 * @stability S1
 */
interface IGraphNode<TState = Record<string, unknown>> {
  readonly id: string;
  execute(state: TState, context: NodeContext): Promise<NodeResult<TState>>;
  readonly metadata: NodeMetadata;
}

interface NodeMetadata {
  readonly name: string;
  readonly idempotencyKey: (state: unknown) => string;     // 基于 state 计算
  readonly compensable: boolean;
  readonly compensation?: (state: unknown) => Promise<void>;   // 副作用补偿
  readonly version: string;                     // 节点版本，用于演进
  readonly maxRetries: number;
  readonly timeoutMs: number;
}

interface NodeContext {
  readonly runId: string;
  readonly turnIndex: number;
  readonly traceContext: TraceContext;
  readonly budgetSnapshot: BudgetSnapshot;
}

interface NodeResult<TState> {
  readonly nextState: TState;
  readonly emit?: readonly AgentStreamEvent[];
  readonly checkpointHint?: CheckpointReason;
}

/**
 * 状态图边契约
 * @description v3.1 修订：to/condition 改为 declarative 表达式（CEL/jsonata），可 JSON 持久化
 * @stability S1
 */
interface IGraphEdge {
  readonly from: string;
  /** v3.1：目标节点 ID 或 declarative 表达式（如 "state.success ? 'finalize' : 'retry'"） */
  readonly to: GraphTarget;
  /** v3.1：边激活条件（declarative 表达式） */
  readonly condition?: GraphExpression;
}

type GraphTarget =
  | { readonly kind: 'static'; readonly nodeId: string }
  | { readonly kind: 'expression'; readonly expression: GraphExpression };

interface GraphExpression {
  readonly language: 'cel' | 'jsonata';
  readonly source: string;
}

/** 完整图定义（v3.1 新增：可序列化） */
interface GraphDefinition<TState = Record<string, unknown>> {
  readonly id: string;
  readonly version: string;
  readonly nodes: readonly IGraphNode<TState>[];
  readonly edges: readonly IGraphEdge[];
  readonly entryNodeId: string;
  readonly exitNodeIds: readonly string[];
  readonly metadata: {
    readonly maxLoopIterations: number;         // v3.1：循环检测上限
    readonly maxTotalNodes: number;
  };
}
```

**状态图运行时强约束表**：

| 约束项 | 规则 | 说明 |
|--------|------|------|
| Checkpoint 时机 | 每个节点执行完毕后自动保存 | 保证任何中断都能从最近节点恢复 |
| Interrupt 触发 | 审批请求 / 外部事件等待 / 预算耗尽 / 人工断点 | 四种中断原因对应不同恢复路径 |
| Resume 入参 | `resumeInput` 必须通过 Schema 校验 | 防止恢复时注入非法数据 |
| 幂等键 | 每个节点执行携带唯一幂等键 | 网络重试 / Checkpoint 恢复不产生副作用 |
| 补偿声明 | 有副作用的节点必须声明补偿函数 | 失败回滚时自动调用补偿链 |
| 循环检测（v3.1） | 单 Run 内同节点访问 ≤ `maxLoopIterations`（默认 10） | 超限强制 abort，防 Saga 死循环 |
| 图版本化（v3.1） | `GraphDefinition.version` 与 Checkpoint 绑定；旧图运行的 Run 不允许加载新图 | 保证恢复语义一致 |

### 20.12 ISunsetEngine + IKnowledgeFederationGuard（v3.1 修订：分级 S5）

```typescript
/**
 * 补偿能力日落引擎
 * @stability S5 — v3.1 修订：补偿层契约本身亦为 L4 临时设施
 *                 详细类型定义见 §11.4
 */
interface ISunsetEngine {
  register(spec: CompensationSpec): void;
  evaluate(): Promise<readonly SunsetEvaluation[]>;
  executeSunset(compensationId: string, action: SunsetAction): Promise<SunsetExecutionResult>;
  rollback(compensationId: string, toAction: SunsetAction): Promise<void>;
}

/**
 * 知识联邦守卫
 * @stability S3
 * @description v3.1 修订：evaluate 入参改为 FederationRequest（含 distribution scope）
 */
interface IKnowledgeFederationGuard {
  evaluate(knowledge: KnowledgeAsset, request: FederationRequest): Promise<FederationDecision>;
  monitor(distributionId: string): Promise<FederationImpact>;
  rollback(distributionId: string): Promise<void>;
}
```

### 20.13 流式事件联合类型（v3.0 增强 - B5 加固）

```typescript
/**
 * Agent 流式事件 — 覆盖推理循环全生命周期
 * @description v3.0 新增 compact/model_fallback/budget_warning/environment_change/self_heal 等事件
 */
type AgentStreamEvent =
  | { type: 'text_delta'; delta: string; runId: string }
  | { type: 'reasoning_summary_delta'; delta: string; runId: string }
  | { type: 'tool_use_start'; toolName: string; toolCallId: string; input: unknown; runId: string }
  | { type: 'tool_use_result'; toolName: string; toolCallId: string; result: unknown; durationMs: number; runId: string }
  | { type: 'tool_use_error'; toolName: string; toolCallId: string; error: string; recoverable: boolean; runId: string }
  | { type: 'approval_required'; requestId: string; toolName: string; reason: string; runId: string }
  | { type: 'checkpoint'; checkpointId: string; turnCount: number; runId: string }
  | { type: 'compact'; level: 'L1_time_gap' | 'L2_evidence' | 'L3_session_graft' | 'L4_legacy'; tokensFreed: number; evidencePreserved: number; runId: string }
  | { type: 'model_fallback'; from: string; to: string; reason: string; runId: string }
  | { type: 'budget_warning'; dimension: string; usage: number; limit: number; runId: string }
  | { type: 'environment_change'; dimension: string; before: string; after: string; runId: string }
  | { type: 'self_heal'; toolName: string; strategy: string; runId: string }
  | { type: 'error'; code: string; message: string; recoverable: boolean; runId: string }
  | { type: 'completed'; result: AgentRunResult; runId: string };
```

**流式背压与重放契约（B5 落地约束）**：

```typescript
interface StreamDeliveryEnvelope {
  readonly runId: string;
  readonly sequence: number;
  readonly event: AgentStreamEvent;
  readonly createdAt: Date;
  readonly tenantId: string;                    // v3.1 新增：多租户隔离
  readonly traceContext: TraceContext;          // v3.1 新增：OTel 关联
}

interface StreamConsumerOptions {
  readonly consumerId: string;
  readonly fromSequence?: number;
  readonly maxInFlight: number;
  readonly lastEventId?: string;                // v3.1 新增：SSE Last-Event-ID 兼容
}

interface IAgentStreamBroker {
  publish(envelope: StreamDeliveryEnvelope): Promise<void>;
  subscribe(runId: string, options: StreamConsumerOptions): AsyncIterable<StreamDeliveryEnvelope>;
  ack(runId: string, consumerId: string, sequence: number): Promise<void>;
  replay(runId: string, fromSequence: number): AsyncIterable<StreamDeliveryEnvelope>;

  /** v3.1 新增：传输协议适配器获取（SSE/WS/gRPC stream） */
  getTransportAdapter(protocol: StreamProtocol): IStreamTransportAdapter;
}

/** v3.1 新增：传输协议绑定 */
type StreamProtocol = 'sse' | 'websocket' | 'grpc_stream';

interface IStreamTransportAdapter {
  readonly protocol: StreamProtocol;
  encode(envelope: StreamDeliveryEnvelope): string | Uint8Array;
  decode(raw: string | Uint8Array): StreamDeliveryEnvelope;
  /** 心跳间隔（keep-alive） */
  readonly heartbeatIntervalMs: number;
}
```

**实现约束（v3.1 修订）**：
- `sequence` 在单个 `runId` 内严格递增，支持断线重放
- 慢消费者超过 `maxInFlight` 时暂停推送或降级为摘要事件，禁止无限缓存
- 原始模型推理内容不得作为流式事件直接外发；只允许外发经过脱敏和摘要化的 `reasoning_summary_delta`
- **v3.1 新增**：`tool_use_result.result` 必须经 §17.7 净化 + DLP 过滤后才能流出
- **v3.1 新增**：`replay` 必须有 TTL（默认 24h）和单 Run 上限（默认 10000 events），超限丢弃旧 envelope
- **v3.1 新增**：传输层心跳：SSE 走 `:heartbeat` 注释，WebSocket 走 ping/pong，gRPC 走应用层 keep-alive
- **v3.1 新增**：Last-Event-ID 重连协议——客户端必须传递最后接收的 `sequence`，broker 从 `sequence+1` 重放

### 20.14 领域模型补齐清单（v3.1 全量定义）

> v3.0 此节仅给出字段列表，**v3.1 补全所有 TypeScript interface 定义**，作为 Phase 0a 契约冻结期的输出。所有模型集中在 `packages/shared/domain/`，作为 S0/S1 单一真相源。

```typescript
// ============================================================
// 核心 Aggregate Root
// ============================================================

/**
 * AgentRun — 单次 Agent 执行的根聚合
 * @stability S1
 */
interface AgentRun {
  readonly id: string;                          // UUID v7
  readonly agentId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly phase: PhaseId;
  readonly status: AgentRunStatus;
  readonly statusReason?: string;
  readonly input: unknown;
  readonly output?: unknown;
  readonly budgetReservation: BudgetReservation;
  readonly budgetUsed: BudgetSnapshot;
  readonly turnCount: number;
  readonly toolCallCount: number;
  readonly checkpointIds: readonly string[];
  readonly latestCheckpointId?: string;
  readonly modelTransitions: readonly ModelTransition[];   // §10.3 切换记录
  readonly traceContext: TraceContext;
  readonly priority: 'P0' | 'P1' | 'P2' | 'P3' | 'P4';
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly deadlineAt?: Date;
  readonly metadata: Readonly<Record<string, unknown>>;
}

type AgentRunStatus =
  | 'created'
  | 'running'
  | 'waiting_approval'
  | 'waiting_external'
  | 'waiting_budget'
  | 'draining'
  | 'resuming'
  | 'succeeded'
  | 'failed'
  | 'handed_over'
  | 'cancelled';

interface ModelTransition {
  readonly fromModelId: string;
  readonly toModelId: string;
  readonly reason: 'budget_degradation' | 'model_failure' | 'admin_override' | 'user_request';
  readonly at: Date;
  readonly turnIndex: number;
}

// ============================================================
// Budget 模型（v3.1 单一真相源）
// ============================================================

/**
 * 预算预留（Run 启动时申请）
 * @stability S1
 */
interface BudgetReservation {
  readonly tokenBudget: number;
  readonly costBudgetUSD: number;
  readonly timeBudgetSeconds: number;
  readonly stepBudget: number;
  readonly reservedAt: Date;
  readonly tenantPool: string;                  // 关联 §10.4 Reservation Tree
}

/**
 * 预算快照（运行时已消耗 + 余量）
 * @stability S1
 */
interface BudgetSnapshot {
  // 已消耗
  readonly tokensUsed: TokenUsage;
  readonly costUsedUSD: number;
  readonly timeUsedSeconds: number;
  readonly stepsUsed: number;

  // 余量（与 §10.3/§10.4 「remaining%」口径一致）
  readonly tokenRemaining: number;
  readonly costRemainingUSD: number;
  readonly timeRemainingSeconds: number;
  readonly stepRemaining: number;

  // 派生
  readonly minRemainingPercent: number;         // 四维最低余量比例
  readonly isExhausted: boolean;
  readonly capturedAt: Date;
}

interface TokenUsage {
  readonly inputTokens: number;
  readonly cachedInputTokens: number;
  readonly outputTokens: number;
  readonly thinkingTokens: number;
}

// ============================================================
// Checkpoint
// ============================================================

/**
 * Checkpoint 快照（持久化结构）
 * @stability S1
 */
interface CheckpointSnapshot {
  readonly checkpointId: string;
  readonly runId: string;
  readonly reason: CheckpointReason;
  readonly turnIndex: number;
  readonly messages: readonly Message[];
  readonly budget: BudgetSnapshot;
  readonly environmentState?: EnvironmentSnapshot;
  readonly evidenceRegistry?: EvidenceRegistry;
  readonly orchestrationState?: OrchestrationState;     // 含图节点 cursor
  readonly compactMetadata?: CompactMetadata;
  readonly capturedAt: Date;
  readonly outboxStatus: 'enqueued' | 'flushed' | 'failed';   // §5.5 写放大控制
}

type CheckpointReason =
  | 'post_model_output'
  | 'post_tool_execution'
  | 'post_compact'
  | 'pre_approval_wait'
  | 'high_risk_decision'
  | 'periodic_interval'
  | 'graceful_shutdown'
  | 'force_shutdown';

interface OrchestrationState {
  readonly mode: OrchestrationMode;
  readonly currentNodeId?: string;
  readonly visitedNodes: readonly string[];
  readonly switchHistory: readonly OrchestrationSwitch[];
}

interface OrchestrationSwitch {
  readonly fromMode: OrchestrationMode;
  readonly toMode: OrchestrationMode;
  readonly at: Date;
  readonly turnIndex: number;
  readonly reason: string;
}

interface CompactMetadata {
  readonly level: 'L1' | 'L2' | 'L3' | 'L4';
  readonly tokensBefore: number;
  readonly tokensAfter: number;
  readonly cacheInvalidated: boolean;
  readonly executedAt: Date;
}

// ============================================================
// Skill / Evidence
// ============================================================

/**
 * 技能条目（OERCD 产出，存入 MEM-3）
 * @stability S2
 */
interface SkillEntry {
  readonly skillId: string;
  readonly name: string;
  readonly l0Summary: string;                   // ≤20 token 索引摘要
  readonly fullContent: string;                 // 完整技能 Markdown
  readonly applicableAgents: readonly string[];
  readonly applicableTaskPatterns: readonly string[];   // 任务模式匹配
  readonly version: string;
  readonly status: 'pending_review' | 'approved' | 'deprecated' | 'rolled_back';
  readonly dataClassification: DataClassification;
  readonly producedBy: string;                  // 产出 Agent ID
  readonly tenantOrigin: string;                // 来源租户
  readonly evidenceIds: readonly string[];
  readonly hitCount: number;                    // 命中计数
  readonly lastHitAt?: Date;
  readonly createdAt: Date;
  readonly approvedAt?: Date;
  readonly deprecatedAt?: Date;
}

/**
 * 信任飞轮证据（v3.1 统一定义，废弃 EvidenceEntry 别名）
 * @stability S1
 */
interface Evidence {
  readonly id: string;
  readonly type: EvidenceType;
  readonly agentId: string;
  readonly runId?: string;
  readonly outcome: 'positive' | 'negative' | 'neutral';
  readonly confidence: number;                  // [0,1]
  readonly source: 'auto' | 'manual' | 'audit';
  readonly content: string;                     // 证据正文/引用
  readonly contentType: 'file_path' | 'url' | 'code_snippet' | 'data_table' | 'error_trace' | 'text';
  readonly sourceToolCall?: string;
  readonly turnCreated?: number;
  readonly accessCount: number;
  readonly ttl?: Date;                          // 过期时间（默认 20 turns 折算）
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: Date;
}

type EvidenceType =
  | 'execution_success'
  | 'execution_failure'
  | 'user_feedback'
  | 'audit_finding'
  | 'tool_output'
  | 'rag_retrieval';

interface EvidenceRegistry {
  readonly runId: string;
  readonly entries: ReadonlyMap<string, Evidence>;
  readonly maxEntries: number;                  // 默认 50
}

// ============================================================
// Approval / Tool / Plan
// ============================================================

/**
 * 审批请求（v3.1 修订：补 status / decidedBy / decidedAt）
 * @stability S2
 */
interface ApprovalRequest {
  readonly requestId: string;
  readonly agentRunId: string;
  readonly tenantId: string;
  readonly riskLevel: ToolRiskLevel;
  readonly toolName: string;
  readonly toolParams: Readonly<Record<string, unknown>>;
  readonly context: string;
  readonly evidenceIds: readonly string[];
  readonly deadline: Date;
  readonly approvers: readonly string[];
  readonly requiredApprovals: number;
  readonly status: 'pending' | 'approved' | 'denied' | 'expired';
  readonly decisions: readonly ApprovalDecision[];
  readonly createdAt: Date;
  readonly finalizedAt?: Date;
}

interface ApprovalDecision {
  readonly approverId: string;
  readonly decision: 'approve' | 'deny';
  readonly comment?: string;
  readonly decidedAt: Date;
  readonly factorIndex?: string;                // 二要素认证因子
}

/**
 * 工具调用上下文（v3.1 修订）
 * @stability S1
 */
interface ToolInvocation {
  readonly invocationId: string;
  readonly toolId: string;
  readonly runId: string;
  readonly turnIndex: number;
  readonly params: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly timeout: number;
  readonly retryPolicy: 'never' | 'on_network_error' | 'always';
  readonly ctx: ToolContext;
  readonly invokedAt: Date;
}

interface ExecutionPlan {
  readonly planId: string;
  readonly runId: string;
  readonly steps: readonly PlanStep[];
  readonly dependencies: readonly PlanDependency[];
  readonly estimatedTokens: number;
  readonly estimatedCostUSD: number;
  readonly estimatedDurationMs: number;
  readonly criticalPath: readonly string[];
  readonly checkpointReasons: readonly CheckpointReason[];
  readonly createdAt: Date;
}

interface PlanStep {
  readonly stepId: string;
  readonly description: string;
  readonly requiredCapabilities: readonly string[];
  readonly riskLevel?: ToolRiskLevel;
}

interface PlanDependency {
  readonly fromStepId: string;
  readonly toStepId: string;
  readonly kind: 'sequential' | 'data' | 'resource';
}

// ============================================================
// Environment / Permission
// ============================================================

interface EnvironmentSnapshot {
  readonly workingDirectory: string;
  readonly directoryStructure: string;
  readonly gitState: GitStateSnapshot | null;
  readonly fileSystemState: FileSystemSnapshot;
  readonly permissionContext: PermissionContext;
  readonly externalSystemState: Readonly<Record<string, unknown>>;
  readonly collectedAt: Date;
  readonly version: number;                     // v3.1 新增：单调递增，避免回填竞态
}

interface GitStateSnapshot {
  readonly branch: string;
  readonly headCommit: string;
  readonly dirtyFiles: readonly string[];
  readonly lastCommitAt: Date;
}

interface FileSystemSnapshot {
  readonly keyFiles: ReadonlyArray<{
    readonly path: string;
    readonly mtime: Date;
    readonly sizeBytes: number;
    readonly sha256?: string;
  }>;
}

interface PermissionContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly roles: readonly string[];
  readonly allowedToolIds: readonly string[];
  readonly maxRiskLevel: ToolRiskLevel;
  readonly dataClassification: DataClassification;
  // v3.1 修订：删除 budgetRemaining 字段（避免 stale；Budget 实时从 BudgetManager 拉取）
}

// ============================================================
// 其他业务类型
// ============================================================

interface KnowledgeAsset {
  readonly skillId: string;                     // 关联 SkillEntry
  readonly content: string;
  readonly version: string;
  readonly status: 'pending_review' | 'approved' | 'deprecated';
  readonly applicableAgents: readonly string[];
  readonly dataClassification: DataClassification;
  readonly producedBy: string;
  readonly evidenceIds: readonly string[];
  readonly createdAt: Date;
}

interface DevelopmentCheckpoint {
  readonly id: string;
  readonly runId: string;
  readonly branch: string;
  readonly commit: string;
  readonly testResults: {
    readonly passed: number;
    readonly failed: number;
    readonly skipped: number;
  };
  readonly coverageReport: {
    readonly linesPercent: number;
    readonly branchesPercent: number;
  };
  readonly createdAt: Date;
}

interface ConnectorDefinition {
  readonly connectorId: string;
  readonly platform: 'feishu' | 'dingtalk' | 'wecom' | 'oa' | 'jira' | 'confluence' | 'custom';
  readonly capabilities: readonly string[];
  readonly authMethod: 'oauth2' | 'api_key' | 'sso' | 'mtls';
  readonly rateLimits: {
    readonly requestsPerSecond: number;
    readonly burstSize: number;
  };
  readonly healthCheckPath: string;
}

// ============================================================
// 公共枚举
// ============================================================

/** 工具风险等级（v3.1 提升为 const enum，与 §7.3 一致） */
type ToolRiskLevel = 'R0' | 'R1' | 'R2' | 'R3' | 'R4' | 'RX';

interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly traceFlags: number;
  readonly baggage?: Readonly<Record<string, string>>;
}

interface Message {
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly content: string | readonly ContentPart[];
  readonly toolCallId?: string;
  readonly toolName?: string;
  readonly timestamp: Date;
}

interface AgentContext {
  readonly runId: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly traceContext: TraceContext;
  readonly permissions: PermissionContext;
  readonly budgetSnapshot: BudgetSnapshot;
  readonly environmentSnapshot?: EnvironmentSnapshot;
}
```

> **使用规范**：以上模型为 §17.2 `packages/shared/domain/` 的权威定义；任何子包（control-plane、kernel、memory、phase-*）只能 import 不能扩展；扩展需走 ADR 评审。

## 二十一、三代方案进化能力矩阵

> 通过本次三方融合，Nexus 在以下维度形成对竞品的结构性优势。

| 能力维度 | 传统 Agent 框架 | Nexus v1.0 基线 | Nexus v2.0 演进 | **Nexus v3.0 融合（本文档）** |
|---------|---------------|-----------------|-----------------|--------------------------|
| **上下文管理** | 简单截断 | 四级 Compact（旧称） | 金字塔 L1-L4 + 上下文策略端口 | 证据感知 + 时间间隔 + 缓存协同 + L3 端口化 |
| **记忆更新** | 同步阻塞 | PostSampling Hook | 影子代理概念 | **双轨影子代理（零阻塞）+ 反膨胀机制 + Redis/PG 双写** |
| **推理循环韧性** | 无 | 基础重试 | 重试策略端口 | **四阶段防御 + 工具自愈 + 模型三级降级 + jitter 退避** |
| **成本优化** | 模型路由 | 冻结快照 | 多维预算拆分 | **四策略 Cache 体系（α 设计目标 ≥0.85，实测校准）** |
| **环境感知** | 无 | 无 | 无 | **冷启动注射 + 运行时回填 + reSample 触发器** |
| **停机安全** | 无/简单 Ctrl+C | Checkpoint | Checkpoint | **三阶段排水 + 多卡点落盘 + admin.resume 兜底** |
| **决策可解释性** | 无 | 审计日志 | 审计 + 信任飞轮 | **认知热力图 + 决策链 + Explainability API** |
| **缓存命中率** | ~0 | ~0.5（估计） | ~0.7（设计） | **≥ 0.85（设计目标，按 Provider 实测校准）** |
| **工具失败处理** | 直接报错 | 基础错误传递 | 重试策略 | **错误转化为模型可理解上下文 + 自愈 + 幂等保护** |
| **单任务成本** | ~$0.20 | ~$0.10 | ~$0.06 | **~$0.04 / Phase1（GA 目标，实测校准）** |
| **能力分层治理** | 平面架构 | 分层 | S0-S5 分级 | **S0-S5 + 补偿能力日落（含 rollback）+ 单一真相源** |
| **知识联邦** | 无 | 单机沉淀 | 自动分发 | **守卫 + A/B 对照 + 负迁移回滚 + 多租户隔离** |
| **三阶段解耦** | 紧耦合 | 事件总线 | 事件总线 + 因果链 | **事件总线 + 因果链 + 幂等键 + 数据分级 + Schema Registry + DLQ** |
| **状态图运行时** | 隐式 | 隐式 | IGraphNode/Edge | **IGraphNode/Edge declarative DSL + 循环检测 + 版本化** |
| **可观测深度** | Logs | Traces+Metrics+Logs | + Trust Profile | **+ Cognitive Heatmap + Decision Chain + Cache Metrics + OTel GenAI** |
| **多租户隔离（v3.1 新增）** | 无 | 单租户 | 单租户 + SingleTenantGuard | **TenantId 贯穿事件/预算/Trust/沙箱反亲和** |
| **安全验收（v3.1 新增）** | 无 | SAST | SAST + DLP | **红队 100+ + 越权 20+ + 多模态污染 30+ + Chaos** |

**核心差异化能力矩阵**：

```
                    传统框架    v1.0 基线   v2.0 演进  v3.0 融合（本文档）
                    ────────    ─────────   ────────  ──────────────────
可靠性（韧性）         ★☆☆         ★★☆        ★★☆         ★★★
                    无容错      基础重试    重试策略    四阶段防御+自愈

经济性（成本）         ★☆☆         ★★☆        ★★☆         ★★★
                    无优化      冻结快照    多维预算    四策略Cache体系

可解释性              ★☆☆         ★★☆        ★★☆         ★★★
                    黑盒       审计日志     信任飞轮    热力图+决策链+API

运维安全性            ★☆☆         ★★☆        ★★☆         ★★★
                    裸停机      Checkpoint  Checkpoint  三阶段排水+多卡点

环境感知              ☆☆☆         ☆☆☆        ☆☆☆         ★★★
                    无          无          无          冷启动注射+运行时回填

记忆效率              ★☆☆         ★★☆        ★★☆         ★★★
                    同步阻塞    Hook更新    影子代理    双轨代理+反膨胀

治理成熟度            ★☆☆         ★★☆        ★★★         ★★★
                    无          基础治理    日落管理    日落+联邦守卫+S0-S5
```

---

## 二十二、架构决策记录（ADR）附录（v3.1 新增）

> Phase 0a 契约冻结期产出。每条 ADR 记录决策上下文、备选方案、决定与后果。任何与 ADR 冲突的实现需重新走 ADR 评审。

### ADR-001：IAgentRuntime 端口签名统一

- **背景**：v3.0 §3.4.4 与 §20.1 端口签名分裂，Run Manager 无法对接 Kernel。
- **决策**：v3.1 统一为「生命周期（`start/resume/cancel`）+ 会话调用（`invoke/stream`）+ 自省（`getAvailableTools/healthCheck`）」三组方法，详见 §20.1。
- **后果**：所有 Phase Pack 必须通过 `IAgentRuntime.start(spec)` 创建 Run，禁止直接构造 AgentRun。

### ADR-002：成本公式单一真相源

- **背景**：v3.0 §10.4 / §16.4 / §17.6 存在三套并行公式，BudgetManager 实现无所适从。
- **决策**：**§17.6 为唯一权威**，使用 `T_stable / T_dynamic / α` 模型；§10.4 仅定义维度；§16.4 仅作衍生计算示例并引用 §17.6。
- **后果**：α 表述统一为「设计目标 ≥0.85，按 Provider 实测校准」，删除「设计保证」措辞。

### ADR-003：AutonomyScore 与 R 级裁决顺序

- **背景**：v3.0 AutonomyScore ≥0.7 自动执行与 R3/R4 强制审批存在逻辑冲突。
- **决策**：**R 级硬规则优先**——RX 拒绝、R4 多人审批、R3 人工审批；AutonomyScore 仅影响 R0–R2 与轻量确认分流；Policy Engine 仅可向上覆盖（拒绝更严）。详见 §10.1。
- **后果**：§19.4 「AutonomyScore 月增长 KPI」必须与「审批抽检率」「幻觉检出率」联动评估。

### ADR-004：预算阈值统一为 remaining% 口径

- **背景**：v3.0 §10.3 用「已消耗 60/80/95%」，§10.4 用「remaining < 20/15/10%」。
- **决策**：v3.1 统一为「remaining% ≥40/20-40/10-20/<10」四档；BudgetSnapshot 提供 `minRemainingPercent` 单字段。详见 §10.3/§10.4 与 §20.14。
- **后果**：所有降级触发条件改用此单口径。

### ADR-005：ISunsetEngine 与补偿层分级为 S5

- **背景**：v3.0 §20.12 标 S3，与 §2.3「L4/L5 = S5」约束冲突。
- **决策**：补偿层契约本身亦为 L4 临时设施，统一为 **S5**；ISunsetEngine 增加 `rollback(toAction)` 方法。详见 §11.4 / §20.12。
- **后果**：团队按 S5 维护补偿代码，不承诺向后兼容。

### ADR-006：L3 Compact 端口化（kernel 不直接 import memory）

- **背景**：v3.0 §3.4 洋葱 L3=kernel/compact 但需读 SessionShadow（在 memory 包），违反「kernel→shared only」依赖规则。
- **决策**：L3 通过 `IMemorySummaryProvider` 端口反向消费 memory；端口位于 `packages/shared/ports/`；不可用时降级到 L4。详见 §3.4 / §9.3 / §17.2。
- **后果**：CI 增加 dependency-cruiser 规则禁止 kernel 上行 import。

### ADR-007：`waiting_external` admin 恢复入口

- **背景**：v3.0 §5.3 `waiting_external` 恢复条件仅 `event.received`，K8s 重启后无 event 通道导致 Run 永久卡死。
- **决策**：增加 `admin.resume`（管理员 API + Cron 巡检 + 超时回收）四级触发器，详见 §5.3。
- **后果**：`POST /admin/runs/{runId}/resume` 需 R4 审批；`WAITING_EXTERNAL_TIMEOUT` 默认 24h。

### ADR-008：Run 内 stable_prefix 约束

- **背景**：v3.0 §10.3 模型降级会切模型，破坏 Cache，无显式约束。
- **决策**：单 Run 默认不允许切换 modelId；仅 Phase B 降级 / 预算 <20% / 用户 override 三种情况允许；切换发射 `model_fallback` 事件并标记 `invalidatesCache`。详见 §10.3 / §20.9。
- **后果**：IModelRouter 接受 `currentModelId` + `allowSwitch` 入参；ModelDecision 包含 `invalidatesCache` 字段。

### ADR-009：v3.0 → v3.1 文档冻结

- **背景**：v3.0 存在 50+ 类型未定义、9 项内部矛盾、12 项落地缺口。
- **决策**：Phase 0a（W1-W4）完成 v3.1 修订，**不写业务代码**；产出 §20.14 全量类型 + 本节 ADR + §23 单一真相源对照表。
- **后果**：Phase 0a 评审未通过则不进入 Phase 0b 编码；评审通过后 v3.1 成为 GA 路径的法律契约。

---

## 二十三、单一真相源对照表（v3.1 新增）

> 凡多处出现的同一概念，本表锁定唯一权威定义位置，其他位置只允许「引用」不允许「重定义」。

| 概念 | 权威定义位置 | 其他出现位置（仅引用） |
|------|------------|---------------------|
| `IAgentRuntime` 接口 | **§20.1** | §3.4.4（职责表）、§5.1（形态） |
| `AgentRun` 实体 | **§20.14** | §5.2 状态机图、§5.5 Checkpoint |
| `BudgetSnapshot` / `BudgetReservation` | **§20.14** | §10.4（维度说明）、§5.3（waiting_budget） |
| 成本公式 | **§17.6**（增强公式） | §10.4（仅维度）、§16.4（仅衍生计算） |
| 预算降级阈值（remaining%） | **§10.4** | §10.3、§5.6 韧性矩阵 |
| AutonomyScore 公式 | **§10.1** | §20.5 TrustProfile.computeTrustScore |
| R 风险等级与 RX 防护 | **§7.3** | §13.2、§10.1 裁决顺序 |
| FailureContext | **§20.10** | §10.5 失败类型表 |
| Evidence 类型 | **§20.14**（统一替代 EvidenceEntry） | §9.3 EvidenceRegistry、§15 OERCD |
| SkillEntry | **§20.14** | §15.1 OERCD 门控 |
| ApprovalRequest | **§20.14** | §6.1 Approval Engine、§5.3 状态机 |
| CheckpointSnapshot | **§20.14** | §5.5 多卡点策略、§20.6 IIncrementalPersistence |
| EnvironmentSnapshot | **§20.14** | §7.7、§20.7 |
| PermissionContext | **§20.14** | §8.1 四维权限 |
| PhaseBridgeEvent 治理字段 | **§20.2** | §3.2、§6.1 |
| S0 事件信封 | **packages/shared/events/envelope.ts** | §2.3 分级表、§20.2 |
| NexusError 错误码 | **packages/shared/errors/error-codes.ts** | §17.3 |
| `IGracefulShutdownController` | **§20.6** | §5.7 三阶段描述 |
| `ToolSafetyCharacteristics` | **§7.2** | §10.5 重试幂等判定、§20.10 FailureContext |
| `ContentPart` 多模态类型 | **§14.2** | §8.2 污染防护、§17.7 隔离协议 |
| `CapabilityPackManifest` | **§11.3** | §17.2 目录结构 |
| `OrchestrationMode` 枚举 | **§20.4** | §10.2 编排表 |
| `ContextStrategy` 枚举 | **§9.6** | §20.8 IContextPolicy |
| Cache 命中率口径 | **§19.6**（按 Provider/Phase 分桶） | §16.2 metrics、§17.6 |

> **CI 强制**：当任一概念在权威位置外被「重新定义」（含 interface 重声明），CI 失败；引用必须明确标注「详见 §X.Y」。

---

## 结论

Nexus 企业级 Agent 中间件 v3.1 在 v3.0 三方融合版基础上完成「内部矛盾消除、单一真相源固化、领域模型补齐、安全/合规验收补强」四项关键加固，围绕**薄内核 + 强控制面 + 可插拔能力包 + 事件驱动解耦 + 七大架构创新**五大支柱，构建了一个可审计、可治理、可恢复、可持续学习、可解释、可韧性运行的 AI 认知中间件平台。

**v1.0 基线奠定的五项核心竞争力**：
1. **OERCD 学习心跳** — Agent 不再每次从零推理，组织知识在 Agent 网络中持续沉淀和传播
2. **多级上下文防爆** — 零额外 LLM 调用的上下文管理，成本可控
3. **三阶段独立运行** — 事件总线解耦，每个阶段可独立部署、独立升级、独立故障隔离
4. **Evidence-Driven Trust** — 信任度驱动自主权，正循环提升效率，负循环保障安全
5. **四维预算硬约束** — Token/成本/时间/步数四维管控，杜绝资源失控

**v2.0 演进新增的四项治理能力**：
6. **能力分层 S0-S5** — 不同层级有差异化的兼容承诺与灰度策略
7. **补偿能力日落管理** — ISunsetEngine 自动驱动临时方案下线
8. **知识联邦守卫** — A/B 对照 + 负迁移检测 + 自动回滚
9. **可插拔能力包五级分类** — Platform / Domain / Agent / Tool / Connector 差异化治理

**v2.0 深度创新新增的七大架构机制**：
10. **金字塔级联 Compact** — 时间间隔 + 证据感知双维度（独创）
11. **双轨影子代理** — SessionShadow + KnowledgeCrystallizer 零阻塞架构
12. **韧性推理循环** — Phase A-D 四阶段防御 + 工具自愈
13. **Prompt Cache 战略** — 四策略协同，α 设计目标 ≥0.85（按 Provider 实测校准）
14. **环境感知与状态回填** — 冷启动注射 + 运行时回填，模型零浪费在确认环境
15. **优雅停机三阶段排水** — 多卡点落盘确保已确认状态零数据丢失
16. **认知热力图 + 决策链** — Agent 推理过程对人类可观测、可理解、可审计

**v3.1 新增的四项落地加固**：
17. **单一真相源固化（§23）** — 9 项 ADR 锁定关键决策，杜绝重复定义与口径漂移
18. **领域模型全量定义（§20.14）** — AgentRun / BudgetSnapshot / Evidence / SkillEntry 等核心类型 TypeScript 化，Phase 0a 契约冻结
19. **安全验收补强（§19.8）** — 红队 / 越权 / 多模态污染 / 合规 / 沙箱逃逸 五维度 GA 阻断项
20. **韧性 + 成本 + 多租户三位一体** — MTTR/Chaos/1K-Run 成本对账/多租户反亲和，从架构愿景跨入工程可验收

**本方案从架构设计到工程落地、从安全治理到成本控制、从单 Agent 运行时到多 Agent 协同编排、从基础推理到韧性自愈、从黑盒到可解释，提供了企业级 AI Agent 平台的完整技术蓝图。**

---

*本文档为 Nexus 企业级 Agent 中间件完整解决方案 **v3.1 落地加固版**（2026-05-26）。在 v3.0 三方融合版基础上完成 9 类硬伤修复：A 类内部矛盾 9 项、B 类落地缺口 12 项、C 类工程不可行 7 项、D 类隐性风险 13 项、E 类反 reward-hacking 4 项、F 类安全/合规 7 项、G 类多租户/扩展 4 项。新增 §22 ADR 决策记录、§23 单一真相源对照表。建议每季度评审更新；任何与 ADR 冲突的实现需重新走 ADR 评审。*

*版本演进：**v1.0 基线**（架构方案）→ **v2.0 演进**（薄内核 + 强控制面 + 可日落）→ **v2.0 深度创新**（七大架构创新）→ **v3.0 融合版**（统一蓝图）→ **v3.1 落地加固版**（本文档，工程契约自洽 + Phase 0a 冻结）。*

*三份子方案与本融合文档的关系：**v1.0 基线**（架构方案）→ **v2.0 演进**（薄内核 + 强控制面 + 可日落）→ **v2.0 深度创新**（七大架构创新）→ **v3.0 融合版**（本文档，统一蓝图）。*
