import { ipcMain, app, BrowserWindow } from 'electron';
import type { Container } from 'inversify';
import type { ILogger } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';

/**
 * Register IPC handlers for app-level operations.
 */
export function registerAppHandlers(container: Container): void {
  const logger = container.get<ILogger>(TYPES.Logger);

  // Get app version
  ipcMain.handle('app:getVersion', async () => {
    logger.debug('IPC: app:getVersion');
    return app.getVersion();
  });

  // Get platform
  ipcMain.handle('app:getPlatform', async () => {
    logger.debug('IPC: app:getPlatform');
    return process.platform;
  });
}

/**
 * Register IPC handlers for window controls.
 */
export function registerWindowHandlers(_container: Container): void {
  // Minimize window
  ipcMain.handle('window:minimize', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.minimize();
    }
  });

  // Maximize/restore window
  ipcMain.handle('window:maximize', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
    }
  });

  // Close window
  ipcMain.handle('window:close', async (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.close();
    }
  });
}
