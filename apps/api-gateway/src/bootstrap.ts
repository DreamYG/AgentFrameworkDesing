import type { AgentStreamEvent, ILLMProvider } from '@nexus/shared';
import {
  AgentRuntimeImpl,
  HookRegistry,
  CheckpointManager,
  InMemoryCheckpointStore,
  type ToolExecutor,
} from '@nexus/kernel';
import {
  AgentRegistry,
  ControlPlaneOrchestrator,
  IntentRouter,
  PackRegistry,
} from '@nexus/control-plane';
import { InMemoryAgentStreamBroker } from '@nexus/observability';
import { NexusLogger } from '@nexus/observability';
import { PHASE_INTENT_MANIFEST, registerPhaseIntentAgents } from '@nexus/phase-intent';
import { InMemoryPhaseBridge, type IPhaseBridge } from '@nexus/shared';
import { GatewayServer, type GatewayConfig, type NexusMessage } from './server.js';
import { MessageRouter } from './middleware/message-router.js';

export interface NexusAppDeps {
  readonly gatewayConfig: GatewayConfig;
  readonly provider: ILLMProvider;
  readonly toolExecutor: ToolExecutor;
  readonly defaultModel: string;
  readonly phaseBridge?: IPhaseBridge;
  readonly logger?: NexusLogger;
}

