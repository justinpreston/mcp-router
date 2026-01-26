import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IMcpAggregator,
  IMcpClientFactory,
  IServerManager,
  ITokenValidator,
  IPolicyEngine,
  IApprovalQueue,
  IRateLimiter,
  IAuditService,
  ILogger,
  MCPTool,
  McpResponse,
  McpResource,
  McpResourceContent,
  McpPrompt,
  McpPromptMessage,
} from '@main/core/interfaces';

/**
 * MCP Aggregator service for routing tool calls to appropriate servers.
 * Implements policy enforcement, rate limiting, and approval workflows.
 *
 * Tool Naming Convention (Issue #18):
 * - Original tool: read_file
 * - Namespaced tool: filesystem-server.read_file
 * This prevents collisions when multiple servers have tools with the same name.
 */
@injectable()
export class McpAggregator implements IMcpAggregator {
  /** Cache for aggregated tools (server ID -> tools) */
  private toolCache: Map<string, MCPTool[]> = new Map();
  /** Last refresh time for tool cache */
  private lastCacheRefresh: number = 0;
  /** Cache TTL in milliseconds (5 minutes) */
  private readonly cacheTTL = 5 * 60 * 1000;

  /** Cache for resources (server ID -> resources) */
  private resourceCache: Map<string, McpResource[]> = new Map();
  /** Cache for prompts (server ID -> prompts) */
  private promptCache: Map<string, McpPrompt[]> = new Map();

