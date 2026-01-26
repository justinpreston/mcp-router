/**
 * Deep Link Handler with URL Validation
 *
 * Provides secure handling of custom protocol URLs (mcp-router://).
 * Validates and sanitizes all incoming deep links before processing.
 */
import { injectable, inject } from 'inversify';
import { app, BrowserWindow } from 'electron';
import { TYPES } from '@main/core/types';
import type { ILogger } from '@main/core/interfaces';
import { z } from 'zod';

// ============================================================================
// Types and Interfaces
// ============================================================================

/** Supported deep link actions */
export type DeepLinkAction =
  | 'connect-server'
  | 'approve-request'
  | 'open-workspace'
  | 'import-config'
  | 'oauth-callback';

/** Parsed deep link data */
export interface ParsedDeepLink {
  action: DeepLinkAction;
  params: Record<string, string>;
  raw: string;
}

/** Deep link handler callback */
export type DeepLinkCallback = (link: ParsedDeepLink) => void | Promise<void>;

/** Deep link handler interface */
export interface IDeepLinkHandler {
  /** Register the app as default protocol handler */
  register(): void;
  /** Unregister the protocol handler */
  unregister(): void;
  /** Handle an incoming deep link URL */
  handleUrl(url: string): Promise<void>;
  /** Register a callback for a specific action */
  onAction(action: DeepLinkAction, callback: DeepLinkCallback): void;
  /** Remove a callback for a specific action */
  offAction(action: DeepLinkAction): void;
}

// ============================================================================
// Validation Schemas
// ============================================================================

/** Custom protocol scheme for MCP Router */
const PROTOCOL_SCHEME = 'mcp-router';

/** Allowed actions with their parameter schemas */
const ACTION_SCHEMAS: Record<DeepLinkAction, z.ZodSchema> = {
  'connect-server': z.object({
    url: z.string().url().max(2048),
    name: z.string().max(100).optional(),
    type: z.enum(['stdio', 'http', 'sse']).optional(),
  }),

  'approve-request': z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{21}$/, 'Invalid approval ID'),
    action: z.enum(['approve', 'deny']),
  }),

  'open-workspace': z.object({
    id: z.string().regex(/^[A-Za-z0-9_-]{21}$/, 'Invalid workspace ID'),
  }),

  'import-config': z.object({
    source: z.enum(['file', 'url']),
    path: z.string().max(4096).optional(),
    url: z.string().url().max(2048).optional(),
  }),

  'oauth-callback': z.object({
    code: z.string().max(2048),
    state: z.string().max(512).optional(),
    error: z.string().max(256).optional(),
    error_description: z.string().max(1024).optional(),
  }),
};

/** Schema for validating the overall deep link structure */
const DeepLinkSchema = z.object({
  protocol: z.literal(`${PROTOCOL_SCHEME}:`),
  action: z.enum([
    'connect-server',
    'approve-request',
    'open-workspace',
    'import-config',
    'oauth-callback',
  ] as const),
  params: z.record(z.string().max(4096)),
});

// ============================================================================
// Security Utilities
// ============================================================================

/**
 * Decode and sanitize URL parameters.
 * Prevents injection attacks via encoded characters.
 */
function sanitizeParam(value: string): string {
  try {
    // Decode URL encoding
    const decoded = decodeURIComponent(value);

    // Remove null bytes and control characters
    const sanitized = decoded
      .replace(/\0/g, '')
      .replace(/[\x00-\x1F\x7F]/g, '');

    return sanitized;
  } catch {
    // If decoding fails, return empty string
    return '';
  }
}

/**
 * Parse URL search params into a sanitized object.
 */
function parseParams(searchParams: URLSearchParams): Record<string, string> {
  const params: Record<string, string> = {};

  for (const [key, value] of searchParams) {
    // Sanitize both key and value
    const sanitizedKey = sanitizeParam(key);
    const sanitizedValue = sanitizeParam(value);

    // Skip empty keys or suspiciously long values
    if (sanitizedKey && sanitizedKey.length <= 100 && sanitizedValue.length <= 4096) {
      params[sanitizedKey] = sanitizedValue;
    }
  }

  return params;
}

/**
 * Validate that a URL doesn't contain dangerous patterns.
 */
function validateUrlSafety(url: string): boolean {
  // Check for common attack patterns
  const dangerousPatterns = [
    /javascript:/i,
    /data:/i,
    /vbscript:/i,
    /<script/i,
    /onclick/i,
    /onerror/i,
    /onload/i,
    /%00/, // Null byte
    /\.\.\//g, // Path traversal
  ];

  return !dangerousPatterns.some((pattern) => pattern.test(url));
}

// ============================================================================
// Deep Link Handler Implementation
// ============================================================================

