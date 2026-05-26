# Nexus 企业级 Agent 中间件完整解决方案

> **版本**: v3.0 三方融合版  
> **日期**: 2026-05-26  
> **状态**: 完整解决方案（生产级架构蓝图，需按 MVP/Beta/GA 分阶段落地验证）  
> **核心定位**: Nexus 是企业级 AI 认知中间件，负责把自然语言意图转化为可审计、可治理、可恢复、可持续学习的企业系统操作。

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

| 编号 | 盲区 | 影响 | 严重度 | 本文档加固章节 |
|------|------|------|--------|--------------|
| B1 | **推理循环韧性缺失** | Query Loop 缺乏异常降级和自愈机制，单次工具失败可导致 AgentRun 崩溃 | 🔴 Critical | §5.6 韧性推理循环引擎 |
| B2 | **上下文防爆体系单薄** | 仅有触发条件描述，缺少时间间隔感知和证据保留机制 | 🔴 Critical | §9.3 金字塔级联 Compact 体系 |
| B3 | **Prompt Cache 战略缺失** | 缺少系统级缓存策略，无法稳定提升前缀缓存命中率 | 🟠 High | §17.6 Prompt Cache 战略体系 |
| B4 | **记忆系统缺少影子代理模式** | 记忆更新阻塞主推理循环 | 🟠 High | §9.5 双轨影子记忆代理体系 |
| B5 | **流式输出架构未定义** | 需要统一事件类型、背压控制、多消费者广播与断线重放契约 | 🟠 High | §20.13 流式事件联合类型增强 |
| B6 | **优雅停机与状态排水缺失** | 仅提及 Checkpoint，未定义 SIGTERM 后的多卡点落盘 | 🟡 Medium | §5.7 优雅停机与状态排水机制 |
| B7 | **工具系统缺少环境回填机制** | 工具执行后的环境变更无法自动感知和回填 | 🟡 Medium | §7.7 环境感知与状态回填引擎 |

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
• 任何一个 Phase 可以单独启动并提供服务
• Phase 1 不依赖 Phase 2/3 的存在
• Phase 2 只需通过事件总线监听 task.assigned_to_ai 事件
• Phase 3 只需通过事件总线监听 notification.requested 和 knowledge.synced 事件
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
├─────────────────────────────────────────────────────────────────────────┤
│  L3 防爆层 — kernel/compact（L1 Time-Gap → L2 Evidence → L3 Graft → L4）│
├─────────────────────────────────────────────────────────────────────────┤
│  L2 发动机 — kernel/query-engine（Query Loop + resilient-loop Phase A-D）│
├─────────────────────────────────────────────────────────────────────────┤
│  L1 环境感知 — kernel/environment + providers/prompt-assembler（dynamic） │
├─────────────────────────────────────────────────────────────────────────┤
│  L0 大脑 — packages/providers（LLM API，流式 + Tool Calling + Cache）   │
└─────────────────────────────────────────────────────────────────────────┘

设计原则：内层不知道业务 Phase；外层失败不击穿 L0/L2（洋葱式防御，§2.2）。
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
| **IAgentRuntime** | Kernel 对外端口 | `start()` / `resume()` / `cancel()` 统一入口 | QueryEngine.submitMessage |

**硬约束**：Run Manager 不实现推理逻辑；Query Loop 不直接改 AgentRun 状态机（通过事件/回调通知 Run Manager）。

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
| waiting_budget | budget.refilled | resuming | 预算补充完成 + 存在有效 Checkpoint |
| waiting_budget | budget.denied | handed_over | 预算补充被拒绝或超时 |
| resuming | recovery.loaded | running | Checkpoint 校验通过 |
| failed | recovery.attempt | resuming | 存在有效 Checkpoint |
| failed | escalate.human | handed_over | 自动恢复失败 |
| any | shutdown.received | draining | 进程进入排水期，停止接收新请求 |
| draining | drain.completed | waiting_external | 未完成 Run 已 forceFlush，等待调度恢复 |
| draining | drain.completed_all | succeeded | 当前 Run 在宽限期内自然完成 |
| any | user.cancel | cancelled | 用户主动取消 |

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

**落盘实现**：正常运行期采用 Durable Outbox 异步入队，入队成功后才视为已安排落盘；进入 `waiting_*`、高风险决策后、Compact 后与停机排水阶段必须执行 `forceFlush`。任何持久化失败都必须触发 `on_error` 并阻止状态进入不可恢复等待，避免与“零数据丢失”目标冲突（详见 §5.7 IIncrementalPersistence）。

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

**核心接口**（详见 §20.6）：

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
   * @returns 排水完成的 Promise（所有 Run 安全保存后 resolve）
   */
  drain(signal: 'SIGTERM' | 'SIGINT'): Promise<DrainResult>;

  /** 获取当前排水状态 */
  getStatus(): ShutdownStatus;
}

interface DrainResult {
  readonly totalRuns: number;
  readonly completedNormally: number;
  readonly checkpointedForcefully: number;
  readonly durationMs: number;
}

type ShutdownStatus = 'running' | 'draining' | 'force_saving' | 'terminated';
```

---

## 六、控制面

### 6.1 Control Plane 子系统

```
Control Plane
├── Intent Router（意图路由器）
│   ├── LLM 意图分类
│   ├── Phase 路由（intent / execution / connection）
│   ├── Agent 能力匹配
│   └── 降级兜底（无匹配时走 fallback Agent）
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
| L3 Session Memory Graft | 总 Token 达窗口 80% | 读取 SessionShadow 预生成的 SESSION_SUMMARY，前半段替换为摘要 + 证据索引，保留 L2 标记的证据 + 最近 N 轮 | 零（复用影子代理） | <10ms | **嫁接**而非替换——证据跨越压缩边界存活 |
| L4 Legacy Full Compact | 前三级均无法将 Token 降至安全水位 | 启动独立 LLM 调用，生成包含证据引用的全文压缩摘要 | 一次 | 3-8s | 压缩 Prompt 中明确指示保留 EvidenceRegistry 中的所有证据 ID |

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
   - 解决的问题（resolved_questions）
   - 新产生的问题（new_questions）
   - 新的证据（new_evidence_ids）
