/**
 * DXT (Desktop Experience Transfer) Format Parser
 * 
 * DXT is a format for sharing MCP server configurations between applications.
 * This module parses DXT files and converts them to MCP Router server configs.
 */

import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { ILogger } from '@main/core/interfaces';

/**
 * DXT manifest structure (based on Claude Desktop config format).
 */
export interface DxtManifest {
  mcpServers?: Record<string, DxtServerConfig>;
  version?: string;
  metadata?: {
    name?: string;
    description?: string;
    author?: string;
  };
}

/**
 * DXT server configuration.
 */
export interface DxtServerConfig {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  description?: string;
  // Extended DXT fields
  transport?: 'stdio' | 'sse' | 'http';
  url?: string;
  headers?: Record<string, string>;
}

/**
 * Parsed MCP server configuration.
 */
export interface ParsedServerConfig {
  name: string;
  command: string;
  args: string[];
  env: Record<string, string>;
  transport: 'stdio' | 'sse' | 'http';
  description?: string;
  url?: string;
  headers?: Record<string, string>;
  source: string;
}

/**
 * DXT parse result.
 */
export interface DxtParseResult {
  success: boolean;
  servers: ParsedServerConfig[];
  errors: string[];
  warnings: string[];
}

/**
 * Interface for DXT processor.
 */
export interface IDxtProcessor {
  parseFile(content: string, source: string): DxtParseResult;
  parseClaudeDesktopConfig(content: string): DxtParseResult;
  parseCursorConfig(content: string): DxtParseResult;
  parseVSCodeConfig(content: string): DxtParseResult;
  validateServerConfig(config: DxtServerConfig): string[];
}

/**
 * DXT format processor for parsing MCP server configurations.
 */
@injectable()
export class DxtProcessor implements IDxtProcessor {
  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  /**
   * Parse a DXT/JSON configuration file.
   */
  parseFile(content: string, source: string): DxtParseResult {
    const result: DxtParseResult = {
      success: false,
      servers: [],
      errors: [],
      warnings: [],
    };

    try {
      const manifest = JSON.parse(content) as DxtManifest;
      
      if (!manifest.mcpServers) {
        result.errors.push('No mcpServers found in configuration');
        return result;
      }

      for (const [name, config] of Object.entries(manifest.mcpServers)) {
        const validationErrors = this.validateServerConfig(config);
        
        if (validationErrors.length > 0) {
          result.warnings.push(`Server "${name}": ${validationErrors.join(', ')}`);
          continue;
        }

        result.servers.push({
          name,
          command: config.command,
          args: config.args || [],
          env: config.env || {},
          transport: config.transport || 'stdio',
          description: config.description,
          url: config.url,
          headers: config.headers,
          source,
        });
      }

      result.success = result.servers.length > 0;
      
      this.logger.info('Parsed DXT configuration', {
        source,
        serverCount: result.servers.length,
        warnings: result.warnings.length,
      });

    } catch (error) {
      result.errors.push(`Failed to parse JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Parse Claude Desktop configuration format.
   * Location: ~/Library/Application Support/Claude/claude_desktop_config.json (macOS)
   *           %APPDATA%/Claude/claude_desktop_config.json (Windows)
   */
  parseClaudeDesktopConfig(content: string): DxtParseResult {
    return this.parseFile(content, 'Claude Desktop');
  }

  /**
   * Parse Cursor MCP configuration format.
   * Location: ~/.cursor/mcp.json
   */
  parseCursorConfig(content: string): DxtParseResult {
    return this.parseFile(content, 'Cursor');
  }

  /**
   * Parse VS Code MCP configuration format.
   * Location: .vscode/mcp.json or settings.json
   */
  parseVSCodeConfig(content: string): DxtParseResult {
    const result: DxtParseResult = {
      success: false,
      servers: [],
      errors: [],
      warnings: [],
    };

    try {
      const config = JSON.parse(content);
      
      // VS Code can have MCP config in different locations
      const mcpConfig = config['mcp'] || config['mcp.servers'] || config.mcpServers;
      
      if (!mcpConfig) {
        result.errors.push('No MCP configuration found');
        return result;
      }

      // If it's nested under servers
      const servers = mcpConfig.servers || mcpConfig;
      
      if (typeof servers !== 'object') {
        result.errors.push('Invalid MCP configuration format');
        return result;
      }

      for (const [name, serverConfig] of Object.entries(servers)) {
        const config = serverConfig as DxtServerConfig;
        
        if (!config.command && !config.url) {
          result.warnings.push(`Server "${name}": Missing command or url`);
          continue;
        }

        result.servers.push({
          name,
          command: config.command || '',
          args: config.args || [],
          env: config.env || {},
          transport: config.transport || (config.url ? 'sse' : 'stdio'),
          description: config.description,
          url: config.url,
          headers: config.headers,
          source: 'VS Code',
        });
      }

      result.success = result.servers.length > 0;

    } catch (error) {
      result.errors.push(`Failed to parse config: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
  }

  /**
   * Validate a server configuration.
   */
  validateServerConfig(config: DxtServerConfig): string[] {
    const errors: string[] = [];

    // Either command (stdio) or url (sse/http) must be present
    if (!config.command && !config.url) {
      errors.push('Missing command or url');
    }

    // Validate command if present
    if (config.command) {
      if (typeof config.command !== 'string' || config.command.trim() === '') {
        errors.push('Invalid command');
      }
    }

    // Validate url if present
    if (config.url) {
      try {
        new URL(config.url);
      } catch {
        errors.push('Invalid url format');
      }
    }

    // Validate args
    if (config.args && !Array.isArray(config.args)) {
      errors.push('args must be an array');
    }

    // Validate env
    if (config.env && typeof config.env !== 'object') {
      errors.push('env must be an object');
    }

    // Validate transport
    if (config.transport && !['stdio', 'sse', 'http'].includes(config.transport)) {
      errors.push('Invalid transport type');
    }

    return errors;
  }
}

export default DxtProcessor;
