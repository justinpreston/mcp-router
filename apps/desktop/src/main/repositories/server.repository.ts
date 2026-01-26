import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IServerRepository,
  IDatabase,
  MCPServer,
  ServerStatus,
  ServerTransport,
} from '@main/core/interfaces';

/**
 * Server repository for SQLite persistence.
 */
@injectable()
export class ServerRepository implements IServerRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(server: MCPServer): Promise<MCPServer> {
    const stmt = this.database.db.prepare(`
      INSERT INTO servers (
        id, name, command, args, env, transport, status,
        project_id, tool_permissions, last_error, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      server.id,
      server.name,
      server.command,
      JSON.stringify(server.args),
      server.env ? JSON.stringify(server.env) : null,
      server.transport,
      server.status,
      server.projectId ?? null,
      JSON.stringify(server.toolPermissions),
      server.lastError ?? null,
      server.createdAt,
      server.updatedAt
    );

    return server;
  }

  async findById(id: string): Promise<MCPServer | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM servers WHERE id = ?
    `);

    const row = stmt.get(id) as ServerRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToServer(row);
  }

  async findAll(): Promise<MCPServer[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM servers ORDER BY created_at DESC
    `);

    const rows = stmt.all() as ServerRow[];
    return rows.map(row => this.mapRowToServer(row));
  }

  async findByProjectId(projectId: string): Promise<MCPServer[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM servers WHERE project_id = ? ORDER BY created_at DESC
    `);

    const rows = stmt.all(projectId) as ServerRow[];
    return rows.map(row => this.mapRowToServer(row));
  }

  async update(server: MCPServer): Promise<MCPServer> {
    const stmt = this.database.db.prepare(`
      UPDATE servers SET
        name = ?,
        command = ?,
        args = ?,
        env = ?,
        transport = ?,
        status = ?,
        project_id = ?,
        tool_permissions = ?,
        last_error = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      server.name,
      server.command,
      JSON.stringify(server.args),
      server.env ? JSON.stringify(server.env) : null,
      server.transport,
      server.status,
      server.projectId ?? null,
      JSON.stringify(server.toolPermissions),
      server.lastError ?? null,
      server.updatedAt,
      server.id
    );

    return server;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare(`
      DELETE FROM servers WHERE id = ?
    `);

    stmt.run(id);
  }

  /**
   * Map database row to MCPServer object.
   */
  private mapRowToServer(row: ServerRow): MCPServer {
    return {
      id: row.id,
      name: row.name,
      command: row.command,
      args: JSON.parse(row.args),
      env: row.env ? JSON.parse(row.env) : undefined,
      transport: row.transport as ServerTransport,
      status: row.status as ServerStatus,
      projectId: row.project_id ?? undefined,
      toolPermissions: JSON.parse(row.tool_permissions),
      lastError: row.last_error ?? undefined,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

/**
 * Database row type for servers table.
 */
interface ServerRow {
  id: string;
  name: string;
  command: string;
  args: string;
  env: string | null;
  transport: string;
  status: string;
  project_id: string | null;
  tool_permissions: string;
  last_error: string | null;
  created_at: number;
  updated_at: number;
}