3. 将 delta 合并到现有 SessionSummary
4. 执行反膨胀检查
5. 写入 Redis（带版本号，幂等写入）
6. 更新 Token 计数（供 Compact 引擎预判使用）

幂等保证：
  • Redis key: session_summary:{runId}
  • 使用 CAS（Compare-And-Swap）更新，version 冲突时丢弃旧写入
  • 多实例部署安全（不依赖进程内状态）
```

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

### 10.1 AutonomyScore 公式

```
AutonomyScore = BaseAutonomy
              + ReversibilityWeight × Reversibility(tool)
              + ContextFamiliarityWeight × ContextFamiliarity(task)
              - RiskPenalty(tool.riskLevel)
              + TrustBonus(agent.trustProfile)

其中：
  BaseAutonomy             = Agent 定义中的默认自主度（0.0-1.0）
  Reversibility(tool)     = 工具可逆性评分（可回滚=1.0, 部分可逆=0.5, 不可逆=0.0）
  ContextFamiliarity(task) = 任务熟悉度（基于情景记忆命中率和技能库覆盖度）
  RiskPenalty              = 风险惩罚（R0=0, R1=0.1, R2=0.3, R3=0.6, R4=1.0）
  TrustBonus              = 信任加分（基于历史成功率累积）

  ReversibilityWeight      ≈ 0.25
  ContextFamiliarityWeight ≈ 0.20

决策阈值：
  AutonomyScore ≥ 0.7 → 自动执行
  0.4 ≤ AutonomyScore < 0.7 → 轻量确认（飞书卡片确认）
  AutonomyScore < 0.4 → 完整审批流程
```

### 10.2 自适应编排

| 编排模式 | 触发条件 | Agent 拓扑 | 适用场景 |
|---------|---------|-----------|---------|
| Solo | 单一任务，单一 Agent 可完成 | 1 Agent | 简单查询、单步操作 |
| Sequential | 多步骤，有顺序依赖 | A → B → C | 需求分析→拆解→分配 |
| Parallel | 多子任务，可并行执行 | A ∥ B ∥ C → Merge | 多文件同时编辑 |
| Hierarchical | 复杂任务，需 Supervisor 协调 | Supervisor → Workers | Phase 2 完整开发流 |
| Swarm | 高度不确定，需动态协商 | Peer-to-Peer | 探索性任务（未来规划） |

### 10.3 模型路由策略

```
任务类型 + 预算状态 → 模型选择：

┌─────────────────────────────────────────────────────────┐
│ 路由规则：                                               │
│                                                          │
│  规划/架构设计类    → Claude Opus / GPT-4.5 (高推理力)   │
│  代码生成类         → Claude Sonnet / GPT-4o (平衡)     │
│  简单查询/分类     → GPT-4o-mini / Claude Haiku (快速)  │
│  安全/合规检查     → 专用微调模型 (准确)                │
│  嵌入/向量化       → text-embedding-3-small (成本低)    │
│                                                          │
│ 预算降级规则：                                            │
│  0%-60%  使用声明的首选模型                              │
│  60%-80% 自动切换至轻量模型                              │
│  80%-95% 仅执行必要步骤，跳过可选优化                    │
│  95%-100% 停止执行，保存 Checkpoint，通知人工            │
└─────────────────────────────────────────────────────────┘
```

### 10.4 预算维度

```
TotalBudget = InputBudget + CachedPrefixBudget + ThinkingBudget
            + OutputBudget + ToolBudget + RetrievalBudget

各维度说明：
  InputBudget         = 动态输入 Token 预算（用户消息 + 工具结果）
  CachedPrefixBudget  = 缓存前缀 Token 预算（系统提示 + 冻结记忆）
  ThinkingBudget      = 推理 Token 预算（Extended Thinking / Chain-of-Thought）
  OutputBudget        = 输出 Token 预算（模型回复）
  ToolBudget          = 工具调用次数/耗时预算
  RetrievalBudget     = RAG 检索次数预算

成本公式：
  C_turn = T_input × R_input
         + T_cached × α × R_cached         ← 缓存命中（大幅折扣 10-20%）
         + T_cached × (1-α) × R_input      ← 缓存未命中
         + T_thinking × R_thinking
         + T_output × R_output

  α = 冻结快照保证的缓存命中率 ≈ 0.85-0.95
```

**预算多维拆分公式**（v3.0 增强）：

```
预算分配：

  TotalBudget = TokenBudget ∩ CostBudget ∩ TimeBudget ∩ StepBudget

  任一维度耗尽即触发降级：
    TokenBudget.remaining < 20%  → 切换至轻量模型
    CostBudget.remaining < 15%   → 切换至 mini 模型
    TimeBudget.remaining < 10%   → 快速完成模式（跳过可选步骤）
    StepBudget.remaining < 3     → 强制总结并结束

  多维预算最终耗尽判定：
    isExhausted = ANY(dimension.remaining ≤ 0)
