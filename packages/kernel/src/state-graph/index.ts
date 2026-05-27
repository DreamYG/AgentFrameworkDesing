/** 状态图节点执行上下文 */
export interface NodeContext {
  readonly runId: string;
  readonly tenantId: string;
  readonly nodeId: string;
  readonly idempotencyKey: string;
}

/** 状态图节点执行结果 */
export interface NodeResult<TState = Record<string, unknown>> {
  readonly state: TState;
  readonly next?: string;
  readonly interrupted?: boolean;
  readonly interruptReason?: 'approval' | 'external_event' | 'budget' | 'human_breakpoint';
}

/** 状态图节点契约 */
export interface IGraphNode<TState = Record<string, unknown>> {
  readonly id: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  execute(state: TState, context: NodeContext): Promise<NodeResult<TState>>;
}

/** 状态图边契约 */
export interface IGraphEdge<TState = Record<string, unknown>> {
  readonly from: string;
  readonly to: string | ((state: TState) => string);
  readonly condition?: (state: TState) => boolean;
  readonly compensation?: (state: TState) => Promise<void>;
}

/** 最小状态图执行引擎 */
export class StateGraphEngine<TState = Record<string, unknown>> {
  private readonly nodes = new Map<string, IGraphNode<TState>>();
  private readonly edges: IGraphEdge<TState>[] = [];

  addNode(node: IGraphNode<TState>): void {
    this.nodes.set(node.id, node);
  }

  addEdge(edge: IGraphEdge<TState>): void {
    this.edges.push(edge);
  }

  async execute(entryNodeId: string, initialState: TState, context: Omit<NodeContext, 'nodeId'>): Promise<NodeResult<TState>> {
    let currentNodeId = entryNodeId;
    let state = initialState;

    while (true) {
      const node = this.nodes.get(currentNodeId);
      if (!node) throw new Error(`Graph node not found: ${currentNodeId}`);

      const result = await node.execute(state, { ...context, nodeId: currentNodeId });
      state = result.state;
      if (result.interrupted || result.next === undefined) return result;

      const edge = this.edges.find((e) => e.from === currentNodeId && (e.condition?.(state) ?? true));
      if (!edge) return result;
      currentNodeId = typeof edge.to === 'function' ? edge.to(state) : edge.to;
    }
  }
}
