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
} from '@main/core/interfaces';

// @ts-ignore - MCP SDK uses package exports
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// @ts-ignore - MCP SDK uses package exports
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// @ts-ignore - MCP SDK uses package exports
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// @ts-ignore - MCP SDK uses package exports
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';

/**
 * MCP SDK-based client instance for a single server.
 * Replaces the custom JSON-RPC implementation with official MCP SDK Client.
 * @see Issue #68
 */
class McpClientInstance implements IMcpClient {
  private connected = false;
  private client: InstanceType<typeof Client> | null = null;
  private transport: InstanceType<typeof StdioClientTransport> | InstanceType<typeof StreamableHTTPClientTransport> | InstanceType<typeof SSEClientTransport> | null = null;

  constructor(
    private server: MCPServer,
    private logger: ILogger
  ) {}

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    this.logger.info('Connecting to MCP server via SDK', {
      serverId: this.server.id,
      name: this.server.name,
      transport: this.server.transport,
    });

    // Create the MCP SDK Client
    this.client = new Client({
      name: 'mcp-router',
      version: '1.0.0',
    }, {
      capabilities: {
        roots: { listChanged: true },
        sampling: {},
      },
    });

    // Create transport based on server configuration
    if (this.server.transport === 'stdio') {
      this.transport = new StdioClientTransport({
        command: this.server.command,
        args: this.server.args,
        env: {
          ...process.env as Record<string, string>,
          ...this.server.env,
        },
      });
    } else if (this.server.transport === 'http') {
      if (!this.server.url) {
        throw new Error('URL is required for HTTP transport');
      }
      this.transport = new StreamableHTTPClientTransport(
        new URL(this.server.url)
      );
    } else if (this.server.transport === 'sse') {
      if (!this.server.url) {
        throw new Error('URL is required for SSE transport');
      }
      this.transport = new SSEClientTransport(
        new URL(this.server.url)
      );
    } else {
      throw new Error(`Unsupported transport: ${this.server.transport}`);
    }

    // Connect the client to the transport (handles initialization handshake)
    await this.client.connect(this.transport);

    this.connected = true;
    this.logger.info('Successfully connected to MCP server via SDK', {
      serverId: this.server.id,
      name: this.server.name,
    });
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    this.logger.info('Disconnecting from MCP server', { serverId: this.server.id });

    try {
      await this.client?.close();
    } catch (error) {
      this.logger.warn('Error closing MCP client', {
        serverId: this.server.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    try {
      await this.transport?.close?.();
    } catch (error) {
      this.logger.warn('Error closing transport', {
        serverId: this.server.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    this.client = null;
    this.transport = null;
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  async listTools(): Promise<MCPTool[]> {
    this.ensureConnected();

    const response = await this.client!.listTools();

    return (response.tools || []).map(tool => ({
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>,
      serverId: this.server.id,
      serverName: this.server.name,
    }));
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
    this.ensureConnected();

    this.logger.info('Calling MCP tool via SDK', {
      serverId: this.server.id,
      name,
    });

    const response = await this.client!.callTool({ name, arguments: args });
    return response;
  }

  async listResources(): Promise<McpResource[]> {
    this.ensureConnected();

    const response = await this.client!.listResources();

    return (response.resources || []).map(resource => ({
      uri: resource.uri,
      name: resource.name,
      description: resource.description,
      mimeType: resource.mimeType,
    }));
  }

  async readResource(uri: string): Promise<McpResourceContent> {
    this.ensureConnected();

    const response = await this.client!.readResource({ uri });

    const content = response.contents[0];
    return {
      uri: content?.uri ?? uri,
      mimeType: content?.mimeType,
      text: (content as any)?.text,
      blob: (content as any)?.blob,
    };
  }

  async listPrompts(): Promise<McpPrompt[]> {
    this.ensureConnected();

    const response = await this.client!.listPrompts();

    return (response.prompts || []).map(prompt => ({
      name: prompt.name,
      description: prompt.description,
      arguments: prompt.arguments?.map(arg => ({
        name: arg.name,
        description: arg.description,
        required: arg.required,
      })),
    }));
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<McpPromptMessage[]> {
    this.ensureConnected();

    const response = await this.client!.getPrompt({ name, arguments: args });

    return (response.messages || []).map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: {
        type: (msg.content as any).type as 'text' | 'image' | 'resource',
        text: (msg.content as any).text,
      },
    }));
  }

  private ensureConnected(): void {
    if (!this.connected || !this.client) {
      throw new Error(`Not connected to MCP server: ${this.server.name}`);
    }
  }
}

/**
 * Factory for creating and managing MCP client instances.
 * Each server gets its own independent SDK-based client instance.
 * @see Issue #68
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
      this.logger.info('Creating MCP SDK client for server', {
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
