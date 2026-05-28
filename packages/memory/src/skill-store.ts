import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export type SkillStatus = 'draft' | 'published' | 'archived';
export type SkillDataClassification = 'public' | 'internal' | 'confidential' | 'top_secret';

export interface SkillEntry {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly l0Summary: string;
  readonly tags: readonly string[];
  readonly evidenceIds: readonly string[];
  readonly dataClassification: SkillDataClassification;
  readonly version: number;
  readonly status: SkillStatus;
  readonly createdAt: Date;
  readonly updatedAt?: Date;
}

export interface SkillValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}

/** SkillStore 持久化后端契约 */
export interface ISkillBackend {
  loadAll(): Promise<readonly SkillEntry[]>;
  persist(skill: SkillEntry): Promise<void>;
}

/** 文件系统后端：JSON 文件 per skill。开发/单测/本地默认。 */
export class FsSkillBackend implements ISkillBackend {
  constructor(private readonly rootDir: string) {}

  async loadAll(): Promise<readonly SkillEntry[]> {
    await mkdir(this.rootDir, { recursive: true });
    const files = await readdir(this.rootDir);
    const result: SkillEntry[] = [];
    for (const file of files.filter((name) => name.endsWith('.json'))) {
      const raw = await readFile(join(this.rootDir, file), 'utf8');
      const parsed = JSON.parse(raw) as Omit<SkillEntry, 'createdAt' | 'updatedAt'> & {
        createdAt: string;
        updatedAt?: string;
      };
      result.push({
        ...parsed,
        createdAt: new Date(parsed.createdAt),
        updatedAt: parsed.updatedAt ? new Date(parsed.updatedAt) : undefined,
      });
    }
    return result;
  }

  async persist(skill: SkillEntry): Promise<void> {
    await mkdir(this.rootDir, { recursive: true });
    await writeFile(join(this.rootDir, `${skill.id}.json`), JSON.stringify(skill, null, 2), 'utf8');
  }
}

/**
 * Postgres 后端：通过 SkillsRepository 上下文持久化（生产/云部署）。
 * 注入参数为 repository + tenantId，避免直接耦合 infra 包。
 */
export interface SkillRepositoryLike {
  upsert(skill: {
    id: string;
    tenantId: string;
    title: string;
    content: string;
    l0Summary: string;
    tags: readonly string[];
    evidenceIds: readonly string[];
    dataClassification: string;
    version: number;
    status: string;
  }): Promise<void>;
  search(tenantId: string, query: string): Promise<readonly SkillRow[]>;
}

interface SkillRow {
  readonly id: string;
  readonly tenantId: string;
  readonly title: string;
  readonly content: string;
  readonly l0Summary: string;
  readonly tags: string[];
  readonly evidenceIds: string[];
  readonly dataClassification: string;
  readonly version: number;
  readonly status: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export class PgSkillBackend implements ISkillBackend {
  constructor(private readonly repo: SkillRepositoryLike, private readonly tenantId: string) {}

  async loadAll(): Promise<readonly SkillEntry[]> {
    const rows = await this.repo.search(this.tenantId, '');
    return rows.map((row) => this.fromRow(row));
  }

  async persist(skill: SkillEntry): Promise<void> {
    await this.repo.upsert({
      id: skill.id,
      tenantId: this.tenantId,
      title: skill.title,
      content: skill.content,
      l0Summary: skill.l0Summary,
      tags: skill.tags,
      evidenceIds: skill.evidenceIds,
      dataClassification: skill.dataClassification,
      version: skill.version,
      status: skill.status,
    });
  }

  private fromRow(row: SkillRow): SkillEntry {
    return {
      id: row.id,
      title: row.title,
      content: row.content,
      l0Summary: row.l0Summary,
      tags: row.tags,
      evidenceIds: row.evidenceIds,
      dataClassification: row.dataClassification as SkillDataClassification,
      version: row.version,
      status: row.status as SkillStatus,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

/** Backend 驱动的 SkillStore；search/get 走内存 cache，写入双轨 cache+backend。 */
export class SkillStore {
  private readonly skills = new Map<string, SkillEntry>();
  private readonly backend?: ISkillBackend;
  /** 兼容旧调用：constructor(rootDir?: string) 仍可用 */
  constructor(backendOrDir?: ISkillBackend | string) {
    if (typeof backendOrDir === 'string') {
      this.backend = new FsSkillBackend(backendOrDir);
    } else {
      this.backend = backendOrDir;
    }
  }

  async load(): Promise<void> {
    if (!this.backend) return;
    const entries = await this.backend.loadAll();
    for (const entry of entries) this.skills.set(entry.id, entry);
  }

  async add(skill: SkillEntry): Promise<void> {
    const normalized = { ...skill, updatedAt: skill.updatedAt ?? new Date() };
    this.skills.set(skill.id, normalized);
    await this.backend?.persist(normalized);
  }

  get(id: string): SkillEntry | undefined {
    return this.skills.get(id);
  }

  search(query: string): readonly SkillEntry[] {
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [...this.skills.values()];
    return [...this.skills.values()]
      .map((skill) => ({ skill, score: this.score(skill, tokens) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((item) => item.skill);
  }

  getL0Index(): readonly { id: string; summary: string }[] {
    return [...this.skills.values()].map((s) => ({ id: s.id, summary: s.l0Summary }));
  }

  validate(skill: SkillEntry): SkillValidationResult {
    const errors: string[] = [];
    if (!skill.id.trim()) errors.push('id is required');
    if (!skill.title.trim()) errors.push('title is required');
    if (!skill.content.trim()) errors.push('content is required');
    if (!skill.l0Summary.trim()) errors.push('l0Summary is required');
    if (skill.evidenceIds.length === 0) errors.push('evidenceIds is required');
    if (!['public', 'internal', 'confidential', 'top_secret'].includes(skill.dataClassification)) {
      errors.push('dataClassification is invalid');
    }
    return { valid: errors.length === 0, errors };
  }

  async publish(id: string): Promise<SkillEntry> {
    const skill = this.require(id);
    const next = { ...skill, status: 'published' as const, updatedAt: new Date() };
    await this.add(next);
    return next;
  }

  async rollback(id: string, version: number): Promise<SkillEntry> {
    const skill = this.require(id);
    const next = { ...skill, version, status: 'published' as const, updatedAt: new Date() };
    await this.add(next);
    return next;
  }

  count(): number {
    return this.skills.size;
  }

  private require(id: string): SkillEntry {
    const skill = this.skills.get(id);
    if (!skill) throw new Error(`Skill not found: ${id}`);
    return skill;
  }

  private score(skill: SkillEntry, tokens: readonly string[]): number {
    const haystack = [skill.title, skill.content, skill.l0Summary, ...skill.tags].join(' ').toLowerCase();
    return tokens.reduce((sum, token) => sum + (haystack.includes(token) ? 1 : 0), 0);
  }
}
