import 'reflect-metadata';
import { app, BrowserWindow, shell } from 'electron';
import { join } from 'path';
import { electronApp, optimizer, is } from '@electron-toolkit/utils';
import { initializeContainer, disposeContainer, getContainer } from './core/container';
import { TYPES } from './core/types';
import type { 
  IHttpServer, 
  ILogger, 
  IDeepLinkHandler, 
  ITrayService,
  IServerManager,
  IWorkspaceService,
  IApprovalQueue,
  ServerTransport,
} from './core/interfaces';
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
  const serverManager = container.get<IServerManager>(TYPES.ServerManager);
  const workspaceService = container.get<IWorkspaceService>(TYPES.WorkspaceService);
  const approvalQueue = container.get<IApprovalQueue>(TYPES.ApprovalQueue);

  deepLinkHandler.onAction('connect-server', async (link) => {
    logger.info('Deep link: connect-server', { params: link.params });
    
    try {
      const { url, name, type } = link.params;
      if (!url) {
        logger.warn('connect-server deep link missing URL');
        return;
      }

      // Parse the server URL to determine transport type
      const serverUrl = new URL(url);
      const transport: ServerTransport = (type as ServerTransport) || 
        (serverUrl.protocol === 'http:' || serverUrl.protocol === 'https:' ? 'http' : 'stdio');
      
      // Create server config
      const serverConfig = {
        name: name || `Server from ${serverUrl.hostname}`,
        command: transport === 'stdio' ? url : '',
        url: transport !== 'stdio' ? url : undefined,
        transport,
        args: [],
        env: {},
        workingDirectory: undefined,
        autoStart: true,
        toolPermissions: {},
      };

      // Add the server
      const server = await serverManager.addServer(serverConfig);
      logger.info('Server added via deep link', { serverId: server.id, name: server.name });

      // Navigate to servers page in UI
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.show();
        win.focus();
        win.webContents.send('navigate', { route: 'servers', params: { id: server.id } });
      }
    } catch (error) {
      logger.error('Failed to connect server via deep link', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  deepLinkHandler.onAction('approve-request', async (link) => {
    logger.info('Deep link: approve-request', { params: link.params });
    
    try {
      const { id, action } = link.params;
      if (!id || !action) {
        logger.warn('approve-request deep link missing id or action');
        return;
      }

      // Get the approval request
      const request = await approvalQueue.getRequest(id);
      if (!request) {
        logger.warn('Approval request not found', { id });
        return;
      }

      if (request.status !== 'pending') {
        logger.warn('Approval request already resolved', { id, status: request.status });
        return;
      }

      // Respond to the approval
      await approvalQueue.respond(id, {
        approved: action === 'approve',
        note: `Handled via deep link`,
      });

      logger.info('Approval handled via deep link', { id, action });

      // Navigate to approvals page
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.show();
        win.focus();
        win.webContents.send('navigate', { route: 'approvals' });
      }
    } catch (error) {
      logger.error('Failed to handle approval via deep link', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  deepLinkHandler.onAction('open-workspace', async (link) => {
    logger.info('Deep link: open-workspace', { params: link.params });
    
    try {
      const { id } = link.params;
      if (!id) {
        logger.warn('open-workspace deep link missing id');
        return;
      }

      // Get the workspace
      const workspace = await workspaceService.getWorkspace(id);
      if (!workspace) {
        logger.warn('Workspace not found', { id });
        return;
      }

      logger.info('Workspace opened via deep link', { id, name: workspace.name });

      // Navigate to workspace view
      const win = BrowserWindow.getAllWindows()[0];
      if (win) {
        win.show();
        win.focus();
        win.webContents.send('navigate', { route: 'workspaces', params: { id } });
      }
    } catch (error) {
      logger.error('Failed to open workspace via deep link', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Initialize system tray
  try {
    const trayService = container.get<ITrayService>(TYPES.TrayService);
    await trayService.initialize();
    logger.info('System tray initialized');
  } catch (error) {
    logger.warn('Failed to initialize system tray', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

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
