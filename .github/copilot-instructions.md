# MCP Router - Copilot Instructions

## Architecture Overview

MCP Router is an **Electron desktop app** that aggregates multiple MCP (Model Context Protocol) servers behind a secure gateway. The codebase follows a strict separation:

- **Main process** (`apps/desktop/src/main/`): Node.js backend with InversifyJS DI, SQLite persistence, and Express HTTP server
- **Renderer process** (`apps/desktop/src/renderer/`): React UI with Zustand state management and shadcn/ui components
- **Preload bridge** (`apps/desktop/src/preload/`): Type-safe IPC API between processes

## Key Patterns

### Dependency Injection (Main Process)

All services use InversifyJS. Register services in [container.ts](apps/desktop/src/main/core/container.ts):

```typescript
// 1. Define symbol in types.ts
export const TYPES = { MyService: Symbol.for('MyService') };

// 2. Define interface in interfaces.ts
export interface IMyService { doThing(): Promise<void>; }

// 3. Implement with @injectable() decorator
@injectable()
export class MyService implements IMyService { ... }

// 4. Bind in container.ts
container.bind<IMyService>(TYPES.MyService).to(MyService);
```

### IPC Communication

IPC handlers in `src/main/ipc/*.handler.ts` expose services to the renderer:

```typescript
// Main: Register handler
ipcMain.handle('feature:action', async (_event, arg) => {
  const service = container.get<IService>(TYPES.Service);
  return service.action(arg);
});

// Preload: Define in ElectronAPI interface (api.ts)
// Renderer: Call via window.electron.feature.action()
```

### Zustand Stores (Renderer)

Stores in `src/renderer/stores/` follow this pattern:

```typescript
export const useFeatureStore = create<FeatureState>()(
  devtools((set, get) => ({
    items: [],
    isLoading: false,
    fetchItems: async () => {
      set({ isLoading: true });
      const items = await window.electron.feature.list();
      set({ items, isLoading: false });
    },
  }))
);
```

### Feature-Based UI Structure

UI code in `src/renderer/features/` is organized by domain (servers, policies, approvals). Each feature has:
- Components (e.g., `ServerList.tsx`, `ServerCard.tsx`)
- Hooks for IPC abstraction
- Store selectors exported from `stores/index.ts`

## Development Commands

```bash
pnpm install          # Install all dependencies
pnpm dev              # Start Electron dev server (hot reload)
pnpm build            # Production build
pnpm test             # Run Vitest unit/integration tests
pnpm test:e2e         # Run Playwright E2E tests
pnpm lint:fix         # Fix ESLint issues
pnpm typecheck        # TypeScript validation
```

## Testing Patterns

- **Unit tests**: Use `createMockLogger()`, `createMockConfig()` from [test-container.ts](apps/desktop/tests/utils/test-container.ts)
- **Integration tests**: Use real in-memory SQLite via `createTestDatabase()`
- **Factories**: Use [factories.ts](apps/desktop/tests/utils/factories.ts) for mock data (`createMockToken()`, `createMockServer()`, etc.)
- **E2E tests**: Playwright tests in `tests/e2e/` launch the full Electron app

## Data Flow: Tool Execution

```
Request → TokenValidator → PolicyEngine → RateLimiter → McpAggregator → AuditService
                              ↓
                     (REQUIRE_APPROVAL)
                              ↓
                      ApprovalQueueService
```

## Key Conventions

1. **Path aliases**: Use `@main/`, `@preload/`, `@renderer/` for imports
2. **IDs**: Generated with `nanoid()` - tokens use `mcpr_` prefix
3. **Timestamps**: Unix seconds for auth (`Math.floor(Date.now() / 1000)`), milliseconds for entities
4. **Interfaces prefix**: All interfaces start with `I` (e.g., `IServerManager`)
5. **Policy defaults**: Default deny - all access must be explicitly allowed via PolicyEngine

## Important Files

- [interfaces.ts](apps/desktop/src/main/core/interfaces.ts) - All service contracts and domain types
- [types.ts](apps/desktop/src/main/core/types.ts) - DI symbols
- [api.ts](apps/desktop/src/preload/api.ts) - Complete IPC API surface
- [docs/adr/](docs/adr/) - Architecture Decision Records for design rationale
- [AGENTS.md](AGENTS.md) - Step-by-step guides for common development tasks

## Development Skills Reference

See [AGENTS.md](AGENTS.md) for detailed patterns on:
- **Creating Repositories** - SQLite tables, entity interfaces, DI binding
- **Creating Services** - Full stack from interface to React hook
- **Creating UI Features** - Zustand stores, shadcn/ui components
- **Adding IPC Events** - Pub/sub patterns between main and renderer
- **Database Migrations** - Schema changes, version tracking
- **Writing Tests** - Vitest patterns with mock factories
- **E2E Testing** - Playwright patterns for Electron
- **Security Audits** - Full 13-category Electron security checklist
- **GitHub Setup** - Milestones, labels, epic issues
- **Git Workflow** - Branch naming, commit format, PR process