```

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

**失败类型策略表**：

| 失败类型 | 重试策略 | 最大尝试 | 退避策略 |
|---------|---------|---------|---------|
| 网络超时 (timeout) | 原样重试 | 3 | 指数退避 (1s → 2s → 4s) |
| 速率限制 (rate_limit) | 延迟后重试 | 5 | 使用 API 返回的 Retry-After |
| 模型过载 (overloaded) | 切换备选模型 | 2 | 立即切换 |
| 输出格式错误 (format_error) | 简化 Prompt 重试 | 2 | 无退避 |
| 工具执行失败 (tool_error) | 参数修正后重试 | 2 | 无退避 |
| 幻觉检测 (hallucination) | 注入纠正提示 | 1 | 无退避 |
| 预算耗尽 (budget_exhausted) | 不重试，升级人工 | 0 | - |
| 权限拒绝 (permission_denied) | 不重试，升级人工 | 0 | - |

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

### 11.3 CapabilityPackManifest 接口

```typescript
/**
 * 能力包清单声明（v3.0 增强版）
 * 每个能力包必须提供此清单，用于注册和依赖解析
 * @property id - 能力包唯一标识
 * @property version - 语义化版本号
 * @property level - 包级别（v3.0 新增，1-5 对应五级分类）
 * @property phase - 所属阶段（可选，跨阶段包不填）
 * @property kernelCompatibility - 兼容的内核版本范围（v3.0 新增）
 * @property provisions - 包提供的能力声明（v3.0 新增）
 * @property requirements - 包依赖的能力声明（v3.0 替代 dependencies）
 * @property lifecycle - 生命周期钩子（v3.0 新增）
 * @property sunsetDate - 补偿层包的日落日期
 */
interface CapabilityPackManifest {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly level: 1 | 2 | 3 | 4 | 5;
  readonly type: PackType;
  readonly phase?: PhaseId;
  readonly description: string;
  readonly author: string;
  readonly kernelCompatibility: string;
  readonly provisions: readonly PackProvision[];
  readonly requirements: readonly PackRequirement[];
  readonly lifecycle: PackLifecycle;
  readonly agents?: readonly AgentDefinitionRef[];
  readonly tools?: readonly ToolDefinitionRef[];
  readonly guardrails?: readonly GuardrailRuleRef[];
  readonly config: PackConfigSchema;
  readonly healthCheck: string;
  readonly sunsetDate?: Date;
}

type PackType =
  | 'agent'
  | 'tool'
  | 'provider'
  | 'guardrail'
  | 'memory'
  | 'integration'
  | 'connector';

/** 包提供的能力 */
interface PackProvision {
  readonly type: 'agent' | 'tool' | 'connector' | 'policy' | 'guard';
  readonly id: string;
  readonly description: string;
  readonly exports: readonly string[];
}

/** 包依赖的能力 */
interface PackRequirement {
  readonly packId: string;
  readonly versionRange: string;
  readonly optional: boolean;
}

/** 生命周期钩子 */
interface PackLifecycle {
  readonly onInstall?: string;
  readonly onActivate?: string;
  readonly onDeactivate?: string;
  readonly onReactivate?: string;
  readonly onUninstall?: string;
}

/** 旧版兼容字段（@deprecated 将在 v3.2 移除，请使用 requirements） */
interface PackDependency {
  readonly packId: string;
  readonly versionRange: string;
  readonly optional: boolean;
}
```

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

**ISunsetEngine 接口**：

```typescript
/**
 * 补偿能力日落引擎
 * @description 自动评估补偿能力的日落条件并驱动日落流程
 * @stability S3
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
   */
  executeSunset(compensationId: string, action: SunsetAction): Promise<void>;
}

/** 补偿能力规格 */
interface CompensationSpec {
  readonly id: string;
  readonly name: string;
  /** 它补偿的内核/控制面缺失 */
  readonly compensatesFor: string;
  /** 日落条件列表（全部满足则可日落） */
  readonly sunsetConditions: readonly SunsetCondition[];
  /** 最大存活版本数 */
  readonly maxVersionsAlive: number;
}

/** 日落条件 */
type SunsetCondition =
  | { type: 'interface_available'; interfaceId: string; minVersion: string }
  | { type: 'metric_threshold'; metric: string; operator: '>=' | '<='; value: number }
  | { type: 'version_reached'; version: string }
  | { type: 'manual_approval'; approver: string };

/** 日落动作 */
type SunsetAction = 'observe' | 'soft_sunset' | 'hard_sunset';
```

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

### 13.1 沙箱强制边界

| 边界维度 | 约束 | 违规处理 |
|---------|------|---------|
| 容器隔离 | 每任务独立容器，`--cap-drop ALL` + 最小权限恢复 | 拒绝执行 |
| 网络白名单 | 仅允许：Git 仓库 / npm-pypi / CI API / 内部 API | 其他连接丢弃 |
| 资源限制 | CPU: 2核, 内存: 4GB, 磁盘: 10GB, PID: 256 | 超限 OOMKill |
| 凭据管理 | 短生命周期临时 Token（TTL ≤ 任务预计时间×2） | 过期自动失效 |
| 文件系统 | 源码基线只读挂载，Agent 在独立 worktree / overlayfs 写入，最终以 diff/patch 形式提交 | 越界写入被拒绝 |
| 进程限制 | 禁止 fork bomb，PID namespace 隔离 | cgroup 强制限制 |
| 增强隔离 | 高风险任务启用 gVisor (runsc) 内核级隔离 | - |

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
   * @param targetAgent - 目标 Agent
   * @returns 分发决策
   */
  evaluate(
    knowledge: KnowledgeAsset,
    targetAgent: AgentTrustProfile,
  ): Promise<FederationDecision>;

  /**
   * 监控分发后的效果
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

/** 联邦决策结果 */
interface FederationDecision {
  readonly approved: boolean;
  readonly reason: string;
  readonly recommendedScope: 'self' | 'peer' | 'cross_phase' | 'organization';
  readonly requiresHumanReview: boolean;
}

/** 联邦影响评估 */
interface FederationImpact {
  readonly distributionId: string;
  readonly performanceDeltaBefore: number;
  readonly performanceDeltaAfter: number;
  readonly userSatisfactionDelta: number;
  readonly isNegativeTransfer: boolean;
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

**基础运行指标**：

| 指标名 | 说明 | 告警阈值 |
|--------|------|---------|
| `nexus.run.duration_ms` | AgentRun 端到端耗时 | P95 > 300s |
| `nexus.run.llm_calls` | 每任务 LLM 调用次数 | > 20 次 |
| `nexus.run.token_usage` | Token 消耗（按 Agent/Phase） | 超日预算 80% |
| `nexus.tool.latency_ms` | 工具调用延迟 | P95 > 10s |
| `nexus.tool.error_rate` | 工具调用失败率 | > 10% |
| `nexus.hitl.trigger_count` | HITL 触发次数 | 高频需根因分析 |
| `nexus.cost.per_task_usd` | 每任务美元成本 | 超预算告警 |
| `nexus.approval.wait_ms` | 审批等待时间 | > 30min 升级 |
| `nexus.checkpoint.success_rate` | Checkpoint 保存成功率 | < 99% |
| `nexus.skill.hit_rate` | 技能库命中率 | 评估 OERCD 效果 |
| `nexus.cache.prefix_hit_rate` | 前缀缓存命中率 | < 80% 需优化快照策略 |
| `nexus.compact.trigger_count` | Compact 触发频率（按级别） | L4 频繁触发需优化 |

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

```
单次 AgentRun 成本：

  C_run = Σ C_turn(i)  for i in 1..N_turns

  C_turn = (T_input × P_input + T_cached_hit × P_cached + T_cached_miss × P_input
           + T_thinking × P_thinking + T_output × P_output)
         + C_tool_calls
         + C_retrieval

  C_tool_calls = Σ (tool_api_cost + tool_compute_cost)
  C_retrieval  = N_rag_queries × C_per_rag_query

