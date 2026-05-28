import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export interface CreateMcpOptions {
  readonly name: string;
  readonly description?: string;
  readonly author?: string;
}

export interface GeneratedMcpFile {
  readonly path: string;
  readonly content: string;
}

/** MCP Server 脚手架生成器 */
export class CreateMcpScaffold {
  generate(options: CreateMcpOptions): readonly GeneratedMcpFile[] {
    const packageName = `@nexus/mcp-${options.name}`;
    return [
      {
        path: 'package.json',
        content: JSON.stringify({
          name: packageName,
          version: '0.0.1',
          type: 'module',
          scripts: { build: 'tsc', start: 'node dist/index.js' },
          dependencies: {},
          devDependencies: { typescript: '^5.5.0' },
        }, null, 2),
      },
      {
        path: 'manifest.yaml',
        content: [
          `id: ${options.name}`,
          `name: ${options.name}`,
          'version: 0.0.1',
          'level: 1',
          'type: connector',
          `description: ${options.description ?? `${options.name} MCP Server`}`,
          `author: ${options.author ?? 'Nexus'}`,
          'kernelCompatibility: ">=0.0.1"',
          'provisions: []',
          'requirements: []',
          'lifecycle: {}',
          'healthCheck: /health',
          '',
        ].join('\n'),
      },
      {
        path: 'src/index.ts',
        content: [
          "import { createServer } from 'node:http';",
          '',
          'export const tools = [',
          '  { name: "demo.echo", description: "Echo input", inputSchema: { type: "object", properties: { text: { type: "string" } }, required: ["text"] } },',
          '];',
          '',
          'const server = createServer((req, res) => {',
          "  res.setHeader('content-type', 'application/json');",
          "  if (req.method === 'GET' && req.url === '/health') return res.end(JSON.stringify({ healthy: true }));",
          "  if (req.method === 'GET' && req.url === '/tools') return res.end(JSON.stringify(tools));",
          "  if (req.method === 'POST' && req.url === '/tools/demo.echo/call') {",
          '    let body = "";',
          "    req.on('data', (chunk) => { body += chunk; });",
          "    req.on('end', () => {",
          '      const parsed = body ? JSON.parse(body) : { params: {} };',
          '      res.end(JSON.stringify({ success: true, data: parsed.params, durationMs: 0 }));',
          '    });',
          '    return;',
          '  }',
          '  res.statusCode = 404;',
          '  res.end(JSON.stringify({ error: "Not found" }));',
          '});',
          '',
          "server.listen(Number(process.env['PORT'] ?? 3100), () => console.error('MCP server listening'));",
          '',
        ].join('\n'),
      },
      {
        path: 'tests/smoke.test.ts',
        content: "import { describe, expect, it } from 'vitest';\nimport { tools } from '../src/index.js';\n\ndescribe('generated mcp server', () => {\n  it('declares demo tools', () => {\n    expect(tools.length).toBeGreaterThan(0);\n  });\n});\n",
      },
      {
        path: 'Dockerfile',
        content: 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN corepack enable && pnpm install && pnpm build\nCMD ["node", "dist/index.js"]\n',
      },
    ];
  }

  async writeFiles(targetDirectory: string, options: CreateMcpOptions): Promise<readonly string[]> {
    const files = this.generate(options);
    const written: string[] = [];
    for (const file of files) {
      const fullPath = join(targetDirectory, file.path);
      await mkdir(dirname(fullPath), { recursive: true });
      await writeFile(fullPath, file.content, 'utf8');
      written.push(fullPath);
    }
    return written;
  }
}
