import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { FsSkillBackend, PgSkillBackend, SkillStore, type SkillRepositoryLike } from '../src/index.js';

const sampleSkill = {
  id: 'pm-wbs',
  title: 'PM WBS',
  content: '拆解项目需求为任务',
  l0Summary: '项目 WBS 拆解',
  tags: ['pm'],
  evidenceIds: ['evidence-1'],
  dataClassification: 'internal' as const,
  version: 1,
  status: 'draft' as const,
  createdAt: new Date(),
};

describe('SkillStore (Fs backend)', () => {
  it('validates, persists and searches skills via the filesystem', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nexus-skills-'));
    try {
      const store = new SkillStore(new FsSkillBackend(dir));
      expect(store.validate(sampleSkill).valid).toBe(true);
      await store.add(sampleSkill);

      const reloaded = new SkillStore(new FsSkillBackend(dir));
      await reloaded.load();
      expect(reloaded.search('WBS')[0]?.id).toBe('pm-wbs');
      expect((await reloaded.publish('pm-wbs')).status).toBe('published');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('keeps backwards compatibility with string constructor (defaults to FS backend)', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'nexus-skills-legacy-'));
    try {
      const store = new SkillStore(dir);
      await store.add(sampleSkill);
      const reloaded = new SkillStore(dir);
      await reloaded.load();
      expect(reloaded.count()).toBe(1);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe('SkillStore (Pg backend)', () => {
  it('routes loadAll and persist through the injected repository', async () => {
    const upserts: Array<{ id: string; tenantId: string; status: string }> = [];
    const repo: SkillRepositoryLike = {
      async upsert(skill) {
        upserts.push({ id: skill.id, tenantId: skill.tenantId, status: skill.status });
      },
      async search(_tenantId, _q) {
        return upserts.map((u) => ({
          id: u.id,
          tenantId: u.tenantId,
          title: 'mock',
          content: 'mock content',
          l0Summary: 'mock summary',
          tags: [],
          evidenceIds: ['ev-1'],
          dataClassification: 'internal',
          version: 1,
          status: u.status,
          createdAt: new Date(),
          updatedAt: new Date(),
        }));
      },
    };
    const store = new SkillStore(new PgSkillBackend(repo, 'tenant-A'));
    await store.add(sampleSkill);
    expect(upserts).toEqual([{ id: 'pm-wbs', tenantId: 'tenant-A', status: 'draft' }]);

    const reloaded = new SkillStore(new PgSkillBackend(repo, 'tenant-A'));
    await reloaded.load();
    expect(reloaded.count()).toBe(1);
    expect(reloaded.search('mock')[0]?.id).toBe('pm-wbs');
  });
});
