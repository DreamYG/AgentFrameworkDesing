export interface FeatureFlag {
  readonly key: string;
  readonly enabled: boolean;
  readonly rolloutPercent: number;
}

export class FeatureFlagRegistry {
  private readonly flags = new Map<string, FeatureFlag>();

  set(flag: FeatureFlag): void {
    this.flags.set(flag.key, flag);
  }

  isEnabled(key: string, subjectId: string): boolean {
    const flag = this.flags.get(key);
    if (!flag?.enabled) return false;
    if (flag.rolloutPercent >= 100) return true;
    const hash = [...subjectId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return hash % 100 < flag.rolloutPercent;
  }

  list(): readonly FeatureFlag[] {
    return [...this.flags.values()];
  }
}
