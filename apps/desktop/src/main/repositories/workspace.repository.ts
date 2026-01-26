import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { IWorkspaceRepository, IDatabase, Workspace } from '@main/core/interfaces';

/**
 * Workspace repository for SQLite persistence.
 */
@injectable()
export class WorkspaceRepository implements IWorkspaceRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(workspace: Workspace): Promise<Workspace> {
    const stmt = this.database.db.prepare(`
      INSERT INTO workspaces (id, name, path, server_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      workspace.id,
      workspace.name,
      workspace.path,
      JSON.stringify(workspace.serverIds),
      workspace.createdAt,
      workspace.updatedAt
    );

    return workspace;
  }

  async findById(id: string): Promise<Workspace | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM workspaces WHERE id = ?
    `);

    const row = stmt.get(id) as WorkspaceRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToWorkspace(row);
  }

  async findAll(): Promise<Workspace[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM workspaces ORDER BY created_at DESC
    `);

    const rows = stmt.all() as WorkspaceRow[];
    return rows.map(row => this.mapRowToWorkspace(row));
  }

  async update(workspace: Workspace): Promise<Workspace> {
    const stmt = this.database.db.prepare(`
      UPDATE workspaces SET
        name = ?,
        path = ?,
        server_ids = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      workspace.name,
      workspace.path,
      JSON.stringify(workspace.serverIds),
      workspace.updatedAt,
      workspace.id
    );

    return workspace;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare(`
      DELETE FROM workspaces WHERE id = ?
    `);

    stmt.run(id);
  }

  /**
   * Map database row to Workspace object.
   */
  private mapRowToWorkspace(row: WorkspaceRow): Workspace {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      serverIds: JSON.parse(row.server_ids),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Database row type for workspaces table.
 */
interface WorkspaceRow {
  id: string;
  name: string;
  path: string;
  server_ids: string;
  created_at: number;
  updated_at: number;
}
