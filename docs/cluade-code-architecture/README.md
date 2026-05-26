# Claude Code Architecture Instruction

非官方的 Claude Code 架构学习仓库，聚焦运行时宿主（Harness）、上下文压缩、QueryEngine、工具系统、权限控制、会话记忆与端到端工作流等关键模块。

This is an unofficial study repository that documents the architecture and runtime workflow of Claude Code in Markdown and Obsidian Canvas format.

## 仓库内容

- `compact_architecture.md`
  解析 `compact` 相关模块的三级上下文防爆策略。
- `end_to_end_workflow.md`
  从用户输入到后台记忆落盘，串起完整生命周期。
- `harness_engine_architecture.md`
  从宿主工程视角解释 Claude Code 的运行时底盘。
- `entrypoint_architecture.md`
  说明 CLI 入口与命令分发。
- `QueryEngine_architecture.md`
  说明 QueryEngine 的职责与状态流转。
- `query_architecture.md`
  解析主推理循环与工具调用编排。
- `Tool_architecture.md`
  解析工具系统、权限拦截与执行沙盒。
- `permissions_architecture.md`
  关注危险操作的安全边界设计。
- `hooks_architecture.md`
  说明 Hook 机制与扩展触发点。
- `mcp_architecture.md`
  说明 MCP 作为外部能力接入层的定位。
- `sessionMemory_architecture.md`
  说明会话级记忆的提取与复用。
- `extractMemories_architecture.md`
  说明跨会话长期记忆的沉淀方式。
- `extractMemories_prompts_architecture.md`
  拆解记忆提取提示词设计。
- `prompts_architecture.md`
  聚焦系统提示词与上下文组织方式。
- `context_architecture.md`
  说明环境感知、Git 状态注入与系统上下文构建。
- `Claude-Code-Architecture.canvas`
  Claude Code 架构总览白板。
- `Harness-Engineering-Architecture.canvas`
  Harness 宿主工程全景白板。

## 适合谁看

- 想理解 Claude Code 为什么能“像 Agent 一样工作”的开发者
- 想学习工具调用、权限控制、上下文压缩与记忆系统设计的人
- 想把 Claude Code 的工程思路迁移到自己项目中的 AI 工程师

## 如何阅读

1. 从 `end_to_end_workflow.md` 开始，先建立全局流程图。
2. 再阅读 `harness_engine_architecture.md` 与 `compact_architecture.md`，抓住主干。
3. 最后按模块深入 `query`、`Tool`、`memory`、`permissions` 等专题文档。

如果你使用 Obsidian，可以直接打开本仓库并查看两个 `.canvas` 文件，它们适合做整体导览。

## 仓库定位

- 这是一个非官方学习型仓库，不代表 Anthropic 官方立场。
- 内容以架构理解、工作流拆解和工程设计观察为主。
- 如果你发现表述不准确，欢迎提 Issue 或 PR 一起完善。

## 许可证

本仓库当前采用 `CC BY 4.0`，允许转载、改编与再发布，但需保留署名。
