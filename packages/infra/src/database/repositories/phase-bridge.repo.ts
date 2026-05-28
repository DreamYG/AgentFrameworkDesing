import type { NexusDatabase } from '../client.js';
import { phaseBridgeEvents } from '../schema/phase-bridge.js';

/**
 * Phase Bridge 事件存档仓储：idempotencyKey 防重，append-only。
 * @stability S2
 */
export class PhaseBridgeEventsRepository {
  constructor(private readonly db: NexusDatabase) {}

  async append(event: {
    id: string;
    tenantId: string;
    source: string;
    target?: string;
    type: string;
    payload: unknown;
    correlationId: string;
    causationId: string;
    idempotencyKey: string;
    schemaVersion: string;
    actor: unknown;
    dataClassification: string;
  }): Promise<void> {
    await this.db.insert(phaseBridgeEvents).values(event).onConflictDoNothing();
  }
}
