/**
 * Memory 系统
 * MEM-0: 工作记忆（上下文窗口内） — 由 Kernel Compact 管理
 * MEM-1: 会话记忆（Redis TTL）
 * MEM-3: 程序性技能库（FTS5 索引）
 */

/** SessionShadow — 双轨影子记忆代理 */
export interface SessionSummary {
  readonly version: number;
  readonly turnRange: readonly [number, number];
  readonly progressSummary: string;
  readonly confirmedDecisions: readonly string[];
  readonly openQuestions: readonly string[];
  readonly activeEvidenceIds: readonly string[];
  readonly tokenCount: number;
}

export class SessionShadow {
  private summary: SessionSummary = {
    version: 0,
    turnRange: [0, 0],
    progressSummary: '',
    confirmedDecisions: [],
    openQuestions: [],
    activeEvidenceIds: [],
    tokenCount: 0,
  };

  getSummary(): Readonly<SessionSummary> {
    return this.summary;
  }

  update(delta: Partial<SessionSummary>): void {
    this.summary = {
      ...this.summary,
      ...delta,
      version: this.summary.version + 1,
    };
  }
}

/** Skill Store MVP — 技能文件存储 + L0 摘要索引 */
export interface SkillEntry {
  readonly id: string;
  readonly title: string;
  readonly content: string;
  readonly l0Summary: string;
  readonly tags: readonly string[];
  readonly version: number;
  readonly createdAt: Date;
}

export class SkillStore {
  private readonly skills = new Map<string, SkillEntry>();

  add(skill: SkillEntry): void {
    this.skills.set(skill.id, skill);
  }

  get(id: string): SkillEntry | undefined {
    return this.skills.get(id);
  }

  search(query: string): readonly SkillEntry[] {
    const lower = query.toLowerCase();
    return [...this.skills.values()].filter(
      (s) =>
        s.title.toLowerCase().includes(lower) ||
        s.l0Summary.toLowerCase().includes(lower) ||
        s.tags.some((t) => t.toLowerCase().includes(lower)),
    );
  }

  getL0Index(): readonly { id: string; summary: string }[] {
    return [...this.skills.values()].map((s) => ({ id: s.id, summary: s.l0Summary }));
  }

  count(): number {
    return this.skills.size;
  }
}
