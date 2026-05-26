export type SchedulerStrategy = 'fifo' | 'priority' | 'fair_share';

export type TaskPriority = 'P0' | 'P1' | 'P2' | 'P3' | 'P4';

export interface ScheduledTask {
  readonly id: string;
  readonly runId: string;
  readonly tenantId: string;
  readonly priority: TaskPriority;
  readonly createdAt: Date;
  scheduledAt?: Date;
  status: 'queued' | 'dispatched' | 'completed' | 'cancelled';
}

export interface SchedulerConfig {
  readonly strategy: SchedulerStrategy;
  readonly maxConcurrentPerTenant: number;
  readonly maxGlobalConcurrent: number;
}

/**
 * Scheduler — 任务调度器
 * FIFO/Priority 队列 + 租户并发上限管控
 * @stability S2
 */
export class Scheduler {
  private readonly queue: ScheduledTask[] = [];
  private readonly active = new Map<string, number>(); // tenantId -> active count

  constructor(private readonly config: SchedulerConfig) {}

  enqueue(task: Omit<ScheduledTask, 'status' | 'scheduledAt'>): ScheduledTask {
    const scheduled: ScheduledTask = { ...task, status: 'queued' };
    this.queue.push(scheduled);
    this.sortQueue();
    return scheduled;
  }

  dequeue(): ScheduledTask | null {
    for (let i = 0; i < this.queue.length; i++) {
      const task = this.queue[i]!;
      if (task.status !== 'queued') continue;
      if (!this.canDispatch(task.tenantId)) continue;

      task.status = 'dispatched';
      task.scheduledAt = new Date();
      this.incrementActive(task.tenantId);
      this.queue.splice(i, 1);
      return task;
    }
    return null;
  }

  complete(runId: string, tenantId: string): void {
    this.decrementActive(tenantId);
    const task = this.queue.find((t) => t.runId === runId);
    if (task) task.status = 'completed';
  }

  cancel(runId: string, tenantId: string): void {
    const idx = this.queue.findIndex((t) => t.runId === runId);
    if (idx >= 0) {
      this.queue[idx]!.status = 'cancelled';
      this.queue.splice(idx, 1);
    } else {
      this.decrementActive(tenantId);
    }
  }

  getQueueDepth(): number {
    return this.queue.filter((t) => t.status === 'queued').length;
  }

  getActiveCount(tenantId?: string): number {
    if (tenantId) return this.active.get(tenantId) ?? 0;
    let total = 0;
    for (const count of this.active.values()) total += count;
    return total;
  }

  private canDispatch(tenantId: string): boolean {
    const tenantActive = this.active.get(tenantId) ?? 0;
    if (tenantActive >= this.config.maxConcurrentPerTenant) return false;
    if (this.getActiveCount() >= this.config.maxGlobalConcurrent) return false;
    return true;
  }

  private incrementActive(tenantId: string): void {
    this.active.set(tenantId, (this.active.get(tenantId) ?? 0) + 1);
  }

  private decrementActive(tenantId: string): void {
    const current = this.active.get(tenantId) ?? 0;
    if (current > 0) this.active.set(tenantId, current - 1);
  }

  private sortQueue(): void {
    if (this.config.strategy === 'priority') {
      const priorityOrder: Record<TaskPriority, number> = { P0: 0, P1: 1, P2: 2, P3: 3, P4: 4 };
      this.queue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
    }
  }
}
