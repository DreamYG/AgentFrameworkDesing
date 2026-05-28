import type { ILLMProvider, LLMCallOptions, LLMMessage, LLMStreamChunk } from '@nexus/shared';

export interface ReplayTurn {
  readonly chunks: readonly LLMStreamChunk[];
}

export class ReplayLLMProvider implements ILLMProvider {
  private index = 0;

  constructor(private readonly turns: readonly ReplayTurn[]) {}

  async *chat(_messages: readonly LLMMessage[], _options: LLMCallOptions): AsyncGenerator<LLMStreamChunk> {
    const turn = this.turns[this.index] ?? this.turns.at(-1);
    this.index++;
    for (const chunk of turn?.chunks ?? []) {
      yield chunk;
    }
  }
}