日成本预算：
  DailyBudget(tenant) = Σ AgentBudget(agent) × ExpectedRuns(agent)

月度成本预测：
  MonthlyCost ≈ AvgDailyCost × 22 (工作日) × SafetyMargin(1.2)
```

### 16.5 风险矩阵

**基础风险（v1.0 基线）**：

| 风险 | 影响 | 概率 | 应对策略 |
|------|------|------|---------|
| LLM 幻觉导致错误决策 | 高 | 高 | HITL 审批 + RAG 强制引用 + 低置信度标注 + Critic Agent |
| Agent 无限循环消耗资源 | 高 | 中 | 四维预算硬约束 + 成本熔断器 + 超时 HITL 升级 |
| Phase 2 AI 代码质量不稳定 | 高 | 中 | 低风险任务起步 + 强制 HITL 审查 + 测试覆盖率门禁 |
| Token 成本失控 | 中 | 中 | 冻结快照降成本 + 模型路由降级 + 单任务预算上限 |
| 自研编排引擎稳定性 | 高 | 中 | 充分测试 + 参考成熟架构 + 灰度发布 |
| 企业数据安全合规 | 高 | 中 | 数据分级 + 机密走本地模型 + RBAC 全覆盖 |
| Prompt 注入攻击 | 高 | 中 | 双层注入扫描 + 语义隔离 + 外部内容不提升权限 |
| 三阶段集成复杂度 | 中 | 高 | 事件总线解耦 + 独立可运行 + 渐进集成测试 |
| 沙箱逃逸 | 高 | 低 | gVisor + 网络白名单 + cap-drop + 资源限制 |
| 知识污染（错误技能扩散） | 中 | 中 | 审核门控 + 信任度机制 + 快速回滚 |

**v3.0 创新机制引入的特有风险**：

| 新增风险 | 影响 | 概率 | 应对策略 |
|---------|------|------|---------|
| SessionShadow 摘要质量退化 | 中 | 中 | 反膨胀机制自动修剪 + 定期人工抽检摘要质量 + 设置摘要 Token 上限（500 token） |
| Prompt Cache 冷启动延迟 | 低 | 高 | 预热机制：新 Agent 注册后主动发送 warm-up 请求 + 缓存未命中时不影响功能正确性 |
| 证据注册表内存膨胀 | 中 | 中 | EvidenceEntry 设置 TTL（默认 20 turns）+ accessCount=0 的条目主动淘汰 + 单 Run 最大 50 条证据 |
| 环境回填不一致 | 中 | 低 | 回填采用"最终一致性"策略（允许短暂延迟）+ 关键工具执行后强制同步回填 + 差异检测告警 |
| 决策链记录性能开销 | 低 | 中 | 异步写入（BullMQ 队列）+ 仅记录 riskLevel ≥ R1 的决策 + 批量写入（每 5 条 flush 一次） |
| 优雅停机超时导致数据丢失 | 高 | 低 | 三阶段超时递进确保数据安全 + 最终兜底：即使 force kill 也保留最后 Checkpoint + K8s preStop hook 延长 terminationGracePeriod |
| 知识联邦负迁移 | 高 | 中 | A/B 对照 + 性能回退检测 + 自动回滚 + 信任度过滤 |

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
│   │   │   ├── knowledge-crystallizer.ts # 知识结晶影子代理（v3.0）
│   │   │   ├── session-summary.ts       # 反膨胀机制（v3.0）
│   │   │   ├── episodic-memory.ts
│   │   │   ├── skill-store.ts
│   │   │   ├── org-knowledge.ts
│   │   │   ├── federation-guard.ts      # IKnowledgeFederationGuard（v3.0）
│   │   │   └── rag-pipeline.ts
│   │   └── package.json
│   ├── guardrails/              # 安全护栏
│   ├── providers/               # LLM Provider
│   │   ├── src/
│   │   │   ├── prompt-cache/            # Prompt Cache 战略（v3.0）
│   │   │   │   ├── stable-prefix.ts
│   │   │   │   ├── cache-aware-compact.ts
│   │   │   │   └── cross-run-pool.ts
│   │   │   └── prompt-assembler.ts      # System Prompt 六层组装（v3.0）
│   │   └── package.json
│   ├── observability/           # 可观测（v3.0 增强）
│   │   ├── src/
│   │   │   ├── traces/
│   │   │   ├── metrics/
│   │   │   ├── logs/
│   │   │   ├── cognitive-heatmap.ts     # 认知热力图（v3.0）
│   │   │   ├── decision-chain.ts        # 决策链记录器（v3.0）
│   │   │   └── explainability-api.ts    # Explainability API（v3.0）
│   │   └── package.json
│   ├── shared/                  # 共享类型
│   │
│   ├── phase-intent/            # L3 Phase 1 能力包
│   ├── phase-execution/         # L3 Phase 2 能力包
│   ├── phase-connection/        # L3 Phase 3 能力包
│   │
│   └── infra/                   # 基础设施胶水
│
├── apps/
│   ├── api-gateway/             # HTTP/WS 网关
│   ├── console/                 # 管理控制台
│   └── cli/                     # CLI 客户端
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

策略 3: Cache-Aware Compact
  ┌─────────────────────────────────────────────────────────────────┐
  │ Compact Engine 执行压缩时感知缓存边界：                           │
  │ • 压缩操作不修改已缓存的消息前缀                                  │
  │ • 仅从"最后一次缓存命中点"之后的消息开始压缩                      │
  │ • 如果必须修改缓存前缀（L4 场景），显式标记"缓存失效事件"         │
  │ • 计算缓存失效的成本增量，纳入 Compact 决策权衡                   │
  └─────────────────────────────────────────────────────────────────┘

策略 4: 跨 AgentRun 缓存池
  ┌─────────────────────────────────────────────────────────────────┐
  │ 同一 Agent Definition 的多个 AgentRun 共享缓存：                  │
  │ • Agent 的 stable_prefix 相同 → 自然共享 Provider 级缓存         │
  │ • 冻结技能索引按确定性排序 → 同版本 Agent 的技能前缀一致         │
  │ • 组织知识摘要按确定性快照 → 同日 Run 共享知识缓存               │
  └─────────────────────────────────────────────────────────────────┘
```

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

