export interface ConsoleRunView {
  readonly runId: string;
  readonly agentId: string;
  readonly status: string;
  readonly tenantId: string;
  readonly createdAt: Date;
  readonly costUsd?: number;
}

export interface ConsoleApprovalView {
  readonly requestId: string;
  readonly runId: string;
  readonly toolName: string;
  readonly riskLevel: string;
  readonly status: string;
}

export interface ConsoleAuditView {
  readonly id: string;
  readonly runId: string;
  readonly eventType: string;
  readonly timestamp: Date;
  readonly data: Readonly<Record<string, unknown>>;
}

export interface ConsoleBudgetView {
  readonly runId: string;
  readonly tokenRemaining: number;
  readonly stepRemaining: number;
  readonly exhausted: boolean;
}

export interface ConsolePackView {
  readonly packId: string;
  readonly name: string;
  readonly version: string;
  readonly status: string;
}

export interface ConsoleRenderOptions {
  readonly gatewayBaseUrl?: string;
  readonly title?: string;
}

export interface SubmitMessageInput {
  readonly content: string;
  readonly tenantId: string;
  readonly userId: string;
  readonly channel?: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Console 状态适配层：Run 列表、审批、审计、预算、Pack 启停。
 */
export class ConsoleModel {
  private readonly runs: ConsoleRunView[] = [];
  private readonly approvals: ConsoleApprovalView[] = [];
  private readonly audits: ConsoleAuditView[] = [];
  private readonly budgets = new Map<string, ConsoleBudgetView>();
  private readonly packs = new Map<string, ConsolePackView>();

  listRuns(): readonly ConsoleRunView[] {
    return this.runs;
  }

  upsertRun(run: ConsoleRunView): void {
    const index = this.runs.findIndex((item) => item.runId === run.runId);
    if (index >= 0) this.runs[index] = run;
    else this.runs.push(run);
  }

  listApprovals(): readonly ConsoleApprovalView[] {
    return this.approvals;
  }

  upsertApproval(approval: ConsoleApprovalView): void {
    const index = this.approvals.findIndex((item) => item.requestId === approval.requestId);
    if (index >= 0) this.approvals[index] = approval;
    else this.approvals.push(approval);
  }

  listAudit(runId?: string): readonly ConsoleAuditView[] {
    return runId ? this.audits.filter((item) => item.runId === runId) : this.audits;
  }

  appendAudit(entry: ConsoleAuditView): void {
    this.audits.push(entry);
  }

  listBudgets(): readonly ConsoleBudgetView[] {
    return [...this.budgets.values()];
  }

  upsertBudget(budget: ConsoleBudgetView): void {
    this.budgets.set(budget.runId, budget);
  }

  listPacks(): readonly ConsolePackView[] {
    return [...this.packs.values()];
  }

  upsertPack(pack: ConsolePackView): void {
    this.packs.set(pack.packId, pack);
  }

  setPackStatus(packId: string, status: string): void {
    const pack = this.packs.get(packId);
    if (!pack) return;
    this.packs.set(packId, { ...pack, status });
  }
}

export class ConsoleGatewayClient {
  constructor(private readonly baseUrl: string) {}

  submitMessage(input: SubmitMessageInput): Promise<unknown> {
    return this.post('/api/v1/messages', input);
  }

  async snapshot(): Promise<{
    runs: unknown;
    approvals: unknown;
    packs: unknown;
  }> {
    const [runs, approvals, packs] = await Promise.all([
      this.get('/api/v1/runs'),
      this.get('/api/v1/approvals/pending'),
      this.get('/api/v1/packs'),
    ]);
    return { runs, approvals, packs };
  }

  health(): Promise<unknown> {
    return this.get('/health');
  }

  ready(): Promise<unknown> {
    return this.get('/ready');
  }

  getRun(runId: string): Promise<unknown> {
    return this.get(`/api/v1/runs/${encodeURIComponent(runId)}`);
  }

  getAudit(runId: string): Promise<unknown> {
    return this.get(`/api/v1/runs/${encodeURIComponent(runId)}/audit`);
  }

  getBudget(runId: string): Promise<unknown> {
    return this.get(`/api/v1/runs/${encodeURIComponent(runId)}/budget`);
  }

  approve(runId: string, approved: boolean, approver = 'admin'): Promise<unknown> {
    return this.post(`/api/v1/runs/${encodeURIComponent(runId)}/approve`, { approved, approver });
  }

  cancel(runId: string, reason = 'console_cancel'): Promise<unknown> {
    return this.post(`/api/v1/runs/${encodeURIComponent(runId)}/cancel`, { reason });
  }

  resume(runId: string): Promise<unknown> {
    return this.post(`/api/v1/runs/${encodeURIComponent(runId)}/resume`, {});
  }

  refillBudget(runId: string, amount?: number): Promise<unknown> {
    return this.post(`/api/v1/runs/${encodeURIComponent(runId)}/budget/refill`, { amount });
  }

  setPackStatus(packId: string, enabled: boolean): Promise<unknown> {
    return this.post(`/api/v1/packs/${encodeURIComponent(packId)}/${enabled ? 'enable' : 'disable'}`, {});
  }

  private async get(path: string): Promise<unknown> {
    const response = await fetch(new URL(path, this.baseUrl));
    return response.json();
  }

  private async post(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(new URL(path, this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return response.json();
  }
}

/**
 * 渲染 Nexus Lab 调试工作台：左侧会话历史 / 中间对话 / 右侧框架可视化。
 */
export function renderConsoleHtml(model: ConsoleModel, options: ConsoleRenderOptions = {}): string {
  const title = options.title ?? 'Nexus Lab';
  const gatewayBaseUrl = options.gatewayBaseUrl ?? '';
  const initialRuns = model.listRuns().map((run) => ({
    runId: run.runId,
    agentId: run.agentId,
    status: run.status,
    tenantId: run.tenantId,
  }));
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)} · Agent 调试工作台</title>
    <style>${CONSOLE_STYLES}</style>
  </head>
  <body>
    <div class="app">
      <!-- 顶栏 -->
      <header class="topbar">
        <div class="brand">
          <span class="brand-mark">N</span>
          <div>
            <div class="brand-title">${escapeHtml(title)}</div>
            <div class="brand-sub">Agent 框架调试工作台</div>
          </div>
        </div>
        <div class="topbar-controls">
          <div class="field-inline">
            <span class="field-label">Gateway</span>
            <input id="gatewayBaseUrl" value="${escapeHtml(gatewayBaseUrl)}" placeholder="留空 = 同源">
          </div>
          <div class="field-inline">
            <span class="field-label">Tenant</span>
            <input id="tenantId" value="default" class="narrow">
          </div>
          <div class="field-inline">
            <span class="field-label">User</span>
            <input id="userId" value="debug-user" class="narrow">
          </div>
          <div class="status-cluster">
            <span id="healthDot" class="status-dot" title="health">●</span>
            <span id="healthText" class="status-text">checking…</span>
            <button id="refreshHealth" class="ghost-btn" title="重新探测健康">↻</button>
          </div>
        </div>
      </header>

      <!-- 主体三栏 -->
      <main class="workspace">

        <!-- 左栏：会话列表 + 快捷模板 + 全局状态 -->
        <aside class="sidebar">
          <section class="sidebar-section">
            <div class="section-head">
              <span class="section-title">会话</span>
              <button id="newSession" class="ghost-btn small">＋ 新建</button>
            </div>
            <ul id="sessionList" class="session-list"></ul>
          </section>

