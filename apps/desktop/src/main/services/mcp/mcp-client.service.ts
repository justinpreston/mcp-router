import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  ILogger,
  IMcpClient,
  IJsonRpcHandler,
  IStdioTransport,
  StdioTransportOptions,
  MCPTool,
  McpResource,
  McpResourceContent,
  McpPrompt,
  McpPromptMessage,
} from '@main/core/interfaces';

export interface McpClientOptions {
  command: string;
  args: string[];
  transportOptions?: StdioTransportOptions;
}

/**
 * MCP Client implementation that communicates with MCP servers.
 * Uses stdio transport and JSON-RPC 2.0 protocol.
 */
@injectable()
export class McpClientService implements IMcpClient {
  private connected = false;
  private _serverCapabilities: Record<string, unknown> = {};
  private clientOptions?: McpClientOptions;

  /** Get the server capabilities discovered during initialization */
  get serverCapabilities(): Record<string, unknown> {
    return this._serverCapabilities;
  }

  constructor(
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.JsonRpcHandler) private jsonRpcHandler: IJsonRpcHandler,
    @inject(TYPES.StdioTransport) private transport: IStdioTransport
  ) {
    // Wire up transport to JSON-RPC handler
    this.transport.onMessage((message) => {
      this.jsonRpcHandler.handleMessage(message);
    });

    this.transport.onError((error) => {
      this.logger.error('MCP transport error', { error: error.message });
      this.connected = false;
    });

    this.transport.onClose((code) => {
      this.logger.info('MCP transport closed', { code });
      this.connected = false;
    });
  }

  /**
   * Set connection options (used before calling connect).
   */
  setOptions(options: McpClientOptions): void {
    this.clientOptions = options;
  }

  /**
   * Connect to an MCP server by spawning a process.
   */
  async connect(): Promise<void> {
    if (!this.clientOptions) {
      throw new Error('Connection options not set. Call setOptions() first.');
    }

    const options = this.clientOptions;
    this.logger.info('Connecting to MCP server', {
      command: options.command,
      args: options.args,
    });

    try {
      // Spawn the server process
      await this.transport.spawn(
        options.command,
        options.args,
        options.transportOptions
      );

      // Set up message sending
      this.jsonRpcHandler.setSendFunction((message) => {
        this.transport.send(message);
      });

      // Initialize the connection with MCP protocol
      await this.initialize();

      this.connected = true;
      this.logger.info('Successfully connected to MCP server');
    } catch (error) {
      this.logger.error('Failed to connect to MCP server', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.logger.info('Disconnecting from MCP server');

    try {
      // Send shutdown notification (optional, best-effort)
      this.jsonRpcHandler.sendNotification('shutdown', {});
    } catch {
      // Ignore errors during shutdown notification
    }

    this.transport.kill();
    this.connected = false;
  }

  /**
   * Check if connected to the server.
   */
  isConnected(): boolean {
    return this.connected && this.transport.isRunning();
  }

  /**
   * List all tools available from the MCP server.
   */
  async listTools(): Promise<MCPTool[]> {
    this.ensureConnected();

    const response = await this.jsonRpcHandler.sendRequest<{ tools: MCPTool[] }>(
      'tools/list',
      {}
    );

    this.logger.debug('Listed tools', { count: response.tools.length });
    return response.tools;
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    this.ensureConnected();

    this.logger.info('Calling MCP tool', { name, args });

    const response = await this.jsonRpcHandler.sendRequest<{
      content: Array<{ type: string; text?: string; data?: string; mimeType?: string }>;
      isError?: boolean;
    }>('tools/call', { name, arguments: args });

    this.logger.debug('Tool call result', {
      name,
      isError: response.isError,
      contentTypes: response.content.map((c) => c.type),
    });

    return response;
  }

  /**
   * List all resources available from the MCP server.
   */
  async listResources(): Promise<McpResource[]> {
    this.ensureConnected();

    const response = await this.jsonRpcHandler.sendRequest<{ resources: McpResource[] }>(
      'resources/list',
      {}
    );

    this.logger.debug('Listed resources', { count: response.resources.length });
    return response.resources;
  }

  /**
   * Read a resource from the MCP server.
   */
  async readResource(uri: string): Promise<McpResourceContent> {
    this.ensureConnected();

    this.logger.info('Reading MCP resource', { uri });

    const response = await this.jsonRpcHandler.sendRequest<{
      contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }>;
    }>('resources/read', { uri });

    // Return the first content item as McpResourceContent
    const content = response.contents[0];
    return {
      uri: content?.uri ?? uri,
      mimeType: content?.mimeType,
      text: content?.text,
      blob: content?.blob,
    };
  }

  /**
   * List all prompts available from the MCP server.
   */
  async listPrompts(): Promise<McpPrompt[]> {
    this.ensureConnected();

    const response = await this.jsonRpcHandler.sendRequest<{ prompts: McpPrompt[] }>(
      'prompts/list',
      {}
    );

    this.logger.debug('Listed prompts', { count: response.prompts.length });
    return response.prompts;
  }

  /**
   * Get a prompt from the MCP server with optional arguments.
   */
  async getPrompt(
    name: string,
    args?: Record<string, string>
  ): Promise<McpPromptMessage[]> {
    this.ensureConnected();

    this.logger.info('Getting MCP prompt', { name, args });

    const response = await this.jsonRpcHandler.sendRequest<{
      description?: string;
      messages: Array<{ role: string; content: { type: string; text?: string } }>;
    }>('prompts/get', { name, arguments: args });

    // Transform to McpPromptMessage format
    return response.messages.map((msg) => ({
      role: msg.role as 'user' | 'assistant',
      content: {
        type: msg.content.type as 'text' | 'image' | 'resource',
        text: msg.content.text,
      },
    }));
  }

  /**
   * Ensure the client is connected before making requests.
   */
  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Not connected to MCP server');
    }
    if (!this.transport.isRunning()) {
      this.connected = false;
      throw new Error('MCP server process is not running');
    }
  }

  /**
   * Initialize the MCP connection with protocol handshake.
   */
  private async initialize(): Promise<void> {
    this.logger.debug('Initializing MCP connection');

    const response = await this.jsonRpcHandler.sendRequest<{
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

    this._serverCapabilities = response.capabilities;

    this.logger.info('MCP server initialized', {
      serverName: response.serverInfo.name,
      serverVersion: response.serverInfo.version,
      protocolVersion: response.protocolVersion,
    });

    // Send initialized notification
    this.jsonRpcHandler.sendNotification('notifications/initialized', {});
  }
}
