import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { CreateMcpScaffold } from '../src/index.js';

describe('CreateMcpScaffold', () => {
  it('writes a runnable MCP server scaffold', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nexus-mcp-'));
    try {
      const scaffold = new CreateMcpScaffold();
      const files = await scaffold.writeFiles(dir, { name: 'demo-system' });
      expect(files.length).toBeGreaterThan(0);
      const manifest = await readFile(join(dir, 'manifest.yaml'), 'utf8');
      expect(manifest).toContain('demo-system');
      const source = await readFile(join(dir, 'src/index.ts'), 'utf8');
      expect(source).toContain('/health');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
