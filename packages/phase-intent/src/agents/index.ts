/**
 * Phase 1 — 意图层 Agent 定义
 * 所有 Agent 以能力包形式注册，可独立启用/禁用
 */

export interface PhaseIntentAgentConfig {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly model: string;
  readonly tools: readonly string[];
}

export const PHASE_INTENT_AGENTS: readonly PhaseIntentAgentConfig[] = [
  {
    id: 'requirement-analyst',
    name: 'RequirementAnalystAgent',
    description: '需求分析与澄清、结构化输出',
    model: 'claude-sonnet',
    tools: ['doc.read', 'project.query'],
  },
  {
    id: 'task-planner',
    name: 'TaskPlannerAgent',
    description: 'WBS 拆解 + 关键路径 + 工时估算',
    model: 'claude-sonnet',
    tools: ['task.decompose', 'task.assign'],
  },
  {
    id: 'project-doctor',
    name: 'ProjectDoctorAgent',
    description: '项目健康诊断 + 风险识别',
    model: 'claude-sonnet',
    tools: ['project.query', 'risk.identify'],
  },
  {
    id: 'progress-tracker',
    name: 'ProgressTrackerAgent',
    description: '进度监控 + 偏差分析 + 预测',
    model: 'claude-haiku',
    tools: ['task.query', 'milestone.query'],
  },
  {
    id: 'reminder',
    name: 'ReminderAgent',
    description: '智能催办（策略矩阵驱动）',
    model: 'claude-haiku',
    tools: ['notification.send', 'task.query'],
  },
  {
    id: 'estimation',
    name: 'EstimationAgent',
    description: 'AI 工时估算（历史数据回归）',
    model: 'claude-sonnet',
    tools: ['history.query', 'task.estimate'],
  },
];
