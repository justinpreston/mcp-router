/**
 * Core module exports.
 * This is the main entry point for dependency injection setup.
 */

export { TYPES, type TypeKeys } from './types';

export type {
  // Core Infrastructure
  IConfig,
  IDatabase,
  ILogger,
  LogLevel,

  // Token & Authentication
  Token,
  TokenValidationResult,
  TokenGenerateOptions,
  ITokenService,
  ITokenValidator,
  ITokenRepository,

  // MCP Server Management
  MCPServer,
  MCPTool,
  ServerStatus,
  ServerTransport,
  IServerManager,
  IServerRepository,

  // Workspace Management
  Workspace,
  IWorkspaceService,
  IWorkspaceRepository,

  // Policy Engine
  PolicyRule,
  PolicyCondition,
  PolicyContext,
  PolicyDecision,
  PolicyScope,
  PolicyResourceType,
  PolicyAction,
  IPolicyEngine,
  IPolicyRepository,

  // Approval Queue
  ApprovalRequest,
  ApprovalResponse,
  ApprovalResult,
  ApprovalStatus,
  IApprovalQueue,

  // Rate Limiting
  RateLimitConfig,
  RateLimitResult,
  IRateLimiter,

  // Memory Layer
  Memory,
  MemoryInput,
  MemorySearchOptions,
  MemorySearchResult,
  IMemoryService,
  IMemoryRepository,

  // Audit Logging
  AuditEvent,
  AuditEventType,
  IAuditService,
  IAuditRepository,

  // Tool Catalog
  CatalogTool,
  IToolCatalog,

  // HTTP Server
  IHttpServer,

  // MCP Transport & Aggregation
  McpRequest,
  McpResponse,
  IMcpAggregator,

  // Built-in Tools
  IBuiltinToolsService,
  BuiltinToolResult,
  BUILTIN_SERVER_ID,
} from './interfaces';

export {
  createContainer,
  initializeContainer,
  getContainer,
  disposeContainer,
  getService,
} from './container';
