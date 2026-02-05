import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
// @ts-ignore - MCP SDK uses package exports
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// @ts-ignore
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import type {
  IMcpProtocolServer,
  IMcpAggregator,
  IServerManager,
  IBuiltinToolsService,
  ILogger,
  Token,
} from '@main/core/interfaces';

/**
 * Request context threaded through MCP SDK handlers.
 * Since the MCP SDK doesn't natively support per-request auth context,
 * we set this before handling each transport request.
 */
export interface McpRequestContext {
  token: Token;
  projectId?: string;
  projectSlug?: string;
}

/**
 * MCP Protocol Server wrapping the official MCP SDK Server class.
 * Registers MCP request handlers (tools/list, tools/call, etc.)
 * and delegates to existing services (McpAggregator, PolicyEngine, etc.).
 *
 * This service is transport-agnostic — it is connected to transports
 * (StreamableHTTPServerTransport, SSEServerTransport) by the HTTP server.
 *
 * @see Issue #66
 */
@injectable()
export class McpProtocolServer implements IMcpProtocolServer {
  private server: Server;
  /** Per-request context set by the HTTP server before handling each request */
  private currentContext: McpRequestContext | null = null;

  constructor(
    @inject(TYPES.McpAggregator) private mcpAggregator: IMcpAggregator,
    @inject(TYPES.ServerManager) private serverManager: IServerManager,
    @inject(TYPES.BuiltinToolsService) private builtinToolsService: IBuiltinToolsService,
    @inject(TYPES.Logger) private logger: ILogger
  ) {
    this.server = new Server(
      { name: 'mcp-router', version: '1.0.0' },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupRequestHandlers();

    this.server.onerror = (error: Error) => {
      this.logger.error('MCP Protocol Server error', {
        error: error.message,
      });
    };
  }

  /**
   * Get the underlying MCP SDK Server instance.
   * Used by the HTTP server to connect transports.
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Create a new MCP SDK Server instance with the same handlers.
   * Used for SSE sessions which need a dedicated server per connection.
   */
  createSessionServer(): Server {
    const sessionServer = new Server(
      { name: 'mcp-router', version: '1.0.0' },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupRequestHandlersForServer(sessionServer);

    sessionServer.onerror = (error: Error) => {
      this.logger.error('MCP Protocol Server (session) error', {
        error: error.message,
      });
    };

    return sessionServer;
  }

  /**
   * Set the request context for the current request.
   * Must be called before each transport.handleRequest().
   */
  setRequestContext(context: McpRequestContext): void {
    this.currentContext = context;
  }

  /**
   * Clear the request context after handling.
   */
  clearRequestContext(): void {
    this.currentContext = null;
  }

  /**
   * Close the server and clean up.
   */
  async close(): Promise<void> {
    await this.server.close();
  }

  // ============================================================================
  // Request Handlers
  // ============================================================================

  private setupRequestHandlers(): void {
    this.setupRequestHandlersForServer(this.server);
  }

  private setupRequestHandlersForServer(server: Server): void {
    server.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.handleListTools();
    });

    server.setRequestHandler(CallToolRequestSchema, async (request: unknown) => {
      return this.handleCallTool(
        request as { params: { name: string; arguments?: Record<string, unknown> } }
      );
    });

    server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return this.handleListResources();
    });

    server.setRequestHandler(ReadResourceRequestSchema, async (request: unknown) => {
      return this.handleReadResource(
        request as { params: { uri: string } }
      );
    });

    server.setRequestHandler(ListPromptsRequestSchema, async () => {
      return this.handleListPrompts();
    });

    server.setRequestHandler(GetPromptRequestSchema, async (request: unknown) => {
      return this.handleGetPrompt(
        request as { params: { name: string; arguments?: Record<string, string> } }
      );
    });
  }

  /**
   * Handle tools/list — list all available tools across servers.
   * Includes built-in tools and supports project-scoped filtering.
   */
  private async handleListTools(): Promise<{ tools: unknown[] }> {
    const ctx = this.currentContext;
    if (!ctx) {
      this.logger.warn('tools/list called without request context');
      return { tools: [] };
    }

    try {
      let tools = await this.mcpAggregator.listTools(ctx.token.id);

      // Apply project-scoped filtering
      if (ctx.projectId) {
        const projectServers = this.serverManager.getServersByProject(ctx.projectId);
        const projectServerIds = new Set(projectServers.map(s => s.id));
        tools = tools.filter(tool => projectServerIds.has(tool.serverId));
      }

      // Add built-in tools (memory, etc.)
      const builtinTools = this.builtinToolsService.getTools();
      tools = [...builtinTools, ...tools];

      // Map to MCP protocol format
      const mcpTools = tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema,
      }));

      this.logger.debug('Listed tools', {
        count: mcpTools.length,
        projectId: ctx.projectId,
      });

      return { tools: mcpTools };
    } catch (error) {
      this.logger.error('Error listing tools', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { tools: [] };
    }
  }

  /**
   * Handle tools/call — execute a tool through the full pipeline.
   * Auth → Policy → Rate Limit → Aggregator → Audit
   */
  private async handleCallTool(request: {
    params: { name: string; arguments?: Record<string, unknown> };
  }): Promise<{ content: unknown[] }> {
    const ctx = this.currentContext;
    if (!ctx) {
      return { content: [{ type: 'text', text: 'Error: No request context' }] };
    }

    const toolName = request.params.name;
    const args = request.params.arguments ?? {};
    const startTime = Date.now();

    try {
      // Handle built-in tools
      if (this.builtinToolsService.isBuiltinTool(toolName)) {
        this.logger.debug('Executing built-in tool', { toolName, args });
        const builtinResult = await this.builtinToolsService.callTool(toolName, args);
        if (!builtinResult.success) {
          return {
            content: [{ type: 'text', text: `Error: ${builtinResult.error || 'Built-in tool execution failed'}` }],
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(builtinResult.result) }],
        };
      }

      // Find which server owns this tool by parsing the namespaced name
      const dotIndex = toolName.indexOf('.');
      if (dotIndex === -1) {
        return {
          content: [{ type: 'text', text: `Tool not found: ${toolName}` }],
        };
      }

      const serverNamespace = toolName.substring(0, dotIndex);
      const originalToolName = toolName.substring(dotIndex + 1);

      // Find server by namespace
      const servers = this.serverManager.getAllServers();
      const server = servers.find(s => {
        const safeName = s.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        return safeName === serverNamespace;
      });

      if (!server) {
        return {
          content: [{ type: 'text', text: `Server not found for tool: ${toolName}` }],
        };
      }

      // Project-scoped access check
      if (ctx.projectId) {
        const projectServers = this.serverManager.getServersByProject(ctx.projectId);
        const isInProject = projectServers.some(s => s.id === server.id);
        if (!isInProject) {
          return {
            content: [{ type: 'text', text: `Server ${server.name} is not in project ${ctx.projectId}` }],
          };
        }
      }

      // Execute through the aggregator (which handles rate limiting, policy, audit)
      const result = await this.mcpAggregator.callTool(
        ctx.token.id,
        server.id,
        originalToolName,
        args
      );

      const duration = Date.now() - startTime;

      if (result.error) {
        this.logger.warn('Tool call error', {
          toolName,
          serverId: server.id,
          error: result.error.message,
          duration,
        });
        return {
          content: [{ type: 'text', text: `Error: ${result.error.message}` }],
        };
      }

      this.logger.info('Tool call executed via MCP SDK', {
        toolName: originalToolName,
        serverId: server.id,
        duration,
      });

      // Format result as MCP content
      if (result.result && typeof result.result === 'object' && 'content' in (result.result as Record<string, unknown>)) {
        return result.result as { content: unknown[] };
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result.result) }],
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const message = error instanceof Error ? error.message : String(error);

      this.logger.error('Tool call failed', {
        toolName,
        error: message,
        duration,
      });

      return {
        content: [{ type: 'text', text: `Error: ${message}` }],
      };
    }
  }

  /**
   * Handle resources/list — list all resources from all running servers.
   */
  private async handleListResources(): Promise<{ resources: unknown[] }> {
    const ctx = this.currentContext;
    if (!ctx) {
      return { resources: [] };
    }

    try {
      const resources = await this.mcpAggregator.listAllResources(ctx.token.id);

      // Apply project-scoped filtering
      let filtered = resources;
      if (ctx.projectId) {
        const projectServers = this.serverManager.getServersByProject(ctx.projectId);
        const serverNames = new Set(
          projectServers.map(s =>
            s.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          )
        );
        filtered = resources.filter(resource => {
          const match = resource.uri.match(/^mcpr:\/\/([^/]+)\//);
          return match ? serverNames.has(match[1]!) : false;
        });
      }

      return {
        resources: filtered.map(r => ({
          uri: r.uri,
          name: r.name,
          description: r.description,
          mimeType: r.mimeType,
        })),
      };
    } catch (error) {
      this.logger.error('Error listing resources', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { resources: [] };
    }
  }

  /**
   * Handle resources/read — read a specific resource.
   */
  private async handleReadResource(request: {
    params: { uri: string };
  }): Promise<{ contents: unknown[] }> {
    const ctx = this.currentContext;
    if (!ctx) {
      return { contents: [{ type: 'text', text: 'Error: No request context' }] };
    }

    const uri = request.params.uri;

    try {
      // Parse namespaced URI: mcpr://server-name/original-uri
      const match = uri.match(/^mcpr:\/\/([^/]+)\/(.+)$/);
      if (!match) {
        return {
          contents: [{ type: 'text', text: `Invalid resource URI: ${uri}` }],
        };
      }

      const serverNamespace = match[1]!;
      const originalUri = match[2]!;

      // Find server by namespace
      const servers = this.serverManager.getAllServers();
      const server = servers.find(s => {
        const safeName = s.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        return safeName === serverNamespace;
      });

      if (!server) {
        return {
          contents: [{ type: 'text', text: `Server not found for URI: ${uri}` }],
        };
      }

      const content = await this.mcpAggregator.readResource(
        ctx.token.id,
        server.id,
        originalUri
      );

      return {
        contents: [{
          uri,
          mimeType: content.mimeType,
          text: content.text,
          blob: content.blob,
        }],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        contents: [{ type: 'text', text: `Error: ${message}` }],
      };
    }
  }

  /**
   * Handle prompts/list — list all prompts from all running servers.
   */
  private async handleListPrompts(): Promise<{ prompts: unknown[] }> {
    const ctx = this.currentContext;
    if (!ctx) {
      return { prompts: [] };
    }

    try {
      const prompts = await this.mcpAggregator.listAllPrompts(ctx.token.id);

      // Apply project-scoped filtering
      let filtered = prompts;
      if (ctx.projectId) {
        const projectServers = this.serverManager.getServersByProject(ctx.projectId);
        const serverNames = new Set(
          projectServers.map(s =>
            s.name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, '-')
              .replace(/^-|-$/g, '')
          )
        );
        filtered = prompts.filter(prompt => {
          const dotIndex = prompt.name.indexOf('.');
          if (dotIndex === -1) return false;
          return serverNames.has(prompt.name.substring(0, dotIndex));
        });
      }

      return {
        prompts: filtered.map(p => ({
          name: p.name,
          description: p.description,
          arguments: p.arguments,
        })),
      };
    } catch (error) {
      this.logger.error('Error listing prompts', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return { prompts: [] };
    }
  }

  /**
   * Handle prompts/get — get a specific prompt with arguments.
   */
  private async handleGetPrompt(request: {
    params: { name: string; arguments?: Record<string, string> };
  }): Promise<{ description?: string; messages: unknown[] }> {
    const ctx = this.currentContext;
    if (!ctx) {
      return {
        messages: [{ role: 'user', content: { type: 'text', text: 'Error: No request context' } }],
      };
    }

    const promptName = request.params.name;
    const args = request.params.arguments;

    try {
      // Parse namespaced prompt name: server-name.original-name
      const dotIndex = promptName.indexOf('.');
      if (dotIndex === -1) {
        return {
          messages: [{ role: 'user', content: { type: 'text', text: `Prompt not found: ${promptName}` } }],
        };
      }

      const serverNamespace = promptName.substring(0, dotIndex);
      const originalName = promptName.substring(dotIndex + 1);

      // Find server by namespace
      const servers = this.serverManager.getAllServers();
      const server = servers.find(s => {
        const safeName = s.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-|-$/g, '');
        return safeName === serverNamespace;
      });

      if (!server) {
        return {
          messages: [{ role: 'user', content: { type: 'text', text: `Server not found for prompt: ${promptName}` } }],
        };
      }

      const messages = await this.mcpAggregator.getPrompt(
        ctx.token.id,
        server.id,
        originalName,
        args
      );

      return {
        messages: messages.map(msg => ({
          role: msg.role,
          content: msg.content,
        })),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        messages: [{ role: 'user', content: { type: 'text', text: `Error: ${message}` } }],
      };
    }
  }
}
