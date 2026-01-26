import { useCallback } from 'react';
import { useElectron, useElectronEvent } from './useElectron';
import type { MCPServerInfo, ServerAddConfig } from '@preload/api';

/**
 * Hook for server management operations.
 */
export function useServers() {
  const api = useElectron();

  const listServers = useCallback(async (): Promise<MCPServerInfo[]> => {
    return api.servers.list();
  }, [api]);

  const getServer = useCallback(
    async (id: string): Promise<MCPServerInfo | null> => {
      return api.servers.get(id);
    },
    [api]
  );

  const addServer = useCallback(
    async (config: ServerAddConfig): Promise<MCPServerInfo> => {
      return api.servers.add(config);
    },
    [api]
  );

  const updateServer = useCallback(
    async (id: string, updates: Partial<ServerAddConfig>): Promise<MCPServerInfo> => {
      return api.servers.update(id, updates);
    },
    [api]
  );

  const removeServer = useCallback(
    async (id: string): Promise<void> => {
      return api.servers.remove(id);
    },
    [api]
  );

  const startServer = useCallback(
    async (id: string): Promise<void> => {
      return api.servers.start(id);
    },
    [api]
  );

  const stopServer = useCallback(
    async (id: string): Promise<void> => {
      return api.servers.stop(id);
    },
    [api]
  );

  const restartServer = useCallback(
    async (id: string): Promise<void> => {
      return api.servers.restart(id);
    },
    [api]
  );

  return {
    listServers,
    getServer,
    addServer,
    updateServer,
    removeServer,
    startServer,
    stopServer,
    restartServer,
  };
}

/**
 * Hook to subscribe to server status changes.
 */
export function useServerStatusChange(callback: (server: MCPServerInfo) => void): void {
  useElectronEvent('server:status-changed', callback);
}

/**
 * Hook to subscribe to server errors.
 */
export function useServerError(
  callback: (error: { serverId: string; error: string }) => void
): void {
  useElectronEvent('server:error', callback);
}
