import type { Database as BetterSqlite3Database } from 'better-sqlite3';

/**
 * Core service interfaces for dependency injection.
 * All services implement these interfaces to enable testability and loose coupling.
 */

// ============================================================================
// Core Infrastructure
// ============================================================================

export interface IConfig {
  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  set<T>(key: string, value: T): void;
  has(key: string): boolean;
  delete(key: string): void;
  readonly dataPath: string;
  readonly isDevelopment: boolean;
}

export interface IDatabase {
  readonly db: BetterSqlite3Database;
  initialize(): void;
  close(): void;
  transaction<T>(fn: () => T): T;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ILogger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  child(context: Record<string, unknown>): ILogger;
}

// ============================================================================
// Token & Authentication
// ============================================================================

export interface Token {
  id: string;
  clientId: string;
  name: string;
  issuedAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  scopes: string[];
  serverAccess: Record<string, boolean>;
  metadata?: Record<string, unknown>;
}

export interface TokenValidationResult {
  valid: boolean;
  token?: Token;
  error?: string;
}

export interface TokenGenerateOptions {
  clientId: string;
  name: string;
  ttl?: number;
  scopes?: string[];
  serverAccess?: Record<string, boolean>;
}

export interface ITokenService {
  generateToken(options: TokenGenerateOptions): Promise<Token>;
  validateToken(tokenId: string): Promise<TokenValidationResult>;
  revokeToken(tokenId: string): Promise<void>;
  refreshToken(tokenId: string): Promise<Token>;
  listTokens(clientId?: string): Promise<Token[]>;
  updateServerAccess(tokenId: string, serverAccess: Record<string, boolean>): Promise<Token>;
}

export interface ITokenValidator {
  validate(tokenId: string): Promise<TokenValidationResult>;
  validateForServer(tokenId: string, serverId: string): Promise<TokenValidationResult>;
}

export interface ITokenRepository {
  create(token: Token): Promise<Token>;
  findById(id: string): Promise<Token | null>;
  findByClientId(clientId: string): Promise<Token[]>;
  update(token: Token): Promise<Token>;
  delete(id: string): Promise<void>;
  deleteExpired(): Promise<number>;
}

// ============================================================================
// MCP Server Management
// ============================================================================

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'error' | 'stopping';
export type ServerTransport = 'stdio' | 'sse' | 'http';

export interface MCPServer {
  id: string;
  name: string;
  description?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  transport: ServerTransport;
  url?: string;
  status: ServerStatus;
  projectId?: string;
  toolPermissions: Record<string, boolean>;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  serverName: string;
}

