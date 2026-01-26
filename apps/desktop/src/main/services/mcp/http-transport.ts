import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  ILogger,
  IHttpTransport,
  HttpTransportOptions,
  JsonRpcRequest,
  JsonRpcResponse,
} from '@main/core/interfaces';

/**
 * HTTP transport for HTTP-based MCP servers.
 * Sends JSON-RPC requests via POST and receives responses.
 */
@injectable()
export class HttpTransport implements IHttpTransport {
  private baseUrl: string | null = null;
  private headers: Record<string, string> = {};
  private timeout = 30000;
  private connected = false;
  private abortController: AbortController | null = null;

  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  /**
   * Connect to an HTTP-based MCP server.
   */
  async connect(url: string, options?: HttpTransportOptions): Promise<void> {
    this.logger.info('Connecting to HTTP MCP server', { url });

    // Validate URL
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Must be http or https.`);
      }
      this.baseUrl = url;
    } catch (error) {
      throw new Error(`Invalid URL: ${url}`);
    }

    // Apply options
    if (options?.headers) {
      this.headers = { ...this.headers, ...options.headers };
    }
    if (options?.timeout) {
      this.timeout = options.timeout;
    }

    // Test connection with a ping or initialize request
    try {
      await this.testConnection();
      this.connected = true;
      this.logger.info('Successfully connected to HTTP MCP server');
    } catch (error) {
      this.logger.error('Failed to connect to HTTP MCP server', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Send a JSON-RPC request and receive the response.
   */
  async send(message: JsonRpcRequest): Promise<JsonRpcResponse> {
    if (!this.baseUrl || !this.connected) {
      throw new Error('Not connected to HTTP MCP server');
    }

    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => this.abortController?.abort(), this.timeout);

    try {
      this.logger.debug('Sending HTTP request', {
        method: message.method,
        id: message.id,
      });

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(message),
        signal: this.abortController.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const jsonResponse = (await response.json()) as JsonRpcResponse;

      this.logger.debug('Received HTTP response', {
        id: jsonResponse.id,
        hasError: !!jsonResponse.error,
      });

      return jsonResponse;
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Request timed out after ${this.timeout}ms`);
      }

      this.logger.error('HTTP request failed', {
        method: message.method,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      throw error;
    } finally {
      this.abortController = null;
    }
  }

  /**
   * Disconnect from the HTTP server.
   */
  disconnect(): void {
    this.logger.info('Disconnecting from HTTP MCP server');

    // Abort any pending requests
    this.abortController?.abort();
    this.abortController = null;

    this.baseUrl = null;
    this.connected = false;
    this.headers = {};
  }

  /**
   * Check if connected to the server.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the current base URL.
   */
  getBaseUrl(): string | null {
    return this.baseUrl;
  }

  /**
   * Test the connection to the server.
   */
  private async testConnection(): Promise<void> {
    if (!this.baseUrl) {
      throw new Error('Base URL not set');
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      // Send an initialize request to test the connection
      const testRequest: JsonRpcRequest = {
        jsonrpc: '2.0',
        id: 'connection-test',
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: {
            name: 'mcp-router',
            version: '1.0.0',
          },
        },
      };

      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(testRequest),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Connection test failed: ${response.status} ${response.statusText}`);
      }

      const jsonResponse = (await response.json()) as JsonRpcResponse;

      if (jsonResponse.error) {
        throw new Error(`Server error: ${jsonResponse.error.message}`);
      }

      this.logger.debug('Connection test successful', {
        serverInfo: jsonResponse.result,
      });
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`Connection test timed out after ${this.timeout}ms`);
      }

      throw error;
    }
  }
}
