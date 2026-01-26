import { injectable } from 'inversify';
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { IConfig } from '@main/core/interfaces';

/**
 * Configuration service.
 * Provides access to application configuration with secure defaults.
 */
@injectable()
export class ConfigService implements IConfig {
  private config: Record<string, unknown> = {};
  private readonly configPath: string;

  constructor() {
    // Use app.getPath for proper data directory
    // Falls back to process.cwd() in non-Electron contexts (testing)
    try {
      this.configPath = path.join(app.getPath('userData'), 'config.json');
    } catch {
      this.configPath = path.join(process.cwd(), '.mcp-router', 'config.json');
    }

    this.loadConfig();
    this.applyDefaults();
  }

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    const value = this.getNestedValue(this.config, key);

    if (value === undefined) {
      return defaultValue;
    }

    return value as T;
  }

  set<T>(key: string, value: T): void {
    this.setNestedValue(this.config, key, value);
    this.saveConfig();
  }

  has(key: string): boolean {
    return this.getNestedValue(this.config, key) !== undefined;
  }

  delete(key: string): void {
    this.deleteNestedValue(this.config, key);
    this.saveConfig();
  }

  get dataPath(): string {
    try {
      return app.getPath('userData');
    } catch {
      return path.join(process.cwd(), '.mcp-router');
    }
  }

  get isDevelopment(): boolean {
    return process.env.NODE_ENV === 'development' || !app?.isPackaged;
  }

  /**
   * Load configuration from disk.
   */
  private loadConfig(): void {
    try {
      if (fs.existsSync(this.configPath)) {
        const content = fs.readFileSync(this.configPath, 'utf-8');
        this.config = JSON.parse(content);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
      this.config = {};
    }
  }

  /**
   * Save configuration to disk.
   */
  private saveConfig(): void {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); // Secure permissions
      }

      // Write with secure permissions (fixes LOW-1)
      fs.writeFileSync(
        this.configPath,
        JSON.stringify(this.config, null, 2),
        { mode: 0o600 }
      );
    } catch (error) {
      console.error('Failed to save config:', error);
    }
  }

  /**
   * Apply secure default configuration values.
   */
  private applyDefaults(): void {
    const defaults: Record<string, unknown> = {
      // HTTP Server defaults
      'http.port': 3282,
      'http.host': '127.0.0.1', // Localhost only (fixes MED-3)
      'http.allowedOrigins': ['app://.'],
      'http.rateLimit.global': 100,
      'http.rateLimit.mcp': 60,

      // Token defaults
      'token.defaultTtl': 86400, // 24 hours
      'token.maxTtl': 2592000, // 30 days

      // Database defaults
      'database.path': 'mcp-router.db',

      // Logging defaults
      'log.level': 'info',
      'log.maxFiles': 10,
      'log.maxSize': '10m',
    };

    for (const [key, value] of Object.entries(defaults)) {
      if (!this.has(key)) {
        this.setNestedValue(this.config, key, value);
      }
    }
  }

  /**
   * Get a nested value from an object using dot notation.
   */
  private getNestedValue(obj: Record<string, unknown>, key: string): unknown {
    const keys = key.split('.');
    let current: unknown = obj;

    for (const k of keys) {
      if (current === null || current === undefined) {
        return undefined;
      }
      if (typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[k];
    }

    return current;
  }

  /**
   * Set a nested value in an object using dot notation.
   */
  private setNestedValue(obj: Record<string, unknown>, key: string, value: unknown): void {
    const keys = key.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (!(k in current) || typeof current[k] !== 'object') {
        current[k] = {};
      }
      current = current[k] as Record<string, unknown>;
    }

    const lastKey = keys[keys.length - 1]!;
    current[lastKey] = value;
  }

  /**
   * Delete a nested value from an object using dot notation.
   */
  private deleteNestedValue(obj: Record<string, unknown>, key: string): void {
    const keys = key.split('.');
    let current = obj;

    for (let i = 0; i < keys.length - 1; i++) {
      const k = keys[i]!;
      if (!(k in current) || typeof current[k] !== 'object') {
        return;
      }
      current = current[k] as Record<string, unknown>;
    }

    const lastKey = keys[keys.length - 1]!;
    delete current[lastKey];
  }
}
