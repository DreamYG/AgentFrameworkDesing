import type { ToolDefinition, ToolResult, ToolContext } from '@nexus/shared';
import { buildTool } from '../build-tool.js';

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
  private readonly tools = new Map<string, ToolDefinition>();

  constructor(serverUrl: string, name?: string) {
    this.serverUrl = serverUrl;
    this.name = name ?? `mcp-${serverUrl}`;
  }

  getServerUrl(): string {
    return this.serverUrl;
  }

  async discover(): Promise<readonly ToolDefinition[]> {
    return [...this.tools.values()];
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  async execute(toolName: string, params: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return { success: false, error: `MCP tool not found: ${toolName}`, durationMs: 0 };
    }
    const started = Date.now();
    const result = await tool.execute(params, ctx);
    return { ...result, durationMs: Date.now() - started };
  }

  async ping(): Promise<boolean> {
    return true;
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
  private readonly discovered = new Map<string, ToolDefinition>();

  constructor(baseUrl: string, name?: string) {
    this.baseUrl = baseUrl;
    this.name = name ?? `rest-${baseUrl}`;
  }

  getBaseUrl(): string {
    return this.baseUrl;
  }

  async discover(): Promise<readonly ToolDefinition[]> {
    return [...this.discovered.values()];
  }

  registerOpenApiOperation(operation: {
    readonly name: string;
    readonly method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    readonly path: string;
    readonly description?: string;
    readonly inputSchema?: Record<string, unknown>;
  }): void {
    const tool = buildTool({
      name: operation.name,
      description: operation.description ?? operation.name,
      schema: operation.inputSchema ?? { type: 'object' },
      riskLevel: operation.method === 'GET' ? 'R0' : 'R2',
      characteristics: {
        isReadOnly: operation.method === 'GET',
        isDestructive: operation.method === 'DELETE',
        isConcurrencySafe: operation.method === 'GET',
        isIdempotent: operation.method === 'GET' || operation.method === 'PUT',
        reversibility: operation.method === 'DELETE' ? 'unknown' : 'reversible',
        environmentSideEffects: operation.method === 'GET' ? ['none'] : ['external_system_state'],
        maxOutputTokens: 4096,
      },
      execute: async (params) => this.callOperation(operation, params),
    });
    this.discovered.set(tool.name, tool);
  }

  async execute(toolName: string, params: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.discovered.get(toolName);
    if (!tool) return { success: false, error: `REST tool not found: ${toolName}`, durationMs: 0 };
    return tool.execute(params, ctx);
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(this.baseUrl, { method: 'HEAD' });
      return res.ok || res.status < 500;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // cleanup
  }

  private async callOperation(
    operation: { method: string; path: string },
    params: unknown,
  ): Promise<ToolResult> {
    const started = Date.now();
    const url = new URL(operation.path, this.baseUrl);
    const init: RequestInit = { method: operation.method };
    if (operation.method !== 'GET') {
      init.headers = { 'content-type': 'application/json' };
      init.body = JSON.stringify(params ?? {});
    }
    const res = await fetch(url, init);
    const text = await res.text();
    return {
      success: res.ok,
      data: text ? JSON.parse(text) : undefined,
      error: res.ok ? undefined : text,
      durationMs: Date.now() - started,
    };
  }
}
