import type { PhaseBridgeEvent, PhaseBridgeEventType } from '../types/events.js';
import type { PhaseId } from '../types/phase.js';

/**
 * Phase Bridge 事件总线端口
 * 三个 Phase 通过此协议实现完全解耦通信
 * @stability S1
 */
export interface IPhaseBridge {
  /** 发布事件（幂等：相同 idempotencyKey 不重复处理） */
  publish<T>(event: PhaseBridgeEvent<T>): Promise<void>;

  /** 订阅特定类型事件 */
  subscribe(
    eventTypes: readonly PhaseBridgeEventType[],
    handler: (event: PhaseBridgeEvent) => Promise<void>,
  ): Unsubscribe;

  /** 按 Phase 订阅所有事件 */
  subscribePhase(
    phase: PhaseId,
    handler: (event: PhaseBridgeEvent) => Promise<void>,
  ): Unsubscribe;
}

export type Unsubscribe = () => void;

/**
 * 内存实现的 Phase Bridge（开发/测试用）
 * 生产环境应替换为 BullMQ 或 Kafka 实现
 */
export class InMemoryPhaseBridge implements IPhaseBridge {
  private readonly handlers = new Map<string, Set<(event: PhaseBridgeEvent) => Promise<void>>>();
  private readonly phaseHandlers = new Map<PhaseId, Set<(event: PhaseBridgeEvent) => Promise<void>>>();
  private readonly processedKeys = new Set<string>();

  async publish<T>(event: PhaseBridgeEvent<T>): Promise<void> {
    if (this.processedKeys.has(event.idempotencyKey)) {
      return;
    }
    this.processedKeys.add(event.idempotencyKey);

    const typeHandlers = this.handlers.get(event.type);
    if (typeHandlers) {
      for (const handler of typeHandlers) {
        await handler(event as PhaseBridgeEvent);
      }
    }

    if (event.target) {
      const phHandlers = this.phaseHandlers.get(event.target);
      if (phHandlers) {
        for (const handler of phHandlers) {
          await handler(event as PhaseBridgeEvent);
        }
      }
    }

    if (event.targets) {
      for (const target of event.targets) {
        const phHandlers = this.phaseHandlers.get(target);
        if (phHandlers) {
          for (const handler of phHandlers) {
            await handler(event as PhaseBridgeEvent);
          }
        }
      }
    }
  }

  subscribe(
    eventTypes: readonly PhaseBridgeEventType[],
    handler: (event: PhaseBridgeEvent) => Promise<void>,
  ): Unsubscribe {
    for (const type of eventTypes) {
      if (!this.handlers.has(type)) {
        this.handlers.set(type, new Set());
      }
      this.handlers.get(type)!.add(handler);
    }

    return () => {
      for (const type of eventTypes) {
        this.handlers.get(type)?.delete(handler);
      }
    };
  }

  subscribePhase(
    phase: PhaseId,
    handler: (event: PhaseBridgeEvent) => Promise<void>,
  ): Unsubscribe {
    if (!this.phaseHandlers.has(phase)) {
      this.phaseHandlers.set(phase, new Set());
    }
    this.phaseHandlers.get(phase)!.add(handler);

    return () => {
      this.phaseHandlers.get(phase)?.delete(handler);
    };
  }

  /** 测试用：重置状态 */
  reset(): void {
    this.handlers.clear();
    this.phaseHandlers.clear();
    this.processedKeys.clear();
  }
}
