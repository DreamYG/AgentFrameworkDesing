# `sessionMemory.ts` 代码逻辑与架构解析

`src/services/SessionMemory/sessionMemory.ts` 揭示了 Claude Code 乃至所有高级 Agent 是如何实现**“超长程工作不断片”**的秘密。文件大约 500 行，详细定义了一套**后台静默记忆提炼系统 (Background Extraction System)**。

---

## 1. 核心职责

由于大模型的上下文窗口越老越钝（且收费越贵），在长期任务中，必须定期把过去几十轮碎片的尝试转化成简练的总结。该模块负责：
- 监控当前对话的 Token 开销和工具调用次数。
- 在满足阈值且处于安全的“聊天间隙”时，悄无声息地派生（Fork）一个后台子代理。
- 让子代理阅读全文并去编辑磁盘上的专属记忆文件（路径由 `getSessionMemoryPath()` 动态生成，位于 `~/.claude/` 配置目录体系下）。

---

## 2. 核心架构与方法拆解

### 2.1 触发器与节流阀 (Triggers & Thresholds)
`shouldExtractMemory()` 是判断是否需要提炼记忆的核心逻辑门。要触发总结，必须满足苛刻的条件，以防消耗过多 Token 或者打断节奏：
- **容量条件 (`hasMetUpdateThreshold`)**：由于上次总结后，新增的 Token 数必须达到配置的界限门槛。
- **动作条件 (`hasMetToolCallThreshold`)**：距离上次记录，系统是否以及调用了足够多的新工具（发生了足够多的实质性动作）。
- **自然间隙检测 (`!hasToolCallsInLastTurn`)**：由于大模型有时候会一次性发起并完成工具返回要求二次追问。这步拦截确保了**绝不会在模型等待工具回调结果的回合截断对话**，必须等到模型“思考完一个段落”，才会触发后台记忆行动。

### 2.2 隔离执行沙盒 (Background Execution by Forked Agent)
一旦决定触发提取，调用链会进入 `extractSessionMemory`：
1. **环境隔离**: `createSubagentContext(toolUseContext)` 为这个任务创建了一套全新的上下文，以防止后台任务污染当前用户正在进行的对话状态。
2. **派生独立人格**: 使用 `runForkedAgent({...})` 开辟子线程。将前面收集的长记录扔进去，给它打上 `forkLabel: 'session_memory'` 的标签。它能够享受父线索累积的 Prompt Cache（提示词缓存），节约输入 Token 费。

### 2.3 权限锁死限制 (Zero-Trust Security)
子线程既然能自动运行，要是它突发奇想在我的源码上瞎涂改怎么办？
在 `runForkedAgent` 派生时，传入了特别定制的鉴权回调：
```typescript
canUseTool: createMemoryFileCanUseTool(memoryPath)
```
这个方法写死了底层协议：**后台代理只能请求一把钥匙，只能调取 `FILE_EDIT_TOOL_NAME` (编辑文件工具)，并且被修改的目标路径 `filePath` 必须严丝合缝地等于指定的那个 Memory Path**。其余一切妄图碰项目源码或者 bash 调用的意图均会被 `deny` 强行击毙！

> **注意区分**：这里的 `createMemoryFileCanUseTool` 是 `sessionMemory` 专属的**极度严格**权限函数——只允许对单一文件执行 Edit。而另一个后台子代理 `extractMemories` 使用的是不同的权限函数 `createAutoMemCanUseTool`，后者允许 Read/Grep/Glob/只读Bash/以及在 memory 目录内 Edit 和 Write，权限范围要宽松得多。详见 `extractMemories_architecture.md`。

### 2.4 主动唤起逃生口 (Manual Trigger)
提供了一个不查任何条件的强行执行器：`manuallyExtractSessionMemory`。
这是为了暴露给外部的斜杠命令层（CLI侧的 `/summary` 指令）。当处于紧急状态或任务交接时，用户主动键入该指令，系统将会绕过所有的 Tokens 检测闸，直接拉取所有上下文总结入记忆块。

---

## 3. 设计亮点与延伸启示

1. **生命周期钩子解耦**：细心可以发现这段总结进程并没有粗暴地写死在 `query.ts` 的 `while(true)` 循环内，而是利用了一句 `registerPostSamplingHook(extractSessionMemory)` 挂载在了 **Post Sampling Hook** 生命周期的结束点。这是一种极其优雅の切面编程设计，保持了核心状态机的纯净。
   > **注意**：`sessionMemory` 使用的是 `registerPostSamplingHook` 机制，而 `extractMemories` 使用的是另一套 `handleStopHooks`（位于 `stopHooks.ts`）机制。两者虽然都在"模型回答后"触发，但走的是不同的钩子管线。
2. **后台异步非阻塞**：整个长期记忆体系是**并发不阻塞**的。大模型通过主进程流式返回字句给你看，但暗地里另外起了一个 Fork 引擎在总结。用户甚至感觉不到“卡顿在总结记忆”这种现象的存在，体验极为丝滑。

## 总结
结合之前的 `QueryEngine` 和 `context`，现在我们看到了 Claude Code 的第四大支柱 —— **记忆中枢**。它是保证系统能够支持数天数百个任务长线程执行、通过沙盒严格切分防止潜意识错乱的核心。
