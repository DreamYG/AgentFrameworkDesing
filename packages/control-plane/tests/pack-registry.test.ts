import { describe, it, expect } from 'vitest';
import { PackRegistry, packManifestSchema } from '../src/agent-registry/manifest.js';
import { SunsetEngine } from '../src/sunset-engine/index.js';

describe('PackRegistry', () => {
  const baseManifest = packManifestSchema.parse({
    id: 'pack-a',
    name: 'Pack A',
    version: '1.0.0',
    level: 3,
    type: 'agent',
    description: 'test',
    author: 'team',
    kernelCompatibility: '>=0.0.1',
    healthCheck: '/health',
  });

  it('parses YAML manifest into typed structure', () => {
    const registry = new PackRegistry();
    const parsed = registry.parseManifest(`
id: pack-yaml
name: Pack YAML
version: 0.1.0
level: 3
type: agent
description: yaml pack
author: team
kernelCompatibility: ">=0.0.1"
healthCheck: /health
`);
    expect(parsed.id).toBe('pack-yaml');
    expect(parsed.level).toBe(3);
  });

  it('installs pack and rejects incompatible kernel version', () => {
    const registry = new PackRegistry();
    expect(() => registry.install(baseManifest, '0.0.0-alpha')).toThrow(/kernel/);
    registry.install(baseManifest, '0.1.0');
    expect(registry.get('pack-a')?.status).toBe('installed');
  });

  it('enforces lifecycle state transitions', () => {
    const registry = new PackRegistry();
    registry.install(baseManifest, '0.1.0');
    registry.enable('pack-a');
    expect(registry.get('pack-a')?.status).toBe('enabled');
    registry.disable('pack-a');
    expect(registry.get('pack-a')?.status).toBe('disabled');
    registry.enable('pack-a');
    expect(registry.get('pack-a')?.status).toBe('enabled');
    expect(() => registry.disable('pack-b')).toThrow(/not installed/);
  });

  it('rejects missing required dependency', () => {
    const registry = new PackRegistry();
    const dependent = packManifestSchema.parse({
      ...baseManifest,
      id: 'pack-b',
      requirements: [{ packId: 'pack-a', versionRange: '^1.0.0', optional: false }],
    });
    expect(() => registry.install(dependent, '0.1.0')).toThrow(/Required pack/);
  });
});

describe('SunsetEngine', () => {
  it('marks ready when all conditions met', async () => {
    const engine = new SunsetEngine();
    engine.register({
      id: 'compat-1',
      name: 'LegacyAdapter',
      compensatesFor: 'IRetryPolicy',
      sunsetConditions: [
        { type: 'version_reached', version: '1.0.0' },
        { type: 'metric_threshold', metric: 'success_rate', operator: '>=', value: 0.99 },
      ],
      maxVersionsAlive: 1,
    });

    const ready = await engine.evaluate({
      currentVersion: '1.0.0',
      metrics: { success_rate: 0.995 },
    });
    expect(ready[0]?.ready).toBe(true);
  });

  it('reports unmet conditions when metrics insufficient', async () => {
    const engine = new SunsetEngine();
    engine.register({
      id: 'compat-2',
      name: 'TempBridge',
      compensatesFor: 'old',
      sunsetConditions: [{ type: 'metric_threshold', metric: 'errors', operator: '<=', value: 0 }],
      maxVersionsAlive: 1,
    });
    const result = await engine.evaluate({ metrics: { errors: 3 } });
    expect(result[0]?.ready).toBe(false);
    expect(result[0]?.unmetConditions).toHaveLength(1);
  });

  it('rejects executeSunset on unknown compensation', async () => {
    const engine = new SunsetEngine();
    await expect(engine.executeSunset('nonexistent', 'observe')).rejects.toThrow(/Unknown/);
  });
});
