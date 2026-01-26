/**
 * Type definitions for the Electron API exposed to the renderer process.
 */

export interface ElectronAPI {
  // App information
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<NodeJS.Platform>;
  };

  // Window controls
  window: {
    minimize: () => Promise<void>;
    maximize: () => Promise<void>;
    close: () => Promise<void>;
  };

  // Server management
  servers: {
    list: () => Promise<MCPServerInfo[]>;
    get: (id: string) => Promise<MCPServerInfo | null>;
    add: (config: ServerAddConfig) => Promise<MCPServerInfo>;
    update: (id: string, updates: Partial<ServerAddConfig>) => Promise<MCPServerInfo>;
    remove: (id: string) => Promise<void>;
    start: (id: string) => Promise<void>;
    stop: (id: string) => Promise<void>;
    restart: (id: string) => Promise<void>;
  };

  // Token management
  tokens: {
    list: (clientId?: string) => Promise<TokenInfo[]>;
    create: (options: TokenCreateOptions) => Promise<TokenInfo>;
    revoke: (tokenId: string) => Promise<void>;
    updateAccess: (tokenId: string, serverAccess: Record<string, boolean>) => Promise<TokenInfo>;
  };

  // Policy management
  policies: {
    list: (scope?: string, scopeId?: string) => Promise<PolicyInfo[]>;
    get: (id: string) => Promise<PolicyInfo | null>;
    add: (rule: PolicyAddConfig) => Promise<PolicyInfo>;
    update: (id: string, updates: Partial<PolicyAddConfig>) => Promise<PolicyInfo>;
    remove: (id: string) => Promise<void>;
  };

  // Approval queue
  approvals: {
    list: () => Promise<ApprovalInfo[]>;
    approve: (id: string, note?: string) => Promise<void>;
    reject: (id: string, reason?: string) => Promise<void>;
  };

  // Workspace management
  workspaces: {
    list: () => Promise<WorkspaceInfo[]>;
    get: (id: string) => Promise<WorkspaceInfo | null>;
    create: (config: WorkspaceAddConfig) => Promise<WorkspaceInfo>;
    update: (id: string, updates: Partial<WorkspaceAddConfig>) => Promise<WorkspaceInfo>;
    delete: (id: string) => Promise<void>;
    addServer: (workspaceId: string, serverId: string) => Promise<void>;
    removeServer: (workspaceId: string, serverId: string) => Promise<void>;
  };

  // Memory management
  memory: {
    store: (input: MemoryInput) => Promise<MemoryInfo>;
    get: (id: string) => Promise<MemoryInfo | null>;
    search: (query: string, options?: MemorySearchOptions) => Promise<MemorySearchResultInfo[]>;
    searchByTags: (tags: string[], options?: MemorySearchOptions) => Promise<MemoryInfo[]>;
    list: (options?: { limit?: number; offset?: number }) => Promise<MemoryInfo[]>;
    update: (id: string, updates: Partial<MemoryInput>) => Promise<MemoryInfo>;
    delete: (id: string) => Promise<void>;
  };

  // Tool catalog
  catalog: {
    listTools: () => Promise<CatalogToolInfo[]>;
    getToolsByServer: (serverId: string) => Promise<CatalogToolInfo[]>;
    searchTools: (query: string) => Promise<CatalogToolInfo[]>;
    enableTool: (serverId: string, toolName: string) => Promise<void>;
    disableTool: (serverId: string, toolName: string) => Promise<void>;
    isToolEnabled: (serverId: string, toolName: string) => Promise<boolean>;
    refresh: () => Promise<void>;
  };

  // Event listeners
  on: (channel: string, callback: (...args: unknown[]) => void) => () => void;
  once: (channel: string, callback: (...args: unknown[]) => void) => void;
}

// Server types
export interface MCPServerInfo {
  id: string;
  name: string;
  description?: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
  transport: 'stdio' | 'sse' | 'http';
  url?: string;
  status: 'stopped' | 'starting' | 'running' | 'error' | 'stopping';
  projectId?: string;
  toolPermissions: Record<string, boolean>;
  lastError?: string;
  tools?: MCPToolInfo[];
  resources?: MCPResourceInfo[];
  createdAt: number;
  updatedAt: number;
}

export interface MCPToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

export interface MCPResourceInfo {
  name: string;
  uri: string;
  description?: string;
}

export interface ServerAddConfig {
  name: string;
  description?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'sse' | 'http';
  url?: string;
  projectId?: string;
  toolPermissions?: Record<string, boolean>;
}

// Token types
export interface TokenInfo {
  id: string;
  clientId: string;
  name: string;
  issuedAt: number;
  expiresAt: number;
  lastUsedAt?: number;
  scopes: string[];
  serverAccess: Record<string, boolean>;
}

export interface TokenCreateOptions {
  clientId: string;
  name: string;
  ttl?: number;
  scopes?: string[];
  serverAccess?: Record<string, boolean>;
}

// Policy types
export interface PolicyInfo {
  id: string;
  name: string;
  description?: string;
  scope: 'global' | 'workspace' | 'server' | 'client';
  scopeId?: string;
  resourceType: 'tool' | 'server' | 'resource';
  pattern: string;
  action: 'allow' | 'deny' | 'require_approval';
  priority: number;
  enabled: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface PolicyAddConfig {
  name: string;
  description?: string;
  scope: 'global' | 'workspace' | 'server' | 'client';
  scopeId?: string;
  resourceType: 'tool' | 'server' | 'resource';
  pattern: string;
  action: 'allow' | 'deny' | 'require_approval';
  priority?: number;
  enabled?: boolean;
}

// Approval types
export interface ApprovalInfo {
  id: string;
  clientId: string;
  serverId: string;
  toolName: string;
  toolArguments: Record<string, unknown>;
  policyRuleId: string;
  status: 'pending' | 'approved' | 'rejected' | 'expired';
  requestedAt: number;
  respondedAt?: number;
  respondedBy?: string;
  responseNote?: string;
  expiresAt: number;
}

// Workspace types
export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  serverIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceAddConfig {
  name: string;
  path: string;
}

// Memory types
export interface MemoryInfo {
  id: string;
  content: string;
  tags: string[];
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
}

export interface MemorySearchResultInfo {
  memory: MemoryInfo;
  score: number;
}

// Tool catalog types
export interface CatalogToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  serverName: string;
  enabled: boolean;
  lastUsedAt?: number;
  usageCount: number;
  avgDuration?: number;
}