  constructor(
    @inject(TYPES.McpClientFactory) private clientFactory: IMcpClientFactory,
    @inject(TYPES.ServerManager) private serverManager: IServerManager,
    @inject(TYPES.TokenValidator) private tokenValidator: ITokenValidator,
    @inject(TYPES.PolicyEngine) private policyEngine: IPolicyEngine,
    @inject(TYPES.ApprovalQueue) private approvalQueue: IApprovalQueue,
    @inject(TYPES.RateLimiter) private rateLimiter: IRateLimiter,
    @inject(TYPES.AuditService) private auditService: IAuditService,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async callTool(
    tokenId: string,
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<McpResponse> {
    const startTime = Date.now();

    try {
      // 1. Validate token
      const tokenResult = await this.tokenValidator.validateForServer(tokenId, serverId);
      if (!tokenResult.valid || !tokenResult.token) {
        return this.errorResponse(-32001, tokenResult.error ?? 'Invalid token');
      }

      const clientId = tokenResult.token.clientId;

      // 2. Check rate limit
      const rateKey = `tool:${clientId}:${serverId}`;
      const rateResult = this.rateLimiter.consume(rateKey);
      if (!rateResult.allowed) {
        await this.auditService.log({
          type: 'tool.call',
          clientId,
          serverId,
          toolName,
          success: false,
          metadata: { error: 'Rate limit exceeded' },
        });
        return this.errorResponse(-32029, 'Rate limit exceeded', {
          retryAfter: rateResult.retryAfter,
        });
      }

      // 3. Evaluate policy
      const policyResult = await this.policyEngine.evaluate({
        clientId,
        serverId,
        resourceType: 'tool',
        resourceName: toolName,
        metadata: { args },
      });

      if (policyResult.action === 'deny') {
        await this.auditService.log({
          type: 'tool.call',
          clientId,
          serverId,
          toolName,
          success: false,
          metadata: { error: 'Denied by policy', ruleId: policyResult.ruleId },
        });
        return this.errorResponse(-32003, 'Access denied by policy');
      }

      // 4. Handle approval if required
      if (policyResult.action === 'require_approval') {
        const approvalRequest = await this.approvalQueue.createRequest({
          clientId,
          serverId,
          toolName,
          toolArguments: args,
          policyRuleId: policyResult.ruleId ?? '',
        });

        try {
          const approvalResult = await this.approvalQueue.waitForApproval(approvalRequest.id);
          if (!approvalResult.approved) {
            await this.auditService.log({
              type: 'tool.call',
              clientId,
              serverId,
              toolName,
              success: false,
              metadata: { error: 'Approval rejected', reason: approvalResult.reason },
            });
            return this.errorResponse(-32004, 'Approval rejected');
          }
        } catch (error) {
          await this.auditService.log({
            type: 'tool.call',
            clientId,
            serverId,
            toolName,
            success: false,
            metadata: { error: 'Approval timeout' },
          });
          return this.errorResponse(-32005, 'Approval request timed out');
        }
      }

      // 5. Get server and verify it's running
      const server = this.serverManager.getServer(serverId);
      if (!server) {
        return this.errorResponse(-32002, 'Server not found');
      }

      if (server.status !== 'running') {
        return this.errorResponse(-32006, 'Server not running');
      }

      // 6. Execute tool call
      const result = await this.executeMcpToolCall(server.id, toolName, args);
      const duration = Date.now() - startTime;

      await this.auditService.log({
        type: 'tool.call',
        clientId,
        serverId,
        toolName,
        success: true,
        duration,
      });

      this.logger.info('Tool call executed', {
        toolName,
        serverId,
        duration,
      });

      return {
        result,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      await this.auditService.log({
        type: 'tool.error',
        serverId,
        toolName,
        success: false,
        duration,
        metadata: { error: errorMessage },
      });

      this.logger.error('Tool call failed', {
        toolName,
        serverId,
        error: errorMessage,
      });

      return this.errorResponse(-32000, errorMessage);
    }
  }

  async listTools(tokenId: string): Promise<MCPTool[]> {
    // Validate token
    const tokenResult = await this.tokenValidator.validate(tokenId);
    if (!tokenResult.valid || !tokenResult.token) {
      throw new Error(tokenResult.error ?? 'Invalid token');
    }

    // Check if cache is still valid
    const now = Date.now();
    const cacheValid = now - this.lastCacheRefresh < this.cacheTTL;

    if (!cacheValid) {
      this.logger.debug('Tool cache expired, refreshing');
      await this.refreshToolCache();
    }

    const allTools: MCPTool[] = [];
    const servers = this.serverManager.getRunningServers();

    for (const server of servers) {
      // Check if token has access to this server
      const serverAccess = await this.tokenValidator.validateForServer(tokenId, server.id);
      if (!serverAccess.valid) {
        continue;
      }

      // Get tools from cache or fetch
      let tools = this.toolCache.get(server.id);
      if (!tools) {
        try {
          tools = await this.serverManager.getServerTools(server.id);
          this.toolCache.set(server.id, tools);
        } catch (error) {
          this.logger.warn('Failed to list tools for server', {
            serverId: server.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          continue;
        }
      }

      // Add namespaced tools to result (Issue #18: tool aggregation with namespacing)
      const namespacedTools = tools.map(tool => this.namespaceTool(tool, server));
      allTools.push(...namespacedTools);
    }

    return allTools;
  }

  /**
   * Refresh the tool cache for all running servers.
   * Called when cache expires or when servers change.
   */
  async refreshToolCache(): Promise<void> {
    this.toolCache.clear();
    const servers = this.serverManager.getRunningServers();

    for (const server of servers) {
      try {
        const tools = await this.serverManager.getServerTools(server.id);
        this.toolCache.set(server.id, tools);
      } catch (error) {
        this.logger.warn('Failed to cache tools for server', {
          serverId: server.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.lastCacheRefresh = Date.now();
    this.logger.info('Tool cache refreshed', {
      serverCount: servers.length,
      cachedServers: this.toolCache.size,
    });
  }

  /**
   * Invalidate cache for a specific server.
   * Called when server connects/disconnects or tools change.
   */
  invalidateServerCache(serverId: string): void {
    this.toolCache.delete(serverId);
    this.logger.debug('Tool cache invalidated for server', { serverId });
  }

  /**
   * Apply namespace prefix to tool name to avoid collisions.
   * Format: serverName.originalToolName
   */
  private namespaceTool(tool: MCPTool, server: { id: string; name: string }): MCPTool {
    // Create a safe server name for namespacing (slug format)
    const safeServerName = server.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    return {
      ...tool,
      // Keep original name in tool.name for display
      name: `${safeServerName}.${tool.name}`,
      // Add metadata for original name and server
      serverId: server.id,
      serverName: server.name,
    };
  }

  /**
   * Parse a namespaced tool name into server and tool components.
   * Format: serverName.originalToolName -> { serverName, toolName }
   */
  parseNamespacedTool(namespacedName: string): { serverName: string; toolName: string } | null {
    const dotIndex = namespacedName.indexOf('.');
    if (dotIndex === -1) {
      return null;
    }
    return {
      serverName: namespacedName.substring(0, dotIndex),
      toolName: namespacedName.substring(dotIndex + 1),
    };
  }

  /**
   * Find a server by its namespaced name prefix.
   */
  findServerByNamespace(namespace: string): { id: string; name: string } | undefined {
    const servers = this.serverManager.getAllServers();
    return servers.find(s => {
      const safeServerName = s.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      return safeServerName === namespace;
    });
  }

  async listResources(tokenId: string, serverId: string): Promise<McpResource[]> {
    // Validate token for server
    const tokenResult = await this.tokenValidator.validateForServer(tokenId, serverId);
    if (!tokenResult.valid) {
      throw new Error(tokenResult.error ?? 'Invalid token');
    }

    const server = this.serverManager.getServer(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (server.status !== 'running') {
      throw new Error('Server must be running to list resources');
    }

    // Check cache first
    const cachedResources = this.resourceCache.get(serverId);
    if (cachedResources) {
      return cachedResources;
    }

    // Get or create MCP client for server
    const client = await this.getOrCreateClient(serverId);
    if (!client) {
      throw new Error('Failed to create MCP client');
    }

    try {
      const resources = await client.listResources();

      // Namespace resources with server info
      const namespacedResources = resources.map(resource => ({
        ...resource,
        uri: this.namespaceUri(resource.uri, server.name),
      }));

      this.resourceCache.set(serverId, namespacedResources);
      this.logger.debug('Listed resources from server', {
        serverId,
        count: resources.length,
      });

      return namespacedResources;
    } catch (error) {
      this.logger.error('Failed to list resources', {
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  async readResource(tokenId: string, serverId: string, uri: string): Promise<McpResourceContent> {
    // Validate token for server
    const tokenResult = await this.tokenValidator.validateForServer(tokenId, serverId);
    if (!tokenResult.valid) {
      throw new Error(tokenResult.error ?? 'Invalid token');
    }

    const server = this.serverManager.getServer(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (server.status !== 'running') {
      throw new Error('Server must be running to read resources');
    }

    // Get or create MCP client for server
    const client = await this.getOrCreateClient(serverId);
    if (!client) {
      throw new Error('Failed to create MCP client');
    }

    // Remove namespace prefix from URI if present
    const originalUri = this.parseNamespacedUri(uri) ?? uri;

    try {
      const content = await client.readResource(originalUri);
      this.logger.debug('Read resource from server', {
        serverId,
        uri: originalUri,
      });
      return content;
    } catch (error) {
      this.logger.error('Failed to read resource', {
        serverId,
        uri: originalUri,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * List prompts from a specific server.
   */
  async listPrompts(tokenId: string, serverId: string): Promise<McpPrompt[]> {
    // Validate token for server
    const tokenResult = await this.tokenValidator.validateForServer(tokenId, serverId);
    if (!tokenResult.valid) {
      throw new Error(tokenResult.error ?? 'Invalid token');
    }

    const server = this.serverManager.getServer(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (server.status !== 'running') {
      throw new Error('Server must be running to list prompts');
    }

    // Check cache first
    const cachedPrompts = this.promptCache.get(serverId);
    if (cachedPrompts) {
      return cachedPrompts;
    }

    // Get or create MCP client for server
    const client = await this.getOrCreateClient(serverId);
    if (!client) {
      throw new Error('Failed to create MCP client');
    }

    try {
      const prompts = await client.listPrompts();

      // Namespace prompts with server info
      const namespacedPrompts = prompts.map(prompt => ({
        ...prompt,
        name: this.namespacePromptName(prompt.name, server.name),
      }));

      this.promptCache.set(serverId, namespacedPrompts);
      this.logger.debug('Listed prompts from server', {
        serverId,
        count: prompts.length,
      });

      return namespacedPrompts;
    } catch (error) {
      this.logger.error('Failed to list prompts', {
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get a prompt with optional arguments.
   */
  async getPrompt(
    tokenId: string,
    serverId: string,
    promptName: string,
    args?: Record<string, string>
  ): Promise<McpPromptMessage[]> {
    // Validate token for server
    const tokenResult = await this.tokenValidator.validateForServer(tokenId, serverId);
    if (!tokenResult.valid) {
      throw new Error(tokenResult.error ?? 'Invalid token');
    }

    const server = this.serverManager.getServer(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (server.status !== 'running') {
      throw new Error('Server must be running to get prompts');
    }

    // Get or create MCP client for server
    const client = await this.getOrCreateClient(serverId);
    if (!client) {
      throw new Error('Failed to create MCP client');
    }

    // Remove namespace prefix from prompt name if present
    const originalName = this.parseNamespacedPromptName(promptName) ?? promptName;

    try {
      const messages = await client.getPrompt(originalName, args);
      this.logger.debug('Got prompt from server', {
        serverId,
        promptName: originalName,
        messageCount: messages.length,
      });
      return messages;
    } catch (error) {
      this.logger.error('Failed to get prompt', {
        serverId,
        promptName: originalName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * List all prompts from all running servers.
   */
  async listAllPrompts(tokenId: string): Promise<McpPrompt[]> {
    // Validate token
    const tokenResult = await this.tokenValidator.validate(tokenId);
    if (!tokenResult.valid || !tokenResult.token) {
      throw new Error(tokenResult.error ?? 'Invalid token');
    }

    const allPrompts: McpPrompt[] = [];
    const servers = this.serverManager.getRunningServers();

    for (const server of servers) {
      // Check if token has access to this server
      const serverAccess = await this.tokenValidator.validateForServer(tokenId, server.id);
      if (!serverAccess.valid) {
        continue;
      }

      try {
        const prompts = await this.listPrompts(tokenId, server.id);
        allPrompts.push(...prompts);
      } catch (error) {
        this.logger.warn('Failed to list prompts for server', {
          serverId: server.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return allPrompts;
  }

  /**
   * List all resources from all running servers.
   */
  async listAllResources(tokenId: string): Promise<McpResource[]> {
    // Validate token
    const tokenResult = await this.tokenValidator.validate(tokenId);
    if (!tokenResult.valid || !tokenResult.token) {
      throw new Error(tokenResult.error ?? 'Invalid token');
    }

    const allResources: McpResource[] = [];
    const servers = this.serverManager.getRunningServers();

    for (const server of servers) {
      // Check if token has access to this server
      const serverAccess = await this.tokenValidator.validateForServer(tokenId, server.id);
      if (!serverAccess.valid) {
        continue;
      }

      try {
        const resources = await this.listResources(tokenId, server.id);
        allResources.push(...resources);
      } catch (error) {
        this.logger.warn('Failed to list resources for server', {
          serverId: server.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return allResources;
  }

  /**
   * Create an error response.
   */
  private errorResponse(code: number, message: string, data?: unknown): McpResponse {
    return {
      error: {
        code,
        message,
        data,
      },
    };
  }

  /**
   * Execute an MCP tool call via the client factory.
   */
  private async executeMcpToolCall(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const client = await this.getOrCreateClient(serverId);
    if (!client) {
      throw new Error('Failed to create MCP client');
    }

    return client.callTool(toolName, args);
  }

  /**
   * Get or create an MCP client for a server.
   * Ensures the client is connected before returning.
   */
  private async getOrCreateClient(serverId: string): Promise<ReturnType<typeof this.clientFactory.getClient>> {
    const server = this.serverManager.getServer(serverId);
    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    let client = this.clientFactory.getClient(serverId);

    if (!client) {
      client = this.clientFactory.createClient(server);
    }

    if (!client.isConnected()) {
      await client.connect();
    }

    return client;
  }

  /**
   * Namespace a resource URI with server name prefix.
   */
  private namespaceUri(uri: string, serverName: string): string {
    const safeServerName = serverName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `mcpr://${safeServerName}/${uri}`;
  }

  /**
   * Parse a namespaced URI to extract the original URI.
   */
  private parseNamespacedUri(uri: string): string | null {
    const match = uri.match(/^mcpr:\/\/[^/]+\/(.+)$/);
    return match?.[1] ?? null;
  }

  /**
   * Namespace a prompt name with server name prefix.
   */
  private namespacePromptName(name: string, serverName: string): string {
    const safeServerName = serverName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    return `${safeServerName}.${name}`;
  }

  /**
   * Parse a namespaced prompt name to extract the original name.
   */
  private parseNamespacedPromptName(name: string): string | null {
    const dotIndex = name.indexOf('.');
    if (dotIndex === -1) {
      return null;
    }
    return name.substring(dotIndex + 1);
  }
}