export interface IServerManager {
  startServer(serverId: string): Promise<void>;
  stopServer(serverId: string): Promise<void>;
  restartServer(serverId: string): Promise<void>;
  getServer(serverId: string): MCPServer | undefined;
  getAllServers(): MCPServer[];
  getServersByProject(projectId: string): MCPServer[];
  getRunningServers(): MCPServer[];
  addServer(server: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt' | 'status'>): Promise<MCPServer>;
  updateServer(serverId: string, updates: Partial<MCPServer>): Promise<MCPServer>;
  removeServer(serverId: string): Promise<void>;
  getServerTools(serverId: string): Promise<MCPTool[]>;
}

export interface IServerRepository {
  create(server: MCPServer): Promise<MCPServer>;
  findById(id: string): Promise<MCPServer | null>;
  findAll(): Promise<MCPServer[]>;
  findByProjectId(projectId: string): Promise<MCPServer[]>;
  update(server: MCPServer): Promise<MCPServer>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Project Management
// ============================================================================

/**
 * Project entity for organizing servers, workspaces, and configurations.
 * Projects enable multi-tenant routing via x-mcpr-project header.
 */
export interface Project {
  id: string;
  name: string;
  description?: string;
  /** Project slug for URL-safe identification */
  slug: string;
  /** Root directory path for project files */
  rootPath?: string;
  /** Server IDs associated with this project */
  serverIds: string[];
  /** Workspace IDs associated with this project */
  workspaceIds: string[];
  /** Whether the project is active */
  active: boolean;
  /** Project-level settings */
  settings: ProjectSettings;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSettings {
  /** Default policy for tool execution */
  defaultToolPolicy?: PolicyAction;
  /** Whether to require approval for all tools */
  requireApproval?: boolean;
  /** Rate limit for this project (requests per minute) */
  rateLimit?: number;
  /** Custom environment variables for project servers */
  env?: Record<string, string>;
}

export interface ProjectCreateInput {
  name: string;
  description?: string;
  slug?: string;
  rootPath?: string;
  settings?: Partial<ProjectSettings>;
}

export interface IProjectService {
  createProject(input: ProjectCreateInput): Promise<Project>;
  getProject(projectId: string): Promise<Project | null>;
  getProjectBySlug(slug: string): Promise<Project | null>;
  getAllProjects(): Promise<Project[]>;
  updateProject(projectId: string, updates: Partial<Project>): Promise<Project>;
  deleteProject(projectId: string): Promise<void>;
  addServerToProject(projectId: string, serverId: string): Promise<void>;
  removeServerFromProject(projectId: string, serverId: string): Promise<void>;
  addWorkspaceToProject(projectId: string, workspaceId: string): Promise<void>;
  removeWorkspaceFromProject(projectId: string, workspaceId: string): Promise<void>;
}

export interface IProjectRepository {
  create(project: Project): Promise<Project>;
  findById(id: string): Promise<Project | null>;
  findBySlug(slug: string): Promise<Project | null>;
  findAll(): Promise<Project[]>;
  update(project: Project): Promise<Project>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Workspace Management
// ============================================================================

export interface Workspace {
  id: string;
  name: string;
  path: string;
  serverIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface IWorkspaceService {
  createWorkspace(name: string, path: string): Promise<Workspace>;
  getWorkspace(workspaceId: string): Promise<Workspace | null>;
  getAllWorkspaces(): Promise<Workspace[]>;
  updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<Workspace>;
  deleteWorkspace(workspaceId: string): Promise<void>;
  addServerToWorkspace(workspaceId: string, serverId: string): Promise<void>;
  removeServerFromWorkspace(workspaceId: string, serverId: string): Promise<void>;
}

export interface IWorkspaceRepository {
  create(workspace: Workspace): Promise<Workspace>;
  findById(id: string): Promise<Workspace | null>;
  findAll(): Promise<Workspace[]>;
  update(workspace: Workspace): Promise<Workspace>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Policy Engine
// ============================================================================

export type PolicyScope = 'global' | 'workspace' | 'server' | 'client';
export type PolicyResourceType = 'tool' | 'server' | 'resource';
export type PolicyAction = 'allow' | 'deny' | 'require_approval';

export interface PolicyCondition {
  field: string;
  operator: 'equals' | 'contains' | 'matches' | 'greater_than' | 'less_than';
  value: string | number | boolean;
}

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  scope: PolicyScope;
  scopeId?: string;
  resourceType: PolicyResourceType;
  pattern: string;
  action: PolicyAction;
  priority: number;
  conditions?: PolicyCondition[];
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PolicyContext {
  clientId: string;
  serverId: string;
  workspaceId?: string;
  resourceType: PolicyResourceType;
  resourceName: string;
  metadata?: Record<string, unknown>;
}

export interface PolicyDecision {
  action: PolicyAction;
  ruleId?: string;
  ruleName?: string;
  reason?: string;
}

export interface IPolicyEngine {
  evaluate(context: PolicyContext): Promise<PolicyDecision>;
  addRule(rule: Omit<PolicyRule, 'id' | 'createdAt' | 'updatedAt'>): Promise<PolicyRule>;
  updateRule(ruleId: string, updates: Partial<PolicyRule>): Promise<PolicyRule>;
  deleteRule(ruleId: string): Promise<void>;
  getRules(scope?: PolicyScope, scopeId?: string): Promise<PolicyRule[]>;
  getRule(ruleId: string): Promise<PolicyRule | null>;
}

export interface IPolicyRepository {
  create(rule: PolicyRule): Promise<PolicyRule>;
  findById(id: string): Promise<PolicyRule | null>;
  findAll(): Promise<PolicyRule[]>;
  findByScope(scope: PolicyScope, scopeId?: string): Promise<PolicyRule[]>;
  findApplicable(context: PolicyContext): Promise<PolicyRule[]>;
  update(rule: PolicyRule): Promise<PolicyRule>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Approval Queue
// ============================================================================

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired';

export interface ApprovalRequest {
  id: string;
  clientId: string;
  serverId: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  policyRuleId: string;
  status: ApprovalStatus;
  requestedAt: number;
  respondedAt?: number;
  respondedBy?: string;
  responseNote?: string;
  expiresAt: number;
}

export interface ApprovalResponse {
  approved: boolean;
  note?: string;
  respondedBy?: string;
}

export interface ApprovalResult {
  approved: boolean;
  reason?: string;
}

export interface IApprovalQueue {
  createRequest(
    request: Omit<ApprovalRequest, 'id' | 'status' | 'requestedAt' | 'expiresAt'>
  ): Promise<ApprovalRequest>;
  waitForApproval(requestId: string, timeoutMs?: number): Promise<ApprovalResult>;
  respond(requestId: string, response: ApprovalResponse): Promise<void>;
  getPendingRequests(): Promise<ApprovalRequest[]>;
  getRequest(requestId: string): Promise<ApprovalRequest | null>;
  cancelRequest(requestId: string): Promise<void>;
  cleanupExpired(): Promise<number>;
}

// ============================================================================
// Rate Limiting
// ============================================================================

export interface RateLimitConfig {
  capacity: number;
  refillRate: number;
  refillInterval: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

export interface IRateLimiter {
  check(key: string): RateLimitResult;
  consume(key: string, count?: number): RateLimitResult;
  reset(key: string): void;
  configure(key: string, config: RateLimitConfig): void;
  getConfig(key: string): RateLimitConfig | undefined;
}

// ============================================================================
// Memory Layer
// ============================================================================

export interface Memory {
  id: string;
  content: string;
  contentHash: string;
  tags: string[];
  embedding?: Buffer;
  source?: string;
  metadata?: Record<string, unknown>;
  accessCount: number;
  createdAt: number;
  updatedAt: number;
  lastAccessedAt: number;
}

export interface MemoryInput {
  content: string;
  tags?: string[];
  source?: string;
  metadata?: Record<string, unknown>;
}

export interface MemorySearchOptions {
  tags?: string[];
  minScore?: number;
  topK?: number;
  includeEmbeddings?: boolean;
}

export interface MemorySearchResult {
  memory: Memory;
  score: number;
}

export interface IMemoryService {
  store(input: MemoryInput): Promise<Memory>;
  retrieve(memoryId: string): Promise<Memory | null>;
  search(query: string, options?: MemorySearchOptions): Promise<MemorySearchResult[]>;
  searchByTags(tags: string[], options?: MemorySearchOptions): Promise<Memory[]>;
  update(memoryId: string, updates: Partial<MemoryInput>): Promise<Memory>;
  delete(memoryId: string): Promise<void>;
  getAll(options?: { limit?: number; offset?: number }): Promise<Memory[]>;
}

export interface IMemoryRepository {
  create(memory: Memory): Promise<Memory>;
  findById(id: string): Promise<Memory | null>;
  findByHash(contentHash: string): Promise<Memory | null>;
  findByTags(tags: string[]): Promise<Memory[]>;
  findAll(options?: { limit?: number; offset?: number }): Promise<Memory[]>;
  update(memory: Memory): Promise<Memory>;
  delete(id: string): Promise<void>;
  incrementAccessCount(id: string): Promise<Memory>;
}

// ============================================================================
// Audit Logging
// ============================================================================

export type AuditEventType =
  | 'server.start'
  | 'server.stop'
  | 'server.error'
  | 'tool.call'
  | 'tool.result'
  | 'tool.error'
  | 'token.create'
  | 'token.revoke'
  | 'token.validate'
  | 'policy.evaluate'
  | 'approval.request'
  | 'approval.respond';

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  clientId?: string;
  serverId?: string;
  toolName?: string;
  success: boolean;
  duration?: number;
  metadata?: Record<string, unknown>;
  timestamp: number;
}

export interface IAuditService {
  log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void>;
  query(options: {
    type?: AuditEventType;
    clientId?: string;
    serverId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]>;
  getStats(options?: { startTime?: number; endTime?: number }): Promise<{
    totalEvents: number;
    byType: Record<string, number>;
    successRate: number;
    avgDuration: number;
  }>;
}

export interface IAuditRepository {
  create(event: AuditEvent): Promise<AuditEvent>;
  findById(id: string): Promise<AuditEvent | null>;
  query(options: {
    type?: AuditEventType;
    clientId?: string;
    serverId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]>;
  count(options?: {
    type?: AuditEventType;
    startTime?: number;
    endTime?: number;
  }): Promise<number>;
  deleteOlderThan(timestamp: number): Promise<number>;
}

// ============================================================================
// Tool Catalog
// ============================================================================

export interface CatalogTool extends MCPTool {
  enabled: boolean;
  lastUsedAt?: number;
  usageCount: number;
  avgDuration?: number;
}

export interface IToolCatalog {
  getAllTools(): Promise<CatalogTool[]>;
  getToolsByServer(serverId: string): Promise<CatalogTool[]>;
  searchTools(query: string): Promise<CatalogTool[]>;
  enableTool(serverId: string, toolName: string): Promise<void>;
  disableTool(serverId: string, toolName: string): Promise<void>;
  isToolEnabled(serverId: string, toolName: string): Promise<boolean>;
  refreshCatalog(): Promise<void>;
}

// ============================================================================
// HTTP Server
// ============================================================================

export interface IHttpServer {
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  isRunning(): boolean;
  getPort(): number | undefined;
}

// ============================================================================
// MCP Transport & Aggregation
// ============================================================================

export interface McpRequest {
  method: string;
  params?: Record<string, unknown>;
}

export interface McpResponse {
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface IMcpAggregator {
  callTool(
    tokenId: string,
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpResponse>;
  listTools(tokenId: string): Promise<MCPTool[]>;
  listResources(tokenId: string, serverId: string): Promise<McpResource[]>;
  readResource(tokenId: string, serverId: string, uri: string): Promise<McpResourceContent>;
  listPrompts(tokenId: string, serverId: string): Promise<McpPrompt[]>;
  getPrompt(tokenId: string, serverId: string, promptName: string, args?: Record<string, string>): Promise<McpPromptMessage[]>;
  listAllPrompts(tokenId: string): Promise<McpPrompt[]>;
  listAllResources(tokenId: string): Promise<McpResource[]>;
}

// ============================================================================
// MCP Client & Transport Layer
// ============================================================================

/**
 * JSON-RPC 2.0 message types for MCP protocol communication.
 */
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: JsonRpcError;
}

export interface JsonRpcNotification {
  jsonrpc: '2.0';
  method: string;
  params?: unknown;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export type JsonRpcMessage = JsonRpcRequest | JsonRpcResponse | JsonRpcNotification;

/**
 * JSON-RPC handler for request/response correlation and timeout management.
 */
export interface IJsonRpcHandler {
  setSendFunction(sendFn: (message: JsonRpcMessage) => void): void;
  sendRequest<T = unknown>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  sendNotification(method: string, params?: unknown): void;
  handleMessage(message: JsonRpcMessage): void;
  onRequest(handler: (method: string, params: unknown) => Promise<unknown>): void;
  onNotification(handler: (method: string, params: unknown) => void): void;
  close(): void;
}

/**
 * Stdio transport for child process-based MCP servers.
 */
export interface StdioTransportOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
}

export interface IStdioTransport {
  spawn(command: string, args: string[], options?: StdioTransportOptions): Promise<void>;
  send(message: JsonRpcMessage): void;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: (code: number | null) => void): void;
  kill(): void;
  isRunning(): boolean;
  getPid(): number | undefined;
}

/**
 * HTTP/SSE transport for HTTP-based MCP servers.
 */
export interface HttpTransportOptions {
  headers?: Record<string, string>;
  timeout?: number;
}

export interface IHttpTransport {
  connect(url: string, options?: HttpTransportOptions): Promise<void>;
  send(message: JsonRpcRequest): Promise<JsonRpcResponse>;
  disconnect(): void;
  isConnected(): boolean;
}

export interface ISseTransport {
  connect(url: string, options?: HttpTransportOptions): Promise<void>;
  onMessage(handler: (message: JsonRpcMessage) => void): void;
  onError(handler: (error: Error) => void): void;
  disconnect(): void;
  isConnected(): boolean;
}

/**
 * MCP Resource types from the protocol specification.
 */
export interface McpResource {
  uri: string;
  name: string;
  description?: string;
  mimeType?: string;
}

export interface McpResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string; // Base64 encoded
}

/**
 * MCP Prompt types from the protocol specification.
 */
export interface McpPrompt {
  name: string;
  description?: string;
  arguments?: McpPromptArgument[];
}

export interface McpPromptArgument {
  name: string;
  description?: string;
  required?: boolean;
}

export interface McpPromptMessage {
  role: 'user' | 'assistant';
  content: McpPromptContent;
}

export interface McpPromptContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;
  mimeType?: string;
  resource?: McpResource;
}

/**
 * MCP Client interface for communicating with MCP servers.
 */
export interface IMcpClient {
  /** Connect to the MCP server */
  connect(): Promise<void>;
  /** Disconnect from the MCP server */
  disconnect(): Promise<void>;
  /** Check if connected */
  isConnected(): boolean;

