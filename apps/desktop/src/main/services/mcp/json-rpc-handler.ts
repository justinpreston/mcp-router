import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  ILogger,
  IJsonRpcHandler,
  JsonRpcRequest,
  JsonRpcResponse,
  JsonRpcMessage,
  JsonRpcError,
} from '@main/core/interfaces';

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
  method: string;
  startTime: number;
}

/**
 * JSON-RPC 2.0 handler with request/response correlation and timeout management.
 * Implements the JSON-RPC protocol as required by MCP.
 */
@injectable()
export class JsonRpcHandler implements IJsonRpcHandler {
  private pendingRequests = new Map<string | number, PendingRequest>();
  private requestHandler?: (method: string, params: unknown) => Promise<unknown>;
  private notificationHandler?: (method: string, params: unknown) => void;
  private messageEmitter?: (message: JsonRpcMessage) => void;
  private nextId = 1;
  private defaultTimeout = 30000; // 30 seconds

  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  /**
   * Set the function used to send messages to the transport.
   * Alias for setSendFunction to match interface.
   */
  setMessageEmitter(emitter: (message: JsonRpcMessage) => void): void {
    this.messageEmitter = emitter;
  }

  /**
   * Set the function used to send messages to the transport.
   * Required by IJsonRpcHandler interface.
   */
  setSendFunction(sendFn: (message: JsonRpcMessage) => void): void {
    this.messageEmitter = sendFn;
  }

  /**
   * Send a JSON-RPC request and wait for the response.
   */
  async sendRequest<T = unknown>(
    method: string,
    params?: unknown,
    timeoutMs: number = this.defaultTimeout
  ): Promise<T> {
    if (!this.messageEmitter) {
      throw new Error('Message emitter not set. Call setMessageEmitter first.');
    }

    const id = this.generateId();
    const request: JsonRpcRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        const pending = this.pendingRequests.get(id);
        if (pending) {
          this.pendingRequests.delete(id);
          this.logger.warn('JSON-RPC request timed out', {
            id,
            method,
            timeoutMs,
          });
          reject(new Error(`Request timed out after ${timeoutMs}ms: ${method}`));
        }
      }, timeoutMs);

      this.pendingRequests.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timeout,
        method,
        startTime: Date.now(),
      });

      this.logger.debug('Sending JSON-RPC request', { id, method });
      this.messageEmitter!(request);
    });
  }

  /**
   * Send a JSON-RPC notification (no response expected).
   */
  sendNotification(method: string, params?: unknown): void {
    if (!this.messageEmitter) {
      throw new Error('Message emitter not set. Call setMessageEmitter first.');
    }

    const notification: JsonRpcMessage = {
      jsonrpc: '2.0',
      method,
      params,
    };

    this.logger.debug('Sending JSON-RPC notification', { method });
    this.messageEmitter(notification);
  }

  /**
   * Handle an incoming JSON-RPC message.
   */
  handleMessage(message: JsonRpcMessage): void {
    // Check if this is a response to a pending request
    if ('id' in message && message.id !== undefined) {
      if ('result' in message || 'error' in message) {
        // This is a response
        this.handleResponse(message as JsonRpcResponse);
        return;
      }

      // This is a request (has id and method)
      if ('method' in message) {
        this.handleRequest(message as JsonRpcRequest);
        return;
      }
    }

    // This is a notification (no id, has method)
    if ('method' in message) {
      this.handleNotification(message);
      return;
    }

    this.logger.warn('Received unknown JSON-RPC message format', { message });
  }

  /**
   * Register a handler for incoming requests.
   */
  onRequest(handler: (method: string, params: unknown) => Promise<unknown>): void {
    this.requestHandler = handler;
  }

  /**
   * Register a handler for incoming notifications.
   */
  onNotification(handler: (method: string, params: unknown) => void): void {
    this.notificationHandler = handler;
  }

  /**
   * Close the handler and reject all pending requests.
   */
  close(): void {
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error('Handler closed'));
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Get the number of pending requests.
   */
  getPendingCount(): number {
    return this.pendingRequests.size;
  }

  private handleResponse(response: JsonRpcResponse): void {
    const pending = this.pendingRequests.get(response.id);
    if (!pending) {
      this.logger.warn('Received response for unknown request', {
        id: response.id,
      });
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(response.id);

    const duration = Date.now() - pending.startTime;
    this.logger.debug('Received JSON-RPC response', {
      id: response.id,
      method: pending.method,
      duration,
      hasError: !!response.error,
    });

    if (response.error) {
      const error = this.createError(response.error);
      pending.reject(error);
    } else {
      pending.resolve(response.result);
    }
  }

  private async handleRequest(request: JsonRpcRequest): Promise<void> {
    if (!this.requestHandler) {
      this.logger.warn('No request handler registered', { method: request.method });
      this.sendErrorResponse(request.id, -32601, 'Method not found');
      return;
    }

    try {
      const result = await this.requestHandler(request.method, request.params);
      this.sendSuccessResponse(request.id, result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Internal error';
      this.sendErrorResponse(request.id, -32603, message);
    }
  }

  private handleNotification(message: JsonRpcMessage): void {
    if (!('method' in message)) return;

    if (this.notificationHandler) {
      this.notificationHandler(message.method, message.params);
    } else {
      this.logger.debug('Received notification but no handler registered', {
        method: message.method,
      });
    }
  }

  private sendSuccessResponse(id: string | number, result: unknown): void {
    if (!this.messageEmitter) return;

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      result,
    };
    this.messageEmitter(response);
  }

  private sendErrorResponse(
    id: string | number,
    code: number,
    message: string,
    data?: unknown
  ): void {
    if (!this.messageEmitter) return;

    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      id,
      error: { code, message, data },
    };
    this.messageEmitter(response);
  }

  private createError(error: JsonRpcError): Error {
    const err = new Error(error.message);
    (err as Error & { code: number }).code = error.code;
    (err as Error & { data?: unknown }).data = error.data;
    return err;
  }

  private generateId(): string {
    return `${this.nextId++}-${nanoid(8)}`;
  }
}