export interface NexusApp {
  readonly gateway: GatewayServer;
  readonly orchestrator: ControlPlaneOrchestrator;
  readonly runtime: AgentRuntimeImpl;
  readonly registry: AgentRegistry;
  readonly broker: InMemoryAgentStreamBroker;
  readonly packRegistry: PackRegistry;
  readonly phaseBridge: IPhaseBridge;
  start(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * 装配 Nexus 应用：Gateway+Orchestrator+Runtime+Registry+StreamBroker
 * 串联所有 callback 注入点，使审批 resume / 流式推送 / Agent 路由真实可用
 */
export function createNexusApp(deps: NexusAppDeps): NexusApp {
  const logger = deps.logger ?? new NexusLogger();
  const registry = new AgentRegistry();
  const definitions = registerPhaseIntentAgents(registry);
  const intentRouter = new IntentRouter({ fallbackAgentId: definitions[0]?.id ?? 'requirement-analyst', confidenceThreshold: 0.5 });
  intentRouter.registerAgents(definitions);
  const packRegistry = new PackRegistry();
  packRegistry.install(PHASE_INTENT_MANIFEST as unknown as Parameters<PackRegistry['install']>[0], '0.0.1');
  packRegistry.enable(PHASE_INTENT_MANIFEST.id);
  const phaseBridge = deps.phaseBridge ?? new InMemoryPhaseBridge();

  const hookRegistry = new HookRegistry();
  const checkpointManager = new CheckpointManager();
  checkpointManager.setStore(new InMemoryCheckpointStore());

  const defaultAgent = definitions[0];
  if (!defaultAgent) {
    throw new Error('No phase-intent agents registered');
  }

  const runtime = new AgentRuntimeImpl({
    id: defaultAgent.id,
    name: defaultAgent.name,
    description: defaultAgent.description,
    version: defaultAgent.version,
    phase: defaultAgent.phase,
    provider: deps.provider,
    toolExecutor: deps.toolExecutor,
    hookRegistry,
    checkpointManager,
    systemPrompt: [
      defaultAgent.promptTemplate.identity,
      defaultAgent.promptTemplate.safetyConstraints,
      defaultAgent.promptTemplate.skillIndex,
      defaultAgent.promptTemplate.toolSignatures,
    ].join('\n\n'),
    model: deps.defaultModel,
  });

  const orchestrator = new ControlPlaneOrchestrator();
  orchestrator.setRuntime(runtime);
  orchestrator.setRuntimeEventHandler(async (runId, event) => {
    logStreamEvent(logger, runId, event);
    await broker.publishEvent(runId, event);
  });
  for (const definition of definitions) {
    orchestrator.policyEngine.registerAgentTools(definition.id, definition.allowedTools);
  }

  const broker = new InMemoryAgentStreamBroker();
  const gateway = new GatewayServer(deps.gatewayConfig);
  gateway.setMessageRouter(new MessageRouter({
    deduplicationTtlMs: 60 * 60 * 1000,
    rateLimitPerUser: 120,
    rateLimitWindowMs: 60 * 1000,
  }));

  gateway.onRunStatus((runId) => {
    const run = orchestrator.runManager.get(runId);
    if (!run) return { found: false };
    return { found: true, status: run.status, result: run.metadata };
  });

  gateway.onRunList(() => orchestrator.runManager.getAll());
  gateway.onApprovalList(() => orchestrator.approvalEngine.getPending());
  gateway.onAuditList((runId) => orchestrator.auditEngine.getByRun(runId));
  gateway.onPackList(() => packRegistry.getAll());
  gateway.onPackAction(async (packId, action) => {
    if (action === 'enable') packRegistry.enable(packId);
    else packRegistry.disable(packId);
  });

  gateway.onMessage(async (message: NexusMessage) => {
    logger.flow(
      { tenantId: message.tenantId },
      'gateway.message.accepted',
      { messageId: message.id, channel: message.channel },
    );
    const routed = intentRouter.route(message.content, { phase: 'intent' });
    const selectedAgent = registry.get(routed.suggestedAgentId ?? '') ?? defaultAgent;
    const run = orchestrator.createRun({
      agentId: selectedAgent.id,
      tenantId: message.tenantId,
      userId: message.userId,
      correlationId: message.id,
    });
    await phaseBridge.publish({
      id: crypto.randomUUID(),
      schemaVersion: '1.0',
      source: 'intent',
      type: 'task.created',
      payload: { content: message.content, agentId: selectedAgent.id },
      correlationId: message.id,
      causationId: message.id,
      idempotencyKey: `${message.id}:task.created`,
      tenantId: message.tenantId,
      actor: { type: 'user', id: message.userId, name: message.userId },
      dataClassification: 'internal',
      timestamp: new Date(),
    });
    logger.flow(
      { runId: run.id, tenantId: message.tenantId, agentId: selectedAgent.id },
      'control_plane.run.created',
      { correlationId: message.id, routeConfidence: routed.confidence },
    );

    void (async () => {
      const controller = new AbortController();
      try {
        for await (const event of runtime.start(
          { content: message.content },
          {
            runId: run.id,
            tenantId: message.tenantId,
            userId: message.userId,
            correlationId: message.id,
            abortSignal: controller.signal,
          },
        )) {
          const control = orchestrator.processEvent(event, run.id, message.tenantId, selectedAgent.id);
          logStreamEvent(logger, run.id, event);
          await broker.publishEvent(run.id, event);
          gateway.updateRunStatus(run.id, orchestrator.runManager.get(run.id)?.status ?? 'running');
          if (control.shouldPause) {
            logger.flow(
              { runId: run.id, tenantId: message.tenantId, agentId: selectedAgent.id },
              'control_plane.run.paused',
              { reason: control.pauseReason, approvalRequestId: control.approvalRequestId },
            );
            controller.abort();
            break;
          }
        }
      } catch (error) {
        const errorEvent: AgentStreamEvent = {
          type: 'error',
          code: 'RUNTIME.UNHANDLED',
          message: error instanceof Error ? error.message : String(error),
          recoverable: false,
          runId: run.id,
        };
        await broker.publishEvent(run.id, errorEvent);
        gateway.updateRunStatus(run.id, 'failed', errorEvent);
        logger.error(
          { runId: run.id, tenantId: message.tenantId, agentId: selectedAgent.id },
          'runtime.run.failed',
          error,
        );
      }
    })();

    return { requestId: message.id, runId: run.id, status: 'accepted' };
  });

  gateway.onApprove(async (runId, approved, approver) => {
    logger.flow({ runId }, 'approval.decision.received', { approved, approver });
    const pending = orchestrator.approvalEngine.getPendingByRun(runId);
    for (const request of pending) {
      if (approved) {
        orchestrator.approvalEngine.approve(request.id, approver);
      } else {
        orchestrator.approvalEngine.deny(request.id, approver);
      }
    }
  });

  gateway.onCancel(async (runId, reason) => {
    await orchestrator.cancelRun(runId, reason);
    gateway.updateRunStatus(runId, orchestrator.runManager.get(runId)?.status ?? 'cancelled');
    logger.flow({ runId }, 'control_plane.run.cancelled', { reason });
  });

  gateway.onResume(async (runId) => {
    logger.flow({ runId }, 'runtime.resume.started');
    for await (const event of orchestrator.resumeRun(runId)) {
      await broker.publishEvent(runId, event);
      gateway.updateRunStatus(runId, orchestrator.runManager.get(runId)?.status ?? 'running');
    }
    logger.flow({ runId }, 'runtime.resume.finished');
  });

  gateway.onBudgetRefill(async (runId, amount) => {
    orchestrator.refillBudget(runId, amount);
    logger.flow({ runId }, 'budget.refilled', { amount });
    for await (const event of orchestrator.resumeRun(runId)) {
      await broker.publishEvent(runId, event);
      gateway.updateRunStatus(runId, orchestrator.runManager.get(runId)?.status ?? 'running');
    }
  });

  gateway.onStreamSubscribe((runId) =>
    (async function* () {
      for await (const envelope of broker.subscribe(runId, {
        consumerId: `gateway-${runId}`,
        maxInFlight: 100,
      })) {
        yield envelope.event;
      }
    })(),
  );

  return {
    gateway,
    orchestrator,
    runtime,
    registry,
    broker,
    packRegistry,
    phaseBridge,
    async start() {
      logger.flow({}, 'gateway.starting', { port: deps.gatewayConfig.port });
      await gateway.start();
      logger.flow({}, 'gateway.started', { port: deps.gatewayConfig.port });
    },
    async stop() {
      logger.flow({}, 'gateway.stopping');
      await gateway.stop();
      logger.flow({}, 'gateway.stopped');
    },
  };
}

function logStreamEvent(logger: NexusLogger, runId: string, event: AgentStreamEvent): void {
  const ctx = { runId };
  switch (event.type) {
    case 'tool_use_start':
      logger.flow(ctx, 'tool.use.started', { toolName: event.toolName, toolCallId: event.toolCallId });
      break;
    case 'tool_use_result':
      logger.flow(ctx, 'tool.use.finished', { toolName: event.toolName, toolCallId: event.toolCallId, durationMs: event.durationMs });
      logger.debug(ctx, 'tool.use.result.detail', { result: event.result });
      break;
    case 'tool_use_error':
      logger.warn(ctx, 'tool.use.failed', { toolName: event.toolName, toolCallId: event.toolCallId, recoverable: event.recoverable });
      logger.debug(ctx, 'tool.use.error.detail', { error: event.error });
      break;
    case 'approval_required':
      logger.flow(ctx, 'approval.required', { requestId: event.requestId, toolName: event.toolName, reason: event.reason });
      break;
    case 'checkpoint':
      logger.flow(ctx, 'checkpoint.saved', { checkpointId: event.checkpointId, turnCount: event.turnCount });
      break;
    case 'compact':
      logger.flow(ctx, 'compact.executed', { level: event.level, tokensFreed: event.tokensFreed, evidencePreserved: event.evidencePreserved });
      break;
    case 'budget_warning':
      logger.warn(ctx, 'budget.warning', { dimension: event.dimension, usage: event.usage, limit: event.limit });
      break;
    case 'completed':
      logger.flow(ctx, 'runtime.run.completed', { ...event.result });
      break;
    case 'error':
      logger.error(ctx, 'runtime.event.error', { code: event.code, message: event.message, recoverable: event.recoverable });
      break;
    default:
      logger.debug(ctx, 'runtime.event.detail', { type: event.type });
      break;
  }
}
