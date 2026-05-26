/**
 * MCP Server 模板 — 新建 MCP Server 的起点
 * 使用方式：npx create-nexus-mcp <name> 生成此模板
 */

export interface MCPToolDefinition {
  readonly name: string;
  readonly description: string;
  readonly inputSchema: Record<string, unknown>;
  readonly handler: (params: unknown) => Promise<unknown>;
}

export class MCPServerTemplate {
  private readonly tools: MCPToolDefinition[] = [];
  private readonly name: string;

  constructor(name: string) {
    this.name = name;
  }

  registerTool(tool: MCPToolDefinition): void {
    this.tools.push(tool);
  }

  getTools(): readonly MCPToolDefinition[] {
    return this.tools;
  }

  getName(): string {
    return this.name;
  }

  async start(_port?: number): Promise<void> {
    // MCP stdio/SSE transport setup goes here
  }
}
