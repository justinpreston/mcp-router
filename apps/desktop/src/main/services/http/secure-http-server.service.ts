import { injectable, inject } from 'inversify';
import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { z } from 'zod';
import { createServer, Server } from 'http';
import { randomUUID } from 'crypto';
import { TYPES } from '@main/core/types';
// @ts-ignore - MCP SDK uses package exports
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
// @ts-ignore
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import type {
  IHttpServer,
  IConfig,
  ILogger,
  ITokenValidator,
  IProjectService,
  IMcpAggregator,
  IServerManager,
  IBuiltinToolsService,
  IMcpProtocolServer,
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

  /** SSE session management (sessionId → { transport, server }) */
  private sseSessions: Map<string, {
    transport: SSEServerTransport;
    server: unknown; // MCP SDK Server instance
    projectId?: string;
  }> = new Map();

  /** Stateless StreamableHTTP transport (recreated per request) */
  private mcpProtocolServer: IMcpProtocolServer;

  constructor(
    @inject(TYPES.Config) private config: IConfig,
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.TokenValidator) private tokenValidator: ITokenValidator,
    @inject(TYPES.ProjectService) private projectService: IProjectService,
    @inject(TYPES.McpAggregator) private mcpAggregator: IMcpAggregator,
    @inject(TYPES.ServerManager) private serverManager: IServerManager,
    @inject(TYPES.BuiltinToolsService) private builtinToolsService: IBuiltinToolsService,
    @inject(TYPES.McpProtocolServer) mcpProtocolServer: IMcpProtocolServer
  ) {
    this.mcpProtocolServer = mcpProtocolServer;
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
   * Replaces custom JSON-RPC with MCP SDK StreamableHTTP + SSE transports.
   * @see Issue #66
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
        authReq.projectId = undefined;
        authReq.projectSlug = undefined;
        return next();
      }

      try {
        let project = await this.projectService.getProject(projectHeader);
        if (!project) {
          project = await this.projectService.getProjectBySlug(projectHeader);
        }

        if (!project) {
          this.logger.warn('Project not found', { projectHeader, clientId: authReq.token?.clientId });
          return res.status(404).json({
            error: 'Project not found',
            code: 'PROJECT_NOT_FOUND',
            project: projectHeader,
          });
        }

        if (!project.active) {
          this.logger.warn('Access to inactive project denied', {
            projectId: project.id,
            projectSlug: project.slug,
          });
          return res.status(403).json({ error: 'Project is not active', code: 'PROJECT_INACTIVE' });
        }

        authReq.projectId = project.id;
        authReq.projectSlug = project.slug;
        res.setHeader('X-MCPR-Project', project.id);
        next();
      } catch (error) {
        this.logger.error('Project context extraction error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          projectHeader,
        });
        return res.status(500).json({ error: 'Failed to resolve project context' });
      }
    };

    // =========================================================================
    // MCP SDK StreamableHTTP Transport (POST /mcp, GET /mcp, DELETE /mcp)
    // Replaces custom JSON-RPC handler with official MCP SDK transport.
    // @see Issue #66 Phase 2
    // =========================================================================
    this.app.all('/mcp', requireAuth, extractProjectContext, async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;

      try {
        // Set the request context so MCP handlers know who's calling
        this.mcpProtocolServer.setRequestContext({
          token: authReq.token as any,
          projectId: authReq.projectId,
          projectSlug: authReq.projectSlug,
        });

        // Create a new stateless transport per request (no session persistence)
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // Stateless mode
        });

        // Connect the MCP server to this transport for the duration of this request
        const mcpServer = this.mcpProtocolServer.getServer() as any;
        await mcpServer.connect(transport);

        // Let the SDK transport handle the request/response
        await transport.handleRequest(req, res, req.body);
      } catch (error) {
        this.logger.error('StreamableHTTP transport error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          method: req.method,
        });
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      } finally {
        this.mcpProtocolServer.clearRequestContext();
      }
    });

    // =========================================================================
    // MCP SDK SSE Transport (GET /mcp/sse, POST /mcp/messages)
    // Replaces custom SSE implementation with official MCP SDK transport.
    // @see Issue #66 Phase 3
    // =========================================================================
    this.app.get('/mcp/sse', requireAuth, extractProjectContext, async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;

      try {
        // Create SSE transport (endpoint for POST messages)
        const messageEndpoint = '/mcp/messages';
        const transport = new SSEServerTransport(messageEndpoint, res);

        // Get the session ID generated by the transport
        const sessionId = (transport as any).sessionId || randomUUID();

        // Create a dedicated MCP server for this SSE session
        const sessionServer = this.mcpProtocolServer.createSessionServer() as any;

        // Store session for message routing
        this.sseSessions.set(sessionId, {
          transport,
          server: sessionServer,
          projectId: authReq.projectId,
        });

        // Set request context for the session
        this.mcpProtocolServer.setRequestContext({
          token: authReq.token as any,
          projectId: authReq.projectId,
          projectSlug: authReq.projectSlug,
        });

        // Cleanup on disconnect
        res.on('close', () => {
          this.sseSessions.delete(sessionId);
          this.logger.debug('SSE session disconnected', {
            sessionId,
            clientId: authReq.token?.clientId,
          });
        });

        // Connect the dedicate MCP server to this SSE transport
        await sessionServer.connect(transport);

        this.logger.info('SSE session established', {
          sessionId,
          clientId: authReq.token?.clientId,
          projectId: authReq.projectId,
        });
      } catch (error) {
        this.logger.error('SSE connection error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error establishing SSE connection' });
        }
      }
    });

    // SSE message handler
    this.app.post('/mcp/messages', requireAuth, extractProjectContext, async (req: Request, res: Response) => {
      const authReq = req as AuthenticatedRequest;

      try {
        // Find session by ID from query param or header
        const sessionId =
          (req.query.sessionId as string) ||
          (req.headers['mcp-session-id'] as string);

        if (!sessionId) {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session ID is required' },
            id: null,
          });
          return;
        }

        const session = this.sseSessions.get(sessionId);
        if (!session) {
          res.status(404).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session not found or expired' },
            id: null,
          });
          return;
        }

        // Set request context for the message
        this.mcpProtocolServer.setRequestContext({
          token: authReq.token as any,
          projectId: authReq.projectId || session.projectId,
          projectSlug: authReq.projectSlug,
        });

        // Delegate to the SDK SSE transport
        await session.transport.handlePostMessage(req, res, req.body);
      } catch (error) {
        this.logger.error('SSE message error', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        if (!res.headersSent) {
          res.status(500).json({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'Internal server error' },
            id: null,
          });
        }
      } finally {
        this.mcpProtocolServer.clearRequestContext();
      }
    });

    // =========================================================================
    // Legacy REST endpoints (kept for backward compatibility)
    // These existed before MCP SDK migration and some tools may depend on them.
    // =========================================================================
    this.app.get('/mcp/tools/list', requireAuth, extractProjectContext, this.handleToolList.bind(this) as unknown as express.RequestHandler);
    this.app.post('/mcp/tools/call', requireAuth, extractProjectContext, this.handleToolCall.bind(this) as unknown as express.RequestHandler);
    this.app.get('/mcp/resources/list', requireAuth, extractProjectContext, this.handleResourceList.bind(this) as unknown as express.RequestHandler);
    this.app.get('/mcp/resources/read', requireAuth, extractProjectContext, this.handleResourceRead.bind(this) as unknown as express.RequestHandler);

    // Project info endpoint
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

    // Status endpoint — shows transport info
    this.app.get('/status', (_req: Request, res: Response) => {
      res.json({
        name: 'mcp-router',
        version: '1.0.0',
        transports: {
          streamableHttp: '/mcp',
          sse: '/mcp/sse',
          sseMessages: '/mcp/messages',
        },
        legacyRest: {
          toolsList: '/mcp/tools/list',
          toolsCall: '/mcp/tools/call',
          resourcesList: '/mcp/resources/list',
          resourcesRead: '/mcp/resources/read',
        },
        activeSseSessions: this.sseSessions.size,
        timestamp: Date.now(),
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
  // Legacy REST Route Handlers (kept for backward compatibility)
  // ============================================================================

  /**
   * Tool call request schema (used by REST convenience endpoints).
   */
  private static readonly ToolCallSchema = z.object({
    server_id: z.string(),
    tool_name: z.string(),
    arguments: z.record(z.unknown()).optional().default({}),
  });

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

    // Close all active SSE sessions
    for (const [, session] of this.sseSessions) {
      try {
        await (session.transport as any).close?.();
        await (session.server as any).close?.();
      } catch {
        // Ignore errors during cleanup
      }
    }
    this.sseSessions.clear();

    // Close the MCP protocol server
    try {
      await this.mcpProtocolServer.close();
    } catch {
      // Ignore errors during cleanup
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
