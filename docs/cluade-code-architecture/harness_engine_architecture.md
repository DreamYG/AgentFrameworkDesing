# Harness 工程全景白板：Claude Code 运行时宿主架构

## 什么是 Harness？

**Harness（运行时宿主工程）= 除了大模型本身之外的一切工程代码。**

它是将 Claude 大模型从"只会聊天的嘴"变成"有手有脚有记忆、能在真实文件系统中执行任务的 Agent"的完整脚手架。大模型只负责思考和决策，Harness 负责：感知环境、分发工具、管理记忆、控制预算、拦截危险操作。

---

## 架构全景图

```
┌──────────────────────────────────────────────────────────────┐
│                     Harness（宿主工程）                        │
│                                                              │
│  ┌────────────┐    ┌─────────────┐    ┌────────────────────┐ │
│  │  CLI 入口   │───▶│ QueryEngine │───▶│   query.ts 循环    │ │
│  │  接入 & 分发 │    │  底盘 / ECU  │    │   发动机 / 状态机   │ │
│  └────────────┘    └──────┬──────┘    └──┬──────────┬──────┘ │
│                           │              │          │        │
│                  ┌────────▼─────────┐    │          │        │
│                  │   context.ts     │    │          │        │
│                  │  环境 & 世界观注射 │    │          │        │
│                  └──────────────────┘    │          │        │
│                                         │          │        │
│        ┌────────────────────────────────▼──┐  ┌────▼──────┐ │
│        │       Tool 系统 (Tool.ts)         │  │ compact/  │ │
│        │  工具插槽 + 沙盒 + 权限拦截        │  │ 上下文防爆 │ │
│        └──────────────────────────────────┘  └───────────┘ │
│                                                             │
│        ┌───────────────────┐  ┌───────────────────────┐     │
│        │  sessionMemory    │  │   extractMemories     │     │
│        │  会话级临时记忆    │  │   跨会话持久记忆       │     │
│        └───────────────────┘  └───────────────────────┘     │
│                                                             │
│  ┌──────────────┐  ┌───────────┐  ┌──────────────────────┐  │
│  │  Hooks 系统   │  │  MCP 协议  │  │  权限 / YOLO 审计    │  │
│  │ (settings)    │  │  工具扩展   │  │  安全拦截器          │  │
│  └──────────────┘  └───────────┘  └──────────────────────┘  │
│                                                              │
│  ═══════════════ 以上全是 Harness ════════════════════════   │
│                                                              │
│               ┌──────────────────────┐                       │
│               │   Claude 大模型 API   │  ◀── 唯一的"大脑"     │
│               │   (Anthropic / 云端)  │                       │
│               └──────────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

---

## 完整生命周期流转 × 笔记索引

一次用户交互在 Harness 中的完整旅程：

### 阶段 ① 冷启动 & 环境装载

```
用户输入 → CLI 入口解析 → QueryEngine 构造 → context.ts 注射环境
```

- **CLI 入口**解析命令行参数，Fast-path 判断（`--version` / `daemon` 等）直接短路返回；预检探针验证 Node.js 版本与执行权限；初始化 React Ink TUI 渲染宿主
- **QueryEngine** 构造单例，持有 `mutableMessages` 数组、`totalUsage` 计费器、`abortController` 中断钩子
- **context.ts** 并发执行 Git 嗅探、读取 `CLAUDE.md`、注入当前日期锚点

> 对应笔记：[[entrypoint_architecture]] §2-4 ｜ [[QueryEngine_architecture]] §2.1-2.2 ｜ [[context_architecture]] §2.1-2.3

### 阶段 ② 主循环（心跳引擎）

```
QueryEngine.submitMessage() → query() while(true) 状态机
```

- 斜杠命令（`/config`, `/compact`）被拦截消化，不送达大模型
- **上下文净化链**按优先级依次触发：microCompact → sessionMemoryCompact → legacy compact
- **流式调用**大模型 API，通过 `async function*` 实时 yield 事件给终端渲染
- Token 预算追踪 & 美元账单检测，超限则挂起

> 对应笔记：[[query_architecture]] §A-B ｜ [[QueryEngine_architecture]] §2.2 ｜ [[compact_architecture]] 三级防线

### 阶段 ③ 工具执行（手脚协调）

```
模型返回 tool_use → Tool.checkPermissions() → 沙盒执行 → 结果回填 → 循环继续
```

- **Tool.ts** 定义了所有工具的元接口：Schema 描述、权限审计、UI 渲染钩子
- 每个工具声明 `isDestructive()` / `isReadOnly()` / `isConcurrencySafe()` 特征
- 运行时通过 `checkPermissions()` + `ToolPermissionContext` 判断是否需要人类确认；权限路由引擎支持 YOLO 模式自动放行与 yoloClassifier 智能分级
- MCP 协议扩展工具通过 Server 发现与 JSON-RPC 握手，映射为原生 Tool 插槽参与分发
- 结果通过 `tool_result` 回填至对话数组，`query.ts` 的 `while(true)` 继续下一轮

> 对应笔记：[[Tool_architecture]] §2.1-2.3 ｜ [[permissions_architecture]] §2-4 ｜ [[mcp_architecture]] §2-3 ｜ [[query_architecture]] §C

### 阶段 ④ 后台影子工作（双记忆系统）

```
对话间隙 → shouldExtractMemory() → Fork Agent → 写记忆文件
```

**会话级临时记忆（Session Memory）**
- 监控 Token 开销和工具调用次数，在自然间隙触发
- 派生隔离子代理，权限锁死只能编辑 `SESSION_MEMORY.md`
- 产出的记忆被 `sessionMemoryCompact` 复用，实现零延迟上下文压缩

**跨会话持久记忆（Extract Memories）**
- 会话结束后自动提炼项目经验，写入 `~/.claude/projects/.../memory/`
- 两阶式索引：内容卡片 `.md` + `MEMORY.md` 索引条目
- 60 秒宽限期逃生窗口：即使 Ctrl+C 退出也坚持写完

> 对应笔记：[[sessionMemory_architecture]] ｜ [[prompts_architecture]] ｜ [[extractMemories_architecture]] ｜ [[extractMemories_prompts_architecture]] ｜ [[hooks_architecture]]（钩子管线机制）

### 阶段 ⑤ 终止 & 持久化

```
无 tool_use → needsFollowUp = false → return completed → recordTranscript 落盘
```

- 模型返回中不再包含 `tool_use` → 跳出 while(true)
- `recordTranscript` 将完整对话序列化落盘，支持 `--resume` 恢复
- 多个卡点（推理前、流中、压缩后）均触发落盘，抗意外杀死

> 对应笔记：[[query_architecture]] §E ｜ [[QueryEngine_architecture]] §3.2

---

## Harness 各子系统职责矩阵

| Harness 子系统            | 职责                                       | 现有笔记                                                                        | 覆盖度   |
| ---------------------- | ---------------------------------------- | --------------------------------------------------------------------------- | ----- |
| CLI 入口 & 引导链           | 命令解析、预检、Fast-path、TUI初始化、QueryEngine交接  | [[entrypoint_architecture]] + [[end_to_end_workflow]] §1                    | ✅ 深度  |
| QueryEngine (底盘)       | 会话生命周期、配置集成、计费监控、持久化                     | [[QueryEngine_architecture]]                                                | ✅ 深度  |
| query.ts (发动机)         | 流式状态机、工具分发、错误自愈、上下文管理                    | [[query_architecture]]                                                      | ✅ 深度  |
| context.ts (世界观)       | Git 感知、CLAUDE.md 挂载、时间锚点                 | [[context_architecture]]                                                    | ✅ 深度  |
| Tool.ts (工具规范)         | 工具插槽接口、沙盒管线、权限拦截、UI 渲染                   | [[Tool_architecture]]                                                       | ✅ 深度  |
| compact/ (防爆体系)        | 三级上下文压缩：micro → sessionMemory → legacy   | [[compact_architecture]]                                                    | ✅ 深度  |
| sessionMemory (临时记忆)   | 会话内后台总结 & 上下文压缩复用                        | [[sessionMemory_architecture]] + [[prompts_architecture]]                   | ✅ 深度  |
| extractMemories (持久记忆) | 跨会话项目经验提炼 & 两阶索引                         | [[extractMemories_architecture]] + [[extractMemories_prompts_architecture]] | ✅ 深度  |
| Hooks 系统               | settings.json 事件钩子、生命周期注入、自动化行为        | [[hooks_architecture]]                                                      | ✅ 深度  |
| 权限路由引擎                 | YOLO 模式、allow/deny/ask 分级、yoloClassifier | [[permissions_architecture]]                                                | ✅ 深度  |
| MCP 协议层                | 外部工具扩展协议挂载、Server 发现与握手               | [[mcp_architecture]]                                                        | ✅ 深度  |

---

## 关键设计哲学

### 1. 洋葱模型：层层包裹大模型

大模型（API）是最内核的"大脑"。Harness 的每一层都是围绕它的保护壳和能力放大器：
- **最内层**：query.ts 直接与 API 对话
- **中间层**：Tool 系统给它"手脚"，compact 系统防它"脑溢血"
- **外围层**：QueryEngine 管理生命周期，Hooks 系统实现自动化

### 2. 防御性设计贯穿始终

- 上下文管理是 **三级阶梯防线**，不是一刀切
- 工具执行有 **沙盒 + 权限 + 并发安全** 三重保护
- 后台记忆代理被 **零信任权限锁死**，只能碰指定文件
- 所有外部数据输入都有 **长度截断兜底**

### 3. 异步非阻塞的影子系统

后台记忆提取、Prompt Cache 寄生、会话总结——这些"影子工作"全部并发不阻塞。用户感知到的是丝滑的打字体验，看不见 Harness 在暗处做的大量"家务活"。

---

## 笔记完备性状态

所有 Harness 子系统均已拥有独立的深度分析笔记，覆盖度 100%：

- ✅ `entrypoint_architecture.md` — CLI 入口到 QueryEngine 的完整引导链
- ✅ `hooks_architecture.md` — Hooks 系统与 settings.json 自动化行为
- ✅ `permissions_architecture.md` — 权限路由引擎、YOLO 模式、yoloClassifier 全貌
- ✅ `mcp_architecture.md` — MCP 协议集成与外部工具扩展

---

## 配套可视化白板

| Canvas | 视角 | 内容 |
| ------ | ---- | ---- |
| [[Harness-Engineering-Architecture.canvas]] | **架构分层（洋葱模型）** | 子系统拓扑 · 依赖关系 · 设计哲学标注 |
| [[Claude-Code-Architecture.canvas]] | **端到端流程（时序）** | 七大阶段生命周期 · 数据流转方向 |
