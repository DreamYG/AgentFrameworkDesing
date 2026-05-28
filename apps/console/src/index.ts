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
 * Console MVP 数据适配层：Run 列表、审批、审计、预算、Pack 启停。
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
 * 渲染 Phase 1 调试控制台。
 */
export function renderConsoleHtml(model: ConsoleModel, options: ConsoleRenderOptions = {}): string {
  const title = options.title ?? 'Nexus Debug Console';
  const gatewayBaseUrl = options.gatewayBaseUrl ?? '';
  const runs = model.listRuns().map((run) => (
    `<li><button type="button" data-run-id="${escapeHtml(run.runId)}">${escapeHtml(run.runId)}</button><span>${escapeHtml(run.status)}</span><span>${escapeHtml(run.agentId)}</span></li>`
  )).join('');
  const approvals = model.listApprovals().map((approval) => (
    `<li><span>${escapeHtml(approval.requestId)}</span><span>${escapeHtml(approval.toolName)}</span><span>${escapeHtml(approval.status)}</span></li>`
  )).join('');
  const packs = model.listPacks().map((pack) => (
    `<li><span>${escapeHtml(pack.packId)}</span><span>${escapeHtml(pack.version)}</span><span>${escapeHtml(pack.status)}</span></li>`
  )).join('');
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <style>${CONSOLE_STYLES}</style>
  </head>
  <body>
    <main class="shell">
      <header class="topbar">
        <div>
          <p class="eyebrow">Phase 1 调试台</p>
          <h1>${escapeHtml(title)}</h1>
        </div>
        <div class="status-strip">
          <span id="healthStatus" class="pill neutral">health: unknown</span>
          <span id="readyStatus" class="pill neutral">ready: unknown</span>
          <button id="refreshHealth" type="button">刷新健康</button>
        </div>
      </header>

      <section class="gateway-card">
        <label for="gatewayBaseUrl">Gateway 地址</label>
        <input id="gatewayBaseUrl" value="${escapeHtml(gatewayBaseUrl)}" placeholder="留空表示同源，例如 http://localhost:3000">
        <button id="loadSnapshot" type="button">加载控制面快照</button>
      </section>

      <section class="grid">
        <section class="panel interaction-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">用户交互</p>
              <h2>发送消息</h2>
            </div>
          </div>
          <form id="messageForm" class="form">
            <div class="inline-fields">
              <label>tenantId<input id="tenantId" value="default" autocomplete="off"></label>
              <label>userId<input id="userId" value="debug-user" autocomplete="off"></label>
              <label>channel<input id="channel" value="http" autocomplete="off"></label>
            </div>
            <label>消息内容<textarea id="messageContent" rows="7" placeholder="例如：帮我拆解登录和权限需求，并分配任务和催办"></textarea></label>
            <div class="quick-actions">
              <button type="button" data-template="帮我把登录、权限、审计三个需求拆成 WBS，并给出任务分配建议">需求拆解</button>
              <button type="button" data-template="当前项目健康度如何？请识别主要风险并给出催办建议">项目诊断</button>
              <button type="button" data-template="请给项目负责人发送一条任务催办通知">催办通知</button>
            </div>
            <div class="form-actions">
              <button class="primary" type="submit">发送消息</button>
              <button id="clearLogs" type="button">清空日志</button>
            </div>
          </form>

          <section class="run-card">
            <div class="panel-heading compact">
              <h2>当前 Run</h2>
              <span id="streamState" class="pill neutral">stream: idle</span>
            </div>
            <label>runId<input id="currentRunId" placeholder="发送消息后自动填充，也可手动输入"></label>
            <div class="run-actions">
              <button id="refreshRun" type="button">刷新状态</button>
              <button id="connectStream" type="button">连接流</button>
              <button id="loadAudit" type="button">拉取审计</button>
              <button id="approveRun" type="button">审批通过</button>
              <button id="resumeRun" type="button">恢复</button>
              <button id="cancelRun" type="button">取消</button>
              <button id="refillBudget" type="button">补预算</button>
            </div>
            <pre id="runDetails" class="json-box">{}</pre>
          </section>

          <section class="snapshot-card">
            <h2>启动快照</h2>
            <div class="columns">
              <div><h3>Runs</h3><ul id="initialRuns">${runs}</ul></div>
              <div><h3>Approvals</h3><ul id="initialApprovals">${approvals}</ul></div>
              <div><h3>Packs</h3><ul id="initialPacks">${packs}</ul></div>
            </div>
          </section>
        </section>

        <section class="panel log-panel">
          <div class="panel-heading">
            <div>
              <p class="eyebrow">日志信息</p>
              <h2>事件与审计</h2>
            </div>
            <div class="log-tools">
              <select id="logFilter">
                <option value="all">全部</option>
                <option value="stream">流式事件</option>
                <option value="audit">审计</option>
                <option value="health">健康</option>
                <option value="error">错误</option>
              </select>
              <input id="logSearch" placeholder="过滤关键字">
              <label class="checkbox"><input id="autoScroll" type="checkbox" checked>自动滚动</label>
            </div>
          </div>
          <div id="logList" class="log-list" aria-live="polite"></div>
        </section>
      </section>
    </main>
    <script>
      window.NEXUS_CONSOLE_CONFIG = ${JSON.stringify({ gatewayBaseUrl })};
    </script>
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
  color-scheme: dark;
  --bg: #0f172a;
  --panel: #111827;
  --panel-soft: #1f2937;
  --border: #334155;
  --text: #e5e7eb;
  --muted: #94a3b8;
  --accent: #38bdf8;
  --ok: #22c55e;
  --warn: #f59e0b;
  --error: #ef4444;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: radial-gradient(circle at top left, #1e3a8a 0, var(--bg) 42%);
  color: var(--text);
  font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
button, input, textarea, select {
  border: 1px solid var(--border);
  border-radius: 10px;
  background: #0b1220;
  color: var(--text);
  font: inherit;
}
button {
  cursor: pointer;
  padding: 10px 14px;
}
button:hover { border-color: var(--accent); }
button.primary {
  background: linear-gradient(135deg, #0284c7, #2563eb);
  border-color: #60a5fa;
}
input, textarea, select {
  width: 100%;
  padding: 10px 12px;
}
textarea { resize: vertical; }
label {
  display: grid;
  gap: 6px;
  color: var(--muted);
  font-size: 13px;
}
h1, h2, h3, p { margin: 0; }
h1 { font-size: 28px; }
h2 { font-size: 18px; }
h3 { color: var(--muted); font-size: 14px; font-weight: 600; }
.shell {
  display: grid;
  gap: 18px;
  min-height: 100vh;
  padding: 24px;
}
.topbar, .gateway-card, .panel, .run-card, .snapshot-card {
  border: 1px solid rgba(148, 163, 184, 0.25);
  border-radius: 18px;
  background: rgba(15, 23, 42, 0.78);
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.28);
}
.topbar, .gateway-card {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  padding: 18px;
}
.gateway-card {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) minmax(260px, 4fr) auto;
}
.grid {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(420px, 0.95fr) minmax(480px, 1.05fr);
}
.panel { padding: 18px; }
.panel-heading {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 16px;
}
.panel-heading.compact { margin: 0 0 12px; }
.eyebrow {
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.status-strip, .quick-actions, .form-actions, .run-actions, .log-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.pill {
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 8px 10px;
  font-size: 12px;
}
.pill.ok { border-color: var(--ok); color: #86efac; }
.pill.warn { border-color: var(--warn); color: #fcd34d; }
.pill.error { border-color: var(--error); color: #fca5a5; }
.pill.neutral { color: var(--muted); }
.form, .run-card, .snapshot-card {
  display: grid;
  gap: 14px;
}
.run-card, .snapshot-card {
  margin-top: 16px;
  padding: 16px;
}
.inline-fields {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, 1fr);
}
.columns {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(3, 1fr);
}
.columns ul {
  display: grid;
  gap: 8px;
  list-style: none;
  margin: 8px 0 0;
  padding: 0;
}
.columns li {
  display: grid;
  gap: 4px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: rgba(15, 23, 42, 0.7);
  color: var(--muted);
  font-size: 12px;
}
.columns li button {
  padding: 0;
  border: 0;
  color: var(--accent);
  text-align: left;
}
.json-box {
  min-height: 120px;
  overflow: auto;
  margin: 0;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: #020617;
  color: #bfdbfe;
}
.log-panel {
  display: grid;
  grid-template-rows: auto 1fr;
  min-height: 680px;
}
.log-tools {
  align-items: center;
  max-width: 640px;
}
.log-tools select { width: 140px; }
.log-tools input { width: 190px; }
.checkbox {
  align-items: center;
  display: flex;
  gap: 8px;
}
.checkbox input { width: auto; }
.log-list {
  display: grid;
  align-content: start;
  gap: 10px;
  max-height: calc(100vh - 220px);
  overflow: auto;
  padding-right: 4px;
}
.log-entry {
  border: 1px solid var(--border);
  border-left: 4px solid var(--accent);
  border-radius: 12px;
  background: rgba(2, 6, 23, 0.74);
  padding: 12px;
}
.log-entry.error { border-left-color: var(--error); }
.log-entry.health { border-left-color: var(--ok); }
.log-entry.audit { border-left-color: var(--warn); }
.log-entry header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 12px;
  margin-bottom: 8px;
}
.log-entry pre {
  margin: 0;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-word;
}
@media (max-width: 1100px) {
  .grid, .gateway-card, .inline-fields, .columns { grid-template-columns: 1fr; }
  .topbar { align-items: stretch; flex-direction: column; }
}
`;

const CONSOLE_BROWSER_SCRIPT = `
(function () {
  var config = window.NEXUS_CONSOLE_CONFIG || {};
  var state = {
    gatewayBaseUrl: config.gatewayBaseUrl || '',
    currentRunId: '',
    socket: null
  };
  var nodes = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function init() {
    [
      'gatewayBaseUrl', 'healthStatus', 'readyStatus', 'refreshHealth', 'loadSnapshot',
      'messageForm', 'tenantId', 'userId', 'channel', 'messageContent', 'clearLogs',
      'currentRunId', 'streamState', 'refreshRun', 'connectStream', 'loadAudit',
      'approveRun', 'resumeRun', 'cancelRun', 'refillBudget', 'runDetails',
      'logFilter', 'logSearch', 'autoScroll', 'logList', 'initialRuns'
    ].forEach(function (id) { nodes[id] = byId(id); });

    nodes.gatewayBaseUrl.addEventListener('change', function () {
      state.gatewayBaseUrl = nodes.gatewayBaseUrl.value.trim();
    });
    nodes.refreshHealth.addEventListener('click', refreshHealth);
    nodes.loadSnapshot.addEventListener('click', loadSnapshot);
    nodes.messageForm.addEventListener('submit', submitMessage);
    nodes.clearLogs.addEventListener('click', function () { nodes.logList.innerHTML = ''; });
    nodes.refreshRun.addEventListener('click', refreshRun);
    nodes.connectStream.addEventListener('click', connectStream);
    nodes.loadAudit.addEventListener('click', loadAudit);
    nodes.approveRun.addEventListener('click', function () { decideRun(true); });
    nodes.resumeRun.addEventListener('click', resumeRun);
    nodes.cancelRun.addEventListener('click', cancelRun);
    nodes.refillBudget.addEventListener('click', refillBudget);
    nodes.logFilter.addEventListener('change', applyLogFilter);
    nodes.logSearch.addEventListener('input', applyLogFilter);
    document.querySelectorAll('[data-template]').forEach(function (button) {
      button.addEventListener('click', function () {
        nodes.messageContent.value = button.getAttribute('data-template') || '';
        nodes.messageContent.focus();
      });
    });
    document.querySelectorAll('[data-run-id]').forEach(function (button) {
      button.addEventListener('click', function () {
        setRunId(button.getAttribute('data-run-id') || '');
      });
    });

    refreshHealth();
    appendLog('system', { message: 'Console ready. 发送消息后可连接流式事件并拉取审计。' });
  }

  function apiUrl(path) {
    return new URL(path, state.gatewayBaseUrl || window.location.origin).toString();
  }

  function wsUrl(runId) {
    var base = new URL(state.gatewayBaseUrl || window.location.origin);
    base.protocol = base.protocol === 'https:' ? 'wss:' : 'ws:';
    base.pathname = '/ws/stream/' + encodeURIComponent(runId);
    base.search = '';
    return base.toString();
  }

  async function request(path, options) {
    var response = await fetch(apiUrl(path), options || {});
    var text = await response.text();
    var data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error('HTTP ' + response.status + ': ' + text);
    }
    return data;
  }

  async function refreshHealth() {
    try {
      var health = await request('/health');
      setPill(nodes.healthStatus, 'health: ' + health.status, health.status === 'ok' ? 'ok' : 'warn');
      appendLog('health', health);
    } catch (error) {
      setPill(nodes.healthStatus, 'health: error', 'error');
      appendLog('error', { scope: 'health', message: String(error) });
    }
    try {
      var ready = await request('/ready');
      setPill(nodes.readyStatus, 'ready: ' + Boolean(ready.ready), ready.ready ? 'ok' : 'warn');
      appendLog('health', ready);
    } catch (error) {
      setPill(nodes.readyStatus, 'ready: error', 'error');
      appendLog('error', { scope: 'ready', message: String(error) });
    }
  }

  async function loadSnapshot() {
    try {
      var snapshot = await Promise.all([
        request('/api/v1/runs'),
        request('/api/v1/approvals/pending'),
        request('/api/v1/packs')
      ]);
      appendLog('audit', { snapshot: { runs: snapshot[0], approvals: snapshot[1], packs: snapshot[2] } });
    } catch (error) {
      appendLog('error', { scope: 'snapshot', message: String(error) });
    }
  }

  async function submitMessage(event) {
    event.preventDefault();
    var content = nodes.messageContent.value.trim();
    if (!content) {
      appendLog('error', { scope: 'message', message: '消息内容不能为空' });
      return;
    }
    try {
      var response = await request('/api/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: content,
          tenantId: nodes.tenantId.value.trim() || 'default',
          userId: nodes.userId.value.trim() || 'debug-user',
          channel: nodes.channel.value.trim() || 'http'
        })
      });
      appendLog('audit', { action: 'message.accepted', response: response });
      if (response.runId) {
        setRunId(response.runId);
        await refreshRun();
        connectStream();
      }
    } catch (error) {
      appendLog('error', { scope: 'message', message: String(error) });
    }
  }

  async function refreshRun() {
    var runId = readRunId();
    if (!runId) return;
    try {
      var run = await request('/api/v1/runs/' + encodeURIComponent(runId));
      var budget = await request('/api/v1/runs/' + encodeURIComponent(runId) + '/budget').catch(function () { return null; });
      nodes.runDetails.textContent = JSON.stringify({ run: run, budget: budget }, null, 2);
      appendLog('audit', { action: 'run.refresh', run: run, budget: budget });
    } catch (error) {
      appendLog('error', { scope: 'run', message: String(error) });
    }
  }

  async function loadAudit() {
    var runId = readRunId();
    if (!runId) return;
    try {
      appendLog('audit', await request('/api/v1/runs/' + encodeURIComponent(runId) + '/audit'));
    } catch (error) {
      appendLog('error', { scope: 'audit', message: String(error) });
    }
  }

  function connectStream() {
    var runId = readRunId();
    if (!runId) return;
    if (state.socket) {
      state.socket.close();
      state.socket = null;
    }
    try {
      var socket = new WebSocket(wsUrl(runId));
      state.socket = socket;
      setPill(nodes.streamState, 'stream: connecting', 'warn');
      socket.addEventListener('open', function () {
        setPill(nodes.streamState, 'stream: connected', 'ok');
        appendLog('stream', { message: 'stream connected', runId: runId });
      });
      socket.addEventListener('message', function (event) {
        var payload = safeJson(event.data);
        appendLog('stream', payload);
      });
      socket.addEventListener('close', function () {
        setPill(nodes.streamState, 'stream: closed', 'neutral');
        appendLog('stream', { message: 'stream closed', runId: runId });
      });
      socket.addEventListener('error', function () {
        setPill(nodes.streamState, 'stream: error', 'error');
        appendLog('error', { scope: 'stream', message: 'WebSocket error' });
      });
    } catch (error) {
      appendLog('error', { scope: 'stream', message: String(error) });
    }
  }

  async function decideRun(approved) {
    var runId = readRunId();
    if (!runId) return;
    try {
      appendLog('audit', await request('/api/v1/runs/' + encodeURIComponent(runId) + '/approve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ approved: approved, approver: nodes.userId.value.trim() || 'debug-user' })
      }));
      await refreshRun();
    } catch (error) {
      appendLog('error', { scope: 'approval', message: String(error) });
    }
  }

  async function resumeRun() {
    await postRunAction('resume', {});
  }

  async function cancelRun() {
    await postRunAction('cancel', { reason: 'console_cancel' });
  }

  async function refillBudget() {
    await postRunAction('budget/refill', { amount: 1000 });
  }

  async function postRunAction(action, body) {
    var runId = readRunId();
    if (!runId) return;
    try {
      appendLog('audit', await request('/api/v1/runs/' + encodeURIComponent(runId) + '/' + action, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body)
      }));
      await refreshRun();
    } catch (error) {
      appendLog('error', { scope: action, message: String(error) });
    }
  }

  function setRunId(runId) {
    state.currentRunId = runId;
    nodes.currentRunId.value = runId;
  }

  function readRunId() {
    var runId = nodes.currentRunId.value.trim();
    if (!runId) {
      appendLog('error', { scope: 'run', message: '请先输入或发送生成 runId' });
      return '';
    }
    state.currentRunId = runId;
    return runId;
  }

  function appendLog(type, payload) {
    var entry = document.createElement('article');
    entry.className = 'log-entry ' + type;
    entry.setAttribute('data-type', type);
    entry.setAttribute('data-text', JSON.stringify(payload).toLowerCase());
    var header = document.createElement('header');
    var label = document.createElement('span');
    label.textContent = type;
    var time = document.createElement('time');
    time.textContent = new Date().toLocaleTimeString();
    header.appendChild(label);
    header.appendChild(time);
    var pre = document.createElement('pre');
    pre.textContent = JSON.stringify(payload, null, 2);
    entry.appendChild(header);
    entry.appendChild(pre);
    nodes.logList.appendChild(entry);
    applyLogFilter();
    if (nodes.autoScroll.checked) {
      nodes.logList.scrollTop = nodes.logList.scrollHeight;
    }
  }

  function applyLogFilter() {
    var type = nodes.logFilter.value;
    var keyword = nodes.logSearch.value.trim().toLowerCase();
    nodes.logList.querySelectorAll('.log-entry').forEach(function (entry) {
      var matchType = type === 'all' || entry.getAttribute('data-type') === type;
      var matchText = !keyword || (entry.getAttribute('data-text') || '').indexOf(keyword) >= 0;
      entry.style.display = matchType && matchText ? '' : 'none';
    });
  }

  function setPill(node, text, stateName) {
    node.textContent = text;
    node.className = 'pill ' + stateName;
  }

  function safeJson(raw) {
    try {
      return JSON.parse(raw);
    } catch (_error) {
      return { raw: raw };
    }
  }

  window.addEventListener('DOMContentLoaded', init);
})();
`;
