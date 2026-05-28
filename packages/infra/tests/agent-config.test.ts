import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { loadAgentRuntimeConfigs } from '../src/agent-config/index.js';

describe('loadAgentRuntimeConfigs', () => {
  it('merges defaults, YAML overrides and ENV overrides with ENV winning', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nexus-agent-cfg-'));
    const configPath = join(dir, 'agents.yaml');
    await writeFile(configPath, [
      'defaultModel: claude-sonnet-4-5',
      'agents:',
      '  requirement-analyst:',
      '    provider: anthropic',
      '    model: claude-sonnet-4-5',
      '  task-planner:',
      '    provider: openai',
      '    model: gpt-4o',
      '',
    ].join('\n'), 'utf8');

    try {
      const resolution = loadAgentRuntimeConfigs({
        env: {
          NEXUS_AGENT_TASK_PLANNER_MODEL: 'gpt-4o-mini',
          NEXUS_AGENT_TASK_PLANNER_TEMPERATURE: '0.3',
          NEXUS_DEFAULT_MODEL: 'claude-sonnet-final',
        },
        configPath,
        defaults: {
          'requirement-analyst': { provider: 'local', model: 'local-mvp' },
          'task-planner': { provider: 'local', model: 'local-mvp' },
          'reminder': { provider: 'local', model: 'local-mvp' },
        },
      });

      expect(resolution.defaultModel).toBe('claude-sonnet-final');
      expect(resolution.agents['requirement-analyst']).toEqual({ provider: 'anthropic', model: 'claude-sonnet-4-5' });
      expect(resolution.agents['task-planner']).toMatchObject({ provider: 'openai', model: 'gpt-4o-mini', temperature: 0.3 });
      expect(resolution.agents['reminder']).toEqual({ provider: 'local', model: 'local-mvp' });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('falls back to defaults when no YAML or ENV provided', () => {
    const resolution = loadAgentRuntimeConfigs({
      env: {},
      defaults: { 'demo': { provider: 'local', model: 'local-mvp' } },
      defaultModel: 'local-mvp',
    });
    expect(resolution.defaultModel).toBe('local-mvp');
    expect(resolution.agents['demo']).toEqual({ provider: 'local', model: 'local-mvp' });
  });
});
