/**
 * PM Tools MCP Server — nexus-pm-tools
 * 完整工具 handler 实现（操作内存数据库）
 */

export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'planning' | 'active' | 'completed' | 'on_hold';
  createdAt: Date;
  updatedAt: Date;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  description: string;
  assignee?: string;
  status: 'backlog' | 'todo' | 'in_progress' | 'review' | 'done';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  estimatedHours?: number;
  dueDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Risk {
  id: string;
  projectId: string;
  description: string;
  impact: 'low' | 'medium' | 'high' | 'critical';
  probability: 'low' | 'medium' | 'high';
  mitigation?: string;
  status: 'identified' | 'mitigated' | 'accepted' | 'closed';
  createdAt: Date;
}

const projects = new Map<string, Project>();
const tasks = new Map<string, Task>();
const risks = new Map<string, Risk>();
const milestones = new Map<string, Record<string, unknown>>();
const history: Array<Record<string, unknown>> = [];

export const PM_TOOL_HANDLERS: Record<string, (params: Record<string, unknown>) => unknown> = {
  'project.create': (params) => {
    const project: Project = {
      id: crypto.randomUUID(),
      name: params['name'] as string,
      description: (params['description'] as string) ?? '',
      status: 'planning',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    projects.set(project.id, project);
    return project;
  },

  'project.query': (params) => {
    const id = params['projectId'] as string;
    if (id) return projects.get(id) ?? null;
    return [...projects.values()];
  },

  'task.decompose': (params) => {
    const requirement = params['requirement'] as string;
    const projectId = (params['projectId'] as string) ?? 'default';
    const sourceItems = requirement
      .split(/[,，、\n。；;]/)
      .map((item) => item.trim())
      .filter(Boolean);
    const normalizedItems = sourceItems.length > 0 ? sourceItems : [requirement];
    const subtasks = normalizedItems.flatMap((title, i) => {
      const phases = ['分析与澄清', '实现', '验证'];
      return phases.map((phase, phaseIndex) => {
      const task: Task = {
        id: crypto.randomUUID(),
        projectId,
          title: `${title.trim()} - ${phase}`,
          description: `WBS ${i + 1}.${phaseIndex + 1}: ${phase}`,
        status: 'backlog',
          priority: phaseIndex === 0 ? 'P1' : 'P2',
          estimatedHours: phaseIndex === 0 ? 2 : phaseIndex === 1 ? 8 : 3,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      tasks.set(task.id, task);
      return task;
      });
    });
    return { decomposed: subtasks.length, tasks: subtasks };
  },

  'task.assign': (params) => {
    const taskId = params['taskId'] as string;
    const assignee = params['assignee'] as string;
    const task = tasks.get(taskId);
    if (!task) return { error: 'Task not found' };
    task.assignee = assignee;
    task.status = 'todo';
    task.updatedAt = new Date();
    return task;
  },

  'task.updateStatus': (params) => {
    const taskId = params['taskId'] as string;
    const status = params['status'] as Task['status'];
    const task = tasks.get(taskId);
    if (!task) return { error: 'Task not found' };
    task.status = status;
    task.updatedAt = new Date();
    return task;
  },

  'task.query': (params) => {
    const filter = params['filter'] as Record<string, unknown> | undefined;
    let result = [...tasks.values()];
    if (filter?.projectId) result = result.filter((t) => t.projectId === filter['projectId']);
    if (filter?.assignee) result = result.filter((t) => t.assignee === filter['assignee']);
    if (filter?.status) result = result.filter((t) => t.status === filter['status']);
    return result;
  },

  'milestone.create': (params) => {
    const milestone = { id: crypto.randomUUID(), projectId: params['projectId'] ?? 'default', name: params['name'], dueDate: params['dueDate'], status: 'open', createdAt: new Date() };
    milestones.set(milestone.id, milestone);
    return milestone;
  },

  'milestone.query': (params) => {
    const projectId = params['projectId'] as string | undefined;
    return [...milestones.values()].filter((m) => !projectId || m['projectId'] === projectId);
  },

  'risk.identify': (params) => {
    const risk: Risk = {
      id: crypto.randomUUID(),
      projectId: (params['projectId'] as string) ?? 'default',
      description: params['description'] as string,
      impact: (params['impact'] as Risk['impact']) ?? 'medium',
      probability: (params['probability'] as Risk['probability']) ?? 'medium',
      mitigation: params['mitigation'] as string | undefined,
      status: 'identified',
      createdAt: new Date(),
    };
    risks.set(risk.id, risk);
    return risk;
  },

  'risk.assess': (params) => {
    const riskId = params['riskId'] as string;
    return risks.get(riskId) ?? { error: 'Risk not found' };
  },

  'notification.send': (params) => {
    const target = params['target'] as string;
    const message = params['message'] as string;
    return { sent: true, target, message, sentAt: new Date() };
  },

  'report.generate': (params) => {
    const type = (params['type'] as string) ?? 'summary';
    const projectId = params['projectId'] as string | undefined;
    const projectTasks = [...tasks.values()].filter((task) => !projectId || task.projectId === projectId);
    const done = projectTasks.filter((t) => t.status === 'done').length;
    const total = projectTasks.length;
    return { type, totalTasks: total, completedTasks: done, completionRate: total > 0 ? (done / total * 100).toFixed(1) + '%' : '0%', generatedAt: new Date() };
  },

  'doc.read': (params) => {
    return { id: params['docId'] ?? 'default-doc', title: 'Mock Document', content: '项目背景、需求、约束和验收标准。' };
  },

  'history.query': (params) => {
    const keyword = String(params['keyword'] ?? '').toLowerCase();
    return history.filter((item) => JSON.stringify(item).toLowerCase().includes(keyword)).slice(0, 20);
  },

  'task.estimate': (params) => {
    const description = String(params['description'] ?? params['title'] ?? '');
    const complexity = description.length > 120 ? 'high' : description.length > 50 ? 'medium' : 'low';
    const hours = complexity === 'high' ? 16 : complexity === 'medium' ? 8 : 3;
    return { optimistic: Math.ceil(hours * 0.7), mostLikely: hours, pessimistic: Math.ceil(hours * 1.6), confidence: 0.7 };
  },
};

export interface PMTool {
  readonly name: string;
  readonly description: string;
  readonly riskLevel: string;
  readonly inputSchema: Record<string, unknown>;
}

export const PM_TOOLS: readonly PMTool[] = [
  { name: 'project.create', description: '创建项目', riskLevel: 'R1', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
  { name: 'project.query', description: '查询项目信息', riskLevel: 'R0', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } } } },
  { name: 'task.decompose', description: 'WBS 任务拆解', riskLevel: 'R1', inputSchema: { type: 'object', properties: { requirement: { type: 'string' }, projectId: { type: 'string' } }, required: ['requirement'] } },
  { name: 'task.assign', description: '分配任务负责人', riskLevel: 'R2', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, assignee: { type: 'string' } }, required: ['taskId', 'assignee'] } },
  { name: 'task.updateStatus', description: '更新任务状态', riskLevel: 'R1', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, status: { type: 'string' } }, required: ['taskId', 'status'] } },
  { name: 'task.query', description: '查询任务', riskLevel: 'R0', inputSchema: { type: 'object', properties: { filter: { type: 'object' } } } },
  { name: 'milestone.create', description: '创建里程碑', riskLevel: 'R1', inputSchema: { type: 'object', properties: { name: { type: 'string' }, dueDate: { type: 'string' } }, required: ['name'] } },
  { name: 'milestone.query', description: '查询里程碑', riskLevel: 'R0', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } } } },
  { name: 'risk.identify', description: '识别并记录风险', riskLevel: 'R1', inputSchema: { type: 'object', properties: { description: { type: 'string' }, impact: { type: 'string' } }, required: ['description'] } },
  { name: 'risk.assess', description: '风险评估', riskLevel: 'R0', inputSchema: { type: 'object', properties: { riskId: { type: 'string' } } } },
  { name: 'notification.send', description: '发送通知消息', riskLevel: 'R1', inputSchema: { type: 'object', properties: { target: { type: 'string' }, message: { type: 'string' } }, required: ['target', 'message'] } },
  { name: 'report.generate', description: '生成报告', riskLevel: 'R0', inputSchema: { type: 'object', properties: { type: { type: 'string' }, projectId: { type: 'string' } } } },
  { name: 'doc.read', description: '读取文档', riskLevel: 'R0', inputSchema: { type: 'object', properties: { docId: { type: 'string' } } } },
  { name: 'history.query', description: '查询历史任务', riskLevel: 'R0', inputSchema: { type: 'object', properties: { keyword: { type: 'string' } } } },
  { name: 'task.estimate', description: '估算任务工时', riskLevel: 'R0', inputSchema: { type: 'object', properties: { title: { type: 'string' }, description: { type: 'string' } } } },
];

if (process.argv[1]?.endsWith('index.js')) {
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk: string) => {
    for (const line of chunk.split('\n').filter(Boolean)) {
      const request = JSON.parse(line) as { id: string; method: string; params?: Record<string, unknown> };
      const handler = PM_TOOL_HANDLERS[request.method];
      const result = handler ? handler(request.params ?? {}) : { error: `Unknown tool: ${request.method}` };
      process.stdout.write(`${JSON.stringify({ id: request.id, result })}\n`);
    }
  });
}
