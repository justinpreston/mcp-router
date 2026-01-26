# ADR-001: Use Electron for Desktop Application

## Status

Accepted

## Context

MCP Router needs to run as a desktop application that:
- Manages local MCP server processes
- Provides a rich graphical user interface
- Runs on macOS, Windows, and Linux
- Can access system resources (filesystem, processes, keychain)
- Needs to run continuously in the background

We need to choose a framework that allows building cross-platform desktop applications with modern web technologies.

## Decision

We will use **Electron** as the application framework.

Specifically:
- Electron 28.x for the runtime
- electron-vite for build tooling
- React for the renderer process UI

## Consequences

### Positive

1. **Cross-platform**: Single codebase runs on macOS, Windows, and Linux
2. **Web technologies**: Can use React, TypeScript, and modern web tooling
3. **Full Node.js access**: Main process has complete access to Node.js APIs
4. **Process management**: Can spawn and manage child processes (MCP servers)
5. **Native integrations**: Access to system keychain, notifications, tray icons
6. **Mature ecosystem**: Large community, many libraries and examples
7. **Auto-updates**: Built-in support for application updates

### Negative

1. **Bundle size**: Applications are larger (~150MB) due to bundled Chromium
2. **Memory usage**: Higher baseline memory consumption than native apps
3. **Startup time**: Slower cold start than native applications
4. **Security surface**: Chromium and Node.js increase attack surface

### Mitigations

- Use context isolation and disabled node integration in renderer
- Implement strict CSP headers
- Regular dependency updates for security patches
- Lazy loading to improve startup time

## Alternatives Considered

### Tauri

**Pros**: Smaller bundle size, lower memory usage, Rust backend
**Cons**: Less mature, smaller ecosystem, steeper learning curve for Rust

**Why not chosen**: Team expertise is in JavaScript/TypeScript, and the ecosystem benefits of Electron outweigh the size/memory concerns.

### Qt (with QML/C++)

**Pros**: Native look and feel, good performance
**Cons**: Different tech stack, licensing costs, complex deployment

**Why not chosen**: Significant technology shift from web technologies.

### Native Apps (Swift/Kotlin/.NET)

**Pros**: Best performance, native experience
**Cons**: Three separate codebases, different skillsets needed

**Why not chosen**: Development and maintenance cost of three codebases is too high.
