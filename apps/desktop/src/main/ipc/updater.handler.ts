import { ipcMain, BrowserWindow } from 'electron';
import type { Container } from 'inversify';
import { TYPES } from '@main/core/types';
import type { IAutoUpdater, UpdateState } from '@main/services/updater';

/**
 * Register auto-updater IPC handlers.
 * Exposes update functionality to the renderer process.
 */
export function registerUpdaterHandlers(container: Container): void {
  const autoUpdater = container.get<IAutoUpdater>(TYPES.AutoUpdater);

  // Check for updates
  ipcMain.handle('updater:check', async () => {
    const result = await autoUpdater.checkForUpdates();
    if (result) {
      return {
        updateAvailable: true,
        version: result.updateInfo?.version,
        releaseDate: result.updateInfo?.releaseDate,
        releaseNotes: result.updateInfo?.releaseNotes,
      };
    }
    return { updateAvailable: false };
  });

  // Download the update
  ipcMain.handle('updater:download', async () => {
    const files = await autoUpdater.downloadUpdate();
    return { success: true, files };
  });

  // Quit and install the update
  ipcMain.handle('updater:install', async () => {
    autoUpdater.quitAndInstall();
    return { success: true };
  });

  // Get current update state
  ipcMain.handle('updater:state', () => {
    return autoUpdater.getState();
  });

  // Get update configuration
  ipcMain.handle('updater:config', () => {
    return autoUpdater.getConfig();
  });

  // Update configuration
  ipcMain.handle('updater:set-config', async (_, config: Partial<{
    autoCheck: boolean;
    autoDownload: boolean;
    autoInstallOnAppQuit: boolean;
    allowPrerelease: boolean;
    checkInterval: number;
  }>) => {
    autoUpdater.setConfig(config);
    return autoUpdater.getConfig();
  });

  // Subscribe to state changes (sends events to renderer)
  autoUpdater.onStateChange((state: UpdateState) => {
    const windows = BrowserWindow.getAllWindows();
    windows.forEach((win) => {
      win.webContents.send('updater:state-changed', state);
    });
  });
}
