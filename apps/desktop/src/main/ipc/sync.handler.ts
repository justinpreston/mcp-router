import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import type {
  IClientSyncService,
  ILogger,
  ClientAppId,
  ClientApp,
  ClientMCPServerConfig,
  SyncResult,
} from '@main/core/interfaces';
import { TYPES } from '@main/core/types';
import { z } from 'zod';

/**
 * Valid client app IDs.
 */
const ClientAppIdSchema = z.enum(['claude', 'cursor', 'windsurf', 'vscode', 'cline']);

/**
 * Schema for export options.
 */
const ExportOptionsSchema = z.object({
  clientId: ClientAppIdSchema,
  serverIds: z.array(z.string()).optional(),
});

/**
 * Transform internal ClientApp to API-safe format.
 */
function toClientAppInfo(client: ClientApp) {
  return {
    id: client.id,
    name: client.name,
    installed: client.installed,
    configPath: client.configPath,
    serverCount: client.serverCount,
  };
}

/**
 * Register IPC handlers for client sync operations.
 */
export function registerClientSyncHandlers(container: Container): void {
  const syncService = container.get<IClientSyncService>(TYPES.ClientSyncService);
  const logger = container.get<ILogger>(TYPES.Logger).child({ module: 'ipc:sync' });

  /**
   * List all supported client apps and their status.
   */
  ipcMain.handle('sync:list-clients', async (): Promise<ClientApp[]> => {
    try {
      const clients = await syncService.listClients();
      return clients.map(toClientAppInfo);
    } catch (error) {
      logger.error('Failed to list clients', { error });
      throw error;
    }
  });

  /**
   * Get servers configured in a specific client app.
   */
  ipcMain.handle(
    'sync:get-client-servers',
    async (_, clientId: string): Promise<Record<string, ClientMCPServerConfig>> => {
      try {
        const validatedId = ClientAppIdSchema.parse(clientId) as ClientAppId;
        return await syncService.getClientServers(validatedId);
      } catch (error) {
        logger.error('Failed to get client servers', { error, clientId });
        throw error;
      }
    }
  );

  /**
   * Check if a client is installed.
   */
  ipcMain.handle(
    'sync:is-client-installed',
    async (_, clientId: string): Promise<boolean> => {
      try {
        const validatedId = ClientAppIdSchema.parse(clientId) as ClientAppId;
        return await syncService.isClientInstalled(validatedId);
      } catch (error) {
        logger.error('Failed to check client installation', { error, clientId });
        throw error;
      }
    }
  );

  /**
   * Get config file path for a client.
   */
  ipcMain.handle(
    'sync:get-config-path',
    async (_, clientId: string): Promise<string> => {
      try {
        const validatedId = ClientAppIdSchema.parse(clientId) as ClientAppId;
        return syncService.getConfigPath(validatedId);
      } catch (error) {
        logger.error('Failed to get config path', { error, clientId });
        throw error;
      }
    }
  );

  /**
   * Import servers from a client app into MCP Router.
   */
  ipcMain.handle(
    'sync:import-from-client',
    async (_, clientId: string): Promise<SyncResult> => {
      try {
        const validatedId = ClientAppIdSchema.parse(clientId) as ClientAppId;
        logger.info('Importing servers from client', { clientId: validatedId });
        const result = await syncService.importFromClient(validatedId);
        logger.info('Import complete', { 
          clientId: validatedId, 
          imported: result.imported,
          errors: result.errors.length 
        });
        return result;
      } catch (error) {
        logger.error('Failed to import from client', { error, clientId });
        throw error;
      }
    }
  );

  /**
   * Export MCP Router servers to a client app.
   */
  ipcMain.handle(
    'sync:export-to-client',
    async (_, options: { clientId: string; serverIds?: string[] }): Promise<SyncResult> => {
      try {
        const validated = ExportOptionsSchema.parse(options);
        logger.info('Exporting servers to client', { 
          clientId: validated.clientId,
          serverCount: validated.serverIds?.length ?? 'all'
        });
        const result = await syncService.exportToClient(
          validated.clientId as ClientAppId,
          validated.serverIds
        );
        logger.info('Export complete', { 
          clientId: validated.clientId, 
          exported: result.exported,
          errors: result.errors.length 
        });
        return result;
      } catch (error) {
        logger.error('Failed to export to client', { error, options });
        throw error;
      }
    }
  );

  logger.info('Client sync IPC handlers registered');
}
