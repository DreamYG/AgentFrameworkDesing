import { Queue, Worker, type JobsOptions } from 'bullmq';

/**
 * BullMQ 队列管理
 * 队列职责：Scheduler 调度、OERCD 异步、审计 flush、SessionShadow、Checkpoint Outbox
 */
export interface QueueConfig {
  readonly redisHost: string;
  readonly redisPort: number;
  readonly redisPassword?: string;
  readonly defaultJobOptions?: {
    readonly attempts?: number;
    readonly backoff?: { type: 'exponential' | 'fixed'; delay: number };
    readonly removeOnComplete?: boolean | number;
    readonly removeOnFail?: boolean | number;
  };
}

export type QueueName =
  | 'scheduler'
  | 'oercd'
  | 'audit-flush'
  | 'session-shadow'
  | 'checkpoint-outbox'
  | 'phase-bridge';

export interface JobPayload {
  readonly tenantId: string;
  readonly type: string;
  readonly data: Record<string, unknown>;
  readonly correlationId?: string;
}

/** BullMQ 队列管理器 */
export class QueueManager {
  private readonly queues = new Map<QueueName, Queue<JobPayload>>();
  private readonly workers = new Map<QueueName, Worker<JobPayload>>();

  constructor(private readonly config: QueueConfig) {}

  async addJob(
    queueName: QueueName,
    payload: JobPayload,
    options?: { priority?: number; delay?: number },
  ): Promise<string> {
    const queue = this.getQueue(queueName);
    const jobOptions: JobsOptions = {
      attempts: this.config.defaultJobOptions?.attempts ?? 3,
      backoff: this.config.defaultJobOptions?.backoff,
      removeOnComplete: this.config.defaultJobOptions?.removeOnComplete ?? 1000,
      removeOnFail: this.config.defaultJobOptions?.removeOnFail ?? 5000,
      priority: options?.priority,
      delay: options?.delay,
    };
    const job = await queue.add(payload.type, payload, jobOptions);
    return job.id ?? '';
  }

  async addBulk(queueName: QueueName, payloads: readonly JobPayload[]): Promise<string[]> {
    const queue = this.getQueue(queueName);
    const jobs = await queue.addBulk(
      payloads.map((payload) => ({
        name: payload.type,
        data: payload,
        opts: { attempts: this.config.defaultJobOptions?.attempts ?? 3 },
      })),
    );
    return jobs.map((job) => job.id ?? '');
  }

  registerHandler(queueName: QueueName, handler: (payload: JobPayload) => Promise<void>): void {
    const existing = this.workers.get(queueName);
    if (existing) void existing.close();

    const worker = new Worker<JobPayload>(queueName, async (job) => handler(job.data), {
      connection: this.connectionOptions(),
    });
    this.workers.set(queueName, worker);
  }

  async close(): Promise<void> {
    await Promise.all([...this.workers.values()].map((worker) => worker.close()));
    await Promise.all([...this.queues.values()].map((queue) => queue.close()));
  }

  getConfig(): QueueConfig {
    return this.config;
  }

  private getQueue(queueName: QueueName): Queue<JobPayload> {
    let queue = this.queues.get(queueName);
    if (!queue) {
      queue = new Queue<JobPayload>(queueName, { connection: this.connectionOptions() });
      this.queues.set(queueName, queue);
    }
    return queue;
  }

  private connectionOptions() {
    return {
      host: this.config.redisHost,
      port: this.config.redisPort,
      password: this.config.redisPassword,
    };
  }
}
