import { injectable, inject } from 'inversify';
import { EventEmitter } from 'events';
import { TYPES } from '@main/core/types';
import type {
  ILogger,
  IProcessHealthMonitor,
  RestartPolicy,
  ProcessHealth,
} from '@main/core/interfaces';

const DEFAULT_RESTART_POLICY: RestartPolicy = {
  maxRestarts: 5,
  restartWindow: 60000, // 1 minute
  backoffMultiplier: 2,
  maxBackoff: 30000, // 30 seconds
  initialBackoff: 1000, // 1 second
};

interface ProcessState {
  pid: number;
  serverId: string;
  restartCount: number;
  restartTimestamps: number[];
  currentBackoff: number;
  health: ProcessHealth;
  lastHeartbeat: number;
  restartScheduled: NodeJS.Timeout | null;
}

/**
 * Process health monitor with automatic restart and crash recovery.
 * Implements exponential backoff and circuit breaker patterns.
 */
@injectable()
export class ProcessHealthMonitor implements IProcessHealthMonitor {
  private processes = new Map<string, ProcessState>();
  private restartPolicy: RestartPolicy = DEFAULT_RESTART_POLICY;
  private eventEmitter = new EventEmitter();
  private heartbeatInterval = 30000; // 30 seconds
  private heartbeatChecker: NodeJS.Timeout | null = null;

  constructor(@inject(TYPES.Logger) private logger: ILogger) {
    this.startHeartbeatChecker();
  }

  /**
   * Register a process for health monitoring.
   */
  register(
    serverId: string,
    pid: number,
    onRestart: () => Promise<number>
  ): void {
    this.logger.info('Registering process for health monitoring', {
      serverId,
      pid,
    });

    const state: ProcessState = {
      pid,
      serverId,
      restartCount: 0,
      restartTimestamps: [],
      currentBackoff: this.restartPolicy.initialBackoff,
      health: 'healthy',
      lastHeartbeat: Date.now(),
      restartScheduled: null,
    };

    this.processes.set(serverId, state);

    // Store the restart callback for later use
    (state as ProcessState & { onRestart: () => Promise<number> }).onRestart = onRestart;
  }

  /**
   * Unregister a process from health monitoring.
   */
  unregister(serverId: string): void {
    const state = this.processes.get(serverId);
    if (state) {
      if (state.restartScheduled) {
        clearTimeout(state.restartScheduled);
      }
      this.processes.delete(serverId);
      this.logger.info('Unregistered process from health monitoring', { serverId });
    }
  }

  /**
   * Report that a process has crashed or exited unexpectedly.
   */
  async reportCrash(serverId: string, exitCode: number | null): Promise<void> {
    const state = this.processes.get(serverId);
    if (!state) {
      this.logger.warn('Received crash report for unregistered process', { serverId });
      return;
    }

    this.logger.error('Process crashed', {
      serverId,
      pid: state.pid,
      exitCode,
      restartCount: state.restartCount,
    });

    state.health = 'crashed';
    this.emitHealthChange(serverId, 'crashed');

    // Check if we should attempt restart
    if (this.shouldRestart(state)) {
      await this.scheduleRestart(serverId, state);
    } else {
      this.logger.error('Max restarts exceeded, circuit breaker open', {
        serverId,
        restartCount: state.restartCount,
      });
      state.health = 'failed';
      this.emitHealthChange(serverId, 'failed');
    }
  }

  /**
   * Report a successful heartbeat from a process.
   */
  reportHeartbeat(serverId: string): void {
    const state = this.processes.get(serverId);
    if (state) {
      state.lastHeartbeat = Date.now();
      if (state.health === 'unhealthy') {
        state.health = 'healthy';
        this.emitHealthChange(serverId, 'healthy');
      }
    }
  }

  /**
   * Get the health status of a process.
   */
  getHealth(serverId: string): ProcessHealth {
    return this.processes.get(serverId)?.health ?? 'unknown';
  }

  /**
   * Get health statistics for all monitored processes.
   */
  getStats(): Map<string, { health: ProcessHealth; restartCount: number; pid: number }> {
    const stats = new Map<string, { health: ProcessHealth; restartCount: number; pid: number }>();
    for (const [serverId, state] of this.processes) {
      stats.set(serverId, {
        health: state.health,
        restartCount: state.restartCount,
        pid: state.pid,
      });
    }
    return stats;
  }

