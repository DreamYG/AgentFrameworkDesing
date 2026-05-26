import type { CompactLevel } from '@nexus/shared';

export type { CompactLevel } from '@nexus/shared';

export interface CompactResult {
  readonly level: CompactLevel;
  readonly tokensFreed: number;
  readonly evidencePreserved: number;
  readonly durationMs: number;
}

export interface CompactContext {
  readonly runId: string;
  readonly currentTokenCount: number;
  readonly maxTokens: number;
  readonly messages: readonly LLMMessageRef[];
}

/** 消息的轻量引用（用于 compact 判断） */
export interface LLMMessageRef {
  readonly index: number;
  readonly role: 'system' | 'user' | 'assistant' | 'tool';
  readonly tokenCount: number;
  readonly timestamp: Date;
  readonly toolName?: string;
  readonly toolResultSize?: number;
}

export interface ICompactEngine {
  shouldCompact(ctx: CompactContext): CompactLevel | null;
  execute(ctx: CompactContext, level: CompactLevel): Promise<CompactResult>;
}
