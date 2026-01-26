import { ipcMain } from 'electron';
import type { Container } from 'inversify';
import { TYPES } from '@main/core/types';
import type { IAppDiscoveryService, IDxtProcessor } from '@main/services/catalog';

/**
 * Register IPC handlers for app discovery and DXT import.
 */
export function registerDiscoveryHandlers(container: Container): void {
  const discoveryService = container.get<IAppDiscoveryService>(TYPES.AppDiscoveryService);
  const dxtProcessor = container.get<IDxtProcessor>(TYPES.DxtProcessor);

  // Scan for MCP-enabled applications
  ipcMain.handle('discovery:scan', async () => {
    return discoveryService.scan();
  });

  // Get list of known apps
  ipcMain.handle('discovery:knownApps', async () => {
    return discoveryService.getKnownApps();
  });

  // Import servers from a specific app
  ipcMain.handle('discovery:import', async (_, appId: string) => {
    return discoveryService.importServers(appId);
  });

  // Parse a DXT/config file content
  ipcMain.handle('discovery:parseFile', async (_, content: string, source: string) => {
    return dxtProcessor.parseFile(content, source);
  });

  // Parse Claude Desktop config
  ipcMain.handle('discovery:parseClaudeConfig', async (_, content: string) => {
    return dxtProcessor.parseClaudeDesktopConfig(content);
  });

  // Parse VS Code config
  ipcMain.handle('discovery:parseVSCodeConfig', async (_, content: string) => {
    return dxtProcessor.parseVSCodeConfig(content);
  });
}
