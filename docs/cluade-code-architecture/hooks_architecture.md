# Hooks 系统与 settings.json 自动化行为架构分析

## 1. 核心概述
Hooks 系统是 Claude Code 在运行过程中提供的一套生命周期和拦截器机制，它允许应用与用户空间工作流深度整合。当特定的操作或状态变更发生时，Hooks 会被触发。这些自动化行为大多通过工程中的 `settings.json` 进行配置与控制。

## 2. settings.json 联动执行逻辑
通过核心配置（如局部项目的 `.claude.json` 或全局 `settings.json`），系统会动态读取其中的 Hooks 字段：
- **配置文件监控更新：** 涉及 `applySettingsChange.ts`、`changeDetector.ts` 和 `settingsCache.ts` 等机制。
- **自定义脚本映射：** 在配置中定义的命令会被解析包装为可以在子进程执行的系统命令，与具体的工作区关联。

## 3. 已知 Hook 注入点位
基于代码库结构，通常会存在以下两类 Hooks：
- **生命周期层面 Hooks：** 可能包括命令前后的触发点（`pre-command` / `post-command`）或文件状态变更（如 `sessionFileAccessHooks.ts` 负责代理监听并触发文件访问挂载的特殊动作）。
- **进程/终端环境 Hooks：** `sessionEnvironment.ts`、`subprocessEnv.ts` 中的预处理挂载逻辑。

## 4. 深度代码逆向思路 (TODO)
- [ ] 详细追溯 `src/utils/settings/` 中的 `settingsCache.ts` 如何完成对 `settings.json` 中 `hooks` 定义的加载和生命周期校验。
- [ ] 探寻代码中对 Hook 回调函数的调度方式（是同步阻塞式还是异步并发式执行）。
- [ ] 记录发生 Hook 故障时的容错和安全处理机制（如死循环保护、超时保护）。

---
> ⚠️ **提示**：随后续研究逆向补充更多代码级实现细节，包括相关 Types 定义与调用栈梳理。