  /** List available tools */
  listTools(): Promise<MCPTool[]>;
  /** Call a tool with arguments */
  callTool(name: string, args: Record<string, unknown>): Promise<unknown>;

  /** List available resources */
  listResources(): Promise<McpResource[]>;
  /** Read a resource by URI */
  readResource(uri: string): Promise<McpResourceContent>;

  /** List available prompts */
  listPrompts(): Promise<McpPrompt[]>;
  /** Get a prompt with arguments */
  getPrompt(name: string, args?: Record<string, string>): Promise<McpPromptMessage[]>;
}

/**
 * Factory interface for creating MCP clients per server.
 */
export interface IMcpClientFactory {
  createClient(server: MCPServer): IMcpClient;
  getClient(serverId: string): IMcpClient | undefined;
  removeClient(serverId: string): void;
  getAllClients(): Map<string, IMcpClient>;
}

// ============================================================================
// Secure Credential Storage
// ============================================================================

/**
 * Keychain service for secure credential storage using OS-level security.
 * Uses keytar to store sensitive data in:
 * - macOS: Keychain
 * - Windows: Credential Manager
 * - Linux: Secret Service API (libsecret)
 */
export interface IKeychainService {
  /** Store a secret in the keychain */
  setSecret(key: string, value: string): Promise<void>;
  /** Retrieve a secret from the keychain */
  getSecret(key: string): Promise<string | null>;
  /** Delete a secret from the keychain */
  deleteSecret(key: string): Promise<boolean>;
  /** Check if keychain is available on this platform */
  isAvailable(): Promise<boolean>;
}

/**
 * Restart policy configuration for process health monitoring.
 */
export interface RestartPolicy {
  /** Maximum number of restarts within the restart window */
  maxRestarts: number;
  /** Time window in milliseconds for counting restarts */
  restartWindow: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
  /** Maximum backoff delay in milliseconds */
  maxBackoff: number;
  /** Initial backoff delay in milliseconds */
  initialBackoff: number;
}

/**
 * Process health status.
 */
export type ProcessHealth =
  | 'healthy'
  | 'unhealthy'
  | 'crashed'
  | 'restarting'
  | 'failed'
  | 'unknown';

/**
 * Process health monitor for MCP server processes.
 * Implements automatic restart with exponential backoff and circuit breaker.
 */
export interface IProcessHealthMonitor {
  /** Register a process for health monitoring with restart callback */
  register(serverId: string, pid: number, onRestart: () => Promise<number>): void;
  /** Unregister a process from health monitoring */
  unregister(serverId: string): void;
  /** Report a process crash or unexpected exit */
  reportCrash(serverId: string, exitCode: number | null): Promise<void>;
  /** Report a successful heartbeat from a process */
  reportHeartbeat(serverId: string): void;
  /** Get the health status of a process */
  getHealth(serverId: string): ProcessHealth;
  /** Get health statistics for all monitored processes */
  getStats(): Map<string, { health: ProcessHealth; restartCount: number; pid: number }>;
  /** Set the restart policy for all processes */
  setRestartPolicy(policy: Partial<RestartPolicy>): void;
  /** Reset the restart counter for a process */
  resetRestartCount(serverId: string): void;
  /** Subscribe to health change events */
  onHealthChange(callback: (serverId: string, health: ProcessHealth) => void): () => void;
  /** Clean up resources */
  dispose(): void;
}

// ============================================================================
// Workflow Engine
// ============================================================================

/**
 * Workflow status for tracking execution state.
 */
export type WorkflowStatus =
  | 'draft'
  | 'active'
  | 'running'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

/**
 * Workflow step types for different actions.
 */
export type WorkflowStepType =
  | 'tool_call'
  | 'condition'
  | 'loop'
  | 'parallel'
  | 'wait'
  | 'transform'
  | 'webhook';

/**
 * Individual step in a workflow.
 */
export interface WorkflowStep {
  id: string;
  name: string;
  type: WorkflowStepType;
  /** Server ID for tool_call steps */
  serverId?: string;
  /** Tool name for tool_call steps */
  toolName?: string;
  /** Arguments/config for the step */
  config: Record<string, unknown>;
  /** Step IDs that must complete before this step */
  dependsOn?: string[];
  /** Condition expression for conditional execution */
  condition?: string;
  /** Timeout in milliseconds */
  timeout?: number;
  /** Number of retry attempts on failure */
  retries?: number;
  /** Whether to continue workflow on step failure */
  continueOnError?: boolean;
}

/**
 * Trigger configuration for automatic workflow execution.
 */
export interface WorkflowTrigger {
  type: 'manual' | 'schedule' | 'webhook' | 'event';
  /** Cron expression for schedule triggers */
  schedule?: string;
  /** Event pattern for event triggers */
  eventPattern?: string;
  /** Webhook path for webhook triggers */
  webhookPath?: string;
  /** Whether trigger is enabled */
  enabled: boolean;
}

/**
 * Workflow definition entity.
 */
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  /** Project this workflow belongs to */
  projectId?: string;
  /** Ordered list of steps */
  steps: WorkflowStep[];
  /** Trigger configuration */
  trigger?: WorkflowTrigger;
  /** Default input schema */
  inputSchema?: Record<string, unknown>;
  /** Workflow status */
  status: WorkflowStatus;
  /** Version for optimistic locking */
  version: number;
  createdAt: number;
  updatedAt: number;
  lastRunAt?: number;
}

/**
 * Status of an individual step execution.
 */
export type StepExecutionStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'cancelled';

/**
 * Execution record for a single step.
 */
export interface StepExecution {
  stepId: string;
  stepName: string;
  status: StepExecutionStatus;
  startedAt?: number;
  completedAt?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
  retryCount: number;
}

/**
 * Workflow execution run instance.
 */
export interface WorkflowExecution {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  status: WorkflowStatus;
  /** Input provided to the workflow */
  input?: Record<string, unknown>;
  /** Final output from the workflow */
  output?: unknown;
  /** Error message if failed */
  error?: string;
  /** Execution record for each step */
  steps: StepExecution[];
  /** ID of currently executing step */
  currentStepId?: string;
  startedAt: number;
  completedAt?: number;
  /** User/client who triggered the execution */
  triggeredBy?: string;
}

export interface WorkflowCreateInput {
  name: string;
  description?: string;
  projectId?: string;
  steps: Omit<WorkflowStep, 'id'>[];
  trigger?: WorkflowTrigger;
  inputSchema?: Record<string, unknown>;
}

export interface IWorkflowService {
  /** Create a new workflow */
  createWorkflow(input: WorkflowCreateInput): Promise<Workflow>;
  /** Get a workflow by ID */
  getWorkflow(workflowId: string): Promise<Workflow | null>;
  /** Get all workflows */
  getAllWorkflows(): Promise<Workflow[]>;
  /** Get workflows by project */
  getWorkflowsByProject(projectId: string): Promise<Workflow[]>;
  /** Update a workflow */
  updateWorkflow(workflowId: string, updates: Partial<Workflow>): Promise<Workflow>;
  /** Delete a workflow */
  deleteWorkflow(workflowId: string): Promise<void>;
  /** Activate a workflow (enable triggers) */
  activateWorkflow(workflowId: string): Promise<void>;
  /** Deactivate a workflow (disable triggers) */
  deactivateWorkflow(workflowId: string): Promise<void>;
  /** Execute a workflow manually */
  executeWorkflow(workflowId: string, input?: Record<string, unknown>, triggeredBy?: string): Promise<WorkflowExecution>;
  /** Get execution by ID */
  getExecution(executionId: string): Promise<WorkflowExecution | null>;
  /** Get all executions for a workflow */
  getExecutions(workflowId: string, options?: { limit?: number; offset?: number }): Promise<WorkflowExecution[]>;
  /** Cancel a running execution */
  cancelExecution(executionId: string): Promise<void>;
  /** Pause a running execution */
  pauseExecution(executionId: string): Promise<void>;
  /** Resume a paused execution */
  resumeExecution(executionId: string): Promise<void>;
}

export interface IWorkflowRepository {
  create(workflow: Workflow): Promise<Workflow>;
  findById(id: string): Promise<Workflow | null>;
  findAll(): Promise<Workflow[]>;
  findByProjectId(projectId: string): Promise<Workflow[]>;
  findByStatus(status: WorkflowStatus): Promise<Workflow[]>;
  update(workflow: Workflow): Promise<Workflow>;
  delete(id: string): Promise<void>;
}

export interface IWorkflowExecutionRepository {
  create(execution: WorkflowExecution): Promise<WorkflowExecution>;
  findById(id: string): Promise<WorkflowExecution | null>;
  findByWorkflowId(workflowId: string, options?: { limit?: number; offset?: number }): Promise<WorkflowExecution[]>;
  findByStatus(status: WorkflowStatus): Promise<WorkflowExecution[]>;
  update(execution: WorkflowExecution): Promise<WorkflowExecution>;
  delete(id: string): Promise<void>;
}

/**
 * Workflow executor for running workflow steps.
 */
export interface IWorkflowExecutor {
  /** Execute a single step */
  executeStep(
    step: WorkflowStep,
    context: WorkflowExecutionContext
  ): Promise<StepExecution>;
  /** Evaluate a condition expression */
  evaluateCondition(condition: string, context: WorkflowExecutionContext): boolean;
  /** Transform data using a transform step config */
  transformData(config: Record<string, unknown>, input: unknown): unknown;
}

/**
 * Context available during workflow execution.
 */
export interface WorkflowExecutionContext {
  /** Current execution ID */
  executionId: string;
  /** Workflow being executed */
  workflow: Workflow;
  /** Input provided to the workflow */
  input: Record<string, unknown>;
  /** Outputs from completed steps (stepId -> output) */
  stepOutputs: Map<string, unknown>;
  /** Variables that can be modified during execution */
  variables: Map<string, unknown>;
  /** Signal for cancellation */
  abortSignal?: AbortSignal;
}

// ============================================================================
// Hook System
// ============================================================================

/**
 * Hook event types that can trigger custom hooks.
 */
export type HookEvent =
  | 'server:before-start'
  | 'server:after-start'
  | 'server:before-stop'
  | 'server:after-stop'
  | 'tool:before-call'
  | 'tool:after-call'
  | 'approval:created'
  | 'approval:resolved'
  | 'workflow:before-execute'
  | 'workflow:after-execute'
  | 'workflow:step-complete';

/**
 * Hook definition entity.
 */
export interface Hook {
  id: string;
  name: string;
  description?: string;
  /** Event that triggers this hook */
  event: HookEvent;
  /** Project scope (optional, null = global) */
  projectId?: string;
  /** Server scope for server/tool events (optional) */
  serverId?: string;
  /** JavaScript code to execute */
  code: string;
  /** Priority (lower = runs first) */
  priority: number;
  /** Whether the hook is enabled */
  enabled: boolean;
  /** Timeout in milliseconds for execution */
  timeout: number;
  /** Whether hook can modify the event payload */
  canModify: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface HookCreateInput {
  name: string;
  description?: string;
  event: HookEvent;
  projectId?: string;
  serverId?: string;
  code: string;
  priority?: number;
  timeout?: number;
  canModify?: boolean;
}

/**
 * Context passed to hook execution.
 */
export interface HookContext {
  /** The triggering event */
  event: HookEvent;
  /** Event-specific payload data */
  payload: Record<string, unknown>;
  /** Metadata about the execution */
  meta: {
    hookId: string;
    hookName: string;
    timestamp: number;
    projectId?: string;
    serverId?: string;
  };
}

/**
 * Result from hook execution.
 */
export interface HookResult {
  success: boolean;
  /** Modified payload (if canModify=true and hook modifies it) */
  modifiedPayload?: Record<string, unknown>;
  /** Error message if failed */
  error?: string;
  /** Execution duration in milliseconds */
  duration: number;
  /** Console logs from hook execution */
  logs: string[];
}

export interface IHookService {
  /** Create a new hook */
  createHook(input: HookCreateInput): Promise<Hook>;
  /** Get a hook by ID */
  getHook(hookId: string): Promise<Hook | null>;
  /** Get all hooks */
  getAllHooks(): Promise<Hook[]>;
  /** Get hooks for a specific event */
  getHooksForEvent(event: HookEvent, projectId?: string, serverId?: string): Promise<Hook[]>;
  /** Update a hook */
  updateHook(hookId: string, updates: Partial<Hook>): Promise<Hook>;
  /** Delete a hook */
  deleteHook(hookId: string): Promise<void>;
  /** Enable a hook */
  enableHook(hookId: string): Promise<void>;
  /** Disable a hook */
  disableHook(hookId: string): Promise<void>;
  /** Execute all hooks for an event */
  executeHooks(
    event: HookEvent,
    payload: Record<string, unknown>,
    options?: { projectId?: string; serverId?: string }
  ): Promise<HookResult[]>;
  /** Test a hook with sample data */
  testHook(hookId: string, payload: Record<string, unknown>): Promise<HookResult>;
  /** Validate hook code syntax */
  validateCode(code: string): { valid: boolean; error?: string };
}

export interface IHookRepository {
  create(hook: Hook): Promise<Hook>;
  findById(id: string): Promise<Hook | null>;
  findAll(): Promise<Hook[]>;
  findByEvent(event: HookEvent, projectId?: string, serverId?: string): Promise<Hook[]>;
  findEnabled(event: HookEvent, projectId?: string, serverId?: string): Promise<Hook[]>;
  update(hook: Hook): Promise<Hook>;
  delete(id: string): Promise<void>;
}

/**
 * Secure JavaScript sandbox for hook execution.
 */
export interface IHookSandbox {
  /** Execute code in sandbox with context */
  execute(
    code: string,
    context: HookContext,
    options: { timeout: number; canModify: boolean }
  ): Promise<HookResult>;
  /** Validate code syntax without execution */
  validate(code: string): { valid: boolean; error?: string };
}

// ============================================================================
// Skills System
// ============================================================================

/**
 * Skill status indicating the health/availability of a skill.
 */
export type SkillStatus = 'available' | 'unavailable' | 'error' | 'loading';

/**
 * Skill source type for tracking where skills come from.
 */
export type SkillSource = 'local' | 'symlink' | 'remote' | 'builtin';

/**
 * A skill represents a discovered MCP server that can be connected.
 */
export interface Skill {
  id: string;
  name: string;
  description?: string;
  /** Path to the skill (for local/symlink sources) */
  path?: string;
  /** Remote URL (for remote sources) */
  url?: string;
  /** Source type */
  source: SkillSource;
  /** Server configuration derived from skill */
  serverConfig?: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    transport: ServerTransport;
  };
  /** Metadata from skill manifest */
  manifest?: SkillManifest;
  /** Current status */
  status: SkillStatus;
  /** Associated project ID */
  projectId?: string;
  /** Tags for categorization */
  tags: string[];
  /** Whether skill is enabled */
  enabled: boolean;
  /** Error message if status is 'error' */
  error?: string;
  createdAt: number;
  updatedAt: number;
  lastCheckedAt?: number;
}

/**
 * Skill manifest schema (mcp-skill.json).
 */
export interface SkillManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  main?: string;
  /** Command to run the skill */
  command?: string;
  /** Arguments for the command */
  args?: string[];
  /** Environment variables */
  env?: Record<string, string>;
  /** Transport type */
  transport?: ServerTransport;
  /** Required dependencies */
  dependencies?: Record<string, string>;
  /** Skill capabilities/tags */
  capabilities?: string[];
}

export interface SkillCreateInput {
  name: string;
  description?: string;
  path?: string;
  url?: string;
  source: SkillSource;
  projectId?: string;
  tags?: string[];
}

export interface ISkillsService {
  /** Discover skills from a directory (including symlinks) */
  discoverSkills(directory: string): Promise<Skill[]>;
  /** Register a skill from a path */
  registerSkill(input: SkillCreateInput): Promise<Skill>;
  /** Get a skill by ID */
  getSkill(skillId: string): Promise<Skill | null>;
  /** Get all skills */
  getAllSkills(): Promise<Skill[]>;
  /** Get skills for a project */
  getSkillsByProject(projectId: string): Promise<Skill[]>;
  /** Update a skill */
  updateSkill(skillId: string, updates: Partial<Skill>): Promise<Skill>;
  /** Delete a skill */
  deleteSkill(skillId: string): Promise<void>;
  /** Enable a skill */
  enableSkill(skillId: string): Promise<void>;
  /** Disable a skill */
  disableSkill(skillId: string): Promise<void>;
  /** Create a symlink to a skill directory */
  createSymlink(sourcePath: string, targetDir: string, name: string): Promise<string>;
  /** Remove a skill symlink */
  removeSymlink(symlinkPath: string): Promise<void>;
  /** Refresh skill status and manifest */
  refreshSkill(skillId: string): Promise<Skill>;
  /** Convert a skill to a server configuration */
  toServerConfig(skillId: string): Promise<Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt' | 'status'>>;
  /** Parse a skill manifest file */
  parseManifest(manifestPath: string): Promise<SkillManifest | null>;
}

export interface ISkillRepository {
  create(skill: Skill): Promise<Skill>;
  findById(id: string): Promise<Skill | null>;
  findByPath(path: string): Promise<Skill | null>;
  findAll(): Promise<Skill[]>;
  findByProjectId(projectId: string): Promise<Skill[]>;
  findBySource(source: SkillSource): Promise<Skill[]>;
  findEnabled(): Promise<Skill[]>;
  update(skill: Skill): Promise<Skill>;
  delete(id: string): Promise<void>;
}

// ============================================================================
// Security Interfaces
// ============================================================================

/** Deep link action types */
export type DeepLinkAction =
  | 'connect-server'
  | 'approve-request'
  | 'open-workspace'
  | 'import-config'
  | 'oauth-callback';

/** Parsed deep link data */
export interface ParsedDeepLink {
  action: DeepLinkAction;
  params: Record<string, string>;
  raw: string;
}

/** Deep link handler callback */
export type DeepLinkCallback = (link: ParsedDeepLink) => void | Promise<void>;

/**
 * Deep link handler for secure URL validation and processing.
 */
export interface IDeepLinkHandler {
  /** Register the app as default protocol handler */
  register(): void;
  /** Unregister the protocol handler */
  unregister(): void;
  /** Handle an incoming deep link URL */
  handleUrl(url: string): Promise<void>;
  /** Register a callback for a specific action */
  onAction(action: DeepLinkAction, callback: DeepLinkCallback): void;
  /** Remove a callback for a specific action */
  offAction(action: DeepLinkAction): void;
}

/**
 * System tray service for menu bar integration.
 */
export interface ITrayService {
  /** Initialize the system tray icon and menu */
  initialize(): Promise<void>;
  /** Dispose of tray resources */
  dispose(): Promise<void>;
  /** Update the tray status indicator */
  setStatus(status: 'idle' | 'active' | 'error' | 'warning'): void;
  /** Show a notification from the tray */
  showNotification(title: string, body: string): void;
  /** Update the context menu with current state */
  updateContextMenu(): Promise<void>;
}
