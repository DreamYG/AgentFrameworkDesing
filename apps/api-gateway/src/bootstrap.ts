import type { AgentStreamEvent, ILLMProvider } from '@nexus/shared';
import {
  AgentRuntimeImpl,
  CheckpointManager,
  DefaultContextBackfiller,
  DefaultEnvironmentInjector,
  DelegateEngine,
  GracefulShutdownController,
  HookRegistry,
  InMemoryCheckpointStore,
  OERCDEngine,
  type ChildRunHandle,
  type ChildRunStartParams,
  type CompactRuntimeOptions,
  type IChildRunStarter,
  type ICheckpointStore,
  type ToolExecutor,
} from '@nexus/kernel';
import {
  AgentRegistry,
  ControlPlaneOrchestrator,
  FeatureFlagRegistry,
  IntentRouter,
  PackRegistry,
  type IntentCache,
  type IntentRouterMetricEvent,
  type LLMIntentClassifier,
} from '@nexus/control-plane';
import { InMemoryAgentStreamBroker } from '@nexus/observability';
import { NexusLogger } from '@nexus/observability';
import { PromptAssembler } from '@nexus/providers';
import { PHASE_INTENT_MANIFEST, registerPhaseIntentAgents, type PhaseIntentAgentOverride } from '@nexus/phase-intent';
import { InMemoryPhaseBridge, type IPhaseBridge } from '@nexus/shared';
import type {
  AgentRunsRepository,
  ApprovalRequestsRepository,
  AuditLogsRepository,
  InstalledPacksRepository,
} from '@nexus/infra';
import { registerDelegateTool, type ConnectorToolBridge, type ToolGatewayPipeline } from '@nexus/tool-gateway';
import { GatewayServer, type GatewayConfig, type NexusMessage } from './server.js';
import { MessageRouter } from './middleware/message-router.js';

export interface NexusAppDeps {
  readonly gatewayConfig: GatewayConfig;
  readonly provider: ILLMProvider;
  readonly toolExecutor: ToolExecutor;
  readonly defaultModel: string;
  readonly phaseBridge?: IPhaseBridge;
  readonly logger?: NexusLogger;
  readonly messageRouter?: MessageRouter;
  readonly checkpointStore?: ICheckpointStore;
  readonly sessionShadow?: {
    update(runId: string, delta: { turnIndex: number; progress?: string }): Promise<unknown>;
    get(runId: string): Promise<{ progressSummary: string } | null>;
  };
  readonly oercd?: OERCDEngine;
  readonly connectorBridge?: ConnectorToolBridge;
  /** GracefulShutdownController；SIGTERM 时排水活动 Run */
  readonly shutdownController?: GracefulShutdownController;
  /** ToolGatewayPipeline；提供时会注册 ai.agent.invoke 子 Agent 委派工具 */
  readonly toolPipeline?: ToolGatewayPipeline;
  /** 委派最大递归深度，默认 3 */
  readonly delegateMaxDepth?: number;
  /** Compact L4 模型 / 保留轮数 / 证据持久化端口 */
  readonly compactOptions?: CompactRuntimeOptions;
  /** 每个 Agent 的运行时模型覆盖（来自 env/YAML） */
  readonly agentOverrides?: Readonly<Record<string, PhaseIntentAgentOverride>>;
  /** 可选的 LLM 意图分类器，未提供时使用关键词启发式 */
  readonly intentClassifier?: LLMIntentClassifier;
  /** 意图分类信心阈值，默认 0.5 */
  readonly intentConfidenceThreshold?: number;
  /** 信心低于此值且关键词无命中时要求用户澄清；默认 0.2 */
  readonly intentClarificationThreshold?: number;
  /** 意图缓存（Redis 实现注入），命中后跳过 LLM */
  readonly intentCache?: IntentCache;
  readonly intentCacheTtlSec?: number;
  /** 自定义 Phase 关键词（来自 env） */
  readonly intentExecutionKeywords?: readonly string[];
  readonly intentConnectionKeywords?: readonly string[];
  readonly persistence?: {
    readonly agentRuns?: AgentRunsRepository;
    readonly auditLogs?: AuditLogsRepository;
    readonly approvals?: ApprovalRequestsRepository;
    readonly packs?: InstalledPacksRepository;
    readonly tenantId: string;
  };
}

