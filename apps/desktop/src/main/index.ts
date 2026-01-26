import 'reflect-metadata';
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { initializeContainer, disposeContainer, getContainer } from './core/container';
import { TYPES } from './core/types';
import type { IHttpServer, ILogger, IDeepLinkHandler } from './core/interfaces';
import { registerAllIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;

/**
 * Create the main application window.
 */
function createWindow(): void {
  const logger = getContainer().get<ILogger>(TYPES.Logger);

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });

  // Security: Prevent navigation to external URLs
  mainWindow.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    if (parsedUrl.origin !== 'http://localhost:5173' && !url.startsWith('file://')) {
      logger.warn('Blocked navigation to external URL', { url });
      event.preventDefault();
    }
  });

  // Security: Prevent new window creation
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external links in default browser
    if (url.startsWith('https://') || url.startsWith('http://')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show();
    logger.info('Main window ready');
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Load the app
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

/**
 * Initialize the application.
 */
async function initialize(): Promise<void> {
  // Initialize DI container
  const container = initializeContainer();
  const logger = container.get<ILogger>(TYPES.Logger);

  logger.info('Initializing MCP Router', {
    version: app.getVersion(),
    platform: process.platform,
    isDev: is.dev,
  });

  // Start HTTP server
  try {
    const httpServer = container.get<IHttpServer>(TYPES.HttpServer);
    await httpServer.start(3282);
    logger.info('HTTP server started on port 3282');
  } catch (error) {
    logger.error('Failed to start HTTP server', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  // Register all IPC handlers using the modular system
  registerAllIpcHandlers(container);
  logger.debug('IPC handlers registered');

  // Initialize deep link handler for secure URL handling
  const deepLinkHandler = container.get<IDeepLinkHandler>(TYPES.DeepLinkHandler);
  deepLinkHandler.register();
  logger.debug('Deep link handler registered');

  // Set up deep link action handlers
  deepLinkHandler.onAction('connect-server', async (link) => {
    logger.info('Deep link: connect-server', { params: link.params });
    // TODO: Implement server connection from deep link
  });

  deepLinkHandler.onAction('approve-request', async (link) => {
    logger.info('Deep link: approve-request', { params: link.params });
    // TODO: Implement approval handling from deep link
  });

  deepLinkHandler.onAction('open-workspace', async (link) => {
    logger.info('Deep link: open-workspace', { params: link.params });
    // TODO: Implement workspace opening from deep link
  });

  logger.info('Application initialized');
}

/**
 * Cleanup on app quit.
 */
async function cleanup(): Promise<void> {
  const logger = getContainer().get<ILogger>(TYPES.Logger);
  logger.info('Shutting down application');

  await disposeContainer();
}

// App lifecycle events
app.whenReady().then(async () => {
  // Set app user model id for Windows
  electronApp.setAppUserModelId('com.mcp-router');

  // Optimize for development
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window);
  });

  await initialize();
  createWindow();

  app.on('activate', () => {
    // On macOS, re-create window when dock icon is clicked
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await cleanup();
});

// Security: Disable remote module
// Note: These events are deprecated in Electron 14+ but kept for compatibility
// with older versions. Using type assertion to avoid TS errors.
(app as Electron.App & { on(event: string, listener: (event: Electron.Event) => void): void }).on(
  'remote-require',
  (event: Electron.Event) => {
    event.preventDefault();
  }
);

(app as Electron.App & { on(event: string, listener: (event: Electron.Event) => void): void }).on(
  'remote-get-builtin',
  (event: Electron.Event) => {
    event.preventDefault();
  }
);

(app as Electron.App & { on(event: string, listener: (event: Electron.Event) => void): void }).on(
  'remote-get-global',
  (event: Electron.Event) => {
    event.preventDefault();
  }
);

(app as Electron.App & { on(event: string, listener: (event: Electron.Event) => void): void }).on(
  'remote-get-current-window',
  (event: Electron.Event) => {
    event.preventDefault();
  }
);

(app as Electron.App & { on(event: string, listener: (event: Electron.Event) => void): void }).on(
  'remote-get-current-web-contents',
  (event: Electron.Event) => {
    event.preventDefault();
  }
);
