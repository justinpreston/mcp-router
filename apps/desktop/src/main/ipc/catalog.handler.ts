import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type { IToolCatalog, ILogger, CatalogTool } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';

/**
 * API-safe catalog tool info type.
 */
export interface CatalogToolInfo {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  serverId: string;
  serverName: string;
  enabled: boolean;
  lastUsedAt?: number;
  usageCount: number;
  avgDuration?: number;
}

/**
 * Transform internal CatalogTool to API-safe CatalogToolInfo.
 */
function toCatalogToolInfo(tool: CatalogTool): CatalogToolInfo {
  return {
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    serverId: tool.serverId,
    serverName: tool.serverName,
    enabled: tool.enabled,
    lastUsedAt: tool.lastUsedAt,
    usageCount: tool.usageCount,
    avgDuration: tool.avgDuration,
  };
}

/**
 * Register IPC handlers for tool catalog.
 */
export function registerCatalogHandlers(container: Container): void {
  const toolCatalog = container.get<IToolCatalog>(TYPES.ToolCatalog);
  const logger = container.get<ILogger>(TYPES.Logger);

  // Get all tools
  ipcMain.handle('catalog:listTools', async () => {
    logger.debug('IPC: catalog:listTools');

    const tools = await toolCatalog.getAllTools();
    return tools.map(toCatalogToolInfo);
  });

  // Get tools by server
  ipcMain.handle('catalog:getToolsByServer', async (_event, serverId: string) => {
    logger.debug('IPC: catalog:getToolsByServer', { serverId });

    if (!serverId || typeof serverId !== 'string') {
      throw new Error('Invalid server ID');
    }

    const tools = await toolCatalog.getToolsByServer(serverId);
    return tools.map(toCatalogToolInfo);
  });

  // Search tools
  ipcMain.handle('catalog:searchTools', async (_event, query: string) => {
    logger.debug('IPC: catalog:searchTools', { query });

    if (!query || typeof query !== 'string') {
      throw new Error('Search query is required');
    }

    const tools = await toolCatalog.searchTools(query);
    return tools.map(toCatalogToolInfo);
  });

  // Enable tool
  ipcMain.handle(
    'catalog:enableTool',
    async (_event, serverId: string, toolName: string) => {
      logger.debug('IPC: catalog:enableTool', { serverId, toolName });

      if (!serverId || typeof serverId !== 'string') {
        throw new Error('Invalid server ID');
      }

      if (!toolName || typeof toolName !== 'string') {
        throw new Error('Invalid tool name');
      }

      await toolCatalog.enableTool(serverId, toolName);
    }
  );

  // Disable tool
  ipcMain.handle(
    'catalog:disableTool',
    async (_event, serverId: string, toolName: string) => {
      logger.debug('IPC: catalog:disableTool', { serverId, toolName });

      if (!serverId || typeof serverId !== 'string') {
        throw new Error('Invalid server ID');
      }

      if (!toolName || typeof toolName !== 'string') {
        throw new Error('Invalid tool name');
      }

      await toolCatalog.disableTool(serverId, toolName);
    }
  );

  // Check if tool is enabled
  ipcMain.handle(
    'catalog:isToolEnabled',
    async (_event, serverId: string, toolName: string) => {
      logger.debug('IPC: catalog:isToolEnabled', { serverId, toolName });

      if (!serverId || typeof serverId !== 'string') {
        throw new Error('Invalid server ID');
      }

      if (!toolName || typeof toolName !== 'string') {
        throw new Error('Invalid tool name');
      }

      return toolCatalog.isToolEnabled(serverId, toolName);
    }
  );

  // Refresh catalog
  ipcMain.handle('catalog:refresh', async () => {
    logger.debug('IPC: catalog:refresh');

    await toolCatalog.refreshCatalog();
  });
}
