import { NexusError } from './nexus-error.js';

/** 工具执行失败 */
export class ToolExecutionError extends NexusError {
  constructor(message: string, context?: Record<string, unknown>, options?: ErrorOptions) {
    super(message, 'TOOL.EXECUTION_FAILED', false, context, options);
  }
}

/** 工具超时 */
export class ToolTimeoutError extends NexusError {
  constructor(toolName: string, timeoutMs: number) {
    super(`Tool "${toolName}" timeout after ${timeoutMs}ms`, 'TOOL.TIMEOUT', true, { toolName, timeoutMs });
  }
}
