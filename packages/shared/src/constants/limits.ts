/**
 * 系统级硬上限常量。运行时不可调，作为防御性默认值。
 * 与可配置参数（环境变量）形成两层保护。
 * @stability S0
 */

/** 单次 Query Loop 最大轮数 */
export const QUERY_LOOP_MAX_TURNS = 50;

/** 单 Run 最大工具调用次数 */
export const MAX_TOOL_CALLS_PER_RUN = 200;

/** 单工具调用结果最大字节数 */
export const MAX_TOOL_RESULT_BYTES = 256 * 1024;

/** 单工具调用结果最大 Token 数（超过则强制截断） */
export const MAX_TOOL_RESULT_TOKENS = 4000;

/** Compact 触发的最小消息数（避免空压缩） */
export const COMPACT_MIN_MESSAGES = 4;

/** L1 Time-Gap Compact 阈值（毫秒） */
export const COMPACT_TIME_GAP_MS = 30 * 60 * 1000;

/** 委派最大递归深度 */
export const DELEGATE_MAX_DEPTH = 3;

/** 单文本最大字节数（消息内容上限） */
export const MAX_TEXT_BYTES = 1024 * 1024;
