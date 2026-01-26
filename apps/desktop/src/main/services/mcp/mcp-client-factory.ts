import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IMcpClientFactory,
  IMcpClient,
  ILogger,
  MCPServer,
  MCPTool,
  McpResource,
  McpResourceContent,
  McpPrompt,
  McpPromptMessage,
  JsonRpcMessage,
} from '@main/core/interfaces';
import { spawn, ChildProcess } from 'child_process';

/**
 * Standalone MCP client instance for a single server.
 * Each server gets its own client with independent transport.
 */
class McpClientInstance implements IMcpClient {
  private connected = false;
  private process: ChildProcess | null = null;
  private buffer = '';
  private pendingRequests = new Map<string | number, {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private nextId = 1;
  private readonly defaultTimeout = 30000;

  constructor(
    private server: MCPServer,
    private logger: ILogger
  ) {}

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.logger.info('Connecting to MCP server', {
      serverId: this.server.id,
      name: this.server.name,
      transport: this.server.transport,
    });

    if (this.server.transport === 'stdio') {
      await this.connectStdio();
    } else if (this.server.transport === 'sse' || this.server.transport === 'http') {
      // For SSE/HTTP, we'll use fetch-based communication
      await this.connectHttp();
    }

    // Initialize MCP protocol handshake
    await this.initialize();

    this.connected = true;
    this.logger.info('Successfully connected to MCP server', {
      serverId: this.server.id,
      name: this.server.name,
    });
  }

  private async connectStdio(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(this.server.command, this.server.args, {
          env: {
            ...process.env,
            ...this.server.env,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false,
        });

        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleStdoutData(data);
        });

