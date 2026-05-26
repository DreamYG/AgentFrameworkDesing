/**
 * Guardrails — 安全护栏
 * MVP: 输入注入检测 + 输出脱敏 + 数据分级
 * @stability S3
 */

export type ScanResult = { readonly safe: true } | { readonly safe: false; readonly reason: string; readonly severity: 'low' | 'medium' | 'high' | 'critical' };

/** 输入安全扫描 */
export class InputGuardrail {
  private readonly injectionPatterns = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /you\s+are\s+now\s+/i,
    /system\s*:\s*/i,
    /\[INST\]/i,
    /<\|im_start\|>/i,
  ];

  scan(input: string): ScanResult {
    for (const pattern of this.injectionPatterns) {
      if (pattern.test(input)) {
        return { safe: false, reason: `Potential prompt injection: ${pattern.source}`, severity: 'high' };
      }
    }

    if (input.length > 100000) {
      return { safe: false, reason: 'Input exceeds maximum length', severity: 'medium' };
    }

    return { safe: true };
  }
}

/** 输出脱敏 */
export class OutputSanitizer {
  private readonly patterns: { regex: RegExp; replacement: string }[] = [
    { regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, replacement: '[EMAIL_REDACTED]' },
    { regex: /\b\d{3}[-.]?\d{4}[-.]?\d{4}\b/g, replacement: '[PHONE_REDACTED]' },
    { regex: /\b[A-Za-z0-9_-]{20,}\b(?=.*key|token|secret)/gi, replacement: '[SECRET_REDACTED]' },
    { regex: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, replacement: '[IP_REDACTED]' },
  ];

  sanitize(output: string): string {
    let result = output;
    for (const { regex, replacement } of this.patterns) {
      result = result.replace(regex, replacement);
    }
    return result;
  }
}
