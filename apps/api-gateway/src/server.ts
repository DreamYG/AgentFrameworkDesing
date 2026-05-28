import type { AgentStreamEvent } from '@nexus/shared';
import Fastify, { type FastifyInstance } from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ConnectorRegistry, type ConnectorDefinition, type ConnectorToolBridge } from '@nexus/tool-gateway';
import { MessageRouter } from './middleware/message-router.js';
import { FeishuChannelAdapter, type FeishuWebhookPayload } from './channels/feishu.js';

export interface GatewayConfig {
  readonly port: number;
  readonly corsOrigins: readonly string[];
  readonly hmacSecret?: string;
  readonly feishuEncryptKey?: string;
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

export type MessageHandler = (message: NexusMessage) => Promise<GatewayResponse>;
export type StreamSubscriber = (runId: string) => AsyncIterable<AgentStreamEvent> | null;
export type RunStatusProvider = (runId: string) => { found: boolean; status?: string; result?: unknown };
export type RunListProvider = () => readonly unknown[];

/**
 * Gateway Server — Fastify HTTP/WS 路由
 * 路由：POST /api/v1/messages, GET /api/v1/runs/:id, POST /api/v1/runs/:id/approve
 */
export class GatewayServer {
  private running = false;
  private app: FastifyInstance | null = null;
  private messageHandler?: MessageHandler;
  private streamSubscriber?: StreamSubscriber;
  private approveHandler?: (runId: string, approved: boolean, approver: string) => Promise<void>;
  private cancelHandler?: (runId: string, reason: string) => Promise<void>;
  private resumeHandler?: (runId: string) => Promise<void>;
  private budgetRefillHandler?: (runId: string, amount?: number) => Promise<void>;
  private auditProvider?: (runId: string) => readonly unknown[];
  private tenantAuditProvider?: (tenantId: string) => readonly unknown[];
  private approvalsProvider?: () => readonly unknown[];
  private packsProvider?: () => readonly unknown[];
  private packActionHandler?: (packId: string, action: 'enable' | 'disable' | 'uninstall') => Promise<void>;
  private packInstallHandler?: (manifest: unknown) => Promise<void>;
  private packHealthProvider?: (packId: string) => Promise<unknown>;
  private agentsProvider?: () => readonly unknown[];
  private budgetProvider?: (runId: string) => unknown;
  private runStatusProvider?: RunStatusProvider;
  private runListProvider?: RunListProvider;
  private messageRouter?: MessageRouter;
  private feishuAdapter?: FeishuChannelAdapter;
  private connectorBridge?: ConnectorToolBridge;
  private healthChecks: ReadonlyArray<{ name: string; check: () => Promise<void> }> = [];
  private readonly runs = new Map<string, { status: string; result?: unknown }>();
  private readonly connectors = new ConnectorRegistry();

