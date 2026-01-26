import type { Node, Edge } from 'reactflow';

/**
 * Node types supported in the workflow editor.
 */
export type NodeType =
  | 'start'
  | 'end'
  | 'mcpCall'
  | 'conditional'
  | 'transform'
  | 'loop'
  | 'parallel'
  | 'wait'
  | 'webhook';

/**
 * Base data structure for all workflow nodes.
 */
export interface WorkflowNodeData {
  label: string;
  type: NodeType;
  /** Description shown in node */
  description?: string;
  /** Configuration specific to node type */
  config: NodeConfig;
  /** Whether this node has validation errors */
  hasError?: boolean;
  /** Error message if hasError is true */
  errorMessage?: string;
  /** Execution status for monitoring */
  executionStatus?: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  /** Output from last execution */
  lastOutput?: unknown;
}

/**
 * Configuration union for different node types.
 */
export type NodeConfig =
  | StartNodeConfig
  | EndNodeConfig
  | McpCallNodeConfig
  | ConditionalNodeConfig
  | TransformNodeConfig
  | LoopNodeConfig
  | ParallelNodeConfig
  | WaitNodeConfig
  | WebhookNodeConfig;

export interface StartNodeConfig {
  type: 'start';
  /** Input schema for the workflow */
  inputSchema?: Record<string, unknown>;
}

export interface EndNodeConfig {
  type: 'end';
  /** Output mapping expression */
  outputMapping?: string;
}

export interface McpCallNodeConfig {
  type: 'mcpCall';
  /** Server ID to call */
  serverId: string;
  /** Server name for display */
  serverName?: string;
  /** Tool name to invoke */
  toolName: string;
  /** Arguments template (can use expressions) */
  arguments: Record<string, unknown>;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Number of retries on failure */
  retries?: number;
  /** Whether to continue on error */
  continueOnError?: boolean;
}

export interface ConditionalNodeConfig {
  type: 'conditional';
  /** JavaScript expression that evaluates to boolean */
  condition: string;
  /** Description of what this condition checks */
  conditionDescription?: string;
}

export interface TransformNodeConfig {
  type: 'transform';
  /** JavaScript expression to transform data */
  expression: string;
  /** Description of the transformation */
  transformDescription?: string;
}

export interface LoopNodeConfig {
  type: 'loop';
  /** Expression that returns an iterable */
  iterableExpression: string;
  /** Variable name for current item */
  itemVariable: string;
  /** Maximum iterations (safety limit) */
  maxIterations?: number;
}

export interface ParallelNodeConfig {
  type: 'parallel';
  /** Maximum concurrent executions */
  maxConcurrency?: number;
  /** Whether to wait for all branches or just first */
  waitForAll?: boolean;
}

export interface WaitNodeConfig {
  type: 'wait';
  /** Duration in milliseconds */
  duration: number;
  /** Or wait until a specific time */
  until?: string;
}

export interface WebhookNodeConfig {
  type: 'webhook';
  /** Webhook URL to call */
  url: string;
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Headers to send */
  headers?: Record<string, string>;
  /** Body template */
  body?: string;
}

/**
 * Custom workflow node type for React Flow.
 */
export type WorkflowNode = Node<WorkflowNodeData>;

/**
 * Custom workflow edge type for React Flow.
 */
export type WorkflowEdge = Edge & {
  /** Label for conditional edges */
  label?: string;
  /** Whether this is the "true" or "false" branch */
  conditionBranch?: 'true' | 'false';
  /** Edge style based on state */
  animated?: boolean;
};

/**
 * Workflow API types matching preload API.
 */
export interface WorkflowInfo {
  id: string;
  name: string;
  description?: string;
  projectId?: string;
  status: 'draft' | 'active' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  version: number;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
}

export interface WorkflowExecutionInfo {
  id: string;
  workflowId: string;
  workflowName: string;
  status: 'draft' | 'active' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  startedAt: number;
  completedAt?: number;
  error?: string;
  triggeredBy?: string;
}

/**
 * Props for node configuration panels.
 */
export interface NodeConfigPanelProps<T extends NodeConfig> {
  config: T;
  onChange: (config: T) => void;
  onClose: () => void;
}
