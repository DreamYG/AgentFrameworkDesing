import { describe, expect, it } from 'vitest';
import { FeatureFlagRegistry } from '../src/index.js';

describe('FeatureFlagRegistry', () => {
  it('applies percentage rollout deterministically', () => {
    const flags = new FeatureFlagRegistry();
    flags.set({ key: 'pack', enabled: true, rolloutPercent: 100 });
    expect(flags.isEnabled('pack', 'user-1')).toBe(true);

    flags.set({ key: 'pack', enabled: false, rolloutPercent: 100 });
    expect(flags.isEnabled('pack', 'user-1')).toBe(false);
  });
});
