/**
 * EvidenceRegistry — 证据注册表
 * 识别、存储和治理跨 Compact 边界需要存活的关键信息
 * @stability S1
 */

export interface EvidenceEntry {
  readonly id: string;
  readonly sourceToolCall: string;
  readonly messageIndex: number;
  readonly type: 'file_path' | 'url' | 'code_snippet' | 'error_trace';
  readonly content: string;
  readonly turnCreated: number;
  accessCount: number;
  readonly tokenCount: number;
  wasReferenced: boolean;
}

const EVIDENCE_PATTERNS = {
  file_path: /(?:\/[\w.-]+)+\.\w+|[A-Z]:\\(?:[\w.-]+\\)*[\w.-]+/g,
  url: /https?:\/\/[^\s<>"]+/g,
  code_snippet: /(?:function|class|const|let|var|import|export|def|interface)\s+\w+/,
  error_trace: /(?:Error:|at\s+|Traceback|Exception)/,
};

export class EvidenceRegistry {
  private readonly entries = new Map<string, EvidenceEntry>();
  private readonly maxEntries: number;
  private readonly ttlTurns: number;

  constructor(options?: { maxEntries?: number; ttlTurns?: number }) {
    this.maxEntries = options?.maxEntries ?? 50;
    this.ttlTurns = options?.ttlTurns ?? 20;
  }

  /**
   * 扫描文本并标记证据（零 LLM 调用，纯启发式）
   */
  scanAndRegister(
    text: string,
    sourceToolCall: string,
    turnIndex: number,
    messageIndex: number,
  ): readonly EvidenceEntry[] {
    const found: EvidenceEntry[] = [];

    for (const [type, pattern] of Object.entries(EVIDENCE_PATTERNS)) {
      const matches = pattern.global
        ? [...text.matchAll(pattern)].map((m) => m[0])
        : pattern.test(text)
          ? [text.slice(0, 200)]
          : [];

      for (const match of matches.slice(0, 3)) {
        const entry: EvidenceEntry = {
          id: crypto.randomUUID(),
          sourceToolCall,
          messageIndex,
          type: type as EvidenceEntry['type'],
          content: match.slice(0, 500),
          turnCreated: turnIndex,
          accessCount: 0,
          tokenCount: Math.ceil(match.length / 4),
          wasReferenced: false,
        };
        this.entries.set(entry.id, entry);
        found.push(entry);
      }
    }

    this.enforceCapacity();
    return found;
  }

  /** 返回包含证据的消息索引集合（供 L3 嫁接保留判断使用） */
  getMessageIndicesWithEvidence(): ReadonlySet<number> {
    const indices = new Set<number>();
    for (const entry of this.entries.values()) {
      indices.add(entry.messageIndex);
    }
    return indices;
  }

  get(id: string): EvidenceEntry | undefined {
    const entry = this.entries.get(id);
    if (entry) entry.accessCount++;
    return entry;
  }

  getAll(): readonly EvidenceEntry[] {
    return [...this.entries.values()];
  }

  /**
   * TTL 淘汰 + 容量治理
   */
  evict(currentTurn: number): number {
    let evicted = 0;
    for (const [id, entry] of this.entries) {
      const age = currentTurn - entry.turnCreated;
      if (age > this.ttlTurns && entry.accessCount === 0 && !entry.wasReferenced) {
        this.entries.delete(id);
        evicted++;
      }
    }
    return evicted;
  }

  private enforceCapacity(): void {
    if (this.entries.size <= this.maxEntries) return;
    const sorted = [...this.entries.entries()].sort(
      ([, a], [, b]) => a.accessCount - b.accessCount || a.turnCreated - b.turnCreated,
    );
    while (this.entries.size > this.maxEntries && sorted.length > 0) {
      const [id] = sorted.shift()!;
      this.entries.delete(id);
    }
  }

  count(): number {
    return this.entries.size;
  }

  getTotalTokens(): number {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.tokenCount;
    return total;
  }
}
