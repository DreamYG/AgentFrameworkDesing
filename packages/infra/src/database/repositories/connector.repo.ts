import { eq } from 'drizzle-orm';
import type { NexusDatabase } from '../client.js';
import { connectors } from '../schema/connector.js';

/**
 * 外部连接器配置仓储。
 * @stability S2
 */
export class ConnectorsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async upsert(connector: {
    id: string;
    tenantId: string;
    name: string;
    platform: string;
    protocol: string;
    endpoint: string;
    authMethod: string;
    secretRef?: string;
    capabilities: readonly string[];
    dataClassification: string;
    enabled: boolean;
  }): Promise<void> {
    await this.db.insert(connectors).values({
      ...connector,
      capabilities: [...connector.capabilities],
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: connectors.id,
      set: {
        endpoint: connector.endpoint,
        secretRef: connector.secretRef,
        enabled: connector.enabled,
        updatedAt: new Date(),
      },
    });
  }

  async list(tenantId: string) {
    return this.db.select().from(connectors).where(eq(connectors.tenantId, tenantId));
  }
}
