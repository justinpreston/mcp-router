import { useCallback } from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Badge,
  Button,
} from '@renderer/components/ui';
import type { ClientAppInfo, ClientMCPServerConfigInfo } from '@preload/api';
import { 
  DownloadCloud, 
  UploadCloud, 
  CheckCircle, 
  XCircle,
  Folder,
} from 'lucide-react';

export interface ClientCardProps {
  client: ClientAppInfo;
  isSelected?: boolean;
  servers?: Record<string, ClientMCPServerConfigInfo> | null;
  isSyncing?: boolean;
  onSelect?: (client: ClientAppInfo) => void;
  onImport?: (clientId: string) => void;
  onExport?: (clientId: string) => void;
}

const clientIcons: Record<string, string> = {
  claude: '🤖',
  cursor: '⚡',
  windsurf: '🏄',
  vscode: '💻',
  cline: '📝',
};

export function ClientCard({
  client,
  isSelected = false,
  servers,
  isSyncing = false,
  onSelect,
  onImport,
  onExport,
}: ClientCardProps) {
  const handleSelect = useCallback(() => {
    onSelect?.(client);
  }, [client, onSelect]);

  const handleImport = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onImport?.(client.id);
    },
    [client.id, onImport]
  );

  const handleExport = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onExport?.(client.id);
    },
    [client.id, onExport]
  );

  const serverCount = servers ? Object.keys(servers).length : client.serverCount;
  const icon = clientIcons[client.id] || '📱';

  return (
    <Card
      className={`cursor-pointer transition-colors hover:bg-accent/50 ${
        isSelected ? 'ring-2 ring-primary' : ''
      } ${!client.installed ? 'opacity-50' : ''}`}
      onClick={client.installed ? handleSelect : undefined}
      data-testid="client-card"
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{icon}</span>
            <div>
              <h3 className="font-medium">{client.name}</h3>
              {client.installed && client.configPath && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Folder className="h-3 w-3" />
                  <span className="truncate max-w-[200px]">{client.configPath}</span>
                </p>
              )}
            </div>
          </div>
          <Badge variant={client.installed ? 'success' : 'secondary'}>
            {client.installed ? (
              <span className="flex items-center gap-1">
                <CheckCircle className="h-3 w-3" />
                Installed
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <XCircle className="h-3 w-3" />
                Not Found
              </span>
            )}
          </Badge>
        </div>
      </CardHeader>

      <CardContent>
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {serverCount > 0 ? (
              <span>{serverCount} server{serverCount !== 1 ? 's' : ''} configured</span>
            ) : (
              <span>No servers configured</span>
            )}
          </div>

          {client.installed && (
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleImport}
                disabled={isSyncing || serverCount === 0}
                title="Import servers from this client"
              >
                <DownloadCloud className="h-4 w-4 mr-1" />
                Import
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleExport}
                disabled={isSyncing}
                title="Export MCP Router servers to this client"
              >
                <UploadCloud className="h-4 w-4 mr-1" />
                Export
              </Button>
            </div>
          )}
        </div>

        {isSelected && servers && Object.keys(servers).length > 0 && (
          <div className="mt-4 border-t pt-4">
            <h4 className="text-sm font-medium mb-2">Configured Servers:</h4>
            <div className="space-y-2">
              {Object.entries(servers).map(([name, config]) => (
                <div
                  key={name}
                  className="text-xs p-2 bg-muted rounded-md"
                >
                  <div className="font-medium">{name}</div>
                  <div className="text-muted-foreground truncate">
                    {config.command} {config.args?.join(' ')}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
