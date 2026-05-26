# `QueryEngine.ts` 代码逻辑与架构深度解析

`src/QueryEngine.ts` 是整个会话的“总调度室”。如果说 `query.ts` 是具体与大模型网络交互和工具调用的“发动机”，那么 `QueryEngine.ts` 就是包裹着发动机的“底盘和行车电脑”。

它对外暴露出核心的 `QueryEngine` 类以及被外部应用（如 SDK 和 REPL）调用的统一入口 `submitMessage()` 与 `ask()`。整个文件约 1300 行。

---

## 1. 核心职责

`QueryEngine` 单例会持久地活在一次完整的对话或者 SDK 任务生命周期中，主要负责以下宏观层面控制：
- **统一会话存续 (Session Lifecycle & Persistence)**：管理并累加 `mutableMessages`，时刻对齐内存并在特定节点通过 `recordTranscript` 将记录持久化（用于后期的 `--resume` 会话恢复功能）。
- **运行配置集成 (Context & Config Assembly)**：把通过各种途径加载的系统特征（如 MCP Clients 列表、工作区环境目录、系统指令、长短期记忆路径等）聚合成一个完整的初始提示大礼包。
- **账单、消耗与安全监控 (Usage, Budget & Permissions)**：累计每一轮模型 API 吐出来的 Tokens 花费，换算成美金校验 `maxBudgetUsd` 配置；以及对受限工具使用时的权限拒绝审计 `permissionDenials` 追踪。

---

## 2. 核心架构与方法拆解

整个 `QueryEngine.ts` 的核心在于类 `QueryEngine` 的定义。

### 2.1 状态持有 (State Management)
在 Constructor 初始化时，它持有了一系列对生命周期至关重要的跨轮次（Cross-turn）状态变量：
- `mutableMessages`：即当前完整的长上下文聊天数组。
- `readFileState`：跨请求的文件状态缓存（用于避免大模型重复无益的文件扫描）。
- `totalUsage`：持续统计该实例下产生的所有 Input / Output CacheTokens。
- `abortController`：提供统一的实例级强制中断钩子 `interrupt()`。

### 2.2 核心事件分发器 `submitMessage()` 
该方法是整个系统的重中之重，它通过一个大而全的 **异步生成器 (AsyncGenerator)** 暴露。每一轮用户的输入都会流经此方法：

1. **用户输入与前置命令处理 (`processUserInput`)**：
   优先判断这次是不是真正的聊天。该函数从外部模块 `utils/processUserInput/processUserInput.ts` 导入。如果这是一个本地斜杠指令 (如 `/config`, `/compact`)，它会拦截并通过内部工具函数消化掉，不交给大模型，并立刻 yield 本地返回的 System 或者 User 类型消息。

2. **系统提示词与机制加载 (`fetchSystemPromptParts`)**：
   - 检查 `hasAutoMemPathOverride()` 布尔值（判断用户是否覆写了自动记忆路径，用于决定是否加载项目自有的 `MEMORY.md` 知识）。
   - 装载所有启用的 `MCP (Model Context Protocol)` 服务以及相关的工具/技能清单。
   - 装载默认系统提示词和用户通过环境变量挂载的 `customSystemPrompt`。

3. **进入主底座引擎查询 (`query.ts` 交接)**：
   - 一切环境设置就绪后，启动底层真正的 AI 反应循环：`for await (const message of query({ ... }))`。
   - 这也是架构设计最巧妙的地方。`QueryEngine` 将脏活累活丢给了 `query()`，然后负责**监听冒泡上来的流式事件**。

4. **流式事件拆包与状态分级 (Event Unboxing & Interception)**：
   在截获底层传出的消息块后，根据它的 `message.type` 做出反应：
   - **`stream_event`**: 分析该分块包含的 `Usage`（Token 用量），累加至当前对话。
   - **`system`/`attachment`**: 像“会话边界”(compact_boundary)、“超过最大生成轮次”、“预挂载的子代理后台任务”，都会在此处被拦截处理。
   - **`assistant`/`progress`**: 如果需要持久化记录，`void recordTranscript(messages)` 被快速“发射即忘”执行，避免堵塞渲染帧。

5. **硬性限制和预算斩断 (Hard Limitations Stop)**：
   每次消息返回都会检测：
   - 是否达到了当前设定的 美元计算账单瓶颈 (`maxBudgetUsd`)。
   - 对于有约束输出格式的场景（Structured Output），是否出现了反复重新推导且失败的场景（`error_max_structured_output_retries`）。
   并在满足条件时立刻通过 yield `is_error: true` 终止大模型执行。

---

## 3. 设计亮点与工程启示

### 3.1 极强的前端兼容：统一成 `SDKMessage`
在最后返回（return / yield）给上层时，不管底层发生了多么复杂的网络降级或者 Agent 工具沙箱连锁调用，最终给到用户的，都被抽象成了一个包含标准参数的大 Object，比如带有 `duration_ms`，`usage`，`total_cost_usd` 等。这使得后期的各类外壳（哪怕是基于 Electron 的客户端或者纯 CLI 输出）都能统一渲染逻辑。

### 3.2 高级持久化（离线保存/Resume支持）
代码中有大量的 `recordTranscript` 搭配 `EAGER_FLUSH` 的机制设计。设计者非常关心当进程**遭遇以外 Kill (比如关掉命令行窗口)** 时历史会话的保留。他们会在大模型真正开始推理前、流中、以及边界压缩完成后等多个卡点，强制将 Memory 落盘，实现极端的存活状态能力。

### 3.3 无缝降级的 “Local Command” 伪装
当用户键入了斜杠命令，`submitMessage` 处理完逻辑后，通过一个叫做 `localCommandOutputToSDKAssistantMessage` 的工具，将本地系统的回显生生伪造成是 AI 说的！极大地收敛了 UI 框架中对于“不同说话主体角色的判断逻辑”，可谓是非常优雅的业务欺骗策略。

## 总结
通过研究 `QueryEngine.ts`，你会发现整个 Claude Code 的开发团队将重点放在了**运行环境抽象**、**资源(金钱/Token)防御**以及**数据一致性**上。它更像是一个坚固的沙盒，在保证外部世界不被肆意篡改的前提下，将精简整顿后的战场交给了 `query.ts`。
