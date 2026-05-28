/**
 * Nexus 领域错误基类
 * @property code - 机器可读错误码（格式：DOMAIN.SUB_CODE）
 * @property retryable - 是否可安全重试
 * @property context - 结构化上下文信息，用于审计和调试
 * @stability S0
 */
export class NexusError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean = false,
    readonly context?: Readonly<Record<string, unknown>>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

/**
 * 跨域基础错误：
 * - 业务域错误（Tool/Provider/Guardrail/Budget）在各自 *.error.ts 文件。
 * - 下列错误暂未拆分到独立域，统一在此声明。
 */

/** 编排异常 */
export class OrchestrationError extends NexusError {}

/** 审批超时 */
export class ApprovalTimeoutError extends NexusError {}

/** Checkpoint 损坏 */
export class CheckpointCorruptionError extends NexusError {}

/** 能力包加载失败 */
export class PackLoadError extends NexusError {}

/** 知识检索失败 */
export class RetrievalError extends NexusError {}
