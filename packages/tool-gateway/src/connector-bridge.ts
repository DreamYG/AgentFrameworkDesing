import { MCPAdapter, RESTAdapter, type IToolProtocolAdapter } from './protocol-adapters/index.js';
import { ToolGatewayPipeline } from './pipeline.js';
import type { ConnectorDefinition } from './connector.js';

export class ConnectorToolBridge {
  private readonly adapters = new Map<string, IToolProtocolAdapter>();
  private readonly registeredTools = new Map<string, readonly string[]>();

  constructor(private readonly pipeline: ToolGatewayPipeline) {}

  async enable(connector: ConnectorDefinition): Promise<readonly string[]> {
    const adapter = this.createAdapter(connector);
    const healthy = await adapter.ping();
    if (!healthy) throw new Error(`Connector unhealthy: ${connector.id}`);
    const tools = await adapter.discover();
    for (const tool of tools) this.pipeline.registerTool(tool);
    this.adapters.set(connector.id, adapter);
    this.registeredTools.set(connector.id, tools.map((tool) => tool.name));
    return tools.map((tool) => tool.name);
  }

  async disable(connectorId: string): Promise<void> {
    const toolNames = this.registeredTools.get(connectorId) ?? [];
    for (const name of toolNames) this.pipeline.unregisterTool(name);
    await this.adapters.get(connectorId)?.close();
    this.adapters.delete(connectorId);
    this.registeredTools.delete(connectorId);
  }

  private createAdapter(connector: ConnectorDefinition): IToolProtocolAdapter {
    if (connector.protocol === 'mcp') return new MCPAdapter(connector.endpoint, connector.name);
    if (connector.protocol === 'rest') return new RESTAdapter(connector.endpoint, connector.name);
    throw new Error(`Unsupported connector protocol: ${connector.protocol}`);
  }
}
