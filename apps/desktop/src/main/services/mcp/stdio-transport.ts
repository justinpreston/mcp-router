import { injectable, inject } from 'inversify';
import { spawn, ChildProcess } from 'child_process';
import { TYPES } from '@main/core/types';
import type {
  ILogger,
  IStdioTransport,
  StdioTransportOptions,
  JsonRpcMessage,
} from '@main/core/interfaces';

/**
 * Stdio transport for child process-based MCP servers.
 * Handles spawning, message passing via stdin/stdout, and process lifecycle.
 */
@injectable()
export class StdioTransport implements IStdioTransport {
  private process: ChildProcess | null = null;
  private messageHandler?: (message: JsonRpcMessage) => void;
  private errorHandler?: (error: Error) => void;
  private closeHandler?: (code: number | null) => void;
  private buffer = '';

  constructor(@inject(TYPES.Logger) private logger: ILogger) {}

  /**
   * Spawn a child process for the MCP server.
   */
  async spawn(
    command: string,
    args: string[],
    options?: StdioTransportOptions
  ): Promise<void> {
    if (this.process) {
      throw new Error('Process already spawned. Call kill() first.');
    }

    this.logger.info('Spawning MCP server process', { command, args });

    return new Promise((resolve, reject) => {
      try {
        this.process = spawn(command, args, {
          cwd: options?.cwd,
          env: {
            ...process.env,
            ...options?.env,
          },
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: false, // Security: Never use shell to prevent injection
        });

        // Handle stdout (JSON-RPC messages)
        this.process.stdout?.on('data', (data: Buffer) => {
          this.handleStdoutData(data);
        });

        // Handle stderr (logging)
        this.process.stderr?.on('data', (data: Buffer) => {
          const message = data.toString().trim();
          if (message) {
            this.logger.debug('MCP server stderr', { message });
          }
        });

        // Handle process errors
        this.process.on('error', (error: Error) => {
          this.logger.error('MCP server process error', { error: error.message });
          this.errorHandler?.(error);
          reject(error);
        });

        // Handle process close
        this.process.on('close', (code: number | null, signal: string | null) => {
          this.logger.info('MCP server process closed', { code, signal });
          this.closeHandler?.(code);
          this.process = null;
        });

        // Handle process spawn success
        this.process.on('spawn', () => {
          this.logger.info('MCP server process spawned', {
            pid: this.process?.pid,
          });
          resolve();
        });

        // Set up timeout for spawn
        if (options?.timeout) {
          setTimeout(() => {
            if (this.process && !this.process.pid) {
              this.kill();
              reject(new Error(`Process spawn timed out after ${options.timeout}ms`));
            }
          }, options.timeout);
        }
      } catch (error) {
        this.logger.error('Failed to spawn MCP server process', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        reject(error);
      }
    });
  }

  /**
   * Send a JSON-RPC message to the process via stdin.
   */
  send(message: JsonRpcMessage): void {
    if (!this.process?.stdin?.writable) {
      throw new Error('Process stdin not available');
    }

    const json = JSON.stringify(message);
    // MCP uses newline-delimited JSON
    this.process.stdin.write(json + '\n');
    this.logger.debug('Sent message to MCP server', {
      method: 'method' in message ? message.method : undefined,
      id: 'id' in message ? message.id : undefined,
    });
  }

  /**
   * Register a handler for incoming messages.
   */
  onMessage(handler: (message: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  /**
   * Register a handler for process errors.
   */
  onError(handler: (error: Error) => void): void {
    this.errorHandler = handler;
  }

  /**
   * Register a handler for process close.
   */
  onClose(handler: (code: number | null) => void): void {
    this.closeHandler = handler;
  }

  /**
   * Kill the child process.
   */
  kill(): void {
    if (this.process) {
      this.logger.info('Killing MCP server process', { pid: this.process.pid });

      // Try graceful shutdown first
      this.process.kill('SIGTERM');

      // Force kill after timeout
      setTimeout(() => {
        if (this.process) {
          this.process.kill('SIGKILL');
        }
      }, 5000);
    }
  }

  /**
   * Check if the process is running.
   */
  isRunning(): boolean {
    return this.process !== null && !this.process.killed;
  }

  /**
   * Get the process ID.
   */
  getPid(): number | undefined {
    return this.process?.pid;
  }

  /**
   * Handle incoming data from stdout.
   * Parses newline-delimited JSON messages.
   */
  private handleStdoutData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete lines
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\n')) !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);

      if (line) {
        try {
          const message = JSON.parse(line) as JsonRpcMessage;
          this.logger.debug('Received message from MCP server', {
            method: 'method' in message ? message.method : undefined,
            id: 'id' in message ? message.id : undefined,
          });
          this.messageHandler?.(message);
        } catch (error) {
          this.logger.warn('Failed to parse JSON-RPC message', {
            line,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }
  }
}
