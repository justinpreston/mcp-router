import { injectable, inject } from 'inversify';
import { spawn, ChildProcess } from 'child_process';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IServerManager,
  IServerRepository,
  ILogger,
  IAuditService,
  IMcpClientFactory,
  MCPServer,
  MCPTool,
  ServerStatus,
} from '@main/core/interfaces';

const MAX_SERVERS = 100; // Maximum number of servers to track in memory
const MAX_RUNNING_SERVERS = 20; // Maximum concurrent running servers

/**
 * Server manager with bounded Map and proper lifecycle management.
 * Fixes ISSUE-5: Unbounded in-memory Maps.
 */
@injectable()
export class ServerManager implements IServerManager {
  // LRU cache for server instances
  private servers: Map<string, MCPServer> = new Map();
  private processes: Map<string, ChildProcess> = new Map();
  private accessOrder: string[] = []; // For LRU tracking

  constructor(
    @inject(TYPES.ServerRepository) private serverRepo: IServerRepository,
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.AuditService) private auditService: IAuditService,
    @inject(TYPES.McpClientFactory) private mcpClientFactory: IMcpClientFactory
  ) {
    this.loadServersFromDatabase();
  }

  /**
   * Load servers from database into memory cache.
   */
  private async loadServersFromDatabase(): Promise<void> {
    try {
      const servers = await this.serverRepo.findAll();
      for (const server of servers) {
        this.addToCache(server);
      }
      this.logger.info('Loaded servers from database', { count: servers.length });
    } catch (error) {
      this.logger.error('Failed to load servers from database', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Add server to LRU cache with eviction if needed.
   */
  private addToCache(server: MCPServer): void {
    // Remove from current position in access order
    const existingIndex = this.accessOrder.indexOf(server.id);
    if (existingIndex !== -1) {
      this.accessOrder.splice(existingIndex, 1);
    }

    // Add to end (most recently used)
    this.accessOrder.push(server.id);
    this.servers.set(server.id, server);

    // Evict oldest if over limit (only non-running servers)
    while (this.servers.size > MAX_SERVERS) {
      const oldestId = this.accessOrder.find(id => {
        const s = this.servers.get(id);
        return s && s.status === 'stopped';
      });

      if (oldestId) {
        this.servers.delete(oldestId);
        this.accessOrder = this.accessOrder.filter(id => id !== oldestId);
        this.logger.debug('Evicted server from cache', { serverId: oldestId });
      } else {
        break; // Can't evict running servers
      }
    }
  }

  /**
   * Mark server as recently accessed (for LRU).
   */
  private touchCache(serverId: string): void {
    const index = this.accessOrder.indexOf(serverId);
    if (index !== -1) {
      this.accessOrder.splice(index, 1);
      this.accessOrder.push(serverId);
    }
  }

  async startServer(serverId: string): Promise<void> {
    const server = await this.getServerInternal(serverId);

    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (server.status === 'running') {
      this.logger.warn('Server already running', { serverId });
      return;
    }

    // Check running server limit
    const runningCount = this.getRunningServers().length;
    if (runningCount >= MAX_RUNNING_SERVERS) {
      throw new Error(`Maximum running servers (${MAX_RUNNING_SERVERS}) reached`);
    }

    await this.updateServerStatus(serverId, 'starting');

    try {
      const childProcess = spawn(server.command, server.args, {
        env: { ...process.env, ...server.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        detached: false,
      });

      childProcess.on('error', async (error: Error) => {
        this.logger.error('Server process error', {
          serverId,
          error: error.message,
        });
        await this.updateServerStatus(serverId, 'error', error.message);
        this.processes.delete(serverId);
      });

      childProcess.on('exit', async (code: number | null, signal: NodeJS.Signals | null) => {
        this.logger.info('Server process exited', {
          serverId,
          code,
          signal,
        });

        const exitStatus: ServerStatus = code === 0 ? 'stopped' : 'error';
        await this.updateServerStatus(
          serverId,
          exitStatus,
          code !== 0 ? `Exited with code ${code}` : undefined
        );
        this.processes.delete(serverId);
      });

      // Log stdout/stderr
      childProcess.stdout?.on('data', (data: Buffer) => {
        this.logger.debug('Server stdout', {
          serverId,
          data: data.toString().slice(0, 500), // Truncate for logs
        });
      });

      childProcess.stderr?.on('data', (data: Buffer) => {
        this.logger.warn('Server stderr', {
          serverId,
          data: data.toString().slice(0, 500),
        });
      });

      this.processes.set(serverId, childProcess);
      await this.updateServerStatus(serverId, 'running');

      await this.auditService.log({
        type: 'server.start',
        serverId,
        success: true,
      });

      this.logger.info('Server started', { serverId, pid: childProcess.pid });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      await this.updateServerStatus(serverId, 'error', errorMessage);

      await this.auditService.log({
        type: 'server.start',
        serverId,
        success: false,
        metadata: { error: errorMessage },
      });

      throw error;
    }
  }

  async stopServer(serverId: string): Promise<void> {
    const server = await this.getServerInternal(serverId);

    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (server.status !== 'running' && server.status !== 'starting') {
      this.logger.warn('Server not running', { serverId, status: server.status });
      return;
    }

    const process = this.processes.get(serverId);
    if (!process) {
      this.logger.warn('No process found for server', { serverId });
      await this.updateServerStatus(serverId, 'stopped');
      return;
    }

    await this.updateServerStatus(serverId, 'stopping');

    // Graceful shutdown with timeout
    return new Promise((resolve, _reject) => {
      const timeout = setTimeout(() => {
        this.logger.warn('Server stop timeout, forcing kill', { serverId });
        process.kill('SIGKILL');
      }, 5000);

      process.once('exit', async () => {
        clearTimeout(timeout);
        this.processes.delete(serverId);
        await this.updateServerStatus(serverId, 'stopped');

        await this.auditService.log({
          type: 'server.stop',
          serverId,
          success: true,
        });

        this.logger.info('Server stopped', { serverId });
        resolve();
      });

      process.kill('SIGTERM');
    });
  }

  async restartServer(serverId: string): Promise<void> {
    await this.stopServer(serverId);
    await this.startServer(serverId);
  }

  getServer(serverId: string): MCPServer | undefined {
    this.touchCache(serverId);
    return this.servers.get(serverId);
  }

  getAllServers(): MCPServer[] {
    return Array.from(this.servers.values());
  }

  getServersByProject(projectId: string): MCPServer[] {
    return this.getAllServers().filter(s => s.projectId === projectId);
  }

  getRunningServers(): MCPServer[] {
    return this.getAllServers().filter(s => s.status === 'running');
  }

  async addServer(
    config: Omit<MCPServer, 'id' | 'createdAt' | 'updatedAt' | 'status'>
  ): Promise<MCPServer> {
    const now = Date.now();
    const server: MCPServer = {
      id: `server-${nanoid(12)}`,
      ...config,
      status: 'stopped',
      createdAt: now,
      updatedAt: now,
    };

    await this.serverRepo.create(server);
    this.addToCache(server);

    this.logger.info('Server added', { serverId: server.id, name: server.name });
    return server;
  }

  async updateServer(serverId: string, updates: Partial<MCPServer>): Promise<MCPServer> {
    const server = await this.getServerInternal(serverId);

    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Don't allow updating certain fields
    const { id: _id, createdAt: _createdAt, status: _status, ...allowedUpdates } = updates;

    const updatedServer: MCPServer = {
      ...server,
      ...allowedUpdates,
      updatedAt: Date.now(),
    };

    await this.serverRepo.update(updatedServer);
    this.addToCache(updatedServer);

    this.logger.info('Server updated', { serverId });
    return updatedServer;
  }

  async removeServer(serverId: string): Promise<void> {
    const server = await this.getServerInternal(serverId);

    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    // Stop if running
    if (server.status === 'running' || server.status === 'starting') {
      await this.stopServer(serverId);
    }

    await this.serverRepo.delete(serverId);
    this.servers.delete(serverId);
    this.accessOrder = this.accessOrder.filter(id => id !== serverId);

    this.logger.info('Server removed', { serverId });
  }

  async getServerTools(serverId: string): Promise<MCPTool[]> {
    const server = await this.getServerInternal(serverId);

    if (!server) {
      throw new Error(`Server not found: ${serverId}`);
    }

    if (server.status !== 'running') {
      throw new Error('Server must be running to list tools');
    }

    // Use the MCP client factory to get tools
    try {
      let client = this.mcpClientFactory.getClient(serverId);

      if (!client) {
        client = this.mcpClientFactory.createClient(server);
      }

      if (!client.isConnected()) {
        await client.connect();
      }

      const tools = await client.listTools();
      this.logger.debug('Retrieved tools from server', {
        serverId,
        toolCount: tools.length,
      });

      return tools;
    } catch (error) {
      this.logger.error('Failed to get server tools', {
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get server from cache or database.
   */
  private async getServerInternal(serverId: string): Promise<MCPServer | null> {
    // Check cache first
    const cachedServer = this.servers.get(serverId);

    if (cachedServer) {
      this.touchCache(serverId);
      return cachedServer;
    }

    // Try database
    const dbServer = await this.serverRepo.findById(serverId);
    if (dbServer) {
      this.addToCache(dbServer);
      return dbServer;
    }

    return null;
  }

  /**
   * Update server status in cache and database.
   */
  private async updateServerStatus(
    serverId: string,
    status: ServerStatus,
    lastError?: string
  ): Promise<void> {
    const server = this.servers.get(serverId);
    if (server) {
      server.status = status;
      server.lastError = lastError;
      server.updatedAt = Date.now();

      await this.serverRepo.update(server);
    }
  }
}