@injectable()
export class DeepLinkHandler implements IDeepLinkHandler {
  private callbacks: Map<DeepLinkAction, DeepLinkCallback> = new Map();
  private isRegistered = false;

  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  /**
   * Register the app as the default handler for mcp-router:// URLs.
   */
  register(): void {
    if (this.isRegistered) {
      this.logger.debug('Deep link handler already registered');
      return;
    }

    // Register the protocol scheme
    const success = app.setAsDefaultProtocolClient(PROTOCOL_SCHEME);

    if (success) {
      this.logger.info('Registered as default protocol handler', { scheme: PROTOCOL_SCHEME });
      this.isRegistered = true;
    } else {
      this.logger.error('Failed to register protocol handler', { scheme: PROTOCOL_SCHEME });
    }

    // Handle deep links on macOS
    app.on('open-url', (event, url) => {
      event.preventDefault();
      this.handleUrl(url).catch((error) => {
        this.logger.error('Error handling deep link', {
          url: this.redactUrl(url),
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    });

    // Handle deep links on Windows/Linux (via second-instance)
    app.on('second-instance', (_event, commandLine) => {
      // Find the deep link URL in command line args
      const url = commandLine.find((arg) => arg.startsWith(`${PROTOCOL_SCHEME}://`));
      if (url) {
        this.handleUrl(url).catch((error) => {
          this.logger.error('Error handling deep link from second instance', {
            url: this.redactUrl(url),
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      }

      // Focus the main window
      const windows = BrowserWindow.getAllWindows();
      if (windows.length > 0) {
        const mainWindow = windows[0];
        if (mainWindow?.isMinimized()) {
          mainWindow.restore();
        }
        mainWindow?.focus();
      }
    });
  }

  /**
   * Unregister the protocol handler.
   */
  unregister(): void {
    if (!this.isRegistered) {
      return;
    }

    app.removeAsDefaultProtocolClient(PROTOCOL_SCHEME);
    this.isRegistered = false;
    this.logger.info('Unregistered protocol handler', { scheme: PROTOCOL_SCHEME });
  }

  /**
   * Handle an incoming deep link URL.
   */
  async handleUrl(url: string): Promise<void> {
    this.logger.debug('Received deep link', { url: this.redactUrl(url) });

    // Basic URL safety check
    if (!validateUrlSafety(url)) {
      this.logger.warn('Blocked potentially dangerous deep link', { url: this.redactUrl(url) });
      throw new Error('Deep link contains potentially dangerous content');
    }

    // Parse the URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      this.logger.warn('Invalid deep link URL', { url: this.redactUrl(url) });
      throw new Error('Invalid deep link URL format');
    }

    // Validate protocol
    if (parsedUrl.protocol !== `${PROTOCOL_SCHEME}:`) {
      this.logger.warn('Invalid protocol in deep link', {
        expected: `${PROTOCOL_SCHEME}:`,
        received: parsedUrl.protocol,
      });
      throw new Error(`Invalid protocol: expected ${PROTOCOL_SCHEME}:`);
    }

    // Extract action from hostname (mcp-router://connect-server?...)
    const action = parsedUrl.hostname as DeepLinkAction;

    // Parse and sanitize parameters
    const params = parseParams(parsedUrl.searchParams);

    // Validate overall structure
    const structureResult = DeepLinkSchema.safeParse({
      protocol: parsedUrl.protocol,
      action,
      params,
    });

    if (!structureResult.success) {
      this.logger.warn('Invalid deep link structure', {
        errors: structureResult.error.errors,
      });
      throw new Error('Invalid deep link structure');
    }

    // Validate action-specific parameters
    const actionSchema = ACTION_SCHEMAS[action];
    if (!actionSchema) {
      this.logger.warn('Unknown deep link action', { action });
      throw new Error(`Unknown action: ${action}`);
    }

    const paramsResult = actionSchema.safeParse(params);
    if (!paramsResult.success) {
      this.logger.warn('Invalid deep link parameters', {
        action,
        errors: paramsResult.error.errors,
      });
      throw new Error(`Invalid parameters for action ${action}`);
    }

    // Create parsed deep link
    const parsedLink: ParsedDeepLink = {
      action,
      params: paramsResult.data as Record<string, string>,
      raw: url,
    };

    this.logger.info('Processing deep link', {
      action,
      params: this.redactParams(params),
    });

    // Execute registered callback
    const callback = this.callbacks.get(action);
    if (callback) {
      await callback(parsedLink);
    } else {
      this.logger.debug('No callback registered for action', { action });
    }
  }

  /**
   * Register a callback for a specific action.
   */
  onAction(action: DeepLinkAction, callback: DeepLinkCallback): void {
    this.callbacks.set(action, callback);
    this.logger.debug('Registered callback for deep link action', { action });
  }

  /**
   * Remove a callback for a specific action.
   */
  offAction(action: DeepLinkAction): void {
    this.callbacks.delete(action);
    this.logger.debug('Removed callback for deep link action', { action });
  }

  /**
   * Redact sensitive parts of URL for logging.
   */
  private redactUrl(url: string): string {
    try {
      const parsed = new URL(url);
      // Redact query parameters but keep structure
      if (parsed.search) {
        return `${parsed.protocol}//${parsed.hostname}?[REDACTED]`;
      }
      return `${parsed.protocol}//${parsed.hostname}`;
    } catch {
      return '[INVALID URL]';
    }
  }

  /**
   * Redact sensitive parameter values for logging.
   */
  private redactParams(params: Record<string, string>): Record<string, string> {
    const sensitiveKeys = ['code', 'token', 'secret', 'password', 'key'];
    const redacted: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
      if (sensitiveKeys.some((sensitive) => key.toLowerCase().includes(sensitive))) {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = value.length > 50 ? `${value.substring(0, 50)}...` : value;
      }
    }

    return redacted;
  }
}
