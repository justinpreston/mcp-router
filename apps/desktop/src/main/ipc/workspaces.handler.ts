import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type { IWorkspaceService, ILogger, Workspace } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';

/**
 * API-safe workspace info type.
 */
export interface WorkspaceInfo {
  id: string;
  name: string;
  path: string;
  serverIds: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Workspace creation config.
 */
export interface WorkspaceAddConfig {
  name: string;
  path: string;
}

/**
 * Transform internal Workspace to API-safe WorkspaceInfo.
 */
function toWorkspaceInfo(workspace: Workspace): WorkspaceInfo {
  return {
    id: workspace.id,
    name: workspace.name,
    path: workspace.path,
    serverIds: workspace.serverIds,
    createdAt: workspace.createdAt,
    updatedAt: workspace.updatedAt,
  };
}

/**
 * Register IPC handlers for workspace management.
 */
export function registerWorkspaceHandlers(container: Container): void {
  const workspaceService = container.get<IWorkspaceService>(TYPES.WorkspaceService);
  const logger = container.get<ILogger>(TYPES.Logger);

  // List all workspaces
  ipcMain.handle('workspaces:list', async () => {
    logger.debug('IPC: workspaces:list');

    const workspaces = await workspaceService.getAllWorkspaces();
    return workspaces.map(toWorkspaceInfo);
  });

  // Get single workspace
  ipcMain.handle('workspaces:get', async (_event, id: string) => {
    logger.debug('IPC: workspaces:get', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid workspace ID');
    }

    const workspace = await workspaceService.getWorkspace(id);
    return workspace ? toWorkspaceInfo(workspace) : null;
  });

  // Create workspace
  ipcMain.handle('workspaces:create', async (_event, config: WorkspaceAddConfig) => {
    logger.debug('IPC: workspaces:create', { name: config?.name });

    if (!config || typeof config !== 'object') {
      throw new Error('Invalid workspace configuration');
    }

    if (!config.name || typeof config.name !== 'string') {
      throw new Error('Workspace name is required');
    }

    if (!config.path || typeof config.path !== 'string') {
      throw new Error('Workspace path is required');
    }

    const workspace = await workspaceService.createWorkspace(config.name, config.path);
    return toWorkspaceInfo(workspace);
  });

  // Update workspace
  ipcMain.handle(
    'workspaces:update',
    async (_event, id: string, updates: Partial<WorkspaceAddConfig>) => {
      logger.debug('IPC: workspaces:update', { id });

      if (!id || typeof id !== 'string') {
        throw new Error('Invalid workspace ID');
      }

      if (!updates || typeof updates !== 'object') {
        throw new Error('Invalid update data');
      }

      const workspace = await workspaceService.updateWorkspace(id, updates);
      return toWorkspaceInfo(workspace);
    }
  );

  // Delete workspace
  ipcMain.handle('workspaces:delete', async (_event, id: string) => {
    logger.debug('IPC: workspaces:delete', { id });

    if (!id || typeof id !== 'string') {
      throw new Error('Invalid workspace ID');
    }

    await workspaceService.deleteWorkspace(id);
  });

  // Add server to workspace
  ipcMain.handle(
    'workspaces:addServer',
    async (_event, workspaceId: string, serverId: string) => {
      logger.debug('IPC: workspaces:addServer', { workspaceId, serverId });

      if (!workspaceId || typeof workspaceId !== 'string') {
        throw new Error('Invalid workspace ID');
      }

      if (!serverId || typeof serverId !== 'string') {
        throw new Error('Invalid server ID');
      }

      await workspaceService.addServerToWorkspace(workspaceId, serverId);
    }
  );

  // Remove server from workspace
  ipcMain.handle(
    'workspaces:removeServer',
    async (_event, workspaceId: string, serverId: string) => {
      logger.debug('IPC: workspaces:removeServer', { workspaceId, serverId });

      if (!workspaceId || typeof workspaceId !== 'string') {
        throw new Error('Invalid workspace ID');
      }

      if (!serverId || typeof serverId !== 'string') {
        throw new Error('Invalid server ID');
      }

      await workspaceService.removeServerFromWorkspace(workspaceId, serverId);
    }
  );
}
