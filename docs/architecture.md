# Architecture Overview

This document describes the high-level architecture of MCP Router.

## System Architecture

MCP Router is built as an Electron application with a clear separation between the main process (backend) and renderer process (frontend).

```
┌────────────────────────────────────────────────────────────────────┐
│                         Electron Application                        │
├────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌─────────────────────────┐      ┌─────────────────────────────┐  │
│  │     Main Process        │      │     Renderer Process        │  │
│  │     (Node.js)           │      │     (Chromium)              │  │
│  │                         │      │                             │  │
│  │  ┌─────────────────┐    │      │  ┌─────────────────────┐    │  │
│  │  │   DI Container  │    │      │  │    React App        │    │  │
│  │  │  (InversifyJS)  │    │      │  │                     │    │  │
│  │  └────────┬────────┘    │      │  │  ┌───────────────┐  │    │  │
│  │           │             │      │  │  │   Zustand     │  │    │  │
│  │  ┌────────▼────────┐    │      │  │  │   Stores      │  │    │  │
│  │  │    Services     │    │      │  │  └───────────────┘  │    │  │
│  │  │  - Auth         │    │      │  │                     │    │  │
│  │  │  - Policy       │    │ IPC  │  │  ┌───────────────┐  │    │  │
│  │  │  - Server Mgr   │◄───┼──────┼──┤  │  React Hooks  │  │    │  │
│  │  │  - Approval     │    │      │  │  │  (useXxx)     │  │    │  │
│  │  │  - MCP Agg      │    │      │  │  └───────────────┘  │    │  │
│  │  └────────┬────────┘    │      │  │                     │    │  │
│  │           │             │      │  │  ┌───────────────┐  │    │  │
│  │  ┌────────▼────────┐    │      │  │  │  UI Components│  │    │  │
│  │  │  Repositories   │    │      │  │  │  (shadcn/ui)  │  │    │  │
│  │  └────────┬────────┘    │      │  │  └───────────────┘  │    │  │
│  │           │             │      │  └─────────────────────┘    │  │
│  │  ┌────────▼────────┐    │      │                             │  │
│  │  │    SQLite DB    │    │      │                             │  │
│  │  └─────────────────┘    │      │                             │  │
│  └─────────────────────────┘      └─────────────────────────────┘  │
│                                                                     │
└────────────────────────────────────────────────────────────────────┘
```

## Main Process Architecture

### Dependency Injection

The main process uses InversifyJS for dependency injection, enabling:
- Loose coupling between components
- Easy testing with mocks
- Clear dependency graphs

```typescript
// Core DI Container Setup
const container = new Container();

// Register services
container.bind<ILogger>(TYPES.Logger).to(LoggerService).inSingletonScope();
container.bind<IDatabase>(TYPES.Database).to(SqliteDatabase).inSingletonScope();
container.bind<ITokenService>(TYPES.TokenService).to(TokenService).inSingletonScope();
// ... more bindings
```

### Service Layer

Services encapsulate business logic and are the primary units of functionality:

| Service | Responsibility |
|---------|---------------|
| `TokenService` | API token CRUD, validation, hashing |
| `TokenValidator` | Token scope and permission validation |
| `ServerManager` | MCP server lifecycle management |
| `PolicyEngine` | Policy rule evaluation |
| `ApprovalQueueService` | Human-in-the-loop approvals |
| `RateLimiter` | Request rate limiting |
| `MemoryService` | Persistent memory/context storage |
| `AuditService` | Event logging and audit trail |
| `ToolCatalogService` | Aggregated tool discovery |
| `McpAggregator` | MCP protocol aggregation |

### Repository Layer

Repositories handle data persistence with SQLite:

```typescript
interface ITokenRepository {
  create(token: Token): Promise<Token>;
  findById(id: string): Promise<Token | null>;
  findByHash(hash: string): Promise<Token | null>;
  update(token: Token): Promise<void>;
  delete(id: string): Promise<void>;
  findAll(): Promise<Token[]>;
}
```

### IPC Communication

The main and renderer processes communicate via Electron's IPC:

```typescript
// Main process handler registration
ipcMain.handle('servers:list', async () => {
  const serverManager = container.get<IServerManager>(TYPES.ServerManager);
  return serverManager.getAllServers();
});

// Renderer process invocation (via preload)
const servers = await window.electron.servers.list();
```

## Renderer Process Architecture

### State Management (Zustand)

Zustand stores manage UI state with a simple, hook-based API:

```typescript
export const useServerStore = create<ServerState>()(
  devtools((set, get) => ({
    servers: [],
    selectedServerId: null,
    isLoading: false,

    fetchServers: async () => {
      set({ isLoading: true });
      const servers = await window.electron.servers.list();
      set({ servers, isLoading: false });
    },

    // ... more actions
  }))
);
```