          <section class="sidebar-section">
            <div class="section-head"><span class="section-title">快捷输入</span></div>
            <div class="template-grid">
              <button class="template-btn" data-template="帮我把登录、权限、审计三个需求拆成 WBS，并给出任务分配建议">需求拆解</button>
              <button class="template-btn" data-template="当前项目健康度如何？识别风险并给出催办建议">项目健康诊断</button>
              <button class="template-btn" data-template="请给项目负责人发送一条任务催办通知">催办通知</button>
              <button class="template-btn" data-template="生成一段较长的需求文档（约 2000 字）并拆解为 WBS，用以观察上下文压缩 L1-L4 是否触发">压缩压力测试</button>
              <button class="template-btn" data-template="先调用 task.decompose 拆解需求，再调用 task.assign 分配任务，最后调用 notification.send 通知负责人">多工具调用链</button>
            </div>
          </section>

          <section class="sidebar-section">
            <div class="section-head"><span class="section-title">全局状态</span></div>
            <div id="globalStats" class="stat-grid">
              <div class="stat"><div class="stat-label">已发送</div><div class="stat-value" id="statMessages">0</div></div>
              <div class="stat"><div class="stat-label">活跃 Run</div><div class="stat-value" id="statActiveRuns">0</div></div>
              <div class="stat"><div class="stat-label">事件总数</div><div class="stat-value" id="statEvents">0</div></div>
              <div class="stat"><div class="stat-label">压缩触发</div><div class="stat-value" id="statCompacts">0</div></div>
            </div>
          </section>
        </aside>

        <!-- 中栏：聊天 -->
        <section class="chat">
          <header class="chat-head">
            <div>
              <div class="chat-title" id="chatTitle">新会话</div>
              <div class="chat-sub" id="chatSub">尚未发送消息</div>
            </div>
            <div class="chat-actions">
              <button id="cancelRun" class="ghost-btn" title="取消当前 Run">取消</button>
              <button id="resumeRun" class="ghost-btn" title="恢复 Run">恢复</button>
              <button id="refillBudget" class="ghost-btn" title="补 1000 token 预算">补预算</button>
              <button id="exportSession" class="ghost-btn">导出</button>
            </div>
          </header>

          <div id="chatScroll" class="chat-scroll">
            <div class="chat-empty" id="chatEmpty">
              <div class="empty-icon">◎</div>
              <div class="empty-title">开始一次对话</div>
              <div class="empty-sub">输入消息，下方框架可视化面板会实时显示 Run 状态、工具调用、上下文压缩、Checkpoint、预算等内部行为。</div>
            </div>
          </div>

          <form id="composer" class="composer">
            <textarea id="messageContent" rows="3" placeholder="输入消息后按 Enter 发送（Shift+Enter 换行）"></textarea>
            <div class="composer-meta">
              <div class="composer-hints">
                <span id="connState" class="conn-pill idle">stream: idle</span>
                <span id="composerHint" class="composer-hint">Enter 发送 · Shift+Enter 换行</span>
              </div>
              <button type="submit" class="primary-btn" id="sendBtn">发送</button>
            </div>
          </form>
        </section>

        <!-- 右栏：框架可视化 -->
        <aside class="inspector">
          <div class="inspector-tabs">
            <button class="tab-btn active" data-tab="overview">Run 概览</button>
            <button class="tab-btn" data-tab="timeline">推理时间线</button>
            <button class="tab-btn" data-tab="tools">工具</button>
            <button class="tab-btn" data-tab="context">上下文/压缩</button>
            <button class="tab-btn" data-tab="checkpoint">Checkpoint</button>
            <button class="tab-btn" data-tab="budget">预算</button>
            <button class="tab-btn" data-tab="approval">审批</button>
            <button class="tab-btn" data-tab="raw">原始事件</button>
          </div>

          <div class="inspector-body">
            <!-- Run 概览 -->
            <section class="tab-panel active" data-panel="overview">
              <div class="panel-head"><h3>当前 Run 状态</h3><span id="runIdLabel" class="muted-mono">—</span></div>
              <div id="overviewGrid" class="overview-grid">
                <div class="kv"><div class="k">Agent</div><div class="v" id="ovAgent">—</div></div>
                <div class="kv"><div class="k">状态</div><div class="v"><span id="ovStatus" class="badge">—</span></div></div>
                <div class="kv"><div class="k">轮次</div><div class="v" id="ovTurns">0</div></div>
                <div class="kv"><div class="k">工具调用</div><div class="v" id="ovTools">0</div></div>
                <div class="kv"><div class="k">压缩</div><div class="v" id="ovCompacts">0</div></div>
                <div class="kv"><div class="k">Checkpoint</div><div class="v" id="ovCheckpoints">0</div></div>
                <div class="kv"><div class="k">已用 Token</div><div class="v" id="ovTokens">0</div></div>
                <div class="kv"><div class="k">耗时</div><div class="v" id="ovDuration">0 ms</div></div>
              </div>
              <div class="panel-head"><h3>事件流概览</h3></div>
              <div id="overviewSparkline" class="event-strip"></div>
            </section>

            <!-- 推理时间线 -->
            <section class="tab-panel" data-panel="timeline">
              <div class="panel-head"><h3>Turn 时间线</h3><span class="muted-mono">text_delta / reasoning</span></div>
              <div id="timeline" class="timeline"></div>
            </section>

            <!-- 工具调用 -->
            <section class="tab-panel" data-panel="tools">
              <div class="panel-head"><h3>工具调用</h3><span class="muted-mono">start → result/error</span></div>
              <div id="toolList" class="tool-list"></div>
            </section>

            <!-- 上下文与压缩 -->
            <section class="tab-panel" data-panel="context">
              <div class="panel-head"><h3>金字塔 Compact</h3><span class="muted-mono">L1 → L4</span></div>
              <div class="compact-levels">
                <div class="compact-card" data-level="L1_time_gap">
                  <div class="cl-head"><span class="cl-tag">L1</span><span>Time-Gap Micro</span></div>
                  <div class="cl-meta" id="clL1">未触发</div>
                </div>
                <div class="compact-card" data-level="L2_evidence">
                  <div class="cl-head"><span class="cl-tag">L2</span><span>Evidence-Aware</span></div>
                  <div class="cl-meta" id="clL2">未触发</div>
                </div>
                <div class="compact-card" data-level="L3_session_graft">
                  <div class="cl-head"><span class="cl-tag">L3</span><span>Session Graft</span></div>
                  <div class="cl-meta" id="clL3">未触发</div>
                </div>
                <div class="compact-card" data-level="L4_legacy">
                  <div class="cl-head"><span class="cl-tag">L4</span><span>Legacy Full</span></div>
                  <div class="cl-meta" id="clL4">未触发</div>
                </div>
              </div>
              <div class="panel-head"><h3>压缩事件历史</h3></div>
              <div id="compactList" class="compact-list"></div>
              <div class="panel-head"><h3>环境感知（ContextBackfiller）</h3></div>
              <div id="envList" class="env-list"></div>
            </section>

            <!-- Checkpoint -->
            <section class="tab-panel" data-panel="checkpoint">
              <div class="panel-head"><h3>语义卡点</h3><span class="muted-mono">post_tool / periodic / post_model</span></div>
              <div id="checkpointList" class="checkpoint-list"></div>
              <div class="panel-help">Checkpoint 触发后，可用左侧"恢复"按钮从最近卡点继续。</div>
            </section>

