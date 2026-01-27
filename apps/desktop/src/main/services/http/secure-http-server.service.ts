import { injectable, inject } from 'inversify';
import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { z } from 'zod';
import { createServer, Server } from 'http';
import { TYPES } from '@main/core/types';
import type {
  IHttpServer,
  IConfig,
  ILogger,
  ITokenValidator,
  IProjectService,
  IMcpAggregator,
  IServerManager,
  IBuiltinToolsService,
  MCPTool,
} from '@main/core/interfaces';
import { BUILTIN_SERVER_ID } from '@main/core/interfaces';

/**
 * Security-hardened Express HTTP server.
 * Implements CRITICAL-1 (CORS), HIGH-4 (rate limiting), LOW-2 (security headers) fixes.
 * Supports project-scoped routing via X-MCPR-Project header.
 */
@injectable()
export class SecureHttpServer implements IHttpServer {
  private app: Application;
  private server: Server | null = null;
  private port: number | undefined;
  /** Active SSE connections for streaming responses */
  private sseConnections: Map<string, Response> = new Map();

  constructor(
    @inject(TYPES.Config) private config: IConfig,
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.TokenValidator) private tokenValidator: ITokenValidator,
    @inject(TYPES.ProjectService) private projectService: IProjectService,
    @inject(TYPES.McpAggregator) private mcpAggregator: IMcpAggregator,
    @inject(TYPES.ServerManager) private serverManager: IServerManager,
    @inject(TYPES.BuiltinToolsService) private builtinToolsService: IBuiltinToolsService
  ) {
    this.app = express();
    this.configureMiddleware();
    this.configureRoutes();
    this.configureErrorHandling();
  }

  /**
   * Configure security middleware stack.
   */
  private configureMiddleware(): void {
    // 1. Security headers via helmet
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"], // Required for some UI frameworks
            imgSrc: ["'self'", 'data:', 'https:'],
            connectSrc: ["'self'"],
            fontSrc: ["'self'"],
            objectSrc: ["'none'"],
            mediaSrc: ["'self'"],
            frameSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
            frameAncestors: ["'none'"],
            upgradeInsecureRequests: [],
          },
        },
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: { policy: 'same-origin' },
        crossOriginResourcePolicy: { policy: 'same-origin' },
        dnsPrefetchControl: { allow: false },
        hsts: { maxAge: 31536000, includeSubDomains: true },
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: { permittedPolicies: 'none' },
        referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
        xssFilter: true,
      })
    );

    // 2. Restrictive CORS - FIX for CRITICAL-1
    const allowedOrigins = this.config.get<string[]>('http.allowedOrigins', [
      'app://.',
      'http://localhost:5173', // Vite dev server
    ]);

    this.app.use(
      cors({
        origin: (origin, callback) => {
          // Allow requests with no origin (same-origin requests, Electron)
          if (!origin) {
            return callback(null, true);
          }

          // Check against allowlist
          const isAllowed = allowedOrigins.some(allowed => {
            if (allowed.includes('*')) {
              const pattern = new RegExp('^' + allowed.replace(/\*/g, '.*') + '$');
              return pattern.test(origin);
            }
            return origin === allowed;
          });

          if (isAllowed) {
            callback(null, true);
          } else {
            this.logger.warn('CORS blocked request from unauthorized origin', { origin });
            callback(new Error('CORS not allowed'));
          }
        },
        credentials: true,
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-MCPR-Project'],
        exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining', 'X-RateLimit-Reset', 'X-MCPR-Project'],
        maxAge: 86400, // 24 hours
      })
    );

    // 3. Rate limiting - FIX for HIGH-4
    const globalLimiter = rateLimit({
      windowMs: 60 * 1000, // 1 minute
      max: this.config.get<number>('http.rateLimit.global', 100),
      message: { error: 'Too many requests, please try again later' },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => {
        // Use token ID if available, otherwise IP
        const token = this.extractToken(req);
        return token || req.ip || 'unknown';
      },
      handler: (req: Request, res: Response) => {
        this.logger.warn('Rate limit exceeded', {
          ip: req.ip,
          path: req.path,
          token: this.extractToken(req) ? '[REDACTED]' : undefined,
        });
        res.status(429).json({ error: 'Rate limit exceeded' });
      },
    });

    // Stricter limit for MCP endpoints
    const mcpLimiter = rateLimit({
      windowMs: 60 * 1000,
      max: this.config.get<number>('http.rateLimit.mcp', 60),
      message: { error: 'MCP rate limit exceeded' },
      standardHeaders: true,
      legacyHeaders: false,
      keyGenerator: (req: Request) => {
        const token = this.extractToken(req);
        return token ? `mcp:${token}` : `mcp:${req.ip}`;
      },
    });

    this.app.use(globalLimiter);
    this.app.use('/mcp', mcpLimiter);

    // 4. Request size limits
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '1mb' }));

    // 5. Request ID tracking
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string || this.generateRequestId();
      req.headers['x-request-id'] = requestId;
      res.setHeader('X-Request-ID', requestId);
      next();
    });

    // 6. Request logging (without sensitive data)
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      const requestId = req.headers['x-request-id'];

      res.on('finish', () => {
        const duration = Date.now() - startTime;
        this.logger.info('HTTP request', {
          requestId,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration,
          // Never log tokens or sensitive headers
        });
      });

      next();
    });
  }

  /**
   * Configure API routes.
   */
  private configureRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Token validation middleware for protected routes
    const requireAuth = async (req: Request, res: Response, next: NextFunction) => {
      const token = this.extractToken(req);

      if (!token) {
        return res.status(401).json({ error: 'Authorization required' });
      }

      try {
        const result = await this.tokenValidator.validate(token);

        if (!result.valid) {
          this.logger.warn('Invalid token used', {
            error: result.error,
            // Don't log the actual token
          });
          return res.status(401).json({ error: result.error || 'Invalid token' });
        }

        // Attach validated token to request for downstream use
        (req as AuthenticatedRequest).token = result.token!;
        next();
      } catch (error) {
        this.logger.error('Token validation error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        return res.status(500).json({ error: 'Authentication error' });
      }
    };

    // Project context middleware - extracts and validates X-MCPR-Project header
    const extractProjectContext = async (req: Request, res: Response, next: NextFunction) => {
      const projectHeader = req.headers['x-mcpr-project'] as string | undefined;
      const authReq = req as AuthenticatedRequest;

      if (!projectHeader) {
        // No project specified - will use default/global context
        authReq.projectId = undefined;
        authReq.projectSlug = undefined;
        return next();
      }

      try {
        // Try to find project by ID first
        let project = await this.projectService.getProject(projectHeader);

        // If not found by ID, try by slug
        if (!project) {
          project = await this.projectService.getProjectBySlug(projectHeader);
        }

        if (!project) {
          this.logger.warn('Project not found', {
            projectHeader,
            clientId: authReq.token?.clientId,
          });
          return res.status(404).json({
            error: 'Project not found',
            code: 'PROJECT_NOT_FOUND',
            project: projectHeader,
          });
        }

        // Check if the project is active
        if (!project.active) {
          this.logger.warn('Access to inactive project denied', {
            projectId: project.id,
            projectSlug: project.slug,
            active: project.active,
            clientId: authReq.token?.clientId,
          });
          return res.status(403).json({
            error: 'Project is not active',
            code: 'PROJECT_INACTIVE',
          });
        }

        // Attach project context to request
        authReq.projectId = project.id;
        authReq.projectSlug = project.slug;

        // Echo back the resolved project ID in response header
        res.setHeader('X-MCPR-Project', project.id);

        this.logger.debug('Project context resolved', {
          projectId: project.id,
          projectSlug: project.slug,
          clientId: authReq.token?.clientId,
        });

        next();
      } catch (error) {
        this.logger.error('Project context extraction error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          projectHeader,
        });
        return res.status(500).json({ error: 'Failed to resolve project context' });
      }
    };

    // MCP routes (protected, with project context)
    // Use type assertion for handlers that receive AuthenticatedRequest after middleware validation
    this.app.post('/mcp/tools/call', requireAuth, extractProjectContext, this.handleToolCall.bind(this) as unknown as express.RequestHandler);
    this.app.get('/mcp/tools/list', requireAuth, extractProjectContext, this.handleToolList.bind(this) as unknown as express.RequestHandler);
    this.app.get('/mcp/resources/list', requireAuth, extractProjectContext, this.handleResourceList.bind(this) as unknown as express.RequestHandler);
    this.app.get('/mcp/resources/read', requireAuth, extractProjectContext, this.handleResourceRead.bind(this) as unknown as express.RequestHandler);

    // JSON-RPC 2.0 endpoint for MCP protocol (Issue #16)
    this.app.post('/mcp', requireAuth, extractProjectContext, this.handleJsonRpc.bind(this) as unknown as express.RequestHandler);

    // SSE endpoint for streaming responses (with project context) (Issue #17)
    this.app.get('/mcp/sse', requireAuth, extractProjectContext, this.handleSseConnection.bind(this) as unknown as express.RequestHandler);

    // Project info endpoint - returns the resolved project for the request
    this.app.get('/mcp/project', requireAuth, extractProjectContext, (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;
      if (!authReq.projectId) {
        return res.json({
          projectId: null,
          projectSlug: null,
          message: 'No project context - using global scope',
        });
      }
      res.json({
        projectId: authReq.projectId,
        projectSlug: authReq.projectSlug,
      });
    });
  }

  /**
   * Configure error handling.
   */
  private configureErrorHandling(): void {
    // 404 handler
    this.app.use((_req: Request, res: Response) => {
      res.status(404).json({ error: 'Not found' });
    });

    // Global error handler - never expose internal errors
    this.app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
      const requestId = req.headers['x-request-id'];

      this.logger.error('Unhandled error', {
        requestId,
        error: err.message,
        stack: this.config.isDevelopment ? err.stack : undefined,
      });

      // Never expose internal error details to clients
      res.status(500).json({
        error: 'Internal server error',
        requestId,
      });
    });
  }

  /**
   * Extract bearer token from request.
   */
  private extractToken(req: Request): string | undefined {
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return undefined;
  }

  /**
   * Generate a unique request ID.
   */
  private generateRequestId(): string {
    return `req_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  }

  // ============================================================================
  // Route Handlers
  // ============================================================================

  /**
   * JSON-RPC 2.0 schema for request validation.
   */
  private static readonly JsonRpcRequestSchema = z.object({
    jsonrpc: z.literal('2.0'),
    id: z.union([z.string(), z.number()]),
    method: z.string(),
    params: z.record(z.unknown()).optional(),
  });

  /**
   * Tool call request schema.
   */
  private static readonly ToolCallSchema = z.object({
    server_id: z.string(),
    tool_name: z.string(),
    arguments: z.record(z.unknown()).optional().default({}),
  });

  /**
   * POST /mcp - Main JSON-RPC 2.0 endpoint for MCP protocol (Issue #16)
   * Handles all MCP methods: tools/list, tools/call, resources/list, resources/read, prompts/list, prompts/get
   */
  private async handleJsonRpc(req: AuthenticatedRequest, res: Response): Promise<void> {
    const requestId = req.headers['x-request-id'] as string;

    try {
      // Validate JSON-RPC request format
      const parseResult = SecureHttpServer.JsonRpcRequestSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          jsonrpc: '2.0',
          id: null,
          error: {
            code: -32600,
            message: 'Invalid Request',
            data: parseResult.error.flatten(),
          },
        });
        return;
      }

      const { id, method, params } = parseResult.data;

      this.logger.debug('JSON-RPC request received', {
        requestId,
        method,
        projectId: req.projectId,
      });

      // Route to appropriate handler based on method
      let result: unknown;
      switch (method) {
        case 'tools/list':
          result = await this.jsonRpcToolsList(req);
          break;

        case 'tools/call':
          result = await this.jsonRpcToolsCall(req, params);
          break;

        case 'resources/list':
          result = await this.jsonRpcResourcesList(req, params);
          break;

        case 'resources/read':
          result = await this.jsonRpcResourcesRead(req, params);
          break;

        case 'prompts/list':
          result = await this.jsonRpcPromptsList(req);
          break;

        case 'prompts/get':
          result = await this.jsonRpcPromptsGet(req, params);
          break;

        case 'ping':
          result = { pong: true, timestamp: Date.now() };
          break;

        default:
          res.status(200).json({
            jsonrpc: '2.0',
            id,
            error: {
              code: -32601,
              message: 'Method not found',
              data: { method },
            },
          });
          return;
      }

      // Return successful result
      res.status(200).json({
        jsonrpc: '2.0',
        id,
        result,
      });
    } catch (error) {
      this.logger.error('JSON-RPC handler error', {
        requestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(200).json({
        jsonrpc: '2.0',
        id: req.body?.id ?? null,
        error: {
          code: -32000,
          message: error instanceof Error ? error.message : 'Server error',
        },
      });
    }
  }

  /**
   * JSON-RPC tools/list handler - lists all available tools across servers.
   * Includes built-in tools (memory, etc.) and supports project-scoped filtering.
   */
  private async jsonRpcToolsList(req: AuthenticatedRequest): Promise<{ tools: MCPTool[] }> {
    const tokenId = req.token.id;
    let tools = await this.mcpAggregator.listTools(tokenId);

    // Apply project-scoped filtering if project context is present
    if (req.projectId) {
      const projectServers = this.serverManager.getServersByProject(req.projectId);
      const projectServerIds = new Set(projectServers.map(s => s.id));
      tools = tools.filter(tool => projectServerIds.has(tool.serverId));
    }

    // Add built-in tools (memory, etc.) - these are always available
    const builtinTools = this.builtinToolsService.getTools();
    tools = [...builtinTools, ...tools];

    return { tools };
  }

  /**
   * JSON-RPC tools/call handler - executes a tool on a specific server.
   * Routes built-in tools to internal service, external tools to MCP servers.
   */
  private async jsonRpcToolsCall(
    req: AuthenticatedRequest,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    // Validate params
    const parseResult = SecureHttpServer.ToolCallSchema.safeParse(params);
    if (!parseResult.success) {
      throw new Error('Invalid params: ' + JSON.stringify(parseResult.error.flatten()));
    }

    const { server_id, tool_name, arguments: args } = parseResult.data;

    // Handle built-in tools (memory, etc.)
    if (server_id === BUILTIN_SERVER_ID || this.builtinToolsService.isBuiltinTool(tool_name)) {
      this.logger.debug('Executing built-in tool', { tool_name, args });
      const builtinResult = await this.builtinToolsService.callTool(tool_name, args);
      if (!builtinResult.success) {
        throw new Error(builtinResult.error || 'Built-in tool execution failed');
      }
      return builtinResult.result;
    }

    // Verify server is within project scope if project context exists
    if (req.projectId) {
      const projectServers = this.serverManager.getServersByProject(req.projectId);
      const isInProject = projectServers.some(s => s.id === server_id);
      if (!isInProject) {
        throw new Error(`Server ${server_id} is not in project ${req.projectId}`);
      }
    }

    const result = await this.mcpAggregator.callTool(req.token.id, server_id, tool_name, args);

    if (result.error) {
      throw new Error(result.error.message);
    }

    return result.result;
  }

  /**
   * JSON-RPC resources/list handler.
   */
  private async jsonRpcResourcesList(
    req: AuthenticatedRequest,
    params?: Record<string, unknown>
  ): Promise<{ resources: unknown[] }> {
    const serverId = params?.server_id as string | undefined;

    // If server_id specified, get resources from that server only
    if (serverId) {
      // Verify server is within project scope if project context exists
      if (req.projectId) {
        const projectServers = this.serverManager.getServersByProject(req.projectId);
        const isInProject = projectServers.some(s => s.id === serverId);
        if (!isInProject) {
          throw new Error(`Server ${serverId} is not in project ${req.projectId}`);
        }
      }

      const resources = await this.mcpAggregator.listResources(req.token.id, serverId);
      return { resources };
    }

    // Otherwise, get all resources from all accessible servers
    let resources = await this.mcpAggregator.listAllResources(req.token.id);

    // Apply project-scoped filtering if project context is present
    if (req.projectId) {
      const projectServers = this.serverManager.getServersByProject(req.projectId);
      // Filter resources by checking if the URI namespace matches a project server
      resources = resources.filter(resource => {
        const match = resource.uri.match(/^mcpr:\/\/([^/]+)\//);
        if (!match) return false;
        const serverNamespace = match[1];
        return projectServers.some(s => {
          const safeServerName = s.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
          return safeServerName === serverNamespace;
        });
      });
    }

    return { resources };
  }

  /**
   * JSON-RPC resources/read handler.
   */
  private async jsonRpcResourcesRead(
    req: AuthenticatedRequest,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    const serverId = params?.server_id as string | undefined;
    const uri = params?.uri as string | undefined;

    if (!serverId || !uri) {
      throw new Error('server_id and uri are required');
    }

    // Verify server is within project scope if project context exists
    if (req.projectId) {
      const projectServers = this.serverManager.getServersByProject(req.projectId);
      const isInProject = projectServers.some(s => s.id === serverId);
      if (!isInProject) {
        throw new Error(`Server ${serverId} is not in project ${req.projectId}`);
      }
    }

    return await this.mcpAggregator.readResource(req.token.id, serverId, uri);
  }

  /**
   * JSON-RPC prompts/list handler.
   */
  private async jsonRpcPromptsList(
    req: AuthenticatedRequest,
    params?: Record<string, unknown>
  ): Promise<{ prompts: unknown[] }> {
    const serverId = params?.server_id as string | undefined;

    // If server_id specified, get prompts from that server only
    if (serverId) {
      // Verify server is within project scope if project context exists
      if (req.projectId) {
        const projectServers = this.serverManager.getServersByProject(req.projectId);
        const isInProject = projectServers.some(s => s.id === serverId);
        if (!isInProject) {
          throw new Error(`Server ${serverId} is not in project ${req.projectId}`);
        }
      }

      const prompts = await this.mcpAggregator.listPrompts(req.token.id, serverId);
      return { prompts };
    }

    // Otherwise, get all prompts from all accessible servers
    let prompts = await this.mcpAggregator.listAllPrompts(req.token.id);

    // Apply project-scoped filtering if project context is present
    if (req.projectId) {
      const projectServers = this.serverManager.getServersByProject(req.projectId);
      // Filter prompts - need to check by namespace prefix
      prompts = prompts.filter(prompt => {
        const dotIndex = prompt.name.indexOf('.');
        if (dotIndex === -1) return false;
        const serverNamespace = prompt.name.substring(0, dotIndex);
        // Check if any project server matches this namespace
        return projectServers.some(s => {
          const safeServerName = s.name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
          return safeServerName === serverNamespace;
        });
      });
    }

    return { prompts };
  }

  /**
   * JSON-RPC prompts/get handler.
   */
  private async jsonRpcPromptsGet(
    req: AuthenticatedRequest,
    params?: Record<string, unknown>
  ): Promise<unknown> {
    const serverId = params?.server_id as string | undefined;
    const name = params?.name as string | undefined;
    const args = params?.arguments as Record<string, string> | undefined;

    if (!serverId || !name) {
      throw new Error('server_id and name are required');
    }

    // Verify server is within project scope if project context exists
    if (req.projectId) {
      const projectServers = this.serverManager.getServersByProject(req.projectId);
      const isInProject = projectServers.some(s => s.id === serverId);
      if (!isInProject) {
        throw new Error(`Server ${serverId} is not in project ${req.projectId}`);
      }
    }

    const messages = await this.mcpAggregator.getPrompt(req.token.id, serverId, name, args);
    return { messages };
  }

  private async handleToolCall(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const parseResult = SecureHttpServer.ToolCallSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: 'Invalid request',
          details: parseResult.error.flatten(),
        });
        return;
      }

      const { server_id, tool_name, arguments: args } = parseResult.data;

      // Handle built-in tools (memory, etc.)
      if (server_id === BUILTIN_SERVER_ID || this.builtinToolsService.isBuiltinTool(tool_name)) {
        this.logger.debug('Executing built-in tool via REST', { tool_name, args });
        const builtinResult = await this.builtinToolsService.callTool(tool_name, args);
        if (!builtinResult.success) {
          res.status(400).json({ error: builtinResult.error || 'Built-in tool execution failed' });
          return;
        }
        res.json({ result: builtinResult.result });
        return;
      }

      // Verify server is within project scope if project context exists
      if (req.projectId) {
        const projectServers = this.serverManager.getServersByProject(req.projectId);
        const isInProject = projectServers.some(s => s.id === server_id);
        if (!isInProject) {
          res.status(403).json({
            error: `Server ${server_id} is not in project ${req.projectId}`,
          });
          return;
        }
      }

      const result = await this.mcpAggregator.callTool(req.token.id, server_id, tool_name, args);
      res.json(result);
    } catch (error) {
      this.logger.error('Tool call error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Tool call failed',
      });
    }
  }

  private async handleToolList(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      let tools = await this.mcpAggregator.listTools(req.token.id);

      // Apply project-scoped filtering if project context is present
      if (req.projectId) {
        const projectServers = this.serverManager.getServersByProject(req.projectId);
        const projectServerIds = new Set(projectServers.map(s => s.id));
        tools = tools.filter(tool => projectServerIds.has(tool.serverId));
      }

      // Add built-in tools (memory, etc.)
      const builtinTools = this.builtinToolsService.getTools();
      tools = [...builtinTools, ...tools];

      res.json({ tools });
    } catch (error) {
      this.logger.error('Tool list error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list tools',
      });
    }
  }

  private async handleResourceList(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const serverId = req.query.server_id as string;
      if (!serverId) {
        res.status(400).json({ error: 'server_id query parameter required' });
        return;
      }

      // Verify server is within project scope if project context exists
      if (req.projectId) {
        const projectServers = this.serverManager.getServersByProject(req.projectId);
        const isInProject = projectServers.some(s => s.id === serverId);
        if (!isInProject) {
          res.status(403).json({
            error: `Server ${serverId} is not in project ${req.projectId}`,
          });
          return;
        }
      }

      const resources = await this.mcpAggregator.listResources(req.token.id, serverId);
      res.json({ resources });
    } catch (error) {
      this.logger.error('Resource list error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list resources',
      });
    }
  }

  private async handleResourceRead(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const serverId = req.query.server_id as string;
      const uri = req.query.uri as string;

      if (!serverId || !uri) {
        res.status(400).json({ error: 'server_id and uri query parameters required' });
        return;
      }

      // Verify server is within project scope if project context exists
      if (req.projectId) {
        const projectServers = this.serverManager.getServersByProject(req.projectId);
        const isInProject = projectServers.some(s => s.id === serverId);
        if (!isInProject) {
          res.status(403).json({
            error: `Server ${serverId} is not in project ${req.projectId}`,
          });
          return;
        }
      }

      const content = await this.mcpAggregator.readResource(req.token.id, serverId, uri);
      res.json(content);
    } catch (error) {
      this.logger.error('Resource read error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to read resource',
      });
    }
  }

  /**
   * GET /mcp/sse - Server-Sent Events endpoint for streaming MCP responses (Issue #17)
   * Maintains persistent connection for real-time updates.
   */
  private handleSseConnection(req: AuthenticatedRequest, res: Response): void {
    const connectionId = this.generateRequestId();

    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('X-SSE-Connection-ID', connectionId);

    // Store connection for streaming responses
    this.sseConnections.set(connectionId, res);

    // Send initial connection message with project context
    this.sendSseEvent(res, 'connected', {
      connectionId,
      projectId: req.projectId || null,
      projectSlug: req.projectSlug || null,
      clientId: req.token.clientId,
      timestamp: Date.now(),
    });

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      this.sendSseEvent(res, 'heartbeat', { timestamp: Date.now() });
    }, 30000);

    // Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      this.sseConnections.delete(connectionId);
      this.logger.debug('SSE connection closed', {
        connectionId,
        clientId: req.token.clientId,
        projectId: req.projectId,
      });
    });

    this.logger.debug('SSE connection established', {
      connectionId,
      clientId: req.token.clientId,
      projectId: req.projectId,
    });
  }

  /**
   * Send an event to a specific SSE connection.
   */
  private sendSseEvent(res: Response, event: string, data: unknown): void {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * Broadcast an event to all active SSE connections.
   * Can be used for server status updates, approval notifications, etc.
   */
  public broadcastSseEvent(event: string, data: unknown, projectId?: string): void {
    for (const [connectionId, res] of this.sseConnections) {
      try {
        // If projectId filter is specified, only send to connections in that project
        // Note: We'd need to store project context with connections for full filtering
        this.sendSseEvent(res, event, {
          ...data as Record<string, unknown>,
          broadcast: true,
          projectId,
        });
      } catch (error) {
        this.logger.warn('Failed to send SSE broadcast', {
          connectionId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Connection may be dead, remove it
        this.sseConnections.delete(connectionId);
      }
    }
  }

  // ============================================================================
  // IHttpServer Implementation
  // ============================================================================

  async start(port: number): Promise<void> {
    if (this.server) {
      throw new Error('Server already running');
    }

    return new Promise((resolve, reject) => {
      try {
        // SECURITY: Bind to localhost only (fixes MED-3)
        this.server = createServer(this.app);
        this.server.listen(port, '127.0.0.1', () => {
          this.port = port;
          this.logger.info('HTTP server started', { port, host: '127.0.0.1' });
          resolve();
        });

        this.server.on('error', (error: NodeJS.ErrnoException) => {
          if (error.code === 'EADDRINUSE') {
            reject(new Error(`Port ${port} is already in use`));
          } else {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    return new Promise((resolve, reject) => {
      this.server!.close(err => {
        if (err) {
          reject(err);
        } else {
          this.server = null;
          this.port = undefined;
          this.logger.info('HTTP server stopped');
          resolve();
        }
      });
    });
  }

  isRunning(): boolean {
    return this.server !== null;
  }

  getPort(): number | undefined {
    return this.port;
  }
}

/**
 * Extended Request type with authenticated token and project context.
 */
interface AuthenticatedRequest extends Request {
  token: {
    id: string;
    clientId: string;
    scopes: string[];
    serverAccess: Record<string, boolean>;
  };
  /** Project ID from X-MCPR-Project header (resolved) */
  projectId?: string;
  /** Project slug from X-MCPR-Project header (resolved) */
  projectSlug?: string;
}
