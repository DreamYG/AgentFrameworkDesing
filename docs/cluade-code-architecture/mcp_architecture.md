# MCP 协议集成与外部工具扩展架构

## 1. 核心概述
MCP (Model Context Protocol, 模型上下文协议) 标准是 Claude 赋予应用外部扩展性（能力扩展和知识源接驳）的基石。在 Claude Code 中，对 MCP 协议的完美集成使得这个 CLI 可以随意挂接外部能力服务器（MCP Server），并映射成为内置可调用的 Tool。

## 2. 系统中的 MCP 组成与生命周期
MCP 扩展模块从发现到调用主要包含以下部分：
- **服务端发现与握手：**
  系统需要维护活跃的 MCP Server 进程或网络连接（通常有 STDIO 连接与 HTTP SSE 两种方式，CLI 端多以后台 Node 进程 `stdio` 通信为主）。会通过 `initialize` 消息获取 `capabilities`。
- **工具映射层的转化：**
  客户端从服务端的 `tools/list` 收到的 JSON Schema 结构，将被解包并桥接到 Claude Code 原生的 `Tool_architecture.md` 中定义的工具分发系统中。
- **上下文获取能力：** 
  除了 Tools（主动操作），MCP 集成还包含 Prompts 聚合以及 Resources（被动数据读取）。

## 3. MCP 生命周期与容错结构
- **连接管理：** 如何确保长期挂机的 MCP 子进程不僵死，如何处理退出和重启重连。
- **JSON-RPC 通信承载：** 基于长连接的 RPC RequestID 流水线管理机制。如果某一个扩展工具超时未返回，引擎不应该卡死整个主事件队列。

## 4. 深度代码逆向思路 (TODO)
- [ ] 找到处理 MCP Client 建立与路由的核心代码包（例如 `src/utils/mcp` 或相似目录）。
- [ ] 跟入 `Model Context Protocol` 发送 `callTool` 请求时的出参和入参映射逻辑。
- [ ] 查看如何读取并在 UI 渲染 MCP Server 的注册状态（连接状态气泡提示、日志输出）。

---
> ⚠️ **提示**：随后续研究逆向补充更多代码级实现细节，包括相关 Types 定义与调用栈梳理。
