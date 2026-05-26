/**
 * PM Tools MCP Server — nexus-pm-tools
 * 工具集：project.create/query, task.decompose/assign/updateStatus, risk.*, milestone.*, report.*
 */

export interface PMTool {
  readonly name: string;
  readonly description: string;
  readonly riskLevel: string;
  readonly inputSchema: Record<string, unknown>;
}

export const PM_TOOLS: readonly PMTool[] = [
  { name: 'project.create', description: '创建项目', riskLevel: 'R1', inputSchema: { type: 'object', properties: { name: { type: 'string' }, description: { type: 'string' } }, required: ['name'] } },
  { name: 'project.query', description: '查询项目信息', riskLevel: 'R0', inputSchema: { type: 'object', properties: { projectId: { type: 'string' } } } },
  { name: 'task.decompose', description: 'WBS 任务拆解', riskLevel: 'R1', inputSchema: { type: 'object', properties: { requirement: { type: 'string' } }, required: ['requirement'] } },
  { name: 'task.assign', description: '分配任务负责人', riskLevel: 'R2', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, assignee: { type: 'string' } }, required: ['taskId', 'assignee'] } },
  { name: 'task.updateStatus', description: '更新任务状态', riskLevel: 'R1', inputSchema: { type: 'object', properties: { taskId: { type: 'string' }, status: { type: 'string' } }, required: ['taskId', 'status'] } },
  { name: 'task.query', description: '查询任务', riskLevel: 'R0', inputSchema: { type: 'object', properties: { filter: { type: 'object' } } } },
  { name: 'milestone.create', description: '创建里程碑', riskLevel: 'R1', inputSchema: { type: 'object', properties: { name: { type: 'string' }, dueDate: { type: 'string' } }, required: ['name'] } },
  { name: 'risk.identify', description: '识别并记录风险', riskLevel: 'R1', inputSchema: { type: 'object', properties: { description: { type: 'string' }, impact: { type: 'string' } }, required: ['description'] } },
  { name: 'risk.assess', description: '风险评估', riskLevel: 'R0', inputSchema: { type: 'object', properties: { riskId: { type: 'string' } } } },
  { name: 'notification.send', description: '发送通知消息', riskLevel: 'R1', inputSchema: { type: 'object', properties: { target: { type: 'string' }, message: { type: 'string' } }, required: ['target', 'message'] } },
  { name: 'report.generate', description: '生成报告', riskLevel: 'R0', inputSchema: { type: 'object', properties: { type: { type: 'string' }, projectId: { type: 'string' } } } },
];
