export * from './agents/index.js';

/** Phase 1 能力包 Manifest（代码形式，可转为 YAML） */
export const PHASE_INTENT_MANIFEST = {
  id: 'nexus-phase-intent',
  name: 'Phase 1 Intent Layer',
  version: '0.1.0',
  level: 4 as const,
  type: 'agent' as const,
  phase: 'intent' as const,
  description: '项目管理意图层能力包：需求分析、任务拆解、进度追踪、催办',
  author: 'Nexus Core',
  kernelCompatibility: '>=0.0.1',
  provisions: [
    { type: 'agent' as const, id: 'requirement-analyst', description: '需求分析', exports: [] },
    { type: 'agent' as const, id: 'task-planner', description: '任务拆解', exports: [] },
    { type: 'agent' as const, id: 'project-doctor', description: '项目诊断', exports: [] },
    { type: 'agent' as const, id: 'progress-tracker', description: '进度追踪', exports: [] },
    { type: 'agent' as const, id: 'reminder', description: '智能催办', exports: [] },
    { type: 'agent' as const, id: 'estimation', description: '工时估算', exports: [] },
  ],
  requirements: [],
  lifecycle: {},
  healthCheck: '/health',
} as const;
