import { useEffect, useCallback } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { useServerStore, selectServers, selectSelectedServer } from '@renderer/stores';
import { useElectronEvent } from '@renderer/hooks';
import { ServerCard } from './ServerCard';
import type { MCPServerInfo } from '@preload/api';
import { GripVertical } from 'lucide-react';

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
    reorderServers,
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

  const handleDragEnd = useCallback(
    (result: DropResult) => {
      if (!result.destination) return;
      if (result.source.index === result.destination.index) return;

      reorderServers(result.source.index, result.destination.index);
    },
    [reorderServers]
  );

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
      <div className="flex h-32 items-center justify-center rounded-lg border border-dashed" data-testid="server-list">
        <p className="text-sm text-muted-foreground">
          No servers configured. Click &quot;Add Server&quot; to get started.
        </p>
      </div>
    );
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="server-list">
        {(provided) => (
          <div
            ref={provided.innerRef}
            {...provided.droppableProps}
            className="space-y-3"
            data-testid="server-list"
          >
            {servers.map((server, index) => (
              <Draggable key={server.id} draggableId={server.id} index={index}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.draggableProps}
                    className={`flex items-start gap-2 ${
                      snapshot.isDragging ? 'opacity-90 shadow-lg' : ''
                    }`}
                  >
                    <div
                      {...provided.dragHandleProps}
                      className="mt-4 cursor-grab rounded p-1 text-muted-foreground hover:bg-accent hover:text-accent-foreground active:cursor-grabbing"
                      data-testid="drag-handle"
                    >
                      <GripVertical className="h-5 w-5" />
                    </div>
                    <div className="flex-1">
                      <ServerCard
                        server={server}
                        isSelected={selectedServer?.id === server.id}
                        onSelect={handleSelect}
                        onStart={startServer}
                        onStop={stopServer}
                        onDelete={removeServer}
                      />
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}
