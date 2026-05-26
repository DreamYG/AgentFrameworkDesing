# `extractMemories/prompts.ts` 代码逻辑与架构解析

`src/services/extractMemories/prompts.ts` 只有短短的 150 行代码，但它是构建 **长效项目记忆库 (Auto Memory)** 框架的“总调度说明书”。这里面记载的 Prompt，是用来直接告诉后台提炼数据的 Agent 应该以什么样的数据结构保存经验。

---

## 1. 核心职责

该模块生成了给后台子代理（Forked Agent）的系统提示词，主要负责：
- 严格圈定能力边界。告诉 Agent 它是个“后台记事员”，不要去抢主业务线程的活戏。
- 规定一套 **两步走的卡片式存储体系 (Two-step Indexing)**。
- 教导如何区分“私有本地记忆”与“团队共享记忆 (TEAMMEM)”。

---

## 2. 核心规训指令拆解

### 2.1 物理读写的并发压榨 (Turn Strategy Constraint)
最亮眼的工程学设计在 `opener` 函数里。作者为了杜绝大模型“读一个文件、写一个文件、思考一轮、再读下一个文件”的连环昂贵操作（这在消耗 API 调用量上是毁灭性的），直接在 Prompt 里强加上了**战术级指导**：
> _"You have a limited turn budget... the efficient strategy is: turn 1 — issue all Read calls in parallel for every file you might update; turn 2 — issue all Write/Edit calls in parallel. Do not interleave reads and writes across multiple turns."_

强迫它第一步一并读完，第二回合双重并发写完。这在提示工程中被称为“微观路由约束”。

### 2.2 去中心化探索的限制 (Anti-investigation Rules)
大模型具有天然的好奇心。当它发现某一行代码它不认识时，它有可能会自己去跑 `grep` 和 `cat` 去看源码。这个模块通过恐吓指令切断了它乱跑的欲望：
> _"You MUST only use content from the last ~X messages... Do not waste any turns attempting to investigate or verify that content further — no grepping source files... no git commands."_

这句话确保了记忆抽取绝对聚焦在“刚刚聊天发生的历史”上，把执行时间锁定在极端的短视效内，不仅省钱，而且防死锁。

### 2.3 两阶式索引系统 (Two-step Process & MEMORY.md)
大模型写文档会越写越长，如果把几万字的经历全写到一个文件头上，系统以后读这个文件负担极高。所以在此模块里建立了精妙的“图书馆借阅表”制度：
- **第一步 (Content Card)**：强制它把提取到的知识，生成一个独立主题的 `.md` 卡片（比如 `feedback_testing.md`），并且开头携带完整的 YAML Frontmatter 元数据。
- **第二步 (Index Update)**：要求它回头找到专门的 `MEMORY.md`（这相当于这个项目的大脑皮层索引），在里面追加一行不到 150 字的短链接：`- [Title](file.md) — one-line hook`。

这种设计使得下一次主对话启动时，底座只会加载这篇精简的 `MEMORY.md` 索引供它参考；当它通过索引判断它需要回忆那段复杂报错时，它才会去打开具体的 `feedback_testing.md`。这完美模拟了人类“目录检索 -> 翻开书找知识”的记忆法！

### 2.4 Team Memory 的架构兼容 (Shared Memory)
在 `buildExtractCombinedPrompt`（如果开通了团队共享配置），此提示词还会教导大模型如何“分家”。
> _"You MUST avoid saving sensitive data within shared team memories. For example, never save API keys or user credentials."_

它使得抽取模型在下达存储指令时，能够像人一样自动研判：“这段 Bug Fix 是我们公司的通用套路，我把它写给团队共享库；这封 API Key 只有当前我这个电脑有，我把它记入 Private 目录下”。

## 总结

这里我们看见了高级的 Prompt 工程应用：**不只是靠提示词来输出好文章，而是靠提示词来干涉并改造 Agent 的工具调用流 (Routing) 和底层数据存储拓扑结构 (Topology)。**
