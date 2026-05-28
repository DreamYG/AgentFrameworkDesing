/**
 * 安全截断工具——为工具结果、日志、prompt 注入等场景提供边界裁剪。
 * 截断时保留头部 + 尾部 + 中间省略标记，便于 LLM 看清"被截断"的事实。
 * @stability S0
 */

import { estimateTokens } from './token-counter.js';

export interface TruncateOptions {
  /** 头部保留字符数，默认 60% */
  readonly headRatio?: number;
  /** 中间省略标记，默认 `...[truncated N chars]...` */
  readonly marker?: (omitted: number) => string;
}

/** 按字符截断 */
export function truncateChars(text: string, maxChars: number, options?: TruncateOptions): string {
  if (text.length <= maxChars) return text;
  const headRatio = options?.headRatio ?? 0.6;
  const marker = (options?.marker ?? defaultMarker)(text.length - maxChars);
  const room = Math.max(0, maxChars - marker.length);
  const headLen = Math.floor(room * headRatio);
  const tailLen = Math.max(0, room - headLen);
  return text.slice(0, headLen) + marker + text.slice(text.length - tailLen);
}

/** 按 token 截断（估算） */
export function truncateTokens(text: string, maxTokens: number, options?: TruncateOptions): string {
  if (estimateTokens(text) <= maxTokens) return text;
  // 反推字符上限：英文按 4 char/token、CJK 按 1.5；保守取 3
  const maxChars = Math.floor(maxTokens * 3);
  return truncateChars(text, maxChars, options);
}

function defaultMarker(omitted: number): string {
  return `\n...[truncated ${omitted} chars]...\n`;
}