  constructor(private readonly config: GatewayConfig) {
    if (config.feishuEncryptKey) {
      this.feishuAdapter = new FeishuChannelAdapter(config.feishuEncryptKey);
    }
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  onStreamSubscribe(subscriber: StreamSubscriber): void {
    this.streamSubscriber = subscriber;
  }

  onApprove(handler: (runId: string, approved: boolean, approver: string) => Promise<void>): void {
    this.approveHandler = handler;
  }

  onCancel(handler: (runId: string, reason: string) => Promise<void>): void {
    this.cancelHandler = handler;
  }

  onResume(handler: (runId: string) => Promise<void>): void {
    this.resumeHandler = handler;
  }

  onBudgetRefill(handler: (runId: string, amount?: number) => Promise<void>): void {
    this.budgetRefillHandler = handler;
  }

  onAuditList(provider: (runId: string) => readonly unknown[]): void {
    this.auditProvider = provider;
  }

  onTenantAuditList(provider: (tenantId: string) => readonly unknown[]): void {
    this.tenantAuditProvider = provider;
  }

  onApprovalList(provider: () => readonly unknown[]): void {
    this.approvalsProvider = provider;
  }

  onPackList(provider: () => readonly unknown[]): void {
    this.packsProvider = provider;
  }

  onPackAction(handler: (packId: string, action: 'enable' | 'disable' | 'uninstall') => Promise<void>): void {
    this.packActionHandler = handler;
  }

  onPackInstall(handler: (manifest: unknown) => Promise<void>): void {
    this.packInstallHandler = handler;
  }

  onPackHealth(provider: (packId: string) => Promise<unknown>): void {
    this.packHealthProvider = provider;
  }

  onAgentList(provider: () => readonly unknown[]): void {
    this.agentsProvider = provider;
  }

  onBudgetGet(provider: (runId: string) => unknown): void {
    this.budgetProvider = provider;
  }

  onRunStatus(provider: RunStatusProvider): void {
    this.runStatusProvider = provider;
  }

  onRunList(provider: RunListProvider): void {
    this.runListProvider = provider;
  }

  setMessageRouter(router: MessageRouter): void {
    this.messageRouter = router;
  }

  setConnectorBridge(bridge: ConnectorToolBridge): void {
    this.connectorBridge = bridge;
  }

  /** 注入依赖健康检查（DB / Redis 等），任一失败 /health 返 503 */
  setHealthChecks(checks: ReadonlyArray<{ name: string; check: () => Promise<void> }>): void {
    this.healthChecks = checks;
  }

  /**
   * POST /api/v1/messages — 接收消息并路由
   */
  async handleMessage(request: {
    body: { id?: string; content: string; tenantId?: string; userId?: string; channel?: string; metadata?: Record<string, unknown> };
    headers?: Record<string, string>;
  }): Promise<GatewayResponse> {
    if (!this.messageHandler) {
      return { requestId: '', status: 'error', message: 'No message handler registered' };
    }

    const messageId = request.body.id ?? crypto.randomUUID();

    if (this.config.hmacSecret && request.headers) {
      const signature = request.headers['x-nexus-signature'];
      if (!this.verifyHmac(request.body.content, signature)) {
        return { requestId: messageId, status: 'rejected', message: 'Invalid signature' };
      }
    }

    const routed = await (this.messageRouter?.route({
      id: messageId,
      tenantId: request.body.tenantId ?? 'default',
      userId: request.body.userId ?? 'anonymous',
      channel: (request.body.channel as NexusMessage['channel']) ?? 'http',
      content: request.body.content,
      metadata: request.body.metadata,
    }) ?? Promise.resolve({
      accepted: true as const,
      message: {
        id: messageId,
        tenantId: request.body.tenantId ?? 'default',
        userId: request.body.userId ?? 'anonymous',
        channel: (request.body.channel as NexusMessage['channel']) ?? 'http',
        content: request.body.content,
        metadata: request.body.metadata,
        timestamp: new Date(),
      },
    }));

    if (!routed.accepted) {
      return { requestId: messageId, status: 'rejected', message: routed.reason };
    }

    const message = routed.message;
    const response = await this.messageHandler(message);
    if (response.runId) {
      this.runs.set(response.runId, { status: 'running' });
    }
    return response;
  }

  async handleHealth(): Promise<{
    status: 'ok' | 'degraded';
    uptimeSeconds: number;
    checks: Record<string, { healthy: boolean; error?: string }>;
  }> {
    const checks: Record<string, { healthy: boolean; error?: string }> = {};
    let allOk = true;
    for (const { name, check } of this.healthChecks) {
      try {
        await check();
        checks[name] = { healthy: true };
      } catch (error) {
        allOk = false;
        checks[name] = {
          healthy: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }
    return {
      status: allOk ? 'ok' : 'degraded',
      uptimeSeconds: Math.round(process.uptime()),
      checks,
    };
  }

  handleReady(): { ready: boolean; running: boolean } {
    return { ready: this.messageHandler !== undefined, running: this.running };
  }

  async handleFeishuWebhook(request: {
    body: FeishuWebhookPayload;
    rawBody?: string;
    headers?: Record<string, string>;
  }): Promise<GatewayResponse | { challenge: string }> {
    if (request.body.challenge) {
      return { challenge: request.body.challenge };
    }
    if (!this.feishuAdapter) {
      return { requestId: '', status: 'rejected', message: 'Feishu channel not configured' };
    }
    const timestamp = request.headers?.['x-lark-request-timestamp'] ?? '';
    const nonce = request.headers?.['x-lark-request-nonce'] ?? '';
    const signature = request.headers?.['x-lark-signature'] ?? '';
    if (timestamp && nonce && signature && request.rawBody) {
      const valid = this.feishuAdapter.verify(timestamp, nonce, request.rawBody, signature);
      if (!valid) return { requestId: '', status: 'rejected', message: 'Invalid Feishu signature' };
    }
    const message = this.feishuAdapter.normalize(request.body);
    if (!message) return { requestId: '', status: 'rejected', message: 'Unsupported Feishu payload' };
    return this.messageHandler?.(message) ?? { requestId: message.id, status: 'error', message: 'No message handler registered' };
  }

  /**
   * GET /api/v1/runs/:id — 获取 Run 状态
   */
  async handleGetRun(runId: string): Promise<{ found: boolean; status?: string; result?: unknown }> {
    const provided = this.runStatusProvider?.(runId);
    if (provided?.found) return provided;
    const run = this.runs.get(runId);
    if (!run) return { found: false };
    return { found: true, ...run };
  }

  /**
   * POST /api/v1/runs/:id/approve — 审批操作
   */
  async handleApprove(runId: string, body: { approved: boolean; approver: string }): Promise<{ success: boolean }> {
    if (!this.approveHandler) return { success: false };
    await this.approveHandler(runId, body.approved, body.approver);
    return { success: true };
  }

  listRuns(): readonly unknown[] {
    return this.runListProvider?.() ?? [...this.runs.entries()].map(([runId, run]) => ({ runId, ...run }));
  }

  listApprovals(): readonly unknown[] {
    return this.approvalsProvider?.() ?? [];
  }

  listAudit(runId: string): readonly unknown[] {
    return this.auditProvider?.(runId) ?? [];
  }

  listTenantAudit(tenantId: string): readonly unknown[] {
    return this.tenantAuditProvider?.(tenantId) ?? [];
  }

  listAgents(): readonly unknown[] {
    return this.agentsProvider?.() ?? [];
  }

  getBudget(runId: string): unknown {
    return this.budgetProvider?.(runId) ?? null;
  }

  async handleCancel(runId: string, body: { reason?: string }): Promise<{ success: boolean }> {
    if (!this.cancelHandler) return { success: false };
    await this.cancelHandler(runId, body.reason ?? 'user_cancel');
    return { success: true };
  }

  async handleResume(runId: string): Promise<{ success: boolean }> {
    if (!this.resumeHandler) return { success: false };
    await this.resumeHandler(runId);
    return { success: true };
  }

  async handleBudgetRefill(runId: string, body: { amount?: number }): Promise<{ success: boolean }> {
    if (!this.budgetRefillHandler) return { success: false };
    await this.budgetRefillHandler(runId, body.amount);
    return { success: true };
  }

  listPacks(): readonly unknown[] {
    return this.packsProvider?.() ?? [];
  }

  async handlePackAction(packId: string, action: 'enable' | 'disable' | 'uninstall'): Promise<{ success: boolean }> {
    if (!this.packActionHandler) return { success: false };
    await this.packActionHandler(packId, action);
    return { success: true };
  }

  async handlePackInstall(manifest: unknown): Promise<{ success: boolean }> {
    if (!this.packInstallHandler) return { success: false };
    await this.packInstallHandler(manifest);
    return { success: true };
  }

  /**
   * WS /ws/stream/:runId — 流式事件推送
   */
  async *streamEvents(runId: string): AsyncGenerator<AgentStreamEvent> {
    if (!this.streamSubscriber) return;
    const stream = this.streamSubscriber(runId);
    if (!stream) return;
    for await (const event of stream) {
      yield event;
    }
  }

  updateRunStatus(runId: string, status: string, result?: unknown): void {
    this.runs.set(runId, { status, result });
  }

  async start(): Promise<void> {
    if (this.running) return;

    this.app = Fastify({ logger: true });
    await this.app.register(cors, { origin: [...this.config.corsOrigins] });
    await this.app.register(websocket);

    this.app.get('/health', async (_request, reply) => {
      const health = await this.handleHealth();
      return reply.code(health.status === 'ok' ? 200 : 503).send(health);
    });
    this.app.get('/ready', async (_request, reply) => {
      const ready = this.handleReady();
      return reply.code(ready.ready ? 200 : 503).send(ready);
    });

    this.app.post('/api/v1/messages', async (request, reply) => {
      const response = await this.handleMessage({
        body: request.body as {
          id?: string;
          content: string;
          tenantId?: string;
          userId?: string;
          channel?: string;
          metadata?: Record<string, unknown>;
        },
        headers: Object.fromEntries(
          Object.entries(request.headers).map(([key, value]) => [key, String(value)]),
        ),
      });

      const statusCode = response.status === 'accepted' ? 202 : response.status === 'rejected' ? 400 : 500;
      return reply.code(statusCode).send(response);
    });

    this.app.post('/webhooks/feishu', async (request, reply) => {
      const response = await this.handleFeishuWebhook({
        body: request.body as FeishuWebhookPayload,
        rawBody: JSON.stringify(request.body ?? {}),
        headers: Object.fromEntries(
          Object.entries(request.headers).map(([key, value]) => [key, String(value)]),
        ),
      });
      if ('challenge' in response) return reply.send(response);
      const statusCode = response.status === 'accepted' ? 202 : response.status === 'rejected' ? 400 : 500;
      return reply.code(statusCode).send(response);
    });

    this.app.get('/api/v1/runs/:id', async (request, reply) => {
      const params = request.params as { id: string };
      const response = await this.handleGetRun(params.id);
      return reply.code(response.found ? 200 : 404).send(response);
    });

    this.app.get('/api/v1/runs', async (_request, reply) => {
      return reply.send({ runs: this.listRuns() });
    });

    this.app.post('/api/v1/runs/:id/approve', async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { approved: boolean; approver: string };
      const response = await this.handleApprove(params.id, body);
      return reply.code(response.success ? 200 : 400).send(response);
    });

    this.app.post('/api/v1/runs/:id/cancel', async (request, reply) => {
      const params = request.params as { id: string };
      const response = await this.handleCancel(params.id, request.body as { reason?: string });
      return reply.code(response.success ? 200 : 400).send(response);
    });

    this.app.post('/api/v1/runs/:id/resume', async (request, reply) => {
      const params = request.params as { id: string };
      const response = await this.handleResume(params.id);
      return reply.code(response.success ? 200 : 400).send(response);
    });

    this.app.post('/api/v1/runs/:id/budget/refill', async (request, reply) => {
      const params = request.params as { id: string };
      const response = await this.handleBudgetRefill(params.id, request.body as { amount?: number });
      return reply.code(response.success ? 200 : 400).send(response);
    });

    this.app.get('/api/v1/runs/:id/audit', async (request, reply) => {
      const params = request.params as { id: string };
      return reply.send({ audit: this.listAudit(params.id) });
    });

    this.app.get('/api/v1/runs/:id/budget', async (request, reply) => {
      const params = request.params as { id: string };
      return reply.send({ budget: this.getBudget(params.id) });
    });

    this.app.get('/api/v1/audit', async (request, reply) => {
      const query = request.query as { tenantId?: string };
      return reply.send({ audit: this.listTenantAudit(query.tenantId ?? 'default') });
    });

    this.app.get('/api/v1/agents', async (_request, reply) => {
      return reply.send({ agents: this.listAgents() });
    });

    this.app.get('/api/v1/approvals/pending', async (_request, reply) => {
      return reply.send({ approvals: this.listApprovals() });
    });

    this.app.get('/api/v1/packs', async (_request, reply) => {
      return reply.send({ packs: this.listPacks() });
    });

    this.app.post('/api/v1/packs/install', async (request, reply) => {
      const response = await this.handlePackInstall(request.body);
      return reply.code(response.success ? 201 : 400).send(response);
    });

    this.app.post('/api/v1/packs/:id/enable', async (request, reply) => {
      const params = request.params as { id: string };
      const response = await this.handlePackAction(params.id, 'enable');
      return reply.code(response.success ? 200 : 400).send(response);
    });

    this.app.post('/api/v1/packs/:id/disable', async (request, reply) => {
      const params = request.params as { id: string };
      const response = await this.handlePackAction(params.id, 'disable');
      return reply.code(response.success ? 200 : 400).send(response);
    });

    this.app.post('/api/v1/packs/:id/uninstall', async (request, reply) => {
      const params = request.params as { id: string };
      const response = await this.handlePackAction(params.id, 'uninstall');
      return reply.code(response.success ? 200 : 400).send(response);
    });

    this.app.get('/api/v1/packs/:id/health', async (request, reply) => {
      const params = request.params as { id: string };
      return reply.send(await this.packHealthProvider?.(params.id) ?? { healthy: false });
    });

    this.app.post('/api/v1/connectors', async (request, reply) => {
      const connector = request.body as ConnectorDefinition;
      this.connectors.register(connector);
      return reply.code(201).send({ success: true, id: connector.id });
    });

    this.app.get('/api/v1/connectors', async (_request, reply) => {
      return reply.send({ connectors: this.connectors.list() });
    });

    this.app.post('/api/v1/connectors/:id/enable', async (request, reply) => {
      const params = request.params as { id: string };
      this.connectors.enable(params.id);
      const connector = this.connectors.get(params.id);
      const tools = connector ? await this.connectorBridge?.enable(connector) : [];
      return reply.send({ success: true, tools });
    });

    this.app.post('/api/v1/connectors/:id/disable', async (request, reply) => {
      const params = request.params as { id: string };
      this.connectors.disable(params.id);
      await this.connectorBridge?.disable(params.id);
      return reply.send({ success: true });
    });

    this.app.get('/api/v1/connectors/:id/health', async (request, reply) => {
      const params = request.params as { id: string };
      return reply.send(await this.connectors.healthCheck(params.id));
    });

    this.app.post('/api/v1/connectors/:id/credentials', async (request, reply) => {
      const params = request.params as { id: string };
      const body = request.body as { secretRef: string };
      this.connectors.bindCredential(params.id, body.secretRef);
      return reply.send({ success: true });
    });

    this.app.get('/ws/stream/:runId', { websocket: true }, (socket: any, request) => {
      const params = request.params as { runId: string };
      void (async () => {
        for await (const event of this.streamEvents(params.runId)) {
          socket.send(JSON.stringify(event));
        }
      })();
    });

    await this.app.listen({ port: this.config.port, host: '0.0.0.0' });
    this.running = true;
  }

  async stop(): Promise<void> {
    if (this.app) {
      await this.app.close();
      this.app = null;
    }
    this.running = false;
  }

  isRunning(): boolean {
    return this.running;
  }

  getConfig(): GatewayConfig {
    return this.config;
  }

  private verifyHmac(content: string, signature: string | undefined): boolean {
    if (!signature) return false;
    if (!this.config.hmacSecret) return false;

    const expected = createHmac('sha256', this.config.hmacSecret)
      .update(content)
      .digest('hex');

    const normalized = signature.startsWith('sha256=')
      ? signature.slice('sha256='.length)
      : signature;

    const expectedBuffer = Buffer.from(expected, 'hex');
    const actualBuffer = Buffer.from(normalized, 'hex');

    if (expectedBuffer.length !== actualBuffer.length) return false;
    return timingSafeEqual(expectedBuffer, actualBuffer);
  }
}