### Custom Hooks

React hooks abstract IPC communication and provide clean APIs:

```typescript
export function useServers() {
  const api = useElectron();

  const listServers = useCallback(() => api.servers.list(), [api]);
  const startServer = useCallback((id: string) => api.servers.start(id), [api]);

  return { listServers, startServer, /* ... */ };
}
```

### Component Architecture

UI follows a feature-based structure:

```
renderer/
├── components/
│   └── ui/           # Base UI components (shadcn/ui)
│       ├── button.tsx
│       ├── card.tsx
│       └── dialog.tsx
├── features/
│   ├── servers/      # Server management feature
│   │   ├── ServerList.tsx
│   │   ├── ServerCard.tsx
│   │   └── AddServerDialog.tsx
│   ├── policies/     # Policy management feature
│   └── approvals/    # Approval queue feature
└── stores/           # Zustand state stores
```

## Data Flow

### Request Flow (Tool Execution)

```
1. Client Request
   └─► Token Validation (TokenValidatorService)
       └─► Policy Check (PolicyEngineService)
           ├─► ALLOW: Rate Limit Check (RateLimiterService)
           │   └─► Execute Tool (McpAggregatorService)
           │       └─► Audit Log (AuditService)
           ├─► DENY: Return Error
           └─► REQUIRE_APPROVAL: Queue Request (ApprovalQueueService)
               └─► User Decision
                   ├─► Approve: Continue to Rate Limit
                   └─► Reject: Return Error
```

### IPC Data Flow

```
┌─────────────┐     invoke      ┌─────────────┐     handle     ┌─────────────┐
│  Component  │ ──────────────► │   Preload   │ ─────────────► │   Handler   │
│  (React)    │                 │   Bridge    │                │   (Main)    │
└─────────────┘                 └─────────────┘                └─────────────┘
       │                              │                              │
       │                              │                              │
       ▼                              ▼                              ▼
  useXxxHook()              contextBridge.exposeInMainWorld()   ipcMain.handle()
       │                              │                              │
       ▼                              ▼                              ▼
  Zustand Store              window.electron.xxx                DI Container
```

## Security Architecture

### Token Authentication

```
┌─────────────────────────────────────────────────────────────┐
│                    Token Structure                           │
├─────────────────────────────────────────────────────────────┤
│  id: string           Unique identifier                      │
│  name: string         Human-readable name                    │
│  hash: string         SHA-256 hash (stored, not plaintext)  │
│  scopes: string[]     Allowed operations                     │
│  serverIds: string[]  Allowed server access                  │
│  expiresAt?: number   Optional expiration timestamp          │
│  rateLimit?: object   Per-token rate limit config            │
└─────────────────────────────────────────────────────────────┘
```

### Policy Evaluation

Policies are evaluated in priority order (highest first):

```typescript
interface PolicyRule {
  id: string;
  name: string;
  scope: 'global' | 'client' | 'server';
  scopeId?: string;
  resourceType: 'tool' | 'server' | 'resource' | 'prompt';
  pattern: string;        // Glob pattern
  action: 'allow' | 'deny' | 'require_approval';
  priority: number;       // Higher = evaluated first
  enabled: boolean;
}
```

## Database Schema

### Core Tables

```sql
-- Tokens
CREATE TABLE tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  hash TEXT UNIQUE NOT NULL,
  scopes TEXT NOT NULL,        -- JSON array
  server_ids TEXT,             -- JSON array
  expires_at INTEGER,
  rate_limit TEXT,             -- JSON object
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Servers
CREATE TABLE servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  transport TEXT NOT NULL,     -- 'stdio' | 'http'
  command TEXT,
  args TEXT,                   -- JSON array
  url TEXT,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Policies
CREATE TABLE policies (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  scope TEXT NOT NULL,
  scope_id TEXT,
  resource_type TEXT NOT NULL,
  pattern TEXT NOT NULL,
  action TEXT NOT NULL,
  priority INTEGER NOT NULL,
  enabled INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Audit Events
CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  actor_id TEXT,
  resource_type TEXT,
  resource_id TEXT,
  action TEXT NOT NULL,
  details TEXT,                -- JSON object
  timestamp INTEGER NOT NULL
);
```

## Extension Points

### Adding New Services

1. Define interface in `core/interfaces.ts`
2. Add type symbol in `core/types.ts`
3. Implement service class with `@injectable()` decorator
4. Register in `core/container.ts`
5. Create IPC handlers if needed
6. Add preload bridge methods
7. Create React hooks for renderer access

### Adding New UI Features

1. Create feature directory in `renderer/features/`
2. Implement components
3. Create Zustand store if needed
4. Add hooks for IPC communication
5. Integrate with main App layout
