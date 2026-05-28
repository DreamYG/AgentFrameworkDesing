import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import postgres from 'postgres';
import * as schema from './schema/index.js';

export type NexusDatabase = ReturnType<typeof createDatabase>;

/** 创建 Drizzle PostgreSQL 客户端 */
export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, { prepare: false });
  return drizzle(client, { schema });
}

/**
 * 启动时自动应用 SQL migrations。
 * 默认从 `<infra-package>/drizzle/` 加载（CI 生成、镜像复制）。
 * @stability S2
 */
export async function runMigrations(
  db: NexusDatabase,
  options?: { migrationsFolder?: string },
): Promise<void> {
  const folder = options?.migrationsFolder ?? defaultMigrationsFolder();
  await migrate(db, { migrationsFolder: folder });
}

/** 健康检查：执行 SELECT 1，连接异常时抛错 */
export async function pingDatabase(db: NexusDatabase): Promise<void> {
  await db.execute(sql`SELECT 1`);
}

function defaultMigrationsFolder(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // 编译产物 dist/database -> ../../drizzle；源码 src/database -> ../../drizzle
  return resolve(here, '../../drizzle');
}