### 17.7 外部内容隔离注入协议（v3.0 新增）

> 来源 v2.0 深度创新——所有外部内容必须使用隔离标签，防止 Prompt 注入。

```
所有外部内容（用户输入、文档检索结果、工具返回值）统一使用隔离标签包裹：

<external_data source="rag_retrieval" trust_level="medium">
  [RAG 检索到的文档内容]
</external_data>

<external_data source="tool_result" trust_level="high" tool="git.diff">
  [工具执行结果]
</external_data>

<external_data source="user_input" trust_level="low">
  [用户原始输入]
</external_data>

目的：
1. 明确内容来源和信任等级
2. 防止外部内容被解释为系统指令（Prompt 注入防护）
3. 模型可根据 trust_level 调整引用权重
4. 审计时可追溯每段内容的来源

trust_level 说明：
  high   — 系统内部产生（工具结果、数据库查询）
  medium — 经过验证的外部数据（RAG 检索、API 返回）
  low    — 未验证的外部输入（用户消息、第三方内容）

安全规则：
  • trust_level="low" 的内容绝不提升为系统指令
  • 模型被指示在引用 low trust 内容时标注来源
  • 包含潜在注入特征的内容将被 Guardrails 扫描后标记
```

### 17.8 配置与 Secret 策略

| 类型 | 加载方式 | 存储位置 | 热更新 |
|------|---------|---------|--------|
| 应用配置 | 环境变量 → config 对象（启动时校验） | .env / 配置中心 | 需重启 |
| Agent 策略配置 | 数据库 + 缓存 | PostgreSQL + Redis | 支持热更新 |
| LLM API Key | Secret Manager → 短期缓存 | Vault / K8s Secret | 自动轮转 |
| MCP Server 凭据 | Secret Manager → 启动时注入 | Vault | 需重启 MCP 进程 |
| 沙箱临时 Token | 动态生成（TTL ≤ 任务×2） | 内存（不持久化） | 自动过期 |

---

## 十八、落地路线图

落地原则：先交付可审计、可恢复、可审批的最小闭环，再逐步引入 OERCD、联邦守卫、认知热力图等增强能力。所有指标按 MVP / Beta / GA 三档验收，禁止在 MVP 阶段承诺完整 v3.0 能力。

### Phase 0 — 基座建设 (Week 1-6)

| 周 | 目标 | 交付物 |
|----|------|--------|
| W1-2 | Kernel MVP | Query Loop + IAgentRuntime + 单 Provider 适配 + Tool Gateway 最小读工具 + Compact L1 |
| W3-4 | Control Plane MVP | Agent Registry + Run Manager 状态机 + Approval Engine（R2+）+ Budget Guard + Durable Checkpoint |
| W5-6 | 基础设施 MVP | PostgreSQL + Redis/BullMQ + Phase Bridge MVP（`task.assigned_to_ai`）+ API Gateway HTTP/WS + OTel 最小链路 |

### Phase 1 — 意图层 (Week 7-14)

| 周 | 目标 | 交付物 |
|----|------|--------|
| W7-8 | 核心 Agent | RequirementAnalystAgent + TaskPlannerAgent |
| W9-10 | 诊断与追踪 | ProjectDoctorAgent + ProgressTrackerAgent + ReminderAgent |
| W11-12 | 平台接入 | 飞书 Bot + PM MCP Server + 通知工具集 |
| W13-14 | 验证上线 | OERCD Observe/Execute/Reflect MVP + 记忆 MEM-0/MEM-1 + 集成测试 + 灰度内测 |

### Phase 2 — 执行层 (Week 15-26)