  /**
   * Set the restart policy for all processes.
   */
  setRestartPolicy(policy: Partial<RestartPolicy>): void {
    this.restartPolicy = { ...this.restartPolicy, ...policy };
    this.logger.info('Updated restart policy', { policy: this.restartPolicy });
  }

  /**
   * Reset the restart counter for a process (e.g., after successful period).
   */
  resetRestartCount(serverId: string): void {
    const state = this.processes.get(serverId);
    if (state) {
      state.restartCount = 0;
      state.restartTimestamps = [];
      state.currentBackoff = this.restartPolicy.initialBackoff;
      this.logger.debug('Reset restart count', { serverId });
    }
  }

  /**
   * Subscribe to health change events.
   */
  onHealthChange(
    callback: (serverId: string, health: ProcessHealth) => void
  ): () => void {
    this.eventEmitter.on('healthChange', callback);
    return () => this.eventEmitter.off('healthChange', callback);
  }

  /**
   * Clean up resources.
   */
  dispose(): void {
    if (this.heartbeatChecker) {
      clearInterval(this.heartbeatChecker);
      this.heartbeatChecker = null;
    }

    for (const state of this.processes.values()) {
      if (state.restartScheduled) {
        clearTimeout(state.restartScheduled);
      }
    }

    this.processes.clear();
    this.eventEmitter.removeAllListeners();
  }

  /**
   * Check if restart should be attempted based on policy.
   */
  private shouldRestart(state: ProcessState): boolean {
    const now = Date.now();
    const windowStart = now - this.restartPolicy.restartWindow;

    // Clean up old timestamps outside the window
    state.restartTimestamps = state.restartTimestamps.filter((ts) => ts > windowStart);

    // Check if we've exceeded max restarts within the window
    return state.restartTimestamps.length < this.restartPolicy.maxRestarts;
  }

  /**
   * Schedule a restart with exponential backoff.
   */
  private async scheduleRestart(serverId: string, state: ProcessState): Promise<void> {
    const backoff = Math.min(state.currentBackoff, this.restartPolicy.maxBackoff);

    this.logger.info('Scheduling process restart', {
      serverId,
      backoff,
      restartCount: state.restartCount + 1,
    });

    state.health = 'restarting';
    this.emitHealthChange(serverId, 'restarting');

    state.restartScheduled = setTimeout(async () => {
      state.restartScheduled = null;

      try {
        const stateWithCallback = state as ProcessState & {
          onRestart?: () => Promise<number>;
        };

        if (stateWithCallback.onRestart) {
          const newPid = await stateWithCallback.onRestart();
          state.pid = newPid;
          state.restartCount++;
          state.restartTimestamps.push(Date.now());
          state.currentBackoff = Math.min(
            state.currentBackoff * this.restartPolicy.backoffMultiplier,
            this.restartPolicy.maxBackoff
          );
          state.health = 'healthy';
          state.lastHeartbeat = Date.now();

          this.logger.info('Process restarted successfully', {
            serverId,
            newPid,
            restartCount: state.restartCount,
          });

          this.emitHealthChange(serverId, 'healthy');
        }
      } catch (error) {
        this.logger.error('Failed to restart process', {
          serverId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        // Report another crash to potentially trigger another restart
        await this.reportCrash(serverId, -1);
      }
    }, backoff);
  }

  /**
   * Start the heartbeat checker interval.
   */
  private startHeartbeatChecker(): void {
    this.heartbeatChecker = setInterval(() => {
      const now = Date.now();
      const threshold = now - this.heartbeatInterval * 2;

      for (const [serverId, state] of this.processes) {
        if (state.health === 'healthy' && state.lastHeartbeat < threshold) {
          this.logger.warn('Process missed heartbeat', {
            serverId,
            lastHeartbeat: new Date(state.lastHeartbeat).toISOString(),
          });
          state.health = 'unhealthy';
          this.emitHealthChange(serverId, 'unhealthy');
        }
      }
    }, this.heartbeatInterval);
  }

  /**
   * Emit a health change event.
   */
  private emitHealthChange(serverId: string, health: ProcessHealth): void {
    this.eventEmitter.emit('healthChange', serverId, health);
  }
}
