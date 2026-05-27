declare module '@nexus/mcp-pm-tools' {
  export interface PMTool {
    readonly name: string;
    readonly description: string;
    readonly riskLevel: string;
    readonly inputSchema: Record<string, unknown>;
  }

  export const PM_TOOLS: readonly PMTool[];
  export const PM_TOOL_HANDLERS: Record<string, (params: Record<string, unknown>) => unknown>;
}
