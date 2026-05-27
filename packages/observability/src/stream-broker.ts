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

  async publish(envelope: StreamDeliveryEnvelope): Promise<void> {
    const stream = this.streams.get(envelope.runId) ?? [];
    const sequence = envelope.sequence > 0 ? envelope.sequence : stream.length + 1;
    stream.push({ ...envelope, sequence });
    this.streams.set(envelope.runId, stream);
  }

  async *subscribe(
    runId: string,
    options: StreamConsumerOptions,
  ): AsyncIterable<StreamDeliveryEnvelope> {
    let cursor = options.fromSequence ?? 1;
    while (true) {
      const stream = this.streams.get(runId) ?? [];
      const next = stream.find((item) => item.sequence >= cursor);
      if (!next) return;
      cursor = next.sequence + 1;
      yield next;
    }
  }

  async ack(runId: string, consumerId: string, sequence: number): Promise<void> {
    const key = `${runId}:${consumerId}`;
    const set = this.acked.get(key) ?? new Set<number>();
    set.add(sequence);
    this.acked.set(key, set);
  }

  replay(runId: string, fromSequence: number): AsyncIterable<StreamDeliveryEnvelope> {
    return this.subscribe(runId, {
      consumerId: 'replay',
      fromSequence,
      maxInFlight: Number.MAX_SAFE_INTEGER,
    });
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
}
