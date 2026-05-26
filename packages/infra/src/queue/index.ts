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

/**
 * 队列管理器骨架
 * 实际 BullMQ 连接在运行时通过 connect() 建立
 */
export class QueueManager {
  private readonly config: QueueConfig;
  private connected = false;

  constructor(config: QueueConfig) {
    this.config = config;
  }

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async addJob(queue: QueueName, payload: JobPayload, options?: { priority?: number; delay?: number }): Promise<string> {
    if (!this.connected) throw new Error('Queue not connected');
    void queue;
    void options;
    return `job_${Date.now()}_${payload.type}`;
  }

  async addBulk(queue: QueueName, payloads: readonly JobPayload[]): Promise<string[]> {
    return Promise.all(payloads.map((p) => this.addJob(queue, p)));
  }

  getConfig(): QueueConfig {
    return this.config;
  }
}
