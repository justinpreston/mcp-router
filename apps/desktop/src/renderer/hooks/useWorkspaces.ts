import { useCallback } from 'react';
import { useElectron } from './useElectron';
import type { WorkspaceInfo, WorkspaceAddConfig } from '@preload/api';

/**
 * Hook for workspace management operations.
 */
export function useWorkspaces() {
  const api = useElectron();

  const listWorkspaces = useCallback(async (): Promise<WorkspaceInfo[]> => {
    return api.workspaces.list();
  }, [api]);

  const getWorkspace = useCallback(
    async (id: string): Promise<WorkspaceInfo | null> => {
      return api.workspaces.get(id);
    },
    [api]
  );

  const createWorkspace = useCallback(
    async (config: WorkspaceAddConfig): Promise<WorkspaceInfo> => {
      return api.workspaces.create(config);
    },
    [api]
  );

  const updateWorkspace = useCallback(
    async (id: string, updates: Partial<WorkspaceAddConfig>): Promise<WorkspaceInfo> => {
      return api.workspaces.update(id, updates);
    },
    [api]
  );

  const deleteWorkspace = useCallback(
    async (id: string): Promise<void> => {
      return api.workspaces.delete(id);
    },
    [api]
  );

  const addServerToWorkspace = useCallback(
    async (workspaceId: string, serverId: string): Promise<void> => {
      return api.workspaces.addServer(workspaceId, serverId);
    },
    [api]
  );

  const removeServerFromWorkspace = useCallback(
    async (workspaceId: string, serverId: string): Promise<void> => {
      return api.workspaces.removeServer(workspaceId, serverId);
    },
    [api]
  );

  return {
    listWorkspaces,
    getWorkspace,
    createWorkspace,
    updateWorkspace,
    deleteWorkspace,
    addServerToWorkspace,
    removeServerFromWorkspace,
  };
}
