import { injectable, inject } from 'inversify';
import { nanoid } from 'nanoid';
import { TYPES } from '@main/core/types';
import type {
  IAuditService,
  IAuditRepository,
  ILogger,
  AuditEvent,
  AuditEventType,
} from '@main/core/interfaces';

/**
 * Audit service for logging security and operational events.
 */
@injectable()
export class AuditService implements IAuditService {
  constructor(
    @inject(TYPES.AuditRepository) private auditRepo: IAuditRepository,
    @inject(TYPES.Logger) private logger: ILogger
  ) {}

  /**
   * Log an audit event.
   */
  async log(event: Omit<AuditEvent, 'id' | 'timestamp'>): Promise<void> {
    const auditEvent: AuditEvent = {
      id: `audit_${nanoid()}`,
      timestamp: Date.now(),
      ...event,
    };

    try {
      await this.auditRepo.create(auditEvent);
    } catch (error) {
      // Log to console but don't fail the operation
      this.logger.error('Failed to write audit event', {
        error: error instanceof Error ? error.message : 'Unknown error',
        eventType: event.type,
      });
    }
  }

  /**
   * Query audit events.
   */
  async query(options: {
    type?: AuditEventType;
    clientId?: string;
    serverId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    return this.auditRepo.query(options);
  }

  /**
   * Get audit statistics.
   */
  async getStats(options?: { startTime?: number; endTime?: number }): Promise<{
    totalEvents: number;
    byType: Record<string, number>;
    successRate: number;
    avgDuration: number;
  }> {
    const events = await this.auditRepo.query({
      startTime: options?.startTime,
      endTime: options?.endTime,
      limit: 10000, // Cap for performance
    });

    const byType: Record<string, number> = {};
    let successCount = 0;
    let totalDuration = 0;
    let durationCount = 0;

    for (const event of events) {
      byType[event.type] = (byType[event.type] || 0) + 1;

      if (event.success) {
        successCount++;
      }

      if (event.duration !== undefined) {
        totalDuration += event.duration;
        durationCount++;
      }
    }

    return {
      totalEvents: events.length,
      byType,
      successRate: events.length > 0 ? successCount / events.length : 0,
      avgDuration: durationCount > 0 ? totalDuration / durationCount : 0,
    };
  }
}
