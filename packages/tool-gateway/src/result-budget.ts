/**
 * Tool Result Budget — 工具结果截断策略
 * 确保单次工具返回不会炸毁上下文窗口
 * @stability S2
 */
export interface TruncatedResult {
  readonly content: string;
  readonly wasTruncated: boolean;
  readonly originalTokens: number;
  readonly retainedTokens: number;
  readonly paginationHint?: string;
}

export class ToolResultBudget {
  /**
   * 截断超长结果
   * 策略：
   * 1. 结果 <= maxTokens → 原样返回
   * 2. 结构化数据 → 保留前 N 行 + 截断提示
   * 3. 自由文本 → 首尾各 40% + 中间省略
   */
  truncate(result: string, maxTokens: number): TruncatedResult {
    const estimatedTokens = Math.ceil(result.length / 4);

    if (estimatedTokens <= maxTokens) {
      return {
        content: result,
        wasTruncated: false,
        originalTokens: estimatedTokens,
        retainedTokens: estimatedTokens,
      };
    }

    const maxChars = maxTokens * 4;
    const isStructured = result.startsWith('{') || result.startsWith('[') || result.includes('\n');

    if (isStructured) {
      const lines = result.split('\n');
      let kept = '';
      let lineCount = 0;
      for (const line of lines) {
        if (kept.length + line.length > maxChars * 0.8) break;
        kept += line + '\n';
        lineCount++;
      }
      const content = `${kept}[...truncated: showing ${lineCount}/${lines.length} lines, ${estimatedTokens} total tokens]`;
      return {
        content,
        wasTruncated: true,
        originalTokens: estimatedTokens,
        retainedTokens: Math.ceil(content.length / 4),
        paginationHint: `Use offset=${lineCount} to see more`,
      };
    }

    const headSize = Math.floor(maxChars * 0.4);
    const tailSize = Math.floor(maxChars * 0.4);
    const head = result.slice(0, headSize);
    const tail = result.slice(-tailSize);
    const content = `${head}\n\n[...${estimatedTokens - maxTokens} tokens omitted...]\n\n${tail}`;

    return {
      content,
      wasTruncated: true,
      originalTokens: estimatedTokens,
      retainedTokens: maxTokens,
    };
  }
}