        this.process.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            this.logger.debug('MCP server stderr', {
              serverId: this.server.id,
              message,
            });
          }
        });

        this.process.on('error', (error: Error) => {
          this.logger.error('MCP server process error', {
            serverId: this.server.id,
            error: error.message,
          });
          this.connected = false;
          reject(error);
        });

        this.process.on('close', (code: number | null) => {
          this.logger.info('MCP server process closed', {
            serverId: this.server.id,
            code,
          });
          this.connected = false;
        });

        this.process.on('spawn', () => {
          this.logger.info('MCP server process spawned', {
            serverId: this.server.id,
            pid: this.process?.pid,
          });
          resolve();
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  private async connectHttp(): Promise<void> {
    // For HTTP/SSE transports, just validate the URL is accessible
    if (!this.server.url) {
      throw new Error('URL is required for HTTP/SSE transport');
    }

    // Try a simple connection test
    try {
      const response = await fetch(this.server.url, {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok && response.status !== 405) {
        throw new Error(`HTTP connection failed: ${response.status}`);
      }
    } catch (error) {
      // Connection might work for POST requests even if HEAD fails
      this.logger.warn('HTTP HEAD check failed, proceeding anyway', {
        serverId: this.server.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.logger.info('Disconnecting from MCP server', { serverId: this.server.id });

    // Cancel all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();

    if (this.process) {
      this.process.kill('SIGTERM');
      // Force kill after timeout
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
      this.process = null;
    }

    this.connected = false;
  }

  isConnected(): boolean {
    if (this.server.transport === 'stdio') {
      return this.connected && this.process !== null && !this.process.killed;
    }
    return this.connected;
  }

  async listTools(): Promise<MCPTool[]> {
    this.ensureConnected();

    const response = await this.sendRequest<{
      tools: Array<{
        name: string;
        description?: string;
        inputSchema: Record<string, unknown>;
      }>;
    }>('tools/list', {});

    // Map to MCPTool format with server info
    return response.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      serverId: this.server.id,
      serverName: this.server.name,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.ensureConnected();

    this.logger.info('Calling MCP tool', {
      serverId: this.server.id,
      name,
    });

    const response = await this.sendRequest<{
      content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      isError?: boolean;
    }>('tools/call', { name, arguments: args });

    return response;
  }

  async listResources(): Promise<McpResource[]> {
    this.ensureConnected();

    const response = await this.sendRequest<{
      resources: Array<{
        uri: string;
        name: string;
        description?: string;
        mimeType?: string;
      }>;
    }>('resources/list', {});

    return response.resources;
  }

  async readResource(uri: string): Promise<McpResourceContent> {
    this.ensureConnected();

    const response = await this.sendRequest<{
      contents: Array<{
        uri: string;
        mimeType?: string;
        text?: string;
        blob?: string;
      }>;
    }>('resources/read', { uri });

    const content = response.contents[0];
    return {
      uri: content?.uri ?? uri,
      mimeType: content?.mimeType,
      text: content?.text,
      blob: content?.blob,
    };
  }

  async listPrompts(): Promise<McpPrompt[]> {
    this.ensureConnected();

    const response = await this.sendRequest<{
      prompts: Array<{
        name: string;
        description?: string;
        arguments?: Array<{
          name: string;
          description?: string;
          required?: boolean;
        }>;
      }>;
    }>('prompts/list', {});

    return response.prompts;
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<McpPromptMessage[]> {
    this.ensureConnected();

    const response = await this.sendRequest<{
      description?: string;
      messages: Array<{
        role: string;
        content: { type: string; text?: string };
      }>;
    }>('prompts/get', { name, arguments: args });

    return response.messages.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: {
        type: msg.content.type as 'text' | 'image' | 'resource',
        text: msg.content.text,
      },
    }));
  }

  private async initialize(): Promise<void> {
    this.logger.debug('Initializing MCP connection', { serverId: this.server.id });

    const response = await this.sendRequest<{
      protocolVersion: string;
      capabilities: Record<string, unknown>;
      serverInfo: { name: string; version: string };
    }>('initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
      clientInfo: {
        name: 'mcp-router',
        version: '1.0.0',
      },
    });

    // Log server capabilities (could be stored for future use)
    this.logger.debug('Server capabilities', { capabilities: response.capabilities });

    this.logger.info('MCP server initialized', {
      serverId: this.server.id,
      serverName: response.serverInfo.name,
      serverVersion: response.serverInfo.version,
    });

    // Send initialized notification
    this.sendNotification('notifications/initialized', {});
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error(`Not connected to MCP server: ${this.server.name}`);
    }
    if (this.server.transport === 'stdio' && (!this.process || this.process.killed)) {
      this.connected = false;
      throw new Error(`MCP server process is not running: ${this.server.name}`);
    }
  }

  private async sendRequest<T>(method: string, params: unknown, timeoutMs = this.defaultTimeout): Promise<T> {
    const id = this.nextId++;

    const request = {
      jsonrpc: '2.0' as const,
      id,
      method,
      params,
    };

    if (this.server.transport === 'stdio') {
      return this.sendStdioRequest<T>(request, timeoutMs);
    } else {
      return this.sendHttpRequest<T>(request, timeoutMs);
    }
  }

  private async sendStdioRequest<T>(request: { jsonrpc: '2.0'; id: number; method: string; params: unknown }, timeoutMs: number): Promise<T> {
    if (!this.process?.stdin?.writable) {
      throw new Error('Process stdin not available');
    }

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(request.id);
        reject(new Error(`Request timed out after ${timeoutMs}ms: ${request.method}`));
      }, timeoutMs);

      this.pendingRequests.set(request.id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
      });

      const json = JSON.stringify(request);
      this.process!.stdin!.write(json + '\n');
    });
  }

  private async sendHttpRequest<T>(request: { jsonrpc: '2.0'; id: number; method: string; params: unknown }, timeoutMs: number): Promise<T> {
    if (!this.server.url) {
      throw new Error('URL not configured for HTTP transport');
    }

    const response = await fetch(this.server.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      throw new Error(`HTTP request failed: ${response.status} ${response.statusText}`);
    }

    const jsonResponse = await response.json() as {
      jsonrpc: '2.0';
      id: number;
      result?: T;
      error?: { code: number; message: string; data?: unknown };
    };

    if (jsonResponse.error) {
      throw new Error(`JSON-RPC error ${jsonResponse.error.code}: ${jsonResponse.error.message}`);
    }

    return jsonResponse.result as T;
  }

  private sendNotification(method: string, params: unknown): void {
    const notification = {
      jsonrpc: '2.0',
      method,
      params,
    };

    if (this.server.transport === 'stdio' && this.process?.stdin?.writable) {
      const json = JSON.stringify(notification);
      this.process.stdin.write(json + '\n');
    }
    // For HTTP, notifications are typically not supported
  }

  private handleStdoutData(data: Buffer): void {
    this.buffer += data.toString();

    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line) {
        try {
          const message = JSON.parse(line) as JsonRpcMessage;
          this.handleResponse(message);
        } catch (error) {
          this.logger.warn('Failed to parse JSON-RPC message', {
            serverId: this.server.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  }

  private handleResponse(message: JsonRpcMessage): void {
    if ('id' in message && message.id !== undefined && ('result' in message || 'error' in message)) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        clearTimeout(pending.timeout);

        if ('error' in message && message.error) {
          const err = message.error as { code: number; message: string };
          pending.reject(new Error(`JSON-RPC error ${err.code}: ${err.message}`));
        } else {
          pending.resolve((message as { result: unknown }).result);
        }
      }
    }
  }
}

/**
 * Factory for creating and managing MCP client instances.
 * Each server gets its own independent client instance.
 */
@injectable()
export class McpClientFactory implements IMcpClientFactory {
  private clients = new Map<string, IMcpClient>();

  constructor(
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  /**
   * Create a new MCP client for a server.
   * If a client already exists for this server, returns the existing one.
   */
  createClient(server: MCPServer): IMcpClient {
    let client = this.clients.get(server.id);

    if (!client) {
      this.logger.info('Creating MCP client for server', {
        serverId: server.id,
        name: server.name,
        transport: server.transport,
      });

      client = new McpClientInstance(server, this.logger);
      this.clients.set(server.id, client);
    }

    return client;
  }

  /**
   * Get an existing client for a server.
   */
  getClient(serverId: string): IMcpClient | undefined {
    return this.clients.get(serverId);
  }

  /**
   * Remove a client (e.g., when server is stopped).
   */
  async removeClient(serverId: string): Promise<void> {
    const client = this.clients.get(serverId);
    if (client) {
      try {
        await client.disconnect();
      } catch (error) {
        this.logger.warn('Error disconnecting client', {
          serverId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
      this.clients.delete(serverId);
      this.logger.info('Removed MCP client', { serverId });
    }
  }

  /**
   * Get all active clients.
   */
  getAllClients(): Map<string, IMcpClient> {
    return new Map(this.clients);
  }
}
