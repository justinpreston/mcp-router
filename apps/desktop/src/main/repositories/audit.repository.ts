import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IAuditRepository,
  IDatabase,
  AuditEvent,
  AuditEventType,
  AuditQueryOptions,
  PaginationOptions,
  PaginatedResponse,
} from '@main/core/interfaces';

/**
 * Audit repository for SQLite persistence.
 */
@injectable()
export class AuditRepository implements IAuditRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(event: AuditEvent): Promise<AuditEvent> {
    const stmt = this.database.db.prepare(`
      INSERT INTO audit_events (id, type, client_id, server_id, tool_name, success, duration, metadata, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.type,
      event.clientId ?? null,
      event.serverId ?? null,
      event.toolName ?? null,
      event.success ? 1 : 0,
      event.duration ?? null,
      event.metadata ? JSON.stringify(event.metadata) : null,
      event.timestamp
    );

    return event;
  }

  async findById(id: string): Promise<AuditEvent | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM audit_events WHERE id = ?
    `);

    const row = stmt.get(id) as AuditEventRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToEvent(row);
  }

  async query(options: {
    type?: AuditEventType;
    clientId?: string;
    serverId?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
    offset?: number;
  }): Promise<AuditEvent[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (options.clientId) {
      conditions.push('client_id = ?');
      params.push(options.clientId);
    }

    if (options.serverId) {
      conditions.push('server_id = ?');
      params.push(options.serverId);
    }

    if (options.startTime) {
      conditions.push('timestamp >= ?');
      params.push(options.startTime);
    }

    if (options.endTime) {
      conditions.push('timestamp <= ?');
      params.push(options.endTime);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;

    const stmt = this.database.db.prepare(`
      SELECT * FROM audit_events
      ${whereClause}
      ORDER BY timestamp DESC
      LIMIT ? OFFSET ?
    `);

    params.push(limit, offset);

    const rows = stmt.all(...params) as AuditEventRow[];
    return rows.map(row => this.mapRowToEvent(row));
  }

  /**
   * Cursor-based pagination for efficient large dataset queries.
   * Uses timestamp as the cursor.
   */
  async queryPaginated(
    options: AuditQueryOptions & PaginationOptions
  ): Promise<PaginatedResponse<AuditEvent>> {
    const limit = options.limit ?? 50;
    const orderDir = options.orderDir ?? 'desc';
    const cursor = options.cursor ? parseInt(options.cursor, 10) : undefined;

    const conditions: string[] = [];
    const params: unknown[] = [];

    // Add filter conditions
    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (options.clientId) {
      conditions.push('client_id = ?');
      params.push(options.clientId);
    }

    if (options.serverId) {
      conditions.push('server_id = ?');
      params.push(options.serverId);
    }

    if (options.startTime) {
      conditions.push('timestamp >= ?');
      params.push(options.startTime);
    }

    if (options.endTime) {
      conditions.push('timestamp <= ?');
      params.push(options.endTime);
    }

    // Add cursor condition
    if (cursor) {
      if (orderDir === 'desc') {
        conditions.push('timestamp < ?');
      } else {
        conditions.push('timestamp > ?');
      }
      params.push(cursor);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = this.database.db.prepare(`
      SELECT * FROM audit_events
      ${whereClause}
      ORDER BY timestamp ${orderDir === 'desc' ? 'DESC' : 'ASC'}
      LIMIT ?
    `);

    params.push(limit + 1);

    const rows = stmt.all(...params) as AuditEventRow[];

    // Check if there are more items
    const hasMore = rows.length > limit;
    if (hasMore) {
      rows.pop();
    }

    const items = rows.map(row => this.mapRowToEvent(row));

    // Generate next cursor from last item
    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? lastItem.timestamp.toString()
      : undefined;

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  async count(options?: {
    type?: AuditEventType;
    startTime?: number;
    endTime?: number;
  }): Promise<number> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (options?.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (options?.startTime) {
      conditions.push('timestamp >= ?');
      params.push(options.startTime);
    }

    if (options?.endTime) {
      conditions.push('timestamp <= ?');
      params.push(options.endTime);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const stmt = this.database.db.prepare(`
      SELECT COUNT(*) as count FROM audit_events ${whereClause}
    `);

    const result = stmt.get(...params) as { count: number };
    return result.count;
  }

  async deleteOlderThan(timestamp: number): Promise<number> {
    const stmt = this.database.db.prepare(`
      DELETE FROM audit_events WHERE timestamp < ?
    `);

    const result = stmt.run(timestamp);
    return result.changes;
  }

  /**
   * Map database row to AuditEvent object.
   */
  private mapRowToEvent(row: AuditEventRow): AuditEvent {
    return {
      id: row.id,
      type: row.type as AuditEventType,
      clientId: row.client_id ?? undefined,
      serverId: row.server_id ?? undefined,
      toolName: row.tool_name ?? undefined,
      success: row.success === 1,
      duration: row.duration ?? undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      timestamp: row.timestamp,
    };
  }
}

/**
 * Database row type for audit_events table.
 */
interface AuditEventRow {
  id: string;
  type: string;
  client_id: string | null;
  server_id: string | null;
  tool_name: string | null;
  success: number;
  duration: number | null;
  metadata: string | null;
  timestamp: number;
}
