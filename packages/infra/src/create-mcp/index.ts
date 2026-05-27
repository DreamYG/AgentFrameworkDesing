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
        content: `export const tools = [];\n`,
      },
      {
        path: 'Dockerfile',
        content: 'FROM node:22-alpine\nWORKDIR /app\nCOPY . .\nRUN corepack enable && pnpm install && pnpm build\nCMD ["node", "dist/index.js"]\n',
      },
    ];
  }
}
