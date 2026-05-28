/**
 * 默认配置值。可被环境变量或 Pack manifest 覆盖。
 * @stability S0
 */

/** 默认意图分类信心阈值 */
export const DEFAULT_INTENT_CONFIDENCE_THRESHOLD = 0.5;

/** 默认意图缓存 TTL（秒） */
export const DEFAULT_INTENT_CACHE_TTL_SEC = 60;

/** 默认意图分类超时（毫秒） */
export const DEFAULT_INTENT_TIMEOUT_MS = 8000;

/** 默认每用户每分钟请求数 */
export const DEFAULT_RATE_LIMIT_PER_USER = 120;

/** 默认消息去重 TTL（毫秒） */
export const DEFAULT_DEDUP_TTL_MS = 60 * 60 * 1000;

/** 默认审批超时（毫秒） */
export const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

/** 默认优雅停机超时（毫秒） */
export const DEFAULT_GRACEFUL_SHUTDOWN_MS = 30000;

/** 默认 Compact 保留最近轮数 */
export const DEFAULT_COMPACT_KEEP_RECENT_TURNS = 4;

/** 默认 SessionShadow TTL（毫秒） */
export const DEFAULT_SESSION_SHADOW_TTL_MS = 24 * 60 * 60 * 1000;
