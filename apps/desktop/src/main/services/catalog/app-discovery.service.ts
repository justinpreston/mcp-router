/**
 * App Discovery Service
 * 
 * Scans common locations for MCP-enabled applications and their configurations.
 * Supports Claude Desktop, Cursor, VS Code, and other MCP clients.
 */

import { injectable, inject } from 'inversify';
import { existsSync, readFileSync } from 'fs';
import { homedir, platform } from 'os';
import { join } from 'path';
import { TYPES } from '@main/core/types';
import type { ILogger } from '@main/core/interfaces';
import { DxtProcessor, ParsedServerConfig } from './dxt-processor';

/**
 * Discovered application with its MCP configuration.
 */
export interface DiscoveredApp {
  id: string;
  name: string;
  description: string;
  icon?: string;
  configPath: string;
  exists: boolean;
  servers: ParsedServerConfig[];
  lastScanned?: number;
}

/**
 * App template for well-known MCP clients.
 */
export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  configPaths: {
    darwin?: string;
    win32?: string;
    linux?: string;
  };
  parser: 'claude' | 'cursor' | 'vscode' | 'generic';
}

/**
 * Scan result from app discovery.
 */
export interface AppDiscoveryResult {
  apps: DiscoveredApp[];
  totalServers: number;
  errors: string[];
}

/**
 * Interface for app discovery service.
 */
export interface IAppDiscoveryService {
  scan(): Promise<AppDiscoveryResult>;
  scanApp(template: AppTemplate): Promise<DiscoveredApp | null>;
  getKnownApps(): AppTemplate[];
  importServers(appId: string): Promise<ParsedServerConfig[]>;
}

/**
 * Pre-configured app templates for known MCP clients.
 */
const KNOWN_APPS: AppTemplate[] = [
  {
    id: 'claude-desktop',
    name: 'Claude Desktop',
    description: 'Anthropic Claude Desktop application',
    configPaths: {
      darwin: '~/Library/Application Support/Claude/claude_desktop_config.json',
      win32: '%APPDATA%/Claude/claude_desktop_config.json',
      linux: '~/.config/Claude/claude_desktop_config.json',
    },
    parser: 'claude',
  },
  {
    id: 'cursor',
    name: 'Cursor',
    description: 'Cursor AI-powered code editor',
    configPaths: {
      darwin: '~/.cursor/mcp.json',
      win32: '%USERPROFILE%/.cursor/mcp.json',
      linux: '~/.cursor/mcp.json',
    },
    parser: 'cursor',
  },
  {
    id: 'vscode',
    name: 'VS Code',
    description: 'Visual Studio Code with MCP extensions',
    configPaths: {
      darwin: '~/Library/Application Support/Code/User/settings.json',
      win32: '%APPDATA%/Code/User/settings.json',
      linux: '~/.config/Code/User/settings.json',
    },
    parser: 'vscode',
  },
  {
    id: 'cline',
    name: 'Cline',
    description: 'Cline VS Code extension MCP configuration',
    configPaths: {
      darwin: '~/.cline/mcp_settings.json',
      win32: '%USERPROFILE%/.cline/mcp_settings.json',
      linux: '~/.cline/mcp_settings.json',
    },
    parser: 'generic',
  },
  {
    id: 'continue',
    name: 'Continue',
    description: 'Continue VS Code extension',
    configPaths: {
      darwin: '~/.continue/config.json',
      win32: '%USERPROFILE%/.continue/config.json',
      linux: '~/.continue/config.json',
    },
    parser: 'generic',
  },
  {
    id: 'windsurf',
    name: 'Windsurf',
    description: 'Windsurf IDE by Codeium',
    configPaths: {
      darwin: '~/.windsurf/mcp.json',
      win32: '%USERPROFILE%/.windsurf/mcp.json',
      linux: '~/.windsurf/mcp.json',
    },
    parser: 'generic',
  },
];

/**
 * App discovery service for scanning MCP configurations.
 */
@injectable()
export class AppDiscoveryService implements IAppDiscoveryService {
  constructor(
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.DxtProcessor) private dxtProcessor: DxtProcessor
  ) {}

  /**
   * Scan all known app locations for MCP configurations.
   */
  async scan(): Promise<AppDiscoveryResult> {
    const result: AppDiscoveryResult = {
      apps: [],
      totalServers: 0,
      errors: [],
    };

    for (const template of KNOWN_APPS) {
      try {
        const app = await this.scanApp(template);
        if (app) {
          result.apps.push(app);
          result.totalServers += app.servers.length;
        }
      } catch (error) {
        result.errors.push(
          `Failed to scan ${template.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    this.logger.info('App discovery scan complete', {
      appsFound: result.apps.length,
      totalServers: result.totalServers,
      errors: result.errors.length,
    });

    return result;
  }

  /**
   * Scan a specific app for MCP configuration.
   */
  async scanApp(template: AppTemplate): Promise<DiscoveredApp | null> {
    const configPath = this.resolveConfigPath(template);
    
    if (!configPath) {
      return null;
    }

    const app: DiscoveredApp = {
      id: template.id,
      name: template.name,
      description: template.description,
      configPath,
      exists: existsSync(configPath),
      servers: [],
      lastScanned: Date.now(),
    };

    if (!app.exists) {
      return app;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      let parseResult;

      switch (template.parser) {
        case 'claude':
          parseResult = this.dxtProcessor.parseClaudeDesktopConfig(content);
          break;
        case 'cursor':
          parseResult = this.dxtProcessor.parseCursorConfig(content);
          break;
        case 'vscode':
          parseResult = this.dxtProcessor.parseVSCodeConfig(content);
          break;
        default:
          parseResult = this.dxtProcessor.parseFile(content, template.name);
      }

      app.servers = parseResult.servers;

      if (parseResult.warnings.length > 0) {
        this.logger.warn(`Warnings parsing ${template.name} config`, {
          warnings: parseResult.warnings,
        });
      }

    } catch (error) {
      this.logger.error(`Failed to parse ${template.name} config`, {
        configPath,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return app;
  }

  /**
   * Get list of known app templates.
   */
  getKnownApps(): AppTemplate[] {
    return [...KNOWN_APPS];
  }

  /**
   * Import servers from a discovered app.
   */
  async importServers(appId: string): Promise<ParsedServerConfig[]> {
    const template = KNOWN_APPS.find((app) => app.id === appId);
    
    if (!template) {
      throw new Error(`Unknown app: ${appId}`);
    }

    const app = await this.scanApp(template);
    
    if (!app || !app.exists) {
      throw new Error(`App configuration not found: ${template.name}`);
    }

    return app.servers;
  }

  /**
   * Resolve config path for current platform.
   */
  private resolveConfigPath(template: AppTemplate): string | null {
    const currentPlatform = platform() as 'darwin' | 'win32' | 'linux';
    const pathTemplate = template.configPaths[currentPlatform];

    if (!pathTemplate) {
      return null;
    }

    // Expand path variables
    let resolvedPath = pathTemplate;

    // Replace ~ with home directory
    if (resolvedPath.startsWith('~')) {
      resolvedPath = join(homedir(), resolvedPath.slice(1));
    }

    // Replace %APPDATA% (Windows)
    if (resolvedPath.includes('%APPDATA%')) {
      resolvedPath = resolvedPath.replace('%APPDATA%', process.env.APPDATA || '');
    }

    // Replace %USERPROFILE% (Windows)
    if (resolvedPath.includes('%USERPROFILE%')) {
      resolvedPath = resolvedPath.replace('%USERPROFILE%', homedir());
    }

    return resolvedPath;
  }
}

export default AppDiscoveryService;
