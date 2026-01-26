import { injectable, inject } from 'inversify';
import { autoUpdater, UpdateCheckResult, UpdateInfo, ProgressInfo } from 'electron-updater';
import { app, BrowserWindow } from 'electron';
import { TYPES } from '@main/core/types';
import type { ILogger } from '@main/core/interfaces';

/**
 * Update status for tracking update lifecycle.
 */
export type UpdateStatus = 
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error';

/**
 * Update state with full details.
 */
export interface UpdateState {
  status: UpdateStatus;
  info?: UpdateInfo;
  progress?: ProgressInfo;
  error?: Error;
}

/**
 * Configuration for auto-updater behavior.
 */
export interface UpdateConfig {
  /** Check for updates on startup (default: true) */
  autoCheck: boolean;
  /** Interval between automatic checks in ms (default: 1 hour) */
  checkInterval: number;
  /** Download updates automatically (default: true) */
  autoDownload: boolean;
  /** Install on quit (default: true) */
  autoInstallOnAppQuit: boolean;
  /** Allow pre-release versions (default: false) */
  allowPrerelease: boolean;
}

/**
 * Callback for update state changes.
 */
export type UpdateStateCallback = (state: UpdateState) => void;

/**
 * Auto-updater service interface.
 */
export interface IAutoUpdater {
  initialize(): void;
  checkForUpdates(): Promise<UpdateCheckResult | null>;
  downloadUpdate(): Promise<string[]>;
  quitAndInstall(): void;
  getState(): UpdateState;
  getConfig(): UpdateConfig;
  setConfig(config: Partial<UpdateConfig>): void;
  onStateChange(callback: UpdateStateCallback): () => void;
}

/**
 * Auto-updater service with signature verification.
 * Provides secure automatic updates using electron-updater.
 */
@injectable()
export class AutoUpdaterService implements IAutoUpdater {
  private state: UpdateState = { status: 'idle' };
  private config: UpdateConfig = {
    autoCheck: true,
    checkInterval: 60 * 60 * 1000, // 1 hour
    autoDownload: true,
    autoInstallOnAppQuit: true,
    allowPrerelease: false,
  };
  private checkTimer: NodeJS.Timeout | null = null;
  private listeners: Set<UpdateStateCallback> = new Set();

  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  /**
   * Initialize the auto-updater with event handlers.
   */
  initialize(): void {
    // Configure updater
    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.autoInstallOnAppQuit = this.config.autoInstallOnAppQuit;
    autoUpdater.allowPrerelease = this.config.allowPrerelease;

    // Disable in development
    if (!app.isPackaged) {
      this.logger.info('Auto-updater disabled in development mode');
      return;
    }

    // Set up event handlers
    autoUpdater.on('checking-for-update', () => {
      this.updateState({ status: 'checking' });
      this.logger.info('Checking for updates...');
    });

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.updateState({ status: 'available', info });
      this.logger.info('Update available', { version: info.version });
      this.notifyRenderer('update-available', info);
    });

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.updateState({ status: 'not-available', info });
      this.logger.info('No updates available', { version: info.version });
    });

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.updateState({ status: 'downloading', progress });
      this.logger.debug('Download progress', {
        percent: Math.round(progress.percent),
        transferred: progress.transferred,
        total: progress.total,
      });
      this.notifyRenderer('update-progress', progress);
    });

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.updateState({ status: 'downloaded', info });
      this.logger.info('Update downloaded', { version: info.version });
      this.notifyRenderer('update-downloaded', info);
    });

    autoUpdater.on('error', (error: Error) => {
      this.updateState({ status: 'error', error });
      this.logger.error('Auto-update error', { 
        message: error.message,
        stack: error.stack,
      });
      this.notifyRenderer('update-error', { message: error.message });
    });

    // Start automatic checking if enabled
    if (this.config.autoCheck) {
      this.startAutoCheck();
    }

    this.logger.info('Auto-updater initialized');
  }

  /**
   * Manually check for updates.
   */
  async checkForUpdates(): Promise<UpdateCheckResult | null> {
    if (!app.isPackaged) {
      this.logger.info('Skipping update check in development');
      return null;
    }

    try {
      return await autoUpdater.checkForUpdates();
    } catch (error) {
      this.logger.error('Failed to check for updates', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Download an available update.
   */
  async downloadUpdate(): Promise<string[]> {
    if (this.state.status !== 'available') {
      throw new Error('No update available to download');
    }

    return autoUpdater.downloadUpdate();
  }

  /**
   * Quit the app and install the downloaded update.
   */
  quitAndInstall(): void {
    if (this.state.status !== 'downloaded') {
      throw new Error('No update downloaded to install');
    }

    this.logger.info('Quitting and installing update');
    autoUpdater.quitAndInstall();
  }

  /**
   * Get current update state.
   */
  getState(): UpdateState {
    return { ...this.state };
  }

  /**
   * Get current configuration.
   */
  getConfig(): UpdateConfig {
    return { ...this.config };
  }

  /**
   * Update configuration.
   */
  setConfig(config: Partial<UpdateConfig>): void {
    this.config = { ...this.config, ...config };

    // Apply to autoUpdater
    autoUpdater.autoDownload = this.config.autoDownload;
    autoUpdater.autoInstallOnAppQuit = this.config.autoInstallOnAppQuit;
    autoUpdater.allowPrerelease = this.config.allowPrerelease;

    // Restart auto-check if interval changed
    if (config.checkInterval !== undefined || config.autoCheck !== undefined) {
      this.stopAutoCheck();
      if (this.config.autoCheck) {
        this.startAutoCheck();
      }
    }
  }

  /**
   * Register a callback for state changes.
   * Returns an unsubscribe function.
   */
  onStateChange(callback: UpdateStateCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Update internal state and notify listeners.
   */
  private updateState(partial: Partial<UpdateState>): void {
    this.state = { ...this.state, ...partial };
    
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch (error) {
        this.logger.error('State change listener error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Start automatic update checking.
   */
  private startAutoCheck(): void {
    if (this.checkTimer) {
      return;
    }

    // Check immediately on startup
    setTimeout(() => this.checkForUpdates(), 10000); // 10 seconds after startup

    // Then check periodically
    this.checkTimer = setInterval(() => {
      this.checkForUpdates();
    }, this.config.checkInterval);
  }

  /**
   * Stop automatic update checking.
   */
  private stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Send update events to renderer process.
   */
  private notifyRenderer(channel: string, data: unknown): void {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send(`auto-update:${channel}`, data);
    }
  }
}

export default AutoUpdaterService;
