/**
 * Token 估算工具（轻量启发式，不引入 tiktoken 重依赖）。
 * 经验值：英文约 4 char/token、中文约 1.5 char/token。
 * 用于：Prompt 预算检查、Compact 阈值判断、工具结果截断。
 * 真实计费请以 LLM 返回的 usage 为准。
 * @stability S0
 */

const ENGLISH_CHARS_PER_TOKEN = 4;
const CJK_CHARS_PER_TOKEN = 1.5;
const CJK_RANGE = /[\u3000-\u9fff\uac00-\ud7af]/g;

/** 估算字符串的 token 数（启发式，误差 ±15%） */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  const cjkMatches = text.match(CJK_RANGE);
  const cjkCount = cjkMatches?.length ?? 0;
  const otherCount = text.length - cjkCount;
  return Math.ceil(cjkCount / CJK_CHARS_PER_TOKEN + otherCount / ENGLISH_CHARS_PER_TOKEN);
}

/** 估算消息数组的总 token 数（含 role / content） */
export function estimateMessagesTokens(messages: readonly { content: string }[]): number {
  let total = 0;
  for (const msg of messages) total += estimateTokens(msg.content) + 4; // overhead per message
  return total;
}
