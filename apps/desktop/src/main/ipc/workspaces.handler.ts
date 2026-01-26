import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type { IWorkspaceService, ILogger, Workspace } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import {
  WorkspaceId,
  WorkspaceCreateSchema,
  WorkspaceUpdateSchema,
  ServerId,
  validateInput,
} from './validation-schemas';

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
  ipcMain.handle('workspaces:get', async (_event, id: unknown) => {
    const validId = validateInput(WorkspaceId, id);
    logger.debug('IPC: workspaces:get', { id: validId });

    const workspace = await workspaceService.getWorkspace(validId);
    return workspace ? toWorkspaceInfo(workspace) : null;
  });

  // Create workspace
  ipcMain.handle('workspaces:create', async (_event, config: unknown) => {
    const validConfig = validateInput(WorkspaceCreateSchema, config);
    logger.debug('IPC: workspaces:create', { name: validConfig.name });

    const workspace = await workspaceService.createWorkspace(
      validConfig.name,
      validConfig.rootPath ?? ''
    );
    return toWorkspaceInfo(workspace);
  });

  // Update workspace
  ipcMain.handle(
    'workspaces:update',
    async (_event, id: unknown, updates: unknown) => {
      const validId = validateInput(WorkspaceId, id);
      const validUpdates = validateInput(WorkspaceUpdateSchema.omit({ id: true }), updates);
      logger.debug('IPC: workspaces:update', { id: validId });

      const workspace = await workspaceService.updateWorkspace(validId, validUpdates);
      return toWorkspaceInfo(workspace);
    }
  );

  // Delete workspace
  ipcMain.handle('workspaces:delete', async (_event, id: unknown) => {
    const validId = validateInput(WorkspaceId, id);
    logger.debug('IPC: workspaces:delete', { id: validId });

    await workspaceService.deleteWorkspace(validId);
  });

  // Add server to workspace
  ipcMain.handle(
    'workspaces:addServer',
    async (_event, workspaceId: unknown, serverId: unknown) => {
      const validWorkspaceId = validateInput(WorkspaceId, workspaceId);
      const validServerId = validateInput(ServerId, serverId);
      logger.debug('IPC: workspaces:addServer', { workspaceId: validWorkspaceId, serverId: validServerId });

      await workspaceService.addServerToWorkspace(validWorkspaceId, validServerId);
    }
  );

  // Remove server from workspace
  ipcMain.handle(
    'workspaces:removeServer',
    async (_event, workspaceId: unknown, serverId: unknown) => {
      const validWorkspaceId = validateInput(WorkspaceId, workspaceId);
      const validServerId = validateInput(ServerId, serverId);
      logger.debug('IPC: workspaces:removeServer', { workspaceId: validWorkspaceId, serverId: validServerId });

      await workspaceService.removeServerFromWorkspace(validWorkspaceId, validServerId);
    }
  );
}
