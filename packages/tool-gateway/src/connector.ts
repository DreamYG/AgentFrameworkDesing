export interface ConnectorDefinition {
  readonly id: string;
  readonly name: string;
  readonly platform: string;
  readonly protocol: 'mcp' | 'rest' | 'graphql' | 'grpc' | 'websocket';
  readonly endpoint: string;
  readonly authMethod: 'none' | 'bearer' | 'basic' | 'oauth2' | 'secret_ref';
  readonly secretRef?: string;
  readonly capabilities: readonly string[];
  readonly rateLimits?: {
    readonly requestsPerMinute: number;
    readonly burst?: number;
  };
  readonly dataClassification: 'public' | 'internal' | 'confidential' | 'top_secret';
  readonly enabled: boolean;
}

export class ConnectorRegistry {
  private readonly connectors = new Map<string, ConnectorDefinition>();

  register(connector: ConnectorDefinition): void {
    this.connectors.set(connector.id, connector);
  }

  enable(id: string): void {
    const connector = this.requireConnector(id);
    this.connectors.set(id, { ...connector, enabled: true });
  }

  disable(id: string): void {
    const connector = this.requireConnector(id);
    this.connectors.set(id, { ...connector, enabled: false });
  }

  bindCredential(id: string, secretRef: string): void {
    const connector = this.requireConnector(id);
    this.connectors.set(id, { ...connector, authMethod: 'secret_ref', secretRef });
  }

  get(id: string): ConnectorDefinition | undefined {
    return this.connectors.get(id);
  }

  list(): readonly ConnectorDefinition[] {
    return [...this.connectors.values()];
  }

  async healthCheck(id: string): Promise<{ healthy: boolean; message?: string }> {
    const connector = this.requireConnector(id);
    try {
      const res = await fetch(connector.endpoint, { method: 'HEAD' });
      return { healthy: res.status < 500, message: String(res.status) };
    } catch (error) {
      return { healthy: false, message: error instanceof Error ? error.message : String(error) };
    }
  }

  private requireConnector(id: string): ConnectorDefinition {
    const connector = this.connectors.get(id);
    if (!connector) throw new Error(`Connector not found: ${id}`);
    return connector;
  }
}
