import { ipcMain, BrowserWindow } from 'electron';
import type { Container } from 'inversify';
import type { IServerManager, ILogger, MCPServer } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import type { MCPServerInfo, ServerAddConfig } from '@preload/api';

/**
 * Transform internal MCPServer to API-safe MCPServerInfo.
 */
function toServerInfo(server: MCPServer): MCPServerInfo {
  return {
    id: server.id,
    name: server.name,
    command: server.command,
    args: server.args,
    env: server.env,
    transport: server.transport,
    status: server.status,
    projectId: server.projectId,
    toolPermissions: server.toolPermissions,
    lastError: server.lastError,
    createdAt: server.createdAt,
    updatedAt: server.updatedAt,
  };
}

/**
 * Register IPC handlers for server management.
 */
export function registerServerHandlers(container: Container): void {
  const serverManager = container.get<IServerManager>(TYPES.ServerManager);
  const logger = container.get<ILogger>(TYPES.Logger);

  // List all servers
  ipcMain.handle('servers:list', async () => {
    logger.debug('IPC: servers:list');
    const servers = serverManager.getAllServers();
    return servers.map(toServerInfo);
  });

  // Get single server
  ipcMain.handle('servers:get', async (_event, id: string) => {
    logger.debug('IPC: servers:get', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid server ID');
    }

    const server = serverManager.getServer(id);
    return server ? toServerInfo(server) : null;
  });

  // Add new server
  ipcMain.handle('servers:add', async (_event, config: ServerAddConfig) => {
    logger.debug('IPC: servers:add', { name: config?.name });

    if (!config || typeof config !== 'object') {
      throw new Error('Invalid server configuration');
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Server name is required');
    }

    if (!config.command || typeof config.command !== 'string') {
      throw new Error('Server command is required');
    }

    const server = await serverManager.addServer({
      name: config.name,
      command: config.command,
      args: config.args ?? [],
      env: config.env,
      transport: config.transport ?? 'stdio',
      projectId: config.projectId,
      toolPermissions: config.toolPermissions ?? {},
    });

    return toServerInfo(server);
  });

  // Update server
  ipcMain.handle(
    'servers:update',
    async (_event, id: string, updates: Partial<ServerAddConfig>) => {
      logger.debug('IPC: servers:update', { id });

      if (!id || typeof id !== 'string') {
        throw new Error('Invalid server ID');
      }

      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid update data');
      }

      const server = await serverManager.updateServer(id, updates);
      return toServerInfo(server);
    }
  );

  // Remove server
  ipcMain.handle('servers:remove', async (_event, id: string) => {
    logger.debug('IPC: servers:remove', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid server ID');
    }

    await serverManager.removeServer(id);
  });

  // Start server
  ipcMain.handle('servers:start', async (event, id: string) => {
    logger.debug('IPC: servers:start', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid server ID');
    }

    await serverManager.startServer(id);

    // Emit status change event
    const server = serverManager.getServer(id);
    if (server) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.webContents.send('server:status-changed', toServerInfo(server));
      }
    }
  });

  // Stop server
  ipcMain.handle('servers:stop', async (event, id: string) => {
    logger.debug('IPC: servers:stop', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid server ID');
    }

    await serverManager.stopServer(id);

    // Emit status change event
    const server = serverManager.getServer(id);
    if (server) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.webContents.send('server:status-changed', toServerInfo(server));
      }
    }
  });

  // Restart server
  ipcMain.handle('servers:restart', async (event, id: string) => {
    logger.debug('IPC: servers:restart', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid server ID');
    }

    await serverManager.restartServer(id);

    // Emit status change event
    const server = serverManager.getServer(id);
    if (server) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.webContents.send('server:status-changed', toServerInfo(server));
      }
    }
  });
}
