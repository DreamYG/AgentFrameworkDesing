import { describe, it, expect } from 'vitest';
import { InMemoryAgentStreamBroker } from '../src/stream-broker.js';
import type { StreamDeliveryEnvelope } from '@nexus/shared';

function envelope(runId: string, sequence: number, delta: string): StreamDeliveryEnvelope {
  return {
    runId,
    sequence,
    createdAt: new Date(),
    event: { type: 'text_delta', delta, runId },
  };
}

describe('InMemoryAgentStreamBroker', () => {
  it('preserves publish order and assigns sequence when missing', async () => {
    const broker = new InMemoryAgentStreamBroker();
    await broker.publishEvent('run-1', { type: 'text_delta', delta: 'a', runId: 'run-1' });
    await broker.publishEvent('run-1', { type: 'text_delta', delta: 'b', runId: 'run-1' });

    const collected: string[] = [];
    for await (const env of broker.subscribe('run-1', { consumerId: 'c', maxInFlight: 10 })) {
      if (env.event.type === 'text_delta') collected.push(env.event.delta);
    }
    expect(collected).toEqual(['a', 'b']);
  });

  it('supports replay from given sequence', async () => {
    const broker = new InMemoryAgentStreamBroker();
    await broker.publish(envelope('run-2', 1, 'first'));
    await broker.publish(envelope('run-2', 2, 'second'));
    await broker.publish(envelope('run-2', 3, 'third'));

    const replayed: number[] = [];
    for await (const env of broker.replay('run-2', 2)) {
      replayed.push(env.sequence);
    }
    expect(replayed).toEqual([2, 3]);
  });

  it('records ack per consumer separately', async () => {
    const broker = new InMemoryAgentStreamBroker();
    await broker.ack('run-3', 'consumer-a', 1);
    await broker.ack('run-3', 'consumer-b', 1);
    // 不应抛错；具体 ack 内部状态不暴露，但应能继续 subscribe
    await broker.publishEvent('run-3', { type: 'text_delta', delta: 'x', runId: 'run-3' });
    const seen: number[] = [];
    for await (const env of broker.subscribe('run-3', { consumerId: 'consumer-a', maxInFlight: 10 })) {
      seen.push(env.sequence);
    }
    expect(seen).toEqual([1]);
  });
});