| 周 | 目标 | 交付物 |
|----|------|--------|
| W15-17 | 沙箱与编码 | Docker 沙箱 + CodeGeneratorAgent + 代码工具集 |
| W18-20 | 完整管线 | TestGenerator + TestRunner + BugFixer + CodeReviewer |
| W21-23 | CI/CD 交付 | DeploymentAgent + PRCreator + AcceptanceAgent |
| W24-26 | 优化稳定 | Checkpoint 恢复 + 双 Agent 协作 + 5 个低风险真实任务验证（不含生产部署） |

### Phase 3 — 连接层 (Week 27-40)

| 周 | 目标 | 交付物 |
|----|------|--------|
| W27-30 | 知识与问答 | RAG 系统 + IssueTriageAgent + DocumentAgent |
| W31-34 | 办公自动化 | OAAgent + MeetingAgent + CalendarAgent |
| W35-37 | 高级功能 | PPTGenerator + 飞书深度集成 + 跨平台事件总线 |
| W38-40 | GA 候选 | 三阶段联调 + 安全审计 + 性能优化 + Curator Beta + GA 候选验收 |

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
| 幻觉检出率 | ≥ 80% | 人工抽检 + 自动化检测 |

---

## 二十、核心接口契约

### 20.1 IAgentRuntime

```typescript
/**
 * Agent 运行时核心接口
 * 定义 Agent 的基本执行能力契约
 * @template TInput - 输入类型
 * @template TOutput - 输出类型
 */
interface IAgentRuntime<TInput = unknown, TOutput = unknown> {
  /** Agent 唯一标识 */
  readonly id: string;

  /** Agent 名称 */
  readonly name: string;

  /** Agent 描述 */
  readonly description: string;

  /** 版本号 */
  readonly version: string;

  /** 所属阶段 */
  readonly phase: PhaseId;

  /**
   * 同步调用 — 等待完整结果返回
   * @param input - 输入参数
   * @param context - 运行上下文
   * @returns 完整输出结果
   */
  invoke(input: TInput, context: AgentContext): Promise<TOutput>;

  /**
   * 流式调用 — 逐步产出中间事件
   * @param input - 输入参数
   * @param context - 运行上下文
   * @yields Agent 执行过程中的流式事件
   */
  stream(input: TInput, context: AgentContext): AsyncGenerator<AgentStreamEvent>;

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

### 20.4 IOrchestrationSelector + OrchestrationStrategy

```typescript
/**
 * 编排策略选择器接口
 * 根据任务特征和上下文动态选择最佳编排模式
 */
interface IOrchestrationSelector {
  /**
   * 选择编排策略
   * @param task - 任务描述
   * @param agents - 可用 Agent 列表
   * @param context - 选择上下文（历史经验、资源状态等）
   * @returns 推荐的编排策略
   */
  select(
    task: TaskDescription,
    agents: readonly AgentDefinition[],
    context: OrchestrationContext
  ): Promise<OrchestrationStrategy>;
}

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
  | 'swarm';

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
  readonly condition?: string;
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
  readonly successRate: number;
  readonly accuracyScore: number;
  readonly safetyScore: number;
  readonly totalRuns: number;
  readonly recentFailures: number;
  readonly skillContributions: number;
  readonly lastUpdated: Date;

  /**
   * 计算综合信任度
   * @returns 0.0-1.0 之间的信任度分数
   */
  computeTrustScore(): number;

  /**
   * 判断是否允许产生新技能
   * @returns 信任度 ≥ 0.5 时允许
   */
  canProduceSkills(): boolean;

  /**
   * 判断是否允许跨阶段分发
   * @returns 信任度 ≥ 0.8 + 安全评分 ≥ 0.9 时允许
   */
  canDistributeCrossPhase(): boolean;
}
```

### 20.6 IGracefulShutdownController + IIncrementalPersistence（v3.0 新增）

```typescript
/**
 * 优雅停机控制器
 * @description 管理进程终止时的三阶段排水逻辑
 * @stability S1
 */
interface IGracefulShutdownController {
  registerActiveRun(runId: string, abortController: AbortController): void;
  deregisterRun(runId: string): void;
  drain(signal: 'SIGTERM' | 'SIGINT'): Promise<DrainResult>;
  getStatus(): ShutdownStatus;
}

interface DrainResult {
  readonly totalRuns: number;
  readonly completedNormally: number;
  readonly checkpointedForcefully: number;
  readonly durationMs: number;
}

type ShutdownStatus = 'running' | 'draining' | 'force_saving' | 'terminated';

/**
 * 增量持久化管理器
 * @description 通过 Durable Outbox 管理多卡点落盘，避免 fire-and-forget 丢失状态
 * @stability S1
 */
interface IIncrementalPersistence {
  /** 将 Checkpoint 写入 Durable Outbox，入队成功后才允许主循环继续 */
  enqueue(runId: string, snapshot: CheckpointSnapshot): Promise<CheckpointEnqueueResult>;
  /** 同步保存 Checkpoint（等待审批、预算耗尽、Compact 后、停机排水阶段使用） */
  forceFlush(runId: string, snapshot: CheckpointSnapshot): Promise<void>;
}

interface CheckpointEnqueueResult {
  readonly checkpointId: string;
  readonly outboxOffset: string;
  readonly acceptedAt: Date;
}

