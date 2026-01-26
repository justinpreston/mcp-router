# AI Agent Skills & Patterns

This document provides reusable patterns and step-by-step guides for common development tasks in MCP Router.

## Table of Contents

- [Creating a Repository](#creating-a-repository)
- [Creating a Service](#creating-a-service)
- [Creating a UI Feature Module](#creating-a-ui-feature-module)
- [Adding IPC Event Listeners](#adding-ipc-event-listeners)
- [Database Migrations](#database-migrations)
- [Writing Service Tests](#writing-service-tests)
- [E2E Testing with Playwright](#e2e-testing-with-playwright)
- [Security Audit Checklist](#security-audit-checklist)
- [GitHub Project Setup](#github-project-setup)
- [Git Workflow & Conventions](#git-workflow--conventions)

---

## Creating a Repository

Use when adding data persistence for a new entity type.

### Required Input
1. **Entity name** (e.g., "Project", "Workflow")
2. **Entity fields** (name, type, nullable, indexed)
3. **Query methods needed** (e.g., `findByStatus`, `findByProjectId`)

### Files to Create/Modify

| Step | File | Action |
|------|------|--------|
| 1 | `src/main/core/interfaces.ts` | Add entity + repository interfaces |
| 2 | `src/main/core/types.ts` | Add DI symbol |
| 3 | `src/main/services/core/database.service.ts` | Add SQL table migration |
| 4 | `src/main/repositories/{name}.repository.ts` | Create implementation |
| 5 | `src/main/core/container.ts` | Bind repository |

### Entity Interface Template
```typescript
export interface {EntityName} {
  id: string;
  // Fields from user input
  createdAt: number;
  updatedAt: number;
}

export interface I{EntityName}Repository {
  create(input: Omit<{EntityName}, 'id' | 'createdAt' | 'updatedAt'>): Promise<{EntityName}>;
  findById(id: string): Promise<{EntityName} | null>;
  findAll(): Promise<{EntityName}[]>;
  update(id: string, input: Partial<{EntityName}>): Promise<{EntityName}>;
  delete(id: string): Promise<void>;
}
```

### Repository Implementation Template
```typescript
import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type { IDatabase, I{EntityName}Repository, {EntityName} } from '@main/core/interfaces';

@injectable()
export class {EntityName}Repository implements I{EntityName}Repository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(input): Promise<{EntityName}> {
    const id = nanoid();
    const now = Math.floor(Date.now() / 1000);
    // INSERT statement
    return this.findById(id) as Promise<{EntityName}>;
  }

  // ... other methods with snake_case ↔ camelCase mapping
}
```

### SQLite Column Type Mapping

| TypeScript | SQLite | Notes |
|------------|--------|-------|
| `string` | `TEXT` | |
| `number` | `INTEGER` / `REAL` | REAL for decimals |
| `boolean` | `INTEGER` | 0/1 |
| `string[]` / `Record<>` | `TEXT` | JSON serialized |
| `Date` | `INTEGER` | Unix timestamp |

---

## Creating a Service

Use when adding new business logic that needs DI integration, IPC handlers, and React hooks.

### Required Input
1. **Service name** (e.g., "Notification", "Analytics")
2. **Methods** (signatures and return types)
3. **Dependencies** (other services needed)

### Files to Create/Modify

| Step | File | Action |
|------|------|--------|
| 1 | `src/main/core/interfaces.ts` | Add service interface |
| 2 | `src/main/core/types.ts` | Add DI symbol |
| 3 | `src/main/services/{name}/{name}.service.ts` | Create implementation |
| 4 | `src/main/core/container.ts` | Bind service |
| 5 | `src/main/ipc/{name}.handler.ts` | Create IPC handler |
| 6 | `src/main/ipc/index.ts` | Register handler |
| 7 | `src/preload/api.ts` | Add API types |
| 8 | `src/preload/index.ts` | Expose via contextBridge |
| 9 | `src/renderer/hooks/use{Name}.ts` | Create React hook |

### Service Implementation Template
```typescript
import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { I{Name}Service, ILogger } from '@main/core/interfaces';

@injectable()
export class {Name}Service implements I{Name}Service {
  constructor(@inject(TYPES.Logger) private logger: ILogger) {}
  // Implement methods
}
```

### IPC Handler Template
```typescript
import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import { TYPES } from '@main/core/types';

export function register{Name}Handlers(container: Container): void {
  const service = container.get<I{Name}Service>(TYPES.{Name}Service);

  ipcMain.handle('{name}:method', async (_, ...args) => {
    return service.method(...args);
  });
}
```

### Naming Conventions

| Component | Pattern | Example |
|-----------|---------|---------|
| Interface | `I{Name}Service` | `INotificationService` |
| Symbol | `{Name}Service` | `NotificationService` |
| IPC Channel | `{name}:action` | `notification:send` |
| Hook | `use{Name}` | `useNotification` |
| API Key | `{camelCase}` | `notification` |

---

## Adding IPC Event Listeners

Use when implementing pub/sub patterns for real-time updates from main to renderer process.

### Required Input
1. **Event name** (e.g., "server:status-changed", "approval:received")
2. **Payload type** (data structure sent with event)
3. **Source service** (which service emits the event)

### Files to Modify

| Step | File | Action |
|------|------|--------|
| 1 | `src/main/ipc/{feature}.handler.ts` | Add event emission |
| 2 | `src/preload/api.ts` | Add event type to ElectronAPI |
| 3 | `src/preload/index.ts` | Expose event listener |
| 4 | `src/renderer/hooks/useElectronEvent.ts` | Create/use event hook |

### Main Process: Emit Event
```typescript
import { BrowserWindow } from 'electron';

// In handler or service
function emitToRenderer(channel: string, data: unknown): void {
  const windows = BrowserWindow.getAllWindows();
  windows.forEach((win) => {
    win.webContents.send(channel, data);
  });
}

// Usage in service
emitToRenderer('server:status-changed', { id: serverId, status: 'running' });
```

### Preload: Expose Listener
```typescript
// In preload/index.ts
on: (channel: string, callback: (...args: unknown[]) => void) => {
  const validChannels = [
    'server:status-changed',
    'approval:received',
    'approval:resolved',
    // Add new channels here
  ];
  if (validChannels.includes(channel)) {
    const listener = (_event: IpcRendererEvent, ...args: unknown[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    return () => ipcRenderer.removeListener(channel, listener);
  }
  return () => {};
},
```

### Renderer: Event Hook
```typescript
// src/renderer/hooks/useElectronEvent.ts
import { useEffect } from 'react';

export function useElectronEvent<T>(
  channel: string,
  callback: (data: T) => void
): void {
  useEffect(() => {
    const unsubscribe = window.electron.on(channel, callback as (...args: unknown[]) => void);
    return unsubscribe;
  }, [channel, callback]);
}

// Usage in component
useElectronEvent<MCPServerInfo>('server:status-changed', (server) => {
  updateServerStatus(server);
});
```

### Event Naming Convention

| Pattern | Example | Use Case |
|---------|---------|----------|
| `{entity}:{action}` | `server:started` | State change |
| `{entity}:{action}-{result}` | `approval:request-received` | Async result |
| `{feature}:{event}` | `catalog:refresh-complete` | Feature events |

---

## Database Migrations

Use when modifying existing SQLite tables or adding new columns.

### Required Input
1. **Table name** to modify
2. **Change type** (add column, create index, rename column)
3. **Column details** (name, type, default, nullable)

### Migration Strategy

SQLite has limited ALTER TABLE support. Use these patterns:

### Adding a Column
```typescript
// In database.service.ts initialize() method
// Add after table creation

// Check if column exists before adding
const tableInfo = this.db.prepare('PRAGMA table_info(servers)').all();
const hasNewColumn = tableInfo.some((col: any) => col.name === 'new_column');

if (!hasNewColumn) {
  this.db.exec(`
    ALTER TABLE servers ADD COLUMN new_column TEXT DEFAULT '';
  `);
  this.logger.info('Migration: Added new_column to servers table');
}
```

### Adding an Index
```typescript
// Indexes are safe to create with IF NOT EXISTS
this.db.exec(`
  CREATE INDEX IF NOT EXISTS idx_servers_project_id 
  ON servers(project_id);
`);
```

### Complex Migration (Rename/Remove Column)
```typescript
// SQLite requires table recreation for column changes
private migrateServersTable(): void {
  const version = this.db.prepare(
    "SELECT value FROM metadata WHERE key = 'schema_version'"
  ).get() as { value: string } | undefined;

  if (!version || parseInt(version.value) < 2) {
    this.db.transaction(() => {
      // 1. Create new table with correct schema
      this.db.exec(`
        CREATE TABLE servers_new (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          renamed_column TEXT,  -- was old_column
          created_at INTEGER DEFAULT (strftime('%s', 'now'))
        );
      `);

      // 2. Copy data with transformations
      this.db.exec(`
        INSERT INTO servers_new (id, name, renamed_column, created_at)
        SELECT id, name, old_column, created_at FROM servers;
      `);

      // 3. Drop old table and rename
      this.db.exec(`DROP TABLE servers;`);
      this.db.exec(`ALTER TABLE servers_new RENAME TO servers;`);

      // 4. Recreate indexes
      this.db.exec(`CREATE INDEX idx_servers_name ON servers(name);`);

      // 5. Update schema version
      this.db.exec(`
        INSERT OR REPLACE INTO metadata (key, value) 
        VALUES ('schema_version', '2');
      `);
    })();

    this.logger.info('Migration: Completed servers table migration to v2');
  }
}
```

### Schema Version Tracking
```sql
-- Add to database initialization
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR IGNORE INTO metadata (key, value) VALUES ('schema_version', '1');
```

### Migration Checklist
- [ ] Check current schema version
- [ ] Wrap in transaction for safety
- [ ] Handle existing data transformation
- [ ] Update schema version after success
- [ ] Log migration completion
- [ ] Test with existing data

---

## Creating a UI Feature Module

Use when adding a new feature area to the renderer with components, store, and hooks.

### Required Input
1. **Feature name** (e.g., "Workflow", "Settings")
2. **Entity type** (data structure)
3. **Views needed** (List, Detail, Form, Dialog)

### Directory Structure
```
src/renderer/features/{feature-name}/
├── index.ts                    # Public exports
├── {Feature}List.tsx           # List view
├── {Feature}Card.tsx           # Card/item component
├── {Feature}Dialog.tsx         # Create/Edit dialog
└── store/
    └── {feature}Store.ts       # Zustand store
```

### Zustand Store Template
```typescript
import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface {Feature}State {
  items: {Entity}[];
  selectedId: string | null;
  isLoading: boolean;
  error: string | null;
  fetchItems: () => Promise<void>;
  // ... actions
}

export const use{Feature}Store = create<{Feature}State>()(
  devtools((set, get) => ({
    items: [],
    selectedId: null,
    isLoading: false,
    error: null,
    fetchItems: async () => {
      set({ isLoading: true, error: null });
      try {
        const items = await window.electron.{feature}.list();
        set({ items, isLoading: false });
      } catch (error) {
        set({ error: error.message, isLoading: false });
      }
    },
  }), { name: '{feature}-store' })
);
```

### Required shadcn/ui Components
```bash
npx shadcn-ui@latest add card button badge dialog input label textarea dropdown-menu skeleton
```

---

## Writing Service Tests

Use when creating unit tests for InversifyJS services.

### Test File Location
```
tests/unit/services/{service-name}.service.test.ts
tests/integration/{service-name}.integration.test.ts
```

### Unit Test Template
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Container } from 'inversify';
import 'reflect-metadata';

import { TYPES } from '@main/core/types';
import { {ServiceName} } from '@main/services/{name}/{name}.service';
import { createMockLogger } from '../../utils';

describe('{ServiceName}', () => {
  let container: Container;
  let service: I{ServiceName};

  beforeEach(() => {
    container = new Container();
    container.bind(TYPES.Logger).toConstantValue(createMockLogger());
    container.bind(TYPES.{ServiceName}).to({ServiceName});
    service = container.get(TYPES.{ServiceName});
  });

  afterEach(() => vi.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('methodName', () => {
    it('should return expected result', async () => {
      const result = await service.methodName(input);
      expect(result).toEqual(expected);
    });

    it('should throw on invalid input', async () => {
      await expect(service.methodName(null)).rejects.toThrow();
    });
  });
});
```

### Test Utilities
- `createMockLogger()` - Mock ILogger
- `createMockConfig()` - Mock IConfig with overrides
- `createTestDatabase()` - In-memory SQLite
- Factory functions in `tests/utils/factories.ts`

### Running Tests
```bash
pnpm test                    # Run all
pnpm test {name}             # Run specific file
pnpm test:coverage           # With coverage
pnpm test:watch              # Watch mode
```

---

## E2E Testing with Playwright

Use when testing full user workflows that span main and renderer processes.

### Test File Location
```
tests/e2e/{feature}.spec.ts
```

### E2E Test Template
```typescript
import { test, expect } from '@playwright/test';
import { ElectronApplication, Page } from 'playwright';
import { startApp, stopApp } from './electron-app';

let electronApp: ElectronApplication;
let page: Page;

test.beforeAll(async () => {
  electronApp = await startApp();
  page = await electronApp.firstWindow();
});

test.afterAll(async () => {
  await stopApp(electronApp);
});

test.describe('Feature Name', () => {
  test('should perform user action', async () => {
    // Navigate or wait for element
    await page.waitForSelector('[data-testid="feature-list"]');

    // Interact with UI
    await page.click('[data-testid="add-button"]');

    // Fill form
    await page.fill('[data-testid="name-input"]', 'Test Name');
    await page.click('[data-testid="submit-button"]');

    // Assert result
    await expect(page.locator('[data-testid="item-card"]')).toContainText('Test Name');
  });

  test('should handle error state', async () => {
    // Trigger error condition
    await page.click('[data-testid="invalid-action"]');

    // Verify error display
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
  });
});
```

### Electron App Helper
```typescript
// tests/e2e/electron-app.ts
import { _electron as electron, ElectronApplication } from 'playwright';
import path from 'path';

export async function startApp(): Promise<ElectronApplication> {
  const electronApp = await electron.launch({
    args: [path.join(__dirname, '../../out/main/index.js')],
    env: {
      ...process.env,
      NODE_ENV: 'test',
      TEST_DATABASE: ':memory:',
    },
  });

  // Wait for app to be ready
  await electronApp.evaluate(async ({ app }) => {
    await app.whenReady();
  });

  return electronApp;
}

export async function stopApp(electronApp: ElectronApplication): Promise<void> {
  await electronApp.close();
}
```

### Common Test Patterns

#### Wait for IPC Response
```typescript
// Wait for data to load after IPC call
await page.waitForFunction(() => {
  const items = document.querySelectorAll('[data-testid="item-card"]');
  return items.length > 0;
});
```

#### Test with Fixtures
```typescript
test.beforeEach(async () => {
  // Inject test data via IPC
  await electronApp.evaluate(async ({ ipcMain }) => {
    // Setup test fixtures
  });
});
```

#### Screenshot on Failure
```typescript
test.afterEach(async ({}, testInfo) => {
  if (testInfo.status !== 'passed') {
    await page.screenshot({ 
      path: `test-results/${testInfo.title}.png` 
    });
  }
});
```

### Data-Testid Conventions

| Element | Pattern | Example |
|---------|---------|---------|
| List container | `{feature}-list` | `server-list` |
| Item card | `{feature}-card` | `server-card` |
| Action button | `{action}-button` | `add-button` |
| Form input | `{field}-input` | `name-input` |
| Error message | `error-message` | `error-message` |

### Running E2E Tests
```bash
pnpm test:e2e              # Run all E2E tests
pnpm test:e2e:ui           # Run with Playwright UI
pnpm test:e2e --headed     # Run with visible browser
```

---

## Security Audit Checklist

Use when reviewing security posture or before releases.

### 1. CORS Configuration (CRITICAL)

**Files to check:** HTTP server files, Express configuration

```typescript
// BAD - allows all origins
app.use(cors());

// GOOD - restrictive whitelist
app.use(cors({
  origin: ['app://localhost', 'http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
```

**Checklist:**
- [ ] CORS origin is explicitly whitelisted
- [ ] Credentials mode is intentionally configured
- [ ] Methods are restricted to what's needed
- [ ] Headers are restricted

### 2. Token/Authentication Security (CRITICAL)

**Files to check:** Token services, auth handlers, config storage

**Checklist:**
- [ ] Tokens have expiration (`expiresAt` field)
- [ ] Token refresh mechanism exists
- [ ] Tokens stored securely (OS Keychain via keytar, NOT plaintext JSON)
- [ ] Token hashes stored, not plaintext tokens
- [ ] Rate limiting on auth endpoints
- [ ] Brute force protection

```typescript
// BAD - plaintext storage
fs.writeFileSync('config.json', JSON.stringify({ token: secret }));

// GOOD - keychain storage
import keytar from 'keytar';
await keytar.setPassword('app-name', 'auth-token', secret);
```

### 3. Input Validation (HIGH)

**Files to check:** IPC handlers, HTTP endpoints, form handlers

**Checklist:**
- [ ] All IPC handlers validate input with Zod
- [ ] HTTP endpoints validate request bodies
- [ ] Path traversal prevented (no `../` in file paths)
- [ ] SQL injection prevented (parameterized queries)
- [ ] Command injection prevented (no shell string concatenation)

```typescript
// BAD - no validation
ipcMain.handle('user:update', async (_, data) => {
  return userService.update(data);
});

// GOOD - Zod validation
import { z } from 'zod';

const UpdateUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
});

ipcMain.handle('user:update', async (_, data) => {
  const validated = UpdateUserSchema.parse(data);
  return userService.update(validated);
});
```

### 4. Content Security Policy (HIGH)

**Files to check:** Main process, BrowserWindow configuration

**Checklist:**
- [ ] CSP header set
- [ ] No `unsafe-eval` in production
- [ ] No `unsafe-inline` for scripts
- [ ] External scripts whitelisted explicitly

```typescript
session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
  callback({
    responseHeaders: {
      ...details.responseHeaders,
      'Content-Security-Policy': [
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: https:; " +
        "connect-src 'self' https://api.example.com"
      ]
    }
  });
});
```

### 5. Process Spawning (CRITICAL)

**Files to check:** Any file using `child_process`, `exec`, `spawn`

**Checklist:**
- [ ] No `shell: true` with user input
- [ ] Arguments passed as array, not string
- [ ] Environment variables sanitized
- [ ] Working directory validated
- [ ] No piping untrusted downloads to shell

```typescript
// BAD - RCE vulnerability
exec(`curl ${url} | sh`);
spawn('ls', [userInput], { shell: true });

// GOOD
spawn('ls', ['-la', sanitizedPath], { shell: false });
execFile('/usr/bin/curl', ['-o', '/tmp/file', url]);
```

### 6. Electron-Specific Settings (CRITICAL)

**Files to check:** main.ts, BrowserWindow creation, preload scripts

**Checklist:**
- [ ] `nodeIntegration: false`
- [ ] `contextIsolation: true`
- [ ] `sandbox: true` (if possible)
- [ ] `webSecurity: true`
- [ ] `allowRunningInsecureContent: false`
- [ ] DevTools disabled in production
- [ ] Remote module disabled

```typescript
const win = new BrowserWindow({
  webPreferences: {
    nodeIntegration: false,      // ✓ Required
    contextIsolation: true,      // ✓ Required
    sandbox: true,               // ✓ Recommended
    webSecurity: true,           // ✓ Required
    allowRunningInsecureContent: false,
    devTools: !app.isPackaged,   // ✓ Disable in prod
  },
});
```

### 7. Deep Links / URL Handling (HIGH)

**Files to check:** Protocol handler registration, URL parsing

**Checklist:**
- [ ] Custom protocol scheme validated
- [ ] URL parameters sanitized
- [ ] No automatic navigation to untrusted URLs
- [ ] Scheme whitelist enforced

```typescript
// BAD
app.setAsDefaultProtocolClient('myapp');
shell.openExternal(deepLinkUrl);

// GOOD
app.setAsDefaultProtocolClient('myapp');
const url = new URL(deepLinkUrl);
if (url.protocol === 'myapp:' && ALLOWED_HOSTS.includes(url.host)) {
  // Handle safely
}
```

### 8. Rate Limiting (HIGH)

**Files to check:** HTTP server, API endpoints

**Checklist:**
- [ ] Global rate limit configured
- [ ] Per-endpoint rate limits for sensitive operations
- [ ] Per-token/IP rate limiting
- [ ] Rate limit headers returned

```typescript
import rateLimit from 'express-rate-limit';

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  message: { error: 'Too many requests' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
});

app.use(globalLimiter);
app.use('/auth', authLimiter);
```

### 9. Sandbox/VM Execution (CRITICAL)

**Files to check:** Any code using `vm`, `vm2`, `eval`, `Function()`

**Checklist:**
- [ ] Timeout configured
- [ ] Memory limits set
- [ ] Global objects frozen
- [ ] Sensitive context not exposed
- [ ] Prototype pollution prevented

```typescript
// BAD
const vm = new VM({
  timeout: 5000,
  sandbox: { tokens, config, database }, // Exposes sensitive data!
});

// GOOD
const vm = new VM({
  timeout: 1000,
  sandbox: Object.freeze({
    console: { log: () => {} },
    // Only expose what's needed
  }),
});
```

### 10. Network Security (MEDIUM)

**Files to check:** HTTP server, fetch calls, websockets

**Checklist:**
- [ ] Server binds to localhost only (not 0.0.0.0)
- [ ] HTTPS enforced for external calls
- [ ] Certificate validation not disabled
- [ ] SSRF protection (URL allowlist)

```typescript
// BAD - binds to all interfaces
server.listen(3000);

// GOOD - localhost only
server.listen(3000, '127.0.0.1');
```

### 11. Logging & Data Exposure (MEDIUM)

**Files to check:** Logger configuration, error handlers

**Checklist:**
- [ ] Tokens/secrets not logged
- [ ] PII masked or excluded
- [ ] Stack traces sanitized in production
- [ ] Log files have restricted permissions

### 12. Dependencies (MEDIUM)

**Checklist:**
- [ ] No critical vulnerabilities (`npm audit`)
- [ ] High vulnerabilities addressed or documented
- [ ] Dependencies up to date
- [ ] Lock file committed

### 13. Auto-Update (MEDIUM)

**Files to check:** Update configuration, electron-updater setup

**Checklist:**
- [ ] Updates served over HTTPS
- [ ] Code signing enabled
- [ ] Signature verification enabled
- [ ] Update URL hardcoded (not configurable)

### Severity Ratings

| Severity | Response Time | Examples |
|----------|--------------|----------|
| CRITICAL | Immediate | RCE, auth bypass, plaintext secrets |
| HIGH | Within 1 week | XSS, CSRF, missing validation |
| MEDIUM | Within 1 month | Info disclosure, missing headers |
| LOW | Next release | Best practice violations |

### Quick Audit Commands
```bash
npm audit                    # Dependency vulnerabilities
npx gitleaks detect          # Secrets in code
npx depcheck                 # Unused dependencies
```

---

## GitHub Project Setup

Use when initializing project milestones, labels, and epic issues.

### Required Input
1. **Repository** (owner/repo)
2. **Sprint count** (default: 10)
3. **Sprint duration** (default: 2 weeks)
4. **Epic features** (major features to implement)

### Create Labels
```bash
# Priority
gh label create "priority:critical" --color "B60205" --repo owner/repo
gh label create "priority:high" --color "D93F0B" --repo owner/repo
gh label create "priority:medium" --color "FBCA04" --repo owner/repo

# Type
gh label create "type:feature" --color "1D76DB" --repo owner/repo
gh label create "type:bug" --color "E11D21" --repo owner/repo
gh label create "type:security" --color "5319E7" --repo owner/repo
gh label create "epic" --color "3E4B9E" --repo owner/repo
```

### Create Milestones
```bash
gh api repos/owner/repo/milestones \
  -f title="Sprint 1" \
  -f description="Sprint 1 deliverables" \
  -f due_on="2024-02-15T23:59:59Z"
```

### Create Epic Issue
```bash
gh issue create --repo owner/repo \
  --title "Epic: Feature Name" \
  --label "epic,priority:high,type:feature" \
  --milestone "Sprint 1" \
  --body "## Overview
Brief description.

## Subtasks
- [ ] Task 1
- [ ] Task 2

## Acceptance Criteria
- [ ] Criteria 1"
```

### Sprint Planning Template

| Sprint | Focus |
|--------|-------|
| 1-2 | Foundation, infrastructure, DI setup |
| 3-4 | Core features, data layer |
| 5-6 | Integration, API endpoints |
| 7-8 | UI components, state management |
| 9-10 | Testing, documentation, polish |

---

## Git Workflow & Conventions

Use when contributing to the project or reviewing PRs.

### Branch Naming

| Type | Pattern | Example |
|------|---------|---------|
| Feature | `feature/{issue}-{short-description}` | `feature/42-add-token-refresh` |
| Bug fix | `fix/{issue}-{short-description}` | `fix/87-cors-header-missing` |
| Hotfix | `hotfix/{issue}-{description}` | `hotfix/99-security-patch` |
| Chore | `chore/{description}` | `chore/update-dependencies` |
| Docs | `docs/{description}` | `docs/api-reference` |

### Commit Message Format

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

**Types:**
| Type | Description |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, no code change |
| `refactor` | Code change that neither fixes nor adds |
| `perf` | Performance improvement |
| `test` | Adding/updating tests |
| `chore` | Build, CI, dependencies |
| `security` | Security fix or improvement |

**Scopes:** `main`, `renderer`, `preload`, `ipc`, `db`, `ui`, `auth`, `policy`, `server`, `deps`

**Examples:**
```bash
feat(auth): add token refresh mechanism

fix(ipc): validate server ID before start

docs(api): update token endpoint examples

chore(deps): bump electron to 28.1.3

security(tokens): hash tokens before storage

Closes #42
```

### Pull Request Process

1. **Create branch** from `main` following naming convention
2. **Make commits** following conventional commit format
3. **Run checks locally:**
   ```bash
   pnpm lint:fix
   pnpm typecheck
   pnpm test
   ```
4. **Push and create PR** with template below
5. **Request review** from at least one team member
6. **Address feedback** with fixup commits
7. **Squash and merge** once approved

### PR Template

```markdown
## Description
Brief description of changes.

## Type of Change
- [ ] Feature (new functionality)
- [ ] Bug fix (non-breaking fix)
- [ ] Breaking change (fix or feature causing existing functionality to change)
- [ ] Documentation update
- [ ] Refactor (no functional changes)

## Related Issues
Closes #issue_number

## Checklist
- [ ] Code follows project conventions
- [ ] Self-reviewed the code
- [ ] Added/updated tests
- [ ] Updated documentation if needed
- [ ] All checks pass locally

## Screenshots (if UI changes)
```

### Code Review Guidelines

**Reviewer checklist:**
- [ ] Code follows DI patterns (InversifyJS)
- [ ] IPC handlers validate input with Zod
- [ ] New features have tests
- [ ] No security concerns (see Security Audit)
- [ ] TypeScript types are correct
- [ ] Error handling is appropriate

**Response time expectations:**
- Initial review: within 1 business day
- Follow-up reviews: within 4 hours

### Release Process

1. **Create release branch:** `release/v{major}.{minor}.{patch}`
2. **Update version:** in `package.json` files
3. **Generate changelog:** from conventional commits
4. **Create PR** to `main`
5. **Tag release** after merge: `v{major}.{minor}.{patch}`
6. **GitHub Actions** builds and publishes

### Protected Branch Rules (main)

- Require PR reviews (1 minimum)
- Require status checks to pass
- Require up-to-date branches
- No force pushes
- No deletions