            <!-- 预算 -->
            <section class="tab-panel" data-panel="budget">
              <div class="panel-head"><h3>预算四维监控</h3></div>
              <div class="budget-bars">
                <div class="budget-bar" data-dim="token"><span class="bb-label">Token</span><div class="bb-track"><div class="bb-fill"></div></div><span class="bb-text">—</span></div>
                <div class="budget-bar" data-dim="cost"><span class="bb-label">Cost</span><div class="bb-track"><div class="bb-fill"></div></div><span class="bb-text">—</span></div>
                <div class="budget-bar" data-dim="time"><span class="bb-label">Time</span><div class="bb-track"><div class="bb-fill"></div></div><span class="bb-text">—</span></div>
                <div class="budget-bar" data-dim="step"><span class="bb-label">Step</span><div class="bb-track"><div class="bb-fill"></div></div><span class="bb-text">—</span></div>
              </div>
              <div class="panel-head"><h3>告警与模型降级</h3></div>
              <div id="warningList" class="warning-list"></div>
            </section>

            <!-- 审批 -->
            <section class="tab-panel" data-panel="approval">
              <div class="panel-head"><h3>待审批</h3><span class="muted-mono">R2+ 风险工具</span></div>
              <div id="approvalList" class="approval-list">
                <div class="empty-block">暂无审批请求</div>
              </div>
            </section>

            <!-- 原始事件 -->
            <section class="tab-panel" data-panel="raw">
              <div class="panel-head">
                <h3>原始事件流</h3>
                <div class="raw-tools">
                  <input id="rawFilter" placeholder="按类型/关键字过滤" class="narrow">
                  <button id="clearRaw" class="ghost-btn small">清空</button>
                </div>
              </div>
              <div id="rawList" class="raw-list"></div>
            </section>
          </div>
        </aside>
      </main>
    </div>

    <script>window.__NEXUS_CONFIG__ = ${JSON.stringify({ gatewayBaseUrl, initialRuns })};</script>
    <script>${CONSOLE_BROWSER_SCRIPT}</script>
  </body>
</html>`;
}

/**
 * HTML 转义，避免调试数据破坏页面结构。
 */
function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

const CONSOLE_STYLES = `
:root {
  color-scheme: light;
  --bg: #f7f8fa;
  --surface: #ffffff;
  --surface-2: #fafbfc;
  --border: #e3e6eb;
  --border-strong: #d1d6de;
  --text: #1f2328;
  --text-soft: #57606a;
  --text-mute: #8b949e;
  --accent: #2563eb;
  --accent-soft: #eef2ff;
  --ok: #16a34a;
  --warn: #d97706;
  --error: #dc2626;
  --info: #0891b2;
  --purple: #7c3aed;
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.04);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.06);
  --radius: 8px;
  --mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
}
* { box-sizing: border-box; }
html, body { height: 100%; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
  font-size: 13px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}
button, input, textarea, select {
  font: inherit;
  color: inherit;
}
button { cursor: pointer; }
input, textarea, select {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--text);
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
input:focus, textarea:focus, select:focus {
  border-color: var(--accent);
  box-shadow: 0 0 0 3px rgba(37, 99, 235, .15);
}
textarea { resize: vertical; font-family: inherit; }

