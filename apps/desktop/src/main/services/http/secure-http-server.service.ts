import { injectable, inject } from 'inversify';
import express, { Application, Request, Response, NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cors from 'cors';
import { createServer, Server } from 'http';
import { TYPES } from '@main/core/types';
import type { IHttpServer, IConfig, ILogger, ITokenValidator } from '@main/core/interfaces';

/**
 * Security-hardened Express HTTP server.
 * Implements CRITICAL-1 (CORS), HIGH-4 (rate limiting), LOW-2 (security headers) fixes.
 */
@injectable()
export class SecureHttpServer implements IHttpServer {
  private app: Application;
  private server: Server | null = null;
  private port: number | undefined;

  constructor(
    @inject(TYPES.Config) private config: IConfig,
    @inject(TYPES.Logger) private logger: ILogger,
    @inject(TYPES.TokenValidator) private tokenValidator: ITokenValidator
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
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
        exposedHeaders: ['X-Request-ID', 'X-RateLimit-Remaining', 'X-RateLimit-Reset'],
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

    // MCP routes (protected)
    // Use type assertion for handlers that receive AuthenticatedRequest after middleware validation
    this.app.post('/mcp/tools/call', requireAuth, this.handleToolCall.bind(this) as unknown as express.RequestHandler);
    this.app.get('/mcp/tools/list', requireAuth, this.handleToolList.bind(this) as unknown as express.RequestHandler);
    this.app.get('/mcp/resources/list', requireAuth, this.handleResourceList.bind(this) as unknown as express.RequestHandler);
    this.app.get('/mcp/resources/read', requireAuth, this.handleResourceRead.bind(this) as unknown as express.RequestHandler);

    // SSE endpoint for streaming responses
    this.app.get('/mcp/sse', requireAuth, this.handleSseConnection.bind(this) as unknown as express.RequestHandler);
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
  // Route Handlers (placeholder implementations)
  // ============================================================================

  private async handleToolCall(_req: AuthenticatedRequest, res: Response): Promise<void> {
    // Will be implemented with McpAggregator integration
    res.status(501).json({ error: 'Not implemented' });
  }

  private async handleToolList(_req: AuthenticatedRequest, res: Response): Promise<void> {
    // Will be implemented with McpAggregator integration
    res.status(501).json({ error: 'Not implemented' });
  }

  private async handleResourceList(_req: AuthenticatedRequest, res: Response): Promise<void> {
    // Will be implemented with McpAggregator integration
    res.status(501).json({ error: 'Not implemented' });
  }

  private async handleResourceRead(_req: AuthenticatedRequest, res: Response): Promise<void> {
    // Will be implemented with McpAggregator integration
    res.status(501).json({ error: 'Not implemented' });
  }

  private handleSseConnection(req: AuthenticatedRequest, res: Response): void {
    // Set SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');

    // Send initial connection message
    res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

    // Heartbeat to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(': heartbeat\n\n');
    }, 30000);

    // Cleanup on client disconnect
    req.on('close', () => {
      clearInterval(heartbeat);
      this.logger.debug('SSE connection closed', {
        clientId: req.token.clientId,
      });
    });
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
 * Extended Request type with authenticated token.
 */
interface AuthenticatedRequest extends Request {
  token: {
    id: string;
    clientId: string;
    scopes: string[];
    serverAccess: Record<string, boolean>;
  };
}
