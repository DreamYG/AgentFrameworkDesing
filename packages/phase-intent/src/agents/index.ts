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

/** 所有 Phase 1 Agent 共享的通用 AI 工具白名单（无业务系统也可用） */
export const GENERAL_AI_TOOLS: readonly string[] = [
  'ai.chat',
  'ai.web.search',
  'ai.document.summarize',
  'ai.document.extract',
  'ai.document.qa',
  'ai.data.transform',
  'ai.skill.search',
];

/** general-assistant 额外开放：图像生成 + 子 Agent 委派（PM Agents 不直接委派他人，避免互相委派形成回路） */
const ALL_AI_TOOLS: readonly string[] = [...GENERAL_AI_TOOLS, 'ai.image.generate', 'ai.agent.invoke'];

export const PHASE_INTENT_AGENTS: readonly PhaseIntentAgentConfig[] = [
  {
    id: 'general-assistant',
    name: 'GeneralAssistantAgent',
    description: '通用 AI 助手：对话、检索、文档分析、数据处理、联网搜索、生图',
    model: 'claude-sonnet',
    tools: ALL_AI_TOOLS,
  },
  {
    id: 'requirement-analyst',
    name: 'RequirementAnalystAgent',
    description: '需求分析与澄清、结构化输出',
    model: 'claude-sonnet',
    tools: ['doc.read', 'project.query', ...GENERAL_AI_TOOLS],
  },
  {
    id: 'task-planner',
    name: 'TaskPlannerAgent',
    description: 'WBS 拆解 + 关键路径 + 工时估算',
    model: 'claude-sonnet',
    tools: ['task.decompose', 'task.assign', ...GENERAL_AI_TOOLS],
  },
  {
    id: 'project-doctor',
    name: 'ProjectDoctorAgent',
    description: '项目健康诊断 + 风险识别',
    model: 'claude-sonnet',
    tools: ['project.query', 'risk.identify', ...GENERAL_AI_TOOLS],
  },
  {
    id: 'progress-tracker',
    name: 'ProgressTrackerAgent',
    description: '进度监控 + 偏差分析 + 预测',
    model: 'claude-haiku',
    tools: ['task.query', 'milestone.query', ...GENERAL_AI_TOOLS],
  },
  {
    id: 'reminder',
    name: 'ReminderAgent',
    description: '智能催办（策略矩阵驱动）',
    model: 'claude-haiku',
    tools: ['notification.send', 'task.query', ...GENERAL_AI_TOOLS],
  },
  {
    id: 'estimation',
    name: 'EstimationAgent',
    description: 'AI 工时估算（历史数据回归）',
    model: 'claude-sonnet',
    tools: ['history.query', 'task.estimate', ...GENERAL_AI_TOOLS],
  },
];
