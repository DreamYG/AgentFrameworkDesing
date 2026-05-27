import { describe, expect, it } from 'vitest';
import { PromptAssembler } from '../src/prompt-assembler.js';

describe('PromptAssembler', () => {
  it('freezes stable prefix and appends dynamic suffix', () => {
    const assembler = new PromptAssembler();
    assembler.freeze({
      identity: 'identity',
      safetyConstraints: 'safety',
      skillIndex: 'skills',
      toolSignatures: 'tools',
    });

    expect(assembler.isFrozen()).toBe(true);
    expect(assembler.getStablePrefix()).toContain('identity');
    expect(assembler.assemble({ environmentContext: 'env', sessionSummary: 'summary' })).toContain('summary');
  });
});
