# Development Guide

This guide covers setting up a development environment and common development tasks.

## Prerequisites

- **Node.js** 20.x or later
- **pnpm** 9.x or later
- **Git**

### macOS

```bash
# Install Node.js via Homebrew
brew install node@20

# Install pnpm
npm install -g pnpm
```

### Windows

```powershell
# Install Node.js via winget
winget install OpenJS.NodeJS.LTS

# Install pnpm
npm install -g pnpm
```

## Getting Started

### Clone and Install

```bash
git clone https://github.com/your-org/mcp-router.git
cd mcp-router
pnpm install
```

### Start Development Server

```bash
pnpm dev
```

This starts:
- Main process with hot reload
- Renderer process with HMR
- Development tools (DevTools, React DevTools)

### Project Structure

```
apps/desktop/
├── src/
│   ├── main/                    # Main process (Node.js)
│   │   ├── core/
│   │   │   ├── container.ts    # DI container setup
│   │   │   ├── interfaces.ts   # Service interfaces
│   │   │   ├── types.ts        # DI type symbols
│   │   │   └── index.ts        # Core exports
│   │   ├── services/           # Business logic
│   │   │   ├── auth/
│   │   │   ├── policy/
│   │   │   ├── server/
│   │   │   └── ...
│   │   ├── repositories/       # Data access
│   │   ├── ipc/               # IPC handlers
│   │   └── index.ts           # Main entry point
│   ├── preload/
│   │   ├── api.ts             # Type definitions
│   │   └── index.ts           # Context bridge
│   └── renderer/              # React application
│       ├── components/        # Shared UI components
│       ├── features/          # Feature modules
│       ├── hooks/             # Custom hooks
│       ├── stores/            # Zustand stores
│       ├── lib/               # Utilities
│       ├── App.tsx            # Root component
│       ├── main.tsx           # React entry
│       └── index.css          # Global styles
├── tests/
│   └── utils/                 # Test utilities
├── electron.vite.config.ts    # Build configuration
├── tailwind.config.js         # Tailwind configuration
├── tsconfig.json              # TypeScript configuration
└── package.json
```

## Development Workflow

### MCP SDK Import Pattern

The MCP SDK uses TypeScript package exports that the TypeScript compiler can't resolve natively. Use `// @ts-ignore` before SDK imports:

```typescript
// @ts-ignore - MCP SDK uses package exports
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// @ts-ignore
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
// @ts-ignore
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// @ts-ignore
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
```

This pattern is consistent across MCP Router and AI Hub. The imports work at runtime; only the TypeScript type checker needs the suppression.

### Adding a New Service

1. **Define the interface** in `src/main/core/interfaces.ts`:

```typescript
export interface IMyService {
  doSomething(input: string): Promise<string>;
}
```

2. **Add the type symbol** in `src/main/core/types.ts`:

```typescript
export const TYPES = {
  // ... existing types
  MyService: Symbol.for('MyService'),
};
```

3. **Implement the service** in `src/main/services/my-service/`:

```typescript
// my-service.service.ts
import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { IMyService, ILogger } from '@main/core/interfaces';

@injectable()
export class MyService implements IMyService {
  constructor(
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async doSomething(input: string): Promise<string> {
    this.logger.info('Doing something', { input });
    return `Processed: ${input}`;
  }
}
```

4. **Register in container** in `src/main/core/container.ts`:

```typescript
import { MyService } from '@main/services/my-service/my-service.service';

container.bind<IMyService>(TYPES.MyService).to(MyService).inSingletonScope();
```

5. **Add IPC handler** in `src/main/ipc/my-service.handler.ts`:

```typescript
import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import { TYPES } from '@main/core/types';
import type { IMyService } from '@main/core/interfaces';

export function registerMyServiceHandlers(container: Container): void {
  const service = container.get<IMyService>(TYPES.MyService);

  ipcMain.handle('my-service:do-something', async (_, input: string) => {
    return service.doSomething(input);
  });
}
```

6. **Expose in preload** in `src/preload/index.ts`:

```typescript
myService: {
  doSomething: (input: string) => ipcRenderer.invoke('my-service:do-something', input),
},
```

7. **Create React hook** in `src/renderer/hooks/useMyService.ts`:

