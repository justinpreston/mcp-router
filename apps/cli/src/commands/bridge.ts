/**
 * Bridge command - stdio-to-HTTP bridge for MCP Router.
 *
 * Creates a stdio MCP server that bridges to MCP Router's HTTP endpoint.
 * This allows stdio-based clients (Claude Desktop, Cursor, etc.) to use
 * MCP Router without native HTTP support.
 *
 * Usage:
 *   mcpr bridge --port 3282 --token <token>
 *   mcpr bridge --url http://localhost:3282/mcp --token <token>
 *
 * @see Issue #67
 */

import { Command } from 'commander';
import chalk from 'chalk';

// @ts-ignore - MCP SDK uses package exports
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
// @ts-ignore
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
// @ts-ignore
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
// @ts-ignore
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
// @ts-ignore
import {
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ListToolsRequestSchema,
  ReadResourceRequestSchema,
  GetPromptRequestSchema,
  ListPromptsRequestSchema,
  InitializeRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';

const DEFAULT_PORT = 3282;
const DEFAULT_HOST = 'localhost';

/**
 * HTTP to stdio MCP Bridge.
 *
 * Connects to MCP Router's StreamableHTTP endpoint and exposes it as a
 * stdio MCP server. This enables clients that only support stdio transport
 * (e.g., Claude Desktop via config) to connect to MCP Router.
 */
class HttpMcpBridge {
  private server: InstanceType<typeof Server>;
  private client: InstanceType<typeof Client>;
  private httpTransport: InstanceType<typeof StreamableHTTPClientTransport>;
  private connected = false;
  private baseUrl: string;

  constructor(options: { url: string; token?: string; project?: string }) {
    this.baseUrl = options.url;

    // Set up HTTP client transport with auth + project headers
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.token) {
      headers['Authorization'] = `Bearer ${options.token}`;
    }
    if (options.project) {
      headers['X-MCPR-Project'] = options.project;
    }

    this.httpTransport = new StreamableHTTPClientTransport(
      new URL(options.url),
      {
        sessionId: undefined,
        requestInit: { headers },
      }
    );

    // Initialize HTTP client (connects upstream to MCP Router)
    this.client = new Client(
      { name: 'mcp-router-bridge', version: '1.0.0' },
      { capabilities: {} }
    );

    // Initialize stdio server (faces the local AI client)
    this.server = new Server(
      { name: 'mcp-router', version: '1.0.0' },
      {
        capabilities: {
          resources: {},
          tools: {},
          prompts: {},
        },
      }
    );

    this.setupRequestHandlers();

    this.server.onerror = (error: Error) => {
      console.error('[MCP Router Bridge] Error:', error.message);
    };
  }

  /**
   * Set up MCP request handlers that proxy to MCP Router's HTTP endpoint.
   */
  private setupRequestHandlers(): void {
    // Initialize - connect to MCP Router on first request
    this.server.setRequestHandler(InitializeRequestSchema, async (request: any) => {
      try {
        if (!this.connected) {
          await this.client.connect(this.httpTransport);
          this.connected = true;
          console.error(`[MCP Router Bridge] Connected to ${this.baseUrl}`);
        }

        return {
          protocolVersion: request.params.protocolVersion,
          capabilities: {
            resources: {},
            tools: {},
            prompts: {},
          },
          serverInfo: {
            name: 'mcp-router',
            version: '1.0.0',
          },
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[MCP Router Bridge] Connection failed:', message);
        throw new McpError(ErrorCode.InternalError, `Failed to connect to MCP Router: ${message}`);
      }
    });

    // List Tools - proxy to MCP Router
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      try {
        const result = await this.client.listTools();
        return { tools: result.tools ?? [] };
      } catch (error: unknown) {
        console.error('[MCP Router Bridge] listTools error:', error);
        return { tools: [] };
      }
    });

    // Call Tool - proxy to MCP Router
    this.server.setRequestHandler(CallToolRequestSchema, async (request: any) => {
      try {
        const result = await this.client.callTool({
          name: request.params.name,
          arguments: request.params.arguments,
        });
        return { content: (result as any).content };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[MCP Router Bridge] callTool error:', message);
        return { content: [{ type: 'text' as const, text: `Error: ${message}` }] };
      }
    });

    // List Resources - proxy to MCP Router
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      try {
        const result = await this.client.listResources();
        return { resources: result.resources ?? [] };
      } catch (error: unknown) {
        console.error('[MCP Router Bridge] listResources error:', error);
        return { resources: [] };
      }
    });

    // Read Resource - proxy to MCP Router
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request: any) => {
      try {
        const result = await this.client.readResource({ uri: request.params.uri });
        return { contents: result.contents };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[MCP Router Bridge] readResource error:', message);
        return { contents: [{ type: 'text', text: `Error: ${message}` }] };
      }
    });

    // List Prompts - proxy to MCP Router
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      try {
        const result = await this.client.listPrompts();
        return { prompts: result.prompts ?? [] };
      } catch (error: unknown) {
        console.error('[MCP Router Bridge] listPrompts error:', error);
        return { prompts: [] };
      }
    });

    // Get Prompt - proxy to MCP Router
    this.server.setRequestHandler(GetPromptRequestSchema, async (request: any) => {
      try {
        const result = await this.client.getPrompt({
          name: request.params.name,
          arguments: request.params.arguments,
        });
        return {
          description: result.description,
          messages: result.messages,
        };
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        console.error('[MCP Router Bridge] getPrompt error:', message);
        return {
          messages: [{ role: 'user' as const, content: { type: 'text' as const, text: `Error: ${message}` } }],
        };
      }
    });
  }

  /**
   * Start the stdio bridge.
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();

    // Handle stream errors
    process.stdin.on('error', (err: Error) => {
      console.error('[MCP Router Bridge] stdin error:', err.message);
      process.exit(1);
    });

    process.stdout.on('error', (err: Error) => {
      console.error('[MCP Router Bridge] stdout error:', err.message);
      process.exit(1);
    });

    await this.server.connect(transport);
    console.error(`[MCP Router Bridge] Stdio bridge started, proxying to ${this.baseUrl}`);
  }

  /**
   * Stop the bridge.
   */
  async stop(): Promise<void> {
    try {
      await this.server.close();
      if (this.connected) {
        await this.client.close();
      }
    } catch (error) {
      console.error('[MCP Router Bridge] Error stopping:', error);
    }
  }
}

