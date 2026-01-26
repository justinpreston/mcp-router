/**
 * InversifyJS dependency injection symbols.
 * All injectable services are identified by these symbols.
 */
export const TYPES = {
  // Core Infrastructure
  Config: Symbol.for('Config'),
  Database: Symbol.for('Database'),
  Logger: Symbol.for('Logger'),

  // Services
  TokenService: Symbol.for('TokenService'),
  ServerManager: Symbol.for('ServerManager'),
  WorkspaceService: Symbol.for('WorkspaceService'),
  PolicyEngine: Symbol.for('PolicyEngine'),
  ApprovalQueue: Symbol.for('ApprovalQueue'),
  RateLimiter: Symbol.for('RateLimiter'),
  MemoryService: Symbol.for('MemoryService'),
  AuditService: Symbol.for('AuditService'),
  ToolCatalog: Symbol.for('ToolCatalog'),

  // Repositories
  ServerRepository: Symbol.for('ServerRepository'),
  TokenRepository: Symbol.for('TokenRepository'),
  PolicyRepository: Symbol.for('PolicyRepository'),
  MemoryRepository: Symbol.for('MemoryRepository'),
  AuditRepository: Symbol.for('AuditRepository'),
  WorkspaceRepository: Symbol.for('WorkspaceRepository'),

  // HTTP Layer
  HttpServer: Symbol.for('HttpServer'),
  TokenValidator: Symbol.for('TokenValidator'),

  // MCP Transport & Client
  McpAggregator: Symbol.for('McpAggregator'),
  McpClientFactory: Symbol.for('McpClientFactory'),
  JsonRpcHandler: Symbol.for('JsonRpcHandler'),
  StdioTransport: Symbol.for('StdioTransport'),
  SseTransport: Symbol.for('SseTransport'),
  HttpTransport: Symbol.for('HttpTransport'),
  ProcessHealthMonitor: Symbol.for('ProcessHealthMonitor'),

  // Security
  KeychainService: Symbol.for('KeychainService'),
  DeepLinkHandler: Symbol.for('DeepLinkHandler'),
} as const;

export type TypeKeys = keyof typeof TYPES;
