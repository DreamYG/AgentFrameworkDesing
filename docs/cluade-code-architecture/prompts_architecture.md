# `SessionMemory/prompts.ts` 代码逻辑与架构解析

`src/services/SessionMemory/prompts.ts` 揭示了在这个强大的记忆系统背后，到底是用怎样的话术来“规训”那个在后台跑着的 Agent 的。这个模块约 300 行，本质上是一个**高级的 Prompt (提示词) 渲染引擎与预算审计员**。

---

## 1. 核心职责

在 `sessionMemory.ts` 决定要派生（Fork）一个后台子线程去执行总结任务后，它得给这个子线程发发号施令和规矩。本文件负责：
- 渲染并组装严苛的 Prompt。
- 定义了一套强制性的结构化 Markdown 记忆模版。
- **自动审计字数（Token Budget）**，并在发现某块记忆过于臃肿时，通过动态追加 Prompt 来恐吓/勒令大模型压缩精简。

---

## 2. 核心架构与方法拆解

### 2.1 强制性的骨架协议 (`DEFAULT_SESSION_MEMORY_TEMPLATE`)
系统预设了一个强依赖的日志文件格式，包含 `Session Title`, `Current State`, `Task specification`, `Worklog` 等。
在默认的 Prompt 长文中（`getDefaultUpdatePrompt`），你会看到对大模型的极端束缚：
- _"NEVER modify, delete, or add section headers..."_ （绝对不允许碰以 `#` 开头的各章节标题）。
- _"NEVER modify or delete the italic..."_ （绝对不允许碰标题下方的斜体提示词，那是留给下一个你作参考的模板指令！）。
- 这种设计的精妙之处在于，**文件结构充当了某种协议（Schema）**。因为修改是由 `FileEditTool` 执行的（依赖块替换），如果让大模型乱改标题，下一次寻找替换块的时候正则或行比对很容易崩溃挂掉。

### 2.2 动态字数审计与恐吓机制 (Size Management & Warnings)
大模型写总结很容易写成连篇累牍的流水账。系统设计了一套防腐化（Anti-bloat）机制：
1. **切片计费 (`analyzeSectionSizes`)**: 每次读入当前的旧记忆文件时，先按 `# ` 将文件切分成几大块，分别使用 `roughTokenCountEstimation` 进行大致的 Token 估算。
2. **生成针对性警告 (`generateSectionReminders`)**:
   如果系统发现总字数超过 12,000 Token，或者某个章节（如 Worklog）超过了 2000 Token。Prompt 的末尾会突然变脸，动态追加一段带有强烈压迫感的指令：
   > _"CRITICAL: The session memory file is currently ~X tokens... You MUST condense the file to fit within this budget. Aggressively shorten oversized sections..."_
   并且会精准报出**是哪一个章节超载了**：“_IMPORTANT: The following sections exceed..._”。有了这种实时反馈，下一次大模型生成的替换文本就会主动缩写。

### 2.3 断尾求生切肉器 (`truncateSessionMemoryForCompact`)
在有些绝望的场景下（比如模型就是不听话，或者系统来不及生成总结，此时被主线程的强制 `contextCollapse` 截断机制抓到了）：
这块代码提供了一个硬性斩断能力。它会物理扫描文本行，加起来字符超过 `MAX_SECTION_LENGTH * 4` 时，立刻用一行 `\n[... section truncated for length ...]` 替换掉后半拉内容。保证记忆文件再膨胀，也不会把整个对话的上下文窗口挤爆致死。

### 2.4 用户级别自定义覆写点 (User Override config)
代码极其人性化地设置了后门：
系统每次都会优先去探查本机物理路径 `~/.claude/session-memory/config/` 下有没有用户自定义的覆写文件：
- `loadSessionMemoryTemplate()` 寻找 `template.md`（自定义记忆文件骨架模板）
- `loadSessionMemoryPrompt()` 寻找 `prompt.md`（自定义给后台 Agent 的指令提示词）

这允许高端玩家完全抛弃系统默认的模版和提示词，设计自己专属的后台总结指令流。

---

## 3. 设计亮点与延伸启示

1. **并行修改法 (`parallel edit calls`)**: 在默认提示词里有一条不起眼的规定 _"...make all Edit tool calls in parallel in a single message."_ 。这强迫后台 Agent 如果想跨越全文件去替换这几处段落，必须**在一次回答中同时发起多个平行的 ToolUse 调用**。极大减少了对话轮次，这也是为什么后台总结速度快且对网络 IO 开销低的核心秘诀。
2. **“元幻觉”抑制机制**: 提示词首段警告了模型不能在总结里写 _“关于做笔记的指令 / 下面是提取到的信息”_ 。这为了防止长线对话到后期，模型出现了身份认知错乱（“我到底是一个写代码的程序员，还是一个专门被派来精简记录的秘书？”）。这能让总结文件看起来就像是一个真人以第三人称克制地书写的航海日志。