interface CheckpointSnapshot {
  readonly messages: readonly LLMMessage[];
  readonly budget: BudgetSnapshot;
  readonly turnCount: number;
  readonly environmentState?: EnvironmentSnapshot;
  readonly pendingApproval?: string;
  readonly partialContent?: string;
  readonly evidenceRegistry?: EvidenceRegistry;
  readonly sessionSummaryVersion?: number;
  readonly createdAt: Date;
  readonly reason: CheckpointReason;
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
```

### 20.7 IEnvironmentInjector + IContextBackfiller（v3.0 新增）

```typescript
/**
 * 环境注射器 — 冷启动时收集环境快照
 * @stability S2
 */
interface IEnvironmentInjector {
  collect(agentId: string, tenantId: string): Promise<EnvironmentSnapshot>;
}

/**
 * 上下文回填器 — 工具执行后更新环境状态
 * @stability S2
 */
interface IContextBackfiller {
  apply(patch: ContextPatch): void;
  getSnapshot(): Readonly<EnvironmentSnapshot>;
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

interface GitStateSnapshot {
  readonly branch: string;
  readonly isDirty: boolean;
  readonly dirtyFiles: readonly string[];
  readonly lastCommitHash: string;
  readonly lastCommitMessage: string;
  readonly aheadBehind: { ahead: number; behind: number };
}

interface FileSystemSnapshot {
  readonly keyFiles: readonly FileInfo[];
  readonly totalFiles: number;
  readonly recentlyModified: readonly string[];
}

interface FileInfo {
  readonly path: string;
  readonly size: number;
  readonly mtime: Date;
}

interface PermissionContext {
  readonly allowedTools: readonly string[];
  readonly maxRiskLevel: ToolRiskLevel;
  readonly budgetRemaining: number;
  readonly approvalPolicy: 'auto' | 'standard' | 'strict';
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

### 20.9 IModelRouter（v3.0 端口契约）

```typescript
/**
 * 模型路由端口
 * @stability S2
 */
interface IModelRouter {
  route(request: ModelRoutingRequest): Promise<ModelDecision>;
}

interface ModelRoutingRequest {
  readonly taskType: 'reasoning' | 'coding' | 'analysis' | 'creative' | 'simple';
  readonly remainingBudget: BudgetState;
  readonly latencyRequirement: 'realtime' | 'interactive' | 'batch';
  readonly qualityRequirement: 'best' | 'good' | 'acceptable';
  readonly contextSize: number;
}

interface ModelDecision {
  readonly modelId: string;
  readonly reason: string;
  readonly fallback?: string;
  readonly estimatedCost: number;
}
```

### 20.10 IRetryPolicy（v3.0 端口契约）

```typescript
/**
 * 重试策略端口
 * @stability S2
 */
interface IRetryPolicy {
  shouldRetry(failure: FailureContext, attempt: number): RetryDecision;
}

type RetryDecision =
  | { action: 'retry'; delayMs: number; strategy: 'same' | 'fallback_model' | 'simplified_prompt' }
  | { action: 'abort'; reason: string }
  | { action: 'escalate'; target: 'human' | 'supervisor_agent' };
```

### 20.11 IGraphNode + IGraphEdge（v3.0 状态图契约）

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

/**
 * 状态图边契约
 * @description 定义节点间的转换条件
 * @stability S1
 */
interface IGraphEdge<TState = Record<string, unknown>> {
  readonly from: string;
  readonly to: string | ((state: TState) => string);
  readonly condition?: (state: TState) => boolean;
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

### 20.12 ISunsetEngine + IKnowledgeFederationGuard（v3.0 治理契约）

```typescript
/**
 * 补偿能力日落引擎
 * @stability S3
 */
interface ISunsetEngine {
  register(spec: CompensationSpec): void;
  evaluate(): Promise<readonly SunsetEvaluation[]>;
  executeSunset(compensationId: string, action: SunsetAction): Promise<void>;
}

/**
 * 知识联邦守卫
 * @stability S3
 */
interface IKnowledgeFederationGuard {
  evaluate(
    knowledge: KnowledgeAsset,
    targetAgent: AgentTrustProfile,
  ): Promise<FederationDecision>;
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
}

interface StreamConsumerOptions {
  readonly consumerId: string;
  readonly fromSequence?: number;
  readonly maxInFlight: number;
}

interface IAgentStreamBroker {
  publish(envelope: StreamDeliveryEnvelope): Promise<void>;
  subscribe(runId: string, options: StreamConsumerOptions): AsyncIterable<StreamDeliveryEnvelope>;
  ack(runId: string, consumerId: string, sequence: number): Promise<void>;
  replay(runId: string, fromSequence: number): AsyncIterable<StreamDeliveryEnvelope>;
}
```

实现约束：
- `sequence` 在单个 `runId` 内严格递增，支持断线重放。
- 慢消费者超过 `maxInFlight` 时暂停推送或降级为摘要事件，禁止无限缓存。
- 原始模型推理内容不得作为流式事件直接外发；只允许外发经过脱敏和摘要化的 `reasoning_summary_delta`。

### 20.14 领域模型补齐清单（v3.0 新增）

> 来源 v2.0 演进 §3.6——补齐 v1.0 缺失的核心领域模型类型。

| 模型 | 职责 | 关键字段 |
|------|------|---------|
| `ExecutionPlan` | Agent 执行计划的结构化表示 | steps, dependencies, estimatedTokens, checkpoints |
| `ToolInvocation` | 单次工具调用的完整上下文 | toolId, params, idempotencyKey, timeout, retryPolicy |
| `ApprovalRequest` | 审批请求实体 | requestId, agentRunId, riskLevel, context, deadline |
| `KnowledgeAsset` | OERCD 产出的知识资产 | skillId, content, version, status, applicableAgents |
| `DevelopmentCheckpoint` | Phase 2 开发检查点 | branch, commit, testResults, coverageReport |
| `ConnectorDefinition` | Phase 3 连接器定义 | platform, capabilities, authMethod, rateLimits |
| `Evidence` | 信任飞轮证据 | type, agentId, outcome, confidence, timestamp |
| `SessionSummary` | 会话摘要 | version, turnRange, progressSummary, confirmedDecisions, activeEvidenceIds |
| `EvidenceEntry` | 上下文证据项 | id, sourceToolCall, type, content, turnCreated, accessCount |
| `EnvironmentSnapshot` | 环境快照 | workingDirectory, gitState, fileSystemState, permissionContext |
| `CheckpointSnapshot` | 检查点快照 | messages, budget, turnCount, environmentState, reason |

```typescript
/** 知识资产 */
interface KnowledgeAsset {
  readonly skillId: string;
  readonly content: string;
  readonly version: string;
  readonly status: 'pending_review' | 'approved' | 'deprecated';
  readonly applicableAgents: readonly string[];
  readonly dataClassification: DataClassification;
  readonly producedBy: string;
  readonly evidenceIds: readonly string[];
  readonly createdAt: Date;
}

/** 信任飞轮证据 */
interface Evidence {
  readonly type: 'execution_success' | 'execution_failure' | 'user_feedback' | 'audit_finding';
  readonly agentId: string;
  readonly outcome: 'positive' | 'negative' | 'neutral';
  readonly confidence: number;
  readonly timestamp: Date;
  readonly source: 'auto' | 'manual';
  readonly metadata: Readonly<Record<string, unknown>>;
}

/** 审批请求 */
interface ApprovalRequest {
  readonly requestId: string;
  readonly agentRunId: string;
  readonly riskLevel: ToolRiskLevel;
  readonly toolName: string;
  readonly toolParams: Readonly<Record<string, unknown>>;
  readonly context: string;
  readonly deadline: Date;
  readonly approvers: readonly string[];
  readonly requiredApprovals: number;
}

/** 工具调用上下文 */
interface ToolInvocation {
  readonly toolId: string;
  readonly params: Readonly<Record<string, unknown>>;
  readonly idempotencyKey: string;
  readonly timeout: number;
  readonly retryPolicy: 'never' | 'on_network_error' | 'always';
  readonly ctx: ToolContext;
}
```

---

## 二十一、三代方案进化能力矩阵

> 通过本次三方融合，Nexus 在以下维度形成对竞品的结构性优势。

| 能力维度 | 传统 Agent 框架 | Nexus v1.0 基线 | Nexus v2.0 演进 | **Nexus v3.0 融合（本文档）** |
|---------|---------------|-----------------|-----------------|--------------------------|
| **上下文管理** | 简单截断 | 四级 Compact（旧称） | 金字塔 L1-L4 + 上下文策略端口 | 证据感知 + 时间间隔 + 缓存协同 |
| **记忆更新** | 同步阻塞 | PostSampling Hook | 影子代理概念 | **双轨影子代理（零阻塞）+ 反膨胀机制** |
| **推理循环韧性** | 无 | 基础重试 | 重试策略端口 | **四阶段防御 + 工具自愈 + 模型三级降级** |
| **成本优化** | 模型路由 | 冻结快照 | 多维预算拆分 | **四策略 Cache 体系（α≥0.85）** |
| **环境感知** | 无 | 无 | 无 | **冷启动注射 + 运行时回填** |
| **停机安全** | 无/简单 Ctrl+C | Checkpoint | Checkpoint | **三阶段排水 + 多卡点落盘** |
| **决策可解释性** | 无 | 审计日志 | 审计 + 信任飞轮 | **认知热力图 + 决策链 + Explainability API** |
| **缓存命中率** | ~0 | ~0.5（估计） | ~0.7（设计） | **≥ 0.85（设计保证）** |
| **工具失败处理** | 直接报错 | 基础错误传递 | 重试策略 | **错误转化为模型可理解上下文 + 自愈** |
| **单任务成本** | ~$0.20 | ~$0.10 | ~$0.06 | **~$0.04（目标）** |
| **能力分层治理** | 平面架构 | 分层 | S0-S5 分级 | **S0-S5 + 补偿能力日落管理** |
| **知识联邦** | 无 | 单机沉淀 | 自动分发 | **守卫 + A/B 对照 + 负迁移回滚** |
| **三阶段解耦** | 紧耦合 | 事件总线 | 事件总线 + 因果链 | **事件总线 + 因果链 + 幂等键 + 数据分级** |
| **状态图运行时** | 隐式 | 隐式 | IGraphNode/Edge | **IGraphNode/Edge + 强约束表** |
| **可观测深度** | Logs | Traces+Metrics+Logs | + Trust Profile | **+ Cognitive Heatmap + Decision Chain + Cache Metrics** |

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

## 结论

Nexus 企业级 Agent 中间件 v3.0 融合方案围绕**薄内核 + 强控制面 + 可插拔能力包 + 事件驱动解耦 + 七大架构创新**五大支柱，构建了一个可审计、可治理、可恢复、可持续学习、可解释、可韧性运行的 AI 认知中间件平台。

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
13. **Prompt Cache 战略** — 四策略协同保障 α≥0.85 缓存命中率
14. **环境感知与状态回填** — 冷启动注射 + 运行时回填，模型零浪费在确认环境
15. **优雅停机三阶段排水** — 多卡点落盘确保零数据丢失
16. **认知热力图 + 决策链** — Agent 推理过程对人类可观测、可理解、可审计

**本方案从架构设计到工程落地、从安全治理到成本控制、从单 Agent 运行时到多 Agent 协同编排、从基础推理到韧性自愈、从黑盒到可解释，提供了企业级 AI Agent 平台的完整技术蓝图。**

---

*本文档为 Nexus 企业级 Agent 中间件完整解决方案 v3.0 三方融合版（2026-05-26）。在 v1.0 基线之上整合 v2.0 演进的契约规范与 v2.0 深度创新的七大机制；v3.0 增补 **§3.4 Agent Harness 工程结构**、统一 Compact L1-L4 命名与 Harness 生命周期钩子契约。建议每季度评审更新，结合实际落地经验持续迭代。*

*三份子方案与本融合文档的关系：**v1.0 基线**（架构方案）→ **v2.0 演进**（薄内核 + 强控制面 + 可日落）→ **v2.0 深度创新**（七大架构创新）→ **v3.0 融合版**（本文档，统一蓝图）。*
