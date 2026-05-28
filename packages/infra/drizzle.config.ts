import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: [
    './src/database/schema/agent-registry.ts',
    './src/database/schema/agent-run.ts',
    './src/database/schema/audit.ts',
    './src/database/schema/approval.ts',
    './src/database/schema/phase-bridge.ts',
    './src/database/schema/pack.ts',
    './src/database/schema/connector.ts',
    './src/database/schema/memory.ts',
  ],
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgres://nexus:nexus@localhost:5432/nexus',
  },
});
