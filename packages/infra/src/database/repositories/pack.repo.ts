import { eq } from 'drizzle-orm';
import type { NexusDatabase } from '../client.js';
import { installedPacks } from '../schema/pack.js';

/**
 * 已安装能力包仓储：含 install / upsert / list 操作。
 * @stability S2
 */
export class InstalledPacksRepository {
  constructor(private readonly db: NexusDatabase) {}

  async upsert(pack: {
    id: string;
    tenantId: string;
    name: string;
    version: string;
    status: string;
    manifest: Record<string, unknown>;
    enabledAt?: Date;
  }): Promise<void> {
    await this.db.insert(installedPacks).values({
      ...pack,
      updatedAt: new Date(),
    }).onConflictDoUpdate({
      target: installedPacks.id,
      set: {
        status: pack.status,
        manifest: pack.manifest,
        enabledAt: pack.enabledAt,
        updatedAt: new Date(),
      },
    });
  }

  async list(tenantId: string) {
    return this.db.select().from(installedPacks).where(eq(installedPacks.tenantId, tenantId));
  }
}
