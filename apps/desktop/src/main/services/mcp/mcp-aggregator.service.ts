import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IMcpAggregator,
  IServerManager,
  ITokenValidator,
  IPolicyEngine,
  IApprovalQueue,
  IRateLimiter,
  IAuditService,
  ILogger,
  MCPTool,
  McpResponse,
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

  constructor(
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
      // TODO: Implement actual MCP protocol communication
      // For now, return a stub response
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
        result: {
          content: [
            {
              type: 'text',
              text: 'Tool execution not yet implemented',
            },
          ],
        },
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

  async listResources(tokenId: string, serverId: string): Promise<unknown[]> {
    // Validate token for server
    const tokenResult = await this.tokenValidator.validateForServer(tokenId, serverId);
    if (!tokenResult.valid) {
      throw new Error(tokenResult.error ?? 'Invalid token');
    }

    // TODO: Implement MCP resource listing
    return [];
  }

  async readResource(tokenId: string, serverId: string, _uri: string): Promise<unknown> {
    // Validate token for server
    const tokenResult = await this.tokenValidator.validateForServer(tokenId, serverId);
    if (!tokenResult.valid) {
      throw new Error(tokenResult.error ?? 'Invalid token');
    }

    // TODO: Implement MCP resource reading
    return null;
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
}
