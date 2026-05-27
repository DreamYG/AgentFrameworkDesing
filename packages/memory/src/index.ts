export * from './session-shadow.js';

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
