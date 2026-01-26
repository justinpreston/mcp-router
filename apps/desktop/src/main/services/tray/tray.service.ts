import { injectable, inject } from 'inversify';
import { Tray, Menu, nativeImage, app, BrowserWindow, Notification as ElectronNotification, NativeImage } from 'electron';
import { join } from 'path';
import { TYPES } from '@main/core/types';
import type { ILogger, IServerManager, ITrayService, MCPServer } from '@main/core/interfaces';
import { is } from '@electron-toolkit/utils';

/**
 * Status indicators for the tray icon.
 */
export type TrayStatus = 'idle' | 'active' | 'error' | 'warning';

/**
 * TrayService - Manages the system tray icon and menu.
 * Provides quick access to common actions and status indicators.
 */
@injectable()
export class TrayService implements ITrayService {
  private tray: Tray | null = null;
  private status: TrayStatus = 'idle';
  private contextMenu: Menu | null = null;
  private updateInterval: NodeJS.Timeout | null = null;

  constructor(
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.ServerManager) private serverManager: IServerManager
  ) {}

  /**
   * Initialize the system tray icon.
   */
  async initialize(): Promise<void> {
    try {
      // Create tray icon
      const icon = this.createIcon('idle');
      this.tray = new Tray(icon);

      // Set tooltip
      this.tray.setToolTip('MCP Router');

      // Build initial context menu
      await this.updateContextMenu();

      // Set up click handler (Windows/Linux: show menu, macOS: toggle window)
      this.tray.on('click', () => {
        if (process.platform === 'darwin') {
          this.toggleMainWindow();
        } else {
          this.tray?.popUpContextMenu(this.contextMenu ?? undefined);
        }
      });

      // Right-click always shows menu
      this.tray.on('right-click', () => {
        this.tray?.popUpContextMenu(this.contextMenu ?? undefined);
      });

      // Set up auto-refresh for server status
      this.startStatusUpdates();

      this.logger.info('System tray initialized');
    } catch (error) {
      this.logger.error('Failed to initialize system tray', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Dispose of the tray resources.
   */
  async dispose(): Promise<void> {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    if (this.tray) {
      this.tray.destroy();
      this.tray = null;
    }

    this.logger.info('System tray disposed');
  }

  /**
   * Update the tray status indicator.
   */
  setStatus(status: TrayStatus): void {
    if (this.status === status) return;

    this.status = status;
    const icon = this.createIcon(status);
    this.tray?.setImage(icon);

    // Update tooltip based on status
    const tooltips: Record<TrayStatus, string> = {
      idle: 'MCP Router - Idle',
      active: 'MCP Router - Active',
      error: 'MCP Router - Error',
      warning: 'MCP Router - Warning',
    };
    this.tray?.setToolTip(tooltips[status]);
  }

  /**
   * Show a notification from the tray.
   */
  showNotification(title: string, body: string): void {
    // Use Electron's Notification API
    try {
      const notification = new ElectronNotification({ title, body });
      notification.show();
    } catch (error) {
      this.logger.warn('Failed to show notification', { error });
    }
  }

  /**
   * Create icon based on status.
   */
  private createIcon(status: TrayStatus): NativeImage {
    // For development, use a simple colored square
    // In production, use actual icon files
    const iconSize = process.platform === 'darwin' ? 22 : 16;

    // Create a simple colored icon based on status
    const colors: Record<TrayStatus, string> = {
      idle: '#6b7280',     // gray
      active: '#22c55e',   // green
      error: '#ef4444',    // red
      warning: '#f59e0b',  // amber
    };

    // Try to load from resources first
    try {
      const resourcePath = is.dev
        ? join(__dirname, '../../resources')
        : join(process.resourcesPath, 'resources');

      const iconName = process.platform === 'darwin'
        ? `trayTemplate.png`
        : `tray-${status}.png`;

      const iconPath = join(resourcePath, iconName);
      const icon = nativeImage.createFromPath(iconPath);
      
      if (!icon.isEmpty()) {
        // On macOS, resize for menu bar
        if (process.platform === 'darwin') {
          return icon.resize({ width: iconSize, height: iconSize });
        }
        return icon;
      }
    } catch {
      // Fall back to generated icon
    }

    // Generate a simple colored icon
    const canvas = Buffer.alloc(iconSize * iconSize * 4);
    const color = this.hexToRgba(colors[status]);

    for (let i = 0; i < iconSize * iconSize; i++) {
      // Create a circle shape
      const x = i % iconSize;
      const y = Math.floor(i / iconSize);
      const centerX = iconSize / 2;
      const centerY = iconSize / 2;
      const radius = iconSize / 2 - 2;
      const distance = Math.sqrt((x - centerX) ** 2 + (y - centerY) ** 2);

      if (distance <= radius) {
        canvas[i * 4] = color.r;
        canvas[i * 4 + 1] = color.g;
        canvas[i * 4 + 2] = color.b;
        canvas[i * 4 + 3] = 255;
      } else {
        canvas[i * 4 + 3] = 0; // Transparent
      }
    }

    return nativeImage.createFromBuffer(canvas, {
      width: iconSize,
      height: iconSize,
    });
  }

  /**
   * Convert hex color to RGBA.
   */
  private hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? {
          r: parseInt(result[1]!, 16),
          g: parseInt(result[2]!, 16),
          b: parseInt(result[3]!, 16),
          a: 255,
        }
      : { r: 107, g: 114, b: 128, a: 255 }; // default gray
  }

  /**
   * Update the context menu with current server status.
   */
  async updateContextMenu(): Promise<void> {
    try {
      const servers = this.serverManager.getAllServers();
      const runningServers = servers.filter((s: MCPServer) => s.status === 'running');
      const errorServers = servers.filter((s: MCPServer) => s.status === 'error');

      // Build server items
      const serverItems: Electron.MenuItemConstructorOptions[] = servers
        .slice(0, 5)
        .map((server: MCPServer) => ({
          label: this.formatServerLabel(server),
          submenu: this.buildServerSubmenu(server),
        }));

      // Add "more servers" if needed
      if (servers.length > 5) {
        serverItems.push({
          label: `${servers.length - 5} more servers...`,
          enabled: false,
        });
      }

      // Build full menu
      const template: Electron.MenuItemConstructorOptions[] = [
        {
          label: 'Open MCP Router',
          click: () => this.showMainWindow(),
          accelerator: 'CmdOrCtrl+Shift+M',
        },
        { type: 'separator' },
        {
          label: `Servers (${runningServers.length}/${servers.length} active)`,
          enabled: false,
        },
        ...serverItems,
        { type: 'separator' },
        {
          label: 'Quick Actions',
          submenu: [
            {
              label: 'Start All Servers',
              click: () => this.startAllServers(),
            },
            {
              label: 'Stop All Servers',
              click: () => this.stopAllServers(),
            },
            { type: 'separator' },
            {
              label: 'Refresh Servers',
              click: () => this.refreshServers(),
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'Status',
          submenu: [
            {
              label: `Running: ${runningServers.length}`,
              enabled: false,
            },
            {
              label: `Errors: ${errorServers.length}`,
              enabled: false,
            },
          ],
        },
        { type: 'separator' },
        {
          label: 'Preferences...',
          click: () => this.openPreferences(),
          accelerator: 'CmdOrCtrl+,',
        },
        {
          label: 'Check for Updates...',
          click: () => this.checkForUpdates(),
        },
        { type: 'separator' },
        {
          label: 'Quit MCP Router',
          click: () => app.quit(),
          accelerator: 'CmdOrCtrl+Q',
        },
      ];

      this.contextMenu = Menu.buildFromTemplate(template);

      // Set the context menu (macOS shows it on right-click)
      if (process.platform !== 'darwin') {
        this.tray?.setContextMenu(this.contextMenu);
      }

      // Update status indicator based on servers
      if (errorServers.length > 0) {
        this.setStatus('error');
      } else if (runningServers.length > 0) {
        this.setStatus('active');
      } else {
        this.setStatus('idle');
      }
    } catch (error) {
      this.logger.error('Failed to update tray context menu', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Format server label for menu.
   */
  private formatServerLabel(server: MCPServer): string {
    const statusIcons: Record<string, string> = {
      running: '●',
      starting: '◐',
      stopped: '○',
      error: '✗',
    };
    const icon = statusIcons[server.status] || '○';
    return `${icon} ${server.name}`;
  }

  /**
   * Build submenu for a server.
   */
  private buildServerSubmenu(
    server: MCPServer
  ): Electron.MenuItemConstructorOptions[] {
    const isRunning = server.status === 'running';

    return [
      {
        label: isRunning ? 'Stop Server' : 'Start Server',
        click: () => (isRunning ? this.stopServer(server.id) : this.startServer(server.id)),
      },
      {
        label: 'Restart Server',
        click: () => this.restartServer(server.id),
        enabled: isRunning,
      },
      { type: 'separator' },
      {
        label: 'View Logs',
        click: () => this.viewServerLogs(server.id),
      },
      {
        label: 'Settings',
        click: () => this.openServerSettings(server.id),
      },
    ];
  }

  /**
   * Start periodic status updates.
   */
  private startStatusUpdates(): void {
    // Update menu every 30 seconds
    this.updateInterval = setInterval(() => {
      this.updateContextMenu();
    }, 30000);
  }

  /**
   * Toggle main window visibility.
   */
  private toggleMainWindow(): void {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      if (win.isVisible()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    } else {
      // No window, emit event to create one
      app.emit('activate');
    }
  }

  /**
   * Show and focus main window.
   */
  private showMainWindow(): void {
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.show();
      win.focus();
    } else {
      app.emit('activate');
    }
  }

  /**
   * Quick action: Start all servers.
   */
  private async startAllServers(): Promise<void> {
    try {
      const servers = this.serverManager.getAllServers();
      for (const server of servers) {
        if (server.status !== 'running') {
          await this.serverManager.startServer(server.id);
        }
      }
      await this.updateContextMenu();
    } catch (error) {
      this.logger.error('Failed to start all servers', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Quick action: Stop all servers.
   */
  private async stopAllServers(): Promise<void> {
    try {
      const servers = this.serverManager.getAllServers();
      for (const server of servers) {
        if (server.status === 'running') {
          await this.serverManager.stopServer(server.id);
        }
      }
      await this.updateContextMenu();
    } catch (error) {
      this.logger.error('Failed to stop all servers', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Quick action: Refresh servers.
   */
  private async refreshServers(): Promise<void> {
    await this.updateContextMenu();
    this.showNotification('MCP Router', 'Server list refreshed');
  }

  /**
   * Start a specific server.
   */
  private async startServer(serverId: string): Promise<void> {
    try {
      await this.serverManager.startServer(serverId);
      await this.updateContextMenu();
    } catch (error) {
      this.logger.error('Failed to start server from tray', {
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Stop a specific server.
   */
  private async stopServer(serverId: string): Promise<void> {
    try {
      await this.serverManager.stopServer(serverId);
      await this.updateContextMenu();
    } catch (error) {
      this.logger.error('Failed to stop server from tray', {
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Restart a specific server.
   */
  private async restartServer(serverId: string): Promise<void> {
    try {
      await this.serverManager.restartServer(serverId);
      await this.updateContextMenu();
    } catch (error) {
      this.logger.error('Failed to restart server from tray', {
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Open server logs view.
   */
  private viewServerLogs(serverId: string): void {
    this.showMainWindow();
    // Send IPC to navigate to logs
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('navigate', { route: 'servers', params: { id: serverId, tab: 'logs' } });
    }
  }

  /**
   * Open server settings.
   */
  private openServerSettings(serverId: string): void {
    this.showMainWindow();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('navigate', { route: 'servers', params: { id: serverId, tab: 'settings' } });
    }
  }

  /**
   * Open preferences.
   */
  private openPreferences(): void {
    this.showMainWindow();
    const win = BrowserWindow.getAllWindows()[0];
    if (win) {
      win.webContents.send('navigate', { route: 'settings' });
    }
  }

  /**
   * Check for updates.
   */
  private checkForUpdates(): void {
    // TODO: Implement auto-updater integration
    this.showNotification('MCP Router', 'You have the latest version');
  }
}

export default TrayService;
