import { useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Badge,
  Button,
} from '@renderer/components/ui';
import type { MCPServerInfo } from '@preload/api';

export interface ServerCardProps {
  server: MCPServerInfo;
  isSelected?: boolean;
  onSelect?: (server: MCPServerInfo) => void;
  onStart?: (serverId: string) => void;
  onStop?: (serverId: string) => void;
  onDelete?: (serverId: string) => void;
}

export function ServerCard({
  server,
  isSelected = false,
  onSelect,
  onStart,
  onStop,
  onDelete,
}: ServerCardProps) {
  const handleSelect = useCallback(() => {
    onSelect?.(server);
  }, [server, onSelect]);

  const handleStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStart?.(server.id);
    },
    [server.id, onStart]
  );

  const handleStop = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onStop?.(server.id);
    },
    [server.id, onStop]
  );

  const handleDelete = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onDelete?.(server.id);
    },
    [server.id, onDelete]
  );

  const getStatusVariant = (status: MCPServerInfo['status']) => {
    switch (status) {
      case 'running':
        return 'success';
      case 'starting':
      case 'stopping':
        return 'warning';
      case 'error':
        return 'destructive';
      default:
        return 'secondary';
    }
  };

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-accent/50 ${
        isSelected ? 'ring-2 ring-primary' : ''
      }`}
      onClick={handleSelect}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-medium">{server.name}</span>
            <Badge variant={getStatusVariant(server.status)}>
              {server.status}
            </Badge>
          </div>
        </div>
        {server.description && (
          <p className="text-sm text-muted-foreground">{server.description}</p>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {server.transport === 'stdio' ? (
              <span>stdio: {server.command}</span>
            ) : (
              <span>http: {server.url}</span>
            )}
          </div>
          <div className="flex gap-2">
            {server.status === 'stopped' || server.status === 'error' ? (
              <Button size="sm" variant="outline" onClick={handleStart}>
                Start
              </Button>
            ) : server.status === 'running' ? (
              <Button size="sm" variant="outline" onClick={handleStop}>
                Stop
              </Button>
            ) : (
              <Button size="sm" variant="outline" disabled>
                {server.status === 'starting' ? 'Starting...' : 'Stopping...'}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive"
              onClick={handleDelete}
            >
              Delete
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