/**
 * Build the MCP Router URL from host/port or explicit URL.
 */
function buildUrl(options: { host: string; port: number; url?: string }): string {
  if (options.url) {
    const url = new URL(options.url);
    if (url.pathname === '/' || url.pathname === '') {
      url.pathname = '/mcp';
    }
    return url.toString().replace(/\/+$/, '');
  }
  return `http://${options.host}:${options.port}/mcp`;
}

export const bridgeCommand = new Command('bridge')
  .description('Start a stdio-to-HTTP bridge for MCP Router (for Claude Desktop, Cursor, etc.)')
  .option('-h, --host <host>', 'MCP Router host', DEFAULT_HOST)
  .option('-p, --port <port>', 'MCP Router port', String(DEFAULT_PORT))
  .option('-u, --url <url>', 'Full MCP Router URL (overrides host/port)')
  .option('-t, --token <token>', 'Authentication token')
  .option('--project <project>', 'Project ID or slug for scoped access')
  .action(async (options) => {
    const token = options.token || process.env.MCPR_TOKEN;
    const project = options.project || process.env.MCPR_PROJECT;

    if (!token) {
      console.error(chalk.red('Error: No authentication token provided'));
      console.error(chalk.yellow('\nProvide a token using:'));
      console.error(chalk.gray('  --token <token>'));
      console.error(chalk.gray('  MCPR_TOKEN environment variable'));
      process.exit(1);
    }

    const url = buildUrl({
      host: options.host,
      port: parseInt(options.port, 10),
      url: options.url,
    });

    console.error(chalk.blue(`[MCP Router Bridge] Connecting to ${url}`));
    if (project) {
      console.error(chalk.blue(`[MCP Router Bridge] Project scope: ${project}`));
    }

    const bridge = new HttpMcpBridge({ url, token, project });

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.error(chalk.yellow('\n[MCP Router Bridge] Shutting down...'));
      await bridge.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await bridge.stop();
      process.exit(0);
    });

    try {
      await bridge.start();
    } catch (error) {
      console.error(chalk.red(`\nFailed to start bridge: ${error instanceof Error ? error.message : 'Unknown error'}`));
      process.exit(1);
    }
  });
