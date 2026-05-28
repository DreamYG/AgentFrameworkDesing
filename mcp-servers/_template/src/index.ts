import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

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
    const port = _port ?? Number(process.env['PORT'] ?? 3100);
    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      res.setHeader('content-type', 'application/json');
      if (req.method === 'GET' && req.url === '/health') {
        res.end(JSON.stringify({ healthy: true, name: this.name }));
        return;
      }
      if (req.method === 'GET' && req.url === '/tools') {
        res.end(JSON.stringify(this.tools.map(({ handler: _handler, ...tool }) => tool)));
        return;
      }
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'Not found' }));
    });
    await new Promise<void>((resolve) => server.listen(port, resolve));
  }
}
