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
  listResources(tokenId: string, serverId: string): Promise<unknown[]>;
  readResource(tokenId: string, serverId: string, uri: string): Promise<unknown>;
}
