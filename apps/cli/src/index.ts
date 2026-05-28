#!/usr/bin/env node
import { Command } from 'commander';
import { SkillStore } from '@nexus/memory';
import { CreateMcpScaffold } from '@nexus/infra';

const program = new Command();
const store = new SkillStore(process.env['NEXUS_SKILL_DIR'] ?? '.nexus/skills');

program.name('nexus').description('Nexus CLI').version('0.0.1');

program
  .command('skill:create')
  .requiredOption('--id <id>')
  .requiredOption('--title <title>')
  .requiredOption('--content <content>')
  .option('--tags <tags>', 'comma-separated tags', '')
  .option('--evidence <ids>', 'comma-separated evidence ids', '')
  .option('--classification <classification>', 'data classification', 'internal')
  .action(async (opts: { id: string; title: string; content: string; tags: string; evidence: string; classification: string }) => {
    await store.load();
    const skill = {
      id: opts.id,
      title: opts.title,
      content: opts.content,
      l0Summary: opts.content.slice(0, 80),
      tags: opts.tags ? opts.tags.split(',') : [],
      evidenceIds: opts.evidence ? opts.evidence.split(',') : [],
      dataClassification: opts.classification as 'public' | 'internal' | 'confidential' | 'top_secret',
      version: 1,
      status: 'draft' as const,
      createdAt: new Date(),
    };
    const validation = store.validate(skill);
    if (!validation.valid) {
      process.stderr.write(`Skill invalid: ${validation.errors.join('; ')}\n`);
      process.exitCode = 1;
      return;
    }
    await store.add(skill);
    process.stdout.write(`Skill created: ${opts.id}\n`);
  });

program
  .command('skill:validate')
  .requiredOption('--id <id>')
  .action(async (opts: { id: string }) => {
    await store.load();
    const skill = store.get(opts.id);
    if (!skill) {
      process.stderr.write(`Skill not found: ${opts.id}\n`);
      process.exitCode = 1;
      return;
    }
    const validation = store.validate(skill);
    if (!validation.valid) {
      process.stderr.write(`Skill invalid: ${validation.errors.join('; ')}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`Skill valid: ${skill.id}\n`);
  });

program
  .command('skill:publish')
  .requiredOption('--id <id>')
  .action(async (opts: { id: string }) => {
    await store.load();
    try {
      const skill = await store.publish(opts.id);
      process.stdout.write(`Skill published: ${skill.id}@${skill.version}\n`);
    } catch {
      process.stderr.write(`Skill not found: ${opts.id}\n`);
      process.exitCode = 1;
    }
  });

program
  .command('skill:version')
  .requiredOption('--id <id>')
  .action(async (opts: { id: string }) => {
    await store.load();
    const skill = store.get(opts.id);
    process.stdout.write(JSON.stringify({ id: opts.id, version: skill?.version, status: skill?.status }) + '\n');
  });

program
  .command('skill:rollback')
  .requiredOption('--id <id>')
  .requiredOption('--version <version>')
  .action(async (opts: { id: string; version: string }) => {
    await store.load();
    const skill = await store.rollback(opts.id, Number(opts.version));
    process.stdout.write(`Skill rolled back: ${skill.id}@${skill.version}\n`);
  });

program
  .command('skill:test')
  .requiredOption('--id <id>')
  .action(async (opts: { id: string }) => {
    await store.load();
    const skill = store.get(opts.id);
    if (!skill) {
      process.stderr.write(`Skill not found: ${opts.id}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(JSON.stringify({ id: skill.id, ok: true, summary: skill.l0Summary }) + '\n');
  });

program
  .command('run:submit')
  .requiredOption('--message <message>')
  .option('--tenant <tenant>', 'tenant id', 'default')
  .option('--user <user>', 'user id', 'cli-user')
  .option('--gateway <url>', 'gateway base url', 'http://localhost:3000')
  .action(async (opts: { message: string; tenant: string; user: string; gateway: string }) => {
    const response = await postJson(`${opts.gateway}/api/v1/messages`, {
      content: opts.message,
      tenantId: opts.tenant,
      userId: opts.user,
      channel: 'cli',
    });
    process.stdout.write(JSON.stringify(response) + '\n');
  });

program
  .command('run:status')
  .requiredOption('--run <runId>')
  .option('--gateway <url>', 'gateway base url', 'http://localhost:3000')
  .action(async (opts: { run: string; gateway: string }) => {
    process.stdout.write(JSON.stringify(await getJson(`${opts.gateway}/api/v1/runs/${opts.run}`)) + '\n');
  });

program
  .command('run:approve')
  .requiredOption('--run <runId>')
  .option('--approver <approver>', 'approver id', 'admin')
  .option('--deny', 'deny instead of approve', false)
  .option('--gateway <url>', 'gateway base url', 'http://localhost:3000')
  .action(async (opts: { run: string; approver: string; deny: boolean; gateway: string }) => {
    const response = await postJson(`${opts.gateway}/api/v1/runs/${opts.run}/approve`, {
      approved: !opts.deny,
      approver: opts.approver,
    });
    process.stdout.write(JSON.stringify(response) + '\n');
  });

program
  .command('run:cancel')
  .requiredOption('--run <runId>')
  .option('--reason <reason>', 'cancel reason', 'cli_cancel')
  .option('--gateway <url>', 'gateway base url', 'http://localhost:3000')
  .action(async (opts: { run: string; reason: string; gateway: string }) => {
    process.stdout.write(JSON.stringify(await postJson(`${opts.gateway}/api/v1/runs/${opts.run}/cancel`, { reason: opts.reason })) + '\n');
  });

program
  .command('run:resume')
  .requiredOption('--run <runId>')
  .option('--gateway <url>', 'gateway base url', 'http://localhost:3000')
  .action(async (opts: { run: string; gateway: string }) => {
    process.stdout.write(JSON.stringify(await postJson(`${opts.gateway}/api/v1/runs/${opts.run}/resume`, {})) + '\n');
  });

program
  .command('mcp:create')
  .requiredOption('--name <name>')
  .option('--dir <dir>', 'target directory', 'mcp-servers')
  .option('--description <description>', 'description')
  .action(async (opts: { name: string; dir: string; description?: string }) => {
    const scaffold = new CreateMcpScaffold();
    const target = `${opts.dir.replace(/[\\/]$/, '')}/${opts.name}`;
    const files = await scaffold.writeFiles(target, {
      name: opts.name,
      description: opts.description,
      author: 'Nexus',
    });
    process.stdout.write(JSON.stringify({ created: target, files }) + '\n');
  });

program.parse();

async function getJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  return response.json();
}

async function postJson(url: string, body: unknown): Promise<unknown> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}
