/**
 * Type definitions for the Electron API exposed to the renderer process.
 */

export interface ElectronAPI {
  // App information
  app: {
    getVersion: () => Promise<string>;
    getPlatform: () => Promise<NodeJS.Platform>;
    openFileDialog: (options?: OpenDialogOptions) => Promise<string[]>;
    saveFileDialog: (options?: SaveDialogOptions) => Promise<string | null>;
    readFile: (filePath: string) => Promise<string>;
    selectDirectory: (options?: { title?: string; defaultPath?: string }) => Promise<string | null>;
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

  // Project management
  projects: {
    list: () => Promise<ProjectInfo[]>;
    get: (id: string) => Promise<ProjectInfo | null>;
    getBySlug: (slug: string) => Promise<ProjectInfo | null>;
    create: (config: ProjectCreateConfig) => Promise<ProjectInfo>;
    update: (id: string, updates: Partial<ProjectCreateConfig>) => Promise<ProjectInfo>;
    delete: (id: string) => Promise<void>;
    addServer: (projectId: string, serverId: string) => Promise<void>;
    removeServer: (projectId: string, serverId: string) => Promise<void>;
    addWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
    removeWorkspace: (projectId: string, workspaceId: string) => Promise<void>;
    // Tool overrides
    listToolOverrides: (projectId: string) => Promise<ProjectToolOverrideInfo[]>;
    getToolOverride: (projectId: string, toolName: string) => Promise<ProjectToolOverrideInfo | null>;
    setToolOverride: (projectId: string, input: ToolOverrideSetConfig) => Promise<ProjectToolOverrideInfo>;
    removeToolOverride: (projectId: string, toolName: string) => Promise<void>;
    removeAllToolOverrides: (projectId: string) => Promise<void>;
  };

  // Memory management
  memory: {
    store: (input: MemoryInput) => Promise<MemoryInfo>;
    get: (id: string) => Promise<MemoryInfo | null>;
    search: (query: string, options?: MemorySearchOptions) => Promise<MemorySearchResultInfo[]>;
    searchSemantic: (query: string, options?: MemorySearchOptions) => Promise<MemorySearchResultInfo[]>;
    searchHybrid: (query: string, options?: MemorySearchOptions) => Promise<MemorySearchResultInfo[]>;
    searchByTags: (tags: string[], options?: MemorySearchOptions) => Promise<MemoryInfo[]>;
    searchByType: (type: MemoryType, options?: { limit?: number; offset?: number }) => Promise<MemoryInfo[]>;
    list: (options?: { limit?: number; offset?: number }) => Promise<MemoryInfo[]>;
    update: (id: string, updates: Partial<MemoryInput>) => Promise<MemoryInfo>;
    delete: (id: string) => Promise<void>;
    getStatistics: () => Promise<MemoryStatistics>;
    addTags: (id: string, tags: string[]) => Promise<MemoryInfo>;
    removeTags: (id: string, tags: string[]) => Promise<MemoryInfo>;
    bulkAddTags: (ids: string[], tags: string[]) => Promise<number>;
    bulkRemoveTags: (ids: string[], tags: string[]) => Promise<number>;
    export: (format: 'json' | 'markdown', filter?: MemoryExportFilter) => Promise<string>;
    import: (data: string, format: 'json' | 'markdown') => Promise<MemoryImportResult>;
    regenerateEmbeddings: () => Promise<number>;
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

  // Skills management
  skills: {
    list: (projectId?: string) => Promise<SkillInfo[]>;
    get: (id: string) => Promise<SkillInfo | null>;
    register: (config: SkillCreateConfig) => Promise<SkillInfo>;
    update: (id: string, updates: Partial<SkillInfo>) => Promise<SkillInfo>;
    delete: (id: string) => Promise<void>;
    enable: (id: string) => Promise<void>;
    disable: (id: string) => Promise<void>;
    refresh: (id: string) => Promise<SkillInfo>;
    discover: (directory: string) => Promise<SkillInfo[]>;
    createSymlink: (sourcePath: string, targetDir: string, name: string) => Promise<string>;
    removeSymlink: (symlinkPath: string) => Promise<void>;
    toServerConfig: (id: string) => Promise<unknown>;
  };

  // Auto-updater
  updater: {
    check: () => Promise<UpdateCheckResultInfo>;
    download: () => Promise<{ success: boolean; files: string[] }>;
    install: () => Promise<{ success: boolean }>;
    getState: () => Promise<UpdateStateInfo>;
    getConfig: () => Promise<UpdateConfigInfo>;
    setConfig: (config: Partial<UpdateConfigInfo>) => Promise<UpdateConfigInfo>;
  };

  // Client sync (AI Hub feature parity)
  sync: {
    listClients: () => Promise<ClientAppInfo[]>;
    getClientServers: (clientId: string) => Promise<Record<string, ClientMCPServerConfigInfo>>;
    isClientInstalled: (clientId: string) => Promise<boolean>;
    getConfigPath: (clientId: string) => Promise<string>;
    importFromClient: (clientId: string) => Promise<SyncResultInfo>;
    exportToClient: (clientId: string, serverIds?: string[]) => Promise<SyncResultInfo>;
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
  action: 'allow' | 'deny' | 'require_approval' | 'redact';
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
  action: 'allow' | 'deny' | 'require_approval' | 'redact';
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

// Project types
export interface ProjectInfo {
  id: string;
  name: string;
  slug: string;
  description?: string;
  serverIds: string[];
  workspaceIds: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ProjectCreateConfig {
  name: string;
  slug?: string;
  description?: string;
}

export interface ProjectToolOverrideInfo {
  id: string;
  projectId: string;
  toolName: string;
  visible: boolean;
  displayName?: string;
  defaultArgs?: Record<string, unknown>;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export interface ToolOverrideSetConfig {
  toolName: string;
  visible?: boolean;
  displayName?: string;
  defaultArgs?: Record<string, unknown>;
  priority?: number;
}

// Memory types
export type MemoryType = 'note' | 'conversation' | 'code' | 'document' | 'task' | 'reference';

export interface MemoryInfo {
  id: string;
  content: string;
  tags: string[];
  type: MemoryType;
  importance: number;
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
  type?: MemoryType;
  importance?: number;
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

export interface MemoryStatistics {
  totalCount: number;
  byType: Record<MemoryType, number>;
  byTag: Record<string, number>;
  avgImportance: number;
  avgAccessCount: number;
  totalAccessCount: number;
  recentlyAccessed: number;
  oldestMemory?: number;
  newestMemory?: number;
}

export interface MemoryExportFilter {
  tags?: string[];
  type?: MemoryType;
  minImportance?: number;
  startDate?: number;
  endDate?: number;
}

export interface MemoryImportResult {
  imported: number;
  skipped: number;
  errors: string[];
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

// Skill types
export type SkillSource = 'local' | 'symlink' | 'remote' | 'builtin';
export type SkillStatus = 'available' | 'loading' | 'error' | 'disabled';

export interface SkillManifest {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  main?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  transport?: 'stdio' | 'sse' | 'http';
  dependencies?: Record<string, string>;
  capabilities?: string[];
}

export interface SkillInfo {
  id: string;
  name: string;
  description?: string;
  path?: string;
  url?: string;
  source: SkillSource;
  serverConfig?: {
    command: string;
    args: string[];
    env?: Record<string, string>;
    transport: 'stdio' | 'sse' | 'http';
  };
  manifest?: SkillManifest;
  status: SkillStatus;
  projectId?: string;
  tags: string[];
  enabled: boolean;
  error?: string;
  createdAt: number;
  updatedAt: number;
  lastCheckedAt?: number;
}

export interface SkillCreateConfig {
  name: string;
  description?: string;
  path?: string;
  url?: string;
  source: SkillSource;
  projectId?: string;
  tags?: string[];
}

// Auto-updater types
export type UpdateStatusInfo = 
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

export interface UpdateStateInfo {
  status: UpdateStatusInfo;
  info?: {
    version?: string;
    releaseDate?: string;
    releaseNotes?: string;
  };
  progress?: {
    percent: number;
    bytesPerSecond: number;
    transferred: number;
    total: number;
  };
  error?: string;
}

export interface UpdateConfigInfo {
  autoCheck: boolean;
  checkInterval: number;
  autoDownload: boolean;
  autoInstallOnAppQuit: boolean;
  allowPrerelease: boolean;
}

export interface UpdateCheckResultInfo {
  updateAvailable: boolean;
  version?: string;
  releaseDate?: string;
  releaseNotes?: string | string[] | null;
}

// File dialog types
export interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>;
}

export interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

// Client sync types (AI Hub feature parity)
export type ClientAppIdType = 'claude' | 'cursor' | 'windsurf' | 'vscode' | 'cline';

export interface ClientAppInfo {
  id: ClientAppIdType;
  name: string;
  installed: boolean;
  configPath: string;
  serverCount: number;
}

export interface ClientMCPServerConfigInfo {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  type?: 'stdio' | 'http' | 'sse' | 'streamable-http';
  url?: string;
}

export interface SyncResultInfo {
  clientId: ClientAppIdType;
  imported: number;
  exported: number;
  errors: string[];
}
