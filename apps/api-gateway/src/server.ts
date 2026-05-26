import type { AgentStreamEvent } from '@nexus/shared';

/**
 * API Gateway 服务器入口
 * Fastify HTTP + WebSocket + 协议归一化
 */
export interface GatewayConfig {
  readonly port: number;
  readonly wsPort: number;
  readonly corsOrigins: readonly string[];
}

export interface NexusMessage {
  readonly id: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly channel: 'http' | 'websocket' | 'cli' | 'feishu' | 'dingtalk' | 'wecom';
  readonly content: string;
  readonly metadata?: Record<string, unknown>;
  readonly timestamp: Date;
}

export interface GatewayResponse {
  readonly requestId: string;
  readonly runId?: string;
  readonly status: 'accepted' | 'rejected' | 'error';
  readonly message?: string;
}

/**
 * Gateway Server 骨架
 * 实际 Fastify 实例化在 connect() 中进行
 */
export class GatewayServer {
  private running = false;

  constructor(private readonly config: GatewayConfig) {}

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getConfig(): GatewayConfig {
    return this.config;
  }
}

export type { AgentStreamEvent };
