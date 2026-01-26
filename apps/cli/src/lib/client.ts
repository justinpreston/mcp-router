/**
 * MCP Client - HTTP client for communicating with MCP Router.
 */

interface ClientOptions {
  host: string;
  port: number;
  token: string;
}

interface ServerInfo {
  version: string;
  serverCount: number;
}

interface Server {
  id: string;
  name: string;
  status: string;
  transport: string;
  toolCount?: number;
}

interface Tool {
  name: string;
  description?: string;
  serverName?: string;
  serverId?: string;
  enabled: boolean;
}

interface Token {
  id: string;
  name: string;
  clientId: string;
  expiresAt: number;
  scopes: string[];
}

interface Policy {
  id: string;
  name: string;
  scope: string;
  action: string;
  pattern: string;
}

interface ToolResult {
  content?: Array<{
    type: string;
    text?: string;
    mimeType?: string;
    uri?: string;
  }>;
  isError?: boolean;
}

interface CallOptions {
  serverId?: string;
  timeout?: number;
}

export class McpClient {
  private baseUrl: string;
  private token: string;

  constructor(options: ClientOptions) {
    this.baseUrl = `http://${options.host}:${options.port}`;
    this.token = options.token;
  }

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`HTTP ${response.status}: ${error}`);
    }

    return response.json() as Promise<T>;
  }

  /**
   * Get server information.
   */
  async getServerInfo(): Promise<ServerInfo> {
    return this.request<ServerInfo>('/api/info');
  }

  /**
   * List all registered servers.
   */
  async listServers(): Promise<Server[]> {
    return this.request<Server[]>('/api/servers');
  }

  /**
   * List available tools.
   */
  async listTools(serverId?: string): Promise<Tool[]> {
    const path = serverId
      ? `/api/servers/${serverId}/tools`
      : '/api/tools';
    return this.request<Tool[]>(path);
  }

  /**
   * List tokens.
   */
  async listTokens(): Promise<Token[]> {
    return this.request<Token[]>('/api/tokens');
  }

  /**
   * List policies.
   */
  async listPolicies(): Promise<Policy[]> {
    return this.request<Policy[]>('/api/policies');
  }

  /**
   * Call a tool.
   */
  async callTool(
    toolName: string,
    args: Record<string, unknown>,
    options: CallOptions = {}
  ): Promise<ToolResult> {
    const path = options.serverId
      ? `/api/servers/${options.serverId}/tools/${toolName}/call`
      : `/api/tools/${toolName}/call`;

    const controller = new AbortController();
    const timeout = options.timeout || 30000;
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      return await this.request<ToolResult>(path, {
        method: 'POST',
        body: JSON.stringify({ arguments: args }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Start a server.
   */
  async startServer(serverId: string): Promise<void> {
    await this.request(`/api/servers/${serverId}/start`, {
      method: 'POST',
    });
  }

  /**
   * Stop a server.
   */
  async stopServer(serverId: string): Promise<void> {
    await this.request(`/api/servers/${serverId}/stop`, {
      method: 'POST',
    });
  }
}
