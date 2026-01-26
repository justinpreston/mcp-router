# MCP Router

A secure, enterprise-grade Model Context Protocol (MCP) server aggregation platform built with Electron.

## Overview

MCP Router acts as a centralized gateway for managing multiple MCP servers, providing:

- **Server Aggregation**: Connect and manage multiple MCP servers from a single interface
- **Policy-Based Access Control**: Fine-grained control over tool and resource access
- **Token Authentication**: Secure API token management with scoping and expiration
- **Approval Workflows**: Human-in-the-loop approval for sensitive operations
- **Rate Limiting**: Protect against abuse with configurable rate limits
- **Audit Logging**: Complete audit trail of all operations

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        MCP Router                                │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │   Clients   │  │   Policy    │  │  Approval   │              │
│  │  (Claude,   │──│   Engine    │──│   Queue     │              │
│  │   etc.)     │  │             │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   MCP Aggregator                         │    │
│  │  - Tool routing    - Resource proxying    - Audit log   │    │
│  └─────────────────────────────────────────────────────────┘    │
│         │                │                │                      │
│         ▼                ▼                ▼                      │
│  ┌───────────┐    ┌───────────┐    ┌───────────┐                │
│  │ MCP Server│    │ MCP Server│    │ MCP Server│                │
│  │     A     │    │     B     │    │     C     │                │
│  └───────────┘    └───────────┘    └───────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

## Features

### Server Management
- Support for stdio and HTTP transport protocols
- Automatic server health monitoring
- Tool and resource discovery
- Per-server configuration

### Security
- Token-based authentication with scopes
- Policy rules with glob pattern matching
- Rate limiting per client/token
- Secure credential storage via system keychain

### Policy Engine
- Global, client-specific, and server-specific policies
- Allow, deny, and require_approval actions
- Priority-based rule evaluation
- Wildcard pattern matching

### Approval System
- Real-time approval notifications
- Configurable timeout and expiration
- Audit trail for all decisions

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+

### Installation

```bash
# Clone the repository
git clone https://github.com/your-org/mcp-router.git
cd mcp-router

# Install dependencies
pnpm install

# Start development server
pnpm dev
```

### Building

```bash
# Build for production
pnpm build

# Package for distribution
pnpm package
```

## Project Structure

```
mcp-router/
├── apps/
│   └── desktop/                 # Electron desktop application
│       ├── src/
│       │   ├── main/           # Main process (Node.js)
│       │   │   ├── core/       # DI container, types, interfaces
│       │   │   ├── services/   # Business logic services
│       │   │   ├── repositories/ # Data access layer
│       │   │   └── ipc/        # IPC handlers
│       │   ├── preload/        # Preload scripts (context bridge)
│       │   └── renderer/       # React UI
│       │       ├── components/ # Reusable UI components
│       │       ├── features/   # Feature modules
│       │       ├── hooks/      # Custom React hooks
│       │       └── stores/     # Zustand state stores
│       └── tests/              # Test files
├── docs/                       # Documentation
│   ├── adr/                   # Architecture Decision Records
│   ├── api/                   # API documentation
│   └── guides/                # User and developer guides
└── packages/                   # Shared packages (future)
```

## Technology Stack

| Layer | Technology |
|-------|------------|
| Framework | Electron 28 |
| UI | React 18 + TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| State | Zustand |
| DI | InversifyJS |
| Database | SQLite (better-sqlite3) |
| Build | electron-vite + Vite |
| Testing | Vitest + Playwright |

## Documentation

- [Architecture Overview](./docs/architecture.md)
- [Development Guide](./docs/guides/development.md)
- [API Reference](./docs/api/README.md)
- [Architecture Decisions](./docs/adr/README.md)

## Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server |
| `pnpm build` | Build for production |
| `pnpm test` | Run unit tests |
| `pnpm test:watch` | Run tests in watch mode |
| `pnpm lint` | Run ESLint |
| `pnpm lint:fix` | Fix linting issues |
| `pnpm typecheck` | Run TypeScript type checking |

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - see [LICENSE](./LICENSE) for details.
