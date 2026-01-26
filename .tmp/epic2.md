## Overview
Implement the core MCP protocol client that enables communication with MCP servers via stdio and HTTP transports.

## Acceptance Criteria
- [x] MCP Client service using `@modelcontextprotocol/sdk`
- [x] Stdio transport handler with child process management
- [x] Request handlers for tools/list, tools/call, resources/list, resources/read, prompts/list, prompts/get
- [x] Proper error handling and timeout management
- [x] Unit tests with >80% coverage

## Technical Requirements
- Use `@modelcontextprotocol/sdk` for protocol compliance
- Implement JSON-RPC communication
- Handle process lifecycle (spawn, monitor, cleanup)
- Stream stdout/stderr for logging

## Implementation Status
- ✅ McpClientFactory - Creates MCP clients for different transports
- ✅ JsonRpcHandler - Handles JSON-RPC protocol communication  
- ✅ StdioTransport - Manages child process lifecycle
- ✅ HttpTransport - HTTP/JSON-RPC transport
- ✅ SseTransport - Server-Sent Events transport
- ✅ ProcessHealthMonitor - Monitors process health

## Test Coverage
- ✅ JsonRpcHandler tests (17 tests)
- ✅ MCP Aggregator tests (13 tests)
- ✅ ServerManager tests (12 tests)
- ✅ TokenService tests (22 tests)
- ✅ PolicyEngine tests (18 tests)
- ✅ RateLimiter tests (19 tests)
- ✅ ApprovalQueue tests (10 tests)

**Total: 111 unit tests passing**

## Dependencies
- None (foundation feature)
