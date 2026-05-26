import type { HookContext, HookPhase, ILifecycleHook, ToolHookContext } from './types.js';

/**
 * 生命周期钩子注册表
 * 按 phase 分组注册，按 priority 排序调度
 */
export class HookRegistry {
  private readonly hooks = new Map<HookPhase, ILifecycleHook[]>();

  register(hook: ILifecycleHook): void {
    const list = this.hooks.get(hook.phase) ?? [];
    list.push(hook);
    list.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    this.hooks.set(hook.phase, list);
  }

  unregister(name: string, phase: HookPhase): void {
    const list = this.hooks.get(phase);
    if (!list) return;
    this.hooks.set(
      phase,
      list.filter((h) => h.name !== name),
    );
  }

  async dispatch(phase: HookPhase, ctx: HookContext | ToolHookContext): Promise<void> {
    const list = this.hooks.get(phase);
    if (!list || list.length === 0) return;
    for (const hook of list) {
      await hook.execute(ctx);
    }
  }

  getHooks(phase: HookPhase): readonly ILifecycleHook[] {
    return this.hooks.get(phase) ?? [];
  }
}