export interface NexusApp {
  readonly gateway: GatewayServer;
  readonly orchestrator: ControlPlaneOrchestrator;
  readonly runtime: AgentRuntimeImpl;
  readonly registry: AgentRegistry;
  readonly broker: InMemoryAgentStreamBroker;
  readonly packRegistry: PackRegistry;
  readonly phaseBridge: IPhaseBridge;
  readonly delegateEngine: DelegateEngine;
  readonly shutdownController: GracefulShutdownController;
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
  const definitions = registerPhaseIntentAgents(registry, deps.agentOverrides);
  const intentRouter = new IntentRouter({
    fallbackAgentId: definitions[0]?.id ?? 'requirement-analyst',
    confidenceThreshold: deps.intentConfidenceThreshold ?? 0.5,
    clarificationThreshold: deps.intentClarificationThreshold ?? 0,
    llmClassifier: deps.intentClassifier,
    cache: deps.intentCache,
    cacheTtlSec: deps.intentCacheTtlSec ?? 60,
    executionKeywords: deps.intentExecutionKeywords,
    connectionKeywords: deps.intentConnectionKeywords,
    onMetric: (event: IntentRouterMetricEvent) => {
      logger.flow(
        { tenantId: event.tenantId, agentId: event.agentId },
        'intent.metric',
        {
          source: event.source,
          latencyMs: event.latencyMs,
          confidence: event.confidence,
          cacheHit: event.cacheHit,
        },
      );
    },
  });
  intentRouter.registerAgents(definitions);
  const packRegistry = new PackRegistry();
  const featureFlags = new FeatureFlagRegistry();
  featureFlags.set({ key: 'phase-intent-pack', enabled: true, rolloutPercent: 100 });
  packRegistry.install(PHASE_INTENT_MANIFEST as unknown as Parameters<PackRegistry['install']>[0], '0.0.1');
  packRegistry.enable(PHASE_INTENT_MANIFEST.id);
  void deps.persistence?.packs?.upsert({
    id: PHASE_INTENT_MANIFEST.id,
    tenantId: deps.persistence.tenantId,
    name: PHASE_INTENT_MANIFEST.name,
    version: PHASE_INTENT_MANIFEST.version,
    status: 'enabled',
    manifest: PHASE_INTENT_MANIFEST as unknown as Record<string, unknown>,
    enabledAt: new Date(),
  });
  const phaseBridge = deps.phaseBridge ?? new InMemoryPhaseBridge();

  const hookRegistry = new HookRegistry();
  const environmentInjector = new DefaultEnvironmentInjector();
  const backfiller = new DefaultContextBackfiller();
  hookRegistry.register({
    name: 'environment.injector',
    phase: 'pre_plan',
    priority: 10,
    execute: async (ctx) => {
      const snapshot = await environmentInjector.collect(ctx.agentId, ctx.tenantId);
      backfiller.apply({
        dimension: 'environment',
        before: '',
        after: JSON.stringify(snapshot),
        toolName: 'environment.injector',
        timestamp: snapshot.collectedAt,
      });
    },
  });
  hookRegistry.register({
    name: 'session-shadow.post-sampling',
    phase: 'post_sampling',
    priority: 100,
    execute: async (ctx) => {
      await deps.sessionShadow?.update(ctx.runId, { turnIndex: ctx.turnIndex, progress: `turn=${ctx.turnIndex}` });
    },
  });
  hookRegistry.register({
    name: 'oercd.post-complete',
    phase: 'post_complete',
    priority: 200,
    execute: async (ctx) => {
      if (!deps.oercd) return;
      const oercdCtx = {
        runId: ctx.runId,
        agentId: ctx.agentId,
        tenantId: ctx.tenantId,
        taskDescription: String(ctx.data?.['taskDescription'] ?? ctx.runId),
        toolCallCount: Number(ctx.data?.['toolCallCount'] ?? 0),
      };
      await deps.oercd.recordTrace(oercdCtx, {
        runId: ctx.runId,
        steps: [{ turnIndex: ctx.turnIndex, action: 'complete', durationMs: 0, success: true }],
        totalDurationMs: 0,
        tokensUsed: 0,
      });
      void deps.oercd.reflect(oercdCtx);
    },
  });
  const checkpointManager = new CheckpointManager();
  checkpointManager.setStore(deps.checkpointStore ?? new InMemoryCheckpointStore());

