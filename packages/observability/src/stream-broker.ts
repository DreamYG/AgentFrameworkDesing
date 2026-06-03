import type {
  AgentStreamEvent,
  IAgentStreamBroker,
  StreamConsumerOptions,
  StreamDeliveryEnvelope,
} from '@nexus/shared';

/** 内存版 Agent 流式事件 Broker，支持 sequence、ack 与 replay */
export class InMemoryAgentStreamBroker implements IAgentStreamBroker {
  private readonly streams = new Map<string, StreamDeliveryEnvelope[]>();
  private readonly acked = new Map<string, Set<number>>();
  private readonly waiters = new Map<string, Set<() => void>>();

  async publish(envelope: StreamDeliveryEnvelope): Promise<void> {
    const stream = this.streams.get(envelope.runId) ?? [];
    const sequence = envelope.sequence > 0 ? envelope.sequence : stream.length + 1;
    stream.push({ ...envelope, sequence });
    this.streams.set(envelope.runId, stream);
    this.notifyWaiters(envelope.runId);
  }

  async *subscribe(
    runId: string,
    options: StreamConsumerOptions,
  ): AsyncIterable<StreamDeliveryEnvelope> {
    let cursor = options.fromSequence ?? 1;
    while (true) {
      const stream = this.streams.get(runId) ?? [];
      const next = stream.find((item) => item.sequence >= cursor);
      if (next) {
        cursor = next.sequence + 1;
        yield next;
        if (next.event.type === 'completed') {
          return;
        }
        continue;
      }
      await this.waitForPublish(runId);
    }
  }

  async ack(runId: string, consumerId: string, sequence: number): Promise<void> {
    const key = `${runId}:${consumerId}`;
    const set = this.acked.get(key) ?? new Set<number>();
    set.add(sequence);
    this.acked.set(key, set);
  }

  replay(runId: string, fromSequence: number): AsyncIterable<StreamDeliveryEnvelope> {
    return this.drainBuffered(runId, fromSequence);
  }

  private async *drainBuffered(
    runId: string,
    fromSequence: number,
  ): AsyncGenerator<StreamDeliveryEnvelope> {
    let cursor = fromSequence;
    while (true) {
      const stream = this.streams.get(runId) ?? [];
      const next = stream.find((item) => item.sequence >= cursor);
      if (!next) {
        return;
      }
      cursor = next.sequence + 1;
      yield next;
      if (next.event.type === 'completed') {
        return;
      }
    }
  }

  async publishEvent(runId: string, event: AgentStreamEvent): Promise<void> {
    const stream = this.streams.get(runId) ?? [];
    await this.publish({
      runId,
      sequence: stream.length + 1,
      event,
      createdAt: new Date(),
    });
  }

  private notifyWaiters(runId: string): void {
    const set = this.waiters.get(runId);
    if (!set) {
      return;
    }
    for (const wake of set) {
      wake();
    }
  }

  private waitForPublish(runId: string): Promise<void> {
    return new Promise((resolve) => {
      const set = this.waiters.get(runId) ?? new Set();
      const wake = () => {
        set.delete(wake);
        if (set.size === 0) {
          this.waiters.delete(runId);
        }
        resolve();
      };
      set.add(wake);
      this.waiters.set(runId, set);
    });
  }
}
