import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IToolCatalog,
  IServerManager,
  ILogger,
  CatalogTool,
  ToolSearchResult,
} from '@main/core/interfaces';
import type { ISearchProvider } from './bm25-search.provider';

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
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.BM25SearchProvider) private searchProvider: ISearchProvider
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
    const results = await this.searchToolsWithScore(query);
    return results.map(r => r.tool);
  }

  async searchToolsWithScore(query: string, limit: number = 20): Promise<ToolSearchResult[]> {
    await this.refreshIfNeeded();
    return this.searchProvider.search(query, limit);
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

    // Rebuild BM25 search index with all tools
    const allTools = Array.from(this.toolCache.values()).flat();
    this.searchProvider.index(allTools);

    this.lastRefresh = Date.now();
    this.logger.debug('Tool catalog refreshed', {
      serverCount: servers.length,
      toolCount: allTools.length,
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
}
