import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema.js';

export type NexusDatabase = ReturnType<typeof createDatabase>;

/** 创建 Drizzle PostgreSQL 客户端 */
export function createDatabase(databaseUrl: string) {
  const client = postgres(databaseUrl, { prepare: false });
  return drizzle(client, { schema });
}
