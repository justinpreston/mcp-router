import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Badge,
  Button,
} from '@renderer/components/ui';
import type { MCPServerInfo } from '@preload/api';

export interface ServerDetailsProps {
  server: MCPServerInfo | null;
  onStart?: (serverId: string) => void;
  onStop?: (serverId: string) => void;
  onDelete?: (serverId: string) => void;
}

export function ServerDetails({
  server,
  onStart,
  onStop,
  onDelete,
}: ServerDetailsProps) {
  if (!server) {
    return (
      <Card>
        <CardContent className="flex h-64 items-center justify-center">
          <p className="text-sm text-muted-foreground">
            Select a server to view details
          </p>
        </CardContent>
      </Card>
    );
  }

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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {server.name}
              <Badge variant={getStatusVariant(server.status)}>
                {server.status}
              </Badge>
            </CardTitle>
            {server.description && (
              <CardDescription>{server.description}</CardDescription>
            )}
          </div>
          <div className="flex gap-2">
            {server.status === 'stopped' || server.status === 'error' ? (
              <Button onClick={() => onStart?.(server.id)}>Start</Button>
            ) : server.status === 'running' ? (
              <Button variant="outline" onClick={() => onStop?.(server.id)}>
                Stop
              </Button>
            ) : (
              <Button disabled>
                {server.status === 'starting' ? 'Starting...' : 'Stopping...'}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Connection Info */}
        <section>
          <h3 className="mb-3 text-sm font-medium">Connection</h3>
          <div className="space-y-2 rounded-lg bg-muted p-3">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Transport</span>
              <span className="font-mono">{server.transport}</span>
            </div>
            {server.transport === 'stdio' ? (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Command</span>
                  <span className="font-mono">{server.command}</span>
                </div>
                {server.args && server.args.length > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Arguments</span>
                    <span className="font-mono">{server.args.join(' ')}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">URL</span>
                <span className="font-mono">{server.url}</span>
              </div>
            )}
          </div>
        </section>

        {/* Tools */}
        {server.tools && server.tools.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-medium">
              Available Tools ({server.tools.length})
            </h3>
            <div className="space-y-2">
              {server.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="rounded-lg border p-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-sm">{tool.name}</span>
                    {server.toolPermissions?.[tool.name] !== undefined && (
                      <Badge
                        variant={
                          server.toolPermissions[tool.name]
                            ? 'success'
                            : 'destructive'
                        }
                      >
                        {server.toolPermissions[tool.name]
                          ? 'Allowed'
                          : 'Denied'}
                      </Badge>
                    )}
                  </div>
                  {tool.description && (
                    <p className="mt-1 text-sm text-muted-foreground">
                      {tool.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Resources */}
        {server.resources && server.resources.length > 0 && (
          <section>
            <h3 className="mb-3 text-sm font-medium">
              Resources ({server.resources.length})
            </h3>
            <div className="space-y-2">
              {server.resources.map((resource) => (
                <div
                  key={resource.uri}
                  className="rounded-lg border p-3"
                >
                  <span className="font-mono text-sm">{resource.name}</span>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {resource.uri}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Timestamps */}
        <section>
          <h3 className="mb-3 text-sm font-medium">Metadata</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Server ID</span>
              <span className="font-mono text-xs">{server.id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Created</span>
              <span>{new Date(server.createdAt).toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Updated</span>
              <span>{new Date(server.updatedAt).toLocaleString()}</span>
            </div>
          </div>
        </section>

        {/* Delete Button */}
        <div className="pt-4 border-t">
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive"
            onClick={() => onDelete?.(server.id)}
          >
            Delete Server
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