/* 布局 */
.app {
  display: grid;
  grid-template-rows: 52px 1fr;
  height: 100vh;
}
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  gap: 16px;
}
.brand { display: flex; align-items: center; gap: 10px; }
.brand-mark {
  width: 28px; height: 28px;
  border-radius: 7px;
  background: linear-gradient(135deg, #2563eb, #7c3aed);
  color: #fff;
  display: grid; place-items: center;
  font-weight: 700; font-size: 14px;
}
.brand-title { font-weight: 600; font-size: 14px; }
.brand-sub { color: var(--text-mute); font-size: 11px; }

.topbar-controls { display: flex; align-items: center; gap: 12px; }
.field-inline {
  display: flex; align-items: center; gap: 6px;
  background: var(--surface-2);
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
}
.field-inline .field-label {
  color: var(--text-mute);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: .04em;
}
.field-inline input {
  border: 0; background: transparent; padding: 2px 4px;
  width: 160px; box-shadow: none;
}
.field-inline input.narrow { width: 90px; }
.field-inline input:focus { box-shadow: none; }

.status-cluster {
  display: flex; align-items: center; gap: 6px;
  padding: 4px 10px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
}
.status-dot { font-size: 14px; color: var(--text-mute); transition: color .2s; }
.status-dot.ok { color: var(--ok); }
.status-dot.warn { color: var(--warn); }
.status-dot.error { color: var(--error); }
.status-text { color: var(--text-soft); font-size: 12px; }

.ghost-btn {
  background: transparent;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 10px;
  color: var(--text-soft);
  transition: all .15s;
}
.ghost-btn:hover { border-color: var(--accent); color: var(--accent); background: var(--accent-soft); }
.ghost-btn.small { padding: 2px 8px; font-size: 12px; }

.primary-btn {
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 6px;
  padding: 8px 18px;
  font-weight: 500;
  transition: background .15s;
}
.primary-btn:hover { background: #1d4ed8; }
.primary-btn:disabled { background: var(--text-mute); cursor: not-allowed; }

/* 三栏布局 */
.workspace {
  display: grid;
  grid-template-columns: 240px 1fr 420px;
  overflow: hidden;
}

/* 左栏 */
.sidebar {
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}
.sidebar-section { padding: 14px 16px; border-bottom: 1px solid var(--border); }
.section-head {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 10px;
}
.section-title {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-mute);
  text-transform: uppercase;
  letter-spacing: .06em;
}
.session-list { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
.session-item {
  padding: 8px 10px;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all .15s;
}
.session-item:hover { background: var(--surface-2); border-color: var(--border); }
.session-item.active { background: var(--accent-soft); border-color: rgba(37, 99, 235, .3); }
.session-item-title { font-weight: 500; font-size: 13px; }
.session-item-meta { font-size: 11px; color: var(--text-mute); margin-top: 2px; }
.session-empty { font-size: 12px; color: var(--text-mute); padding: 6px; }

.template-grid { display: grid; gap: 6px; }
.template-btn {
  text-align: left;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  color: var(--text-soft);
  font-size: 12px;
  transition: all .15s;
}
.template-btn:hover { border-color: var(--accent); color: var(--accent); }

.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.stat {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
}
.stat-label { font-size: 10px; color: var(--text-mute); text-transform: uppercase; letter-spacing: .05em; }
.stat-value { font-size: 18px; font-weight: 600; margin-top: 2px; font-variant-numeric: tabular-nums; }

/* 中栏：聊天 */
.chat {
  display: grid;
  grid-template-rows: auto 1fr auto;
  background: var(--bg);
  overflow: hidden;
}
.chat-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 24px;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.chat-title { font-weight: 600; font-size: 14px; }
.chat-sub { font-size: 12px; color: var(--text-mute); margin-top: 2px; }
.chat-actions { display: flex; gap: 6px; }

.chat-scroll {
  overflow-y: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.chat-empty {
  margin: auto;
  text-align: center;
  color: var(--text-mute);
  max-width: 360px;
}
.empty-icon { font-size: 36px; color: var(--border-strong); margin-bottom: 12px; }
.empty-title { font-size: 16px; color: var(--text); font-weight: 500; margin-bottom: 6px; }
.empty-sub { font-size: 13px; line-height: 1.6; }

.msg { display: flex; gap: 12px; max-width: 92%; }
.msg.user { align-self: flex-end; flex-direction: row-reverse; }
.msg-avatar {
  width: 28px; height: 28px;
  border-radius: 6px;
  display: grid; place-items: center;
  font-size: 12px; font-weight: 600;
  flex-shrink: 0;
}
.msg.user .msg-avatar { background: var(--accent); color: #fff; }
.msg.assistant .msg-avatar { background: linear-gradient(135deg, #7c3aed, #2563eb); color: #fff; }
.msg-body { display: grid; gap: 6px; }
.msg-bubble {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 10px 14px;
  white-space: pre-wrap;
  word-break: break-word;
}
.msg.user .msg-bubble { background: var(--accent-soft); border-color: rgba(37, 99, 235, .25); }
.msg-meta { font-size: 11px; color: var(--text-mute); padding: 0 4px; }
.msg-runid { font-family: var(--mono); color: var(--text-mute); }

.msg-trace { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.trace-chip {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-soft);
  font-family: var(--mono);
}
.trace-chip.tool { background: #ecfeff; border-color: #a5f3fc; color: var(--info); }
.trace-chip.compact { background: #fef3c7; border-color: #fde68a; color: var(--warn); }
.trace-chip.checkpoint { background: #f3e8ff; border-color: #e9d5ff; color: var(--purple); }
.trace-chip.error { background: #fee2e2; border-color: #fecaca; color: var(--error); }
.trace-chip.completed { background: #dcfce7; border-color: #bbf7d0; color: var(--ok); }
.trace-chip.approval { background: #fff7ed; border-color: #fed7aa; color: #ea580c; }

.composer {
  padding: 14px 24px 18px;
  background: var(--surface);
  border-top: 1px solid var(--border);
  display: grid;
  gap: 8px;
}
.composer textarea {
  width: 100%;
  font-family: inherit;
  resize: none;
  min-height: 60px;
  max-height: 200px;
}
.composer-meta {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.composer-hints { display: flex; align-items: center; gap: 10px; }
.composer-hint { color: var(--text-mute); font-size: 11px; }
.conn-pill {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  font-family: var(--mono);
  border: 1px solid var(--border);
}
.conn-pill.idle { color: var(--text-mute); }
.conn-pill.connecting { background: #fef3c7; border-color: #fde68a; color: var(--warn); }
.conn-pill.connected { background: #dcfce7; border-color: #bbf7d0; color: var(--ok); }
.conn-pill.error { background: #fee2e2; border-color: #fecaca; color: var(--error); }

/* 右栏：Inspector */
.inspector {
  background: var(--surface);
  border-left: 1px solid var(--border);
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}
.inspector-tabs {
  display: flex;
  overflow-x: auto;
  border-bottom: 1px solid var(--border);
  background: var(--surface-2);
}
.tab-btn {
  background: transparent;
  border: 0;
  border-bottom: 2px solid transparent;
  padding: 10px 12px;
  color: var(--text-soft);
  font-size: 12px;
  white-space: nowrap;
  transition: all .15s;
}
.tab-btn:hover { color: var(--accent); }
.tab-btn.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
  background: var(--surface);
}
.inspector-body { overflow-y: auto; padding: 16px; }
.tab-panel { display: none; }
.tab-panel.active { display: block; }
.panel-head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin: 16px 0 10px;
}
.panel-head:first-child { margin-top: 0; }
.panel-head h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--text-mute); text-transform: uppercase; letter-spacing: .05em; }
.muted-mono { font-family: var(--mono); font-size: 11px; color: var(--text-mute); }
.panel-help { color: var(--text-mute); font-size: 11px; padding: 6px; }
.empty-block { color: var(--text-mute); font-size: 12px; padding: 8px; text-align: center; }

/* Overview */
.overview-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.kv {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
}
.k { font-size: 10px; color: var(--text-mute); text-transform: uppercase; letter-spacing: .05em; }
.v { font-size: 14px; font-weight: 500; margin-top: 2px; font-variant-numeric: tabular-nums; }
.badge {
  display: inline-block;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  font-weight: 500;
}
.badge.running { background: #eef2ff; border-color: #c7d2fe; color: var(--accent); }
.badge.succeeded { background: #dcfce7; border-color: #bbf7d0; color: var(--ok); }
.badge.failed { background: #fee2e2; border-color: #fecaca; color: var(--error); }
.badge.waiting { background: #fef3c7; border-color: #fde68a; color: var(--warn); }
.event-strip {
  display: flex; flex-wrap: wrap; gap: 3px;
  padding: 8px;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  min-height: 30px;
}
.event-dot {
  width: 12px; height: 12px;
  border-radius: 2px;
  background: var(--accent);
}

/* Timeline */
.timeline { display: grid; gap: 4px; }
.timeline-item {
  display: grid;
  grid-template-columns: 50px 1fr;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px solid var(--surface-2);
}
.timeline-time { color: var(--text-mute); font-size: 11px; font-family: var(--mono); }
.timeline-body { font-size: 12px; }
.timeline-tag {
  display: inline-block;
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 3px;
  background: var(--surface-2);
  color: var(--text-soft);
  margin-right: 4px;
  font-family: var(--mono);
}

/* Tools */
.tool-list { display: grid; gap: 8px; }
.tool-item {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  overflow: hidden;
}
.tool-head {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 10px;
  cursor: pointer;
}
.tool-name { font-family: var(--mono); font-size: 12px; font-weight: 500; }
.tool-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
}
.tool-status.running { background: #eef2ff; color: var(--accent); }
.tool-status.success { background: #dcfce7; color: var(--ok); }
.tool-status.error { background: #fee2e2; color: var(--error); }
.tool-detail {
  border-top: 1px solid var(--border);
  padding: 8px 10px;
  background: var(--surface);
  font-family: var(--mono);
  font-size: 11px;
  display: none;
}
.tool-item.expanded .tool-detail { display: block; }
.tool-detail pre { margin: 4px 0; white-space: pre-wrap; word-break: break-word; }
.tool-meta { color: var(--text-mute); margin-top: 4px; font-size: 11px; }

/* Compact */
.compact-levels { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.compact-card {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 10px;
  opacity: .55;
  transition: opacity .2s;
}
.compact-card.triggered { opacity: 1; border-color: var(--warn); background: #fffbeb; }
.cl-head { display: flex; align-items: center; gap: 6px; font-weight: 500; font-size: 12px; }
.cl-tag {
  background: var(--text-soft);
  color: #fff;
  padding: 1px 6px;
  border-radius: 3px;
  font-family: var(--mono);
  font-size: 10px;
}
.compact-card.triggered .cl-tag { background: var(--warn); }
.cl-meta { font-size: 11px; color: var(--text-mute); margin-top: 6px; font-family: var(--mono); }
.compact-list, .checkpoint-list, .env-list, .warning-list, .approval-list, .raw-list {
  display: grid; gap: 6px;
}
.compact-list-item, .checkpoint-item, .env-item, .warning-item {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  font-size: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.compact-list-item .meta-mono, .checkpoint-item .meta-mono { color: var(--text-mute); font-family: var(--mono); font-size: 11px; }

/* Budget */
.budget-bars { display: grid; gap: 10px; }
.budget-bar {
  display: grid;
  grid-template-columns: 60px 1fr 100px;
  gap: 10px;
  align-items: center;
}
.bb-label { font-size: 12px; color: var(--text-soft); font-weight: 500; }
.bb-track {
  height: 8px;
  background: var(--surface-2);
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--border);
}
.bb-fill {
  height: 100%;
  background: var(--accent);
  width: 0%;
  transition: width .25s, background .25s;
}
.bb-fill.warn { background: var(--warn); }
.bb-fill.error { background: var(--error); }
.bb-text { font-family: var(--mono); font-size: 11px; color: var(--text-soft); text-align: right; }

/* Approval */
.approval-card {
  background: #fff7ed;
  border: 1px solid #fed7aa;
  border-radius: 8px;
  padding: 12px;
}
.approval-card .tool { font-family: var(--mono); font-weight: 500; margin-bottom: 4px; }
.approval-card .reason { font-size: 12px; color: var(--text-soft); margin-bottom: 8px; }
.approval-actions { display: flex; gap: 6px; }
.approval-actions button {
  padding: 4px 12px;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.approval-actions .approve { background: var(--ok); color: #fff; border-color: var(--ok); }
.approval-actions .deny { background: var(--error); color: #fff; border-color: var(--error); }

/* Raw */
.raw-tools { display: flex; gap: 6px; }
.raw-tools .narrow { width: 160px; padding: 3px 8px; font-size: 12px; }
.raw-item {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  font-family: var(--mono);
  font-size: 11px;
}
.raw-head {
  display: flex; justify-content: space-between;
  color: var(--text-mute);
  margin-bottom: 4px;
}
.raw-type {
  font-weight: 500;
  color: var(--accent);
}
.raw-item pre { margin: 0; white-space: pre-wrap; word-break: break-all; max-height: 200px; overflow-y: auto; }

/* 滚动条 */
::-webkit-scrollbar { width: 8px; height: 8px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border-strong); border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: var(--text-mute); }

/* 响应式 */
@media (max-width: 1280px) {
  .workspace { grid-template-columns: 200px 1fr 360px; }
}
@media (max-width: 1024px) {
  .workspace { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; }
  .sidebar, .inspector { max-height: 280px; }
}
`;

const CONSOLE_BROWSER_SCRIPT = `
(function () {
  'use strict';

  const config = window.__NEXUS_CONFIG__ || {};
  const state = {
    gatewayBaseUrl: config.gatewayBaseUrl || '',
    sessions: [],
    currentSessionId: null,
    socket: null,
    eventCount: 0,
    compactCount: 0
  };

  const $ = (id) => document.getElementById(id);
  const nodes = {};

  function init() {
    [
      'gatewayBaseUrl', 'tenantId', 'userId', 'healthDot', 'healthText', 'refreshHealth',
      'newSession', 'sessionList', 'chatTitle', 'chatSub', 'chatScroll', 'chatEmpty',
      'composer', 'messageContent', 'connState', 'sendBtn',
      'cancelRun', 'resumeRun', 'refillBudget', 'exportSession',
      'statMessages', 'statActiveRuns', 'statEvents', 'statCompacts',
      'runIdLabel', 'ovAgent', 'ovStatus', 'ovTurns', 'ovTools', 'ovCompacts',
      'ovCheckpoints', 'ovTokens', 'ovDuration', 'overviewSparkline',
      'timeline', 'toolList', 'clL1', 'clL2', 'clL3', 'clL4',
      'compactList', 'envList', 'checkpointList',
      'warningList', 'approvalList', 'rawFilter', 'clearRaw', 'rawList'
    ].forEach((id) => { nodes[id] = $(id); });

    nodes.gatewayBaseUrl.addEventListener('change', () => {
      state.gatewayBaseUrl = nodes.gatewayBaseUrl.value.trim();
    });
    nodes.refreshHealth.addEventListener('click', refreshHealth);
    nodes.newSession.addEventListener('click', () => createSession(true));
    nodes.composer.addEventListener('submit', onSubmit);
    nodes.messageContent.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        nodes.composer.requestSubmit();
      }
    });
    nodes.cancelRun.addEventListener('click', () => runAction('cancel', { reason: 'console_cancel' }));
    nodes.resumeRun.addEventListener('click', () => runAction('resume', {}));
    nodes.refillBudget.addEventListener('click', () => runAction('budget/refill', { amount: 1000 }));
    nodes.exportSession.addEventListener('click', exportSession);
    nodes.clearRaw.addEventListener('click', () => { nodes.rawList.innerHTML = ''; });
    nodes.rawFilter.addEventListener('input', applyRawFilter);

    document.querySelectorAll('.template-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        nodes.messageContent.value = btn.getAttribute('data-template') || '';
        nodes.messageContent.focus();
      });
    });
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => switchTab(btn.getAttribute('data-tab')));
    });

    createSession(false);
    renderSessions();
    refreshHealth();
    setInterval(refreshHealth, 30000);
  }

  // ===== Gateway 接口 =====
  function apiUrl(path) {
    return new URL(path, state.gatewayBaseUrl || window.location.origin).toString();
  }
  function wsUrl(runId) {
    const base = new URL(state.gatewayBaseUrl || window.location.origin);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = '/ws/stream/' + encodeURIComponent(runId);
    base.search = '';
    return base.toString();
  }
  async function request(path, options) {
    const response = await fetch(apiUrl(path), options || {});
    const text = await response.text();
    const data = text ? safeJson(text) : null;
    if (!response.ok) throw new Error('HTTP ' + response.status + ': ' + text.slice(0, 200));
    return data;
  }

  // ===== 健康状态 =====
  async function refreshHealth() {
    try {
      const ready = await request('/ready');
      if (ready && ready.ready) {
        setStatus('ok', 'gateway ready');
      } else {
        setStatus('warn', 'gateway degraded');
      }
    } catch (e) {
      setStatus('error', 'gateway unreachable');
    }
  }
  function setStatus(level, text) {
    nodes.healthDot.className = 'status-dot ' + level;
    nodes.healthText.textContent = text;
  }

  // ===== Session 管理 =====
  function createSession(activate) {
    const id = 's_' + Math.random().toString(36).slice(2, 9);
    const session = {
      id,
      title: '新会话',
      createdAt: new Date(),
      messages: [],
      currentRunId: null,
      runs: new Map(),
      // 框架状态
      stats: { turns: 0, tools: 0, compacts: 0, checkpoints: 0, tokens: 0, startedAt: null },
      events: [],
      tools: new Map(),
      timeline: [],
      compacts: [],
      checkpoints: [],
      envChanges: [],
      warnings: [],
      approvals: [],
      compactLevels: { L1_time_gap: 0, L2_evidence: 0, L3_session_graft: 0, L4_legacy: 0 },
      budget: null,
      agentId: null,
      status: 'idle'
    };
    state.sessions.unshift(session);
    if (activate || !state.currentSessionId) {
      state.currentSessionId = id;
    }
    renderSessions();
    renderActiveSession();
  }

  function getSession() {
    return state.sessions.find((s) => s.id === state.currentSessionId);
  }

  function renderSessions() {
    nodes.sessionList.innerHTML = '';
    if (state.sessions.length === 0) {
      nodes.sessionList.innerHTML = '<li class="session-empty">点击右上"＋ 新建"开始</li>';
      return;
    }
    state.sessions.forEach((s) => {
      const li = document.createElement('li');
      li.className = 'session-item' + (s.id === state.currentSessionId ? ' active' : '');
      const title = document.createElement('div');
      title.className = 'session-item-title';
      title.textContent = s.title;
      const meta = document.createElement('div');
      meta.className = 'session-item-meta';
      meta.textContent = s.messages.length + ' 条 · ' + new Date(s.createdAt).toLocaleTimeString();
      li.appendChild(title);
      li.appendChild(meta);
      li.addEventListener('click', () => {
        state.currentSessionId = s.id;
        renderSessions();
        renderActiveSession();
      });
      nodes.sessionList.appendChild(li);
    });
  }

  // ===== 消息发送 =====
  async function onSubmit(e) {
    e.preventDefault();
    const content = nodes.messageContent.value.trim();
    if (!content) return;
    const session = getSession();
    if (!session) return;

    if (session.title === '新会话') {
      session.title = content.slice(0, 24) + (content.length > 24 ? '…' : '');
    }

    pushUserMessage(content);
    nodes.messageContent.value = '';
    nodes.sendBtn.disabled = true;
    renderActiveSession();
    renderSessions();

    try {
      const response = await request('/api/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content,
          tenantId: nodes.tenantId.value.trim() || 'default',
          userId: nodes.userId.value.trim() || 'debug-user',
          channel: 'http'
        })
      });
      if (response && response.runId) {
        session.currentRunId = response.runId;
        session.status = 'running';
        session.stats.startedAt = Date.now();
        pushAssistantMessage(response.runId);
        connectStream(response.runId);
        renderOverview();
      } else {
        pushAssistantError('Gateway 拒绝：' + JSON.stringify(response));
      }
    } catch (err) {
      pushAssistantError(String(err));
    } finally {
      nodes.sendBtn.disabled = false;
    }
  }

  function pushUserMessage(content) {
    const session = getSession();
    session.messages.push({ role: 'user', content, ts: Date.now() });
    session.stats = { turns: 0, tools: 0, compacts: 0, checkpoints: 0, tokens: 0, startedAt: null };
  }
  function pushAssistantMessage(runId) {
    const session = getSession();
    session.messages.push({
      role: 'assistant',
      runId,
      content: '',
      traces: [],
      ts: Date.now(),
      done: false
    });
    renderChat();
  }
  function pushAssistantError(text) {
    const session = getSession();
    session.messages.push({ role: 'assistant', content: '⚠ ' + text, traces: [], ts: Date.now(), done: true, error: true });
    renderChat();
  }

  // ===== WebSocket 流 =====
  function connectStream(runId) {
    if (state.socket) {
      try { state.socket.close(); } catch (e) {}
      state.socket = null;
    }
    setConn('connecting', 'stream: connecting');
    try {
      const ws = new WebSocket(wsUrl(runId));
      state.socket = ws;
      ws.addEventListener('open', () => setConn('connected', 'stream: connected'));
      ws.addEventListener('message', (msg) => handleStreamEvent(runId, safeJson(msg.data)));
      ws.addEventListener('close', () => setConn('idle', 'stream: closed'));
      ws.addEventListener('error', () => setConn('error', 'stream: error'));
    } catch (err) {
      setConn('error', 'stream: ' + err);
    }
  }
  function setConn(cls, text) {
    nodes.connState.className = 'conn-pill ' + cls;
    nodes.connState.textContent = text;
  }

  // ===== 流式事件处理（核心）=====
  function handleStreamEvent(runId, evt) {
    if (!evt || !evt.type) return;
    const session = getSession();
    if (!session) return;
    session.events.push({ ...evt, _ts: Date.now() });
    state.eventCount++;
    appendRaw(evt);

    const msg = session.messages.slice().reverse().find((m) => m.role === 'assistant' && m.runId === runId);
    if (!msg) return;

    switch (evt.type) {
      case 'text_delta':
        msg.content += evt.delta || '';
        session.stats.turns = Math.max(session.stats.turns, 1);
        break;
      case 'reasoning_summary_delta':
        pushTimeline('reasoning', evt.delta);
        break;
      case 'tool_use_start': {
        session.stats.tools++;
        const tool = {
          id: evt.toolCallId,
          name: evt.toolName,
          input: evt.input,
          status: 'running',
          startedAt: Date.now()
        };
        session.tools.set(evt.toolCallId, tool);
        addTrace(msg, 'tool', '⚙ ' + evt.toolName);
        pushTimeline('tool_start', evt.toolName);
        break;
      }
      case 'tool_use_result': {
        const tool = session.tools.get(evt.toolCallId);
        if (tool) {
          tool.status = 'success';
          tool.result = evt.result;
          tool.durationMs = evt.durationMs;
        }
        pushTimeline('tool_ok', evt.toolName + ' ' + evt.durationMs + 'ms');
        break;
      }
      case 'tool_use_error': {
        const tool = session.tools.get(evt.toolCallId);
        if (tool) {
          tool.status = 'error';
          tool.error = evt.error;
        }
        addTrace(msg, 'error', '✕ ' + evt.toolName);
        pushTimeline('tool_err', evt.toolName + ': ' + evt.error);
        break;
      }
      case 'compact': {
        session.stats.compacts++;
        state.compactCount++;
        session.compactLevels[evt.level] = (session.compactLevels[evt.level] || 0) + 1;
        session.compacts.push({
          level: evt.level,
          tokensFreed: evt.tokensFreed,
          evidencePreserved: evt.evidencePreserved,
          ts: Date.now()
        });
        addTrace(msg, 'compact', '⤓ ' + evt.level + ' -' + evt.tokensFreed + 't');
        pushTimeline('compact', evt.level + ' freed ' + evt.tokensFreed + 't');
        break;
      }
      case 'checkpoint':
        session.stats.checkpoints++;
        session.checkpoints.push({
          id: evt.checkpointId,
          turnCount: evt.turnCount,
          ts: Date.now()
        });
        addTrace(msg, 'checkpoint', '◆ ckpt#' + evt.turnCount);
        pushTimeline('checkpoint', 'turn=' + evt.turnCount);
        break;
      case 'budget_warning':
        session.warnings.push({
          kind: 'budget',
          dimension: evt.dimension,
          usage: evt.usage,
          limit: evt.limit,
          ts: Date.now()
        });
        updateBudget(evt.dimension, evt.usage, evt.limit);
        break;
      case 'model_fallback':
        session.warnings.push({
          kind: 'fallback',
          from: evt.from, to: evt.to, reason: evt.reason, ts: Date.now()
        });
        pushTimeline('fallback', evt.from + ' → ' + evt.to);
        break;
      case 'environment_change':
        session.envChanges.push({
          dimension: evt.dimension, before: evt.before, after: evt.after, ts: Date.now()
        });
        break;
      case 'approval_required':
        session.approvals.push({
          requestId: evt.requestId,
          toolName: evt.toolName,
          reason: evt.reason,
          ts: Date.now(),
          status: 'pending'
        });
        addTrace(msg, 'approval', '⏸ ' + evt.toolName);
        session.status = 'waiting_approval';
        break;
      case 'self_heal':
        pushTimeline('self_heal', evt.toolName + ' via ' + evt.strategy);
        break;
      case 'error':
        addTrace(msg, 'error', '✕ ' + evt.code);
        pushTimeline('error', evt.code + ': ' + evt.message);
        break;
      case 'completed':
        msg.done = true;
        session.status = evt.result && evt.result.success ? 'succeeded' : 'failed';
        session.stats.tokens = (evt.result && evt.result.tokensUsed) || 0;
        session.stats.turns = (evt.result && evt.result.turnsExecuted) || session.stats.turns;
        addTrace(msg, 'completed', '✓ ' + (evt.result && evt.result.tokensUsed || 0) + 'tok');
        pushTimeline('completed', JSON.stringify(evt.result));
        break;
    }

    renderChat();
    renderOverview();
    renderTools();
    renderCompact();
    renderCheckpoints();
    renderEnvChanges();
    renderWarnings();
    renderApprovals();
    renderTimeline();
    renderGlobalStats();
  }

  function addTrace(msg, kind, label) {
    msg.traces.push({ kind, label, ts: Date.now() });
  }
  function pushTimeline(kind, text) {
    const session = getSession();
    session.timeline.push({ kind, text, ts: Date.now() });
    if (session.timeline.length > 200) session.timeline.shift();
  }

  // ===== 渲染：聊天 =====
  function renderActiveSession() {
    const session = getSession();
    if (!session) return;
    nodes.chatTitle.textContent = session.title;
    nodes.chatSub.textContent = session.messages.length === 0
      ? '尚未发送消息'
      : (session.messages.length + ' 条消息 · ' + (session.currentRunId ? 'run=' + session.currentRunId.slice(0, 8) : ''));
    renderChat();
    renderOverview();
    renderTools();
    renderCompact();
    renderCheckpoints();
    renderEnvChanges();
    renderWarnings();
    renderApprovals();
    renderTimeline();
    renderGlobalStats();
  }
  function renderChat() {
    const session = getSession();
    if (!session) return;
    nodes.chatTitle.textContent = session.title;
    nodes.chatSub.textContent = session.messages.length + ' 条消息' + (session.currentRunId ? ' · run=' + session.currentRunId.slice(0, 8) : '');
    const scroll = nodes.chatScroll;
    const atBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
    scroll.innerHTML = '';
    if (session.messages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'chat-empty';
      empty.innerHTML = '<div class="empty-icon">◎</div><div class="empty-title">开始一次对话</div><div class="empty-sub">输入消息，右侧面板会实时显示框架内部状态。</div>';
      scroll.appendChild(empty);
      return;
    }
    session.messages.forEach((m) => scroll.appendChild(renderMessage(m)));
    if (atBottom) scroll.scrollTop = scroll.scrollHeight;
  }
  function renderMessage(m) {
    const wrap = document.createElement('div');
    wrap.className = 'msg ' + m.role;
    const avatar = document.createElement('div');
    avatar.className = 'msg-avatar';
    avatar.textContent = m.role === 'user' ? 'U' : 'A';
    const body = document.createElement('div');
    body.className = 'msg-body';
    const bubble = document.createElement('div');
    bubble.className = 'msg-bubble';
    bubble.textContent = m.content || (m.done ? '(空回复)' : '正在生成…');
    body.appendChild(bubble);
    if (m.traces && m.traces.length) {
      const tr = document.createElement('div');
      tr.className = 'msg-trace';
      m.traces.forEach((t) => {
        const chip = document.createElement('span');
        chip.className = 'trace-chip ' + t.kind;
        chip.textContent = t.label;
        tr.appendChild(chip);
      });
      body.appendChild(tr);
    }
    const meta = document.createElement('div');
    meta.className = 'msg-meta';
    meta.textContent = new Date(m.ts).toLocaleTimeString() + (m.runId ? ' · ' : '');
    if (m.runId) {
      const r = document.createElement('span');
      r.className = 'msg-runid';
      r.textContent = m.runId.slice(0, 12);
      meta.appendChild(r);
    }
    body.appendChild(meta);
    wrap.appendChild(avatar);
    wrap.appendChild(body);
    return wrap;
  }

  // ===== 渲染：Inspector =====
  function renderOverview() {
    const s = getSession();
    if (!s) return;
    nodes.runIdLabel.textContent = s.currentRunId || '—';
    nodes.ovAgent.textContent = s.agentId || '—';
    nodes.ovStatus.textContent = s.status;
    nodes.ovStatus.className = 'badge ' + (s.status === 'running' ? 'running' : s.status === 'succeeded' ? 'succeeded' : s.status === 'failed' ? 'failed' : s.status === 'waiting_approval' ? 'waiting' : '');
    nodes.ovTurns.textContent = s.stats.turns;
    nodes.ovTools.textContent = s.stats.tools;
    nodes.ovCompacts.textContent = s.stats.compacts;
    nodes.ovCheckpoints.textContent = s.stats.checkpoints;
    nodes.ovTokens.textContent = s.stats.tokens;
    nodes.ovDuration.textContent = s.stats.startedAt ? ((Date.now() - s.stats.startedAt) + ' ms') : '—';

    nodes.overviewSparkline.innerHTML = '';
    s.events.slice(-80).forEach((e) => {
      const dot = document.createElement('span');
      dot.className = 'event-dot';
      dot.title = e.type;
      const color = eventColor(e.type);
      dot.style.background = color;
      nodes.overviewSparkline.appendChild(dot);
    });
  }
  function eventColor(type) {
    if (type === 'text_delta') return '#2563eb';
    if (type.startsWith('tool_')) return '#0891b2';
    if (type === 'compact') return '#d97706';
    if (type === 'checkpoint') return '#7c3aed';
    if (type === 'completed') return '#16a34a';
    if (type === 'error' || type.endsWith('error')) return '#dc2626';
    if (type === 'approval_required') return '#ea580c';
    if (type === 'budget_warning') return '#f59e0b';
    return '#94a3b8';
  }
  function renderTimeline() {
    const s = getSession();
    if (!s) return;
    nodes.timeline.innerHTML = '';
    s.timeline.slice().reverse().forEach((t) => {
      const item = document.createElement('div');
      item.className = 'timeline-item';
      const time = document.createElement('div');
      time.className = 'timeline-time';
      time.textContent = new Date(t.ts).toLocaleTimeString().slice(-8);
      const body = document.createElement('div');
      body.className = 'timeline-body';
      body.innerHTML = '<span class="timeline-tag">' + t.kind + '</span>' + escapeHtmlBrowser(t.text || '');
      item.appendChild(time);
      item.appendChild(body);
      nodes.timeline.appendChild(item);
    });
    if (s.timeline.length === 0) nodes.timeline.innerHTML = '<div class="empty-block">等待事件…</div>';
  }
  function renderTools() {
    const s = getSession();
    if (!s) return;
    nodes.toolList.innerHTML = '';
    if (s.tools.size === 0) {
      nodes.toolList.innerHTML = '<div class="empty-block">尚未触发工具调用</div>';
      return;
    }
    const tools = Array.from(s.tools.values()).reverse();
    tools.forEach((t) => {
      const item = document.createElement('div');
      item.className = 'tool-item';
      const head = document.createElement('div');
      head.className = 'tool-head';
      head.innerHTML =
        '<div><span class="tool-name">' + escapeHtmlBrowser(t.name) + '</span></div>' +
        '<span class="tool-status ' + t.status + '">' + t.status + (t.durationMs != null ? ' · ' + t.durationMs + 'ms' : '') + '</span>';
      head.addEventListener('click', () => item.classList.toggle('expanded'));
      const detail = document.createElement('div');
      detail.className = 'tool-detail';
      detail.innerHTML =
        '<div class="tool-meta">id: ' + escapeHtmlBrowser(t.id) + '</div>' +
        '<pre>input: ' + escapeHtmlBrowser(JSON.stringify(t.input, null, 2)) + '</pre>' +
        (t.result !== undefined ? '<pre>result: ' + escapeHtmlBrowser(JSON.stringify(t.result, null, 2)) + '</pre>' : '') +
        (t.error ? '<pre style="color:var(--error)">error: ' + escapeHtmlBrowser(t.error) + '</pre>' : '');
      item.appendChild(head);
      item.appendChild(detail);
      nodes.toolList.appendChild(item);
    });
  }
  function renderCompact() {
    const s = getSession();
    if (!s) return;
    [['L1_time_gap', 'clL1'], ['L2_evidence', 'clL2'], ['L3_session_graft', 'clL3'], ['L4_legacy', 'clL4']].forEach(([lvl, id]) => {
      const count = s.compactLevels[lvl] || 0;
      const node = nodes[id];
      node.textContent = count > 0 ? '已触发 ' + count + ' 次' : '未触发';
      node.parentElement.classList.toggle('triggered', count > 0);
    });
    nodes.compactList.innerHTML = '';
    if (s.compacts.length === 0) {
      nodes.compactList.innerHTML = '<div class="empty-block">尚未触发上下文压缩</div>';
    } else {
      s.compacts.slice().reverse().forEach((c) => {
        const item = document.createElement('div');
        item.className = 'compact-list-item';
        item.innerHTML =
          '<span><b>' + c.level + '</b> · 释放 ' + c.tokensFreed + ' tokens · 保留 ' + c.evidencePreserved + ' 证据</span>' +
          '<span class="meta-mono">' + new Date(c.ts).toLocaleTimeString() + '</span>';
        nodes.compactList.appendChild(item);
      });
    }
  }
  function renderCheckpoints() {
    const s = getSession();
    if (!s) return;
    nodes.checkpointList.innerHTML = '';
    if (s.checkpoints.length === 0) {
      nodes.checkpointList.innerHTML = '<div class="empty-block">尚未触发 Checkpoint</div>';
      return;
    }
    s.checkpoints.slice().reverse().forEach((c) => {
      const item = document.createElement('div');
      item.className = 'checkpoint-item';
      item.innerHTML =
        '<span>turn=' + c.turnCount + ' · <code>' + escapeHtmlBrowser(c.id) + '</code></span>' +
        '<span class="meta-mono">' + new Date(c.ts).toLocaleTimeString() + '</span>';
      nodes.checkpointList.appendChild(item);
    });
  }
  function renderEnvChanges() {
    const s = getSession();
    if (!s) return;
    nodes.envList.innerHTML = '';
    if (s.envChanges.length === 0) {
      nodes.envList.innerHTML = '<div class="empty-block">无环境变化</div>';
      return;
    }
    s.envChanges.slice().reverse().forEach((e) => {
      const item = document.createElement('div');
      item.className = 'env-item';
      item.innerHTML =
        '<span><b>' + escapeHtmlBrowser(e.dimension) + '</b>: ' + escapeHtmlBrowser((e.before || '').slice(0, 40)) + ' → ' + escapeHtmlBrowser((e.after || '').slice(0, 40)) + '</span>' +
        '<span class="meta-mono">' + new Date(e.ts).toLocaleTimeString() + '</span>';
      nodes.envList.appendChild(item);
    });
  }
  function renderWarnings() {
    const s = getSession();
    if (!s) return;
    nodes.warningList.innerHTML = '';
    if (s.warnings.length === 0) {
      nodes.warningList.innerHTML = '<div class="empty-block">无告警</div>';
      return;
    }
    s.warnings.slice().reverse().forEach((w) => {
      const item = document.createElement('div');
      item.className = 'warning-item';
      const text = w.kind === 'budget'
        ? w.dimension + ' ' + w.usage + '/' + w.limit
        : w.from + ' → ' + w.to + ' (' + w.reason + ')';
      item.innerHTML =
        '<span><b>' + w.kind + '</b> · ' + escapeHtmlBrowser(text) + '</span>' +
        '<span class="meta-mono">' + new Date(w.ts).toLocaleTimeString() + '</span>';
      nodes.warningList.appendChild(item);
    });
  }
  function updateBudget(dim, usage, limit) {
    const s = getSession();
    if (!s) return;
    const bar = document.querySelector('.budget-bar[data-dim="' + dim + '"]');
    if (!bar) return;
    const pct = limit > 0 ? Math.min(100, (usage / limit) * 100) : 0;
    const fill = bar.querySelector('.bb-fill');
    fill.style.width = pct + '%';
    fill.className = 'bb-fill' + (pct >= 90 ? ' error' : pct >= 70 ? ' warn' : '');
    bar.querySelector('.bb-text').textContent = usage + ' / ' + limit;
  }
  function renderApprovals() {
    const s = getSession();
    if (!s) return;
    nodes.approvalList.innerHTML = '';
    const pending = s.approvals.filter((a) => a.status === 'pending');
    if (pending.length === 0) {
      nodes.approvalList.innerHTML = '<div class="empty-block">暂无审批请求</div>';
      return;
    }
    pending.forEach((a) => {
      const card = document.createElement('div');
      card.className = 'approval-card';
      card.innerHTML =
        '<div class="tool">' + escapeHtmlBrowser(a.toolName) + '</div>' +
        '<div class="reason">' + escapeHtmlBrowser(a.reason) + '</div>' +
        '<div class="approval-actions">' +
          '<button class="approve">通过</button>' +
          '<button class="deny">拒绝</button>' +
        '</div>';
      card.querySelector('.approve').addEventListener('click', () => decideApproval(a, true));
      card.querySelector('.deny').addEventListener('click', () => decideApproval(a, false));
      nodes.approvalList.appendChild(card);
    });
  }
  async function decideApproval(a, approved) {
    const s = getSession();
    if (!s || !s.currentRunId) return;
    try {
      await request('/api/v1/runs/' + encodeURIComponent(s.currentRunId) + '/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved, approver: nodes.userId.value.trim() || 'debug-user' })
      });
      a.status = approved ? 'approved' : 'denied';
      renderApprovals();
    } catch (err) {
      appendRaw({ type: 'console.error', scope: 'approval', message: String(err) });
    }
  }

  async function runAction(action, body) {
    const s = getSession();
    if (!s || !s.currentRunId) return;
    try {
      const resp = await request('/api/v1/runs/' + encodeURIComponent(s.currentRunId) + '/' + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      appendRaw({ type: 'console.action', action, response: resp });
    } catch (err) {
      appendRaw({ type: 'console.error', scope: action, message: String(err) });
    }
  }

  function renderGlobalStats() {
    nodes.statMessages.textContent = state.sessions.reduce((acc, s) => acc + s.messages.filter((m) => m.role === 'user').length, 0);
    nodes.statActiveRuns.textContent = state.sessions.filter((s) => s.status === 'running').length;
    nodes.statEvents.textContent = state.eventCount;
    nodes.statCompacts.textContent = state.compactCount;
  }

  function appendRaw(evt) {
    const item = document.createElement('div');
    item.className = 'raw-item';
    item.setAttribute('data-text', (evt && evt.type ? evt.type : 'unknown').toLowerCase() + ' ' + JSON.stringify(evt).toLowerCase());
    const head = document.createElement('div');
    head.className = 'raw-head';
    head.innerHTML = '<span class="raw-type">' + escapeHtmlBrowser(evt && evt.type ? evt.type : 'unknown') + '</span><span>' + new Date().toLocaleTimeString() + '</span>';
    const pre = document.createElement('pre');
    pre.textContent = JSON.stringify(evt, null, 2);
    item.appendChild(head);
    item.appendChild(pre);
    nodes.rawList.insertBefore(item, nodes.rawList.firstChild);
    while (nodes.rawList.children.length > 200) nodes.rawList.removeChild(nodes.rawList.lastChild);
    applyRawFilter();
  }
  function applyRawFilter() {
    const kw = nodes.rawFilter.value.trim().toLowerCase();
    nodes.rawList.querySelectorAll('.raw-item').forEach((item) => {
      const txt = item.getAttribute('data-text') || '';
      item.style.display = !kw || txt.indexOf(kw) >= 0 ? '' : 'none';
    });
  }

  function switchTab(name) {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.getAttribute('data-tab') === name));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.getAttribute('data-panel') === name));
  }

  function exportSession() {
    const s = getSession();
    if (!s) return;
    const blob = new Blob([JSON.stringify({
      title: s.title,
      messages: s.messages,
      events: s.events,
      tools: Array.from(s.tools.values()),
      compacts: s.compacts,
      checkpoints: s.checkpoints,
      warnings: s.warnings,
      envChanges: s.envChanges
    }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'nexus-session-' + s.id + '.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function escapeHtmlBrowser(v) {
    return String(v == null ? '' : v)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
  function safeJson(raw) {
    try { return JSON.parse(raw); } catch (e) { return { _raw: raw }; }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
`;
