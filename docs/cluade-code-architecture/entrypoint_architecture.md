# CLI 入口到 QueryEngine 的完整引导链

## 1. 核心概述
这是 Claude Code 的系统“唤醒序列”。本篇文档梳理从用户在终端敲下 `claude` 乃至携带各种附带参数开始，一直到它成功构造好世界上下文、启动 React/Ink TUI 界面，并将控制权交接给 `QueryEngine`（开启大语言模型推理循环）的过程。

## 2. Phase 1: CLI 解析与系统检查 (Bootstrapping)
这是在控制权交给业务逻辑前必须要完成的前置系统操作：
- **入口程序起航：** 通常位于 `src/index.ts` 或 `src/cli.ts` 结合 `commander`, `yargs` 等轻量级命令行解析器，生成执行命令的 Options。
- **探针检查与合规验证 (`preflightChecks.tsx`)**：
  验证系统环境（Node.js 版本）、执行权限、更新检测。
- **终端 UI 宿主准备：** 初始化 React Ink 或者其他终端渲染工具结构准备处理标准输出（Stdout）与错误重定向。

## 3. Phase 2: 上下文装配与内存读取 (Assemble Context)
当验证通过后，程序必须构建给 `QueryEngine` 的世界状态：
- **CWD 与工作区感知：** 分析当前位于什么语言环境下（`workloadContext.ts`, `worktree.ts`）。
- **用户档案与 Settings：** 挂载刚才解析的参数、本地缓存设置（`settings/settingsCache.ts` 甚至 `sessionEnvironment.ts`）。
- **Session 恢复与鉴权加载：** 读取历史 Memory，初始化 Auth 令牌和计费网络通道。

## 4. Phase 3: TUI 渲染与事件调度 (Handover)
- **输入流接管 (`processUserInput.ts`)：** 接收用户的主动发言或者 Slash Command（`/bug`, `/clear`等）。
- **引擎唤醒：** 将上述拼装好的 Tools、系统 Prompt、用户第一次查询语句打包，正式派送给并实例化 `QueryEngine` 引擎进行循环流转。此时底层转入我们在 `QueryEngine_architecture.md` 中讲述的逻辑。

## 5. 深度代码逆向思路 (TODO)
- [ ] 详细梳理 `src/cli.ts` (或同级入口) 到 `runApp()` 的同步和异步挂载顺序及依赖。
- [ ] 探索 `utils/startupProfiler.ts` 等追踪开机速度的相关机制。
- [ ] CLI 带参命令的解析是如何在内部覆写默认 Context Profile 的（如 `--model` 替换，`-p` 工具载入等）。

---
> ⚠️ **提示**：随后续研究逆向补充更多代码级实现细节，包括相关 Types 定义与调用栈梳理。
