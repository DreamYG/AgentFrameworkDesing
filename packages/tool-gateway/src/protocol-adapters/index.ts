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
    const res = await fetch(new URL('/tools', this.serverUrl));
    if (!res.ok) return [...this.tools.values()];
    const remoteTools = await res.json() as Array<{
      name: string;
      description: string;
      inputSchema?: Record<string, unknown>;
      schema?: Record<string, unknown>;
      riskLevel?: ToolDefinition['riskLevel'];
    }>;
    this.tools.clear();
    for (const remote of remoteTools) {
      const tool = buildTool({
        name: remote.name,
        description: remote.description,
        schema: remote.inputSchema ?? remote.schema ?? { type: 'object' },
        riskLevel: remote.riskLevel ?? 'R2',
        characteristics: {
          isReadOnly: remote.riskLevel === 'R0',
          isDestructive: false,
          isConcurrencySafe: remote.riskLevel === 'R0',
          isIdempotent: remote.riskLevel === 'R0',
          reversibility: 'reversible',
          environmentSideEffects: remote.riskLevel === 'R0' ? ['none'] : ['external_system_state'],
          maxOutputTokens: 4096,
        },
        execute: (params, ctx) => this.callRemote(remote.name, params, ctx),
      });
      this.tools.set(tool.name, tool);
    }
    return [...this.tools.values()];
  }

  registerTool(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  async execute(toolName: string, params: unknown, ctx: ToolContext): Promise<ToolResult> {
    return this.callRemote(toolName, params, ctx);
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(new URL('/health', this.serverUrl), { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    // cleanup
  }

  private async callRemote(toolName: string, params: unknown, ctx: ToolContext): Promise<ToolResult> {
    const started = Date.now();
    try {
      const res = await fetch(new URL(`/tools/${encodeURIComponent(toolName)}/call`, this.serverUrl), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ params, context: { runId: ctx.runId, tenantId: ctx.tenantId, agentId: ctx.agentId, turnIndex: ctx.turnIndex } }),
        signal: ctx.abortSignal,
      });
      const body = await res.json() as ToolResult;
      return { ...body, durationMs: Date.now() - started };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error), durationMs: Date.now() - started };
    }
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
