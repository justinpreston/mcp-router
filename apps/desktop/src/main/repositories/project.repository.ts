/**
 * Project Repository for SQLite persistence.
 *
 * Handles CRUD operations for Project entities.
 */
import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type {
  IProjectRepository,
  IDatabase,
  Project,
  ProjectSettings,
} from '@main/core/interfaces';

/**
 * Raw database row type for projects table.
 */
interface ProjectRow {
  id: string;
  name: string;
  description: string | null;
  slug: string;
  root_path: string | null;
  server_ids: string;
  workspace_ids: string;
  active: number;
  settings: string;
  created_at: number;
  updated_at: number;
}

@injectable()
export class ProjectRepository implements IProjectRepository {
  constructor(@inject(TYPES.Database) private database: IDatabase) {}

  async create(project: Project): Promise<Project> {
    const stmt = this.database.db.prepare(`
      INSERT INTO projects (
        id, name, description, slug, root_path,
        server_ids, workspace_ids, active, settings,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      project.id,
      project.name,
      project.description ?? null,
      project.slug,
      project.rootPath ?? null,
      JSON.stringify(project.serverIds),
      JSON.stringify(project.workspaceIds),
      project.active ? 1 : 0,
      JSON.stringify(project.settings),
      project.createdAt,
      project.updatedAt
    );

    return project;
  }

  async findById(id: string): Promise<Project | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM projects WHERE id = ?
    `);

    const row = stmt.get(id) as ProjectRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToProject(row);
  }

  async findBySlug(slug: string): Promise<Project | null> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM projects WHERE slug = ?
    `);

    const row = stmt.get(slug) as ProjectRow | undefined;

    if (!row) {
      return null;
    }

    return this.mapRowToProject(row);
  }

  async findAll(): Promise<Project[]> {
    const stmt = this.database.db.prepare(`
      SELECT * FROM projects ORDER BY created_at DESC
    `);

    const rows = stmt.all() as ProjectRow[];
    return rows.map((row) => this.mapRowToProject(row));
  }

  async update(project: Project): Promise<Project> {
    const stmt = this.database.db.prepare(`
      UPDATE projects SET
        name = ?,
        description = ?,
        slug = ?,
        root_path = ?,
        server_ids = ?,
        workspace_ids = ?,
        active = ?,
        settings = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(
      project.name,
      project.description ?? null,
      project.slug,
      project.rootPath ?? null,
      JSON.stringify(project.serverIds),
      JSON.stringify(project.workspaceIds),
      project.active ? 1 : 0,
      JSON.stringify(project.settings),
      project.updatedAt,
      project.id
    );

    return project;
  }

  async delete(id: string): Promise<void> {
    const stmt = this.database.db.prepare(`
      DELETE FROM projects WHERE id = ?
    `);

    stmt.run(id);
  }

  /**
   * Map a database row to a Project entity.
   */
  private mapRowToProject(row: ProjectRow): Project {
    return {
      id: row.id,
      name: row.name,
      description: row.description ?? undefined,
      slug: row.slug,
      rootPath: row.root_path ?? undefined,
      serverIds: JSON.parse(row.server_ids) as string[],
      workspaceIds: JSON.parse(row.workspace_ids) as string[],
      active: row.active === 1,
      settings: JSON.parse(row.settings) as ProjectSettings,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