  const defaultAgent = definitions[0];
  if (!defaultAgent) {
    throw new Error('No phase-intent agents registered');
  }

  const promptAssembler = new PromptAssembler();
  promptAssembler.freeze({
    identity: defaultAgent.promptTemplate.identity,
    safetyConstraints: defaultAgent.promptTemplate.safetyConstraints,
    skillIndex: defaultAgent.promptTemplate.skillIndex,
    toolSignatures: defaultAgent.promptTemplate.toolSignatures,
  });

  const shutdownController = deps.shutdownController ?? new GracefulShutdownController();
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
    shutdownController,
    systemPrompt: promptAssembler.assemble({ environmentContext: backfiller.renderForPrompt() }),
    sessionSummaryProvider: async (runId) => (await deps.sessionShadow?.get(runId))?.progressSummary ?? null,
    model: deps.defaultModel,
    modelResolver: (_input, context) => {
      const agentId = typeof context.metadata?.['agentId'] === 'string' ? String(context.metadata['agentId']) : defaultAgent.id;
      return registry.get(agentId)?.modelPreference ?? deps.defaultModel;
    },
    compactOptions: deps.compactOptions,
  });

  const orchestrator = new ControlPlaneOrchestrator();
  if (deps.persistence?.auditLogs) {
    orchestrator.auditEngine.onFlush(async (entries) => {
      for (const entry of entries) {
        await deps.persistence!.auditLogs!.append({
          tenantId: entry.tenantId,
          runId: entry.runId,
          agentId: entry.agentId,
          userId: entry.userId,
          eventType: entry.eventType,
          data: entry.data as Record<string, unknown>,
        });
      }
    });
  }
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
  if (deps.connectorBridge) gateway.setConnectorBridge(deps.connectorBridge);
  gateway.setMessageRouter(deps.messageRouter ?? new MessageRouter({
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
  gateway.onAgentList(() => registry.getAll());
  gateway.onBudgetGet((runId) => orchestrator.getBudgetState(runId));
  gateway.onApprovalList(() => orchestrator.approvalEngine.getPending());
  gateway.onAuditList((runId) => orchestrator.auditEngine.getByRun(runId));
  gateway.onTenantAuditList((tenantId) => orchestrator.auditEngine.getByTenant(tenantId));
  gateway.onPackList(() => packRegistry.getAll());
  gateway.onPackInstall(async (manifest) => {
    const pack = packRegistry.install(manifest as Parameters<PackRegistry['install']>[0], '0.0.1');
    void deps.persistence?.packs?.upsert({
      id: pack.manifest.id,
      tenantId: deps.persistence.tenantId,
      name: pack.manifest.name,
      version: pack.manifest.version,
      status: pack.status,
      manifest: pack.manifest as unknown as Record<string, unknown>,
    });
  });
  gateway.onPackHealth((packId) => packRegistry.healthCheck(packId));
  gateway.onPackAction(async (packId, action) => {
    if (action === 'enable') {
      packRegistry.enable(packId);
      for (const definition of definitions) registry.setEnabled(definition.id, true);
    } else if (action === 'disable') {
      packRegistry.disable(packId);
      for (const definition of definitions) registry.setEnabled(definition.id, false);
    } else {
      packRegistry.uninstall(packId);
    }
    const pack = packRegistry.get(packId);
    if (pack) {
      void deps.persistence?.packs?.upsert({
        id: pack.manifest.id,
        tenantId: deps.persistence.tenantId,
        name: pack.manifest.name,
        version: pack.manifest.version,
        status: pack.status,
        manifest: pack.manifest as unknown as Record<string, unknown>,
        enabledAt: pack.enabledAt,
      });
    }
  });

  const delegateEngine = new DelegateEngine({
    maxDepth: deps.delegateMaxDepth ?? 3,
    starter: {
      async start(params: ChildRunStartParams): Promise<ChildRunHandle> {
        const parent = orchestrator.runManager.get(params.parentRunId);
        const tenantId = params.tenantId ?? parent?.tenantId ?? deps.persistence?.tenantId ?? 'default';
        const userId = params.userId ?? parent?.userId ?? 'system';
        const childAgent = registry.get(params.childAgentId) ?? defaultAgent;
        const childRun = orchestrator.createRun({
          agentId: childAgent.id,
          tenantId,
          userId,
          correlationId: params.parentRunId,
        });
        logger.flow(
          { runId: childRun.id, tenantId, agentId: childAgent.id },
          'delegate.child_run.started',
          { parentRunId: params.parentRunId, depth: params.depth, reason: params.reason },
        );
        const controller = new AbortController();
        const inputContent = typeof params.input === 'string' ? params.input : JSON.stringify(params.input ?? '');
        const events = (async function* () {
          try {
            for await (const event of runtime.start(
              { content: inputContent },
              {
                runId: childRun.id,
                tenantId,
                userId,
                correlationId: params.parentRunId,
                abortSignal: controller.signal,
                metadata: {
                  agentId: childAgent.id,
                  model: childAgent.modelPreference,
                  parentRunId: params.parentRunId,
                  delegationDepth: params.depth,
                  delegationReason: params.reason,
                },
              },
            )) {
              orchestrator.processEvent(event, childRun.id, tenantId, childAgent.id);
              logStreamEvent(logger, childRun.id, event);
              await broker.publishEvent(childRun.id, event);
              yield event;
            }
          } catch (error) {
            const errorEvent: AgentStreamEvent = {
              type: 'error',
              code: 'DELEGATE.UNHANDLED',
              message: error instanceof Error ? error.message : String(error),
              recoverable: false,
              runId: childRun.id,
            };
            await broker.publishEvent(childRun.id, errorEvent);
            yield errorEvent;
          }
        })();
        return {
          childRunId: childRun.id,
          events,
          cancel: async (reason: string) => {
            controller.abort();
            try {
              await orchestrator.cancelRun(childRun.id, reason);
            } catch {
              // already terminal
            }
          },
        };
      },
    } satisfies IChildRunStarter,
  });

  if (deps.toolPipeline) {
    const invokableAgents = definitions.map((d) => d.id);
    registerDelegateTool(deps.toolPipeline, {
      invokableAgents,
      invokeAgent: async (params) => {
        const result = await delegateEngine.delegate({
          parentRunId: params.runId,
          childAgentId: params.agentId,
          input: params.input,
          permissions: {
            allowedTools: registry.get(params.agentId)?.allowedTools ?? [],
            maxRiskLevel: 'R2',
            budgetRemaining: 0,
            approvalPolicy: 'standard',
          },
          budgetShare: 0.5,
          reason: params.reason,
          tenantId: params.tenantId,
        });
        return {
          childRunId: result.childRunId,
          success: result.success,
          outputText: result.outputText,
          error: result.error,
          events: result.events.length,
        };
      },
    });
    logger.flow({}, 'delegate.tool.registered', { invokableAgents, maxDepth: deps.delegateMaxDepth ?? 3 });
  }

  gateway.onMessage(async (message: NexusMessage) => {
    if (!featureFlags.isEnabled('phase-intent-pack', message.userId)) {
      return { requestId: message.id, status: 'rejected', message: 'Phase intent pack disabled by feature flag' };
    }
    logger.flow(
      { tenantId: message.tenantId },
      'gateway.message.accepted',
      { messageId: message.id, channel: message.channel },
    );
    const routed = await intentRouter.route(message.content, { tenantId: message.tenantId });
    logger.flow(
      { tenantId: message.tenantId },
      'intent.classified',
      {
        messageId: message.id,
        source: routed.source,
        confidence: routed.confidence,
        suggestedAgentId: routed.suggestedAgentId,
        intentType: routed.intentType,
        requiresClarification: routed.requiresClarification ?? false,
        reason: routed.reason,
      },
    );
    if (routed.requiresClarification) {
      logger.flow(
        { tenantId: message.tenantId },
        'intent.clarification_required',
        { messageId: message.id, confidence: routed.confidence, source: routed.source },
      );
      return {
        requestId: message.id,
        status: 'rejected',
        message: '抱歉，我没能理解您的需求。请用一句话更明确地描述要做什么，比如「拆解需求 X」「查询 X 项目进度」「与团队讨论 X」等。',
      };
    }
    const selectedAgent = registry.get(routed.suggestedAgentId ?? '') ?? defaultAgent;
    if (!routed.suggestedAgentId || !registry.get(routed.suggestedAgentId)) {
      logger.warn(
        { tenantId: message.tenantId, agentId: selectedAgent.id },
        'intent.agent_resolved_to_default',
        { suggestedAgentId: routed.suggestedAgentId, source: routed.source },
      );
    }
    const run = orchestrator.createRun({
      agentId: selectedAgent.id,
      tenantId: message.tenantId,
      userId: message.userId,
      correlationId: message.id,
    });
    void deps.persistence?.agentRuns?.create({
      id: run.id,
      tenantId: run.tenantId,
      agentId: run.agentId,
      userId: run.userId,
      correlationId: run.correlationId,
      input: { content: message.content, channel: message.channel },
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
            metadata: { agentId: selectedAgent.id, model: selectedAgent.modelPreference },
          },
        )) {
          const control = orchestrator.processEvent(event, run.id, message.tenantId, selectedAgent.id);
          if (control.approvalRequestId) {
            const request = orchestrator.approvalEngine.getRequest(control.approvalRequestId);
            if (request) {
              void deps.persistence?.approvals?.create({
                id: request.id,
                tenantId: request.tenantId,
                runId: request.runId,
                toolName: request.toolName,
                toolParams: request.toolParams as Record<string, unknown>,
                riskLevel: request.riskLevel,
                reason: request.reason,
                approvers: request.approvers,
                requiredApprovals: request.requiredApprovals,
                deadline: request.deadline,
              });
            }
          }
          if (event.type === 'completed') {
            void deps.persistence?.agentRuns?.complete(run.id, { ...event.result });
          } else {
            void deps.persistence?.agentRuns?.updateStatus(run.id, orchestrator.runManager.get(run.id)?.status ?? 'running');
          }
          void flushAudit();
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
      void deps.persistence?.approvals?.updateStatus(request.id, approved ? 'approved' : 'denied', approver);
    }
    void flushAudit();
  });

  gateway.onCancel(async (runId, reason) => {
    await orchestrator.cancelRun(runId, reason);
    void deps.persistence?.agentRuns?.updateStatus(runId, 'cancelled');
    void flushAudit();
    gateway.updateRunStatus(runId, orchestrator.runManager.get(runId)?.status ?? 'cancelled');
    logger.flow({ runId }, 'control_plane.run.cancelled', { reason });
  });

  gateway.onResume(async (runId) => {
    logger.flow({ runId }, 'runtime.resume.started');
    for await (const event of orchestrator.resumeRun(runId)) {
      gateway.updateRunStatus(runId, orchestrator.runManager.get(runId)?.status ?? 'running', event.type === 'completed' ? event.result : undefined);
      void flushAudit();
    }
    logger.flow({ runId }, 'runtime.resume.finished');
  });

  gateway.onBudgetRefill(async (runId, amount) => {
    orchestrator.refillBudget(runId, amount);
    logger.flow({ runId }, 'budget.refilled', { amount });
    for await (const event of orchestrator.resumeRun(runId)) {
      gateway.updateRunStatus(runId, orchestrator.runManager.get(runId)?.status ?? 'running', event.type === 'completed' ? event.result : undefined);
      void flushAudit();
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
    delegateEngine,
    shutdownController,
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

  async function flushAudit(): Promise<void> {
    if (deps.persistence?.auditLogs) {
      await orchestrator.auditEngine.flush();
    }
  }
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