```typescript
import { useCallback } from 'react';
import { useElectron } from './useElectron';

export function useMyService() {
  const api = useElectron();

  const doSomething = useCallback(
    (input: string) => api.myService.doSomething(input),
    [api]
  );

  return { doSomething };
}
```

### Adding UI Components

We use [shadcn/ui](https://ui.shadcn.com/) patterns for UI components.

1. **Create component** in `src/renderer/components/ui/`:

```tsx
// switch.tsx
import * as React from 'react';
import { cn } from '@renderer/lib/utils';

export interface SwitchProps {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function Switch({
  checked = false,
  onCheckedChange,
  disabled = false,
  className,
}: SwitchProps) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange?.(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
        checked ? 'bg-primary' : 'bg-input',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <span
        className={cn(
          'inline-block h-4 w-4 transform rounded-full bg-background transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      />
    </button>
  );
}
```

2. **Export from index** in `src/renderer/components/ui/index.ts`:

```typescript
export { Switch, type SwitchProps } from './switch';
```

### Adding Feature Modules

Feature modules group related components, hooks, and logic.

```
features/
└── my-feature/
    ├── MyFeatureList.tsx      # List component
    ├── MyFeatureCard.tsx      # Card component
    ├── MyFeatureDialog.tsx    # Dialog component
    └── index.ts               # Exports
```

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Run tests with coverage
pnpm test:coverage
```

### Writing Tests

Tests are located alongside source files or in `tests/`:

```typescript
// services/auth/__tests__/token.service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Container } from 'inversify';
import { TokenService } from '../token.service';
import { createMockLogger, createMockConfig } from '@tests/utils';

describe('TokenService', () => {
  let container: Container;
  let tokenService: TokenService;

  beforeEach(() => {
    container = new Container();
    // Setup mocks and bindings
  });

  it('should create a token', async () => {
    const result = await tokenService.generateToken({
      clientId: 'test-client',
      name: 'Test Token',
      scopes: ['tools:read'],
    });

    expect(result).toBeDefined();
    expect(result.name).toBe('Test Token');
  });
});
```

### Test Utilities

Common test utilities are in `tests/utils/`:

```typescript
import {
  createMockLogger,
  createMockConfig,
  createMockToken,
  createMockServer,
} from '@tests/utils';
```

## Building

### Development Build

```bash
pnpm build
```

### Production Build

```bash
pnpm build
pnpm package
```

## Code Style

### ESLint

```bash
# Check for issues
pnpm lint

# Auto-fix issues
pnpm lint:fix
```

### TypeScript

```bash
# Type check
pnpm typecheck
```

### Formatting

We use Prettier for code formatting. Configure your editor to format on save.

## Debugging

### Main Process

1. Start with debugging enabled:
```bash
pnpm dev
```

2. Open Chrome DevTools: `chrome://inspect`

3. Click "inspect" on the Electron process

### Renderer Process

DevTools are automatically opened in development mode. You can also:

- Press `Cmd+Option+I` (macOS) or `Ctrl+Shift+I` (Windows/Linux)
- Use React DevTools extension

### Logging

Use the injected logger service:

```typescript
this.logger.debug('Debug message', { data });
this.logger.info('Info message');
this.logger.warn('Warning message');
this.logger.error('Error message', error);
```

Logs are written to:
- Console (development)
- `~/Library/Logs/MCP Router/` (macOS)
- `%APPDATA%\MCP Router\logs\` (Windows)

## Common Tasks

### Reset Database

Delete the database file:

```bash
rm ~/Library/Application\ Support/MCP\ Router/mcp-router.db
```

### Clear All Data

```bash
rm -rf ~/Library/Application\ Support/MCP\ Router/
```

### Update Dependencies

```bash
pnpm update
```

### Check for Unused Code

```bash
npx knip
```

## Troubleshooting

### Native Module Build Failures

If native modules (better-sqlite3, keytar) fail to build:

```bash
# Rebuild for Electron
pnpm rebuild

# Or rebuild specific package
cd node_modules/better-sqlite3
npx electron-rebuild
```

### Port Already in Use

If port 3847 is in use:

```bash
lsof -i :3847
kill -9 <PID>
```

### Hot Reload Not Working

1. Check if file watchers are exhausted:
```bash
# macOS
sysctl kern.maxfiles
# Increase if needed
```

2. Restart the dev server:
```bash
pnpm dev
```
