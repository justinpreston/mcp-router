import { ipcMain, app, BrowserWindow, dialog } from 'electron';
import { readFile } from 'fs/promises';
import type { Container } from 'inversify';
import type { ILogger } from '@main/core/interfaces';
import { TYPES } from '@main/core/types';

/**
 * Options for opening a file dialog.
 */
interface OpenDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
  properties?: Array<'openFile' | 'openDirectory' | 'multiSelections' | 'showHiddenFiles'>;
}

/**
 * Options for opening a save dialog.
 */
interface SaveDialogOptions {
  title?: string;
  defaultPath?: string;
  filters?: Array<{ name: string; extensions: string[] }>;
}

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

  // Open file dialog
  ipcMain.handle('app:openFileDialog', async (event, options: OpenDialogOptions = {}) => {
    logger.debug('IPC: app:openFileDialog', { options });
    const window = BrowserWindow.fromWebContents(event.sender);
    
    const result = await dialog.showOpenDialog(window!, {
      title: options.title || 'Open File',
      defaultPath: options.defaultPath,
      filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
      properties: options.properties || ['openFile'],
    });

    if (result.canceled) {
      return [];
    }
    return result.filePaths;
  });

  // Save file dialog
  ipcMain.handle('app:saveFileDialog', async (event, options: SaveDialogOptions = {}) => {
    logger.debug('IPC: app:saveFileDialog', { options });
    const window = BrowserWindow.fromWebContents(event.sender);
    
    const result = await dialog.showSaveDialog(window!, {
      title: options.title || 'Save File',
      defaultPath: options.defaultPath,
      filters: options.filters || [{ name: 'All Files', extensions: ['*'] }],
    });

    if (result.canceled) {
      return null;
    }
    return result.filePath;
  });

  // Read file contents
  ipcMain.handle('app:readFile', async (_, filePath: string) => {
    logger.debug('IPC: app:readFile', { filePath });
    
    // Security: Validate file path to prevent directory traversal
    if (filePath.includes('..') || filePath.includes('\0')) {
      throw new Error('Invalid file path');
    }

    try {
      const content = await readFile(filePath, 'utf-8');
      return content;
    } catch (error) {
      logger.error('Failed to read file', {
        filePath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error(`Failed to read file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  // Select directory dialog
  ipcMain.handle('app:selectDirectory', async (event, options: { title?: string; defaultPath?: string } = {}) => {
    logger.debug('IPC: app:selectDirectory', { options });
    const window = BrowserWindow.fromWebContents(event.sender);
    
    const result = await dialog.showOpenDialog(window!, {
      title: options.title || 'Select Directory',
      defaultPath: options.defaultPath,
      properties: ['openDirectory', 'createDirectory'],
    });

    if (result.canceled) {
      return null;
    }
    return result.filePaths[0] || null;
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
