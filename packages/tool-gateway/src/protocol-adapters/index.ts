import type { ToolDefinition, ToolResult, ToolContext } from '@nexus/shared';

/**
 * IToolProtocolAdapter — 协议适配器端口
 * 将 MCP/REST/gRPC/GraphQL 统一为内部工具调用契约
 * @stability S1
 */
export type ToolProtocol = 'mcp' | 'rest' | 'graphql' | 'grpc' | 'websocket' | 'shell';

export interface IToolProtocolAdapter {
  readonly name: string;
  readonly protocol: ToolProtocol;
  discover(): Promise<readonly ToolDefinition[]>;
  execute(toolName: string, params: unknown, ctx: ToolContext): Promise<ToolResult>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

/**
 * MCP Protocol Adapter（骨架）
 * 实际 MCP SDK 连接在 W9-W10 完善
 */
export class MCPAdapter implements IToolProtocolAdapter {
  readonly name: string;
  readonly protocol: ToolProtocol = 'mcp';
  private readonly serverUrl: string;

  constructor(serverUrl: string, name?: string) {
    this.serverUrl = serverUrl;
    this.name = name ?? `mcp-${serverUrl}`;
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  async discover(): Promise<readonly ToolDefinition[]> {
    return [];
  }

  async execute(_toolName: string, _params: unknown, _ctx: ToolContext): Promise<ToolResult> {
    return { success: false, error: 'MCP adapter not yet connected', durationMs: 0 };
  }

  async ping(): Promise<boolean> {
    return false;
  }

  async close(): Promise<void> {
    // cleanup
  }
}

/**
 * REST/OpenAPI Protocol Adapter（骨架）
 */
export class RESTAdapter implements IToolProtocolAdapter {
  readonly name: string;
  readonly protocol: ToolProtocol = 'rest';
  private readonly baseUrl: string;

  constructor(baseUrl: string, name?: string) {
    this.baseUrl = baseUrl;
    this.name = name ?? `rest-${baseUrl}`;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async discover(): Promise<readonly ToolDefinition[]> {
    return [];
  }

  async execute(_toolName: string, _params: unknown, _ctx: ToolContext): Promise<ToolResult> {
    return { success: false, error: 'REST adapter not yet connected', durationMs: 0 };
  }

  async ping(): Promise<boolean> {
    return false;
  }

  async close(): Promise<void> {
    // cleanup
  }
}
