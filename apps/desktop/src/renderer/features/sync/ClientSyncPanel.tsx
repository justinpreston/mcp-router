import { useEffect, useCallback } from 'react';
import { useSyncStore } from '@renderer/stores';
import { ClientCard } from './ClientCard';
import { Card, CardContent } from '@renderer/components/ui';
import { RefreshCw, CheckCircle, AlertCircle, XCircle } from 'lucide-react';

export interface ClientSyncPanelProps {
  onSyncComplete?: () => void;
}

export function ClientSyncPanel({ onSyncComplete }: ClientSyncPanelProps) {
  const {
    clients,
    selectedClientId,
    clientServers,
    isLoading,
    isSyncing,
    lastSyncResult,
    error,
    fetchClients,
    selectClient,
    importFromClient,
    exportToClient,
    clearError,
    clearSyncResult,
  } = useSyncStore();

  // Fetch clients on mount
  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Clear sync result after 5 seconds
  useEffect(() => {
    if (lastSyncResult) {
      const timer = setTimeout(() => {
        clearSyncResult();
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [lastSyncResult, clearSyncResult]);

  const handleImport = useCallback(
    async (clientId: string) => {
      try {
        await importFromClient(clientId);
        onSyncComplete?.();
      } catch {
        // Error is already handled in the store
      }
    },
    [importFromClient, onSyncComplete]
  );

  const handleExport = useCallback(
    async (clientId: string) => {
      try {
        await exportToClient(clientId);
        onSyncComplete?.();
      } catch {
        // Error is already handled in the store
      }
    },
    [exportToClient, onSyncComplete]
  );

  const handleSelect = useCallback(
    (client: { id: string }) => {
      selectClient(client.id === selectedClientId ? null : client.id);
    },
    [selectClient, selectedClientId]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading clients...</span>
      </div>
    );
  }

  const installedClients = clients.filter((c) => c.installed);
  const notInstalledClients = clients.filter((c) => !c.installed);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Client Sync</h2>
          <p className="text-sm text-muted-foreground">
            Import or export MCP server configurations with AI clients
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <Card className="border-destructive bg-destructive/10">
          <CardContent className="flex items-center gap-3 py-3">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="flex-1">{error}</span>
            <button
              onClick={clearError}
              className="text-xs underline hover:no-underline"
            >
              <XCircle className="h-4 w-4" />
            </button>
          </CardContent>
        </Card>
      )}

      {/* Success Alert */}
      {lastSyncResult && (
        <Card className={lastSyncResult.errors.length > 0 ? 'border-yellow-500 bg-yellow-500/10' : 'border-green-500 bg-green-500/10'}>
          <CardContent className="flex items-center gap-3 py-3">
            <CheckCircle className={`h-4 w-4 ${lastSyncResult.errors.length > 0 ? 'text-yellow-500' : 'text-green-500'}`} />
            <span>
              Sync complete:{' '}
              {lastSyncResult.imported > 0 && `${lastSyncResult.imported} imported`}
              {lastSyncResult.exported > 0 && `${lastSyncResult.exported} exported`}
              {lastSyncResult.errors.length > 0 && (
                <span className="text-yellow-600 ml-1">
                  ({lastSyncResult.errors.length} error{lastSyncResult.errors.length !== 1 ? 's' : ''})
                </span>
              )}
            </span>
          </CardContent>
        </Card>
      )}

      {/* Syncing Indicator */}
      {isSyncing && (
        <div className="flex items-center gap-2 p-4 bg-muted rounded-lg">
          <RefreshCw className="h-4 w-4 animate-spin" />
          <span>Syncing...</span>
        </div>
      )}

      {/* Installed Clients */}
      {installedClients.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Installed Clients
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {installedClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                isSelected={selectedClientId === client.id}
                servers={selectedClientId === client.id ? clientServers : null}
                isSyncing={isSyncing}
                onSelect={handleSelect}
                onImport={handleImport}
                onExport={handleExport}
              />
            ))}
          </div>
        </div>
      )}

      {/* Not Installed Clients */}
      {notInstalledClients.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-medium text-muted-foreground">
            Other Supported Clients
          </h3>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {notInstalledClients.map((client) => (
              <ClientCard
                key={client.id}
                client={client}
                isSyncing={isSyncing}
              />
            ))}
          </div>
        </div>
      )}

      {/* No Clients Found */}
      {clients.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No supported AI clients detected.</p>
          <p className="text-sm mt-2">
            Install Claude Desktop, Cursor, Windsurf, VS Code, or Cline to enable sync.
          </p>
        </div>
      )}
    </div>
  );
}
