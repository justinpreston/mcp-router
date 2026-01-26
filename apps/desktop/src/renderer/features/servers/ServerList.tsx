import { useEffect } from 'react';
import { useServerStore, selectServers, selectSelectedServer } from '@renderer/stores';
import { useElectronEvent } from '@renderer/hooks';
import { ServerCard } from './ServerCard';
import type { MCPServerInfo } from '@preload/api';

export interface ServerListProps {
  onServerSelect?: (server: MCPServerInfo) => void;
}

export function ServerList({ onServerSelect }: ServerListProps) {
  const servers = useServerStore(selectServers);
  const selectedServer = useServerStore(selectSelectedServer);
  const isLoading = useServerStore((state) => state.isLoading);
  const error = useServerStore((state) => state.error);
  const {
    fetchServers,
    selectServer,
    startServer,
    stopServer,
    removeServer,
    handleStatusChange,
  } = useServerStore();

  // Fetch servers on mount
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Listen for server status changes
  useElectronEvent<MCPServerInfo>('server:status-changed', handleStatusChange);

  const handleSelect = (server: MCPServerInfo) => {
    selectServer(server.id);
    onServerSelect?.(server);
  };

  if (isLoading && servers.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-muted-foreground">Loading servers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-32 items-center justify-center">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed">
        <p className="text-sm text-muted-foreground">
          No servers configured. Click &quot;Add Server&quot; to get started.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {servers.map((server) => (
        <ServerCard
          key={server.id}
          server={server}
          isSelected={selectedServer?.id === server.id}
          onSelect={handleSelect}
          onStart={startServer}
          onStop={stopServer}
          onDelete={removeServer}
        />
      ))}
    </div>
  );
}
