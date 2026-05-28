import { parse } from 'yaml';
import { satisfies } from 'semver';
import { z } from 'zod';

export type PackStatus = 'published' | 'installed' | 'enabled' | 'disabled' | 'uninstalled';
export type PackType = 'agent' | 'tool' | 'provider' | 'guardrail' | 'memory' | 'integration' | 'connector';

export const packManifestSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  level: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  type: z.enum(['agent', 'tool', 'provider', 'guardrail', 'memory', 'integration', 'connector']),
  phase: z.enum(['intent', 'execution', 'connection']).optional(),
  description: z.string(),
  author: z.string(),
  kernelCompatibility: z.string(),
  provisions: z.array(z.object({
    type: z.enum(['agent', 'tool', 'connector', 'policy', 'guard']),
    id: z.string(),
    description: z.string(),
    exports: z.array(z.string()).default([]),
  })).default([]),
  requirements: z.array(z.object({
    packId: z.string(),
    versionRange: z.string(),
    optional: z.boolean().default(false),
  })).default([]),
  lifecycle: z.object({
    onInstall: z.string().optional(),
    onActivate: z.string().optional(),
    onDeactivate: z.string().optional(),
    onReactivate: z.string().optional(),
    onUninstall: z.string().optional(),
  }).default({}),
  healthCheck: z.string(),
});

export type CapabilityPackManifest = z.infer<typeof packManifestSchema>;

export interface InstalledPack {
  readonly manifest: CapabilityPackManifest;
  status: PackStatus;
  installedAt?: Date;
  enabledAt?: Date;
}

export class PackRegistry {
  private readonly packs = new Map<string, InstalledPack>();

  parseManifest(content: string): CapabilityPackManifest {
    const raw = content.trim().startsWith('{') ? JSON.parse(content) : parse(content);
    return packManifestSchema.parse(raw);
  }

  install(manifest: CapabilityPackManifest, kernelVersion: string): InstalledPack {
    if (!satisfies(kernelVersion, manifest.kernelCompatibility)) {
      throw new Error(`Pack ${manifest.id} requires kernel ${manifest.kernelCompatibility}, got ${kernelVersion}`);
    }
    this.ensureRequirements(manifest);

    const pack: InstalledPack = {
      manifest,
      status: 'installed',
      installedAt: new Date(),
    };
    this.packs.set(manifest.id, pack);
    return pack;
  }

  enable(packId: string): void {
    const pack = this.requirePack(packId);
    if (pack.status !== 'installed' && pack.status !== 'disabled') {
      throw new Error(`Cannot enable pack ${packId} from ${pack.status}`);
    }
    pack.status = 'enabled';
    pack.enabledAt = new Date();
  }

  disable(packId: string): void {
    const pack = this.requirePack(packId);
    if (pack.status !== 'enabled') throw new Error(`Pack ${packId} is not enabled`);
    pack.status = 'disabled';
  }

  uninstall(packId: string): void {
    const pack = this.requirePack(packId);
    pack.status = 'uninstalled';
  }

  upgrade(manifest: CapabilityPackManifest, kernelVersion: string): InstalledPack {
    const current = this.packs.get(manifest.id);
    if (!current) return this.install(manifest, kernelVersion);
    if (!satisfies(kernelVersion, manifest.kernelCompatibility)) {
      throw new Error(`Pack ${manifest.id} requires kernel ${manifest.kernelCompatibility}, got ${kernelVersion}`);
    }
    current.status = 'installed';
    (current as { manifest: CapabilityPackManifest }).manifest = manifest;
    return current;
  }

  rollback(packId: string, version: string): void {
    const pack = this.requirePack(packId);
    (pack.manifest as { version: string }).version = version;
    pack.status = 'installed';
  }

  async healthCheck(packId: string): Promise<{ healthy: boolean; endpoint: string }> {
    const pack = this.requirePack(packId);
    return { healthy: pack.status === 'enabled', endpoint: pack.manifest.healthCheck };
  }

  get(packId: string): InstalledPack | undefined {
    return this.packs.get(packId);
  }

  getEnabled(): readonly InstalledPack[] {
    return [...this.packs.values()].filter((pack) => pack.status === 'enabled');
  }

  getAll(): readonly InstalledPack[] {
    return [...this.packs.values()];
  }

  private ensureRequirements(manifest: CapabilityPackManifest): void {
    for (const requirement of manifest.requirements) {
      const installed = this.packs.get(requirement.packId);
      if (!installed && !requirement.optional) {
        throw new Error(`Required pack missing: ${requirement.packId}`);
      }
      if (installed && !satisfies(installed.manifest.version, requirement.versionRange)) {
        throw new Error(`Pack ${requirement.packId} version ${installed.manifest.version} does not satisfy ${requirement.versionRange}`);
      }
    }
  }

  private requirePack(packId: string): InstalledPack {
    const pack = this.packs.get(packId);
    if (!pack) throw new Error(`Pack not installed: ${packId}`);
    return pack;
  }
}
