# `query.ts` 代码逻辑与架构深度解析

`src/query.ts` 是整个 Claude Code 交互式 Agent 的核心引擎。所有的对话流程、工具调用、错误降级、上下文截断与压缩，都收束在它的状态机生命周期中。
该文件高达 1700+ 行，下面将对它的核心逻辑和运转生命周期进行拆解。

## 1. 核心职责

`query.ts` 暴露的核心入口是 `export async function* query()` 迭代生成器。它的主要职责是：
- 接收一个起始对话上下文（`messages`）与工具权限配置（`toolUseContext`）。
- 启动一个无限状态机循环 `while(true)`。
- 让大模型（LLM）进行交互与生成，根据大模型是否请求 `tool_use` 决定是继续流转循环还是终止交回控制权。
- 期间处理各类极限边界情况（Token 爆满、Rate Limit 挂起、图片过大、模型失效等）。

---

## 2. 核心状态循环流转图

整个文件的主干是一个 `async function* queryLoop`。每次执行，它都会经历下面几个核心生命周期节点：

1. **上下文净化与压缩 (Context Preparation)**
2. **大模型 API 请求交互 (Model Invocation)**
3. **工具执行分发 (Tool Execution)**
4. **附件与背景任务收集 (Attachments & Backfilling)**
5. **循环重载 (Loop Continuation)**

### 生命周期详解

#### A. 上下文净化与压缩 (Context Management)
在真正调用 API 之前，系统会执行多重记忆和 Token 优化：
- `applyToolResultBudget`: 会截断那些输出过长的工具调用（如巨大的猫咪报错栈或控制台输出）。
- `snipCompactIfNeeded`: 历史裁剪片段清理。
- `microcompact`: 微型压缩，自动踢掉旧的无需携带在主显存中的小消息记录。
- `contextCollapse` 和 `autocompact`: 检查此时 Token 是否逼近极限，如果触发警告条件，则调用大模型对自己过去的长期对话进行一次“记忆瘦身总结”。

#### B. API 请求交互 (Model Calling Window)
在 `while (attemptWithFallback)` 这一层子循环中：
- 将注入了当前系统环境（如工作目录、时间、Git 状态）的 `fullSystemPrompt` 与上述清理后的 `messagesForQuery` 打包扔给 API。
- 为了极速体验，执行 **流式传输 (Streaming)** 。通过 `for await (const message of deps.callModel(...))` 实时抛出 UI 事件和字符给终端。
- 遇到诸如 API 熔断、思考长度达到极限等错误，由于是在流式传输内部，会截断重试或降级使用 `fallbackModel` 再次发起请求（通过 Tombstone 覆盖被截断的流式记忆）。

#### C. 工具执行分发 (Tool Execution)
大模型如果在前一阶段生成了 `<tool_use>` 指令块（例如请求一次 Bash 执行某任务）：
- 检查 `toolUseContext.abortController` 是否被用户按下 `Ctrl+C` 中断。如果没中断，交由 `StreamingToolExecutor` (支持并发流式工具执行) 或 `runTools` 批量执行。
- 收集这些外围沙箱的执行结果，组装为 `tool_result`，并且如果遇到工具变更了环境状态（如 `cd` 变动和工作区变动），会顺带更新 `toolUseContext` 的环境变量上下文供后续循环调用。
- （可选项）启动 `generateToolUseSummary` 在后台为刚才执行的一长串工具生成更短的可读摘要，降低 CLI 的画面喧哗度。

#### D. 后台任务与预载 (Background Subagents)
在循环内还会监控并消费子代理或延迟操作。
通过 `getCommandsByMaxPriority` 拉取那些后台挂起的 `task-notification` 或指令。如果有发现，将它们通过 `getAttachmentMessages` 注射入对话数组末尾，这样下一轮循环中大模型就能看见并在后台暗中处理。

#### E. 终止判定
如果模型返回的消息中 **不再包含** 任何 `tool_use` 代码块：
- 会使得 `needsFollowUp = false`。
- 如果没有被诸如 "prompt-too-long" 等报错阻挡，最终触发 `return { reason: 'completed' }`，跳出事件循环。

---

## 3. 高级架构设计亮点

### 3.1 AsyncGenerator (异步生成器)
整套架构采用 `async function*` 而非普通的 Promise 返回。这意味着：
大模型一边推理，文件可以一边 `yield` 抛出 `StreamEvent`, `Message`, `TombstoneMessage` 等事件供外层的 `ink` React CLI 进行 UI 同步渲染。终端能有一种“逐字生成且执行工具”的丝滑动画效果，而不必由于工具卡顿形成假死。

### 3.2 Error Recovery（自愈式韧性设计）
这个文件包含了海量的 `try-catch` 和 Retry 机制来保障不死特性。
比如 `isWithheldMaxOutputTokens` — 当模型遇到 8K 输出 Tokens 的极值限制被强制切断时，这个引擎会向对话底部扔进一条 `isMeta: true` 的特殊信息：_"Output token limit hit. Resume directly — no apology... "_ ，然后通过循环的 `continue` 发起新一轮自动补接 API 请求，形成对超过 8K 甚至数万字文本的无损拼接。

### 3.3 预算跟踪机制 (Token Budgeting)
支持 `TOKEN_BUDGET` 和 `task_budget`。在 `while(true)` 的最后：
系统会使用 `checkTokenBudget()` 检测到用户分配的预算（Budget）是否快被花光。如果是，会进行软性提示；耗尽则通过 `preventContinuation` 挂起进程。

## 总结
`src/query.ts` 是一部教科书级别的 **“AI 流式交互控制阀机”**。它将长文本上下文截取算法、重试补偿大模型、并发工具调用的协调融于一处闭环之内。理解了这个文件，就等同掌握了整个 Agent 大脑底层的多层神经网络是如何循环跳动的。
