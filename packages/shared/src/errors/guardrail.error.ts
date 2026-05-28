import { NexusError } from './nexus-error.js';

/** 安全护栏违规 */
export class GuardrailViolation extends NexusError {
  constructor(message: string, context?: Record<string, unknown>) {
    super(message, 'GUARDRAIL.VIOLATION', false, context);
  }
}

/** Prompt 注入检测命中 */
export class PromptInjectionDetected extends GuardrailViolation {
  constructor(pattern: string, snippet: string) {
    super(`Prompt injection detected: ${pattern}`, { pattern, snippet });
  }
}
