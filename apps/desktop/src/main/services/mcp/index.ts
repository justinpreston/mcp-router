/**
 * MCP Protocol Layer Services
 *
 * This module provides the foundation for MCP (Model Context Protocol) client communication:
 * - JsonRpcHandler: JSON-RPC 2.0 request/response correlation
 * - StdioTransport: Child process communication via stdin/stdout
 * - HttpTransport: HTTP-based MCP server communication
 * - SseTransport: Server-Sent Events for streaming responses
 * - ProcessHealthMonitor: Crash recovery and automatic restart
 * - McpClientService: High-level MCP client for tool/resource/prompt operations
 * - McpClientFactory: Factory for creating per-server MCP client instances
 * - McpAggregator: Aggregates multiple MCP servers behind a unified interface
 */

export { McpAggregator } from './mcp-aggregator.service';
export { JsonRpcHandler } from './json-rpc-handler';
export { StdioTransport } from './stdio-transport';
export { HttpTransport } from './http-transport';
export { SseTransport } from './sse-transport';
export { ProcessHealthMonitor } from './process-health-monitor';
export { McpClientService } from './mcp-client.service';
export { McpClientFactory } from './mcp-client-factory';
export { BuiltinToolsService } from './builtin-tools.service';
export type { McpClientOptions } from './mcp-client.service';
