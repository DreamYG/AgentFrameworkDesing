# `src/context.ts` 代码逻辑与架构解析

`src/context.ts` 文件行数不多（约 200 行），但它是大模型建立**“世界观”和“自我意识”**的关键数据源。
如果在前面的解析中，`query.ts` 是神经循环，`QueryEngine.ts` 是底座，那么 `context.ts` 就是让这个智能体知道**“现在是几点？这是谁的项目？有没有我必须背下来的本地规矩？”**的潜意识注射站。

---

## 1. 核心职责

该模块提供了三个核心的方法工厂，所有的环境包裹数据都会被缓存（并使用了 `lodash` 的 `memoize` 防止在单次会话循环中被反复触发扫描）：
- 检查当前工程架构的 Git 状态。
- 获取或构建系统的动态上下文（System Context）。
- 获取用户的业务级约束偏好与时间基准（User Context）。

---

## 2. 核心架构与方法拆解

### 2.1 Git 环境态感知 (`getGitStatus`)
这是一个自动嗅探当前工作区源码版本管理状态的工作流：
- **并发探查**: 一次并发执行四个命令：获取当前分支、获取主分支、获取精粹版 `git status --short` 以及最近5条记录的 `git log...`、获取当下的 Git 用户名（`git config user.name`）。
- **抗爆防刷屏机制**: 返回巨大的 Git 变更树会把模型的上下文严重污染。系统在此设定了 `MAX_STATUS_CHARS = 2000`。一旦超出 2000 字符，强制截断并附加上一句话：_"...(truncated because it exceeds 2k characters. If you need more information, run 'git status' using BashTool)"_ —— 即强迫 AI 在真的需要读全貌时，自己长出对应的“手”去调 bash 工具。
- **固化提示词**: 开场白强制加上：_“Note that this status is a snapshot in time...”_ (这是初始快照，聊天期间它不会更新)。

### 2.2 隐藏命令与系统环境组合 (`getSystemContext`)
此方法目前组装的内容包括两部分：
- 挂载上述读取到的 Git 环境感知图。
- **动态缓存击穿注入 (`cacheBreaker`)**: 对于 Claude 内部员工/调试场景（`ant-only` 且配置了 `BREAK_CACHE_COMMAND`）。通过植入一段毫无规律的魔法字符串，使得 API 服务端的 Prompt Cache 失效，强迫大模型重新完整过一遍上下文。

### 2.3 物理规则与日期 (`getUserContext`)
这是对会话最有决定性影响的注入段：
- **`CLAUDE.md` 知识库挂载**: 它调用了 `getClaudeMds(...)` 会触发系统的遍历，找到工程里的 `CLAUDE.md` 或相关的 Memory 文件并将其作为第一优先级准则挂进上下文中。
- **缓存隔离反环策略**: 为了避免鉴权系统（判断 AI 自动命令时候是不是违规了）和这个文件形成循环依赖（`filesystem` -> `permissions` -> `yoloClassifier` -> `claudemd`），这步抓取后的 Memory 字符串会被显卡级地压进内存全局缓存（`setCachedClaudeMdContent`）。
- **时间锚点校准**: 注入魔法句 `Today's date is <当前日期>`。让 LLM 明白今天是何时，防止幻觉引发的时间穿越。

---

## 3. 设计亮点与延伸启示

通过这个精简的文件，我们可以学到一种很高级的 Agent工程 **"冷启动注射" (Cold-start Injection)** 技巧：

1. **你不需要把所有的工具都交给模型，而是把环境“喂”给模型**：系统并没有专门做一个 `GetGitStatusTool` 让 AI 第一步总是去调用。而是选择在一开始悄悄运行后垫在系统提示词下面，极大地节省了开局第一个 RoundTrip（往返请求）的耗时。
2. **永远不要信任外界的信息长度**：即便只是短短一个 `git status` 也有可能因为前端装了一个巨大的 vendor 依赖且忘了配 `.gitignore` 而导致十几万字。防御性编程（`substring` 并让 AI 主动去挖坑）是保证底层 Agent 不崩溃的安全底线。
