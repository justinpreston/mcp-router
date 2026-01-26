import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  ILogger,
  ISseTransport,
  HttpTransportOptions,
  JsonRpcMessage,
} from '@main/core/interfaces';

/**
 * Server-Sent Events (SSE) transport for receiving streaming events from MCP servers.
 * Used in conjunction with HTTP transport for bidirectional communication.
 */
@injectable()
export class SseTransport implements ISseTransport {
  private eventSource: EventSource | null = null;
  private messageHandler?: (message: JsonRpcMessage) => void;
  private errorHandler?: (error: Error) => void;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private url: string | null = null;
  private options?: HttpTransportOptions;

  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  /**
   * Connect to an SSE endpoint.
   */
  async connect(url: string, options?: HttpTransportOptions): Promise<void> {
    this.logger.info('Connecting to SSE endpoint', { url });

    // Validate URL
    try {
      const parsedUrl = new URL(url);
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error(`Invalid protocol: ${parsedUrl.protocol}. Must be http or https.`);
      }
    } catch {
      throw new Error(`Invalid URL: ${url}`);
    }

    this.url = url;
    this.options = options;

    return this.establishConnection();
  }

  /**
   * Register a handler for incoming messages.
   */
  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Register a handler for connection errors.
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Disconnect from the SSE endpoint.
   */
  disconnect(): void {
    this.logger.info('Disconnecting from SSE endpoint');

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.connected = false;
    this.reconnectAttempts = 0;
    this.url = null;
    this.options = undefined;
  }

  /**
   * Check if connected to the SSE endpoint.
   */
  isConnected(): boolean {
    return this.connected && this.eventSource?.readyState === EventSource.OPEN;
  }

  /**
   * Establish the SSE connection.
   */
  private async establishConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.url) {
        reject(new Error('URL not set'));
        return;
      }

      try {
        // Build URL with headers as query params if needed (SSE limitation)
        const sseUrl = new URL(this.url);
        if (this.options?.headers) {
          // Some SSE implementations accept auth via query params
          // This is a common workaround for EventSource's lack of header support
          const authHeader = this.options.headers['Authorization'];
          if (authHeader) {
            sseUrl.searchParams.set('authorization', authHeader);
          }
        }

        this.eventSource = new EventSource(sseUrl.toString());

        this.eventSource.onopen = () => {
          this.logger.info('SSE connection established');
          this.connected = true;
          this.reconnectAttempts = 0;
          resolve();
        };

        this.eventSource.onmessage = (event) => {
          this.handleMessage(event);
        };

        // Handle specific event types that MCP might use
        this.eventSource.addEventListener('jsonrpc', (event: MessageEvent) => {
          this.handleMessage(event);
        });

        this.eventSource.addEventListener('notification', (event: MessageEvent) => {
          this.handleMessage(event);
        });

        this.eventSource.onerror = (event) => {
          this.handleError(event, reject);
        };

        // Timeout for initial connection
        const timeout = this.options?.timeout ?? 30000;
        setTimeout(() => {
          if (!this.connected) {
            this.eventSource?.close();
            reject(new Error(`SSE connection timed out after ${timeout}ms`));
          }
        }, timeout);
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Handle incoming SSE messages.
   */
  private handleMessage(event: MessageEvent): void {
    try {
      const message = JSON.parse(event.data) as JsonRpcMessage;
      this.logger.debug('Received SSE message', {
        method: 'method' in message ? message.method : undefined,
        id: 'id' in message ? message.id : undefined,
      });
      this.messageHandler?.(message);
    } catch (error) {
      this.logger.warn('Failed to parse SSE message', {
        data: event.data,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle SSE connection errors.
   */
  private handleError(_event: Event, rejectFn?: (error: Error) => void): void {
    const error = new Error('SSE connection error');

    this.logger.error('SSE connection error', {
      readyState: this.eventSource?.readyState,
    });

    // If we were connected, try to reconnect
    if (this.connected && this.reconnectAttempts < this.maxReconnectAttempts) {
      this.connected = false;
      this.scheduleReconnect();
    } else if (!this.connected && rejectFn) {
      // Initial connection failed
      rejectFn(error);
    } else {
      // Max reconnects exceeded
      this.errorHandler?.(error);
      this.disconnect();
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(): void {
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    this.logger.info('Scheduling SSE reconnection', {
      attempt: this.reconnectAttempts,
      delay,
    });

    setTimeout(async () => {
      if (this.url && this.reconnectAttempts <= this.maxReconnectAttempts) {
        try {
          await this.establishConnection();
        } catch (error) {
          this.logger.error('SSE reconnection failed', {
            attempt: this.reconnectAttempts,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }, delay);
  }
}
