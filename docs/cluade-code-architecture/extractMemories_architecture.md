# `extractMemories.ts` 代码逻辑与架构解析

`src/services/extractMemories/extractMemories.ts` 揭示了 Claude Code 另外一个惊艳的杀手锏功能：**自动化按项目持久萃取记忆 (Automated Durable Memory Extraction)**。有别于刚才讲的 `sessionMemory` (单次会话过程中的临时断点草稿)，这个模块负责跨会话的长期记忆 —— 将大模型学到的关于项目的“经验教训”物理提炼成文件，写进 `~/.claude/projects/<path>/memory/` 当中！

该文件有 600 余行，核心代码展现了它是一个极高并发、防抢占的安全剥离引擎。

---

## 1. 核心职责

- 主对话每完成一次无工具调用的稳定终止时（通过 `stopHooks.ts` 的 `handleStopHooks` 触发），它都会被调度进行检查。但并非每次都会真正执行提取：系统内置了 `turnsSinceLastExtraction` 节流器（受 `tengu_bramble_lintel` 配置控制），以及 `hasMemoryWritesSince` 互斥检查（若主 Agent 已在对话中直接写过 memory 文件则跳过），只有通过所有门控后才会启动子代理。
- 如果发现有价值，静默 Fork 一个纯净的子智能体。
- 只给这个子智能体赋予“绝对只读环境+专有记忆目录写死权限”的钥匙。
- 在后台静默运行并将结果以 Markdown 文件群的形式写入磁盘。
- 会话结束/被用户秒退时，挂起一个带超时回收器的钩子，坚强地把记忆写完再死 (`drainPendingExtraction`)。

---

## 2. 核心架构与方法拆解

### 2.1 闭包沙盒状态机 (`initExtractMemories`)
作者没有把状态变量设为全局级别的极危险共享变量，而是聪明地做了一个巨大的 `initExtractMemories()` 工厂：
- `inProgress`: 当前有没有前一次记忆正在生成？
- `pendingContext`: 如果当前模型思考很快，记忆生成还在跑，用户又触发了新一轮。系统会运用一套**合并（Stash）逻辑**，将当前记录更新至 `pendingContext`，等前一条记忆刚写完（`finally` 块），立马衔接开启尾随提取（trailing run），确保永远不死锁且不漏看任何新句子！

### 2.2 双重大脑互斥锁 (`hasMemoryWritesSince`)
代码考虑到了极度智能的大模型，有时它会在主对话中被用户提醒：_"你把这个给我记在配置里"_。
如果主 agent 已经主动使用了 `FileWriteTool` 往 memory 文件夹下写了规则，那么这里会立刻挂钩子 `return;`，防止主系统和后台代理发生人格分裂和重复抢占写入。

### 2.3 严酷的环境约束 (`createAutoMemCanUseTool`)
对于剥离出来的影子智能体，给了它以下苛刻又科学的专属防反叛权限：
- **可以尽情读取整个工程**：`Read`、`Grep`、`Glob` 乃至只读的 `Bash` （如 `ls`, `find`, `cat`）全都放行，让影子智能体可以复盘上下文、查阅资料帮助写更好更细的记忆词条。
- **剥夺一切正常代码修改权**：除了 `~/.claude/projects/.../memory/` 这个特定的文件夹，任何妄图动项目业务代码的 `File_Edit` 或 `Bash`(非只读) 动作，均会被 `deny` 中断并抛弃。

### 2.4 Prompt Cache 寄生体系 (Cache Read Hit)
你会注意到日志里有这么一段输出：`cache: read=... create=... input=... (X% hit)`。
这揭示了该项目的精髓：虽然这是跑在后台的新开一次 API 请求的全新智能体，但由于它是从**主线循环上下文中完美克隆出的参数 Fork**，因此它能极大的通过 `Anthropic API` 的 Prompt Cache （提示词缓存）特性，无需重新计费前面的万字长文，只须付一点点新运算 Token —— 在几乎零成本的基础上获得智能提取服务！

### 2.5 用户前台反馈联通 (`createMemorySavedMessage`)
当这个被捂在黑盒里的后台线程真的写出优质记忆片段时，它会偷偷向主干道塞回一条幽灵消息：`appendSystemMessage?.(msg)`。这时候，如果是前排用户在看，终端 UI 在聊着天的间隙会冷不丁突然升起一个小小的标签：_[X memories saved]_。

---

## 3. 设计亮点与延伸启示

此模块教科书般地演示了：如何在不阻塞主线程（火烧眉毛的聊天大屏渲染）的情况下，实现一个**绝对安全的、并发压榨模型智力做二次复盘**的协程。
配合 `drainPendingExtraction()`，它还能在 CLI 被 `Ctrl+C` 中断退出前，向系统申请了隐形的 60 秒宽限期（`timeoutMs = 60000`），保证即使用户强退程序，刚刚学会的知识依然会被拼死写入硬盘。这种体验感对于工具类应用是相当顶级的。
