import { useEffect } from 'react';
import { useServerStore } from '@renderer/stores';
import { useElectronEvent } from '@renderer/hooks';
import { ServerCard } from '@renderer/features/servers';
import { Skeleton } from '@renderer/components/ui';
import type { MCPServerInfo } from '@preload/api';

export interface ServerListSectionProps {
  servers: MCPServerInfo[];
  onServerSelect?: (server: MCPServerInfo) => void;
}

export function ServerListSection({
  servers,
  onServerSelect,
}: ServerListSectionProps) {
  const selectedServer = useServerStore((state) =>
    state.selectedServerId
      ? state.servers.find((s) => s.id === state.selectedServerId)
      : null
  );
  const isLoading = useServerStore((state) => state.isLoading);
  const error = useServerStore((state) => state.error);
  const { fetchServers, selectServer, startServer, stopServer, removeServer } =
    useServerStore();

  // Fetch servers on mount
  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  // Listen for server status changes
  useElectronEvent<MCPServerInfo>('server:status-changed', (server) => {
    useServerStore.getState().handleStatusChange(server);
  });

  const handleSelect = (server: MCPServerInfo) => {
    selectServer(server.id);
    onServerSelect?.(server);
  };

  // Loading skeleton
  if (isLoading && servers.length === 0) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="rounded-lg border p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-8 w-20" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex h-32 items-center justify-center rounded-lg border border-destructive/50 bg-destructive/10">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  // Empty state
  if (servers.length === 0) {
    return (
      <div data-testid="server-list">
        <div className="flex h-48 flex-col items-center justify-center rounded-lg border border-dashed" data-testid="empty-server-list">
          <div className="text-center">
            <p className="text-lg font-medium text-muted-foreground">
              No servers found
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Add a server to get started or adjust your filters.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="server-list">
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
