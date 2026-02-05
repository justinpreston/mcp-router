# ADR-007: Replace Custom JSON-RPC with MCP SDK Transports

## Status

Accepted

## Context

MCP Router's HTTP server (`SecureHttpServer`) originally implemented a custom Express-based gateway with:
- `POST /mcp` — custom JSON-RPC request handler with manual method dispatch
- `GET /mcp/sse` — custom SSE implementation for event streaming
- Manual JSON-RPC framing/parsing for both server-side and client-side connections
- No support for the MCP protocol's initialization handshake or capability negotiation

While `@modelcontextprotocol/sdk` was listed as a dependency, it was not imported anywhere in the service code. This meant standard MCP clients (Claude Desktop, Cursor, VS Code) using `StreamableHTTPClientTransport` or `SSEClientTransport` from the SDK could not connect, because the wire protocol didn't match the MCP specification.

Similarly, the client-side code (`McpClientFactory`) used raw `child_process.spawn()` with manual JSON-RPC buffer parsing instead of the SDK's `Client` + transport classes.

## Decision

We will replace all custom JSON-RPC protocol handling with official MCP SDK transports:

### Server-side
- **`StreamableHTTPServerTransport`** — stateless HTTP transport for `POST|GET|DELETE /mcp`
- **`SSEServerTransport`** — session-based SSE transport for `GET /mcp/sse` + `POST /mcp/messages`
- **MCP SDK `Server`** — wraps request handlers for all 6 MCP methods (ListTools, CallTool, ListResources, ReadResource, ListPrompts, GetPrompt)

### Client-side
- **`StdioClientTransport`** — for stdio-based upstream MCP servers
- **`StreamableHTTPClientTransport`** — for HTTP-based upstream servers
- **`SSEClientTransport`** — for SSE-based upstream servers
- **MCP SDK `Client`** — handles initialization handshake and capability negotiation automatically

### CLI Bridge
- **`StdioServerTransport`** — client-facing, for stdio-only clients (Claude Desktop)
- **`StreamableHTTPClientTransport`** — upstream-facing, connects to MCP Router's HTTP gateway

## Consequences

### Positive

1. **Protocol compliance**: Standard MCP clients can connect natively without custom adapters
2. **Reduced code**: ~560 lines of custom JSON-RPC parsing removed
3. **Automatic handshake**: SDK handles `initialize` / capability negotiation
4. **Multi-transport support**: Clients can choose StreamableHTTP or SSE
5. **Future-proof**: SDK updates bring protocol improvements automatically
6. **CLI bridge**: stdio-only clients (Claude Desktop, Cline) can connect via the bridge command

### Negative

1. **SDK import quirks**: MCP SDK uses package exports that TypeScript can't resolve, requiring `// @ts-ignore` before imports
2. **Stateless mode**: StreamableHTTP transport runs in stateless mode (no persistent sessions per connection) — this is a deliberate simplification
3. **Old transports remain**: Custom `stdio-transport.ts`, `json-rpc-handler.ts`, etc. still exist in the codebase (can be cleaned up in follow-up)

### Mitigations

- `// @ts-ignore` comments document why they're needed and match the pattern used by AI Hub
- SSE transport provides session-based connections for clients that need them
- Legacy REST endpoints (`GET /mcp/tools/list`, `POST /mcp/tools/call`, etc.) preserved for backward compatibility

## Implementation

- **PR #73**: `feat(main): Replace custom JSON-RPC with MCP SDK transports`
- **Issues**: #66 (Server Transports), #67 (CLI Bridge), #68 (Client Transport)
- **SDK Version**: `@modelcontextprotocol/sdk` upgraded from `^1.0.0` to `^1.12.0`

## Alternatives Considered

### Keep Custom JSON-RPC and Add SDK as Separate Endpoints

**Pros**: No risk of breaking existing integrations
**Cons**: Two protocol implementations to maintain, doubled complexity, SDK endpoints would still be needed

**Why not chosen**: No external consumers of the custom protocol existed, so a clean replacement was lower risk.
