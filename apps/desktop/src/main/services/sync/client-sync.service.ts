import { injectable, inject } from 'inversify';
import { promises as fs } from 'fs';
import { homedir } from 'os';
import { join, dirname } from 'path';
import { TYPES } from '@main/core/types';
import type {
  IClientSyncService,
  IServerManager,
  ILogger,
  ClientAppId,
  ClientApp,
  ClientMCPServerConfig,
  SyncResult,
  MCPServer,
} from '@main/core/interfaces';

const HOME = homedir();

/**
 * Get the config file path for a client app, accounting for platform differences.
 * Supports macOS, Windows, and Linux.
 */
function getPlatformConfigPath(clientId: ClientAppId): string {
  switch (clientId) {
    case 'claude':
      return getClaudeConfigPath();
    case 'cursor':
      return join(HOME, '.cursor', 'mcp.json');
    case 'windsurf':
      return join(HOME, '.codeium', 'windsurf', 'mcp_config.json');
    case 'vscode':
      return getVSCodeConfigPath();
    case 'cline':
      return getClineConfigPath();
    default:
      return '';
  }
}

function getClaudeConfigPath(): string {
  switch (process.platform) {
    case 'win32':
      return join(HOME, 'AppData', 'Roaming', 'Claude', 'claude_desktop_config.json');
    case 'darwin':
      return join(HOME, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    default: // linux
      return join(HOME, '.config', 'Claude', 'claude_desktop_config.json');
  }
}

function getVSCodeConfigPath(): string {
  switch (process.platform) {
    case 'win32':
      return join(HOME, 'AppData', 'Roaming', 'Code', 'User', 'mcp.json');
    case 'darwin':
      return join(HOME, 'Library', 'Application Support', 'Code', 'User', 'mcp.json');
    default: // linux
      return join(HOME, '.config', 'Code', 'User', 'mcp.json');
  }
}

function getClineConfigPath(): string {
  const globalStorageDir = getVSCodeGlobalStorageDir();
  return join(globalStorageDir, 'saoudrizwan.claude-dev', 'settings', 'cline_mcp_settings.json');
}

function getVSCodeGlobalStorageDir(): string {
  switch (process.platform) {
    case 'win32':
      return join(HOME, 'AppData', 'Roaming', 'Code', 'User', 'globalStorage');
    case 'darwin':
      return join(HOME, 'Library', 'Application Support', 'Code', 'User', 'globalStorage');
    default: // linux
      return join(HOME, '.config', 'Code', 'User', 'globalStorage');
  }
}

/**
 * Human-readable names for each client app.
 */
const CLIENT_NAMES: Record<ClientAppId, string> = {
  claude: 'Claude Desktop',
  cursor: 'Cursor',
  windsurf: 'Windsurf',
  vscode: 'VS Code',
  cline: 'Cline',
};

/**
 * JSON key where servers are stored in each client's config.
 */
const SERVERS_KEY: Record<ClientAppId, string> = {
  claude: 'mcpServers',
  cursor: 'mcpServers',
  windsurf: 'mcpServers',
  vscode: 'servers',
  cline: 'mcpServers',
};

/**
 * MCP Router CLI bridge configuration.
 * This is automatically added to client configs when syncing.
 */
const MCP_ROUTER_BRIDGE_CONFIG: ClientMCPServerConfig = {
  command: 'npx',
  args: ['@mcp-router/cli', 'bridge', '--url', 'http://localhost:3847/mcp'],
};

/**
 * Client sync service for managing AI client configurations.
 * Enables import/export of MCP server configs with Claude, Cursor, etc.
 */
@injectable()
export class ClientSyncService implements IClientSyncService {
  constructor(
    @inject(TYPES.ServerManager) private serverManager: IServerManager,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  /**
   * List all supported client apps and their installation status.
   */
  async listClients(): Promise<ClientApp[]> {
    const clients: ClientApp[] = [];

    const clientIds: ClientAppId[] = ['claude', 'cursor', 'vscode', 'windsurf', 'cline'];
    for (const id of clientIds) {
      const installed = await this.isClientInstalled(id);
      let serverCount = 0;

      if (installed) {
        try {
          const servers = await this.getClientServers(id);
          serverCount = Object.keys(servers).length;
        } catch {
          // Config might be invalid, count as 0
        }
      }

      clients.push({
        id,
        name: CLIENT_NAMES[id],
        installed,
        configPath: this.getConfigPath(id),
        serverCount,
      });
    }

    return clients;
  }

  /**
   * Get the config file path for a client.
   */
  getConfigPath(clientId: ClientAppId): string {
    return getPlatformConfigPath(clientId);
  }

  /**
   * Check if a client is installed by verifying config file exists.
   */
  async isClientInstalled(clientId: ClientAppId): Promise<boolean> {
    const configPath = this.getConfigPath(clientId);
    try {
      await fs.access(configPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Read and parse a client's config file.
   */
  private async readConfig(clientId: ClientAppId): Promise<Record<string, unknown> | null> {
    const configPath = this.getConfigPath(clientId);
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      this.logger.debug(`Failed to read config for ${clientId}`, { error });
      return null;
    }
  }

  /**
   * Write config to a client's config file with backup.
   */
  private async writeConfig(
    clientId: ClientAppId,
    config: Record<string, unknown>
  ): Promise<void> {
    const configPath = this.getConfigPath(clientId);

    // Create backup before writing
    try {
      const existing = await fs.readFile(configPath, 'utf-8');
      const backupPath = `${configPath}.backup.${Date.now()}`;
      await fs.writeFile(backupPath, existing, 'utf-8');
      this.logger.debug(`Created backup at ${backupPath}`);
    } catch {
      // No existing file, skip backup
    }

    // Ensure directory exists
    const dir = dirname(configPath);
    await fs.mkdir(dir, { recursive: true });

    // Write new config
    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
    this.logger.info(`Updated config for ${clientId}`, { path: configPath });
  }

  /**
   * Get servers configured in a client app.
   */
  async getClientServers(clientId: ClientAppId): Promise<Record<string, ClientMCPServerConfig>> {
    const config = await this.readConfig(clientId);
    if (!config) return {};

    const serversKey = SERVERS_KEY[clientId];
    const servers = config[serversKey] as Record<string, ClientMCPServerConfig> | undefined;

    return servers ?? {};
  }

  /**
   * Import servers from a client app into MCP Router.
   */
  async importFromClient(clientId: ClientAppId): Promise<SyncResult> {
    const result: SyncResult = {
      clientId,
      imported: 0,
      exported: 0,
      errors: [],
    };

    try {
      const clientServers = await this.getClientServers(clientId);
      const existingServers = this.serverManager.getAllServers();
      const existingNames = new Set(existingServers.map((s) => s.name));

      for (const [name, serverConfig] of Object.entries(clientServers)) {
        // Skip MCP Router's own bridge
        if (name === 'mcp-router' || name === 'ai-hub') {
          continue;
        }

        // Skip if server already exists
        if (existingNames.has(name)) {
          this.logger.debug(`Skipping existing server: ${name}`);
          continue;
        }

        try {
          // Determine transport type
          const isHttp =
            serverConfig.type === 'http' ||
            serverConfig.type === 'sse' ||
            serverConfig.type === 'streamable-http';
          const transport = isHttp ? 'http' : 'stdio';

          // Validate required fields
          if (isHttp && !serverConfig.url) {
            result.errors.push(`Skipping ${name}: HTTP server requires url`);
            continue;
          }
          if (!isHttp && !serverConfig.command) {
            result.errors.push(`Skipping ${name}: stdio server requires command`);
            continue;
          }

          // Create server in MCP Router
          await this.serverManager.addServer({
            name,
            description: `Imported from ${CLIENT_NAMES[clientId]}`,
            command: serverConfig.command ?? '',
            args: serverConfig.args ?? [],
            env: serverConfig.env,
            transport: transport as 'stdio' | 'http',
            url: serverConfig.url,
            toolPermissions: {},
          });

          result.imported++;
          this.logger.info(`Imported server: ${name}`, { from: clientId });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to import ${name}: ${message}`);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Import failed: ${message}`);
    }

    return result;
  }

  /**
   * Export MCP Router servers to a client app.
   */
  async exportToClient(clientId: ClientAppId, serverIds?: string[]): Promise<SyncResult> {
    const result: SyncResult = {
      clientId,
      imported: 0,
      exported: 0,
      errors: [],
    };

    try {
      // Get servers to export
      let servers: MCPServer[];
      if (serverIds && serverIds.length > 0) {
        servers = serverIds
          .map((id) => this.serverManager.getServer(id))
          .filter((s): s is MCPServer => s !== undefined);
      } else {
        servers = this.serverManager.getAllServers();
      }

      // Read existing client config
      let config = (await this.readConfig(clientId)) ?? {};
      const serversKey = SERVERS_KEY[clientId];

      // Get or initialize servers object
      const clientServers = (config[serversKey] as Record<string, ClientMCPServerConfig>) ?? {};

      // Add MCP Router bridge (the recommended way to connect)
      clientServers['mcp-router'] = MCP_ROUTER_BRIDGE_CONFIG;

      // Optionally export individual servers (not recommended, but supported)
      for (const server of servers) {
        try {
          const serverConfig: ClientMCPServerConfig = {
            command: server.command,
            args: server.args,
            env: server.env,
          };

          if (server.transport === 'http' && server.url) {
            serverConfig.type = 'streamable-http';
            serverConfig.url = server.url;
            delete serverConfig.command;
            delete serverConfig.args;
          }

          clientServers[server.name] = serverConfig;
          result.exported++;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          result.errors.push(`Failed to export ${server.name}: ${message}`);
        }
      }

      // Write updated config
      config[serversKey] = clientServers;
      await this.writeConfig(clientId, config);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      result.errors.push(`Export failed: ${message}`);
    }

    return result;
  }
}
