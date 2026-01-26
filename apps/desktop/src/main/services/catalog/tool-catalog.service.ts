import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IToolCatalog,
  IServerManager,
  ILogger,
  CatalogTool,
} from '@main/core/interfaces';

/**
 * Tool catalog service for managing and searching MCP tools.
 * Provides a unified view of all tools across all servers.
 */
@injectable()
export class ToolCatalogService implements IToolCatalog {
  private toolCache: Map<string, CatalogTool[]> = new Map();
  private lastRefresh: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor(
    @inject(TYPES.ServerManager) private serverManager: IServerManager,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  async getAllTools(): Promise<CatalogTool[]> {
    await this.refreshIfNeeded();

    const allTools: CatalogTool[] = [];
    for (const tools of this.toolCache.values()) {
      allTools.push(...tools);
    }

    return allTools;
  }

  async getToolsByServer(serverId: string): Promise<CatalogTool[]> {
    await this.refreshIfNeeded();
    return this.toolCache.get(serverId) ?? [];
  }

  async searchTools(query: string): Promise<CatalogTool[]> {
    const allTools = await this.getAllTools();
    const queryLower = query.toLowerCase();

    // Simple text search with BM25-style scoring
    return allTools
      .map(tool => ({
        tool,
        score: this.calculateSearchScore(tool, queryLower),
      }))
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ tool }) => tool);
  }

  async enableTool(serverId: string, toolName: string): Promise<void> {
    const tools = this.toolCache.get(serverId);
    if (tools) {
      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        tool.enabled = true;
        this.logger.info('Tool enabled', { serverId, toolName });
      }
    }
  }

  async disableTool(serverId: string, toolName: string): Promise<void> {
    const tools = this.toolCache.get(serverId);
    if (tools) {
      const tool = tools.find(t => t.name === toolName);
      if (tool) {
        tool.enabled = false;
        this.logger.info('Tool disabled', { serverId, toolName });
      }
    }
  }

  async isToolEnabled(serverId: string, toolName: string): Promise<boolean> {
    const tools = this.toolCache.get(serverId);
    if (tools) {
      const tool = tools.find(t => t.name === toolName);
      return tool?.enabled ?? true;
    }
    return true;
  }

  async refreshCatalog(): Promise<void> {
    this.logger.debug('Refreshing tool catalog');
    const servers = this.serverManager.getRunningServers();

    for (const server of servers) {
      try {
        const tools = await this.serverManager.getServerTools(server.id);
        const catalogTools: CatalogTool[] = tools.map(tool => ({
          ...tool,
          enabled: server.toolPermissions[tool.name] !== false,
          usageCount: 0,
        }));
        this.toolCache.set(server.id, catalogTools);
      } catch (error) {
        this.logger.warn('Failed to get tools for server', {
          serverId: server.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.lastRefresh = Date.now();
    this.logger.debug('Tool catalog refreshed', {
      serverCount: servers.length,
      toolCount: Array.from(this.toolCache.values()).flat().length,
    });
  }

  /**
   * Refresh cache if it's stale.
   */
  private async refreshIfNeeded(): Promise<void> {
    if (Date.now() - this.lastRefresh > this.CACHE_TTL) {
      await this.refreshCatalog();
    }
  }

  /**
   * Calculate search relevance score for a tool.
   */
  private calculateSearchScore(tool: CatalogTool, query: string): number {
    let score = 0;

    // Exact name match
    if (tool.name.toLowerCase() === query) {
      score += 10;
    }
    // Name contains query
    else if (tool.name.toLowerCase().includes(query)) {
      score += 5;
    }

    // Description match
    if (tool.description) {
      const descLower = tool.description.toLowerCase();
      if (descLower.includes(query)) {
        score += 2;
      }
    }

    // Word matching
    const queryWords = query.split(/\s+/);
    const nameWords = tool.name.toLowerCase().split(/[-_]/);

    for (const qWord of queryWords) {
      for (const nWord of nameWords) {
        if (nWord.startsWith(qWord)) {
          score += 1;
        }
      }
    }

    return score;
  }
}
