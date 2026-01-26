import { ipcMain, BrowserWindow } from 'electron';
import type { Container } from 'inversify';
import type { IServerManager, ILogger, MCPServer } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import type { MCPServerInfo } from '@preload/api';
import {
  ServerId,
  ServerCreateSchema,
  ServerUpdateSchema,
  validateInput,
} from './validation-schemas';

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
  ipcMain.handle('servers:get', async (_event, id: unknown) => {
    const validId = validateInput(ServerId, id);
    logger.debug('IPC: servers:get', { id: validId });

    const server = serverManager.getServer(validId);
    return server ? toServerInfo(server) : null;
  });

  // Add new server
  ipcMain.handle('servers:add', async (_event, config: unknown) => {
    const validConfig = validateInput(ServerCreateSchema, config);
    logger.debug('IPC: servers:add', { name: validConfig.name });

    const server = await serverManager.addServer({
      name: validConfig.name,
      command: validConfig.command,
      args: validConfig.args ?? [],
      env: validConfig.env,
      transport: validConfig.type ?? 'stdio',
      projectId: validConfig.workspaceId,
      toolPermissions: {},
    });

    return toServerInfo(server);
  });

  // Update server
  ipcMain.handle(
    'servers:update',
    async (_event, id: unknown, updates: unknown) => {
      const validId = validateInput(ServerId, id);
      const validUpdates = validateInput(ServerUpdateSchema.omit({ id: true }), updates);
      logger.debug('IPC: servers:update', { id: validId });

      const server = await serverManager.updateServer(validId, validUpdates);
      return toServerInfo(server);
    }
  );

  // Remove server
  ipcMain.handle('servers:remove', async (_event, id: unknown) => {
    const validId = validateInput(ServerId, id);
    logger.debug('IPC: servers:remove', { id: validId });

    await serverManager.removeServer(validId);
  });

  // Start server
  ipcMain.handle('servers:start', async (event, id: unknown) => {
    const validId = validateInput(ServerId, id);
    logger.debug('IPC: servers:start', { id: validId });

    await serverManager.startServer(validId);

    // Emit status change event
    const server = serverManager.getServer(validId);
    if (server) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.webContents.send('server:status-changed', toServerInfo(server));
      }
    }
  });

  // Stop server
  ipcMain.handle('servers:stop', async (event, id: unknown) => {
    const validId = validateInput(ServerId, id);
    logger.debug('IPC: servers:stop', { id: validId });

    await serverManager.stopServer(validId);

    // Emit status change event
    const server = serverManager.getServer(validId);
    if (server) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.webContents.send('server:status-changed', toServerInfo(server));
      }
    }
  });

  // Restart server
  ipcMain.handle('servers:restart', async (event, id: unknown) => {
    const validId = validateInput(ServerId, id);
    logger.debug('IPC: servers:restart', { id: validId });

    await serverManager.restartServer(validId);

    // Emit status change event
    const server = serverManager.getServer(validId);
    if (server) {
      const window = BrowserWindow.fromWebContents(event.sender);
      if (window) {
        window.webContents.send('server:status-changed', toServerInfo(server));
      }
    }
  });
}
