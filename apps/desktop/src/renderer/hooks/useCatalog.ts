import { useCallback } from 'react';
import { useElectron } from './useElectron';
import type { CatalogToolInfo } from '@preload/api';

/**
 * Hook for tool catalog operations.
 */
export function useCatalog() {
  const api = useElectron();

  const listTools = useCallback(async (): Promise<CatalogToolInfo[]> => {
    return api.catalog.listTools();
  }, [api]);

  const getToolsByServer = useCallback(
    async (serverId: string): Promise<CatalogToolInfo[]> => {
      return api.catalog.getToolsByServer(serverId);
    },
    [api]
  );

  const searchTools = useCallback(
    async (query: string): Promise<CatalogToolInfo[]> => {
      return api.catalog.searchTools(query);
    },
    [api]
  );

  const enableTool = useCallback(
    async (serverId: string, toolName: string): Promise<void> => {
      return api.catalog.enableTool(serverId, toolName);
    },
    [api]
  );

  const disableTool = useCallback(
    async (serverId: string, toolName: string): Promise<void> => {
      return api.catalog.disableTool(serverId, toolName);
    },
    [api]
  );

  const isToolEnabled = useCallback(
    async (serverId: string, toolName: string): Promise<boolean> => {
      return api.catalog.isToolEnabled(serverId, toolName);
    },
    [api]
  );

  const refreshCatalog = useCallback(async (): Promise<void> => {
    return api.catalog.refresh();
  }, [api]);

  return {
    listTools,
    getToolsByServer,
    searchTools,
    enableTool,
    disableTool,
    isToolEnabled,
    refreshCatalog,
  };
}
