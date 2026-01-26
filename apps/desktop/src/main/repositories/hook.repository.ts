import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IDatabase,
  IHookRepository,
  Hook,
  HookEvent,
} from '@main/core/interfaces';

interface HookRow {
  id: string;
  name: string;
  description: string | null;
  event: HookEvent;
  project_id: string | null;
  server_id: string | null;
  code: string;
  priority: number;
  enabled: number;
  timeout: number;
  can_modify: number;
  created_at: number;
  updated_at: number;
}

@injectable()
export class HookRepository implements IHookRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(hook: Hook): Promise<Hook> {
    const stmt = this.database.db.prepare(`
      INSERT INTO hooks (
        id, name, description, event, project_id, server_id,
        code, priority, enabled, timeout, can_modify,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      hook.id,
      hook.name,
      hook.description || null,
      hook.event,
      hook.projectId || null,
      hook.serverId || null,
      hook.code,
      hook.priority,
      hook.enabled ? 1 : 0,
      hook.timeout,
      hook.canModify ? 1 : 0,
      hook.createdAt,
      hook.updatedAt
    );

    return hook;
  }

  async findById(id: string): Promise<Hook | null> {
    const stmt = this.database.db.prepare('SELECT * FROM hooks WHERE id = ?');
    const row = stmt.get(id) as HookRow | undefined;
    return row ? this.mapRowToHook(row) : null;
  }

  async findAll(): Promise<Hook[]> {
    const stmt = this.database.db.prepare(
      'SELECT * FROM hooks ORDER BY priority ASC, created_at DESC'
    );
    const rows = stmt.all() as HookRow[];
    return rows.map((row) => this.mapRowToHook(row));
  }

  async findByEvent(
    event: HookEvent,
    projectId?: string,
    serverId?: string
  ): Promise<Hook[]> {
    let sql = 'SELECT * FROM hooks WHERE event = ?';
    const params: (string | null)[] = [event];

    if (projectId !== undefined) {
      sql += ' AND (project_id = ? OR project_id IS NULL)';
      params.push(projectId);
    } else {
      sql += ' AND project_id IS NULL';
    }

    if (serverId !== undefined) {
      sql += ' AND (server_id = ? OR server_id IS NULL)';
      params.push(serverId);
    } else {
      sql += ' AND server_id IS NULL';
    }

    sql += ' ORDER BY priority ASC, created_at DESC';

    const stmt = this.database.db.prepare(sql);
    const rows = stmt.all(...params) as HookRow[];
    return rows.map((row) => this.mapRowToHook(row));
  }

  async findEnabled(
    event: HookEvent,
    projectId?: string,
    serverId?: string
  ): Promise<Hook[]> {
    let sql = 'SELECT * FROM hooks WHERE event = ? AND enabled = 1';
    const params: (string | null)[] = [event];

    if (projectId !== undefined) {
      sql += ' AND (project_id = ? OR project_id IS NULL)';
      params.push(projectId);
    } else {
      sql += ' AND project_id IS NULL';
    }

    if (serverId !== undefined) {
      sql += ' AND (server_id = ? OR server_id IS NULL)';
      params.push(serverId);
    } else {
      sql += ' AND server_id IS NULL';
    }

    sql += ' ORDER BY priority ASC, created_at DESC';

    const stmt = this.database.db.prepare(sql);
    const rows = stmt.all(...params) as HookRow[];
    return rows.map((row) => this.mapRowToHook(row));
  }

  async update(hook: Hook): Promise<Hook> {
    const stmt = this.database.db.prepare(`
      UPDATE hooks SET
        name = ?,
        description = ?,
        event = ?,
        project_id = ?,
        server_id = ?,
        code = ?,
        priority = ?,
        enabled = ?,
        timeout = ?,
        can_modify = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      hook.name,
      hook.description || null,
      hook.event,
      hook.projectId || null,
      hook.serverId || null,
      hook.code,
      hook.priority,
      hook.enabled ? 1 : 0,
      hook.timeout,
      hook.canModify ? 1 : 0,
      hook.updatedAt,
      hook.id
    );

    return hook;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare('DELETE FROM hooks WHERE id = ?');
    stmt.run(id);
  }

  private mapRowToHook(row: HookRow): Hook {
    return {
      id: row.id,
      name: row.name,
      description: row.description || undefined,
      event: row.event,
      projectId: row.project_id || undefined,
      serverId: row.server_id || undefined,
      code: row.code,
      priority: row.priority,
      enabled: row.enabled === 1,
      timeout: row.timeout,
      canModify: row.can_modify === 1,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
