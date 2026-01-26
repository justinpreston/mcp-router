import { injectable } from 'inversify';
import type { ILogger, LogLevel } from '@main/core/interfaces';

/**
 * Logger service with structured logging.
 * Avoids logging sensitive data (fixes LOW-4).
 */
@injectable()
export class Logger implements ILogger {
  private context: Record<string, unknown> = {};
  private minLevel: LogLevel = 'info';

  private readonly levelPriority: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  constructor(context?: Record<string, unknown>) {
    if (context) {
      this.context = context;
    }

    // Set minimum log level from environment
    const envLevel = process.env.LOG_LEVEL as LogLevel | undefined;
    if (envLevel && this.levelPriority[envLevel] !== undefined) {
      this.minLevel = envLevel;
    }
  }

  debug(message: string, meta?: Record<string, unknown>): void {
    this.log('debug', message, meta);
  }

  info(message: string, meta?: Record<string, unknown>): void {
    this.log('info', message, meta);
  }

  warn(message: string, meta?: Record<string, unknown>): void {
    this.log('warn', message, meta);
  }

  error(message: string, meta?: Record<string, unknown>): void {
    this.log('error', message, meta);
  }

  /**
   * Create a child logger with additional context.
   */
  child(context: Record<string, unknown>): ILogger {
    const childLogger = new Logger({ ...this.context, ...context });
    childLogger.minLevel = this.minLevel;
    return childLogger;
  }

  /**
   * Internal log method.
   */
  private log(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
    if (this.levelPriority[level] < this.levelPriority[this.minLevel]) {
      return;
    }

    const timestamp = new Date().toISOString();
    const sanitizedMeta = this.sanitize({ ...this.context, ...meta });

    const logEntry = {
      timestamp,
      level,
      message,
      ...sanitizedMeta,
    };

    // Format for console output
    const output = JSON.stringify(logEntry);

    switch (level) {
      case 'debug':
        console.debug(output);
        break;
      case 'info':
        console.info(output);
        break;
      case 'warn':
        console.warn(output);
        break;
      case 'error':
        console.error(output);
        break;
    }
  }

  /**
   * Sanitize metadata to remove sensitive information.
   * Fixes LOW-4: Sensitive data in logs.
   */
  private sanitize(meta: Record<string, unknown>): Record<string, unknown> {
    const sensitiveKeys = [
      'password',
      'token',
      'secret',
      'apiKey',
      'api_key',
      'authorization',
      'auth',
      'credential',
      'private',
      'key',
    ];

    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(meta)) {
      const lowerKey = key.toLowerCase();

      // Check if key contains sensitive terms
      const isSensitive = sensitiveKeys.some(
        sensitive => lowerKey.includes(sensitive)
      );

      if (isSensitive) {
        // Redact sensitive values
        if (typeof value === 'string' && value.length > 0) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = '[REDACTED]';
        }
      } else if (typeof value === 'object' && value !== null) {
        // Recursively sanitize nested objects
        if (Array.isArray(value)) {
          result[key] = value.map(item =>
            typeof item === 'object' && item !== null
              ? this.sanitize(item as Record<string, unknown>)
              : item
          );
        } else {
          result[key] = this.sanitize(value as Record<string, unknown>);
        }
      } else {
        result[key] = value;
      }
    }

    return result;
  }
}
